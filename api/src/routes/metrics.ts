import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { MetricsWindowSchema } from '@job-scheduler/shared';
import { pool } from '../db/pool.js';

// Simple in-process cache to avoid hammering DB on dashboard refresh
const cachedSummaries = new Map<string, { value: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 10_000;

const metricsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /api/v1/metrics/summary
  fastify.get('/summary', { ...auth }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const cached = cachedSummaries.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }

    const [
      { rows: jobsPerMin },
      { rows: successRate },
      { rows: avgExec },
      { rows: queueDepths },
      { rows: activeWorkers },
      { rows: totalToday },
    ] = await Promise.all([
      pool.query<{ count: string }>(`
        SELECT COUNT(*)::int as count FROM job_executions e
        JOIN jobs j ON j.id = e.job_id JOIN queues q ON q.id = j.queue_id
        JOIN projects p ON p.id = q.project_id JOIN memberships m ON m.organization_id = p.organization_id
        WHERE m.user_id = $1 AND e.started_at > NOW() - INTERVAL '1 minute'
      `, [userId]),
      pool.query<{ total: string; completed: string }>(`
        SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'completed')::int as completed
        FROM job_executions e JOIN jobs j ON j.id = e.job_id JOIN queues q ON q.id = j.queue_id
        JOIN projects p ON p.id = q.project_id JOIN memberships m ON m.organization_id = p.organization_id
        WHERE m.user_id = $1 AND e.started_at > NOW() - INTERVAL '1 hour'
      `, [userId]),
      pool.query<{ avg_ms: string }>(`
        SELECT AVG(e.duration_ms)::int as avg_ms FROM job_executions e JOIN jobs j ON j.id = e.job_id
        JOIN queues q ON q.id = j.queue_id JOIN projects p ON p.id = q.project_id
        JOIN memberships m ON m.organization_id = p.organization_id
        WHERE m.user_id = $1 AND e.status = 'completed' AND e.started_at > NOW() - INTERVAL '1 hour'
      `, [userId]),
      pool.query<{ queue_id: string; status: string; count: string }>(`
        SELECT j.queue_id, j.status, COUNT(*)::int as count FROM jobs j JOIN queues q ON q.id = j.queue_id
        JOIN projects p ON p.id = q.project_id JOIN memberships m ON m.organization_id = p.organization_id
        WHERE m.user_id = $1 AND j.status NOT IN ('completed') GROUP BY j.queue_id, j.status
      `, [userId]),
      pool.query<{ count: string }>(`
        SELECT COUNT(DISTINCT w.id)::int as count FROM workers w JOIN jobs j ON j.worker_id = w.id
        JOIN queues q ON q.id = j.queue_id JOIN projects p ON p.id = q.project_id
        JOIN memberships m ON m.organization_id = p.organization_id
        WHERE m.user_id = $1 AND w.status = 'active'
      `, [userId]),
      pool.query<{ count: string }>(`
        SELECT COUNT(*)::int as count FROM jobs j JOIN queues q ON q.id = j.queue_id
        JOIN projects p ON p.id = q.project_id JOIN memberships m ON m.organization_id = p.organization_id
        WHERE m.user_id = $1 AND j.created_at > NOW() - INTERVAL '24 hours'
      `, [userId]),
    ]);

    // Aggregate queue depths
    const depths: Record<string, Record<string, number>> = {};
    for (const row of queueDepths) {
      if (!depths[row.queue_id]) depths[row.queue_id] = {};
      depths[row.queue_id]![row.status] = parseInt(row.count);
    }

    const total = parseInt(successRate[0]?.total ?? '0');
    const completed = parseInt(successRate[0]?.completed ?? '0');

    const summary = {
      jobs_per_minute: parseInt(jobsPerMin[0]?.count ?? '0'),
      success_rate: total > 0 ? Math.round((completed / total) * 1000) / 1000 : 1,
      avg_execution_ms: parseInt(avgExec[0]?.avg_ms ?? '0'),
      queue_depths: depths,
      active_workers: parseInt(activeWorkers[0]?.count ?? '0'),
      total_jobs_today: parseInt(totalToday[0]?.count ?? '0'),
    };

    cachedSummaries.set(userId, { value: summary, expiresAt: Date.now() + CACHE_TTL_MS });
    return summary;
  });

  // GET /api/v1/metrics/throughput?window=1h|6h|24h
  fastify.get('/throughput', { ...auth, schema: { querystring: MetricsWindowSchema } }, async (request) => {
    const { window } = request.query;

    const intervalMap = { '1h': '1 hour', '6h': '6 hours', '24h': '24 hours' } as const;
    const bucketMap = { '1h': '5 minutes', '6h': '30 minutes', '24h': '2 hours' } as const;

    const interval = intervalMap[window];
    const bucket = bucketMap[window];

    const userId = (request.user as { sub: string }).sub;
    const { rows } = await pool.query<{
      timestamp: string;
      total: string;
      completed: string;
      failed: string;
    }>(`
      SELECT
        DATE_TRUNC('${bucket.replace(' ', '_')}', started_at) as timestamp,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
        COUNT(*) FILTER (WHERE status = 'failed')::int as failed
      FROM job_executions e JOIN jobs j ON j.id = e.job_id JOIN queues q ON q.id = j.queue_id
      JOIN projects p ON p.id = q.project_id JOIN memberships m ON m.organization_id = p.organization_id
      WHERE m.user_id = $1 AND e.started_at > NOW() - INTERVAL '${interval}'
      GROUP BY 1
      ORDER BY 1
    `, [userId]);

    return {
      window,
      data: rows.map((r) => ({
        timestamp: r.timestamp,
        total: parseInt(r.total),
        completed: parseInt(r.completed),
        failed: parseInt(r.failed),
      })),
    };
  });
};

export default metricsRoutes;

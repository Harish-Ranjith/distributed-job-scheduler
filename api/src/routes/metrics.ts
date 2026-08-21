import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { MetricsWindowSchema } from '@job-scheduler/shared';
import { pool } from '../db/pool.js';

// Simple in-process cache to avoid hammering DB on dashboard refresh
let cachedSummary: unknown = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 10_000;

const metricsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /api/v1/metrics/summary
  fastify.get('/summary', { ...auth }, async () => {
    if (cachedSummary && Date.now() < cacheExpiry) {
      return cachedSummary;
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
        SELECT COUNT(*)::int as count FROM job_executions
        WHERE started_at > NOW() - INTERVAL '1 minute'
      `),
      pool.query<{ total: string; completed: string }>(`
        SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'completed')::int as completed
        FROM job_executions
        WHERE started_at > NOW() - INTERVAL '1 hour'
      `),
      pool.query<{ avg_ms: string }>(`
        SELECT AVG(duration_ms)::int as avg_ms FROM job_executions
        WHERE status = 'completed' AND started_at > NOW() - INTERVAL '1 hour'
      `),
      pool.query<{ queue_id: string; status: string; count: string }>(`
        SELECT queue_id, status, COUNT(*)::int as count FROM jobs
        WHERE status NOT IN ('completed') GROUP BY queue_id, status
      `),
      pool.query<{ count: string }>(`
        SELECT COUNT(*)::int as count FROM workers WHERE status = 'active'
      `),
      pool.query<{ count: string }>(`
        SELECT COUNT(*)::int as count FROM jobs WHERE created_at > NOW() - INTERVAL '24 hours'
      `),
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

    cachedSummary = summary;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return summary;
  });

  // GET /api/v1/metrics/throughput?window=1h|6h|24h
  fastify.get('/throughput', { ...auth, schema: { querystring: MetricsWindowSchema } }, async (request) => {
    const { window } = request.query;

    const intervalMap = { '1h': '1 hour', '6h': '6 hours', '24h': '24 hours' } as const;
    const bucketMap = { '1h': '5 minutes', '6h': '30 minutes', '24h': '2 hours' } as const;

    const interval = intervalMap[window];
    const bucket = bucketMap[window];

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
      FROM job_executions
      WHERE started_at > NOW() - INTERVAL '${interval}'
      GROUP BY 1
      ORDER BY 1
    `);

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

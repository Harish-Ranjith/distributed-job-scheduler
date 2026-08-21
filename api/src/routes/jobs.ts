import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateImmediateJobSchema,
  CreateDelayedJobSchema,
  CreateScheduledJobSchema,
  CreateCronJobSchema,
  CreateBatchJobSchema,
  JobFiltersSchema,
} from '@job-scheduler/shared';
import { pool } from '../db/pool.js';
import { computeNextRunAt } from '../services/scheduler.js';

const jobsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const auth = { onRequest: [fastify.authenticate] };
  const idParam = z.object({ id: z.string().uuid() });
  const userId = (request: { user: unknown }) => (request.user as { sub: string }).sub;

  async function canAccessQueue(request: { user: unknown }, queueId: string): Promise<boolean> {
    const { rows } = await pool.query(
      `SELECT 1 FROM memberships m
       JOIN projects p ON p.organization_id = m.organization_id
       JOIN queues q ON q.project_id = p.id
       WHERE m.user_id = $1 AND q.id = $2`,
      [userId(request), queueId]
    );
    return Boolean(rows[0]);
  }

  // ── Create: Immediate ─────────────────────────────────────────────────────
  fastify.post('/', { ...auth, schema: { body: CreateImmediateJobSchema } }, async (request, reply) => {
    const { queue_id, job_type, payload, priority, max_attempts, idempotency_key } = request.body;
    if (!await canAccessQueue(request, queue_id)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
    const { rows } = await pool.query(
      `INSERT INTO jobs (queue_id, job_type, payload, priority, max_attempts, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING *`,
      [queue_id, job_type, JSON.stringify(payload), priority, max_attempts, idempotency_key ?? null]
    );
    if (!rows[0]) {
      // Idempotency key already used — return the existing job
      const { rows: existing } = await pool.query(
        'SELECT * FROM jobs WHERE idempotency_key = $1',
        [idempotency_key]
      );
      return reply.code(200).send(existing[0]);
    }
    return reply.code(201).send(rows[0]);
  });

  // ── Create: Delayed ───────────────────────────────────────────────────────
  fastify.post('/delayed', { ...auth, schema: { body: CreateDelayedJobSchema } }, async (request, reply) => {
    const { queue_id, job_type, payload, priority, max_attempts, idempotency_key, delay_seconds } = request.body;
    if (!await canAccessQueue(request, queue_id)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
    const { rows } = await pool.query(
      `INSERT INTO jobs (queue_id, job_type, payload, priority, max_attempts, idempotency_key, status, run_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', NOW() + ($7 || ' seconds')::interval)
       RETURNING *`,
      [queue_id, job_type, JSON.stringify(payload), priority, max_attempts, idempotency_key ?? null, delay_seconds]
    );
    return reply.code(201).send(rows[0]);
  });

  // ── Create: Scheduled (explicit run_at) ───────────────────────────────────
  fastify.post('/scheduled', { ...auth, schema: { body: CreateScheduledJobSchema } }, async (request, reply) => {
    const { queue_id, job_type, payload, priority, max_attempts, idempotency_key, run_at } = request.body;
    if (!await canAccessQueue(request, queue_id)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
    const { rows } = await pool.query(
      `INSERT INTO jobs (queue_id, job_type, payload, priority, max_attempts, idempotency_key, status, run_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7)
       RETURNING *`,
      [queue_id, job_type, JSON.stringify(payload), priority, max_attempts, idempotency_key ?? null, run_at]
    );
    return reply.code(201).send(rows[0]);
  });

  // ── Create: Cron ──────────────────────────────────────────────────────────
  fastify.post('/cron', { ...auth, schema: { body: CreateCronJobSchema } }, async (request, reply) => {
    const { queue_id, name, cron_expression, job_type, payload, priority, max_attempts } = request.body;
    if (!await canAccessQueue(request, queue_id)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });

    const next_run_at = computeNextRunAt(cron_expression);
    if (!next_run_at) {
      return reply.code(400).send({ error: { code: 'INVALID_CRON', message: 'Invalid cron expression' } });
    }

    const { rows } = await pool.query(
      `INSERT INTO scheduled_jobs (queue_id, name, cron_expression, job_template, next_run_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        queue_id,
        name,
        cron_expression,
        JSON.stringify({ job_type, payload, priority, max_attempts }),
        next_run_at,
      ]
    );
    return reply.code(201).send(rows[0]);
  });

  // ── Create: Batch ─────────────────────────────────────────────────────────
  fastify.post('/batch', { ...auth, schema: { body: CreateBatchJobSchema } }, async (request, reply) => {
    const { jobs } = request.body;
    for (const job of jobs) {
      if (!await canAccessQueue(request, job.queue_id)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = [];
      for (const job of jobs) {
        const { rows } = await client.query(
          `INSERT INTO jobs (queue_id, job_type, payload, priority, max_attempts, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, job_type, status`,
          [job.queue_id, job.job_type, JSON.stringify(job.payload), job.priority, job.max_attempts, job.idempotency_key ?? null]
        );
        if (rows[0]) inserted.push(rows[0]);
      }
      await client.query('COMMIT');
      return reply.code(201).send({ inserted: inserted.length, jobs: inserted });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // ── List: with pagination + filters ──────────────────────────────────────
  fastify.get('/', { ...auth, schema: { querystring: JobFiltersSchema } }, async (request) => {
    const { status, queue_id, job_type, page, limit } = request.query;
    const offset = (page - 1) * limit;
    const conditions: string[] = ['EXISTS (SELECT 1 FROM memberships m JOIN projects p ON p.organization_id = m.organization_id WHERE m.user_id = $1 AND p.id = q.project_id)'];
    const params: unknown[] = [userId(request)];

    if (status) { params.push(status); conditions.push(`j.status = $${params.length}`); }
    if (queue_id) { params.push(queue_id); conditions.push(`j.queue_id = $${params.length}`); }
    if (job_type) { params.push(`%${job_type}%`); conditions.push(`j.job_type ILIKE $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT j.* FROM jobs j JOIN queues q ON q.id = j.queue_id ${where} ORDER BY j.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int as total FROM jobs j JOIN queues q ON q.id = j.queue_id ${where}`, params),
    ]);

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total: countRows[0]?.total ?? 0,
        total_pages: Math.ceil((countRows[0]?.total ?? 0) / limit),
      },
    };
  });

  // ── Get single job with executions + logs ─────────────────────────────────
  fastify.get('/:id', { ...auth, onRequest: [fastify.authenticate, fastify.requireResourceAccess('job')], schema: { params: idParam } }, async (request, reply) => {
    const { id } = request.params;

    const [{ rows: jobRows }, { rows: execRows }, { rows: logRows }] = await Promise.all([
      pool.query('SELECT * FROM jobs WHERE id = $1', [id]),
      pool.query('SELECT * FROM job_executions WHERE job_id = $1 ORDER BY attempt_number', [id]),
      pool.query('SELECT * FROM job_logs WHERE job_id = $1 ORDER BY logged_at', [id]),
    ]);

    if (!jobRows[0]) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
    return { ...jobRows[0], executions: execRows, logs: logRows };
  });

  // ── Retry a failed job ────────────────────────────────────────────────────
  fastify.post('/:id/retry', { ...auth, onRequest: [fastify.authenticate, fastify.requireResourceAccess('job')], schema: { params: idParam } }, async (request, reply) => {
    const { id } = request.params;
    const { rows } = await pool.query(
      `UPDATE jobs SET status = 'queued', attempt_count = 0, run_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status IN ('failed', 'dead_letter')
       RETURNING *`,
      [id]
    );
    if (!rows[0]) {
      return reply.code(400).send({
        error: { code: 'INVALID_STATE', message: 'Job is not in a failed or dead_letter state' },
      });
    }
    return rows[0];
  });

  // ── Cancel / delete a queued job ──────────────────────────────────────────
  fastify.delete('/:id', { ...auth, onRequest: [fastify.authenticate, fastify.requireResourceAccess('job')], schema: { params: idParam } }, async (request, reply) => {
    await pool.query(
      `UPDATE jobs SET status = 'failed', updated_at = NOW() WHERE id = $1 AND status IN ('queued', 'scheduled')`,
      [request.params.id]
    );
    return reply.code(204).send();
  });

  // ── Dead Letter Queue ─────────────────────────────────────────────────────
  fastify.get(
    '/dead-letter',
    { ...auth, schema: { querystring: z.object({ queue_id: z.string().uuid().optional(), page: z.coerce.number().default(1), limit: z.coerce.number().default(20) }) } },
    async (request) => {
      const { queue_id, page, limit } = request.query;
      const offset = (page - 1) * limit;
      const { rows } = await pool.query(
        queue_id
          ? `SELECT d.* FROM dead_letter_jobs d JOIN queues q ON q.id = d.queue_id JOIN projects p ON p.id = q.project_id JOIN memberships m ON m.organization_id = p.organization_id WHERE m.user_id = $1 AND d.queue_id = $2 ORDER BY d.failed_at DESC LIMIT $3 OFFSET $4`
          : `SELECT d.* FROM dead_letter_jobs d JOIN queues q ON q.id = d.queue_id JOIN projects p ON p.id = q.project_id JOIN memberships m ON m.organization_id = p.organization_id WHERE m.user_id = $1 ORDER BY d.failed_at DESC LIMIT $2 OFFSET $3`,
        queue_id ? [userId(request), queue_id, limit, offset] : [userId(request), limit, offset]
      );
      return { data: rows };
    }
  );

  // ── Retry from Dead Letter Queue ─────────────────────────────────────────
  fastify.post(
    '/dead-letter/:id/retry',
    { ...auth, onRequest: [fastify.authenticate, fastify.requireResourceAccess('dead_letter')], schema: { params: idParam } },
    async (request, reply) => {
      const { id } = request.params;

      const { rows: dlqRows } = await pool.query(
        'SELECT * FROM dead_letter_jobs WHERE id = $1',
        [id]
      );
      const dlqJob = dlqRows[0];
      if (!dlqJob) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Dead letter job not found' } });
      }

      // If original job still exists, reset it; otherwise create a fresh one
      if (dlqJob.original_job_id) {
        await pool.query(
          `UPDATE jobs SET status = 'queued', attempt_count = 0, run_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [dlqJob.original_job_id]
        );
      } else {
        await pool.query(
          `INSERT INTO jobs (queue_id, job_type, payload, max_attempts) VALUES ($1, $2, $3, $4)`,
          [dlqJob.queue_id, dlqJob.job_type, JSON.stringify(dlqJob.payload), dlqJob.max_attempts]
        );
      }

      await pool.query('DELETE FROM dead_letter_jobs WHERE id = $1', [id]);
      return reply.code(200).send({ message: 'Job requeued from dead letter queue' });
    }
  );
};

export default jobsRoutes;

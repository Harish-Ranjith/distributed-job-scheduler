import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CreateQueueSchema, UpdateQueueSchema, RetryPolicySchema } from '@job-scheduler/shared';
import { pool } from '../db/pool.js';

const queuesRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const auth = { onRequest: [fastify.authenticate] };
  const idParam = z.object({ id: z.string().uuid() });

  // ── Retry Policies ────────────────────────────────────────────────────────
  fastify.post('/retry-policies', { ...auth, schema: { body: RetryPolicySchema } }, async (request, reply) => {
    const { name, strategy, base_delay_ms, max_delay_ms, jitter } = request.body;
    const { rows } = await pool.query(
      `INSERT INTO retry_policies (name, strategy, base_delay_ms, max_delay_ms, jitter) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, strategy, base_delay_ms, max_delay_ms, jitter]
    );
    return reply.code(201).send(rows[0]);
  });

  fastify.get('/retry-policies', { ...auth }, async () => {
    const { rows } = await pool.query('SELECT * FROM retry_policies ORDER BY created_at DESC');
    return { data: rows };
  });

  // ── Queues ────────────────────────────────────────────────────────────────

  // POST /api/v1/queues
  fastify.post(
    '/',
    { ...auth, schema: { body: CreateQueueSchema.extend({ project_id: z.string().uuid() }) } },
    async (request, reply) => {
      const { project_id, name, description, priority, concurrency_limit, retry_policy_id } = request.body;
      const { rows } = await pool.query(
        `INSERT INTO queues (project_id, name, description, priority, concurrency_limit, retry_policy_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [project_id, name, description ?? null, priority, concurrency_limit, retry_policy_id ?? null]
      );
      return reply.code(201).send(rows[0]);
    }
  );

  // GET /api/v1/queues?project_id=
  fastify.get(
    '/',
    { ...auth, schema: { querystring: z.object({ project_id: z.string().uuid().optional() }) } },
    async (request) => {
      const { project_id } = request.query;
      const { rows } = await pool.query(
        project_id
          ? `SELECT q.*, rp.strategy as retry_strategy FROM queues q LEFT JOIN retry_policies rp ON rp.id = q.retry_policy_id WHERE q.project_id = $1 ORDER BY q.priority DESC, q.created_at DESC`
          : `SELECT q.*, rp.strategy as retry_strategy FROM queues q LEFT JOIN retry_policies rp ON rp.id = q.retry_policy_id ORDER BY q.priority DESC, q.created_at DESC`,
        project_id ? [project_id] : []
      );
      return { data: rows };
    }
  );

  // GET /api/v1/queues/:id
  fastify.get('/:id', { ...auth, schema: { params: idParam } }, async (request, reply) => {
    const { rows } = await pool.query(
      `SELECT q.*, rp.strategy as retry_strategy, rp.base_delay_ms, rp.max_delay_ms, rp.jitter
       FROM queues q LEFT JOIN retry_policies rp ON rp.id = q.retry_policy_id
       WHERE q.id = $1`,
      [request.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
    return rows[0];
  });

  // PUT /api/v1/queues/:id
  fastify.put('/:id', { ...auth, schema: { params: idParam, body: UpdateQueueSchema } }, async (request, reply) => {
    const { name, description, priority, concurrency_limit, retry_policy_id } = request.body;
    const { rows } = await pool.query(
      `UPDATE queues SET
         name              = COALESCE($1, name),
         description       = COALESCE($2, description),
         priority          = COALESCE($3, priority),
         concurrency_limit = COALESCE($4, concurrency_limit),
         retry_policy_id   = COALESCE($5, retry_policy_id),
         updated_at        = NOW()
       WHERE id = $6 RETURNING *`,
      [name ?? null, description ?? null, priority ?? null, concurrency_limit ?? null, retry_policy_id ?? null, request.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
    return rows[0];
  });

  // DELETE /api/v1/queues/:id
  fastify.delete('/:id', { ...auth, schema: { params: idParam } }, async (request, reply) => {
    await pool.query('DELETE FROM queues WHERE id = $1', [request.params.id]);
    return reply.code(204).send();
  });

  // POST /api/v1/queues/:id/pause
  fastify.post('/:id/pause', { ...auth, schema: { params: idParam } }, async (request, reply) => {
    const { rows } = await pool.query(
      `UPDATE queues SET status = 'paused', updated_at = NOW() WHERE id = $1 RETURNING id, status`,
      [request.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
    return rows[0];
  });

  // POST /api/v1/queues/:id/resume
  fastify.post('/:id/resume', { ...auth, schema: { params: idParam } }, async (request, reply) => {
    const { rows } = await pool.query(
      `UPDATE queues SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING id, status`,
      [request.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
    return rows[0];
  });

  // GET /api/v1/queues/:id/stats
  fastify.get('/:id/stats', { ...auth, schema: { params: idParam } }, async (request) => {
    const { rows } = await pool.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::int as count FROM jobs WHERE queue_id = $1 GROUP BY status`,
      [request.params.id]
    );

    const stats = Object.fromEntries(rows.map((r) => [r.status, r.count]));
    const total = rows.reduce((sum, r) => sum + parseInt(r.count), 0);

    return {
      queue_id: request.params.id,
      queued: parseInt(stats['queued'] ?? '0'),
      scheduled: parseInt(stats['scheduled'] ?? '0'),
      claimed: parseInt(stats['claimed'] ?? '0'),
      running: parseInt(stats['running'] ?? '0'),
      completed: parseInt(stats['completed'] ?? '0'),
      failed: parseInt(stats['failed'] ?? '0'),
      dead_letter: parseInt(stats['dead_letter'] ?? '0'),
      total,
    };
  });
};

export default queuesRoutes;

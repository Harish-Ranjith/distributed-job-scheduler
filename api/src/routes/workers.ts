import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { pool } from '../db/pool.js';

const workersRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /api/v1/workers — list all workers with heartbeat freshness
  fastify.get('/', { ...auth }, async () => {
    const { rows } = await pool.query(`
      SELECT
        w.*,
        MAX(wh.received_at) AS latest_heartbeat,
        EXTRACT(EPOCH FROM (NOW() - MAX(wh.received_at)))::int AS seconds_since_heartbeat,
        COUNT(j.id) FILTER (WHERE j.status IN ('claimed','running')) AS active_jobs
      FROM workers w
      LEFT JOIN worker_heartbeats wh ON wh.worker_id = w.id
      LEFT JOIN jobs j ON j.worker_id = w.id
      GROUP BY w.id
      ORDER BY w.registered_at DESC
    `);
    return { data: rows };
  });

  // GET /api/v1/workers/:id — single worker details + heartbeat history
  fastify.get('/:id', { ...auth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [{ rows: wRows }, { rows: hbRows }] = await Promise.all([
      pool.query('SELECT * FROM workers WHERE id = $1', [id]),
      pool.query(
        'SELECT * FROM worker_heartbeats WHERE worker_id = $1 ORDER BY received_at DESC LIMIT 50',
        [id]
      ),
    ]);
    if (!wRows[0]) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Worker not found' } });
    return { ...wRows[0], heartbeats: hbRows };
  });
};

export default workersRoutes;

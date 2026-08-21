import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { pool } from '../db/pool.js';

const workersRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /api/v1/workers — list all workers with heartbeat freshness
  fastify.get('/', { ...auth }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const { rows } = await pool.query(`
      SELECT
        w.*,
        MAX(wh.received_at) AS latest_heartbeat,
        EXTRACT(EPOCH FROM (NOW() - MAX(wh.received_at)))::int AS seconds_since_heartbeat,
        COUNT(j.id) FILTER (WHERE j.status IN ('claimed','running')) AS active_jobs
      FROM workers w
      LEFT JOIN worker_heartbeats wh ON wh.worker_id = w.id
      LEFT JOIN jobs j ON j.worker_id = w.id
      JOIN queues q ON q.id = j.queue_id
      JOIN projects p ON p.id = q.project_id
      JOIN memberships m ON m.organization_id = p.organization_id AND m.user_id = $1
      GROUP BY w.id
      ORDER BY w.registered_at DESC
    `, [userId]);
    return { data: rows };
  });

  // GET /api/v1/workers/:id — single worker details + heartbeat history
  fastify.get('/:id', { ...auth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request.user as { sub: string }).sub;
    const [{ rows: wRows }, { rows: hbRows }] = await Promise.all([
      pool.query(`SELECT DISTINCT w.* FROM workers w JOIN jobs j ON j.worker_id = w.id JOIN queues q ON q.id = j.queue_id
        JOIN projects p ON p.id = q.project_id JOIN memberships m ON m.organization_id = p.organization_id
        WHERE w.id = $1 AND m.user_id = $2`, [id, userId]),
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

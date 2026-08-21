import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CreateOrganizationSchema, AddMemberSchema } from '@job-scheduler/shared';
import { pool } from '../db/pool.js';

const organizationsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const auth = { onRequest: [fastify.authenticate] };

  // POST /api/v1/organizations
  fastify.post('/', { ...auth, schema: { body: CreateOrganizationSchema } }, async (request, reply) => {
    const { name, slug } = request.body;
    const userId = (request.user as { sub: string }).sub;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
        [name, slug]
      );
      const org = rows[0]!;

      await client.query(
        `INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'owner')`,
        [userId, org.id]
      );

      await client.query('COMMIT');
      return reply.code(201).send({ id: org.id, name, slug });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // GET /api/v1/organizations — list orgs for current user
  fastify.get('/', { ...auth }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const { rows } = await pool.query(
      `SELECT o.*, m.role FROM organizations o
       JOIN memberships m ON m.organization_id = o.id
       WHERE m.user_id = $1
       ORDER BY o.created_at DESC`,
      [userId]
    );
    return { data: rows };
  });

  // GET /api/v1/organizations/:id
  fastify.get('/:id', { ...auth, schema: { params: z.object({ id: z.string().uuid() }) } }, async (request, reply) => {
    const { id } = request.params;
    const { rows } = await pool.query('SELECT * FROM organizations WHERE id = $1', [id]);
    if (!rows[0]) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
    return rows[0];
  });

  // PUT /api/v1/organizations/:id
  fastify.put(
    '/:id',
    { ...auth, schema: { params: z.object({ id: z.string().uuid() }), body: z.object({ name: z.string().optional(), slug: z.string().optional() }) } },
    async (request, reply) => {
      const { id } = request.params;
      const { name, slug } = request.body;
      const { rows } = await pool.query(
        `UPDATE organizations SET name = COALESCE($1, name), slug = COALESCE($2, slug), updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [name ?? null, slug ?? null, id]
      );
      if (!rows[0]) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
      return rows[0];
    }
  );

  // POST /api/v1/organizations/:id/members
  fastify.post(
    '/:id/members',
    { ...auth, schema: { params: z.object({ id: z.string().uuid() }), body: AddMemberSchema } },
    async (request, reply) => {
      const { id } = request.params;
      const { email, role } = request.body;

      const { rows: userRows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (!userRows[0]) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });

      await pool.query(
        `INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, organization_id) DO UPDATE SET role = $3`,
        [userRows[0].id, id, role]
      );

      return reply.code(201).send({ message: 'Member added' });
    }
  );

  // GET /api/v1/organizations/:id/members
  fastify.get(
    '/:id/members',
    { ...auth, schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request) => {
      const { id } = request.params;
      const { rows } = await pool.query(
        `SELECT u.id, u.email, u.display_name, m.role, m.created_at
         FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.organization_id = $1`,
        [id]
      );
      return { data: rows };
    }
  );
};

export default organizationsRoutes;

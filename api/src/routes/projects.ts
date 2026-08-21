import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CreateProjectSchema } from '@job-scheduler/shared';
import { pool } from '../db/pool.js';

const projectsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const auth = { onRequest: [fastify.authenticate] };
  const idParam = z.object({ id: z.string().uuid() });

  // POST /api/v1/projects
  fastify.post(
    '/',
    { ...auth, schema: { body: CreateProjectSchema.extend({ organization_id: z.string().uuid() }) } },
    async (request, reply) => {
      const { name, description, organization_id } = request.body;
      const { rows: memberships } = await pool.query(
        `SELECT 1 FROM memberships WHERE user_id = $1 AND organization_id = $2 AND role IN ('owner', 'admin')`,
        [(request.user as { sub: string }).sub, organization_id]
      );
      if (!memberships[0]) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
      const { rows } = await pool.query(
        `INSERT INTO projects (organization_id, name, description) VALUES ($1, $2, $3) RETURNING *`,
        [organization_id, name, description ?? null]
      );
      return reply.code(201).send(rows[0]);
    }
  );

  // GET /api/v1/projects?organization_id=
  fastify.get(
    '/',
    { ...auth, schema: { querystring: z.object({ organization_id: z.string().uuid().optional() }) } },
    async (request) => {
      const { organization_id } = request.query;
      const { rows } = await pool.query(
        organization_id
          ? `SELECT p.* FROM projects p JOIN memberships m ON m.organization_id = p.organization_id WHERE p.organization_id = $1 AND m.user_id = $2 ORDER BY p.created_at DESC`
          : `SELECT p.* FROM projects p
             JOIN memberships m ON m.organization_id = p.organization_id
             WHERE m.user_id = $1 ORDER BY p.created_at DESC`,
        organization_id ? [organization_id, (request.user as { sub: string }).sub] : [(request.user as { sub: string }).sub]
      );
      return { data: rows };
    }
  );

  // GET /api/v1/projects/:id
  fastify.get('/:id', { ...auth, onRequest: [fastify.authenticate, fastify.requireResourceAccess('project')], schema: { params: idParam } }, async (request, reply) => {
    const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1', [request.params.id]);
    if (!rows[0]) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    return rows[0];
  });

  // PUT /api/v1/projects/:id
  fastify.put(
    '/:id',
    { ...auth, onRequest: [fastify.authenticate, fastify.requireResourceAccess('project', 'admin')], schema: { params: idParam, body: CreateProjectSchema.partial() } },
    async (request, reply) => {
      const { name, description } = request.body;
      const { rows } = await pool.query(
        `UPDATE projects SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [name ?? null, description ?? null, request.params.id]
      );
      if (!rows[0]) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
      return rows[0];
    }
  );

  // DELETE /api/v1/projects/:id
  fastify.delete('/:id', { ...auth, onRequest: [fastify.authenticate, fastify.requireResourceAccess('project', 'admin')], schema: { params: idParam } }, async (request, reply) => {
    await pool.query('DELETE FROM projects WHERE id = $1', [request.params.id]);
    return reply.code(204).send();
  });
};

export default projectsRoutes;

import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db/pool.js';

export type OrganizationRole = 'member' | 'admin' | 'owner';
type ResourceType = 'organization' | 'project' | 'queue' | 'job' | 'dead_letter';

const ROLE_RANK: Record<OrganizationRole, number> = { member: 1, admin: 2, owner: 3 };

declare module 'fastify' {
  interface FastifyInstance {
    requireResourceAccess: (resource: ResourceType, minimumRole?: OrganizationRole) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const authorizePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('requireResourceAccess', (resource: ResourceType, minimumRole: OrganizationRole = 'member') => {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const userId = (request.user as { sub: string }).sub;
      const resourceId = (request.params as { id?: string }).id;
      if (!resourceId) {
        await reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
        return;
      }

      const resourceQueries: Record<ResourceType, string> = {
        organization: 'SELECT id AS organization_id FROM organizations WHERE id = $1',
        project: 'SELECT organization_id FROM projects WHERE id = $1',
        queue: `SELECT p.organization_id FROM queues q JOIN projects p ON p.id = q.project_id WHERE q.id = $1`,
        job: `SELECT p.organization_id FROM jobs j JOIN queues q ON q.id = j.queue_id JOIN projects p ON p.id = q.project_id WHERE j.id = $1`,
        dead_letter: `SELECT p.organization_id FROM dead_letter_jobs d JOIN queues q ON q.id = d.queue_id JOIN projects p ON p.id = q.project_id WHERE d.id = $1`,
      };
      const { rows: resourceRows } = await pool.query<{ organization_id: string }>(resourceQueries[resource], [resourceId]);
      if (!resourceRows[0]) {
        await reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
        return;
      }

      const { rows: membershipRows } = await pool.query<{ role: OrganizationRole }>(
        'SELECT role FROM memberships WHERE user_id = $1 AND organization_id = $2',
        [userId, resourceRows[0].organization_id]
      );
      const role = membershipRows[0]?.role;
      if (!role) {
        await reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
        return;
      }
      if (ROLE_RANK[role] < ROLE_RANK[minimumRole]) {
        await reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient organization role' } });
      }
    };
  });
};

export default fp(authorizePlugin, { name: 'authorize' });
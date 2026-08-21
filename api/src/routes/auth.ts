import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import bcrypt from 'bcrypt';
import { RegisterSchema, LoginSchema } from '@job-scheduler/shared';
import type { MembershipRole } from '@job-scheduler/shared';
import { pool } from '../db/pool.js';
import { z } from 'zod';

const SALT_ROUNDS = 12;

const authRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // POST /api/v1/auth/register
  fastify.post(
    '/register',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: RegisterSchema,
      },
    },
    async (request, reply) => {
      const { email, password, display_name } = request.body;

      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rowCount && existing.rowCount > 0) {
        return reply.code(409).send({
          error: { code: 'EMAIL_TAKEN', message: 'This email is already registered' },
        });
      }

      const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
      const { rows } = await pool.query<{ id: string; email: string; display_name: string | null }>(
        `INSERT INTO users (email, password_hash, display_name)
         VALUES ($1, $2, $3)
         RETURNING id, email, display_name`,
        [email, password_hash, display_name ?? null]
      );

      const user = rows[0]!;
      const token = fastify.jwt.sign({
        sub: user.id,
        email: user.email,
        org_id: null,
        role: null,
      });

      return reply.code(201).send({ token, user });
    }
  );

  // POST /api/v1/auth/login
  fastify.post(
    '/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: LoginSchema,
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const { rows } = await pool.query<{
        id: string;
        email: string;
        password_hash: string;
        display_name: string | null;
      }>(
        'SELECT id, email, password_hash, display_name FROM users WHERE email = $1',
        [email]
      );

      const user = rows[0];
      if (!user) {
        return reply.code(401).send({
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return reply.code(401).send({
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        });
      }

      // Get primary org membership for JWT payload
      const { rows: memberships } = await pool.query<{ organization_id: string; role: string }>(
        `SELECT organization_id, role FROM memberships WHERE user_id = $1 LIMIT 1`,
        [user.id]
      );
      const membership = memberships[0];

      const token = fastify.jwt.sign({
        sub: user.id,
        email: user.email,
        org_id: membership?.organization_id ?? null,
        role: (membership?.role as MembershipRole | undefined) ?? null,
      });

      return reply.code(200).send({
        token,
        user: { id: user.id, email: user.email, display_name: user.display_name },
      });
    }
  );

  // GET /api/v1/auth/me
  fastify.get(
    '/me',
    {
      onRequest: [fastify.authenticate],
      schema: {
      },
    },
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub;
      const { rows } = await pool.query<{
        id: string;
        email: string;
        display_name: string | null;
        created_at: string;
      }>(
        'SELECT id, email, display_name, created_at FROM users WHERE id = $1',
        [userId]
      );

      if (!rows[0]) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      return reply.send(rows[0]);
    }
  );
};

export default authRoutes;

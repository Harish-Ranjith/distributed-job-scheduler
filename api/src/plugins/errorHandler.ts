import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyError } from 'fastify';
import { ZodError } from 'zod';

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error: FastifyError | Error, _request, reply) => {
    fastify.log.error({ err: error }, 'Request error');

    // Zod validation errors (from fastify-type-provider-zod)
    if ((error as FastifyError & { validation?: unknown }).validation) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: (error as FastifyError & { validation?: unknown }).validation,
        },
      });
    }

    // Raw Zod error (manual schema.parse calls)
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        },
      });
    }

    // JWT errors
    if (error.message?.includes('jwt') || error.message?.includes('token')) {
      return reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      });
    }

    // Postgres unique violation (23505)
    if ((error as NodeJS.ErrnoException).code === '23505') {
      return reply.code(409).send({
        error: { code: 'CONFLICT', message: 'Resource already exists' },
      });
    }

    // Postgres FK violation (23503)
    if ((error as NodeJS.ErrnoException).code === '23503') {
      return reply.code(409).send({
        error: { code: 'FK_VIOLATION', message: 'Referenced resource does not exist' },
      });
    }

    // Fastify 404
    if ((error as FastifyError).statusCode === 404) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Resource not found' },
      });
    }

    // Default 500
    const statusCode = (error as FastifyError).statusCode ?? 500;
    return reply.code(statusCode).send({
      error: {
        code: 'INTERNAL_ERROR',
        message:
          process.env['NODE_ENV'] === 'production'
            ? 'An internal error occurred'
            : error.message,
      },
    });
  });
};

export default fp(errorHandlerPlugin, { name: 'error-handler' });

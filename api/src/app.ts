import 'dotenv/config';
import Fastify from 'fastify';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import fastifyWebSocket from '@fastify/websocket';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import errorHandlerPlugin from './plugins/errorHandler.js';
import authPlugin from './plugins/auth.js';
import authorizePlugin from './plugins/authorize.js';
import websocketRelayPlugin from './plugins/websocket.js';

import authRoutes from './routes/auth.js';
import organizationsRoutes from './routes/organizations.js';
import projectsRoutes from './routes/projects.js';
import queuesRoutes from './routes/queues.js';
import jobsRoutes from './routes/jobs.js';
import workersRoutes from './routes/workers.js';
import metricsRoutes from './routes/metrics.js';
import wsRoutes from './routes/ws.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { startReaper, stopReaper } from './services/reaper.js';
import { pool } from './db/pool.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
      ...(process.env['NODE_ENV'] !== 'production' && {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
        },
      }),
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  // ─── Type provider (Zod) ────────────────────────────────────────────────────
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // ─── Core plugins ───────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: process.env['CORS_ORIGIN'] ?? true,
    credentials: true,
  });
  await app.register(rateLimit, { global: false, max: 100, timeWindow: '1 minute' });

  await app.register(jwt, {
    secret: process.env['JWT_SECRET'] ?? 'fallback-dev-secret-change-in-production',
    sign: { expiresIn: '7d' },
  });

  await app.register(fastifyWebSocket);

  // ─── Custom plugins ─────────────────────────────────────────────────────────
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);
  await app.register(authorizePlugin);
  await app.register(websocketRelayPlugin);

  // ─── Health check ───────────────────────────────────────────────────────────
  app.get('/health', { logLevel: 'silent' }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env['npm_package_version'] ?? '1.0.0',
  }));

  // ─── API routes ─────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(organizationsRoutes, { prefix: '/api/v1/organizations' });
  await app.register(projectsRoutes, { prefix: '/api/v1/projects' });
  await app.register(queuesRoutes, { prefix: '/api/v1/queues' });
  await app.register(jobsRoutes, { prefix: '/api/v1/jobs' });
  await app.register(workersRoutes, { prefix: '/api/v1/workers' });
  await app.register(metricsRoutes, { prefix: '/api/v1/metrics' });
  await app.register(wsRoutes, { prefix: '/ws' });

  return app;
}

export const app = await buildApp();

async function main() {
  const port = Number(process.env['PORT'] ?? 3000);
  const host = process.env['HOST'] ?? '0.0.0.0';

  try {
    await app.listen({ port, host });
    app.log.info(`API server listening on http://${host}:${port}`);
    startScheduler(app.log);
    startReaper(app.log);
  } catch (err) {
    app.log.error(err, 'Server failed to start');
    process.exit(1);
  }

  const shutdown = async () => {
    stopScheduler();
    stopReaper();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}

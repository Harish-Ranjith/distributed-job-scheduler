import pino from 'pino';
import { createWorkerPool } from './db.js';
import { startHeartbeat } from './heartbeat.js';
import { WorkerPool } from './pool.js';

// Load .env for local development
const { config } = await import('dotenv').catch(() => ({ config: () => {} }));
if (typeof config === 'function') config();

const CONCURRENCY = parseInt(process.env['WORKER_CONCURRENCY'] ?? '5');
const POLL_INTERVAL = parseInt(process.env['WORKER_POLL_INTERVAL_MS'] ?? '2000');
const LOG_LEVEL = process.env['LOG_LEVEL'] ?? 'info';

const log = pino({
  level: LOG_LEVEL,
  ...(process.env['NODE_ENV'] !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
    },
  }),
});

async function main() {
  const pool = createWorkerPool();
  
  // Register worker & start heartbeats
  const heartbeat = await startHeartbeat(pool, log, { concurrency: CONCURRENCY });
  
  // Start job processing loop
  const workerPool = new WorkerPool(
    pool,
    log,
    heartbeat.workerId,
    CONCURRENCY,
    POLL_INTERVAL
  );
  workerPool.start();

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`${signal} received — initiating graceful shutdown`);
    
    // 1. Stop processing new jobs and wait for active ones
    await workerPool.stop();
    
    // 2. Stop heartbeats and mark offline
    await heartbeat.stop();
    
    // 3. Close DB pool
    await pool.end();
    
    log.info('Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  log.error({ err }, 'Worker process failed to start');
  process.exit(1);
});

import { pool } from '../db/pool.js';
import type { FastifyBaseLogger } from 'fastify';

const STALE_THRESHOLD_SECONDS = parseInt(
  process.env['WORKER_STALE_THRESHOLD_SECONDS'] ?? '30'
);
const REAPER_INTERVAL_MS = parseInt(
  process.env['WORKER_REAPER_INTERVAL_MS'] ?? '30000'
);

let reaperInterval: NodeJS.Timeout | null = null;

/**
 * Stale job reaper — runs every 30 seconds by default.
 *
 * Recovers only claimed/running jobs whose execution lease has expired.
 * Worker heartbeat staleness is used separately to mark workers offline.
 *
 * Uses a CTE to find and requeue atomically in one query to avoid a race where
 * a worker sends a heartbeat between our stale detection and our requeue.
 */
async function reaperTick(log: FastifyBaseLogger): Promise<void> {
  try {
    log.info('Running stale worker reaper tick');
    const { rows: requeuedJobs } = await pool.query<{ id: string; queue_id: string }>(`
      WITH stale_workers AS (
        SELECT w.id
        FROM workers w
        WHERE w.status = 'active'
          AND (
            SELECT MAX(wh.received_at)
            FROM worker_heartbeats wh
            WHERE wh.worker_id = w.id
          ) < NOW() - ($1 || ' seconds')::INTERVAL
      ),
      stale_jobs AS (
        SELECT j.id
        FROM jobs j
        WHERE j.status IN ('claimed', 'running')
          AND j.lease_expires_at <= NOW()
      )
      UPDATE jobs
      SET
        status     = 'queued',
        run_at     = NOW(),
        worker_id  = NULL,
        lease_token = NULL,
        lease_expires_at = NULL,
        updated_at = NOW()
      FROM stale_jobs
      WHERE jobs.id = stale_jobs.id
      RETURNING jobs.id, jobs.queue_id
    `, [STALE_THRESHOLD_SECONDS]);

    for (const job of requeuedJobs) {
      log.warn({ job_id: job.id, queue_id: job.queue_id }, 'Reaper requeued stale job');
    }

    // Mark stale workers as offline
    await pool.query(`
      UPDATE workers
      SET status = 'offline', updated_at = NOW()
      WHERE status = 'active'
        AND (
          SELECT MAX(wh.received_at)
          FROM worker_heartbeats wh
          WHERE wh.worker_id = workers.id
        ) < NOW() - ($1 || ' seconds')::INTERVAL
    `, [STALE_THRESHOLD_SECONDS]);

  } catch (err) {
    log.error({ err }, 'Reaper tick error');
  }
}

export function startReaper(log: FastifyBaseLogger): void {
  void reaperTick(log);
  reaperInterval = setInterval(() => void reaperTick(log), REAPER_INTERVAL_MS);
  log.info(
    { stale_threshold_seconds: STALE_THRESHOLD_SECONDS, interval_ms: REAPER_INTERVAL_MS },
    '✓ Stale job reaper started'
  );
}

export function stopReaper(): void {
  if (reaperInterval) {
    clearInterval(reaperInterval);
    reaperInterval = null;
  }
}

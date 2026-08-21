import { Cron } from 'croner';
import { pool } from '../db/pool.js';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Compute the next run date for a cron expression using croner.
 * Returns null if the expression is invalid.
 */
export function computeNextRunAt(cronExpression: string): Date | null {
  try {
    const job = new Cron(cronExpression, { paused: true });
    const next = job.nextRun();
    job.stop();
    return next ?? null;
  } catch {
    return null;
  }
}

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Cron scheduler tick — runs every 30s.
 * Queries scheduled_jobs WHERE is_active AND next_run_at <= NOW(),
 * inserts a new jobs row from the template, and advances next_run_at.
 */
export function startScheduler(log: FastifyBaseLogger): void {
  void runSchedulerTick(log);
  schedulerInterval = setInterval(() => void runSchedulerTick(log), 30_000);
  log.info('✓ Cron scheduler started (30s interval)');
}

export async function runSchedulerTick(log: FastifyBaseLogger): Promise<void> {
  try {
    while (true) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const { rows } = await client.query<{
          id: string;
          queue_id: string;
          cron_expression: string;
          job_template: {
            job_type: string;
            payload: Record<string, unknown>;
            priority?: number;
            max_attempts?: number;
          };
        }>(`
            SELECT id, queue_id, cron_expression, job_template
            FROM scheduled_jobs
            WHERE is_active = TRUE AND next_run_at <= NOW()
            ORDER BY next_run_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          `);

        const scheduledJob = rows[0];
        if (!scheduledJob) {
          await client.query('COMMIT');
          return;
        }

        const { job_type, payload, priority = 0, max_attempts = 3 } = scheduledJob.job_template;

        await client.query(
          `INSERT INTO jobs (queue_id, job_type, payload, priority, max_attempts, cron_expression)
             VALUES ($1, $2, $3, $4, $5, $6)`,
          [scheduledJob.queue_id, job_type, JSON.stringify(payload), priority, max_attempts, scheduledJob.cron_expression]
        );

        const nextRun = computeNextRunAt(scheduledJob.cron_expression);
        await client.query(
          `UPDATE scheduled_jobs SET next_run_at = $1, last_run_at = NOW(), updated_at = NOW() WHERE id = $2`,
          [nextRun, scheduledJob.id]
        );

        await client.query('COMMIT');
        log.info({ scheduled_job_id: scheduledJob.id, job_type, next_run_at: nextRun }, 'Cron job spawned');
      } catch (err) {
        await client.query('ROLLBACK');
        log.error({ err }, 'Failed to spawn cron job');
      } finally {
        client.release();
      }
    }
  } catch (err) {
    log.error({ err }, 'Scheduler tick error');
  }
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

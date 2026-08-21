import type { Pool, PoolClient } from 'pg';
import type { Logger } from 'pino';
import type { Job, RetryStrategy } from '@job-scheduler/shared';
import { getHandler } from './handlers/index.js';
import { computeRetryDelay } from './retry.js';

export async function executeJob(
  pool: Pool,
  job: Job,
  workerId: string,
  log: Logger
): Promise<void> {
  const startTime = Date.now();
  let executionId: string | null = null;
  const attemptNumber = job.attempt_count + 1;
  const leaseToken = job.lease_token;
  if (!leaseToken) throw new Error(`Lease missing for job ${job.id}`);

  const jobLog = log.child({ job_id: job.id, attempt: attemptNumber });
  jobLog.info({ job_type: job.job_type, payload: job.payload }, 'Starting job execution');

  // We use a dedicated client from the pool to insert logs quickly
  const client: PoolClient = await pool.connect();
  let isTransactionActive = false;

  async function appendLog(level: 'debug' | 'info' | 'warn' | 'error', message: string, metadata?: any) {
    try {
      await client.query(
        `INSERT INTO job_logs (job_id, execution_id, level, message, metadata) VALUES ($1, $2, $3, $4, $5)`,
        [job.id, executionId, level, message, metadata ? JSON.stringify(metadata) : null]
      );
    } catch (err) {
      log.error({ err }, 'Failed to insert job log');
    }
  }

  const handlerLog = (msg: string, meta?: any) => {
    void appendLog('info', msg, meta);
  };

  try {
    // 1. Create execution row
    const { rows: execRows } = await client.query(
      `INSERT INTO job_executions (job_id, worker_id, lease_token, attempt_number, status)
       VALUES ($1, $2, $3, $4, 'running') RETURNING id`,
      [job.id, workerId, leaseToken, attemptNumber]
    );
    executionId = execRows[0]!.id;

    // 2. Mark job as running
    const runningResult = await client.query(
      `UPDATE jobs SET status = 'running', updated_at = NOW()
       WHERE id = $1 AND worker_id = $2 AND lease_token = $3
         AND status = 'claimed' AND lease_expires_at > NOW()`,
      [job.id, workerId, leaseToken]
    );
    if (runningResult.rowCount !== 1) throw new Error(`Lease lost before starting job ${job.id}`);

    // 3. Find and run handler
    const handler = getHandler(job.job_type);
    if (!handler) {
      throw new Error(`No handler registered for job type: ${job.job_type}`);
    }

    const timeoutMs = parseInt(process.env['WORKER_JOB_TIMEOUT_MS'] ?? '300000');
    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        handler(job, handlerLog),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error(`Job execution timed out after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }

    // 4. Success
    const durationMs = Date.now() - startTime;
    await client.query('BEGIN');
    isTransactionActive = true;

    await client.query(
      `UPDATE job_executions SET status = 'completed', finished_at = NOW(), duration_ms = $1 WHERE id = $2`,
      [durationMs, executionId]
    );
    const completedResult = await client.query(
      `UPDATE jobs SET status = 'completed', worker_id = NULL, lease_token = NULL,
              lease_expires_at = NULL, updated_at = NOW()
       WHERE id = $1 AND worker_id = $2 AND lease_token = $3
         AND status = 'running' AND lease_expires_at > NOW()`,
      [job.id, workerId, leaseToken]
    );
    if (completedResult.rowCount !== 1) {
      throw new Error(`Lease lost before completing job ${job.id}`);
    }
    await appendLog('info', 'Job completed successfully');

    await client.query('COMMIT');
    isTransactionActive = false;
    jobLog.info({ durationMs }, 'Job completed successfully');
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    jobLog.error({ err: error, durationMs }, 'Job execution failed');

    try {
      if (errorMessage.startsWith('Lease lost')) {
        await client.query(
          `UPDATE job_executions SET status = 'failed', finished_at = NOW(), duration_ms = $1, error_message = $2
           WHERE id = $3 AND status = 'running'`,
          [durationMs, errorMessage, executionId]
        );
        jobLog.warn('Execution abandoned after lease loss; job state is owned by another worker');
        return;
      }

      if (isTransactionActive) await client.query('ROLLBACK');

      await client.query('BEGIN');
      isTransactionActive = true;

      // Mark execution as failed
      await client.query(
        `UPDATE job_executions SET status = 'failed', finished_at = NOW(), duration_ms = $1, error_message = $2 WHERE id = $3`,
        [durationMs, errorMessage, executionId]
      );
      await appendLog('error', `Job failed: ${errorMessage}`);

      // Handle retry or DLQ
      if (attemptNumber < job.max_attempts) {
        // Fetch queue retry policy
        const { rows: queueRows } = await client.query(
          `SELECT rp.strategy, rp.base_delay_ms, rp.max_delay_ms, rp.jitter
           FROM queues q
           LEFT JOIN retry_policies rp ON rp.id = q.retry_policy_id
           WHERE q.id = $1`,
          [job.queue_id]
        );

        let delayMs = 1000; // default
        if (queueRows[0]?.strategy) {
          const rp = queueRows[0];
          delayMs = computeRetryDelay(
            rp.strategy as RetryStrategy,
            rp.base_delay_ms,
            rp.max_delay_ms,
            rp.jitter,
            attemptNumber
          );
        }

        const retryResult = await client.query(
          `UPDATE jobs
             SET status = 'queued', attempt_count = $1, run_at = NOW() + ($2 || ' milliseconds')::INTERVAL,
               worker_id = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
             WHERE id = $3 AND worker_id = $4 AND lease_token = $5 AND lease_expires_at > NOW()`,
            [attemptNumber, delayMs, job.id, workerId, leaseToken]
        );
          if (retryResult.rowCount !== 1) throw new Error(`Lease lost while retrying job ${job.id}`);
        jobLog.info({ delayMs }, 'Job queued for retry');
      } else {
        // Max attempts reached -> DLQ
        const dlqResult = await client.query(
            `UPDATE jobs SET status = 'dead_letter', attempt_count = $1, worker_id = NULL,
              lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
             WHERE id = $2 AND worker_id = $3 AND lease_token = $4 AND lease_expires_at > NOW()`,
            [attemptNumber, job.id, workerId, leaseToken]
        );
          if (dlqResult.rowCount !== 1) throw new Error(`Lease lost while moving job ${job.id} to DLQ`);
        await client.query(
          `INSERT INTO dead_letter_jobs (original_job_id, queue_id, job_type, payload, failure_reason, attempt_count, max_attempts)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [job.id, job.queue_id, job.job_type, JSON.stringify(job.payload), errorMessage, attemptNumber, job.max_attempts]
        );
        jobLog.warn('Job moved to dead letter queue');
      }

      await client.query('COMMIT');
    } catch (fallbackError) {
      if (isTransactionActive) await client.query('ROLLBACK').catch(() => null);
      jobLog.error({ err: fallbackError }, 'Failed to handle job failure state');
    }
  } finally {
    if (isTransactionActive) await client.query('ROLLBACK').catch(() => null);
    client.release();
  }
}

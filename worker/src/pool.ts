import type { Pool } from 'pg';
import pino from 'pino';
import { claimNextJob } from './claimer.js';
import { executeJob } from './executor.js';

export class WorkerPool {
  private pool: Pool;
  private log: pino.Logger;
  private workerId: string;
  private concurrency: number;
  private pollIntervalMs: number;

  private activeJobs = 0;
  private isDraining = false;
  private isPolling = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    pool: Pool,
    log: pino.Logger,
    workerId: string,
    concurrency: number,
    pollIntervalMs: number
  ) {
    this.pool = pool;
    this.log = log.child({ component: 'WorkerPool', workerId });
    this.workerId = workerId;
    this.concurrency = concurrency;
    this.pollIntervalMs = pollIntervalMs;
  }

  public start() {
    this.log.info({ concurrency: this.concurrency, pollIntervalMs: this.pollIntervalMs }, 'Starting worker pool poll loop');
    this.poll();
  }

  public async stop(timeoutMs = parseInt(process.env['WORKER_SHUTDOWN_TIMEOUT_MS'] ?? '30000')) {
    this.log.info('Draining worker pool... Waiting for active jobs to complete.');
    this.isDraining = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Wait until active jobs finish
    const deadline = Date.now() + timeoutMs;
    while (this.activeJobs > 0 && Date.now() < deadline) {
      await new Promise((res) => setTimeout(res, 500));
    }
    if (this.activeJobs > 0) {
      this.log.warn({ activeJobs: this.activeJobs, timeoutMs }, 'Shutdown deadline reached; active leases will expire for recovery');
    }
    this.log.info('Worker pool drained.');
  }

  private async poll() {
    if (this.isDraining || this.isPolling) return;
    this.isPolling = true;

    try {
      while (this.activeJobs < this.concurrency && !this.isDraining) {
        // Attempt to claim a job
        const job = await claimNextJob(this.pool, this.workerId);
        if (!job) {
          break; // No jobs available, break out to sleep
        }

        this.activeJobs++;
        // Run job execution concurrently without blocking the poll loop
        executeJob(this.pool, job, this.workerId, this.log)
          .catch((err) => {
            this.log.error({ err, jobId: job.id }, 'Unhandled error in executeJob');
          })
          .finally(() => {
            this.activeJobs--;
            if (!this.isDraining) {
              // Immediately trigger a poll when a slot opens up
              setImmediate(() => this.poll());
            }
          });
      }
    } catch (err) {
      this.log.error({ err }, 'Error during poll');
    } finally {
      this.isPolling = false;
      if (!this.isDraining) {
        this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
      }
    }
  }
}

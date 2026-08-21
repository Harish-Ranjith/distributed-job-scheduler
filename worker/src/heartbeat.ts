import type { Pool } from 'pg';
import type { Logger } from 'pino';

export interface HeartbeatHandle {
  stop: () => Promise<void>;
  workerId: string;
}

/**
 * Registers this worker in the workers table and starts sending heartbeats.
 *
 * Each heartbeat inserts a row into worker_heartbeats (append-only history)
 * AND updates workers.last_seen. The reaper queries MAX(received_at) from
 * worker_heartbeats to determine staleness.
 */
export async function startHeartbeat(
  pool: Pool,
  log: Logger,
  opts: {
    concurrency: number;
    intervalMs?: number;
  }
): Promise<HeartbeatHandle> {
  const hostname = process.env['HOSTNAME'] ?? 'unknown';
  const pid = process.pid;
  const intervalMs = opts.intervalMs ?? parseInt(process.env['WORKER_HEARTBEAT_INTERVAL_MS'] ?? '10000');

  // Register worker
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO workers (hostname, pid, concurrency, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING id`,
    [hostname, pid, opts.concurrency]
  );
  const workerId = rows[0]!.id;
  log.info({ workerId, hostname, pid }, 'Worker registered');

  // Heartbeat function
  async function sendHeartbeat(): Promise<void> {
    try {
      await Promise.all([
        pool.query(
          `INSERT INTO worker_heartbeats (worker_id, received_at) VALUES ($1, NOW())`,
          [workerId]
        ),
        pool.query(
          `UPDATE workers SET last_seen = NOW() WHERE id = $1`,
          [workerId]
        ),
      ]);
    } catch (err) {
      log.error({ err }, 'Heartbeat failed');
    }
  }

  // Send immediately, then on interval
  await sendHeartbeat();
  const timer = setInterval(() => void sendHeartbeat(), intervalMs);

  async function stop(): Promise<void> {
    clearInterval(timer);
    await pool.query(
      `UPDATE workers SET status = 'offline', updated_at = NOW() WHERE id = $1`,
      [workerId]
    );
    log.info({ workerId }, 'Worker marked offline');
  }

  return { stop, workerId };
}

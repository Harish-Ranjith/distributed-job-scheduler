import type { Pool, PoolClient } from 'pg';
import type { Job } from '@job-scheduler/shared';

/**
 * Atomically claim one job from the specified queue using SELECT FOR UPDATE SKIP LOCKED.
 *
 * The CTE pattern performs a single round-trip:
 *   1. Find the best candidate (highest priority, earliest run_at) that is not locked
 *   2. Atomically UPDATE its status to 'claimed' in the same statement
 *   3. RETURNING the full row
 *
 * The WHERE status IN ('queued','scheduled') inside the CTE guards against
 * double-transition even if the lock somehow isn't effective (defense in depth).
 *
 * SKIP LOCKED ensures concurrent workers don't block each other — each worker
 * instantly skips rows locked by others and moves to the next candidate.
 */
export async function claimJob(
  pool: Pool,
  queueId: string,
  workerId: string
): Promise<Job | null> {
  const client: PoolClient = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query<Job>(`
      WITH candidate AS (
        SELECT j.id
        FROM jobs j
        JOIN queues q ON q.id = j.queue_id
        WHERE j.queue_id = $1
          AND j.status IN ('queued', 'scheduled')
          AND j.run_at <= NOW()
          AND q.status = 'active'
          AND (SELECT COUNT(*) FROM jobs j2 WHERE j2.queue_id = q.id AND j2.status IN ('claimed', 'running')) < q.concurrency_limit
        ORDER BY j.priority DESC, j.run_at ASC
        LIMIT 1
        FOR UPDATE OF j, q SKIP LOCKED
      )
      UPDATE jobs
      SET
        status     = 'claimed',
        worker_id  = $2,
        updated_at = NOW()
      FROM candidate
      WHERE jobs.id = candidate.id
        AND jobs.status IN ('queued', 'scheduled')
      RETURNING jobs.*
    `, [queueId, workerId]);

    await client.query('COMMIT');
    return rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Claim one job from any active queue (used by the poll loop when not bound to a specific queue).
 */
export async function claimNextJob(pool: Pool, workerId: string): Promise<Job | null> {
  const client: PoolClient = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query<Job>(`
      WITH candidate AS (
        SELECT j.id
        FROM jobs j
        JOIN queues q ON q.id = j.queue_id
        WHERE j.status IN ('queued', 'scheduled')
          AND j.run_at <= NOW()
          AND q.status = 'active'
          AND (SELECT COUNT(*) FROM jobs j2 WHERE j2.queue_id = q.id AND j2.status IN ('claimed', 'running')) < q.concurrency_limit
        ORDER BY j.priority DESC, j.run_at ASC
        LIMIT 1
        FOR UPDATE OF j, q SKIP LOCKED
      )
      UPDATE jobs
      SET
        status     = 'claimed',
        worker_id  = $1,
        updated_at = NOW()
      FROM candidate
      WHERE jobs.id = candidate.id
        AND jobs.status IN ('queued', 'scheduled')
      RETURNING jobs.*
    `, [workerId]);

    await client.query('COMMIT');
    return rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

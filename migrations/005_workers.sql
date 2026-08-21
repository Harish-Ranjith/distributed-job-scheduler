-- Migration 005: Workers, Worker Heartbeats
--
-- Design decisions:
--   - worker_status enum: 'draining' captures the graceful-shutdown window
--     between SIGTERM receipt and the last in-flight job completing.
--   - worker_heartbeats is append-only (no updates) — one row per ping. The
--     reaper queries MAX(received_at) per worker to determine staleness. This
--     gives full heartbeat history for observability without adding any write
--     complexity. The index on (worker_id, received_at DESC) makes the MAX()
--     subquery an index-only scan.
--   - worker_heartbeats FK to workers with ON DELETE CASCADE — heartbeat history
--     is meaningless without the parent worker row; cascade keeps it clean.
--   - Now that workers table exists, add the FK from jobs.worker_id.
--     ON DELETE SET NULL: if a worker row is deleted (rare — normally we mark
--     offline), its claimed/running jobs become unclaimed and the reaper picks
--     them up on the next cycle.

CREATE TYPE worker_status AS ENUM ('active', 'draining', 'offline');

CREATE TABLE workers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname      TEXT NOT NULL,
  pid           INTEGER NOT NULL,
  status        worker_status NOT NULL DEFAULT 'active',
  concurrency   INTEGER NOT NULL DEFAULT 5
                  CHECK (concurrency >= 1),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workers_status ON workers (status) WHERE status = 'active';

CREATE TABLE worker_heartbeats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id   UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reaper query: MAX(received_at) per worker is an index-only scan with this index
CREATE INDEX idx_worker_heartbeats_worker_time
  ON worker_heartbeats (worker_id, received_at DESC);

-- Now safe to add the FK that jobs.worker_id references
ALTER TABLE jobs
  ADD CONSTRAINT fk_jobs_worker
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE SET NULL;

CREATE INDEX idx_jobs_worker ON jobs (worker_id)
  WHERE worker_id IS NOT NULL;

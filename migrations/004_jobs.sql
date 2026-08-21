-- Migration 004: Jobs
--
-- Design decisions:
--   - job_status enum: every status transition is guarded by a WHERE clause
--     checking the prior state (e.g. WHERE status = 'claimed' before moving to
--     'running') so double-transitions are prevented at the application layer
--     regardless of lock state.
--   - Composite partial index idx_jobs_claim on (status, run_at, priority DESC)
--     WHERE status IN ('queued','scheduled'): this is the exact index the SKIP
--     LOCKED claim query hits. Filtering to only actionable statuses keeps the
--     index small as completed/failed rows accumulate (which would otherwise
--     bloat a full-table index over time).
--   - Partial unique index on idempotency_key (WHERE NOT NULL): prevents
--     duplicate job submissions for the same key without wasting index space on
--     the majority of jobs that have no key.
--   - jobs.queue_id uses ON DELETE RESTRICT — losing a queue must not silently
--     drop pending jobs. The queue must be drained or jobs reassigned first.
--   - worker_id is nullable because a job is created before any worker claims it;
--     ON DELETE SET NULL ensures an offline worker doesn't orphan its claimed jobs
--     (the reaper will re-queue them).

CREATE TYPE job_status AS ENUM (
  'queued',
  'scheduled',
  'claimed',
  'running',
  'completed',
  'failed',
  'dead_letter'
);

CREATE TABLE jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id         UUID NOT NULL REFERENCES queues(id) ON DELETE RESTRICT,
  worker_id        UUID,                   -- FK added after workers table; nullable
  status           job_status NOT NULL DEFAULT 'queued',
  job_type         TEXT NOT NULL,
  payload          JSONB NOT NULL DEFAULT '{}',
  priority         SMALLINT NOT NULL DEFAULT 0,
  run_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  max_attempts     SMALLINT NOT NULL DEFAULT 3
                     CHECK (max_attempts >= 1),
  attempt_count    SMALLINT NOT NULL DEFAULT 0,
  idempotency_key  TEXT,
  cron_expression  TEXT,                   -- set for jobs spawned by a scheduled_job
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The claim query index: only actionable rows, ordered by priority then age
CREATE INDEX idx_jobs_claim ON jobs (status, run_at ASC, priority DESC)
  WHERE status IN ('queued', 'scheduled');

-- Queue-level concurrency check: count running jobs per queue quickly
CREATE INDEX idx_jobs_queue_status ON jobs (queue_id, status)
  WHERE status IN ('claimed', 'running');

-- Idempotency: unique key only where provided
CREATE UNIQUE INDEX idx_jobs_idempotency ON jobs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Text search on job_type (uses pg_trgm from migration 001)
CREATE INDEX idx_jobs_job_type_trgm ON jobs USING GIN (job_type gin_trgm_ops);

-- General lookups
CREATE INDEX idx_jobs_queue   ON jobs (queue_id);
CREATE INDEX idx_jobs_created ON jobs (created_at DESC);

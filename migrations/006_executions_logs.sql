-- Migration 006: Job Executions, Job Logs
--
-- Design decisions:
--   - job_executions is 1-to-1-per-attempt: one row per execution attempt of a
--     job. attempt_number starts at 1 and increments on each retry. This gives
--     a clean per-attempt timeline including which worker handled it, how long
--     it took, and what error occurred.
--   - job_logs is append-only 1-to-many: many log lines per execution, never
--     updated. No MVCC dead tuple bloat from updates on these tables.
--   - Both cascade on job delete (ON DELETE CASCADE): logs and executions are
--     meaningless without their parent job.
--   - job_executions also cascades on execution_id in job_logs: no orphan log
--     lines if an execution row is removed (rare, but defensive).
--   - The (job_id, attempt_number) unique constraint prevents duplicate attempts.

CREATE TYPE execution_status AS ENUM ('running', 'completed', 'failed');
CREATE TYPE log_level AS ENUM ('debug', 'info', 'warn', 'error');

CREATE TABLE job_executions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id      UUID REFERENCES workers(id) ON DELETE SET NULL,
  attempt_number SMALLINT NOT NULL,
  status         execution_status NOT NULL DEFAULT 'running',
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ,
  error_message  TEXT,
  duration_ms    INTEGER,
  CONSTRAINT job_executions_job_attempt_unique UNIQUE (job_id, attempt_number)
);

CREATE INDEX idx_job_executions_job    ON job_executions (job_id);
CREATE INDEX idx_job_executions_worker ON job_executions (worker_id)
  WHERE worker_id IS NOT NULL;

CREATE TABLE job_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  execution_id UUID REFERENCES job_executions(id) ON DELETE CASCADE,
  level        log_level NOT NULL DEFAULT 'info',
  message      TEXT NOT NULL,
  metadata     JSONB,
  logged_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_logs_job       ON job_logs (job_id, logged_at DESC);
CREATE INDEX idx_job_logs_execution ON job_logs (execution_id)
  WHERE execution_id IS NOT NULL;

-- Migration 008: Scheduled Jobs (Cron)
--
-- Design decisions:
--   - scheduled_jobs stores the cron template, not the individual job instances.
--     The scheduler service reads next_run_at, clones job_template into a new
--     jobs row, then advances next_run_at using the cron expression.
--   - job_template is JSONB so it can store arbitrary payload + metadata without
--     requiring a separate normalization; the template is always small.
--   - queue_id uses ON DELETE RESTRICT: deleting a queue with active cron jobs
--     would silently break their schedule; the operator must disable them first.

CREATE TABLE scheduled_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id        UUID NOT NULL REFERENCES queues(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  job_template    JSONB NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  next_run_at     TIMESTAMPTZ,
  last_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Scheduler poll query: only active cron jobs due to fire
CREATE INDEX idx_scheduled_jobs_active
  ON scheduled_jobs (next_run_at ASC)
  WHERE is_active = TRUE;

CREATE INDEX idx_scheduled_jobs_queue ON scheduled_jobs (queue_id);

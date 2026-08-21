-- Migration 007: Dead Letter Queue
--
-- Design decisions:
--   - dead_letter_jobs is a separate first-class table, not just a status flag
--     on jobs. This gives it its own query path, its own indexes, and makes the
--     DLQ a distinct entity that operators can inspect and act on independently
--     of the main jobs table.
--   - original_job_id references jobs(id) with ON DELETE SET NULL: we keep the
--     DLQ entry even if the original job row is purged (e.g. after a cleanup job
--     runs), because the failure reason and payload are the valuable artifact.
--   - queue_id uses ON DELETE RESTRICT for the same reason queues → projects
--     does: losing a queue's DLQ silently would be a data-loss surprise.

CREATE TABLE dead_letter_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_job_id  UUID REFERENCES jobs(id) ON DELETE SET NULL,
  queue_id         UUID NOT NULL REFERENCES queues(id) ON DELETE RESTRICT,
  job_type         TEXT NOT NULL,
  payload          JSONB NOT NULL DEFAULT '{}',
  failure_reason   TEXT NOT NULL,
  attempt_count    SMALLINT NOT NULL,
  max_attempts     SMALLINT NOT NULL,
  failed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dlq_queue      ON dead_letter_jobs (queue_id, failed_at DESC);
CREATE INDEX idx_dlq_original   ON dead_letter_jobs (original_job_id)
  WHERE original_job_id IS NOT NULL;
CREATE INDEX idx_dlq_job_type   ON dead_letter_jobs (job_type);

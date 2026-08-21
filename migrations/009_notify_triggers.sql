-- Migration 009: LISTEN/NOTIFY trigger + migrations tracking table
--
-- Design decisions:
--   - The notify_job_change() function fires on INSERT and on status UPDATE of
--     the jobs table. The payload is a JSON object with event type, table,
--     row ID, and new status so the WebSocket relay can broadcast meaningful
--     events to the dashboard without an extra DB round-trip.
--   - PostgreSQL NOTIFY payloads are capped at 8000 bytes. We only send IDs and
--     status strings here, never full payloads — the dashboard fetches details
--     via REST on demand.
--   - _migrations is created here (last migration) so that the migration runner
--     can record which files have been applied, making the runner idempotent.

CREATE OR REPLACE FUNCTION notify_job_change()
RETURNS trigger AS $$
DECLARE
  payload TEXT;
BEGIN
  payload := json_build_object(
    'event',     TG_OP,
    'table',     TG_TABLE_NAME,
    'id',        NEW.id,
    'status',    NEW.status,
    'queue_id',  NEW.queue_id,
    'timestamp', NOW()
  )::TEXT;

  -- Guard: NOTIFY payload limit is 8000 bytes
  IF length(payload) <= 8000 THEN
    PERFORM pg_notify('job_events', payload);
  ELSE
    PERFORM pg_notify('job_events', json_build_object(
      'event', 'reload',
      'id',    NEW.id,
      'timestamp', NOW()
    )::TEXT);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fire on INSERT (new job created) and on status column UPDATE only
CREATE TRIGGER job_status_notify
  AFTER INSERT OR UPDATE OF status ON jobs
  FOR EACH ROW EXECUTE FUNCTION notify_job_change();

-- Notify on worker status changes too (for dashboard worker view)
CREATE OR REPLACE FUNCTION notify_worker_change()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('job_events', json_build_object(
    'event',     'worker_' || lower(NEW.status::TEXT),
    'id',        NEW.id,
    'status',    NEW.status,
    'timestamp', NOW()
  )::TEXT);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER worker_status_notify
  AFTER INSERT OR UPDATE OF status ON workers
  FOR EACH ROW EXECUTE FUNCTION notify_worker_change();

-- Migration tracking table (idempotent runner support)
CREATE TABLE IF NOT EXISTS _migrations (
  id         SERIAL PRIMARY KEY,
  filename   TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

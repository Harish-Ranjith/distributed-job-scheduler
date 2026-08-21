-- Migration 011: Include tenant ownership in notification payloads

CREATE OR REPLACE FUNCTION notify_job_change()
RETURNS trigger AS $$
DECLARE
  payload TEXT;
  organization_id UUID;
BEGIN
  SELECT p.organization_id INTO organization_id
  FROM jobs j
  JOIN queues q ON q.id = j.queue_id
  JOIN projects p ON p.id = q.project_id
  WHERE j.id = NEW.id;

  payload := json_build_object(
    'event', CASE
      WHEN TG_OP = 'INSERT' THEN 'job_created'
      WHEN NEW.status = 'completed' THEN 'job_completed'
      WHEN NEW.status = 'failed' THEN 'job_failed'
      WHEN NEW.status = 'dead_letter' THEN 'job_dead_letter'
      ELSE 'job_updated'
    END,
    'table', TG_TABLE_NAME,
    'id', NEW.id,
    'status', NEW.status,
    'queue_id', NEW.queue_id,
    'organization_id', organization_id,
    'timestamp', NOW()
  )::TEXT;

  IF length(payload) <= 8000 THEN
    PERFORM pg_notify('job_events', payload);
  ELSE
    PERFORM pg_notify('job_events', json_build_object('event', 'reload', 'id', NEW.id, 'timestamp', NOW())::TEXT);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

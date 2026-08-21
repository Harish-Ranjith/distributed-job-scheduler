-- Migration 012: Scope worker notifications to organizations using the worker

CREATE OR REPLACE FUNCTION notify_worker_change()
RETURNS trigger AS $$
DECLARE
  organization_ids UUID[];
BEGIN
  SELECT ARRAY_AGG(DISTINCT p.organization_id) INTO organization_ids
  FROM jobs j
  JOIN queues q ON q.id = j.queue_id
  JOIN projects p ON p.id = q.project_id
  WHERE j.worker_id = NEW.id;

  PERFORM pg_notify('job_events', json_build_object(
    'event', 'worker_' || lower(NEW.status::TEXT),
    'id', NEW.id,
    'status', NEW.status,
    'organization_ids', COALESCE(organization_ids, ARRAY[]::UUID[]),
    'timestamp', NOW()
  )::TEXT);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
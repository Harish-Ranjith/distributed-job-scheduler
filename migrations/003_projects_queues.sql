-- Migration 003: Projects, Retry Policies, Queues
--
-- Design decisions:
--   - projects FK to organizations with ON DELETE RESTRICT — silently orphaning
--     a project's jobs when deleting an org would be a data-loss surprise. The
--     application must explicitly delete or transfer projects first.
--   - retry_policies is a separate table (not columns on queues/jobs) so a
--     policy can be reused across many queues without update anomalies (3NF).
--     If you rename a policy's strategy, you update one row, not N queue rows.
--   - queues.retry_policy_id uses ON DELETE SET NULL — losing a policy does not
--     destroy the queue or its pending jobs; the queue falls back to no retries.
--   - queues FK to projects with ON DELETE RESTRICT — same reasoning as above;
--     queues own jobs, so they must be explicitly cleared first.
--   - queue_status enum constrains the only legal states at the DB level.

CREATE TYPE queue_status AS ENUM ('active', 'paused');
CREATE TYPE retry_strategy AS ENUM ('fixed', 'linear', 'exponential');

CREATE TABLE retry_policies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  strategy      retry_strategy NOT NULL DEFAULT 'exponential',
  base_delay_ms INTEGER NOT NULL DEFAULT 1000
                  CHECK (base_delay_ms >= 100),
  max_delay_ms  INTEGER NOT NULL DEFAULT 3600000
                  CHECK (max_delay_ms >= base_delay_ms),
  jitter        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_org ON projects (organization_id);

CREATE TABLE queues (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  retry_policy_id   UUID REFERENCES retry_policies(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  status            queue_status NOT NULL DEFAULT 'active',
  priority          SMALLINT NOT NULL DEFAULT 0,
  concurrency_limit INTEGER NOT NULL DEFAULT 10
                      CHECK (concurrency_limit >= 1),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT queues_project_name_unique UNIQUE (project_id, name)
);

CREATE INDEX idx_queues_project        ON queues (project_id);
CREATE INDEX idx_queues_retry_policy   ON queues (retry_policy_id);
CREATE INDEX idx_queues_status         ON queues (status) WHERE status = 'active';

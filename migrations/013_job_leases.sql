-- Migration 013: Fenced job leases for crash recovery

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS lease_token UUID,
ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

ALTER TABLE job_executions
ADD COLUMN IF NOT EXISTS lease_token UUID;

CREATE INDEX IF NOT EXISTS idx_jobs_expired_leases ON jobs (lease_expires_at)
WHERE
    status IN ('claimed', 'running')
    AND lease_expires_at IS NOT NULL;
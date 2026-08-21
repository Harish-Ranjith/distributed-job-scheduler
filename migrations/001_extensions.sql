-- Migration 001: Enable extensions
-- pgcrypto provides gen_random_uuid() for UUID primary keys

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for trigram text search on job_type

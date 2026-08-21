-- Migration 002: Users, Organizations, Memberships
-- 
-- Design decisions:
--   - UUID PKs everywhere (gen_random_uuid) — avoids sequential ID enumeration,
--     safe for distributed inserts, stable for external references.
--   - email has a unique index to prevent duplicate registrations.
--   - memberships.role is an enum to constrain values at the DB level.
--   - memberships FK to users and organizations with ON DELETE CASCADE —
--     removing a user or org removes their membership rows. This is intentional:
--     an org without its owner is in an undefined state; the application layer
--     must prevent deleting the last owner before this fires.

CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE INDEX idx_users_email ON users (email);

CREATE TABLE organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organizations_slug_unique UNIQUE (slug)
);

CREATE TABLE memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            membership_role NOT NULL DEFAULT 'member',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT memberships_user_org_unique UNIQUE (user_id, organization_id)
);

CREATE INDEX idx_memberships_user ON memberships (user_id);
CREATE INDEX idx_memberships_org  ON memberships (organization_id);

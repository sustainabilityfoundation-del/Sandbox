-- Platform schema: users, project membership (roles) and entitlements (contracts §6).
-- Owned by the platform (coordinator) once integrated; the Requirements service only reads it
-- through the host's identity functions, never directly.

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE platform.users (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform.project_memberships (
  project_id text NOT NULL,
  user_id text NOT NULL REFERENCES platform.users (id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('reader', 'editor', 'reviewer', 'administrator')),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE platform.entitlements (
  user_id text NOT NULL REFERENCES platform.users (id) ON DELETE RESTRICT,
  entitlement text NOT NULL CHECK (entitlement ~ '^tool:[a-z0-9-]+$'),
  PRIMARY KEY (user_id, entitlement)
);

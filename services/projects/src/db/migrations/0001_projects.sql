-- Project Management (schema `projects`): project registry and lifecycle, artifact registry, links,
-- milestones, work items, documents and their blobs, audit, outbox and idempotency.
-- Design: docs/modules/projects/schema.md. Only services/projects reads or writes this schema.
--
-- Rules:
--   * Nothing is deleted through the application except expired idempotency records and delivered outbox rows
--     after retention. Projects are archived or soft-deleted (state), links are marked removed, registry records
--     are marked unavailable or missing.
--   * Foreign keys use ON DELETE RESTRICT (the default NO ACTION also refuses), so a delete fails instead of cascading.
--   * Immutable tables are protected by triggers that refuse UPDATE, DELETE and TRUNCATE.

CREATE SCHEMA IF NOT EXISTS projects;

CREATE FUNCTION projects.refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on %.% is not permitted: the records are immutable', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '23001';
END
$$;

CREATE TABLE projects.key_counters (
  project_id text NOT NULL,
  prefix text NOT NULL,
  next_value integer NOT NULL CHECK (next_value >= 1),
  PRIMARY KEY (project_id, prefix)
);

-- ---- projects -----------------------------------------------------------------------------------------

CREATE TABLE projects.projects (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_.-]{1,100}$'),
  key text NOT NULL CHECK (key ~ '^[A-Z][A-Z0-9-]{1,19}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 20000),
  objectives jsonb NOT NULL DEFAULT '[]',
  scope text NOT NULL DEFAULT '' CHECK (char_length(scope) <= 20000),
  disciplines text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'on-hold', 'completed', 'cancelled')),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'archived', 'deleted')),
  template_id text NOT NULL DEFAULT 'blank',
  owner_id text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  legacy boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  deleted_at timestamptz,
  purge_after timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL
);
CREATE UNIQUE INDEX projects_key ON projects.projects (upper(key));
CREATE INDEX projects_state_updated ON projects.projects (state, updated_at DESC);

CREATE TABLE projects.project_revisions (
  project_id text NOT NULL REFERENCES projects.projects (id),
  revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_at timestamptz NOT NULL,
  changed_by text NOT NULL,
  summary text NOT NULL DEFAULT '',
  source_kind text NOT NULL,
  conversation_id text,
  proposal_id text,
  PRIMARY KEY (project_id, revision)
);
CREATE TRIGGER project_revisions_immutable BEFORE UPDATE OR DELETE ON projects.project_revisions FOR EACH ROW EXECUTE FUNCTION projects.refuse_change();
CREATE TRIGGER project_revisions_no_truncate BEFORE TRUNCATE ON projects.project_revisions FOR EACH STATEMENT EXECUTE FUNCTION projects.refuse_change();

-- What was asked for at creation: provenance, not a settings store (settings live in the settings service).
CREATE TABLE projects.creation_records (
  project_id text PRIMARY KEY REFERENCES projects.projects (id),
  template_id text NOT NULL,
  template_version integer NOT NULL,
  requested jsonb NOT NULL,
  duplicated_from text,
  imported_from jsonb,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL
);
CREATE TRIGGER creation_records_immutable BEFORE UPDATE OR DELETE ON projects.creation_records FOR EACH ROW EXECUTE FUNCTION projects.refuse_change();

CREATE TABLE projects.module_states (
  project_id text NOT NULL REFERENCES projects.projects (id),
  module text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL CHECK (status IN ('pending', 'provisioned', 'not-needed', 'failed', 'unavailable')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (project_id, module)
);

-- Per-user convenience (recently opened), not engineering data.
CREATE TABLE projects.recent_projects (
  user_id text NOT NULL,
  project_id text NOT NULL REFERENCES projects.projects (id),
  opened_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, project_id)
);
CREATE INDEX recent_projects_user ON projects.recent_projects (user_id, opened_at DESC);

-- ---- artifact registry --------------------------------------------------------------------------------

CREATE TABLE projects.artifacts (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects.projects (id),
  module text NOT NULL CHECK (module ~ '^[a-z][a-z0-9-]{0,39}$'),
  kind text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9-]{0,59}$'),
  native_id text NOT NULL CHECK (char_length(native_id) BETWEEN 1 AND 300),
  category text NOT NULL CHECK (category IN ('product-element', 'concept', 'design-knowledge', 'requirement', 'model', 'geometry', 'analysis', 'verification', 'document', 'work-item', 'milestone', 'baseline')),
  key text NOT NULL,
  title text NOT NULL,
  lifecycle text NOT NULL CHECK (lifecycle IN ('working', 'in-review', 'released', 'superseded', 'retired')),
  module_state text,
  version_value text NOT NULL,
  version_label text,
  version_at timestamptz NOT NULL,
  container_id uuid REFERENCES projects.artifacts (id),
  availability text NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'module-unavailable', 'missing-in-module')),
  source text NOT NULL DEFAULT 'module' CHECK (source IN ('module', 'projects', 'client-attested', 'import')),
  open_link jsonb,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  modified_at timestamptz NOT NULL,
  modified_by text NOT NULL,
  confirmed_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  UNIQUE (project_id, module, kind, native_id)
);
CREATE INDEX artifacts_list ON projects.artifacts (project_id, category, lower(title));
CREATE INDEX artifacts_search ON projects.artifacts USING gin (to_tsvector('simple', key || ' ' || title));

CREATE TABLE projects.artifact_observations (
  id bigserial PRIMARY KEY,
  artifact_id uuid NOT NULL REFERENCES projects.artifacts (id),
  record_revision integer NOT NULL,
  version_value text NOT NULL,
  lifecycle text NOT NULL,
  availability text NOT NULL,
  observed_at timestamptz NOT NULL,
  via text NOT NULL,
  actor text NOT NULL
);
CREATE INDEX artifact_observations_artifact ON projects.artifact_observations (artifact_id, id);
CREATE TRIGGER artifact_observations_immutable BEFORE UPDATE OR DELETE ON projects.artifact_observations FOR EACH ROW EXECUTE FUNCTION projects.refuse_change();

-- ---- links (owned by Project Management; module-owned relationships stay in modules) --------------------

CREATE TABLE projects.links (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects.projects (id),
  type text NOT NULL,
  from_artifact uuid NOT NULL REFERENCES projects.artifacts (id),
  from_revision text,
  to_artifact uuid NOT NULL REFERENCES projects.artifacts (id),
  to_revision text,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  source_kind text NOT NULL,
  conversation_id text,
  proposal_id text,
  removed_at timestamptz,
  removed_by text,
  removal_reason text,
  revision integer NOT NULL DEFAULT 1,
  CHECK (from_artifact <> to_artifact)
);
CREATE UNIQUE INDEX links_active ON projects.links (project_id, type, from_artifact, to_artifact) WHERE removed_at IS NULL;
CREATE INDEX links_from ON projects.links (project_id, from_artifact);
CREATE INDEX links_to ON projects.links (project_id, to_artifact);

-- ---- milestones and work items --------------------------------------------------------------------------

CREATE TABLE projects.milestones (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects.projects (id),
  key text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  due date,
  status text NOT NULL CHECK (status IN ('planned', 'in-progress', 'achieved', 'missed', 'cancelled')),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  UNIQUE (project_id, key)
);

CREATE TABLE projects.milestone_revisions (
  milestone_id uuid NOT NULL REFERENCES projects.milestones (id),
  revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_at timestamptz NOT NULL,
  changed_by text NOT NULL,
  PRIMARY KEY (milestone_id, revision)
);
CREATE TRIGGER milestone_revisions_immutable BEFORE UPDATE OR DELETE ON projects.milestone_revisions FOR EACH ROW EXECUTE FUNCTION projects.refuse_change();

CREATE TABLE projects.work_items (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects.projects (id),
  key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('task', 'issue', 'risk')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 20000),
  status text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assignee_id text,
  due date,
  milestone_id uuid REFERENCES projects.milestones (id),
  details jsonb NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  source_kind text NOT NULL DEFAULT 'user',
  conversation_id text,
  proposal_id text,
  UNIQUE (project_id, key)
);
CREATE INDEX work_items_list ON projects.work_items (project_id, kind, status);

CREATE TABLE projects.work_item_revisions (
  work_item_id uuid NOT NULL REFERENCES projects.work_items (id),
  revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_at timestamptz NOT NULL,
  changed_by text NOT NULL,
  PRIMARY KEY (work_item_id, revision)
);
CREATE TRIGGER work_item_revisions_immutable BEFORE UPDATE OR DELETE ON projects.work_item_revisions FOR EACH ROW EXECUTE FUNCTION projects.refuse_change();

-- ---- documents and blobs ----------------------------------------------------------------------------------

-- Catalogue of stored bytes: the bytes live in the blob store under their content address.
CREATE TABLE projects.blobs (
  key text PRIMARY KEY CHECK (key ~ '^sha256/[0-9a-f]{2}/[0-9a-f]{64}$'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  first_stored_at timestamptz NOT NULL
);
CREATE TRIGGER blobs_immutable BEFORE UPDATE OR DELETE ON projects.blobs FOR EACH ROW EXECUTE FUNCTION projects.refuse_change();

CREATE TABLE projects.documents (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects.projects (id),
  key text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  description text NOT NULL DEFAULT '',
  document_kind text NOT NULL CHECK (document_kind IN ('specification', 'report', 'drawing', 'datasheet', 'standard', 'minutes', 'image', 'model-file', 'other')),
  lifecycle text NOT NULL DEFAULT 'working' CHECK (lifecycle IN ('working', 'in-review', 'released', 'superseded', 'retired')),
  current_version integer NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  UNIQUE (project_id, key)
);

CREATE TABLE projects.document_versions (
  document_id uuid NOT NULL REFERENCES projects.documents (id),
  version integer NOT NULL CHECK (version >= 1),
  blob_key text NOT NULL REFERENCES projects.blobs (key),
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  media_type text NOT NULL,
  note text NOT NULL DEFAULT '',
  uploaded_at timestamptz NOT NULL,
  uploaded_by text NOT NULL,
  PRIMARY KEY (document_id, version)
);
CREATE TRIGGER document_versions_immutable BEFORE UPDATE OR DELETE ON projects.document_versions FOR EACH ROW EXECUTE FUNCTION projects.refuse_change();

-- ---- audit, outbox, idempotency ---------------------------------------------------------------------------

CREATE TABLE projects.audit_events (
  id bigserial PRIMARY KEY,
  project_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  revision integer,
  actor text NOT NULL,
  occurred_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '',
  source_kind text NOT NULL DEFAULT 'user',
  conversation_id text,
  proposal_id text,
  message_id text,
  details jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_events_project ON projects.audit_events (project_id, id);
CREATE INDEX audit_events_entity ON projects.audit_events (entity_id, id);
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON projects.audit_events FOR EACH ROW EXECUTE FUNCTION projects.refuse_change();
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON projects.audit_events FOR EACH STATEMENT EXECUTE FUNCTION projects.refuse_change();

CREATE TABLE projects.outbox (
  seq bigserial PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  project_id text NOT NULL,
  type text NOT NULL,
  entity_id text NOT NULL,
  committed_revision integer NOT NULL,
  occurred_at timestamptz NOT NULL,
  actor text NOT NULL,
  published_at timestamptz,
  delivery_seq bigint UNIQUE
);
CREATE SEQUENCE projects.outbox_delivery_seq;
CREATE INDEX outbox_project_seq ON projects.outbox (project_id, seq);
CREATE INDEX outbox_unpublished ON projects.outbox (seq) WHERE published_at IS NULL;
CREATE INDEX outbox_published_at ON projects.outbox (published_at) WHERE published_at IS NOT NULL;

CREATE FUNCTION projects.outbox_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('projects_outbox', NEW.seq::text);
  RETURN NEW;
END
$$;
CREATE TRIGGER outbox_notify AFTER INSERT ON projects.outbox FOR EACH ROW EXECUTE FUNCTION projects.outbox_notify();

CREATE TABLE projects.idempotency_keys (
  actor text NOT NULL,
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 200),
  request_hash text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  response_body jsonb,
  response_etag text,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (actor, key)
);
CREATE INDEX idempotency_keys_created ON projects.idempotency_keys (created_at);

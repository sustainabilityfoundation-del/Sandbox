-- Requirements Management: initial schema (owned by @ews/requirements-service).
-- Other modules never read these tables; they use the public API (contracts §2, ADR-0011).
--
-- Deletion policy (explicit):
--   * Requirements, revisions, relationships, reviews, baselines, comments, audit events, outbox
--     rows, lifecycle events and quality dismissals are never deleted through the application.
--     Requirements are archived; relationships are marked deleted with a new revision.
--   * Foreign keys use ON DELETE RESTRICT so an accidental delete fails instead of cascading.
--   * Collection nodes may be removed (structure edits); every structure change is audited and
--     baselines keep their own copy of the structure.
--   * Idempotency records expire after 24 hours and may be purged.
--   * Immutable tables are protected by triggers that refuse UPDATE, DELETE and TRUNCATE.

CREATE SCHEMA IF NOT EXISTS requirements;

CREATE FUNCTION requirements.refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on %.% is not permitted: the records are immutable', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$;

-- ---- identity and canonical content ------------------------------------------------------------

CREATE TABLE requirements.key_counters (
  project_id text NOT NULL,
  prefix text NOT NULL,
  next_value integer NOT NULL CHECK (next_value >= 1),
  PRIMARY KEY (project_id, prefix)
);

CREATE TABLE requirements.requirements (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  key text NOT NULL CHECK (key ~ '^[A-Za-z][A-Za-z0-9_.-]{0,39}$'),
  current_revision integer NOT NULL CHECK (current_revision >= 1),
  status text NOT NULL CHECK (status IN ('draft', 'in-review', 'approved', 'retired')),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  -- Bumped by every committed change to the record (content, lifecycle, archive). Not the content revision.
  record_version integer NOT NULL DEFAULT 1,
  UNIQUE (project_id, key)
);
CREATE INDEX requirements_project_key ON requirements.requirements (project_id, key, id);
CREATE INDEX requirements_project_status ON requirements.requirements (project_id, status);

CREATE TABLE requirements.requirement_revisions (
  requirement_id uuid NOT NULL REFERENCES requirements.requirements (id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision >= 1),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  statement text NOT NULL CHECK (char_length(statement) <= 20000),
  -- Sanitised XHTML rich text (from ReqIF); the plain statement stays authoritative for search and checks.
  statement_xhtml text,
  rationale text NOT NULL DEFAULT '' CHECK (char_length(rationale) <= 20000),
  type text NOT NULL CHECK (char_length(type) BETWEEN 1 AND 60),
  source text NOT NULL DEFAULT '' CHECK (char_length(source) <= 2000),
  owner text CHECK (char_length(owner) <= 200),
  priority text CHECK (priority IN ('high', 'medium', 'low')),
  applicability text[] NOT NULL DEFAULT '{}',
  verification_methods text[] NOT NULL DEFAULT '{}',
  acceptance_criteria text NOT NULL DEFAULT '' CHECK (char_length(acceptance_criteria) <= 20000),
  -- Typed values keyed by attribute definition ID; validated by the service against the definitions.
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  -- Lifecycle status when this revision was created (lifecycle events record later changes).
  status_at_creation text NOT NULL CHECK (status_at_creation IN ('draft', 'in-review', 'approved', 'retired')),
  change_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  search_document tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', title || ' ' || statement || ' ' || rationale || ' ' || source || ' ' || acceptance_criteria)
  ) STORED,
  PRIMARY KEY (requirement_id, revision)
);
CREATE INDEX requirement_revisions_search ON requirements.requirement_revisions USING gin (search_document);
CREATE TRIGGER requirement_revisions_immutable BEFORE UPDATE OR DELETE ON requirements.requirement_revisions
  FOR EACH ROW EXECUTE FUNCTION requirements.refuse_change();
CREATE TRIGGER requirement_revisions_no_truncate BEFORE TRUNCATE ON requirements.requirement_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION requirements.refuse_change();

ALTER TABLE requirements.requirements
  ADD CONSTRAINT requirements_current_revision_fk FOREIGN KEY (id, current_revision)
  REFERENCES requirements.requirement_revisions (requirement_id, revision) DEFERRABLE INITIALLY DEFERRED;

-- Legacy twin IDs (REQ-001 …) resolve to canonical UUIDs (contracts §3).
CREATE TABLE requirements.requirement_aliases (
  project_id text NOT NULL,
  alias text NOT NULL,
  requirement_id uuid NOT NULL REFERENCES requirements.requirements (id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('legacy-twin-id')),
  PRIMARY KEY (project_id, alias)
);
CREATE INDEX requirement_aliases_requirement ON requirements.requirement_aliases (requirement_id);

CREATE TABLE requirements.lifecycle_events (
  id uuid PRIMARY KEY,
  requirement_id uuid NOT NULL,
  revision integer NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL CHECK (to_status IN ('draft', 'in-review', 'approved', 'retired')),
  review_id uuid,
  actor text NOT NULL,
  occurred_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '',
  FOREIGN KEY (requirement_id, revision) REFERENCES requirements.requirement_revisions (requirement_id, revision) ON DELETE RESTRICT
);
CREATE INDEX lifecycle_events_requirement ON requirements.lifecycle_events (requirement_id, occurred_at);
CREATE TRIGGER lifecycle_events_immutable BEFORE UPDATE OR DELETE ON requirements.lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION requirements.refuse_change();

-- ---- custom attributes --------------------------------------------------------------------------

CREATE TABLE requirements.attribute_definitions (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_.-]{0,59}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  data_type text NOT NULL CHECK (data_type IN ('string', 'integer', 'real', 'boolean', 'date', 'enumeration', 'xhtml')),
  multi_valued boolean NOT NULL DEFAULT false CHECK (NOT multi_valued OR data_type = 'enumeration'),
  min_value numeric,
  max_value numeric,
  max_length integer CHECK (max_length > 0),
  required boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  UNIQUE (project_id, key),
  CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value)
);

CREATE TABLE requirements.attribute_enum_values (
  id uuid PRIMARY KEY,
  definition_id uuid NOT NULL REFERENCES requirements.attribute_definitions (id) ON DELETE RESTRICT,
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 120),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  position integer NOT NULL,
  archived boolean NOT NULL DEFAULT false,
  UNIQUE (definition_id, key)
);

-- ---- collections (documents), headings, membership and order -------------------------------------
-- Document hierarchy never implies derivation or decomposition (contracts §2).

CREATE TABLE requirements.collections (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'document' CHECK (kind IN ('document', 'set')),
  revision integer NOT NULL DEFAULT 1,
  structure_revision integer NOT NULL DEFAULT 1,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  UNIQUE (project_id, name)
);

CREATE TABLE requirements.collection_nodes (
  id uuid PRIMARY KEY,
  collection_id uuid NOT NULL REFERENCES requirements.collections (id) ON DELETE RESTRICT,
  parent_id uuid REFERENCES requirements.collection_nodes (id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position >= 0),
  kind text NOT NULL CHECK (kind IN ('heading', 'requirement')),
  heading text CHECK (char_length(heading) BETWEEN 1 AND 300),
  requirement_id uuid REFERENCES requirements.requirements (id) ON DELETE RESTRICT,
  CHECK ((kind = 'heading' AND heading IS NOT NULL AND requirement_id IS NULL)
      OR (kind = 'requirement' AND requirement_id IS NOT NULL AND heading IS NULL)),
  UNIQUE (collection_id, requirement_id),
  CONSTRAINT collection_nodes_order UNIQUE NULLS NOT DISTINCT (collection_id, parent_id, position) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX collection_nodes_requirement ON requirements.collection_nodes (requirement_id);
CREATE INDEX collection_nodes_parent ON requirements.collection_nodes (collection_id, parent_id, position);

-- ---- relationships ------------------------------------------------------------------------------
-- derives-from, decomposes, depends-on: requirement → requirement (from = lower level / dependent).
-- allocated-to: requirement → twin component ID (validated through the platform twin directory).
-- references, satisfies (SysML) and verifies (verification artifacts) are stored in the shared twin.

CREATE TABLE requirements.relationships (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('derives-from', 'decomposes', 'depends-on', 'allocated-to')),
  from_requirement_id uuid NOT NULL REFERENCES requirements.requirements (id) ON DELETE RESTRICT,
  to_requirement_id uuid REFERENCES requirements.requirements (id) ON DELETE RESTRICT,
  to_twin_id text CHECK (char_length(to_twin_id) BETWEEN 1 AND 100),
  current_revision integer NOT NULL DEFAULT 1,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  CHECK ((to_requirement_id IS NULL) <> (to_twin_id IS NULL)),
  CHECK ((type = 'allocated-to') = (to_twin_id IS NOT NULL)),
  CHECK (to_requirement_id IS DISTINCT FROM from_requirement_id)
);
CREATE UNIQUE INDEX relationships_unique_active ON requirements.relationships
  (type, from_requirement_id, coalesce(to_requirement_id::text, to_twin_id)) WHERE NOT deleted;
CREATE INDEX relationships_from ON requirements.relationships (from_requirement_id) WHERE NOT deleted;
CREATE INDEX relationships_to ON requirements.relationships (to_requirement_id) WHERE NOT deleted;
CREATE INDEX relationships_to_twin ON requirements.relationships (project_id, to_twin_id) WHERE NOT deleted;

CREATE TABLE requirements.relationship_revisions (
  relationship_id uuid NOT NULL REFERENCES requirements.relationships (id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision >= 1),
  deleted boolean NOT NULL,
  rationale text NOT NULL DEFAULT '',
  -- Revisions of the requirement endpoints when this relationship revision was made.
  from_requirement_revision integer NOT NULL,
  to_requirement_revision integer,
  change_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  PRIMARY KEY (relationship_id, revision)
);
CREATE TRIGGER relationship_revisions_immutable BEFORE UPDATE OR DELETE ON requirements.relationship_revisions
  FOR EACH ROW EXECUTE FUNCTION requirements.refuse_change();

-- ---- reviews and comments -----------------------------------------------------------------------

CREATE TABLE requirements.reviews (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  requirement_id uuid NOT NULL,
  requirement_revision integer NOT NULL,
  state text NOT NULL CHECK (state IN ('open', 'approved', 'rejected', 'withdrawn', 'superseded')),
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL,
  note text NOT NULL DEFAULT '',
  closed_by text,
  closed_at timestamptz,
  FOREIGN KEY (requirement_id, requirement_revision) REFERENCES requirements.requirement_revisions (requirement_id, revision) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX reviews_one_open ON requirements.reviews (requirement_id) WHERE state = 'open';

CREATE TABLE requirements.review_decisions (
  id uuid PRIMARY KEY,
  review_id uuid NOT NULL REFERENCES requirements.reviews (id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approve', 'reject', 'comment')),
  comment text NOT NULL DEFAULT '',
  decided_by text NOT NULL,
  decided_at timestamptz NOT NULL
);
CREATE TRIGGER review_decisions_immutable BEFORE UPDATE OR DELETE ON requirements.review_decisions
  FOR EACH ROW EXECUTE FUNCTION requirements.refuse_change();

CREATE TABLE requirements.comments (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  requirement_id uuid NOT NULL,
  revision integer NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  author text NOT NULL,
  created_at timestamptz NOT NULL,
  FOREIGN KEY (requirement_id, revision) REFERENCES requirements.requirement_revisions (requirement_id, revision) ON DELETE RESTRICT
);
CREATE INDEX comments_requirement ON requirements.comments (requirement_id, created_at);
CREATE TRIGGER comments_immutable BEFORE UPDATE OR DELETE ON requirements.comments
  FOR EACH ROW EXECUTE FUNCTION requirements.refuse_change();

CREATE TABLE requirements.external_references (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  requirement_id uuid NOT NULL REFERENCES requirements.requirements (id) ON DELETE RESTRICT,
  system text NOT NULL CHECK (char_length(system) BETWEEN 1 AND 200),
  external_id text NOT NULL CHECK (char_length(external_id) BETWEEN 1 AND 500),
  url text CHECK (url ~ '^https?://'),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (requirement_id, system, external_id)
);

-- ---- baselines (immutable) ------------------------------------------------------------------------

CREATE TABLE requirements.baselines (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  configuration_id text,
  -- NULL: the whole project; otherwise only requirements in the listed collections.
  scope_collection_ids uuid[],
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (project_id, name)
);
CREATE TRIGGER baselines_immutable BEFORE UPDATE OR DELETE ON requirements.baselines
  FOR EACH ROW EXECUTE FUNCTION requirements.refuse_change();

CREATE TABLE requirements.baseline_requirements (
  baseline_id uuid NOT NULL REFERENCES requirements.baselines (id) ON DELETE RESTRICT,
  requirement_id uuid NOT NULL,
  revision integer NOT NULL,
  key text NOT NULL,
  status text NOT NULL,
  archived boolean NOT NULL,
  PRIMARY KEY (baseline_id, requirement_id),
  FOREIGN KEY (requirement_id, revision) REFERENCES requirements.requirement_revisions (requirement_id, revision) ON DELETE RESTRICT
);
CREATE TRIGGER baseline_requirements_immutable BEFORE UPDATE OR DELETE ON requirements.baseline_requirements
  FOR EACH ROW EXECUTE FUNCTION requirements.refuse_change();

CREATE TABLE requirements.baseline_relationships (
  baseline_id uuid NOT NULL REFERENCES requirements.baselines (id) ON DELETE RESTRICT,
  relationship_id uuid NOT NULL,
  revision integer NOT NULL,
  PRIMARY KEY (baseline_id, relationship_id),
  FOREIGN KEY (relationship_id, revision) REFERENCES requirements.relationship_revisions (relationship_id, revision) ON DELETE RESTRICT
);
CREATE TRIGGER baseline_relationships_immutable BEFORE UPDATE OR DELETE ON requirements.baseline_relationships
  FOR EACH ROW EXECUTE FUNCTION requirements.refuse_change();

CREATE TABLE requirements.baseline_collections (
  baseline_id uuid NOT NULL REFERENCES requirements.baselines (id) ON DELETE RESTRICT,
  collection_id uuid NOT NULL REFERENCES requirements.collections (id) ON DELETE RESTRICT,
  name text NOT NULL,
  structure_revision integer NOT NULL,
  PRIMARY KEY (baseline_id, collection_id)
);
CREATE TRIGGER baseline_collections_immutable BEFORE UPDATE OR DELETE ON requirements.baseline_collections
  FOR EACH ROW EXECUTE FUNCTION requirements.refuse_change();

CREATE TABLE requirements.baseline_collection_nodes (
  baseline_id uuid NOT NULL REFERENCES requirements.baselines (id) ON DELETE RESTRICT,
  node_id uuid NOT NULL,
  collection_id uuid NOT NULL,
  parent_id uuid,
  position integer NOT NULL,
  kind text NOT NULL,
  heading text,
  requirement_id uuid,
  PRIMARY KEY (baseline_id, node_id)
);
CREATE TRIGGER baseline_collection_nodes_immutable BEFORE UPDATE OR DELETE ON requirements.baseline_collection_nodes
  FOR EACH ROW EXECUTE FUNCTION requirements.refuse_change();

-- ---- audit, outbox and idempotency ------------------------------------------------------------------

CREATE TABLE requirements.audit_events (
  id bigserial PRIMARY KEY,
  project_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  revision integer,
  actor text NOT NULL,
  occurred_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_events_entity ON requirements.audit_events (project_id, entity_id, id);
CREATE INDEX audit_events_project ON requirements.audit_events (project_id, id);
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON requirements.audit_events
  FOR EACH ROW EXECUTE FUNCTION requirements.refuse_change();
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON requirements.audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION requirements.refuse_change();

-- Transactional outbox: written in the same transaction as the change; published only after commit.
CREATE TABLE requirements.outbox (
  seq bigserial PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  project_id text NOT NULL,
  type text NOT NULL,
  entity_id text NOT NULL,
  committed_revision integer NOT NULL,
  configuration_id text,
  occurred_at timestamptz NOT NULL,
  actor text NOT NULL,
  -- Assigned by the single active publisher in commit order; consumers tail by delivery_seq, so a
  -- transaction that commits late cannot be skipped (seq order is not commit order).
  published_at timestamptz,
  delivery_seq bigint UNIQUE
);
CREATE SEQUENCE requirements.outbox_delivery_seq;
CREATE INDEX outbox_project_seq ON requirements.outbox (project_id, seq);
CREATE INDEX outbox_unpublished ON requirements.outbox (seq) WHERE published_at IS NULL;

CREATE FUNCTION requirements.outbox_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Delivered by PostgreSQL only when the inserting transaction commits.
  PERFORM pg_notify('requirements_outbox', NEW.seq::text);
  RETURN NEW;
END
$$;
CREATE TRIGGER outbox_notify AFTER INSERT ON requirements.outbox FOR EACH ROW EXECUTE FUNCTION requirements.outbox_notify();

CREATE TABLE requirements.idempotency_keys (
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
CREATE INDEX idempotency_keys_created ON requirements.idempotency_keys (created_at);

-- ---- exchange (ReqIF, JSON): sources, mappings, jobs, attachments ------------------------------------

CREATE TABLE requirements.exchange_sources (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  format text NOT NULL CHECK (format IN ('reqif', 'json')),
  source_key text NOT NULL CHECK (char_length(source_key) BETWEEN 1 AND 500),
  name text NOT NULL,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (project_id, format, source_key)
);

CREATE TABLE requirements.external_mappings (
  source_id uuid NOT NULL REFERENCES requirements.exchange_sources (id) ON DELETE RESTRICT,
  external_kind text NOT NULL,
  external_id text NOT NULL CHECK (char_length(external_id) BETWEEN 1 AND 1000),
  internal_kind text NOT NULL,
  internal_id text,
  -- External LAST-CHANGE and local revision at the last successful import or export.
  external_last_change timestamptz,
  internal_revision integer,
  -- Unmapped content kept for re-export (selective JSONB).
  preserved jsonb,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (source_id, external_kind, external_id)
);
CREATE UNIQUE INDEX external_mappings_internal ON requirements.external_mappings (source_id, external_kind, internal_id) WHERE internal_id IS NOT NULL;

CREATE TABLE requirements.attachments (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  media_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  storage_key text NOT NULL,
  original_name text NOT NULL,
  requirement_id uuid REFERENCES requirements.requirements (id) ON DELETE RESTRICT,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL
);
CREATE INDEX attachments_requirement ON requirements.attachments (requirement_id);

CREATE TABLE requirements.import_jobs (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  format text NOT NULL CHECK (format IN ('reqif', 'json')),
  status text NOT NULL CHECK (status IN ('previewed', 'applied', 'failed', 'discarded')),
  file_name text NOT NULL,
  sha256 text NOT NULL,
  byte_size bigint NOT NULL,
  source_id uuid REFERENCES requirements.exchange_sources (id) ON DELETE RESTRICT,
  source_key text,
  storage_key text NOT NULL,
  preview jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  applied_at timestamptz,
  applied_by text
);
CREATE INDEX import_jobs_project ON requirements.import_jobs (project_id, created_at DESC);

CREATE TABLE requirements.export_jobs (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  format text NOT NULL CHECK (format IN ('reqif', 'reqifz', 'json')),
  request jsonb NOT NULL,
  report jsonb NOT NULL,
  storage_key text NOT NULL,
  file_name text NOT NULL,
  media_type text NOT NULL,
  byte_size bigint NOT NULL,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL
);

-- ---- saved views and quality ------------------------------------------------------------------------

CREATE TABLE requirements.saved_views (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  owner text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  shared boolean NOT NULL DEFAULT false,
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  revision integer NOT NULL DEFAULT 1,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX saved_views_name ON requirements.saved_views (project_id, owner, name) WHERE NOT deleted;

CREATE TABLE requirements.quality_conventions (
  project_id text PRIMARY KEY,
  settings jsonb NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL
);

CREATE TABLE requirements.quality_dismissals (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  requirement_id uuid NOT NULL,
  revision integer NOT NULL,
  rule_id text NOT NULL,
  fingerprint text NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000),
  dismissed_by text NOT NULL,
  dismissed_at timestamptz NOT NULL,
  FOREIGN KEY (requirement_id, revision) REFERENCES requirements.requirement_revisions (requirement_id, revision) ON DELETE RESTRICT,
  UNIQUE (requirement_id, revision, rule_id, fingerprint)
);
CREATE TRIGGER quality_dismissals_immutable BEFORE UPDATE OR DELETE ON requirements.quality_dismissals
  FOR EACH ROW EXECUTE FUNCTION requirements.refuse_change();

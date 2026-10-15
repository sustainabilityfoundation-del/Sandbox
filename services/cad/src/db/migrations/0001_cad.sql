-- CAD Modeler document store (schema `cad`): native ews-cad documents with immutable revisions,
-- idempotency records and the transactional outbox. docs/modules/cad/service.md.
-- Only services/cad reads or writes this schema.

CREATE SCHEMA IF NOT EXISTS cad;

CREATE TABLE cad.documents (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  current_revision integer NOT NULL CHECK (current_revision > 0),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL
);
CREATE INDEX documents_project ON cad.documents (project_id, updated_at DESC);

-- One row per saved state. Rows are never updated or deleted (trigger below).
CREATE TABLE cad.document_revisions (
  document_id uuid NOT NULL REFERENCES cad.documents (id),
  revision integer NOT NULL CHECK (revision > 0),
  content jsonb NOT NULL,
  format_version text NOT NULL,
  -- The engine's own document version (ews-cad `version`) at save time.
  model_version integer NOT NULL,
  title text NOT NULL,
  part_count integer NOT NULL,
  feature_count integer NOT NULL,
  content_hash text NOT NULL,
  message text NOT NULL DEFAULT '',
  actor text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('user', 'assistant', 'import', 'system')),
  conversation_id text,
  proposal_id text,
  message_id text,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (document_id, revision)
);

CREATE FUNCTION cad.refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'cad.document_revisions is append-only' USING ERRCODE = '23001';
END $$;
CREATE TRIGGER document_revisions_immutable BEFORE UPDATE OR DELETE ON cad.document_revisions
  FOR EACH ROW EXECUTE FUNCTION cad.refuse_change();

CREATE TABLE cad.idempotency_keys (
  actor text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  response_body jsonb,
  response_etag text,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (actor, key)
);

CREATE TABLE cad.outbox (
  seq bigserial PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  project_id text NOT NULL,
  type text NOT NULL,
  document_id uuid NOT NULL,
  revision integer,
  occurred_at timestamptz NOT NULL,
  actor text NOT NULL,
  source_kind text NOT NULL,
  published_at timestamptz,
  delivery_seq bigint UNIQUE
);
CREATE SEQUENCE cad.outbox_delivery_seq;
CREATE INDEX outbox_unpublished ON cad.outbox (seq) WHERE published_at IS NULL;
CREATE INDEX outbox_project_delivery ON cad.outbox (project_id, delivery_seq);

-- SysML Modeler repository (schema `sysml`), aligned with the OMG Systems Modeling API resource model:
-- projects, commits (immutable change sets of element versions), branches and tags.
-- docs/modules/sysml/semantic-model.md §6. Only services/sysml reads or writes this schema.

CREATE SCHEMA IF NOT EXISTS sysml;

CREATE TABLE sysml.projects (
  id uuid PRIMARY KEY,
  platform_project_id text NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  root_element_id uuid NOT NULL,
  default_branch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL
);
CREATE INDEX projects_platform ON sysml.projects (platform_project_id);

CREATE TABLE sysml.commits (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES sysml.projects (id),
  number integer NOT NULL CHECK (number > 0),
  parent_ids uuid[] NOT NULL DEFAULT '{}',
  branch_id uuid,
  actor text NOT NULL,
  source jsonb NOT NULL DEFAULT '{"kind":"user"}',
  description text NOT NULL DEFAULT '',
  commands jsonb NOT NULL DEFAULT '[]',
  change_count integer NOT NULL DEFAULT 0,
  summary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, number)
);

CREATE TABLE sysml.element_versions (
  version_id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES sysml.projects (id),
  element_id uuid NOT NULL,
  commit_id uuid NOT NULL REFERENCES sysml.commits (id),
  commit_number integer NOT NULL,
  metaclass text NOT NULL,
  name text,
  owner_id uuid,
  -- Standard JSON of the element (KerML §10.4, stored attributes only); NULL marks a deletion.
  payload jsonb
);
CREATE INDEX element_versions_history ON sysml.element_versions (project_id, element_id, commit_number DESC);
CREATE INDEX element_versions_commit ON sysml.element_versions (commit_id);

CREATE TABLE sysml.branches (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES sysml.projects (id),
  name text NOT NULL CHECK (name ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$'),
  head_commit_id uuid REFERENCES sysml.commits (id),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  UNIQUE (project_id, name)
);
ALTER TABLE sysml.projects ADD CONSTRAINT projects_default_branch FOREIGN KEY (default_branch_id) REFERENCES sysml.branches (id) DEFERRABLE INITIALLY DEFERRED;

-- Head index: the current version of every live element of a branch (rebuildable from history).
CREATE TABLE sysml.branch_elements (
  branch_id uuid NOT NULL REFERENCES sysml.branches (id),
  element_id uuid NOT NULL,
  version_id uuid NOT NULL REFERENCES sysml.element_versions (version_id),
  metaclass text NOT NULL,
  name text,
  owner_id uuid,
  PRIMARY KEY (branch_id, element_id)
);
CREATE INDEX branch_elements_metaclass ON sysml.branch_elements (branch_id, metaclass);
CREATE INDEX branch_elements_name ON sysml.branch_elements (branch_id, lower(name));
CREATE INDEX branch_elements_owner ON sysml.branch_elements (branch_id, owner_id);

-- Cross references of each version (who references X), for impact analysis at heads.
CREATE TABLE sysml.element_refs (
  version_id uuid NOT NULL REFERENCES sysml.element_versions (version_id),
  target_id uuid NOT NULL,
  property text NOT NULL
);
CREATE INDEX element_refs_target ON sysml.element_refs (target_id);
CREATE INDEX element_refs_version ON sysml.element_refs (version_id);

CREATE TABLE sysml.tags (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES sysml.projects (id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  commit_id uuid NOT NULL REFERENCES sysml.commits (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  UNIQUE (project_id, name)
);

CREATE TABLE sysml.outbox (
  seq bigserial PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  project_id uuid NOT NULL,
  type text NOT NULL,
  entity_id uuid NOT NULL,
  commit_number integer,
  branch_id uuid,
  occurred_at timestamptz NOT NULL,
  actor text NOT NULL,
  published_at timestamptz,
  delivery_seq bigint UNIQUE
);
CREATE SEQUENCE sysml.outbox_delivery_seq;
CREATE INDEX outbox_unpublished ON sysml.outbox (seq) WHERE published_at IS NULL;
CREATE INDEX outbox_project_delivery ON sysml.outbox (project_id, delivery_seq);

CREATE TABLE sysml.idempotency_keys (
  actor text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  response_body jsonb,
  response_etag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor, key)
);

-- History is append-only: commits and element versions are never changed or deleted.
CREATE FUNCTION sysml.refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sysml history is append-only (% on %)', TG_OP, TG_TABLE_NAME USING ERRCODE = '23001';
END $$;
CREATE TRIGGER commits_append_only BEFORE UPDATE OR DELETE ON sysml.commits FOR EACH ROW EXECUTE FUNCTION sysml.refuse_change();
CREATE TRIGGER element_versions_append_only BEFORE UPDATE OR DELETE ON sysml.element_versions FOR EACH ROW EXECUTE FUNCTION sysml.refuse_change();

# Schema design: PostgreSQL schema `projects`

Status: **Proposed**; migration `0001` (registry, lifecycle, work items, milestones, documents, audit, outbox)
is built in phase B inside `services/projects` because it does not depend on the open decisions.
Tables for product structure (ADR-0063), baselines and the module consumer are later, additive migrations.
Index: [README.md](README.md).

## 1. Rules

- Only `services/projects` reads or writes schema `projects`. Other modules use the API or SDK.
- Migrations are append-only `NNNN_*.sql`, checksummed (same runner as Conceptualize). Never rewrite or delete
  user data (ADR-0009). Fix forward.
- Foreign keys `ON DELETE RESTRICT`. Nothing is deleted through the application except expired idempotency
  records, delivered outbox rows after retention and, later, an explicit audited purge (ADR-0065).
- Immutable tables (revisions, document versions, audit events, baseline entries) are protected by a
  trigger refusing UPDATE, DELETE and TRUNCATE (`projects.refuse_change()`).
- Every mutable row has `revision integer` (optimistic concurrency, ETag) and `created_*`/`updated_*`.
- `project_id text` everywhere (UUID text for new projects, `PRJ-ACT100` for the legacy one), matching the
  other services and `platform.project_memberships.project_id`. No cross-schema foreign keys: membership is
  written through the platform port, and other schemas are never referenced.

## 2. Tables (migration 0001)

```sql
CREATE TABLE projects.projects (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_.-]{1,100}$'),
  key text NOT NULL CHECK (key ~ '^[A-Z][A-Z0-9-]{1,19}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  objectives jsonb NOT NULL DEFAULT '[]',
  scope text NOT NULL DEFAULT '',
  disciplines text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','on-hold','completed','cancelled')),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','archived','deleted')),
  template_id text NOT NULL DEFAULT 'blank',
  owner_id text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  legacy boolean NOT NULL DEFAULT false,          -- PRJ-ACT100 registered from existing data
  archived_at timestamptz, deleted_at timestamptz, purge_after timestamptz,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL
);
CREATE UNIQUE INDEX projects_key ON projects.projects (upper(key));   -- unique among all states

-- Immutable snapshot per project revision (history, audit, export).
CREATE TABLE projects.project_revisions (
  project_id text NOT NULL REFERENCES projects.projects (id),
  revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_at timestamptz NOT NULL, changed_by text NOT NULL,
  summary text NOT NULL DEFAULT '',
  source_kind text NOT NULL, conversation_id text, proposal_id text,
  PRIMARY KEY (project_id, revision)
);

-- What was asked for at creation (template, requested settings, modules): provenance, not a settings store.
CREATE TABLE projects.creation_records (
  project_id text PRIMARY KEY REFERENCES projects.projects (id),
  template_id text NOT NULL, template_version integer NOT NULL,
  requested jsonb NOT NULL,                        -- the CreateProject body
  duplicated_from text, imported_from jsonb,        -- package manifest summary for imports
  created_at timestamptz NOT NULL, created_by text NOT NULL
);

CREATE TABLE projects.module_states (
  project_id text NOT NULL REFERENCES projects.projects (id),
  module text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL CHECK (status IN ('pending','provisioned','not-needed','failed','unavailable')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (project_id, module)
);

CREATE TABLE projects.recent_projects (               -- per-user convenience, not engineering data
  user_id text NOT NULL, project_id text NOT NULL REFERENCES projects.projects (id),
  opened_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, project_id)
);

CREATE TABLE projects.key_counters (project_id text, prefix text, next_value integer, PRIMARY KEY (project_id, prefix));

-- ---- artifact registry ----------------------------------------------------------------
CREATE TABLE projects.artifacts (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects.projects (id),
  module text NOT NULL, kind text NOT NULL, native_id text NOT NULL,
  category text NOT NULL,
  key text NOT NULL, title text NOT NULL,
  lifecycle text NOT NULL CHECK (lifecycle IN ('working','in-review','released','superseded','retired')),
  module_state text,
  version_value text NOT NULL, version_label text, version_at timestamptz NOT NULL,
  container_id uuid REFERENCES projects.artifacts (id),
  availability text NOT NULL DEFAULT 'available' CHECK (availability IN ('available','module-unavailable','missing-in-module')),
  source text NOT NULL DEFAULT 'module' CHECK (source IN ('module','projects','client-attested','import')),
  open_link jsonb,
  created_at timestamptz NOT NULL, created_by text NOT NULL,
  modified_at timestamptz NOT NULL, modified_by text NOT NULL,
  confirmed_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  UNIQUE (project_id, module, kind, native_id)
);
CREATE INDEX artifacts_list ON projects.artifacts (project_id, category, lower(title));
CREATE INDEX artifacts_search ON projects.artifacts USING gin (to_tsvector('simple', key || ' ' || title));

-- Append-only observations of a registry record (versions seen, lifecycle, availability changes).
CREATE TABLE projects.artifact_observations (
  id bigserial PRIMARY KEY,
  artifact_id uuid NOT NULL REFERENCES projects.artifacts (id),
  record_revision integer NOT NULL,
  version_value text NOT NULL, lifecycle text NOT NULL, availability text NOT NULL,
  observed_at timestamptz NOT NULL, via text NOT NULL,   -- event:<eventId> | reconcile | projects | import
  actor text NOT NULL
);

-- ---- links ------------------------------------------------------------------------------
CREATE TABLE projects.links (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects.projects (id),
  type text NOT NULL,
  from_artifact uuid NOT NULL REFERENCES projects.artifacts (id), from_revision text,
  to_artifact uuid NOT NULL REFERENCES projects.artifacts (id), to_revision text,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL, created_by text NOT NULL,
  source_kind text NOT NULL, conversation_id text, proposal_id text,
  removed_at timestamptz, removed_by text, removal_reason text,
  revision integer NOT NULL DEFAULT 1,
  CHECK (from_artifact <> to_artifact)
);
CREATE UNIQUE INDEX links_active ON projects.links (project_id, type, from_artifact, to_artifact) WHERE removed_at IS NULL;

-- ---- work items, milestones ------------------------------------------------------------
CREATE TABLE projects.milestones (
  id uuid PRIMARY KEY, project_id text NOT NULL REFERENCES projects.projects (id),
  key text NOT NULL, name text NOT NULL, description text NOT NULL DEFAULT '',
  due date, status text NOT NULL CHECK (status IN ('planned','in-progress','achieved','missed','cancelled')),
  revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, UNIQUE (project_id, key)
);

CREATE TABLE projects.work_items (
  id uuid PRIMARY KEY, project_id text NOT NULL REFERENCES projects.projects (id),
  key text NOT NULL, kind text NOT NULL CHECK (kind IN ('task','issue','risk')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300), description text NOT NULL DEFAULT '',
  status text NOT NULL, priority text NOT NULL CHECK (priority IN ('low','medium','high','critical')),
  assignee_id text, due date, milestone_id uuid REFERENCES projects.milestones (id),
  details jsonb NOT NULL DEFAULT '{}',              -- risk: likelihood, impact, mitigation, response; issue: severity
  revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL,
  source_kind text NOT NULL DEFAULT 'user', conversation_id text, proposal_id text,
  UNIQUE (project_id, key)
);
CREATE TABLE projects.work_item_revisions (work_item_id uuid REFERENCES projects.work_items (id), revision integer, snapshot jsonb NOT NULL, changed_at timestamptz NOT NULL, changed_by text NOT NULL, PRIMARY KEY (work_item_id, revision));

-- ---- documents ---------------------------------------------------------------------------
CREATE TABLE projects.documents (
  id uuid PRIMARY KEY, project_id text NOT NULL REFERENCES projects.projects (id),
  key text NOT NULL, title text NOT NULL, description text NOT NULL DEFAULT '',
  document_kind text NOT NULL, lifecycle text NOT NULL DEFAULT 'working',
  current_version integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, UNIQUE (project_id, key)
);
CREATE TABLE projects.document_versions (
  document_id uuid NOT NULL REFERENCES projects.documents (id), version integer NOT NULL,
  blob_key text NOT NULL REFERENCES projects.blobs (key),
  file_name text NOT NULL, media_type text NOT NULL, note text NOT NULL DEFAULT '',
  uploaded_at timestamptz NOT NULL, uploaded_by text NOT NULL,
  PRIMARY KEY (document_id, version)
);
-- Blob catalogue: bytes live in the BlobStore; this records that they exist and what they are.
CREATE TABLE projects.blobs (
  key text PRIMARY KEY CHECK (key ~ '^sha256/[0-9a-f]{2}/[0-9a-f]{64}$'),
  sha256 text NOT NULL, byte_size bigint NOT NULL, first_stored_at timestamptz NOT NULL
);

-- ---- audit, outbox, idempotency (Conceptualize pattern) ------------------------------------
CREATE TABLE projects.audit_events (
  id bigserial PRIMARY KEY, project_id text NOT NULL,
  entity_type text NOT NULL, entity_id text NOT NULL, action text NOT NULL, revision integer,
  actor text NOT NULL, occurred_at timestamptz NOT NULL, reason text NOT NULL DEFAULT '',
  source_kind text NOT NULL, conversation_id text, proposal_id text, message_id text,
  details jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE projects.outbox (seq bigserial PRIMARY KEY, event_id uuid UNIQUE NOT NULL, project_id text NOT NULL, type text NOT NULL, entity_id text NOT NULL, committed_revision integer NOT NULL, occurred_at timestamptz NOT NULL, actor text NOT NULL, published_at timestamptz, delivery_seq bigint UNIQUE);
CREATE TABLE projects.idempotency_keys (actor text, key text, request_hash text NOT NULL, method text NOT NULL, path text NOT NULL, status_code integer NOT NULL, response_body jsonb, response_etag text, created_at timestamptz NOT NULL, PRIMARY KEY (actor, key));
```

The full DDL with triggers and indexes is `services/projects/src/db/migrations/0001_projects.sql`.

## 3. Later migrations (additive)

| Migration | Tables | Depends on |
| --- | --- | --- |
| 0002 legacy project | inserts `PRJ-ACT100` (`legacy = true`, key `ACT100`, template `example-actuator`) if absent, owner `ada`; no other row changed | none (can ship in phase B) |
| 0003 registry consumer | `consumed_events (event_id uuid PK, module, consumed_at)`, `reconciliation_runs`, `link_index (project_id, module, type, from_artifact, to_artifact, to_revision, confirmed_at)` (derived; may be truncated and rebuilt: the only non-authoritative table) | ADR-0062 |
| 0004 baselines | `baselines (id, project_id, key, name, kind checkpoint/baseline, status working/released, revision, created_*)`, `baseline_entries (baseline_id, artifact_id, module, version_value, lifecycle, read_at)` immutable, `baseline_sources (baseline_id, module, source_revision, read_at, complete boolean)` | ADR-0062, ADR-0067 |
| 0005 product registry | `product_elements`, `product_element_revisions`, `product_element_aliases (project_id, alias, element_id)`, `breakdowns`, `breakdown_edges` (+ cycle check in the store) | ADR-0063 |
| 0006 interchange | `exchange_jobs (id, project_id, kind export/import, status, manifest jsonb, blob_key, report jsonb, created_*)`, `parked_payloads (project_id, module, format, blob_key)` | ADR-0064 |

## 4. Queries the schema must serve (and the index that serves them)

| Use | Query | Index |
| --- | --- | --- |
| Project Home search/sort/filter | `state`, `status`, `upper(key)`, `lower(name)`, `updated_at` | `projects_key`, plus `(state, updated_at desc)` |
| Explorer by category | `artifacts WHERE project_id, category ORDER BY lower(title)` | `artifacts_list` |
| Text search | `to_tsvector('simple', key||' '||title) @@ plainto_tsquery` | `artifacts_search` |
| Native → global | `(project_id, module, kind, native_id)` | unique constraint |
| Trace/impact | recursive CTE over `links` ∪ `link_index` by `from_artifact`/`to_artifact` | `(project_id, from_artifact)`, `(project_id, to_artifact)` |
| Activity | `audit_events WHERE project_id ORDER BY id DESC` | `(project_id, id)` |

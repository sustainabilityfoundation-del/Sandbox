-- Visualization service (docs/specifications/concept-visualization-contracts.md §1): image generation jobs,
-- registered assets (bytes in the Project Management blob store) and a transactional outbox for job events.

CREATE TABLE visualization.assets (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  blob_key text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  media_type text NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  byte_size integer NOT NULL CHECK (byte_size > 0),
  width integer,
  height integer,
  origin text NOT NULL CHECK (origin IN ('upload', 'generated')),
  job_id uuid,
  test_asset boolean NOT NULL DEFAULT false,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- One asset per content and origin in a project: re-uploading the same bytes returns the existing asset.
CREATE UNIQUE INDEX assets_project_content ON visualization.assets (project_id, sha256, origin);

CREATE TABLE visualization.batches (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE visualization.jobs (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  batch_id uuid REFERENCES visualization.batches (id),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK (state IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  kind text NOT NULL CHECK (kind IN ('illustration')),
  subject jsonb NOT NULL,
  subject_id text NOT NULL,
  subject_revision integer NOT NULL CHECK (subject_revision >= 1),
  instruction text NOT NULL,
  adapter text NOT NULL,
  provider_id text NOT NULL,
  provider_name text NOT NULL,
  provider_method text,
  model text NOT NULL,
  options jsonb NOT NULL,
  reference_assets jsonb NOT NULL DEFAULT '[]',
  purpose text,
  client_ref text,
  provenance jsonb NOT NULL,
  attempt integer NOT NULL DEFAULT 1,
  cancel_requested boolean NOT NULL DEFAULT false,
  error jsonb,
  output_asset_id uuid REFERENCES visualization.assets (id),
  revised_prompt text,
  usage jsonb,
  test_asset boolean NOT NULL DEFAULT false,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
-- The idempotency guarantee: one job per derived request key and project.
CREATE UNIQUE INDEX jobs_project_key ON visualization.jobs (project_id, idempotency_key);
CREATE INDEX jobs_pending ON visualization.jobs (created_at) WHERE state = 'pending';
CREATE INDEX jobs_project_subject ON visualization.jobs (project_id, subject_id, created_at);
CREATE INDEX jobs_batch ON visualization.jobs (batch_id);

-- Job events (outbox): written in the transaction of each state change; seq orders delivery.
CREATE TABLE visualization.outbox (
  seq bigserial PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  project_id text NOT NULL,
  job_id uuid NOT NULL,
  batch_id uuid,
  state text NOT NULL,
  subject jsonb NOT NULL,
  client_ref text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_project_seq ON visualization.outbox (project_id, seq);

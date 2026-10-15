-- Registry consumer and reconciliation (ADR-0062, integration milestone 1 C5) and document provenance (D1-PM).
-- Additive only.

-- Module events already applied to the registry (at-least-once delivery; consumers dedupe by event ID).
CREATE TABLE projects.consumed_events (
  event_id text NOT NULL,
  module text NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module, event_id)
);
CREATE INDEX consumed_events_at ON projects.consumed_events (consumed_at);

CREATE TABLE projects.reconciliation_runs (
  id bigserial PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects.projects (id),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  actor text NOT NULL,
  report jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX reconciliation_runs_project ON projects.reconciliation_runs (project_id, id DESC);

-- Where a stored file came from (for example a STEP export: source CAD document and revision, tool and version).
ALTER TABLE projects.document_versions ADD COLUMN provenance jsonb;

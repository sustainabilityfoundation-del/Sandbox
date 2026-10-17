-- Context snapshots (ECII plan Amendment 2, ADR-0085, CE-1): an immutable execution snapshot of the context a model request or a
-- proposal was built from. References with exact revisions plus bounded projections; never a second source of truth and never
-- document bytes. INSERT-ONLY: a trigger refuses UPDATE and DELETE (stale items are flagged when read, never rewritten).
-- Additive: no existing row or constraint changes.

CREATE TABLE assistant.context_snapshots (
  id text PRIMARY KEY,
  schema_version integer NOT NULL DEFAULT 1,
  project_id text NOT NULL,
  actor_id text NOT NULL,
  conversation_id text,
  mode text NOT NULL CHECK (mode IN ('digest', 'full')),
  operation text NOT NULL,
  -- sha256 of the content (task, items, omissions, readiness, budget): an identical assembly is reused, not stored twice.
  content_hash text NOT NULL,
  package jsonb NOT NULL,
  item_count integer NOT NULL,
  estimated_tokens integer NOT NULL,
  bytes integer NOT NULL,
  over_budget boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX context_snapshots_reuse ON assistant.context_snapshots (project_id, actor_id, mode, content_hash);
CREATE INDEX context_snapshots_actor ON assistant.context_snapshots (actor_id, project_id, created_at DESC);

CREATE FUNCTION assistant.context_snapshots_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'assistant.context_snapshots is immutable: snapshots are never updated or deleted' USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
CREATE TRIGGER context_snapshots_no_change BEFORE UPDATE OR DELETE ON assistant.context_snapshots
  FOR EACH ROW EXECUTE FUNCTION assistant.context_snapshots_immutable();
CREATE TRIGGER context_snapshots_no_truncate BEFORE TRUNCATE ON assistant.context_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION assistant.context_snapshots_immutable();

-- The chain artifact -> proposal -> snapshot (usage_events.context_id stays an unconstrained column: the ledger is insert-only and must always record).
ALTER TABLE assistant.proposals ADD CONSTRAINT proposals_context_snapshot FOREIGN KEY (context_id) REFERENCES assistant.context_snapshots (id);

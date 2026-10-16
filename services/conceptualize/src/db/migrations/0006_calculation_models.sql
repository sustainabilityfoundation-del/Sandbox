-- CR-C8 calculation models and verified calculated evidence; C11 storage contract (contract-change-requests.md,
-- "CR-C8 and C11: storage contract"). Additive (ADR-0009).
--
-- calculation_models (CALC-001) with immutable revisions holding the engine definition (@ews/engineering-calc,
-- mathematics.md §2), its digest, assumptions and sources. Validation status lives on the model and is reset by
-- a new revision. Evidence may carry the calculation it was produced by; the service re-verifies the manifest on
-- write and derives the qualifications. Trade scores taken from calculated evidence name the output and keep its
-- qualification. Evidence and scores are immutable, so existing rows are not backfilled.

CREATE TABLE conceptualize.calculation_models (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  key text NOT NULL CHECK (key ~ '^[A-Za-z][A-Za-z0-9_.-]{0,39}$'),
  current_revision integer NOT NULL CHECK (current_revision >= 1),
  validation_status text NOT NULL DEFAULT 'unvalidated' CHECK (validation_status IN ('unvalidated', 'validated', 'deprecated')),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  record_version integer NOT NULL DEFAULT 1,
  UNIQUE (project_id, key)
);

CREATE TABLE conceptualize.calculation_model_revisions (
  model_id uuid NOT NULL REFERENCES conceptualize.calculation_models (id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision >= 1),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  grammar text NOT NULL,
  parameters jsonb NOT NULL CHECK (jsonb_typeof(parameters) = 'array'),
  relations jsonb NOT NULL CHECK (jsonb_typeof(relations) = 'array'),
  validity jsonb,
  basis text NOT NULL CHECK (basis IN ('user-assertion', 'ai-hypothesis', 'assumption', 'assessment', 'estimate', 'calculated', 'evidence', 'decision')),
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(assumptions) = 'array'),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array'),
  library_id text,
  digest text NOT NULL,
  change_reason text NOT NULL DEFAULT '',
  source_kind text NOT NULL CHECK (source_kind IN ('user', 'assistant', 'import', 'system')),
  conversation_id text,
  proposal_id text,
  message_id text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  PRIMARY KEY (model_id, revision)
);
CREATE TRIGGER calculation_model_revisions_immutable BEFORE UPDATE OR DELETE ON conceptualize.calculation_model_revisions FOR EACH ROW EXECUTE FUNCTION conceptualize.refuse_change();

ALTER TABLE conceptualize.calculation_models
  ADD CONSTRAINT calculation_models_current_revision_fk FOREIGN KEY (id, current_revision)
  REFERENCES conceptualize.calculation_model_revisions (model_id, revision) DEFERRABLE INITIALLY DEFERRED;

-- Evidence: { modelId, modelRevision, manifest (verbatim), verification } and qualifications = qualifyManifest(manifest).
ALTER TABLE conceptualize.evidence ADD COLUMN calculation jsonb;
ALTER TABLE conceptualize.evidence ADD CONSTRAINT evidence_calculation_shape
  CHECK (calculation IS NULL OR (calculation ? 'modelId' AND calculation ? 'modelRevision' AND calculation ? 'manifest'));
ALTER TABLE conceptualize.evidence ADD COLUMN qualifications jsonb;

-- Trade scores: { source: 'calculation', evidenceId, symbol, kind, quality? }, copied from the evidence output.
ALTER TABLE conceptualize.trade_scores ADD COLUMN evidence_output text;
ALTER TABLE conceptualize.trade_scores ADD COLUMN qualification jsonb;

-- R1 link vocabulary: calculation models are design records too (depends-on, derived-from endpoints).
UPDATE conceptualize.link_types SET
  from_types = array_append(from_types, 'calculation-model'),
  to_types = array_append(to_types, 'calculation-model')
WHERE builtin AND name IN ('depends-on', 'derived-from') AND NOT ('calculation-model' = ANY (from_types));

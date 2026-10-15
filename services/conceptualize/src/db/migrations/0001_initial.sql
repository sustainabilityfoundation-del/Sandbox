-- Conceptualize: initial schema (owned by @ews/conceptualize-service).
-- Other modules never read these tables; they use the public API or the SDK ConceptsService
-- (docs/specifications/conceptualize-contracts.md, ADR-0015).
--
-- Deletion policy (explicit):
--   * Concepts, revisions, statements, relationships, decisions, trade-study scores, evidence,
--     implementations, artifact references, audit events and outbox rows are never deleted through
--     the application. Concepts are archived or superseded (maturity); relationships, links and
--     artifact references are marked removed with the actor and time.
--   * Foreign keys use ON DELETE RESTRICT so an accidental delete fails instead of cascading.
--   * Idempotency records expire after 24 hours and may be purged.
--   * Immutable tables are protected by triggers that refuse UPDATE, DELETE and TRUNCATE.

CREATE SCHEMA IF NOT EXISTS conceptualize;

CREATE FUNCTION conceptualize.refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on %.% is not permitted: the records are immutable', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$;

CREATE TABLE conceptualize.key_counters (
  project_id text NOT NULL,
  prefix text NOT NULL,
  next_value integer NOT NULL CHECK (next_value >= 1),
  PRIMARY KEY (project_id, prefix)
);

-- ---- concepts --------------------------------------------------------------------------------------

CREATE TABLE conceptualize.concepts (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  key text NOT NULL CHECK (key ~ '^[A-Za-z][A-Za-z0-9_.-]{0,39}$'),
  current_revision integer NOT NULL CHECK (current_revision >= 1),
  -- Maturity, tracked separately from implementation status (derived from implementations) and
  -- verification status. No mandatory sequence (rules in the service).
  maturity text NOT NULL CHECK (maturity IN ('idea', 'exploring', 'defined', 'evaluated', 'selected', 'engineering-development', 'implemented', 'verified', 'superseded', 'archived')),
  verification_status text NOT NULL DEFAULT 'not-verified' CHECK (verification_status IN ('not-verified', 'partially-verified', 'verified', 'failed')),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  record_version integer NOT NULL DEFAULT 1,
  UNIQUE (project_id, key)
);
CREATE INDEX concepts_project_key ON conceptualize.concepts (project_id, key, id);
CREATE INDEX concepts_project_maturity ON conceptualize.concepts (project_id, maturity);

-- Immutable content revisions. Every change of content creates a new row.
CREATE TABLE conceptualize.concept_revisions (
  concept_id uuid NOT NULL REFERENCES conceptualize.concepts (id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision >= 1),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 1000),
  -- Freeform natural-language description (the user's or the assistant's words, kept verbatim).
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 40000),
  purpose text NOT NULL DEFAULT '' CHECK (char_length(purpose) <= 4000),
  abstraction text NOT NULL CHECK (abstraction IN ('function', 'component', 'assembly', 'subsystem', 'system', 'abstract')),
  classifications text[] NOT NULL DEFAULT '{}',
  -- Structured attributes: { name: { value, unit, min?, max?, basis } }; dimensions checked by the service.
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  maturity_at_creation text NOT NULL,
  change_reason text NOT NULL DEFAULT '',
  source_kind text NOT NULL CHECK (source_kind IN ('user', 'assistant', 'import', 'system')),
  conversation_id text,
  proposal_id text,
  message_id text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  search_document tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', name || ' ' || summary || ' ' || description || ' ' || purpose)
  ) STORED,
  PRIMARY KEY (concept_id, revision)
);
CREATE INDEX concept_revisions_search ON conceptualize.concept_revisions USING gin (search_document);
CREATE TRIGGER concept_revisions_immutable BEFORE UPDATE OR DELETE ON conceptualize.concept_revisions
  FOR EACH ROW EXECUTE FUNCTION conceptualize.refuse_change();
CREATE TRIGGER concept_revisions_no_truncate BEFORE TRUNCATE ON conceptualize.concept_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION conceptualize.refuse_change();

ALTER TABLE conceptualize.concepts
  ADD CONSTRAINT concepts_current_revision_fk FOREIGN KEY (id, current_revision)
  REFERENCES conceptualize.concept_revisions (concept_id, revision) DEFERRABLE INITIALLY DEFERRED;

-- Typed statements of design intent, written per revision (copied forward unchanged). The stable
-- statement_id identifies a statement across revisions; the basis says how it is known.
CREATE TABLE conceptualize.concept_statements (
  concept_id uuid NOT NULL,
  revision integer NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  statement_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('function', 'behavior', 'principle', 'effect', 'input', 'output', 'constraint', 'interface', 'mechanism', 'problem', 'capability', 'performance', 'assumption', 'uncertainty', 'question', 'rationale', 'note')),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 4000),
  basis text NOT NULL CHECK (basis IN ('user-assertion', 'ai-hypothesis', 'assumption', 'estimate', 'evidence', 'decision')),
  quantity jsonb CHECK (quantity IS NULL OR jsonb_typeof(quantity) = 'object'),
  -- Open questions and uncertainties: open | resolved. Others: null.
  state text CHECK (state IN ('open', 'resolved')),
  evidence_id uuid,
  decision_id uuid,
  -- Who confirmed an AI hypothesis (explicit user action), when it was confirmed.
  confirmed_by text,
  confirmed_at timestamptz,
  source text NOT NULL DEFAULT '' CHECK (char_length(source) <= 2000),
  PRIMARY KEY (concept_id, revision, ordinal),
  UNIQUE (concept_id, revision, statement_id),
  FOREIGN KEY (concept_id, revision) REFERENCES conceptualize.concept_revisions (concept_id, revision) ON DELETE RESTRICT
);
CREATE INDEX concept_statements_kind ON conceptualize.concept_statements (kind, basis);
CREATE TRIGGER concept_statements_immutable BEFORE UPDATE OR DELETE ON conceptualize.concept_statements
  FOR EACH ROW EXECUTE FUNCTION conceptualize.refuse_change();

CREATE TABLE conceptualize.maturity_events (
  id uuid PRIMARY KEY,
  concept_id uuid NOT NULL,
  revision integer NOT NULL,
  field text NOT NULL CHECK (field IN ('maturity', 'verification-status')),
  from_value text NOT NULL,
  to_value text NOT NULL,
  reason text NOT NULL DEFAULT '',
  actor text NOT NULL,
  occurred_at timestamptz NOT NULL,
  source_kind text NOT NULL,
  conversation_id text,
  proposal_id text,
  FOREIGN KEY (concept_id, revision) REFERENCES conceptualize.concept_revisions (concept_id, revision) ON DELETE RESTRICT
);
CREATE INDEX maturity_events_concept ON conceptualize.maturity_events (concept_id, occurred_at);
CREATE TRIGGER maturity_events_immutable BEFORE UPDATE OR DELETE ON conceptualize.maturity_events
  FOR EACH ROW EXECUTE FUNCTION conceptualize.refuse_change();

-- ---- structure ---------------------------------------------------------------------------------------

-- Named decomposition structures of a parent Concept (alternative decompositions).
CREATE TABLE conceptualize.decompositions (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  parent_id uuid NOT NULL REFERENCES conceptualize.concepts (id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  status text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'preferred', 'rejected')),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  record_version integer NOT NULL DEFAULT 1
);
CREATE INDEX decompositions_parent ON conceptualize.decompositions (parent_id);

CREATE TABLE conceptualize.relationships (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('contains', 'depends-on', 'interfaces-with', 'alternative-to', 'derived-from', 'refines', 'implements', 'conflicts-with', 'replaces')),
  from_id uuid NOT NULL REFERENCES conceptualize.concepts (id) ON DELETE RESTRICT,
  to_id uuid NOT NULL REFERENCES conceptualize.concepts (id) ON DELETE RESTRICT,
  decomposition_id uuid REFERENCES conceptualize.decompositions (id) ON DELETE RESTRICT,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 4000),
  -- Interface definition for interfaces-with: { name, kind, description, flows[] }.
  interface jsonb CHECK (interface IS NULL OR jsonb_typeof(interface) = 'object'),
  basis text NOT NULL DEFAULT 'user-assertion' CHECK (basis IN ('user-assertion', 'ai-hypothesis', 'assumption', 'estimate', 'evidence', 'decision')),
  -- 1 when created, 2 when removed. Removal is recorded, never deleted.
  revision integer NOT NULL DEFAULT 1,
  removed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  removed_at timestamptz,
  removed_by text,
  source_kind text NOT NULL DEFAULT 'user',
  conversation_id text,
  proposal_id text,
  CHECK (from_id <> to_id),
  CHECK (decomposition_id IS NULL OR type = 'contains')
);
CREATE INDEX relationships_from ON conceptualize.relationships (project_id, from_id) WHERE NOT removed;
CREATE INDEX relationships_to ON conceptualize.relationships (project_id, to_id) WHERE NOT removed;
CREATE UNIQUE INDEX relationships_unique_active ON conceptualize.relationships (type, from_id, to_id, COALESCE(decomposition_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE NOT removed;

-- ---- alternatives and decisions ----------------------------------------------------------------------

CREATE TABLE conceptualize.alternative_sets (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  key text NOT NULL,
  parent_id uuid NOT NULL REFERENCES conceptualize.concepts (id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  question text NOT NULL DEFAULT '' CHECK (char_length(question) <= 4000),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  record_version integer NOT NULL DEFAULT 1,
  UNIQUE (project_id, key)
);
CREATE INDEX alternative_sets_parent ON conceptualize.alternative_sets (parent_id);

CREATE TABLE conceptualize.alternative_members (
  set_id uuid NOT NULL REFERENCES conceptualize.alternative_sets (id) ON DELETE RESTRICT,
  concept_id uuid NOT NULL REFERENCES conceptualize.concepts (id) ON DELETE RESTRICT,
  -- Changed only by recorded decisions (or withdrawn while still a candidate).
  status text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'selected', 'rejected', 'deferred', 'withdrawn')),
  decision_id uuid,
  added_at timestamptz NOT NULL,
  added_by text NOT NULL,
  ordinal integer NOT NULL DEFAULT 0,
  PRIMARY KEY (set_id, concept_id)
);
CREATE INDEX alternative_members_concept ON conceptualize.alternative_members (concept_id);

CREATE TABLE conceptualize.decisions (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  key text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  question text NOT NULL DEFAULT '' CHECK (char_length(question) <= 4000),
  rationale text NOT NULL CHECK (char_length(rationale) BETWEEN 1 AND 20000),
  subject_id uuid REFERENCES conceptualize.concepts (id) ON DELETE RESTRICT,
  set_id uuid REFERENCES conceptualize.alternative_sets (id) ON DELETE RESTRICT,
  trade_study_id uuid,
  -- [{ conceptId, outcome: accepted|rejected|deferred, rationale }]
  outcomes jsonb NOT NULL CHECK (jsonb_typeof(outcomes) = 'array'),
  status text NOT NULL CHECK (status IN ('proposed', 'recorded', 'withdrawn')),
  supersedes_id uuid REFERENCES conceptualize.decisions (id) ON DELETE RESTRICT,
  superseded_by_id uuid REFERENCES conceptualize.decisions (id) ON DELETE RESTRICT,
  proposed_by text NOT NULL,
  proposed_at timestamptz NOT NULL,
  recorded_by text,
  recorded_at timestamptz,
  record_version integer NOT NULL DEFAULT 1,
  source_kind text NOT NULL DEFAULT 'user',
  conversation_id text,
  proposal_id text,
  UNIQUE (project_id, key),
  CHECK (subject_id IS NOT NULL OR set_id IS NOT NULL)
);
CREATE INDEX decisions_set ON conceptualize.decisions (set_id);
CREATE INDEX decisions_subject ON conceptualize.decisions (subject_id);
CREATE INDEX decisions_outcomes ON conceptualize.decisions USING gin (outcomes jsonb_path_ops);

-- ---- trade studies -------------------------------------------------------------------------------------

CREATE TABLE conceptualize.trade_studies (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  key text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  set_id uuid REFERENCES conceptualize.alternative_sets (id) ON DELETE RESTRICT,
  -- Incremented by every change of criteria, options or scores (the ETag).
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  UNIQUE (project_id, key)
);
CREATE INDEX trade_studies_set ON conceptualize.trade_studies (set_id);
ALTER TABLE conceptualize.decisions ADD CONSTRAINT decisions_trade_study_fk FOREIGN KEY (trade_study_id) REFERENCES conceptualize.trade_studies (id) ON DELETE RESTRICT;

CREATE TABLE conceptualize.trade_criteria (
  id uuid PRIMARY KEY,
  study_id uuid NOT NULL REFERENCES conceptualize.trade_studies (id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  category text NOT NULL CHECK (category IN ('performance', 'mass', 'cost', 'complexity', 'manufacturability', 'risk', 'custom')),
  description text NOT NULL DEFAULT '',
  weight double precision NOT NULL CHECK (weight >= 0 AND weight <= 1000),
  direction text NOT NULL CHECK (direction IN ('maximize', 'minimize')),
  scale text NOT NULL CHECK (scale IN ('quantity', 'qualitative')),
  unit text,
  ordinal integer NOT NULL DEFAULT 0,
  removed boolean NOT NULL DEFAULT false,
  CHECK (scale = 'qualitative' OR unit IS NOT NULL)
);
CREATE INDEX trade_criteria_study ON conceptualize.trade_criteria (study_id);

CREATE TABLE conceptualize.trade_options (
  study_id uuid NOT NULL REFERENCES conceptualize.trade_studies (id) ON DELETE RESTRICT,
  concept_id uuid NOT NULL REFERENCES conceptualize.concepts (id) ON DELETE RESTRICT,
  ordinal integer NOT NULL DEFAULT 0,
  removed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (study_id, concept_id)
);

-- Append-only scores; the current score of (criterion, concept) is the row with the highest study revision.
CREATE TABLE conceptualize.trade_scores (
  study_id uuid NOT NULL REFERENCES conceptualize.trade_studies (id) ON DELETE RESTRICT,
  criterion_id uuid NOT NULL REFERENCES conceptualize.trade_criteria (id) ON DELETE RESTRICT,
  concept_id uuid NOT NULL REFERENCES conceptualize.concepts (id) ON DELETE RESTRICT,
  study_revision integer NOT NULL,
  -- Quantity scores: value and/or range in the criterion's unit (after conversion). Qualitative: 1–5.
  value double precision,
  low double precision,
  high double precision,
  qualitative integer CHECK (qualitative BETWEEN 1 AND 5),
  cleared boolean NOT NULL DEFAULT false,
  basis text NOT NULL CHECK (basis IN ('user-assertion', 'ai-hypothesis', 'assumption', 'estimate', 'evidence', 'decision')),
  rationale text NOT NULL DEFAULT '' CHECK (char_length(rationale) <= 4000),
  evidence_id uuid,
  entered_unit text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  source_kind text NOT NULL DEFAULT 'user',
  conversation_id text,
  proposal_id text,
  PRIMARY KEY (study_id, criterion_id, concept_id, study_revision)
);
CREATE TRIGGER trade_scores_immutable BEFORE UPDATE OR DELETE ON conceptualize.trade_scores
  FOR EACH ROW EXECUTE FUNCTION conceptualize.refuse_change();

-- ---- evidence ---------------------------------------------------------------------------------------------

CREATE TABLE conceptualize.evidence (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  key text NOT NULL,
  concept_id uuid NOT NULL REFERENCES conceptualize.concepts (id) ON DELETE RESTRICT,
  concept_revision integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('calculation', 'analysis', 'simulation', 'test', 'review', 'reference', 'estimate')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 20000),
  -- estimate | ai-hypothesis | assumption: preliminary. evidence: verified (needs an artifact and a person).
  basis text NOT NULL CHECK (basis IN ('ai-hypothesis', 'assumption', 'estimate', 'evidence')),
  method text NOT NULL DEFAULT '' CHECK (char_length(method) <= 4000),
  -- [{ name, value, unit, min?, max? }]
  inputs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(inputs) = 'array'),
  outputs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(outputs) = 'array'),
  assumptions text[] NOT NULL DEFAULT '{}',
  artifact jsonb CHECK (artifact IS NULL OR jsonb_typeof(artifact) = 'object'),
  supersedes_id uuid REFERENCES conceptualize.evidence (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  source_kind text NOT NULL DEFAULT 'user',
  conversation_id text,
  proposal_id text,
  UNIQUE (project_id, key)
);
CREATE INDEX evidence_concept ON conceptualize.evidence (concept_id, created_at);
CREATE TRIGGER evidence_immutable BEFORE UPDATE OR DELETE ON conceptualize.evidence
  FOR EACH ROW EXECUTE FUNCTION conceptualize.refuse_change();

-- ---- implementations and links -----------------------------------------------------------------------------

CREATE TABLE conceptualize.implementations (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  key text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  status text NOT NULL CHECK (status IN ('candidate', 'in-development', 'implemented', 'retired')),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  UNIQUE (project_id, key)
);

CREATE TABLE conceptualize.implementation_concepts (
  implementation_id uuid NOT NULL REFERENCES conceptualize.implementations (id) ON DELETE RESTRICT,
  concept_id uuid NOT NULL REFERENCES conceptualize.concepts (id) ON DELETE RESTRICT,
  added_at timestamptz NOT NULL,
  added_by text NOT NULL,
  removed boolean NOT NULL DEFAULT false,
  removed_at timestamptz,
  removed_by text,
  PRIMARY KEY (implementation_id, concept_id)
);
CREATE INDEX implementation_concepts_concept ON conceptualize.implementation_concepts (concept_id) WHERE NOT removed;

CREATE TABLE conceptualize.implementation_artifacts (
  id uuid PRIMARY KEY,
  implementation_id uuid NOT NULL REFERENCES conceptualize.implementations (id) ON DELETE RESTRICT,
  module text NOT NULL CHECK (module IN ('requirements', 'sysml', 'cad', 'analysis', 'twin', 'external')),
  artifact_id text NOT NULL CHECK (char_length(artifact_id) BETWEEN 1 AND 2000),
  artifact_revision integer CHECK (artifact_revision >= 1),
  kind text,
  -- Display text captured when linking (the owning module stays authoritative).
  label text NOT NULL DEFAULT '',
  added_at timestamptz NOT NULL,
  added_by text NOT NULL,
  removed boolean NOT NULL DEFAULT false,
  removed_at timestamptz,
  removed_by text,
  source_kind text NOT NULL DEFAULT 'user',
  conversation_id text,
  proposal_id text
);
CREATE INDEX implementation_artifacts_ref ON conceptualize.implementation_artifacts (module, artifact_id) WHERE NOT removed;
CREATE INDEX implementation_artifacts_impl ON conceptualize.implementation_artifacts (implementation_id);

-- Requests to other modules to realize an implementation (CAD generation, SysML formalization …).
-- No CAD generation API exists: requests stay pending until the owning module offers one.
CREATE TABLE conceptualize.realization_requests (
  id uuid PRIMARY KEY,
  implementation_id uuid NOT NULL REFERENCES conceptualize.implementations (id) ON DELETE RESTRICT,
  target_module text NOT NULL CHECK (target_module IN ('cad', 'sysml', 'requirements', 'analysis')),
  request_kind text NOT NULL CHECK (char_length(request_kind) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cancelled', 'fulfilled')),
  fulfilled_by jsonb,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  source_kind text NOT NULL DEFAULT 'user',
  conversation_id text,
  proposal_id text
);
CREATE INDEX realization_requests_impl ON conceptualize.realization_requests (implementation_id);

-- Concept-level links to artifacts of other modules (requirement traceability and references).
CREATE TABLE conceptualize.concept_links (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  concept_id uuid NOT NULL REFERENCES conceptualize.concepts (id) ON DELETE RESTRICT,
  relation text NOT NULL CHECK (relation IN ('satisfies', 'derives', 'refines', 'proposes', 'references')),
  module text NOT NULL CHECK (module IN ('requirements', 'sysml', 'cad', 'analysis', 'twin', 'external')),
  artifact_id text NOT NULL CHECK (char_length(artifact_id) BETWEEN 1 AND 2000),
  artifact_revision integer CHECK (artifact_revision >= 1),
  kind text,
  label text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  removed boolean NOT NULL DEFAULT false,
  removed_at timestamptz,
  removed_by text,
  source_kind text NOT NULL DEFAULT 'user',
  conversation_id text,
  proposal_id text
);
CREATE INDEX concept_links_concept ON conceptualize.concept_links (concept_id) WHERE NOT removed;
CREATE INDEX concept_links_artifact ON conceptualize.concept_links (module, artifact_id) WHERE NOT removed;

-- ---- explorations (atomic multi-record creation, e.g. an AI-generated alternative set) ---------------------

CREATE TABLE conceptualize.explorations (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  objective text NOT NULL CHECK (char_length(objective) BETWEEN 1 AND 4000),
  parent_id uuid NOT NULL REFERENCES conceptualize.concepts (id) ON DELETE RESTRICT,
  set_id uuid REFERENCES conceptualize.alternative_sets (id) ON DELETE RESTRICT,
  trade_study_id uuid REFERENCES conceptualize.trade_studies (id) ON DELETE RESTRICT,
  -- { concepts: [], relationships: [], evidence: [] } created by it.
  created_ids jsonb NOT NULL,
  generator text NOT NULL DEFAULT '',
  undone boolean NOT NULL DEFAULT false,
  undone_at timestamptz,
  undone_by text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  source_kind text NOT NULL DEFAULT 'user',
  conversation_id text,
  proposal_id text
);

-- ---- audit, outbox and idempotency --------------------------------------------------------------------------

CREATE TABLE conceptualize.audit_events (
  id bigserial PRIMARY KEY,
  project_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  -- The Concept(s) concerned, for per-Concept history.
  concept_ids uuid[] NOT NULL DEFAULT '{}',
  action text NOT NULL,
  revision integer,
  actor text NOT NULL,
  occurred_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '',
  source_kind text NOT NULL DEFAULT 'user',
  conversation_id text,
  proposal_id text,
  message_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_events_project ON conceptualize.audit_events (project_id, id);
CREATE INDEX audit_events_concepts ON conceptualize.audit_events USING gin (concept_ids);
CREATE INDEX audit_events_proposal ON conceptualize.audit_events (proposal_id) WHERE proposal_id IS NOT NULL;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON conceptualize.audit_events
  FOR EACH ROW EXECUTE FUNCTION conceptualize.refuse_change();
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON conceptualize.audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION conceptualize.refuse_change();

CREATE TABLE conceptualize.outbox (
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
CREATE SEQUENCE conceptualize.outbox_delivery_seq;
CREATE INDEX outbox_project_seq ON conceptualize.outbox (project_id, seq);
CREATE INDEX outbox_unpublished ON conceptualize.outbox (seq) WHERE published_at IS NULL;
CREATE INDEX outbox_published_at ON conceptualize.outbox (published_at) WHERE published_at IS NOT NULL;

CREATE FUNCTION conceptualize.outbox_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('conceptualize_outbox', NEW.seq::text);
  RETURN NEW;
END
$$;
CREATE TRIGGER outbox_notify AFTER INSERT ON conceptualize.outbox FOR EACH ROW EXECUTE FUNCTION conceptualize.outbox_notify();

CREATE TABLE conceptualize.idempotency_keys (
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
CREATE INDEX idempotency_keys_created ON conceptualize.idempotency_keys (created_at);

-- Design knowledge extensions (docs/modules/design-reasoning/contract-change-requests.md, P1 set:
-- CR-C1 Function, CR-C2 DesignConstraint, CR-C3 Assumption, CR-C4 typed design links and registry,
-- CR-C5 decision extensions, CR-C6 evidence extensions and basis ladder).
--
-- Additive only (ADR-0009): new tables and nullable or defaulted columns; CHECK constraints are widened
-- to supersets; NOT NULL is relaxed where a new kind of subject needs it. No existing row is updated or
-- deleted. Two data additions: the built-in link types, and (CR-C3) one Assumption per existing
-- assumption statement of the current revision, which references its statement (statements unchanged).

-- ---- basis ladder (ADR-0043): assessment and calculated ---------------------------------------------
ALTER TABLE conceptualize.concept_statements DROP CONSTRAINT concept_statements_basis_check;
ALTER TABLE conceptualize.concept_statements ADD CONSTRAINT concept_statements_basis_check
  CHECK (basis IN ('user-assertion', 'ai-hypothesis', 'assumption', 'assessment', 'estimate', 'calculated', 'evidence', 'decision'));
ALTER TABLE conceptualize.relationships DROP CONSTRAINT relationships_basis_check;
ALTER TABLE conceptualize.relationships ADD CONSTRAINT relationships_basis_check
  CHECK (basis IN ('user-assertion', 'ai-hypothesis', 'assumption', 'assessment', 'estimate', 'calculated', 'evidence', 'decision'));
ALTER TABLE conceptualize.trade_scores DROP CONSTRAINT trade_scores_basis_check;
ALTER TABLE conceptualize.trade_scores ADD CONSTRAINT trade_scores_basis_check
  CHECK (basis IN ('user-assertion', 'ai-hypothesis', 'assumption', 'assessment', 'estimate', 'calculated', 'evidence', 'decision'));
ALTER TABLE conceptualize.evidence DROP CONSTRAINT evidence_basis_check;
ALTER TABLE conceptualize.evidence ADD CONSTRAINT evidence_basis_check
  CHECK (basis IN ('ai-hypothesis', 'assumption', 'assessment', 'estimate', 'calculated', 'evidence'));

-- ---- CR-C1 Function --------------------------------------------------------------------------------------
CREATE TABLE conceptualize.functions (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  key text NOT NULL CHECK (key ~ '^[A-Za-z][A-Za-z0-9_.-]{0,39}$'),
  current_revision integer NOT NULL CHECK (current_revision >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  -- Set when the Function was created by converting a function-Concept (CR-C1 step 3).
  origin_concept_id uuid REFERENCES conceptualize.concepts (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  record_version integer NOT NULL DEFAULT 1,
  UNIQUE (project_id, key)
);

CREATE TABLE conceptualize.function_revisions (
  function_id uuid NOT NULL REFERENCES conceptualize.functions (id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision >= 1),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  verb_phrase text NOT NULL DEFAULT '' CHECK (char_length(verb_phrase) <= 200),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 40000),
  purpose text NOT NULL DEFAULT '' CHECK (char_length(purpose) <= 4000),
  -- [{ direction: in|out, kind: energy|material|signal|force|data|other, name, quantity? }]
  flows jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(flows) = 'array'),
  -- [{ name, quantity, direction: min|max|target, basis }]
  objectives jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(objectives) = 'array'),
  -- Statements (desired behaviours, interfaces …) with the same shape and rules as Concept statements.
  statements jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(statements) = 'array'),
  classifications text[] NOT NULL DEFAULT '{}',
  change_reason text NOT NULL DEFAULT '',
  source_kind text NOT NULL CHECK (source_kind IN ('user', 'assistant', 'import', 'system')),
  conversation_id text,
  proposal_id text,
  message_id text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  PRIMARY KEY (function_id, revision)
);
CREATE TRIGGER function_revisions_immutable BEFORE UPDATE OR DELETE ON conceptualize.function_revisions
  FOR EACH ROW EXECUTE FUNCTION conceptualize.refuse_change();
ALTER TABLE conceptualize.functions
  ADD CONSTRAINT functions_current_revision_fk FOREIGN KEY (id, current_revision)
  REFERENCES conceptualize.function_revisions (function_id, revision) DEFERRABLE INITIALLY DEFERRED;

-- Function decompositions reuse named decompositions with a Function parent.
ALTER TABLE conceptualize.decompositions ALTER COLUMN parent_id DROP NOT NULL;
ALTER TABLE conceptualize.decompositions ADD COLUMN parent_function_id uuid REFERENCES conceptualize.functions (id) ON DELETE RESTRICT;
ALTER TABLE conceptualize.decompositions ADD CONSTRAINT decompositions_one_parent CHECK ((parent_id IS NULL) <> (parent_function_id IS NULL));

-- ---- CR-C2 DesignConstraint ------------------------------------------------------------------------------------
CREATE TABLE conceptualize.design_constraints (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  key text NOT NULL,
  current_revision integer NOT NULL CHECK (current_revision >= 1),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'active', 'relaxed', 'retired')),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  record_version integer NOT NULL DEFAULT 1,
  UNIQUE (project_id, key)
);

CREATE TABLE conceptualize.constraint_revisions (
  constraint_id uuid NOT NULL REFERENCES conceptualize.design_constraints (id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision >= 1),
  kind text NOT NULL CHECK (kind IN ('qualitative', 'logical', 'mathematical', 'dimensional', 'interface')),
  statement text NOT NULL CHECK (char_length(statement) BETWEEN 1 AND 4000),
  -- { symbol?, operator: <=|<|=|>=|>|in-range, quantity: { value?, unit, min?, max? } }
  bound jsonb CHECK (bound IS NULL OR jsonb_typeof(bound) = 'object'),
  -- { modelId, revision, relationId } (calculation models, CR-C8)
  expression jsonb CHECK (expression IS NULL OR jsonb_typeof(expression) = 'object'),
  strength text NOT NULL CHECK (strength IN ('hard', 'soft', 'preference')),
  -- { kind: requirement, ref: ArtifactRef } | { kind: derived, from: DesignRef } | { kind: stated }
  source jsonb NOT NULL CHECK (jsonb_typeof(source) = 'object'),
  basis text NOT NULL CHECK (basis IN ('user-assertion', 'ai-hypothesis', 'assumption', 'assessment', 'estimate', 'calculated', 'evidence', 'decision')),
  -- { conceptId, statementId } when promoted from a statement (CR-C2 migration operation)
  origin jsonb CHECK (origin IS NULL OR jsonb_typeof(origin) = 'object'),
  change_reason text NOT NULL DEFAULT '',
  source_kind text NOT NULL CHECK (source_kind IN ('user', 'assistant', 'import', 'system')),
  conversation_id text,
  proposal_id text,
  message_id text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  PRIMARY KEY (constraint_id, revision)
);
CREATE TRIGGER constraint_revisions_immutable BEFORE UPDATE OR DELETE ON conceptualize.constraint_revisions
  FOR EACH ROW EXECUTE FUNCTION conceptualize.refuse_change();
ALTER TABLE conceptualize.design_constraints
  ADD CONSTRAINT design_constraints_current_revision_fk FOREIGN KEY (id, current_revision)
  REFERENCES conceptualize.constraint_revisions (constraint_id, revision) DEFERRABLE INITIALLY DEFERRED;

-- ---- CR-C3 Assumption ------------------------------------------------------------------------------------------
CREATE TABLE conceptualize.assumptions (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  key text NOT NULL,
  current_revision integer NOT NULL CHECK (current_revision >= 1),
  validation_status text NOT NULL DEFAULT 'unvalidated' CHECK (validation_status IN ('unvalidated', 'under-review', 'validated', 'invalidated', 'retired')),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  record_version integer NOT NULL DEFAULT 1,
  UNIQUE (project_id, key)
);

CREATE TABLE conceptualize.assumption_revisions (
  assumption_id uuid NOT NULL REFERENCES conceptualize.assumptions (id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision >= 1),
  statement text NOT NULL CHECK (char_length(statement) BETWEEN 1 AND 4000),
  quantity jsonb CHECK (quantity IS NULL OR jsonb_typeof(quantity) = 'object'),
  -- { subjects: DesignRef[], applicability: text }
  scope jsonb NOT NULL DEFAULT '{"subjects": [], "applicability": ""}'::jsonb CHECK (jsonb_typeof(scope) = 'object'),
  basis text NOT NULL CHECK (basis IN ('user-assertion', 'ai-hypothesis', 'assumption', 'assessment', 'estimate', 'calculated', 'evidence', 'decision')),
  -- DesignRefs or ArtifactRefs the assumption depends on
  depends_on jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(depends_on) = 'array'),
  -- { conceptId, statementId } when created from a statement (migration or explicit)
  origin jsonb CHECK (origin IS NULL OR jsonb_typeof(origin) = 'object'),
  change_reason text NOT NULL DEFAULT '',
  source_kind text NOT NULL CHECK (source_kind IN ('user', 'assistant', 'import', 'system')),
  conversation_id text,
  proposal_id text,
  message_id text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  PRIMARY KEY (assumption_id, revision)
);
CREATE TRIGGER assumption_revisions_immutable BEFORE UPDATE OR DELETE ON conceptualize.assumption_revisions
  FOR EACH ROW EXECUTE FUNCTION conceptualize.refuse_change();
ALTER TABLE conceptualize.assumptions
  ADD CONSTRAINT assumptions_current_revision_fk FOREIGN KEY (id, current_revision)
  REFERENCES conceptualize.assumption_revisions (assumption_id, revision) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX assumption_revisions_origin ON conceptualize.assumption_revisions ((origin->>'statementId'));

-- Validation and invalidation are explicit, append-only records.
CREATE TABLE conceptualize.assumption_validations (
  id uuid PRIMARY KEY,
  assumption_id uuid NOT NULL REFERENCES conceptualize.assumptions (id) ON DELETE RESTRICT,
  revision integer NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL CHECK (to_status IN ('unvalidated', 'under-review', 'validated', 'invalidated', 'retired')),
  evidence_ids uuid[] NOT NULL DEFAULT '{}',
  reason text NOT NULL DEFAULT '',
  actor text NOT NULL,
  occurred_at timestamptz NOT NULL,
  source_kind text NOT NULL,
  conversation_id text,
  proposal_id text
);
CREATE INDEX assumption_validations_assumption ON conceptualize.assumption_validations (assumption_id, occurred_at);
CREATE TRIGGER assumption_validations_immutable BEFORE UPDATE OR DELETE ON conceptualize.assumption_validations
  FOR EACH ROW EXECUTE FUNCTION conceptualize.refuse_change();

-- ---- CR-C4 link-type registry and typed design links ----------------------------------------------------------------
CREATE TABLE conceptualize.link_types (
  name text PRIMARY KEY CHECK (name ~ '^([a-z][a-z0-9-]*:)?[a-z][a-z0-9-]*$'),
  label text NOT NULL,
  inverse text NOT NULL,
  from_types text[] NOT NULL,
  to_types text[] NOT NULL,
  is_symmetric boolean NOT NULL DEFAULT false,
  acyclic boolean NOT NULL DEFAULT false,
  assistant_assertable boolean NOT NULL DEFAULT true,
  impact text NOT NULL DEFAULT 'possible' CHECK (impact IN ('possible', 'demonstrated', 'none')),
  description text NOT NULL DEFAULT '',
  builtin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);

INSERT INTO conceptualize.link_types (name, label, inverse, from_types, to_types, is_symmetric, acyclic, assistant_assertable, impact, description, builtin) VALUES
  ('performs', 'performs', 'performed by', '{concept}', '{function}', false, false, true, 'possible', 'The Concept performs the Function (function–means).', true),
  ('decomposes-into', 'decomposes into', 'part of', '{function}', '{function}', false, true, true, 'possible', 'Function decomposition; acyclic over all decompositions; sub-functions may be shared.', true),
  ('depends-on', 'depends on', 'needed by', '{function,concept,constraint,assumption,evidence,decision,implementation}', '{function,concept,constraint,assumption,evidence,decision,implementation,artifact}', false, false, true, 'possible', 'Dependency; cycles are reported, not refused.', true),
  ('constrains', 'constrains', 'constrained by', '{constraint}', '{function,concept,exploration}', false, false, true, 'possible', 'The constraint applies to the subject.', true),
  ('interfaces-with', 'interfaces with', 'interfaces with', '{function}', '{function}', true, false, true, 'possible', 'Functions exchanging energy, material, signals or data (attributes.interface).', true),
  ('derived-from', 'derived from', 'origin of', '{function,concept,constraint,assumption}', '{function,concept,constraint,assumption,artifact}', false, true, true, 'possible', 'Created from the target (same type, or a constraint from a requirement).', true),
  ('supported-by', 'supported by', 'supports', '{decision,assumption,constraint,concept,function}', '{evidence}', false, false, true, 'demonstrated', 'The evidence supports the subject; the link basis must not exceed the evidence basis.', true),
  ('contradicted-by', 'contradicted by', 'contradicts', '{decision,assumption,constraint,concept,function}', '{evidence}', false, false, true, 'possible', 'The evidence contradicts the subject.', true),
  ('verified-by', 'verified by', 'verifies', '{concept,function,constraint}', '{evidence,artifact}', false, false, false, 'possible', 'Verification-grade evidence (basis evidence) or a twin verification record.', true),
  ('invalidated-by', 'invalidated by', 'invalidates', '{decision,assumption,evidence}', '{evidence,assumption,artifact}', false, false, false, 'none', 'Written only with a person''s action (ADR-0046).', true),
  ('formalizes', 'formalizes', 'formalized by', '{constraint}', '{artifact}', false, false, true, 'demonstrated', 'The constraint formalizes one pinned requirement revision.', true);

CREATE TABLE conceptualize.design_links (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  type text NOT NULL REFERENCES conceptualize.link_types (name) ON DELETE RESTRICT,
  from_type text NOT NULL,
  from_id uuid NOT NULL,
  from_revision integer,
  to_type text NOT NULL,
  to_id text NOT NULL CHECK (char_length(to_id) BETWEEN 1 AND 2000),
  to_module text,
  to_revision integer,
  decomposition_id uuid REFERENCES conceptualize.decompositions (id) ON DELETE RESTRICT,
  basis text NOT NULL CHECK (basis IN ('user-assertion', 'ai-hypothesis', 'assumption', 'assessment', 'estimate', 'calculated', 'evidence', 'decision')),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 4000),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  revision integer NOT NULL DEFAULT 1,
  removed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  removed_at timestamptz,
  removed_by text,
  source_kind text NOT NULL DEFAULT 'user',
  conversation_id text,
  proposal_id text,
  CHECK (to_type <> 'artifact' OR to_module IS NOT NULL)
);
CREATE INDEX design_links_from ON conceptualize.design_links (project_id, from_id) WHERE NOT removed;
CREATE INDEX design_links_to ON conceptualize.design_links (project_id, to_id) WHERE NOT removed;

-- ---- CR-C5 decision extensions ---------------------------------------------------------------------------------------
ALTER TABLE conceptualize.decisions ADD COLUMN support jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(support) = 'array');
ALTER TABLE conceptualize.decisions ADD COLUMN assumption_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(assumption_refs) = 'array');
ALTER TABLE conceptualize.decisions ADD COLUMN constraint_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(constraint_refs) = 'array');
ALTER TABLE conceptualize.decisions ADD COLUMN affected jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(affected) = 'array');
ALTER TABLE conceptualize.decisions ADD COLUMN invalidation_conditions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(invalidation_conditions) = 'array');
ALTER TABLE conceptualize.decisions ADD COLUMN validity text NOT NULL DEFAULT 'valid' CHECK (validity IN ('valid', 'under-review', 'invalidated'));
-- [{ reason, impactReportRef?, conditionId?, flaggedBy, flaggedAt, cleared?: { by, at, outcome, reason } }]
ALTER TABLE conceptualize.decisions ADD COLUMN review_flags jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(review_flags) = 'array');

-- ---- CR-C6 evidence extensions ---------------------------------------------------------------------------------------
ALTER TABLE conceptualize.evidence ALTER COLUMN concept_id DROP NOT NULL;
ALTER TABLE conceptualize.evidence ALTER COLUMN concept_revision DROP NOT NULL;
ALTER TABLE conceptualize.evidence ADD COLUMN applicability jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(applicability) = 'object');
ALTER TABLE conceptualize.evidence ADD COLUMN manifest jsonb CHECK (manifest IS NULL OR jsonb_typeof(manifest) = 'object');
ALTER TABLE conceptualize.evidence ADD COLUMN source jsonb CHECK (source IS NULL OR jsonb_typeof(source) = 'object');
ALTER TABLE conceptualize.evidence ADD COLUMN assumption_ids uuid[] NOT NULL DEFAULT '{}';

CREATE TABLE conceptualize.evidence_subjects (
  evidence_id uuid NOT NULL REFERENCES conceptualize.evidence (id) ON DELETE RESTRICT,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  subject_revision integer,
  PRIMARY KEY (evidence_id, subject_type, subject_id)
);
CREATE INDEX evidence_subjects_subject ON conceptualize.evidence_subjects (subject_id);
-- Existing evidence: its Concept is its one subject (backfill into the new table only).
INSERT INTO conceptualize.evidence_subjects (evidence_id, subject_type, subject_id, subject_revision)
SELECT id, 'concept', concept_id, concept_revision FROM conceptualize.evidence WHERE concept_id IS NOT NULL;

CREATE TABLE conceptualize.evidence_reviews (
  id uuid PRIMARY KEY,
  evidence_id uuid NOT NULL REFERENCES conceptualize.evidence (id) ON DELETE RESTRICT,
  outcome text NOT NULL CHECK (outcome IN ('accepted', 'rejected')),
  method text NOT NULL DEFAULT '' CHECK (char_length(method) <= 1000),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 4000),
  reviewer text NOT NULL,
  reviewed_at timestamptz NOT NULL
);
CREATE INDEX evidence_reviews_evidence ON conceptualize.evidence_reviews (evidence_id, reviewed_at);
CREATE TRIGGER evidence_reviews_immutable BEFORE UPDATE OR DELETE ON conceptualize.evidence_reviews
  FOR EACH ROW EXECUTE FUNCTION conceptualize.refuse_change();

-- ---- CR-C3 migration: one Assumption per assumption statement of the current revision ----------------------------------
WITH src AS (
  SELECT c.project_id, c.id AS concept_id, s.statement_id, s.text, s.quantity, s.basis,
         row_number() OVER (PARTITION BY c.project_id ORDER BY c.key, s.ordinal) AS n,
         gen_random_uuid() AS new_id
  FROM conceptualize.concepts c
  JOIN conceptualize.concept_statements s ON s.concept_id = c.id AND s.revision = c.current_revision
  WHERE s.kind = 'assumption' OR s.basis = 'assumption'
),
records AS (
  INSERT INTO conceptualize.assumptions (id, project_id, key, current_revision, validation_status, created_at, created_by, updated_at, updated_by)
  SELECT new_id, project_id, 'ASM-' || lpad(n::text, 3, '0'), 1, 'unvalidated', now(), 'system', now(), 'system' FROM src
  RETURNING id
)
INSERT INTO conceptualize.assumption_revisions (assumption_id, revision, statement, quantity, scope, basis, origin, change_reason, source_kind, created_at, created_by)
SELECT new_id, 1, text, quantity,
       jsonb_build_object('subjects', jsonb_build_array(jsonb_build_object('module', 'conceptualize', 'type', 'concept', 'id', concept_id::text)), 'applicability', ''),
       CASE WHEN basis IN ('user-assertion', 'ai-hypothesis', 'assumption') THEN basis ELSE 'assumption' END,
       jsonb_build_object('conceptId', concept_id::text, 'statementId', statement_id::text),
       'migrated from statement', 'system', now(), 'system'
FROM src WHERE new_id IN (SELECT id FROM records);

INSERT INTO conceptualize.key_counters (project_id, prefix, next_value)
SELECT project_id, 'ASM', count(*) + 1 FROM conceptualize.assumptions GROUP BY project_id
ON CONFLICT (project_id, prefix) DO NOTHING;

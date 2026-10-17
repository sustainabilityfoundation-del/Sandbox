-- ECII increment 1 (docs/specifications/ecii-plan.md section 4): the Engineering Intent, a revisioned record that says what is
-- being designed, whether it works with an existing system, which systems are involved, what is not yet known and what has
-- to be asked. Additive (ADR-0009): new tables only; revisions are immutable like every other Conceptualize type.

CREATE TABLE conceptualize.intents (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  key text NOT NULL CHECK (key ~ '^[A-Za-z][A-Za-z0-9_.-]{0,39}$'),
  current_revision integer NOT NULL CHECK (current_revision >= 1),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  record_version integer NOT NULL DEFAULT 1,
  UNIQUE (project_id, key)
);

CREATE TABLE conceptualize.intent_revisions (
  intent_id uuid NOT NULL REFERENCES conceptualize.intents (id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision >= 1),
  design_object text NOT NULL CHECK (char_length(design_object) BETWEEN 1 AND 500),
  role text NOT NULL CHECK (role IN ('standalone', 'accessory', 'component', 'modification', 'system')),
  integration text NOT NULL CHECK (integration IN ('standalone', 'hosted', 'embedded', 'connected', 'replacement', 'undetermined')),
  rationale text NOT NULL DEFAULT '' CHECK (char_length(rationale) <= 4000),
  -- [{ name, role, description, productElement?: ArtifactRef, identified, owner: project|external|shared, relation }]
  external_systems jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(external_systems) = 'array'),
  objectives jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(objectives) = 'array'),
  environment jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(environment) = 'array'),
  -- [{ id, text, tier 1-4, subject?, route, state }]
  information_needs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(information_needs) = 'array'),
  -- Assumption record IDs (conceptualize.assumptions)
  assumption_ids uuid[] NOT NULL DEFAULT '{}',
  -- [{ id, text, why, impact, options, state, needId? }]
  questions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(questions) = 'array'),
  basis text NOT NULL CHECK (basis IN ('user-assertion', 'ai-hypothesis', 'assumption', 'assessment', 'estimate')),
  change_reason text NOT NULL DEFAULT '',
  source_kind text NOT NULL CHECK (source_kind IN ('user', 'assistant', 'import', 'system')),
  conversation_id text,
  proposal_id text,
  message_id text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  PRIMARY KEY (intent_id, revision)
);
CREATE TRIGGER intent_revisions_immutable BEFORE UPDATE OR DELETE ON conceptualize.intent_revisions
  FOR EACH ROW EXECUTE FUNCTION conceptualize.refuse_change();
ALTER TABLE conceptualize.intents
  ADD CONSTRAINT intents_current_revision_fk FOREIGN KEY (id, current_revision)
  REFERENCES conceptualize.intent_revisions (intent_id, revision) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX intents_project ON conceptualize.intents (project_id, status);

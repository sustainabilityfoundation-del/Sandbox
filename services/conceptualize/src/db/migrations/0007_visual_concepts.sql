-- Visual concept exploration (concept-visualization.md, concept-visualization-contracts.md). Additive (ADR-0009).
--
-- 1. The engineering definition of a Concept revision: components (stable IDs), relationships, interfaces,
--    parameters with units, functional intent and an optional structured 2D layout, plus the maturity stage
--    (exploration, layout, engineering). Existing revisions get an empty definition and stage exploration;
--    no row is rewritten (a column default does not fire the immutability triggers).
-- 2. Visual artifacts (VIS-001) with immutable revisions, each pinned to the exact Concept revision it shows.
--    Kinds: illustration and layout now; mechanism, architecture, envelope-3d and motion reserved. An image is
--    never evidence and never verifies anything (ADR-0070).
-- 3. Generation state of illustration revisions (job of services/visualization): mutable, one row per revision.
-- 4. Annotations: numbered pin or rectangle in normalized coordinates with an instruction, bound to one exact
--    visual revision; never carried onto a new revision.
-- 5. CAD handoff packages (HND-001): immutable, revision-pinned.
-- Staleness ("possibly outdated") is derived on read from the pinned revisions, never stored.

ALTER TABLE conceptualize.concept_revisions ADD COLUMN stage text NOT NULL DEFAULT 'exploration'
  CHECK (stage IN ('exploration', 'layout', 'engineering'));
ALTER TABLE conceptualize.concept_revisions ADD COLUMN definition jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(definition) = 'object');

CREATE TABLE conceptualize.visuals (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  key text NOT NULL CHECK (key ~ '^[A-Za-z][A-Za-z0-9_.-]{0,39}$'),
  concept_id uuid NOT NULL REFERENCES conceptualize.concepts (id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('illustration', 'layout', 'mechanism', 'architecture', 'envelope-3d', 'motion')),
  current_revision integer NOT NULL CHECK (current_revision >= 1),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL,
  record_version integer NOT NULL DEFAULT 1,
  UNIQUE (project_id, key)
);
CREATE INDEX visuals_concept ON conceptualize.visuals (project_id, concept_id);

CREATE TABLE conceptualize.visual_revisions (
  visual_id uuid NOT NULL REFERENCES conceptualize.visuals (id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision >= 1),
  concept_id uuid NOT NULL,
  concept_revision integer NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  -- Layout: the view drawn; illustration: the requested style. Free text, kept verbatim.
  view text NOT NULL DEFAULT '' CHECK (char_length(view) <= 200),
  not_to_scale boolean NOT NULL,
  -- The instruction given for this revision (generation request or refinement), verbatim.
  instruction text NOT NULL DEFAULT '' CHECK (char_length(instruction) <= 4000),
  -- Reference assets (asset references only; binaries live in the host blob store).
  reference_assets jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reference_assets) = 'array'),
  -- Annotations of the previous revision this revision answers (ids), for traceability.
  refined_from jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(refined_from) = 'array'),
  change_reason text NOT NULL DEFAULT '' CHECK (char_length(change_reason) <= 2000),
  source_kind text NOT NULL CHECK (source_kind IN ('user', 'assistant', 'import', 'system')),
  conversation_id text,
  proposal_id text,
  message_id text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  PRIMARY KEY (visual_id, revision),
  FOREIGN KEY (concept_id, concept_revision) REFERENCES conceptualize.concept_revisions (concept_id, revision) ON DELETE RESTRICT
);
CREATE TRIGGER visual_revisions_immutable BEFORE UPDATE OR DELETE ON conceptualize.visual_revisions FOR EACH ROW EXECUTE FUNCTION conceptualize.refuse_change();
CREATE TRIGGER visual_revisions_no_truncate BEFORE TRUNCATE ON conceptualize.visual_revisions FOR EACH STATEMENT EXECUTE FUNCTION conceptualize.refuse_change();

ALTER TABLE conceptualize.visuals
  ADD CONSTRAINT visuals_current_revision_fk FOREIGN KEY (id, current_revision)
  REFERENCES conceptualize.visual_revisions (visual_id, revision) DEFERRABLE INITIALLY DEFERRED;

-- Generation of an illustration revision by services/visualization (@ews/visualization-client): the job the
-- caller created with clientRef = visual ID, mirrored here when the caller records it. Mutable job state; the
-- revision itself is immutable. Layout revisions have no row (rendered deterministically from the definition).
-- refused: the service refused the request (generation-unavailable); no job exists and nothing was charged.
CREATE TABLE conceptualize.visual_generations (
  visual_id uuid NOT NULL,
  revision integer NOT NULL,
  job_id text,
  state text NOT NULL CHECK (state IN ('pending', 'running', 'succeeded', 'failed', 'cancelled', 'refused')),
  adapter text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  -- Output asset (visualization service asset store): ID and SHA-256 only.
  asset_id text,
  asset_sha256 text CHECK (asset_sha256 IS NULL OR asset_sha256 ~ '^[0-9a-f]{64}$'),
  media_type text,
  -- Output of the fake test adapter (development and tests only): never a real visual.
  test_asset boolean NOT NULL DEFAULT false,
  -- { code, message, retryable } of a failed or refused request.
  error jsonb CHECK (error IS NULL OR jsonb_typeof(error) = 'object'),
  requested_at timestamptz NOT NULL,
  requested_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK ((state = 'refused') = (job_id IS NULL)),
  CHECK (state <> 'succeeded' OR (asset_id IS NOT NULL AND asset_sha256 IS NOT NULL)),
  PRIMARY KEY (visual_id, revision),
  FOREIGN KEY (visual_id, revision) REFERENCES conceptualize.visual_revisions (visual_id, revision) ON DELETE RESTRICT
);

CREATE TABLE conceptualize.visual_annotations (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  visual_id uuid NOT NULL,
  revision integer NOT NULL,
  number integer NOT NULL CHECK (number >= 1),
  shape text NOT NULL CHECK (shape IN ('pin', 'rect')),
  x double precision NOT NULL CHECK (x >= 0 AND x <= 1),
  y double precision NOT NULL CHECK (y >= 0 AND y <= 1),
  width double precision CHECK (width IS NULL OR (width > 0 AND width <= 1)),
  height double precision CHECK (height IS NULL OR (height > 0 AND height <= 1)),
  instruction text NOT NULL CHECK (char_length(instruction) BETWEEN 1 AND 4000),
  -- Component of the engineering definition: structured (a layout element ID, exact) or inferred (a raster
  -- region read as a component: an inference, confirmed by the user).
  component_id text,
  component_basis text CHECK (component_basis IN ('structured', 'inferred', 'user')),
  source_kind text NOT NULL CHECK (source_kind IN ('user', 'assistant', 'import', 'system')),
  conversation_id text,
  proposal_id text,
  message_id text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (visual_id, revision, number),
  CHECK ((shape = 'pin' AND width IS NULL AND height IS NULL) OR (shape = 'rect' AND width IS NOT NULL AND height IS NOT NULL AND x + width <= 1.000001 AND y + height <= 1.000001)),
  CHECK ((component_id IS NULL) = (component_basis IS NULL)),
  FOREIGN KEY (visual_id, revision) REFERENCES conceptualize.visual_revisions (visual_id, revision) ON DELETE RESTRICT
);
CREATE TRIGGER visual_annotations_immutable BEFORE UPDATE OR DELETE ON conceptualize.visual_annotations FOR EACH ROW EXECUTE FUNCTION conceptualize.refuse_change();

CREATE TABLE conceptualize.handoffs (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  key text NOT NULL CHECK (key ~ '^[A-Za-z][A-Za-z0-9_.-]{0,39}$'),
  concept_id uuid NOT NULL,
  concept_revision integer NOT NULL,
  target text NOT NULL CHECK (target IN ('cad')),
  package jsonb NOT NULL CHECK (jsonb_typeof(package) = 'object'),
  source_kind text NOT NULL CHECK (source_kind IN ('user', 'assistant', 'import', 'system')),
  conversation_id text,
  proposal_id text,
  message_id text,
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (project_id, key),
  FOREIGN KEY (concept_id, concept_revision) REFERENCES conceptualize.concept_revisions (concept_id, revision) ON DELETE RESTRICT
);
CREATE INDEX handoffs_concept ON conceptualize.handoffs (project_id, concept_id);
CREATE TRIGGER handoffs_immutable BEFORE UPDATE OR DELETE ON conceptualize.handoffs FOR EACH ROW EXECUTE FUNCTION conceptualize.refuse_change();

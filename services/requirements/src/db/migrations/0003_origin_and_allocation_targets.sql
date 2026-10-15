-- Demonstration D1 (requirements.create / requirements.allocate). Additive only: existing rows keep
-- their values (origin NULL = not recorded; target_kind 'twin' = component or product element).

-- Where a requirement came from: a stakeholder (user constraint), an AI-proposed choice the person
-- accepted, or derived from another requirement (with a derives-from relationship).
ALTER TABLE requirements.requirement_revisions
  ADD COLUMN origin text CHECK (origin IN ('stakeholder', 'ai-proposed', 'derived'));

-- Which directory an allocation target (to_twin_id) belongs to: the host's twin / product directory,
-- or the SysML Modeler (`<sysmlProjectId>/<elementId>`).
ALTER TABLE requirements.relationships
  ADD COLUMN target_kind text NOT NULL DEFAULT 'twin' CHECK (target_kind IN ('twin', 'sysml-model-element'));
ALTER TABLE requirements.relationships
  ADD CONSTRAINT relationships_target_kind_allocations CHECK (target_kind = 'twin' OR type = 'allocated-to');

-- Revision of the target the relationship revision was made against (SysML commit number), if known.
ALTER TABLE requirements.relationship_revisions
  ADD COLUMN to_target_revision integer CHECK (to_target_revision >= 0);

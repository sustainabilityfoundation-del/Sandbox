-- Demonstration D1 (D1-CON) and ADR-0070 item 3, additive: evidence records the tool that produced it
-- ({ name, version }, e.g. the CAD kernel) and its results with the C11 qualification
-- ([{ name, value | min/max, unit, qualification: { kind, quality? }, constraint?, status?, margin? }]).
-- The status of a result against a constraint is computed by the service from the constraint's bound at the
-- pinned revision. Existing evidence gets no tool and no results.

ALTER TABLE conceptualize.evidence ADD COLUMN tool jsonb CHECK (tool IS NULL OR (tool ? 'name' AND tool ? 'version'));
ALTER TABLE conceptualize.evidence ADD COLUMN results jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(results) = 'array');

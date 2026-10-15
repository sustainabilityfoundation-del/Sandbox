-- Design Reasoning R1 refinements (contract-change-requests.md R1-1 … R1-10), additive (ADR-0009).
--
-- 1. The link-type registry records impact propagation (ADR-0046) and, for links to artifacts of other
--    modules, the allowed modules. User-registered types get the default propagation (to-from).
-- 2. Built-in types follow the R1 vocabulary (packages/design-reasoning-core/src/linkTypes.ts): wider
--    endpoints for depends-on, derived-from and interfaces-with. Only built-in vocabulary rows are
--    updated; no user data (links, user-registered types) is changed.

ALTER TABLE conceptualize.link_types
  ADD COLUMN propagation text NOT NULL DEFAULT 'to-from' CHECK (propagation IN ('to-from', 'from-to', 'both', 'none')),
  ADD COLUMN artifact_modules text[];

UPDATE conceptualize.link_types t SET propagation = v.propagation, artifact_modules = v.artifact_modules
FROM (VALUES
  ('performs', 'to-from', NULL::text[]),
  ('decomposes-into', 'both', NULL),
  ('depends-on', 'to-from', NULL),
  ('constrains', 'from-to', NULL),
  ('interfaces-with', 'both', NULL),
  ('derived-from', 'to-from', NULL),
  ('supported-by', 'to-from', NULL),
  ('contradicted-by', 'to-from', NULL),
  ('verified-by', 'to-from', '{twin}'::text[]),
  ('invalidated-by', 'none', NULL),
  ('formalizes', 'both', '{requirements}'::text[])
) AS v (name, propagation, artifact_modules)
WHERE t.name = v.name AND t.builtin;

UPDATE conceptualize.link_types SET
  from_types = '{function,concept,implementation,constraint,assumption,evidence,decision,alternative-set,trade-study,exploration}',
  to_types = '{function,concept,implementation,constraint,assumption,evidence,decision,alternative-set,trade-study,exploration,artifact}'
WHERE builtin AND name IN ('depends-on', 'derived-from');

UPDATE conceptualize.link_types SET from_types = '{function,concept}', to_types = '{function,concept}', description = 'Exchange of force, energy, material, signals or data (attributes.interface).'
WHERE builtin AND name = 'interfaces-with';

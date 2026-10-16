-- CR-PM-CON-1 (additive, ADR-0009): artifact references may point at Project Management product elements
-- (module 'product', ADR-0063) and Project Management entities such as project documents used as evidence
-- (module 'projects'). The CHECK constraints are re-created as supersets; no row changes.

ALTER TABLE conceptualize.implementation_artifacts DROP CONSTRAINT implementation_artifacts_module_check;
ALTER TABLE conceptualize.implementation_artifacts ADD CONSTRAINT implementation_artifacts_module_check
  CHECK (module IN ('requirements', 'sysml', 'cad', 'analysis', 'twin', 'external', 'product', 'projects'));

ALTER TABLE conceptualize.concept_links DROP CONSTRAINT concept_links_module_check;
ALTER TABLE conceptualize.concept_links ADD CONSTRAINT concept_links_module_check
  CHECK (module IN ('requirements', 'sysml', 'cad', 'analysis', 'twin', 'external', 'product', 'projects'));

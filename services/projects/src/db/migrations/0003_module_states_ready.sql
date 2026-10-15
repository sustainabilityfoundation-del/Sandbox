-- Integration milestone 1, C1: per-module provisioning states pending, ready, not-needed, failed (plus unavailable
-- for a module that is not installed). Additive: 'provisioned' stays allowed for rows written by 0001 code and is
-- read as 'ready'. A reason column explains not-needed and failed states.
ALTER TABLE projects.module_states DROP CONSTRAINT module_states_status_check;
ALTER TABLE projects.module_states ADD CONSTRAINT module_states_status_check CHECK (status IN ('pending', 'ready', 'provisioned', 'not-needed', 'failed', 'unavailable'));
ALTER TABLE projects.module_states ADD COLUMN reason text NOT NULL DEFAULT '';
ALTER TABLE projects.module_states ADD COLUMN name text NOT NULL DEFAULT '';

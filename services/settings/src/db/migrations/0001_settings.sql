-- Settings service (docs/specifications/ai-connection.md §5a). Values only: definitions are code.
-- Secrets are never stored here; a secret-reference value is an opaque reference owned by another service.

CREATE TABLE settings.scopes (
  scope text NOT NULL CHECK (scope IN ('user', 'project')),
  owner_id text NOT NULL,
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, owner_id)
);

CREATE TABLE settings.setting_values (
  scope text NOT NULL CHECK (scope IN ('user', 'project')),
  owner_id text NOT NULL,
  setting_id text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  PRIMARY KEY (scope, owner_id, setting_id)
);

-- Append-only change history (who changed which setting, from what to what).
CREATE TABLE settings.history (
  id bigserial PRIMARY KEY,
  scope text NOT NULL,
  owner_id text NOT NULL,
  setting_id text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  actor text NOT NULL,
  revision bigint NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX history_owner ON settings.history (scope, owner_id, at DESC);

CREATE FUNCTION settings.history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'settings.history is append-only';
END $$;
CREATE TRIGGER history_append_only BEFORE UPDATE OR DELETE ON settings.history FOR EACH ROW EXECUTE FUNCTION settings.history_append_only();

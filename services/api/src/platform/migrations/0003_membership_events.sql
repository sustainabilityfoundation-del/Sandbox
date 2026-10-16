-- Membership change history (CR-PM-API-1, docs/specifications/project-management-progress.md). Additive only
-- (ADR-0009): a new append-only table; platform.project_memberships is unchanged and stays the single
-- authorization source. Written by the membership port used by Project Management.
CREATE TABLE platform.membership_events (
  id bigserial PRIMARY KEY,
  project_id text NOT NULL,
  user_id text NOT NULL,
  role text CHECK (role IS NULL OR role IN ('reader', 'editor', 'reviewer', 'administrator')),
  action text NOT NULL CHECK (action IN ('set', 'removed')),
  actor text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX membership_events_project ON platform.membership_events (project_id, id);

CREATE FUNCTION platform.refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on %.% is not permitted: the records are immutable', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = '23001';
END
$$;
CREATE TRIGGER membership_events_immutable BEFORE UPDATE OR DELETE ON platform.membership_events FOR EACH ROW EXECUTE FUNCTION platform.refuse_change();

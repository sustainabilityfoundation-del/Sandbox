-- Context chain (ECII plan Amendment 2, AI infrastructure increment C): the context package a model request or a proposal was
-- built from. Nullable text (the snapshot table and its IDs arrive with the context assembler, CE-1); nothing references it yet.
-- Additive: no existing row or constraint changes. usage_events stays insert-only (adding a column is not an UPDATE).

ALTER TABLE assistant.usage_events ADD COLUMN context_id text;
CREATE INDEX usage_events_context ON assistant.usage_events (context_id) WHERE context_id IS NOT NULL;

ALTER TABLE assistant.proposals ADD COLUMN context_id text;

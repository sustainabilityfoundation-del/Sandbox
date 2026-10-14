-- Outbox retention (sprint 002): delivered events are purged after a retention window.
-- Additive only (ADR-0009): an index for the purge; no rows are changed by this migration.
-- Purge rule (services/requirements/src/events/hub.ts): delete rows whose published_at is older than
-- the window. Publication order equals delivery order, so every event after a retained event is
-- also retained; a client resuming from a retained event loses nothing, and a client resuming from
-- a purged event receives `event: reset`.
CREATE INDEX outbox_published_at ON requirements.outbox (published_at) WHERE published_at IS NOT NULL;

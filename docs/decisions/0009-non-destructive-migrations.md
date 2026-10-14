# ADR-0009: Non-destructive, additive data migrations

Status: Accepted (2026-10-13)

## Decision

Stored data is upgraded in place by adding fields or records, never by rewriting or deleting user
data. Each upgrade has a test with a fixture of the old format. Schema 3 adds revision history and
baselines; legacy (schema 1) and schema 2 data are upgraded and persisted on load.

## Consequences

- Old data keeps all its information. Defaults for missing fields are explicit and visible (for
  example, a requirement saved before status existed is shown as Draft with a "no status recorded
  yet" marker until someone saves a status).

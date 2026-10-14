# ADR-0007: Verification records as immutable artifacts

Status: Accepted (2026-10-13)

## Context

Phase 1 requires recorded verification. A test result must identify the requirement revision,
configured article and procedure or run, and changes must expose stale evidence (vision §10, §11).
Full verification and validation is Phase 2.

## Decision

The Requirements module saves results as artifacts of kind `verification-record` (schema 1): an exact
`verifies` reference to the requirement revision, the configuration (optionally a `baseline`
reference), method, outcome, procedure or run, and optional `evidence`. Inputs are the requirement and
its allocated components. Status derives from the newest record, and a stale pass is shown as stale.
No new module or object type is introduced; the retired Verification module's `procedure` data stays
read-only.

## Consequences

- Phase 2 V&V can adopt this format or migrate it additively.
- Recording verification is a user action; the assistant has no action for it.

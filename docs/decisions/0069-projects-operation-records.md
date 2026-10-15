# ADR-0069: Persisted multi-module operation records with idempotent, resumable steps

Status: Proposed (2026-10-15) — integration milestone 1, C7. Design only; implementation is increment I4.

## Context

There is no distributed transaction across the platform's services (vision §4). Several Project Management
operations touch more than one module: project creation (memberships, settings, module provisioning), archive and
delete (state, module notification), baseline capture (reconcile, then read every module's versions), export
(every module's payload), import (Project Management data, then every module's payload) and, in the AI layer,
multi-module proposals. A crash, restart or module outage in the middle must leave an observable, recoverable
state, never a silent half-done change. Today (I1) project creation already runs as one transaction plus
idempotent, recorded post-commit steps (module states, settings), which this ADR generalises.

## Decision

1. **Operation record.** `projects.operations (id uuid, project_id, kind, status, requested_by, request jsonb,
   created_at, updated_at, finished_at, error jsonb, revision)` with `kind ∈ project.create | project.archive |
   project.delete | project.restore | baseline.capture | export | import | proposal.apply` and
   `status ∈ pending | running | succeeded | failed | compensated`. Created in the same transaction as the
   operation's first, local change (so an operation never exists without its trigger, and vice versa).
2. **Steps.** `projects.operation_steps (operation_id, ordinal, name, module, status ∈ pending | running |
   succeeded | failed | skipped | compensated, idempotency_key, attempts, last_error, result jsonb, started_at,
   finished_at)`. The idempotency key is `<operationId>:<step>` and is passed to the module call (as
   `Idempotency-Key` or `ProvisionRequest.idempotencyKey`), so a repeated step returns the first outcome.
3. **Runner.** One runner per API host process, serialised per operation by `pg_try_advisory_lock(hashtext(id))`.
   It executes the next pending step, records the outcome in its own transaction, and continues. On start-up and
   every minute it resumes operations in `pending` or `running` (a `running` step whose process died is retried —
   safe because steps are idempotent). Retries back off (1 s → 5 min, 10 attempts), then the step is `failed`.
4. **Failure policy per kind.** Steps declare `compensate?` (for example, an import that created Project
   Management records whose module payload cannot be applied keeps them and parks the payload; nothing is deleted).
   Where compensation would destroy user data the operation stays `failed` with an explanation and a "retry" or
   "accept partial" action, never an automatic rollback of committed module data.
5. **Observability.** `GET /projects/{id}/operations` and `GET /operations/{id}` (steps, statuses, errors);
   outbox events `operation.updated`; the workspace shows running and failed operations in the project overview.
   A reconciliation job reports operations stuck beyond a threshold.
6. **AI proposals** (C9) reuse the same tables through the assistant service or call this API; their steps are
   module operations with expected revisions, so a stale step fails with the module's conflict, never applies a
   changed intention.

## Consequences

- Every multi-module outcome is either finished, explained-failed or compensated, and visible after a restart.
- Modules need idempotent entry points (they already record `Idempotency-Key` inside their write transactions:
  Requirements, Conceptualize, CAD; SysML since sprint 2) — no new module requirement except honouring the key.
- No global consistency is claimed: a baseline or export records each module's read time and source revision.

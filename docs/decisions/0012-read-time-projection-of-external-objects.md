# ADR-0012: Read-time projection of externally owned objects into the twin's model

Status: Accepted (2026-10-14)

## Context

Requirements moved to the Requirements service ([ADR-0011](0011-requirements-service-boundary.md)),
identified by UUID. The shared twin still holds the old `REQ-001`… objects, and SysML links, verification
records and saved selections refer to those IDs. Rewriting stored twin data would break
[ADR-0009](0009-non-destructive-migrations.md), and every tool reads one `ModelIndex`.

## Decision

- The workspace reads requirements through the SDK `RequirementsService` and composes them into the
  model index when it is read (`composeSnapshot` in `@ews/model-service`). The stored twin is unchanged.
- Each legacy twin ID that the service resolves becomes an **alias** of its canonical UUID. The index
  resolves aliases (`get`, `revisionOf`, `linked`, `canonical`); twin links to a legacy ID are shown as
  links to the UUID; the legacy twin object is hidden.
- Allocation (`allocated-to` from a requirement) comes only from the service, which owns it.
- The twin repository accepts registered external IDs in links, artifacts and baselines
  (`registerExternalObjects`) without storing the objects. Platform baselines pin the external
  revisions too. Revision reads for external objects go to the owning service.
- People see the key (`displayId`), never the UUID.
- Each window subscribes to the service's committed-change events and rereads the projection.

## Consequences

- Nothing stored is migrated; removing the projection restores the previous view.
- Verification records made before the move pinned twin revisions; they show as potentially stale
  against the service's revision numbering, which is the honest outcome.
- Without the service (unit tests, the static preview build) the twin's own requirement objects apply.
- If the service is unreachable the twin's legacy requirements remain visible and the header reports
  the outage; no demo data is substituted.

# ADR-0011: Requirements as a server-side service with a cross-module SDK contract

Status: Accepted (2026-10-13)

## Context

The Requirements Management brief (`docs/specifications/requirements-management.md`) requires a
PostgreSQL-backed HTTP API, SysML integration, ReqIF exchange and backend permission enforcement.
Until now all modules used the browser demo repository. The work is delegated to a separate agent
in its own worktree, so the boundaries must be fixed first.

## Decision

- Requirements data moves to a server-side service (`services/requirements`, schema `requirements`)
  hosted by `services/api`. The browser reaches it only over HTTP through `@ews/requirements-client`.
- Other modules use only the SDK 1.2 contract `RequirementsService` via `ToolApi.services`; they
  never import Requirements packages or query its tables.
- Canonical requirement identity is a UUID; human-readable keys and legacy twin IDs are aliases.
- Ownership, identity, roles, entitlements, events and HTTP conventions are as recorded in
  `docs/specifications/requirements-contracts.md`.
- Components, SysML elements and CAD representations stay in the shared twin for now; only
  Requirements moves server-side in this step.
- Development identities stand in for authentication until an identity provider is chosen.

## Consequences

- A mixed period: Requirements in PostgreSQL, the rest of the twin in the browser demo repository.
  Twin references to requirements migrate to UUIDs (coordinator).
- A backend now exists; server-side enforcement for the remaining modules follows the same host.
- Open: production identity provider, hosting, and whether other modules move to PostgreSQL.

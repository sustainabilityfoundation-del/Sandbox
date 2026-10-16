# ADR-0060: Project Management as a service-backed module that indexes, not copies

Status: Accepted (16 October 2026, coordinator, after review against main 186db1c; amendments recorded below)

## Context

The owner's brief (docs/specifications/project-management.md) asks for persistent, multiple projects with
a unified project information model, while each engineering module keeps its domain data. Projects are
implicit today: a `project_id` string in every service and a single hard-wired project in the browser twin
(docs/modules/projects/inspection.md).

## Decision

- Project Management is a service-backed module like Requirements and Conceptualize (ADR-0011, ADR-0015):
  `services/projects` (`@ews/projects-service`, schema `projects`, `/api/projects/v1`, OpenAPI 3.1, outbox +
  SSE), `packages/projects-client` (`@ews/projects-client`), and shell-level UI in `apps/workspace/src/projects`.
- It owns the project registry and lifecycle, templates, membership *management* (written through a platform
  membership port so `platform.project_memberships` stays the single authorization source), the artifact
  registry, links no module owns, work items, milestones, documents and attachments, project baselines
  (planned, ADR-0067), activity and audit, export/import (planned, ADR-0064) and integrity checks (planned).
- It stores references and summary metadata only. Module content stays in modules.
- Every operation is a typed API command used by the UI and the assistant alike; assistant changes are
  service proposals with dry-run previews; destructive operations need explicit confirmation.
- Core capability on every plan: no `tool:*` entitlement; project roles apply. Module data inside a project
  follows module entitlements, enforced by each module's server.
- The service imports only `@ews/platform-sdk`; it copies the Conceptualize infrastructure pattern until a
  shared service package exists (CR-SYSML-06).

## Consequences

- One project container for every module without changing how modules store data.
- New modules integrate through the registration contract (ADR-0062), not by changing Project Management.
- A mixed period remains while the browser twin is single-project (CR-PM-MS-1).

## Alternatives considered

- *A universal project database holding all module data*: rejected (vision §5, contracts §2.2).
- *Project registry inside `services/api/src/platform`*: rejected; the platform host should stay a host, and
  the registry has its own lifecycle, API, events and tests.

## Amendments on acceptance

- Project baselines (ADR-0067), export/import (ADR-0064) and integrity checks are marked as planned.

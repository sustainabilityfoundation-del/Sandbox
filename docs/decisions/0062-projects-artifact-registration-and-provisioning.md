# ADR-0062: Artifact registration from module outboxes, reconciliation, and provisioning without seed data

Status: Accepted (16 October 2026, coordinator, after review against main 186db1c; amendments recorded below)

## Context

The registry (ADR-0061) must learn about artifacts in every module without coupling module write paths to
Project Management, survive missed events and absent modules, and a new project must start empty in every
module. Modules already publish committed changes through transactional outboxes, but events carry IDs and
revisions only. The browser twin has no server-side events.

## Decision

- A new framework-free SDK contract `ArtifactSource` (SDK 1.7, `contract/artifacts.ts`): `describeModule`,
  `list` (paged, for reconciliation), `describe` (summaries for refs), `subscribe` (committed changes mapped
  from the module's own outbox), optional `provision`, `exportProject`, `importProject`. Each module implements
  it in its service package over its own tables; the API host wires the adapters into the projects plugin.
  Exact TypeScript: docs/modules/projects/registration-and-provisioning.md §3.
- A registry consumer dedupes changes by `eventId`, calls `describe`, and upserts the registry with audit.
  A reconciliation scan (on open after downtime, periodic, on demand, before export and baselines) makes the
  registry converge.
- Adapters read as a non-login system principal `system:projects` that only in-process code can use.
- Synchronous registration exists only for Project Management's own need to resolve an unseen ref
  (`POST /projects/{id}/artifacts/resolve`). Modules never call Project Management.
- The browser twin reports its inventory to the registry, labelled **client-attested**, until ADR-0063 moves
  components server-side. (Not built at 186db1c.)
- Provisioning: the project-creation transaction writes the creator's membership (which is what makes the
  project exist for every module); afterwards Project Management calls each module's optional `provision`
  and records the outcome per module. For a blank template a module must create nothing. There is no shared contract suite; blank-project checks are per module, and the acceptance test asserts zero
  artifacts in every module.
- (Historical, superseded: all four modules ship in-process adapters.) Until modules ship adapters, Project
  Management ships labelled contract-test adapters over the modules' HTTP APIs.

## Consequences

- No module changes its write path; each adds one adapter (change requests CR-PM-REG-1…5).
- Registry freshness is eventual and visible. A module's absence never deletes or corrupts registry data.
- Additional modules integrate by implementing `ArtifactSource`.

## Alternatives considered

- *Synchronous registration calls from every module*: couples write paths, needs distributed transactions or
  compensation for failures.
- *Project Management reads module tables directly*: violates module ownership (vision §4).
- *Server-to-server SSE over HTTP*: possible later for split deployments; the interface does not preclude it.

## Amendments on acceptance

- Eventual consistency confirmed: `services/projects/test/acceptance.i1.test.ts` waits for the registry to converge.
- Client-attested twin reporting is not built.
- There is no shared contract suite; blank-project checks are per module.
- The bullet on contract-test adapters is historical: all four modules ship in-process adapters.

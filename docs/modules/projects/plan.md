# Phased implementation plan and backlog

Status: **Proposed** (phase A). Index: [README.md](README.md). Progress and change requests:
[project-management-progress.md](../../specifications/project-management-progress.md).

Each phase is split into short sprints (development-workflow.md) with a committed, checked checkpoint.

## 1. Phases

| Phase | Outcome (what the owner can do) | Scope | Depends on | Gate |
| --- | --- | --- | --- | --- |
| **A** Architecture | Review the design | This document set, ADR-0060…0068, change requests | — | Coordinator approval |
| **B** Project core (own packages only; allowed before approval) | (API level) create a blank or template project, edit metadata, archive/restore/soft-delete, recents, search/sort/filter; tasks, issues, risks, milestones; documents with versioned binary attachments; audit, outbox, SSE; everything survives restart | `services/projects` (schema, migrations 0001–0002, store, blob store, routes, OpenAPI, events), `packages/projects-client` (HTTP adapter of the module client, in-memory contract-test adapter, contract tests); tests on real PostgreSQL incl. restart | none (host registration and membership port stubbed in tests) | Coordinator review of the checkpoint |
| **C** Integrated project shell | In the workspace: Project Home, New Project wizard, open a blank project that is empty in every module, Overview, Activity, Settings page, members; switch to the example project `PRJ-ACT100` | host registration (`COORDINATOR REVIEW`), platform membership API, SDK 1.7 `ProjectsService`, workspace current-project context and empty twin per project, settings definitions, headless assistant/help contribution, `projects.*` actions, help pages | CR-PM-SDK-1, CR-PM-API-1/2, CR-PM-MS-1, CR-PM-WS-1/2/3, CR-PM-SET-1 | Coordinator integration review |
| **D** Registry and traceability | Explorer and Artifact Inspector across modules; links (task → CAD part, CAD part represents product element); trace and impact; integrity check; module-unavailable behaviour | `ArtifactSource` contract (SDK 1.7), registry consumer, reconciliation, PM contract-test adapters for Requirements, Conceptualize, SysML, CAD until modules ship theirs; views: artifact browser, requirements hierarchy | CR-PM-SDK-2, CR-PM-REG-1…5 | Coordinator review |
| **E** Product structure and baselines | Product breakdown and physical assembly views; product elements server-side; Requirements allocation to new projects' elements; project baselines and checkpoints, compare | migration 0005, product API, `TwinDirectory` backed by the product registry, twin projection, migration of `PRJ-ACT100` components as aliases; baselines 0004 | ADR-0063 accepted, CR-PM-API-3, CR-PM-MS-2 | Coordinator review |
| **F** Interchange and acceptance | Export a project, import into a clean installation, verify; duplicate with module content; brief §9 workflow end-to-end in the browser from an empty database | packager, validator, import jobs, module payloads (adapters), acceptance test script (playwright-core) | module exporters (CR-PM-REG-*), ADR-0064 | Owner walkthrough |

## 2. Brief §9 acceptance workflow: mapping and expected verification status

| # | Step | Phase | Real integration or adapter | Expected status at end of phase F |
| --- | --- | --- | --- | --- |
| 1 | Create "Example Engineering Product" | B (API), C (UI) | real | verifiable |
| 2 | Save and reopen | B/C | real | verifiable |
| 3 | Create a product and initial concept | E (product), C/D (Conceptualize) | real Conceptualize; product registry after ADR-0063 | verifiable if ADR-0063 accepted; otherwise product only as a twin component in a multi-project twin (CR-PM-MS-1) |
| 4 | Add requirements through Requirements | C | real | verifiable |
| 5 | SysML elements connected to requirements | C/D | real System Model (managed-requirement link exists) | verifiable |
| 6 | CAD part or assembly through CAD | C/D | real CAD Modeler if `services/cad` is integrated; else contract-test adapter | depends on CAD integration into `main` |
| 7 | Link the CAD artifact to the product structure | D/E | PM `represents` link (until CAD-native mapping) | verifiable after E |
| 8 | Record a decision and rationale | C | real Conceptualize decisions | verifiable |
| 9 | Task associated with an artifact | B (API), D (link to module artifact) | real | verifiable |
| 10 | Close and restart | B | real (stop API and PostgreSQL) | verifiable |
| 11 | Reopen; everything intact | B–E | real | verifiable |
| 12 | Modify; revision history and audit | B/D | real (PM audit + module history) | verifiable |
| 13 | Export, import into a clean environment, verify integrity | F | real for PM data; module content only for modules with exporters | partially verifiable until every module ships an exporter |
| 14 | One module unavailable | D/F | real (adapter removed / module not registered) | verifiable |

The acceptance report will list each step as *verified*, *verified with contract-test adapter* or
*unverified*, with the reason.

## 3. Phase B sprint (now)

Outcome: a running, tested Project Management service library that the host can register unchanged.

Acceptance criteria:

1. Migrations create schema `projects` from an empty database; re-running is a no-op; checksums enforced.
2. Create blank project (Idempotency-Key, dryRun), get, list with `q`/status/state/sort/cursor, patch with
   If-Match (409 on stale), archive, restore, soft delete with `X-Confirm`, recents; creator gets
   administrator through the membership port in the same transaction (rolled back together on failure).
3. A blank project has zero registry entries and zero work items; templates add configuration and planning
   items only.
4. Tasks/issues/risks with status rules and revisions; milestones; `subject-of` links between PM entities.
5. Documents with immutable versions in a content-addressed blob store; digest verification; download.
6. Audit for every write with provenance; outbox events; SSE with resume.
7. Persistence test: create data, stop the server and PostgreSQL, start again, everything readable.
8. OpenAPI 3.1 generated and responses validated against it in tests.
9. `npm run check` green; the project test command green; no file outside the agent's ownership changed.

Exclusions: host registration, UI, SDK changes, registry consumer, product structure, baselines,
interchange (all wait for approval).

## 4. Backlog (not in the initial implementation)

| ID | Item | Reason deferred |
| --- | --- | --- |
| B-01 | Engineering change requests and change orders | brief §7 "design for"; needs approval workflows |
| B-02 | Formal approval workflows (review independence, signatures) | needs identity provider and role separation rules |
| B-03 | Branching and alternative design configurations at project level | modules first (SysML has branches; others do not) |
| B-04 | Multi-user conflict resolution beyond optimistic concurrency | brief prioritises versioning and baselines |
| B-05 | Release and verification gates on baselines | after baselines (phase E) |
| B-06 | User-defined templates (`POST /templates`, from project) | needs an installation-administrator role |
| B-07 | Content templates (templates that create engineering artifacts through module importers) | needs module importers; never for "blank" |
| B-08 | S3-compatible blob store adapter | no paid service; local store first |
| B-09 | Production authentication (OIDC) | platform decision |
| B-10 | Notifications (assignment, due dates) | not in brief scope |
| B-11 | Gantt/scheduling, resources, dependencies critical path | vision "project and technical management", later |
| B-12 | Purge of deleted projects after retention (PM data only, after export) | needs retention policy approval |
| B-13 | Server-side twin repository (retire browser twin storage) | coordinator roadmap open decision |
| B-14 | Relationship revision ranges ("applies from revision n") | open shared-schema decision |
| B-15 | Large-project performance (100k artifacts): materialised view hierarchies | measure first |
| B-16 | Desktop/offline project cache | vision open decision |
| B-17 | Cross-project references and libraries (reuse of parts/requirements across projects) | not in brief |
| B-18 | Package signing and encryption | after the format stabilises |
| B-19 | Comparison between project revisions/baselines with module-level semantic diffs | modules provide diffs (SysML has one) |
| B-20 | Analysis module integration (real) | no Analysis module exists; test adapter only |

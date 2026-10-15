# Integration milestone 1: one durable engineering project across the real modules

Owner: coordinator. Status: **active**, agreed 15 October 2026. This document is the coordinator-owned
integration plan and backlog. It **amends** the module briefs and contracts listed in §6; the original owner
briefs stay unchanged.

Status vocabulary used everywhere (progress files, roadmap, About page, reports):

- **implemented**: code exists in a module and its own tests pass;
- **integrated**: merged into `main` and wired to the real services of the other modules involved;
- **tested**: covered by a committed automated test (unit, database or browser) that runs against the real services;
- **owner-accepted**: the owner has tried it and said so. Never claimed without the owner's words.

Every report also says what each step ran against: **real service**, **contract/test adapter**, **scripted
demo** or **live AI provider**.

## 1. Current-state assessment (main f005102, 15 October 2026)

An external review examined main at `ec16cf2`. Each of its findings, checked against the code now:

| # | Finding at ec16cf2 | State at f005102 | Where it is being resolved |
| --- | --- | --- | --- |
| R1 | Shared product/component data in the browser `DemoRepository`, sample project only | **Open on main.** Server-side product registry and `DemoRepository.ensureProject` in progress on `feature/project-management` (CR-PM-MS-1/2, ADR-0063) | C1, C2 (§3) |
| R2 | API host validates component allocations against `SAMPLE_TWIN` | **Open on main.** `TwinDirectory` port in progress (Requirements CR-PM-REQ-2, host CR-PM-API-3) | C2 |
| R3 | CAD Modeler saves documents only as files | **Open on main.** `services/cad` with document revisions in progress on `feature/cad` | C4 |
| R4 | Conceptualize's CAD/SysML integration references legacy mock objects | **Open.** Seed and demo use twin `CAD-…`/`SYS-…`; the reference schemes for CAD Modeler and SysML Modeler entities are agreed (C3) but not resolved by Conceptualize yet | C3, C5 |
| R5 | Some Requirements assistant operations depend on an open Requirements view | **Confirmed.** `RequirementsView` calls `setAssistantConnection` on mount; API-mode operations fail with the tab closed | C9 |
| R6 | Service-proposal handlers in browser memory | **Confirmed.** `apps/workspace/src/assistant/serviceProposals.ts` keeps `apply`/`undo` closures in a `Map`; a reload loses them | C9 |
| R7 | SysML idempotency recorded after the mutation | **Fixed** in SysML sprint 2 (4807ad8, merged 97c64cb): record and outbox events written in the commit transaction. Remaining: lost-response, failure-around-commit and key-reuse-with-different-input tests | C10 |
| R8 | Calculation uncertainty by input-range vertex sampling | **Fixed** in R3 (merged f005102): `quality: 'exact'` only when monotonicity is proven, otherwise a sound `'enclosure'` with a sampled `inner` range; `'vertices'` kept only to verify v1 manifests; constraints `uncertain` unless proven. Remaining: downstream preservation in Conceptualize evidence and trade studies | C11 |
| R9 | Default tabs open the illustrative SysML and mock CAD tools | **Open.** `DEFAULT_OPEN_TOOLS = ['requirements', 'sysml', 'cad', 'conceptualize']` | C12 |
| R10 | Progress reports and ADR statuses behind merged work | **Partly addressed** (ADR index lists all proposed ADRs, roadmap/About updated); progress files of merged sprints still need reconciling | §5 |

Also merged since the review: SysML Modeler sprint 2, Design Reasoning R1 and R3, SDK 1.6 (units, settings) and
1.7 (projects, artifact sources), the AI connection (provider-neutral backend, Settings centre, server-enforced
access policy). In progress on branches: Project Management (host and model-service changes), CAD (`services/cad`),
Conceptualize (design knowledge C1–C6, C9, C10 at cf33f80; Project Management adapters), Requirements (artifact
source, `TwinDirectory`), SysML sprint 3.

## 2. Acceptance workflow (shared by every agent)

Run from an **empty database** with a **newly created example** (no actuator or drill-holder IDs; those stay
fixtures, templates and tutorials):

1. Create a genuinely empty project through the application.
2. Create a requirement, a function, several candidate concepts and an explicit design decision.
3. Create real SysML Modeler elements and a real CAD Modeler part, linked to the selected concept and to the same
   product/component identity.
4. Run a deterministic calculation on revision-pinned engineering inputs, with units, assumptions, applicability
   and provenance.
5. Save the project, close the application, restart the services and reopen it in a fresh browser session.
6. Recover every committed artifact, relationship, revision and decision without relying on earlier browser memory.
7. Change a requirement or design parameter and show affected calculations, decisions and implementations,
   distinguishing demonstrated from possible impact.
8. Create and reopen a project baseline containing exact module revisions.
9. Export the project and restore it into a clean environment, preserving internal relationships and revision
   references.
10. Execute supported engineering operations through the assistant boundary with the relevant module tabs closed,
    using the same validation as the UI.

Contract adapters are fine for module development but **do not satisfy this milestone**. Report adapter-backed
steps separately. Live model access needs the owner's credentials: verify the operation boundary with the fake
provider and report the live-provider step as unverified.

The workflow is committed as an executable test (`tests/e2e`, §5), not a scratch script.

## 3. Shared contracts and integration backlog

| ID | Contract (decision) | Owner | Dependents | Acceptance | Blocker / state |
| --- | --- | --- | --- | --- | --- |
| C1 | **Project identity and provisioning.** Project Management creates the project and its memberships in one transaction. Modules create their per-project space lazily on first write and expose an optional idempotent `provision()`; Project Management records a per-module state (`pending`, `ready`, `not-needed`, `failed`) and retries. No module inserts sample data for a project unless it was created from an explicit template or fixture. `PRJ-ACT100` is a registered legacy project | Project Management | all modules | steps 1, 5, 6 | PM host work in progress |
| C2 | **Product structure home.** Authoritative server-side product registry in Project Management (`ArtifactRef { module: 'product', kind: 'product-element', id: <uuid>, revision }`, ADR-0063). The browser twin becomes a projection and cache for the illustrative tools; `PRJ-ACT100` components are imported with their twin IDs as aliases (additive, never reassigned). Requirements validates allocation targets through the host `TwinDirectory` backed by the registry | Project Management; Requirements for its port | Requirements, Conceptualize, SysML, CAD | steps 2, 3, 6 | PM MS-1/2, API-3; Requirements REQ-2 |
| C3 | **Canonical references and revisions.** `ArtifactRef { module, kind, id, revision? }`. `revision` is the owning module's immutable, monotonically increasing version of that artifact (Requirements revision; Concept/Function/Decision revision; SysML commit number on the project's default branch; CAD document revision; product-element revision). With `revision` the reference is pinned; without it, it deliberately follows the latest. Kinds: `requirement`, `concept`/`function`/…, `sysml-model-element` (`<projectId>/<elementId>`), `cad-modeler-entity` (`<documentUuid>/<entityId>`), `product-element`. The registry maps each to one global `artifactId` (UUID) and never changes native IDs | coordinator | all | steps 3, 6, 8, 9 | agreed |
| C4 | **CAD persistence.** `services/cad`: immutable document revisions, If-Match concurrency, Idempotency-Key recorded in the write transaction, transactional outbox, entitlement `tool:cad` on the server, project-scoped. File save/open remain as export/import. Regeneration is deterministic from the stored native model; the service never stores derived geometry as authoritative | CAD | Project Management, Conceptualize, SysML | steps 3, 5, 6, 8 | in progress |
| C5 | **Cross-module resolution and registration.** Each module exposes an SDK 1.7 `ArtifactSource` (list, describe, subscribe over its outbox; optional provision/export/import). Project Management indexes summaries and runs a reconciliation scan; an unresolved reference is shown as `missing` or `module unavailable`, never deleted. Browser resolution of SysML Modeler and CAD Modeler references for other modules goes through `PlatformServices.sysml` / `PlatformServices.cad` read clients (SDK 1.8, coordinator) | each module; coordinator for the SDK | Conceptualize, Project Management, AI | steps 3, 6 | CR-PM-REG-1..4 in progress; SDK 1.8 pending |
| C6 | **Project baselines and export snapshots.** A project baseline is an immutable set of exact `ArtifactRef` revisions plus each module's head revision at capture time; because module revisions are immutable, the set is consistent without a global lock. Export writes the open `ews-project-package` (ADR-0064) by asking each module to export at the pinned revisions; import restores (same IDs) or copies (new project, IDs remapped with an explicit map), and parks payloads of absent modules | Project Management | all | steps 8, 9 | after C1–C5 |
| C7 | **Partial failure and recovery.** No distributed transaction. Multi-module operations (project create/delete/archive, baseline capture, export, import, multi-module proposals) are persisted operation records with steps and observable states (`pending`, `running`, `succeeded`, `failed`, `compensated`). Each step is idempotent (key `<operationId>:<step>`), resumable after restart, and either compensated or left in an explained failed state; a reconciliation job finishes or reports them | Project Management; AI for proposals | all | steps 5, 6, 9 | design in ADR-0062/0065 |
| C8 | **Migration of browser data.** Existing `DemoRepository` data (localStorage, `PRJ-ACT100`) is imported into the server only by an explicit, idempotent, user-confirmed action with a preview and a conflict report; IDs and revisions are kept, nothing is silently reassigned, the browser copy is not deleted | Project Management (model-service changes under review) | illustrative tools | regression flows | after C2 |
| C9 | **Headless AI operation boundary** (amends the AI brief, §4) | AI connection; each module for its operations | all | step 10 | new |
| C10 | **SysML retry safety.** Mutation, idempotency record and outbox in one transaction (done). Add tests: concurrent duplicates, retry after a lost response, failure around commit, key reuse with different input (rejected with 422) | SysML | AI, Project Management | step 10 | tests to add |
| C11 | **Uncertainty semantics end to end.** Results carry `kind: 'point' \| 'sampled-range' \| 'bounds'` and, for bounds, `quality: 'exact' \| 'enclosure'`; satisfaction over a range is `satisfied`/`violated` only when proven, else `uncertain`. Conceptualize evidence, trade studies and reasoning outputs store and display these qualifications unchanged; a reproducible manifest never implies model validity or requirement satisfaction | Design Reasoning (engine); Conceptualize (storage, display) | AI | steps 4, 7 | engine done; downstream open |
| C12 | **Real modules as integration targets.** New projects open Requirements, Conceptualize, SysML Modeler and CAD Modeler by default; the illustrative SysML and mock CAD tools stay available, labelled "Demo", in `PRJ-ACT100` and template projects, and through the palette elsewhere. Retirement of the legacy tools follows the proposed replacement ADRs (CAD CR-CAD-4, SysML) with non-destructive migration | coordinator (registry), Project Management (per-project defaults) | all | step 1 | after C1 |
| C13 | **Project scoping.** Caches, sessions, assistant conversations, proposals, events/SSE subscriptions and document state are keyed by project. Servers reject writes whose target resource belongs to another project than the path or proposal. Tests switch between two projects and attempt cross-project writes | every module; AI; Project Management | all | steps 1, 6, 10 | new |

## 4. AI brief amendment (headless operation boundary, C9)

Amends [ai-connection.md](ai-connection.md). A provider connection alone does not complete AI integration.

1. Engineering operations work without mounting the corresponding UI. Assistant actions are registered as
   **headless contributions** (the generic registry from CR-PM-WS-2 / design reasoning CR-A2) and receive their
   services through approved platform contracts (`PlatformServices`), never through connections set up by a view.
   Requirements removes the dependency on `RequirementsView` (`setAssistantConnection`) in its operations.
2. Mutations are routed to the authoritative module service.
3. Proposals are **serializable, versioned data** (ADR-0042): operations with module, operationId, arguments,
   expected revisions, project ID, actor, idempotency keys, and the preview shown. They are persisted by
   `services/assistant` so that a proposal can be reopened after a restart. Closures remain only as a fallback for
   modules that have not moved, and are labelled as such.
4. At Apply the platform revalidates identity, permissions, project scope, expected revisions and idempotency, then
   executes through the module service. A stale or conflicting proposal is explained ("REQ-12 changed since the
   preview: revision 3 → 4") and never applied with a changed intention; the user can refresh the preview.
5. Engineering-operation coverage and view-control coverage are measured separately in the capability inventory.
6. Behavioural tests: the same invalid input is refused identically by the UI path and the AI path (validation
   parity); every engineering operation in the inventory is available and succeeds with all tool tabs closed.
7. The approved autonomy policy is unchanged: the AI reads, calculates and drafts within its permitted scope;
   durable changes require a person's preview and Apply.

## 5. Increments and reporting

Small, runnable increments, each merged separately after review:

| Increment | Content | Acceptance steps |
| --- | --- | --- |
| I1 Persistence foundation | C1, C2 (registry and Requirements port), C4, C10, C13 tests; `tests/e2e` package with the regression flows | 1, 2 (requirement, function, concepts, decision), 5, 6 |
| I2 Real links | C3, C5 (artifact sources, SDK 1.8 read clients), Conceptualize resolution of SysML/CAD Modeler and product references, C12 defaults | 3, 6 |
| I3 Calculation and impact | Conceptualize calculation models (CR-C8) with C11 qualifications; reasoning scenario against the real Conceptualize API; impact across modules | 4, 7 |
| I4 Baselines and portability | C6, C7, C8 | 8, 9 |
| I5 Headless AI | C9: headless contributions, persisted declarative proposals, revalidation, parity tests | 10 |

After each increment the coordinator reconciles progress files, ADR statuses, `docs/roadmap.md` and the About page
(`apps/workspace/src/platform/capabilities.ts`); runs `npm run check`, `npm run build`, `npm run build:harnesses`,
`npm run req:test:db`, `npm run concept:test:db` and the committed browser flows; and reports the exact revision,
startup commands, a short walkthrough and remaining limitations.

**Committed browser tests.** `tests/e2e` (created 15 October 2026; `npm run e2e`, see its README) uses playwright-core (Apache-2.0) driving the
installed Chrome. It holds the platform regression flows and the milestone workflow; module agents add their flows
there instead of only in session scratch folders.

## 6. Briefs and contracts amended by this document

[ai-connection.md](ai-connection.md) (§4 here), [project-management-contracts.md](project-management-contracts.md)
(C1, C2, C6–C8, C12, C13), [cad-program-contracts.md](cad-program-contracts.md) (C4, C5),
[sysml-program-contracts.md](sysml-program-contracts.md) (C5, C10), [conceptualize-contracts.md](conceptualize-contracts.md)
(C3, C5, C11), [design-reasoning-governance.md](design-reasoning-governance.md) (C11),
[requirements-contracts.md](requirements-contracts.md) (C2, C9). Module priorities:

- **CAD:** persistence, shared references and regeneration integrity before more features.
- **SysML:** semantic correctness, persistence and cross-module references before more diagram types.
- **Conceptualize:** resolve the real modules' references; preserve calculation qualifications.
- **Requirements:** headless operations; product-element allocation through the port.
- **Project Management:** C1, C2, C7, C13 first; UI after the server contracts hold.
- **AI:** C9.
- **Design Reasoning:** C11 downstream; then the scenario on the real Conceptualize API.

# Project Management: progress

Brief: [project-management.md](project-management.md). Contracts: [project-management-contracts.md](project-management-contracts.md).
Architecture set: [docs/modules/projects](../modules/projects/README.md). Maintained by the Project Management agent.

- [x] Phase A: inspection, architecture, information model, API and schema design, registration and provisioning contract, product-structure ADR, interchange package, phased plan, backlog (15 October 2026)
- [x] Coordinator approval of phase A (15 October 2026: D1–D9 approved; answers Q1–Q6 below)
- [x] Phase B: project core in own packages (registry, lifecycle, work items, milestones, documents, blob store)
- [x] SDK 1.7.0 (merged to main as 39daa6c)
- [x] Integration milestone 1, increment I1 (C1, C2, C13, MS-1/2, WS-1 with C12; C7/C8 designs) — **checkpoint, ready for coordinator review**
- [ ] I2–I5 (registration adapters by module owners, baselines, export/import, operation records, browser import, headless AI)
- [ ] Brief §9 acceptance workflow complete

## Phase A deliverables

| Deliverable | File |
| --- | --- |
| Repository inspection, overlaps, conflicts | [inspection.md](../modules/projects/inspection.md) |
| Architecture | [architecture.md](../modules/projects/architecture.md) |
| Information model and relationships | [information-model.md](../modules/projects/information-model.md) |
| API specification (HTTP + SDK 1.7 proposal) | [api.md](../modules/projects/api.md) |
| Schema design | [schema.md](../modules/projects/schema.md) |
| Registration and provisioning contract | [registration-and-provisioning.md](../modules/projects/registration-and-provisioning.md) |
| Interchange package | [interchange-package.md](../modules/projects/interchange-package.md) |
| Lifecycle and persistence guarantees | [lifecycle-and-persistence.md](../modules/projects/lifecycle-and-persistence.md) |
| Views as projections | [views.md](../modules/projects/views.md) |
| AI operations | [ai-operations.md](../modules/projects/ai-operations.md) |
| Phased plan and backlog | [plan.md](../modules/projects/plan.md) |
| Proposed ADRs | 0060–0068 in [docs/decisions](../decisions/) (index not edited) |

Baseline before any change (e83c098): `npm run check` exit 0, 33 test files passed, 1 skipped; 661 tests passed, 1 skipped.

## Decisions requested from the coordinator

| # | Decision | Proposal | ADR |
| --- | --- | --- | --- |
| D1 | Placement and scope | `services/projects` + `packages/projects-client` + `apps/workspace/src/projects`; registry indexes, never copies | 0060 |
| D2 | Global artifact identity | Registry UUID per artifact ↔ native ref; native refs unchanged | 0061 |
| D3 | Registration contract (shared) | SDK `ArtifactSource` adapters per module over their outboxes + reconciliation; system principal; client-attested twin inventory | 0062 |
| D4 | Provisioning | Membership in the creation transaction; optional `provision` per module; binding no-seed rule with contract tests | 0062 |
| D5 | Product-structure home and twin migration | Product registry in Project Management (option A, splittable to a service later); twin components imported as aliases and projected read-time; Requirements `TwinDirectory` backed by it | 0063 |
| D6 | Interchange | `ews-project-package` ZIP with schemas and per-module open payloads; restore/copy import | 0064 |
| D7 | Delete semantics | Soft delete with retention; never delete module data | 0065 |
| D8 | Archived projects read-only for every module | Host `roleOf` downgrades to reader for archived projects, null for deleted (CR-PM-API-4) | 0065 |
| D9 | Project baselines | Pinned module versions per artifact; checkpoint vs released | 0067 |

Open questions: see the end of this file.

## Change requests to the coordinator

Each CR names the owner, the exact shape and whether it blocks a phase. None has been applied.

### SDK (coordinator applies; proposed as SDK 1.7.0, additive)

**CR-PM-SDK-1 — `contract/projects.ts`, `PlatformServices.projects`, current project, `ArtifactModule` values** (blocks phase C)

```ts
// packages/platform-sdk/src/contract/projects.ts  (new; full text in docs/modules/projects/api.md §4)
export const PROJECTS_CONTRACT_VERSION = '1.0.0'
export interface ProjectSummary { id: string; key: string; name: string; status: 'planning' | 'active' | 'on-hold' | 'completed' | 'cancelled'; state: 'active' | 'archived' | 'deleted'; role: 'reader' | 'editor' | 'reviewer' | 'administrator'; updatedAt: string; revision: number }
export interface ArtifactSummary { artifactId: string; ref: { module: string; kind: string; id: string }; key: string; title: string; category: string; lifecycle: 'working' | 'in-review' | 'released' | 'superseded' | 'retired'; version: { value: number | string; label?: string }; availability: 'available' | 'module-unavailable' | 'missing-in-module' | 'not-entitled'; open?: { toolId: string; params: Record<string, string> } }
export type ProjectsEventType = 'project.created' | 'project.updated' | 'project.archived' | 'project.restored' | 'project.deleted' | 'project.members-changed' | 'artifact.registered' | 'artifact.updated' | 'artifact.availability-changed' | 'link.created' | 'link.removed' | 'work-item.created' | 'work-item.updated' | 'milestone.changed' | 'document.changed' | 'baseline.created' | 'baseline.released'
export interface ProjectsEvent { eventId: string; type: ProjectsEventType; projectId: string; entityId: string; committedRevision: number; occurredAt: string; actor: string }
export type ProjectsErrorCode = 'not-found' | 'conflict' | 'invalid' | 'forbidden' | 'unauthenticated' | 'unavailable'
export class ProjectsServiceError extends Error { constructor(readonly code: ProjectsErrorCode, message: string, readonly details?: Record<string, unknown>) { super(message); this.name = 'ProjectsServiceError' } }
export interface ProjectsService {
  readonly contractVersion: string
  readonly mode: 'api' | 'demo'
  list: (query?: { q?: string; state?: 'active' | 'archived' | 'deleted' | 'all'; limit?: number; cursor?: string }) => Promise<{ items: ProjectSummary[]; nextCursor?: string }>
  get: (projectId: string) => Promise<ProjectSummary | undefined>
  resolve: (projectId: string, refs: { module: string; kind: string; id: string }[]) => Promise<ArtifactSummary[]>
  artifacts: (projectId: string, query?: { q?: string; module?: string; category?: string; limit?: number; cursor?: string }) => Promise<{ items: ArtifactSummary[]; nextCursor?: string }>
  subscribe: (projectId: string, listener: (event: ProjectsEvent) => void) => () => void
}
export interface CurrentProject { projectId: string; key: string; name: string; role: ProjectSummary['role'] }

// contract/requirements.ts
export interface PlatformServices {
  // … existing
  /** Project Management (SDK 1.7): projects and the artifact registry. */
  projects?: ProjectsService
}

// contract/tool.ts — SharedContext (optional, additive; projectId unchanged)
  /** The open project as the platform knows it (SDK 1.7); absent in hosts without Project Management. */
  project?: CurrentProject

// contract/concepts.ts — ArtifactModule (additive values; 'conceptualize' also requested by design reasoning CR-S1)
export type ArtifactModule = 'requirements' | 'sysml' | 'cad' | 'analysis' | 'twin' | 'external' | 'projects' | 'product' | 'conceptualize'
```

Migration for tools: none. Validated with `npm run check`, harnesses.

**CR-PM-SDK-2 — `contract/artifacts.ts` (`ArtifactSource`, server-side, framework-free)** (blocks phase D)

Exact TypeScript in [registration-and-provisioning.md §3](../modules/projects/registration-and-provisioning.md#3-sdk-contract-proposed-packagesplatform-sdksrccontractartifactsts-sdk-17-framework-free):
`ARTIFACT_SOURCE_CONTRACT_VERSION`, `NativeRef`, `ArtifactLifecycle`, `ArtifactCategory`, `ArtifactKindInfo`,
`ArtifactDescriptor`, `ArtifactChange`, `ArtifactPage`, `ProvisionRequest`, `ProvisionResult`, `ArtifactSource`,
`ModulePayload`, `ModuleImportReport`. Exported from the framework-free entry (`@ews/platform-sdk`) so services
(which may import only the SDK) can implement it.

**CR-PM-SDK-3 — destructive confirmation on service proposals** (blocks the `projects.delete_project` action only)

```ts
// contract/assistant.ts, ServiceProposal (additive)
  /** Destructive change: the platform asks the person to type `phrase` before Apply is enabled (SDK 1.7). */
  confirmation?: { phrase: string; prompt: string }
```

### API host and platform (`services/api`; agent may append after approval in `COORDINATOR REVIEW:` commits)

**CR-PM-API-1 — platform membership port and routes** (blocks phase C)

```ts
// services/api/src/platform/memberships.ts (new)
import type { PoolClient } from 'pg'
export type Role = 'reader' | 'editor' | 'reviewer' | 'administrator'
export interface MembershipPort {
  /** Runs inside the caller's transaction (same PostgreSQL database), so project creation and membership commit together. */
  set(db: Pick<PoolClient, 'query'>, input: { projectId: string; userId: string; role: Role; actor: string }): Promise<void>
  remove(db: Pick<PoolClient, 'query'>, input: { projectId: string; userId: string; actor: string }): Promise<void>
  list(db: Pick<PoolClient, 'query'>, projectId: string): Promise<{ userId: string; name: string; role: Role }[]>
  userExists(db: Pick<PoolClient, 'query'>, userId: string): Promise<boolean>
}
export function platformMemberships(): MembershipPort
```

Additive migration `services/api/src/platform/migrations/0003_membership_events.sql`: append-only
`platform.membership_events (id bigserial, project_id, user_id, role, action 'set'|'removed', actor, at)`;
the port writes one row per change. HTTP: none new on `/api/platform/v1` (membership is managed through
`/api/projects/v1/projects/{id}/members`, which calls the port). `GET /api/platform/v1/me` unchanged.

**CR-PM-API-2 — system principal for in-process registry adapters** (blocks phase D)

`identity()` gains `internalPrincipal(): { headers: Record<string,string> }`: a random per-process token
(`X-Internal-Token`, 32 bytes, generated at startup, never logged or returned) that `authenticate` maps to
`{ userId: 'system:projects', entitlements: <all tool entitlements> }`, accepted only for GET requests;
`roleOf('system:projects', any)` returns `'reader'`. Used by Project Management's interim contract-test
adapters (`app.inject`) until modules ship `ArtifactSource` implementations, which call their own stores
directly and need no principal.

**CR-PM-API-3 — Requirements allocation targets from the product registry** (blocks phase E; needs ADR-0063)

`buildServer` passes Requirements `twin: composeTwinDirectory(SAMPLE_TWIN, productTwinDirectory(pool))`,
where `@ews/projects-service` exports `productTwinDirectory(pool): TwinDirectory` (structurally the
Requirements `TwinDirectory` interface: `lookup(projectId, ids)`, `description`) resolving product element
UUIDs and aliases, returning `type: 'assembly' | 'part'` for those kinds and `'product-element'` otherwise.
Requirements change (CR-PM-REQ-2): accept `'product-element'` in `ALLOCATABLE_TYPES`.

**CR-PM-API-4 — archived/deleted projects for every module** (phase C)

Host `roleOf(userId, projectId)` consults `@ews/projects-service` `projectState(pool, projectId)`:
`archived` → at most `'reader'`; `deleted` → `null`; unknown to the registry (legacy) → unchanged. One
place, no module change; modules already map reader to read-only.

**CR-PM-API-5 — host registration** (phase C; append-only edits in my limited ownership, after approval)

`server.ts`: `migrateProjects(pool)` in `prepareDatabase`; `createProjectsEventHub`; `registerApiDocs` for
`/api/projects/v1/docs`; `app.register(projectsPlugin, { prefix: '/api/projects/v1', pool, events, blobs:
localBlobStore(cfg.storageDir), authenticate, roleOf, memberships: platformMemberships(), artifactSources,
settings, production })`. `main.ts`: log line. `boundaries.test.ts`: `'services/projects': /^@ews\/platform-sdk$/`,
`'packages/projects-client': /^@ews\/platform-sdk$/`, `services/api` + `projects-service`, `apps/workspace` +
`projects-client`. Root `package.json`: `projects:test:db`. `@ews/api` dependency `@ews/projects-service`.

### Settings (AI connection agent's service, coordinator routes)

**CR-PM-SET-1 — project settings definitions and a write port** (phase C)

`@ews/projects-service` exports `PROJECT_SETTINGS_PAGE = { id: 'projects', title: 'Project' }` and
`PROJECT_SETTING_DEFINITIONS: SettingDefinition[]`; the host calls
`settingsRegistry.register(PROJECT_SETTINGS_PAGE, PROJECT_SETTING_DEFINITIONS)`. All `scope: 'project'`,
`requiresPermission: 'administrator'`:

| ID | Type | Default |
| --- | --- | --- |
| `projects.units.system` | enum si / imperial / mixed | si |
| `projects.units.length` | enum mm / m / in / ft | mm |
| `projects.units.mass` | enum kg / g / lb | kg |
| `projects.units.force` | enum N / kN / lbf | N |
| `projects.units.temperature` | enum degC / K / degF | degC |
| `projects.conventions.coordinate-system` | enum right-handed-z-up / right-handed-y-up | right-handed-z-up |
| `projects.conventions.drawing-projection` | enum first-angle / third-angle | first-angle |
| `projects.standards.applicable` | string (≤ 1000; comma-separated list of standard identifiers and editions) | "" |
| `projects.standards.tolerancing` | string (≤ 200), e.g. "ISO 2768-mK" | "" |
| `projects.modules.<module>.enabled` | boolean, one per installed module | true |
| `projects.retention.deleted-days` | number 7–3650, integer, unit d | 30 |

Port passed to the projects plugin:

```ts
export interface ProjectSettingsPort {
  /** Writes project-scoped values as `actor` (who must be administrator); validated by the settings registry. */
  write(projectId: string, values: Record<string, boolean | number | string | null>, actor: string): Promise<{ revision: number }>
  /** Effective project-scoped values for display in the project context. */
  read(projectId: string): Promise<Record<string, boolean | number | string | null>>
}
```

Initial settings from the wizard are written after the creation transaction commits (the creator is then
administrator); failures are recorded in `module_states` (`module: 'settings'`) and retried; the requested
values stay in the creation record as provenance.

### Modules (coordinator routes to the owning agents)

| CR | Owner | Request | Blocks |
| --- | --- | --- | --- |
| CR-PM-REG-1 | Requirements | `createRequirementsArtifactSource(pool, events): ArtifactSource` in `@ews/requirements-service` per [registration §4](../modules/projects/registration-and-provisioning.md#4-per-module-mapping-proposed-each-is-a-change-request-to-the-module-owner); kinds `requirement`, `requirement-collection`, `requirements-baseline`; `provision` → `not-needed`; later `exportProject`/`importProject` (`ews-requirements-json` + ReqIF) | D (F for export) |
| CR-PM-REQ-2 | Requirements | Accept `'product-element'` as an allocation target type (with CR-PM-API-3) | E |
| CR-PM-REG-2 | Conceptualize | `createConceptsArtifactSource(pool, events)`; kinds per registration §4 | D |
| CR-PM-CON-1 | Conceptualize | Accept `ArtifactRef.module` `'product'` (product elements) and `'projects'` (documents as evidence) in implementations and evidence | E |
| CR-PM-REG-3 | SysML Modeler | `createSysmlArtifactSource(repo, events)`; register SysML projects, tags and named owned elements at default-branch heads | D |
| CR-PM-SYS-1 | SysML Modeler | Reconcile CR-SYSML-03 so SysML elements can `represent` product elements (`ArtifactRef module 'product'`); until then Project Management `represents` links are used | E |
| CR-PM-REG-4 | CAD Modeler | `createCadArtifactSource(pool, events)` in `@ews/cad-service`; documents and their parts/assemblies/configurations | D |
| CR-PM-CAD-1 | CAD Modeler | ADR-0026 mapping to product elements (`module 'product'`) instead of twin components for new projects | E |

### Workspace and model service (coordinator)

**CR-PM-MS-1 — multi-project twin, empty for new projects** (blocks phase C)

```ts
// packages/model-service DemoRepository (additive)
/** Creates an empty twin database for a project (no seed). PRJ-ACT100 keeps its seeded data and storage key. */
ensureProject(project: { id: string; name: string }): Promise<void>
/** Projects with a twin in this browser. */
listProjects(): Promise<{ id: string; name: string }[]>
```

`loadModel(projectId)` works for any ensured project; storage per project `ews.twin.<projectId>.v1`
(`ews.demo-repository.v3` unchanged for `PRJ-ACT100`); the seed applies only to `PRJ-ACT100`; an empty
project snapshot has no objects, scenarios or relationships and one configuration `CFG-BASE`. Test with the
existing fixture that `PRJ-ACT100` data is untouched.

**CR-PM-MS-2 — product-registry projection** (phase E, with ADR-0063): `composeSnapshot` composes server
product elements with aliases like requirements (ADR-0012); component writes go to the product API when
available; twin components read-only fallback; one-time "differences from the server" notice.

**CR-PM-WS-1 — current project in the shell** (blocks phase C): Project Home when no project is open or
from a header "Projects" entry; project switcher in the header (replacing the static project label);
`start()` takes the selected project ID; session state keyed by project; `services.projects` built in
`services.ts` from `@ews/projects-client` with the same API/demo setting; `SharedContext.project`.
Project Management supplies the screens in `apps/workspace/src/projects/**`; the coordinator wires the entry
points (or authorises me to append them in `COORDINATOR REVIEW:` commits, contracts §5).

**CR-PM-WS-2 — headless platform module contributions** (blocks phase C help and AI): a workspace
registration `registerPlatformModule({ id: 'projects', name: 'Project Management', help: HelpManifest,
settings?: SettingsContribution, assistant?: AssistantContribution })` that the Help Service, the Settings
centre and the assistant executor read like tool contributions. Same need as design reasoning CR-A2; one
mechanism for both.

**CR-PM-WS-3 — capability inventory**: `CapabilityModule` gains `'projects'`; I append the entries.

## Coordinator answers (15 October 2026)

D1–D9 approved as proposed (ADRs stay Proposed until the acceptance workflow validates them). Q1: the mock CAD
dimension delegation stays twin-only (the mock tool operates on PRJ-ACT100 only). Q2: twin components of new
projects are a read-only fallback. Q3: PRJ-ACT100 registered as a legacy project (fixture). Q4: any authenticated
user may create projects and becomes administrator. Q5: settings behind a port with a contract-test adapter until
the settings service is on main (it now is; the real port is wired). Q6: host roleOf downgrade, with a test per
hosted service. Assignment change: CR-PM-WS-2 (generic headless platform-module registry) belongs to the AI
connection agent; `projects.*` assistant actions register through it once it is on main.

## Status by contract (integration milestone 1)

Vocabulary: implemented / integrated / tested / owner-accepted (integration-milestone-1.md). Nothing here is
integrated into `main` except SDK 1.7.0; everything else is on `feature/project-management`.

| Item | State | Evidence |
| --- | --- | --- |
| Project registry and lifecycle (create blank or template, edit with If-Match, archive, restore, soft delete with X-Confirm and retention, duplicate configuration, recents, search/filter/sort) | implemented, tested | `services/projects/test/projects.api.test.ts` |
| Members through the platform membership port (one transaction with creation; last administrator protected) | implemented, tested | idem; `services/api/src/platform/memberships.ts` |
| Archived projects read-only in every hosted service (Q6) | implemented, tested | archive test: Requirements, Conceptualize, SysML writes refused (CAD when services/cad is hosted) |
| C1 provisioning states (pending → ready / not-needed / failed; retry on open and on request; no-seed rule) | implemented, tested | `product.scoping.test.ts` (C1) |
| C2 product registry (elements, revisions, unit-checked properties, breakdowns with cycle check, tree) | implemented, tested | `product.scoping.test.ts` (C2) |
| C2 Requirements allocation through the registry (CR-PM-API-3) | implemented, tested for assembly/part; product/system kinds wait for CR-PM-REQ-2 | idem |
| C2 PRJ-ACT100 components imported with twin IDs as aliases | implemented, tested | `legacyProduct.test.ts` (fixture = model-service seed), `product.scoping.test.ts` |
| C13 project scoping (two projects, cross-project writes refused, per-project events, per-project sessions and twin) | implemented, tested | `product.scoping.test.ts` (C13), `DemoRepository.test.ts` (MS-1) |
| Work items, milestones, links, registry of PM entities, documents with versioned blobs, audit, outbox, SSE | implemented, tested | `projects.api.test.ts` |
| Durability across a full restart of API and PostgreSQL | tested | `persistence.test.ts`, `acceptance.i1.test.ts`; browser after a hard kill (below) |
| MS-1 multi-project twin (empty for new projects, PRJ-ACT100 unchanged) | implemented, tested | `DemoRepository.test.ts` |
| MS-2 product projection into the workspace model (non-example projects) | implemented, browser-checked | `reopen-flow` below; unit test of `mergeProjections` |
| WS-1 current project, Project Home, New Project wizard, overview, switcher | implemented, browser-checked | `projects-flow` below |
| C12 default tools per project | implemented, browser-checked | idem |
| Project settings via the settings service (definitions registered, port wired) | implemented, browser-checked (wizard's unit system written; state ready) | overview screenshot |
| C7 operation records, C8 browser data import | designed (ADR-0069, ADR-0071) | — |
| Help pages, capability inventory entries, `projects.*` assistant actions | **not started** (actions wait for the WS-2 registry; help and inventory are next) | — |

## I1 acceptance (integration-milestone-1.md §2), 15 October 2026

| Step | Result | Ran against |
| --- | --- | --- |
| 1 Create a genuinely empty project | verified: API test (no artifacts in Project Management, Requirements, Conceptualize, SysML) and browser (wizard → new project, no example data, real-module tabs) | real services |
| 2 Requirement, function, candidate concepts, design decision | verified for requirement (Requirements), three candidate Concepts in an alternative set and a recorded decision with outcomes and rationale (Conceptualize); **function: not verified as a first-class entity** — a Concept with abstraction `function` was used, because Conceptualize Functions (cf33f80) are not on main yet | real services |
| 5 Save, close, restart services, reopen in a fresh session | verified: API test stops and restarts PostgreSQL and the API; browser check after a hard kill of the API and PostgreSQL, fresh browser context opening the project by URL | real services |
| 6 Recover every committed artifact, relationship, revision and decision | verified: snapshot before = after (project, requirement and its revisions, allocation to the product element, concepts, alternative set, decision, product structure, task and its link, registry, activity) | real services |

Database: empty apart from the development identities and the preserved PRJ-ACT100 fixture (development seed).

Browser flows (scratchpad `pw/projects/`; to move into `tests/e2e` when it exists): `projects-flow.mjs` 16/16
passed (example project unchanged, Project Home, wizard key suggestion, create and open, C12 tabs, empty project,
reopen after reload and in a fresh session, overview with module states and members, phone layout, switch back to
PRJ-ACT100 with its data intact, no page errors); `reopen-flow.mjs` 4/4 passed after a hard restart.

Checks at 84e02fb: `npm run check` 954 passed, 1 skipped; `npm run req:test:db` 26 files, 227 passed, 1 skipped.
Not run: `npm run build`, `npm run build:harnesses` (next checkpoint).

Known limitations: the header is cramped at 1600 px (configuration and scenario selects truncate; also before this
change, since the Settings button was added); the Project Settings page in the Settings centre needs the WS-2
registry (values are written by the wizard and the API today); the illustrative SysML and mock CAD tools are not yet
labelled "Demo" in the registry (coordinator, C12); ArtifactSource adapters are the module owners' (CR-PM-REG-1…4),
so the registry indexes only Project Management and product entities so far.

## Commits (feature/project-management)

ad9f768 phase A · 9b6e709 SDK 1.7.0 (COORDINATOR REVIEW) · 3f70afe phase B service · 69aa366 host API-1/2/4/5
(COORDINATOR REVIEW) · 737e067 product registry WIP · 12d8c35 merge main · 55cd7c2 C1/C2/C13 · 0adb037 host API-3
(COORDINATOR REVIEW) · 45ab78a projects-client · 04fa32c MS-1 (COORDINATOR REVIEW) · 2c834be Project Home, product
projection, I1 acceptance · 84e02fb WS-1, MS-2 (COORDINATOR REVIEW).

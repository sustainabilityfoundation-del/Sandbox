# Project Management: progress

Brief: [project-management.md](project-management.md). Contracts: [project-management-contracts.md](project-management-contracts.md).
Architecture set: [docs/modules/projects](../modules/projects/README.md). Maintained by the Project Management agent.

- [x] Phase A: inspection, architecture, information model, API and schema design, registration and provisioning contract, product-structure ADR, interchange package, phased plan, backlog (15 October 2026)
- [ ] Coordinator approval of phase A (requested 15 October 2026; **waiting**)
- [ ] Phase B: project core inside own packages (allowed before approval, contracts §4) — see "Phase B status"
- [ ] Phases C–F (plan: [plan.md](../modules/projects/plan.md))
- [ ] Blank-project acceptance workflow (brief §9)

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

## Phase B status (own packages only)

Not started at the time of the phase A report. Scope and acceptance criteria: [plan.md §3](../modules/projects/plan.md#3-phase-b-sprint-now).

## Open questions for the coordinator

1. **Q1 (ADR-0063):** the mock CAD dimension delegation after components move server-side: enforce it in the
   product API, or keep it twin-only until the mock CAD tool is retired?
2. **Q2 (ADR-0063):** twin components as read-only offline fallback (proposed) or editable offline with a later merge?
3. **Q3:** `PRJ-ACT100` in the registry: register it as a legacy project (migration 0002, owner `ada`, key
   `ACT100`) so it appears in Project Home — proposed yes; it keeps its ID and all data.
4. **Q4:** project creation rights: any authenticated user (proposed) or only users with a platform-level
   permission (none exists yet)?
5. **Q5:** settings service timing: phase C needs it on `main`; until then the wizard records requested settings in
   the creation record only and the Settings page is absent (no second store).
6. **Q6:** should modules refuse writes to archived projects themselves, or is the host `roleOf` downgrade
   (CR-PM-API-4) enough? Proposed: host downgrade.

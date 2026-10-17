# Artifact registration and project provisioning contract

Status: **Proposed shared contract** (contracts §2.3; coordinator decision). Decision: ADR-0062.
Index: [README.md](README.md). Change requests: CR-PM-SDK-2, CR-PM-REG-1…5, CR-PM-API-2 in the
[progress file](../../specifications/project-management-progress.md).

## 1. Goals

1. Every artifact a module creates in a project appears in the registry with one stable global ID, without
   the module calling Project Management in its write path (no new coupling, no distributed transaction).
2. The registry converges after missed events, restarts or a module being offline.
3. A module's artifacts survive the module being unavailable, disabled or unsubscribed.
4. A new project starts **empty in every module**; no module seeds data into it.
5. A new module integrates by implementing one interface; Project Management does not change.

## 2. Mechanism (preferred option from contracts §2.3)

```
module write ──tx──► module tables + module outbox      (unchanged)
                          │ publisher (existing)
                          ▼
              module EventHub.subscribe (in-process, existing)
                          │ ArtifactSource.subscribe(listener)       ← adapter supplied by the module
                          ▼
     projects registry consumer: dedupe by eventId → describe(refs) → upsert registry (tx + audit + outbox)
                          ▲
     reconciliation scan: list(projectId, cursor) → compare → upsert / mark missing (periodic + on demand)
```

- **Events** are the module's existing outbox events. The adapter maps them to `ArtifactChange` (below).
  Events carry IDs and revisions only, so the consumer calls `describe()` to read the summary; the module
  answers from its own tables with its own rules.
- **Reconciliation** runs (a) when a project is opened after the registry consumer was down, (b) every
  6 hours per active project (configurable), (c) on demand (`POST /projects/{id}/reconcile`), (d) before
  export and baseline creation. It pages through `list()` and compares (ref, version) pairs; differences
  are applied as registry updates, and records that the module no longer lists become
  `availability: 'missing-in-module'` (never deleted).
- **Synchronous registration** is offered for one case only: a Project Management operation that needs the
  global ID of an artifact the registry has not seen yet (for example linking a task to a requirement created
  a moment ago). `POST /projects/{id}/artifacts/resolve` calls `describe()` immediately and registers the
  result. Modules never call Project Management.

The adapters run inside the API host process. In a later split deployment the same interface can be
implemented over each module's HTTP API and SSE stream (`events` endpoints exist for every module); nothing
in the contract assumes in-process calls.

## 3. SDK contract (proposed `packages/platform-sdk/src/contract/artifacts.ts`, SDK 1.7, framework-free)

```ts
/**
 * Server-side artifact source: how a module tells Project Management which artifacts exist in a project.
 * Implemented by each module's service package (it reads its own tables); wired by the API host.
 * Read-only: Project Management never writes module data through this interface.
 */
export const ARTIFACT_SOURCE_CONTRACT_VERSION = '1.0.0'

/** Native reference without revision: identifies the artifact in its owning module. */
export interface NativeRef {
  module: string
  kind: string
  id: string
}

export type ArtifactLifecycle = 'working' | 'in-review' | 'released' | 'superseded' | 'retired'

export type ArtifactCategory =
  | 'product-element' | 'concept' | 'design-knowledge' | 'requirement' | 'model' | 'geometry'
  | 'analysis' | 'verification' | 'document' | 'work-item' | 'milestone' | 'baseline'

export interface ArtifactKindInfo {
  kind: string
  label: string
  category: ArtifactCategory
  /** Whether a user can open it in the module UI (deep link available). */
  navigable: boolean
}

/** Summary metadata a module publishes for one artifact. No content. */
export interface ArtifactDescriptor {
  ref: NativeRef
  key: string
  title: string
  /** The module's own state, verbatim, and its normalised lifecycle. */
  moduleState?: string
  lifecycle: ArtifactLifecycle
  version: { value: number | string; label?: string; at: string }
  createdAt: string
  createdBy: string
  modifiedAt: string
  modifiedBy: string
  /** Containing artifact in the module (SysML element → SysML project; CAD part → CAD document). */
  container?: NativeRef
  /** Module-owned relationships to report into the derived link index (optional). */
  relations?: { type: string; to: NativeRef; toRevision?: number }[]
  /** Deep link for the workspace, e.g. { toolId: 'requirements', params: { id } }. */
  open?: { toolId: string; params: Record<string, string> }
}

export type ArtifactChange =
  | { kind: 'upserted'; eventId: string; projectId: string; refs: NativeRef[]; occurredAt: string; actor: string }
  /** The module retired/archived/deleted it; the registry keeps the record and marks it. */
  | { kind: 'retired'; eventId: string; projectId: string; refs: NativeRef[]; occurredAt: string; actor: string }
  /** Something changed that the adapter cannot itemise (e.g. bulk import); reconcile the project. */
  | { kind: 'reconcile'; eventId: string; projectId: string; reason: string; occurredAt: string }

export interface ArtifactPage {
  items: ArtifactDescriptor[]
  nextCursor?: string
}

export interface ProvisionRequest {
  projectId: string
  /** 'blank' never creates artifacts. Content templates are a later extension (plan backlog B-07). */
  template: { id: string; content: 'blank' }
  actor: string
  /** Idempotency: the same key must give the same outcome. */
  idempotencyKey: string
}

export type ProvisionResult =
  | { status: 'provisioned'; createdRefs: NativeRef[] }     // for 'blank': always []
  | { status: 'not-needed' }                                  // module keys data by projectId; nothing to do
  | { status: 'failed'; retryable: boolean; message: string }

export interface ArtifactSource {
  readonly module: string
  readonly contractVersion: string
  /** Module display name and kinds it registers. */
  describeModule(): { name: string; kinds: ArtifactKindInfo[] }
  /** Current artifacts of a project, stable order, paged (reconciliation). Max 500 per page. */
  list(projectId: string, options?: { cursor?: string; limit?: number; kinds?: string[] }): Promise<ArtifactPage>
  /** Descriptors for the given refs; refs that do not exist (any more) are absent from the result. */
  describe(projectId: string, refs: NativeRef[]): Promise<ArtifactDescriptor[]>
  /** Committed changes for all projects, after commit, at least once. Returns unsubscribe. */
  subscribe(listener: (change: ArtifactChange) => void): () => void
  /** Optional: prepare a new project (must not create engineering artifacts for a blank template). */
  provision?(request: ProvisionRequest): Promise<ProvisionResult>
  /** Optional, interchange (ADR-0064): module payload for a project and its import. */
  exportProject?(projectId: string): Promise<ModulePayload>
  importProject?(projectId: string, payload: ModulePayload, options: { mode: 'restore' | 'copy'; idMap?: Record<string, string>; dryRun: boolean; actor: string }): Promise<ModuleImportReport>
}

export interface ModulePayload {
  module: string
  /** Module's own format and version, e.g. 'ews-requirements-json' '1.0.0', 'reqif' '1.2'. */
  format: string
  formatVersion: string
  files: { path: string; mediaType: string; bytes: Uint8Array }[]
  artifactCount: number
}

export interface ModuleImportReport {
  ok: boolean
  created: number
  /** Old native ID → new native ID (copy mode, or when the module mints new IDs). */
  idMap: Record<string, string>
  problems: { severity: 'error' | 'warning'; message: string; path?: string }[]
}
```

### 3.1 Rules for implementers

- `describe` and `list` read through the module's normal read path and permissions model, as the **system
  principal** (CR-PM-API-2): a non-login identity `system:projects` with read access to every project,
  accepted only by in-process adapters, never over HTTP.
- `subscribe` must deliver only committed changes and may repeat them; the consumer dedupes by `eventId`
  (stored for 7 days, same as module outbox retention).
- A module that cannot itemise a change sends `reconcile`. A module without events (none today) can omit
  `subscribe` behaviour by returning a no-op; reconciliation still converges.
- Lifecycle mapping (`lifecycle`) is the module's decision (proposed table in information-model.md §5).
- Adapters must not throw for unknown projects: an unknown project returns an empty page.

## 4. Per-module mapping (proposed; each is a change request to the module owner)

| Module | Events → `ArtifactChange` | `list`/`describe` from | Registered kinds | `provision` |
| --- | --- | --- | --- | --- |
| Requirements (CR-PM-REG-1) | `requirement.created/updated/restored/relationships-changed` → upserted; `requirement.archived` → retired; `requirements.baseline-created` → upserted (`requirements-baseline`); `requirements.import-completed`, `requirements.collection-changed` → reconcile | `requirements.requirements`, `collections`, `baselines` | `requirement`, `requirement-collection`, `requirements-baseline` | `not-needed` |
| Conceptualize (CR-PM-REG-2) | `concept.*` → upserted (concept, and decision for `concept.decision-recorded`); `concept.superseded` → upserted (lifecycle superseded) | `concepts`, `decisions`, `alternative_sets`, `trade_studies`, `evidence`, `implementations` | `concept`, `alternative-set`, `decision`, `trade-study`, `evidence`, `concept-implementation` (+ `function`, `assumption`, `constraint` after design reasoning CRs) | `not-needed` |
| System Model (CR-PM-REG-3) | `sysml.project-created` → upserted (`sysml-project`); `sysml.commit-created` on a default branch → upserted for changed *named owned* elements (from the commit's changes); `sysml.tag-created` → upserted (`sysml-tag`) | `sysml.projects`, `branch_elements` at default-branch head (named definitions/usages only), `tags` | `sysml-project`, `sysml-model-element`, `sysml-tag` | `not-needed` (SysML projects are created by the user in the modeler; a new platform project has none) |
| CAD Modeler (CR-PM-REG-4) | `cad.document-created`, `cad.revision-created` → upserted (document and its parts/assemblies/configurations from the revision); `cad.document-archived` → retired | `cad.documents`, latest `document_revisions` content | `cad-document`, `cad-modeler-entity` | `not-needed` |
| Shared twin (CR-PM-REG-5) | none server-side (browser store) | **Browser-reported**: the workspace posts the twin inventory of the open project (`POST /projects/{id}/artifacts/twin-inventory`, editor role) | `assembly`, `part`, `sysml-element`, `cad-representation`, `verification-record` | n/a. A new project's twin is empty (CR-PM-MS-1) |
| Product registry (PM, if ADR-0063) | internal | internal | `product-element`, `breakdown` | n/a |
| Project Management itself | internal (same transaction as the write) | internal | `task`, `issue`, `risk`, `milestone`, `document`, `project-baseline` | n/a |

The twin inventory is the only client-reported source. It is labelled **client-attested** in the registry
(`source: 'client-attested'`) because the server cannot verify it; it disappears when the product registry
replaces the twin's components (ADR-0063, phase 2), and the twin's SysML/CAD illustrative objects stay
client-attested until those tools are retired.

## 5. Provisioning: how a new project starts empty everywhere

What "provisioning" has to achieve, per module, was checked in the code (inspection.md §1):

| Module | What a new project needs | Seed risk |
| --- | --- | --- |
| All services | A membership row in `platform.project_memberships` for the creator (and invited members); otherwise every module answers 403 | — |
| Requirements | nothing (tables keyed by `project_id`) | `seedRequirements` only writes `PRJ-ACT100`, only when REQ-001's UUID is absent; never for other IDs |
| Conceptualize | nothing | `seedConcepts` only for `PRJ-ACT100` |
| SysML | nothing; a SysML project is created by the user when they start modelling | `seedSysml` only for `PRJ-ACT100` |
| CAD | nothing | none |
| Settings | project scope row appears with the first written value; defaults otherwise | — |
| Twin (browser) | an empty `ModelSnapshot` for the new project ID; today `DemoRepository` refuses any ID except `PRJ-ACT100` | `seedDatabase()` seeds the actuator; must apply only to `PRJ-ACT100` (CR-PM-MS-1) |
| Requirements allocation targets | a `TwinDirectory` that knows the new project's product elements | host's static `SAMPLE_TWIN` (CR-PM-API-3) |

Therefore the provisioning contract is small and explicit:

1. **Membership** is written in the project-creation transaction through the platform membership port
   (CR-PM-API-1). This is the step that makes the project exist for every module.
2. For each installed module, Project Management calls `provision?.()` after commit and records
   `projects.module_states(project_id, module, status, attempts, last_error, updated_at)`. For a blank
   template every current module answers `not-needed`; the call still exists so a future module that needs
   a container (or a content template) can create one, idempotently.
3. **No seed rule (binding):** a module must never create artifacts in a project it was not asked to
   populate. `provision` with `content: 'blank'` must return `createdRefs: []`; the contract test suite
   checks this for every adapter, and the acceptance test asserts zero registry entries and zero module
   artifacts after creating a blank project (`list()` on every source returns no items).
4. A module installed later sees existing projects without provisioning (data is keyed by project ID);
   `provision` runs lazily the first time the module is enabled for that project.
5. Disabling a module for a project (project setting `projects.modules.<module>.enabled`) hides it in the
   project's UI and stops provisioning; it does not delete anything and the registry entries remain.

## 6. Failure behaviour

| Situation | Behaviour |
| --- | --- |
| Module adapter absent (module not installed) | `module_states.status = 'unavailable'`; existing registry entries `availability: 'module-unavailable'`; views list the gap |
| Adapter throws / times out (5 s per call) | consumer retries with back-off (1 s → 5 min); reconciliation later; registry entries keep their last confirmed values and `confirmedAt` |
| Event for an unknown project | ignored after logging (the project may be in another installation) |
| `describe` omits a ref | the artifact no longer exists in the module: `availability: 'missing-in-module'`, lifecycle unchanged, record kept |
| Duplicate event | ignored (`projects.consumed_events (event_id)`) |
| Registry write fails | event not marked consumed; redelivered; module data unaffected |

## 7. Contract tests

`@ews/projects-client/contract-tests` exports `defineArtifactSourceContract(name, factory)` that every
module adapter runs in its own test suite (real PostgreSQL), checking: stable paging; `describe` of unknown
refs returns nothing; descriptors have keys, kinds from `describeModule()`, valid lifecycle values; changes
are delivered after commit only; `provision` for `blank` creates nothing; unknown project → empty page.
Until modules implement adapters, Project Management ships **contract-test adapters** for each module
(implemented against the module's HTTP API through `app.inject` with the system principal), clearly
labelled, so the acceptance workflow can run and report which steps use them (brief §9).

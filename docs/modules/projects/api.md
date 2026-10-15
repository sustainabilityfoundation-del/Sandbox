# Project and artifact API specification

Status: **Proposed** (phase A). The OpenAPI 3.1 document generated from the route registry
(`/api/projects/v1/openapi.json`, reference at `/api/projects/v1/docs`) becomes authoritative once implemented;
this page is the design. Index: [README.md](README.md).

## 1. Conventions (identical to Requirements and Conceptualize)

| Topic | Rule |
| --- | --- |
| Base path | `/api/projects/v1` (path-versioned) |
| Identity | `X-Dev-User` in development (refused in production); production: OIDC bearer at the host (not implemented) |
| Authorization | authentication + project role (`platform.project_memberships`); no tool entitlement; permission per operation in `x-permissions` |
| Concurrency | responses carry `ETag: "<revision>"`; writes to mutable records need `If-Match` or `expectedRevision`; stale → 409 `conflict` with `details.currentRevision` |
| Idempotency | `Idempotency-Key` on every POST that creates (required) and on other POSTs (optional); stored with the outcome **inside the write transaction**, replayed for 24 h; reuse with a different request → 422 |
| Provenance | `X-Source-Kind` (user, assistant, import), `X-Conversation-Id`, `X-Proposal-Id`, `X-Message-Id`; assistant writes must name their proposal |
| Dry run | `?dryRun=true` on consequential writes (create, duplicate, archive, delete, import, baseline, bulk): validates and returns the would-be result and effects with `dryRun: true`, commits nothing |
| Confirmation | destructive operations (delete, purge, import-replace) also need `X-Confirm: <project key>`; missing or wrong → 428 `invalid` with `details.confirmation` |
| Errors | `{ error: { code, message, details } }`; codes invalid (400/422/428), unauthenticated (401), forbidden (403), not-found (404), conflict (409), unavailable (503/500) |
| Pagination | `?limit=1..200&cursor=…`; response `{ items, nextCursor?, total? }` |
| Time | RFC 3339 UTC |
| Events | outbox; SSE at `/projects/{projectId}/events` (resume `after` / `Last-Event-ID`, `reset`); global stream `/events` for project-list changes of the caller |

## 2. Endpoints

`{p}` = `/projects/{projectId}`. Role column: minimum role (R reader, E editor, V reviewer, A administrator;
"auth" = any authenticated user).

### 2.1 Projects and lifecycle

| Method and path | Operation | Role | Notes |
| --- | --- | --- | --- |
| `GET /projects` | listProjects | auth | Projects the caller is a member of. Query: `q` (key, name, description), `status` (lifecycle status, repeatable), `state` (`active` default, `archived`, `deleted`, `all`), `discipline`, `owner`, `sort` (`name`, `updated`, `created`, `opened`; `-` prefix for descending), `limit`, `cursor` |
| `POST /projects` | createProject | auth | Body `CreateProject`; blank or from template; creator becomes administrator in the same transaction; `dryRun`; Idempotency-Key required; 201 + `Project` + `Location` |
| `GET {p}` | getProject | R | `Project` with `ETag` |
| `PATCH {p}` | updateProject | E (A for key, owner) | name, description, objectives, scope, disciplines, lifecycle status, tags; If-Match |
| `POST {p}/open` | openProject | R | Records "recently opened" for the caller (per user, not engineering data); returns `ProjectContext` (project, role, modules and their availability, settings summary, counts) |
| `GET /me/recent-projects` | recentProjects | auth | Last 20 opened, newest first |
| `POST {p}/duplicate` | duplicateProject | A | Body `{ key, name, include: { metadata, members, settings, workItems, documents, milestones, links, moduleContent } }`; `moduleContent` needs every module's `exportProject`/`importProject` (copy mode) and is refused with the missing modules listed until they exist; dryRun; Idempotency-Key |
| `POST {p}/archive` | archiveProject | A | Read-only for every member; modules keep data; dryRun |
| `POST {p}/restore` | restoreProject | A | From archived or deleted (within retention) |
| `DELETE {p}` | deleteProject | A | Soft delete with retention (default 30 days, setting); `X-Confirm`; dryRun lists what becomes inaccessible; module data is not deleted |
| `GET {p}/lifecycle` | lifecycleHistory | R | Lifecycle and state transitions with actor, time, reason |

### 2.2 Templates

| Method and path | Operation | Role | Notes |
| --- | --- | --- | --- |
| `GET /templates` | listTemplates | auth | Built-in and installation templates |
| `GET /templates/{templateId}` | getTemplate | auth | `ProjectTemplate` |
| `POST /templates` | createTemplate | installation administrator* | From a JSON definition or `fromProject` (configuration only, never module content in v1) |

\* There is no installation-administrator role yet; until then templates are code-defined (built-in), and
this endpoint is backlog (B-06).

### 2.3 Members

| Method and path | Operation | Role | Notes |
| --- | --- | --- | --- |
| `GET {p}/members` | listMembers | R | `{ userId, name, role, addedAt, addedBy }[]` |
| `PUT {p}/members/{userId}` | setMember | A | `{ role }`; through the platform membership port; the last administrator cannot be removed or demoted |
| `DELETE {p}/members/{userId}` | removeMember | A | same rule; audited |
| `GET {p}/me` | myPermissions | R | role, permissions list, module entitlements |

### 2.4 Artifact registry

| Method and path | Operation | Role | Notes |
| --- | --- | --- | --- |
| `GET {p}/artifacts` | listArtifacts | R | Query: `q`, `module`, `kind`, `category`, `lifecycle`, `availability`, `container`, `modifiedSince`, `sort`, `limit`, `cursor` |
| `GET {p}/artifacts/{artifactId}` | getArtifact | R | `ArtifactRecord` + `links` (PM and index, both directions, counts) + `open` deep link |
| `GET {p}/artifacts/{artifactId}/history` | artifactHistory | R | Registry record changes (versions seen, lifecycle, availability), with links to the module's own history |
| `POST {p}/artifacts/resolve` | resolveArtifacts | R | Body `{ refs: NativeRef[] }` → `{ artifactId, record }[]`; registers unseen refs synchronously via `describe` |
| `POST {p}/artifacts/twin-inventory` | reportTwinInventory | E | Client-attested twin objects (registration doc §4); labelled |
| `POST {p}/reconcile` | reconcileProject | E | Runs reconciliation now; returns a report (added, updated, missing, unavailable modules) |

### 2.5 Links

| Method and path | Operation | Role | Notes |
| --- | --- | --- | --- |
| `GET {p}/links` | listLinks | R | Query `artifactId`, `direction`, `type`, `includeIndex` (module-owned, derived), `includeRemoved` |
| `POST {p}/links` | createLink | E | `{ type, from: { artifactId, revision? }, to: {…}, note? }`; validated by `LINK_RULES`; refused when a module owns the meaning (error names the module operation) |
| `POST {p}/links/{linkId}/remove` | removeLink | E | Recorded removal, never deleted |
| `POST {p}/trace` | trace | R | `{ from: artifactId[], direction: 'up' \| 'down' \| 'both', types?, depth ≤ 6 }` → paths over PM links + index; `incomplete` for unavailable modules |
| `POST {p}/impact` | impact | R | Changed artifact(s) → affected artifacts, pinning baselines, stale pins (derived, never stored) |

### 2.6 Work items, milestones

| Method and path | Operation | Role | Notes |
| --- | --- | --- | --- |
| `GET {p}/work-items` | listWorkItems | R | Query `kind` (task, issue, risk), `status`, `assignee`, `priority`, `milestone`, `subject` (artifactId), `q`, `sort` |
| `POST {p}/work-items` | createWorkItem | E | `CreateWorkItem`; optional `subjects: artifactId[]` creates `subject-of` links in the same transaction |
| `GET {p}/work-items/{id}` | getWorkItem | R | |
| `PATCH {p}/work-items/{id}` | updateWorkItem | E | If-Match; status transitions validated (lifecycle doc §4); closing a risk as accepted needs V |
| `GET {p}/work-items/{id}/history` | workItemHistory | R | Immutable revisions |
| `GET {p}/milestones`, `POST {p}/milestones`, `PATCH {p}/milestones/{id}` | milestones | R / E | `{ name, description, due, status, deliverables: artifactId[] }` |

### 2.7 Documents and attachments

| Method and path | Operation | Role | Notes |
| --- | --- | --- | --- |
| `GET {p}/documents` | listDocuments | R | |
| `POST {p}/documents` | createDocument | E | Metadata `{ title, description, documentKind, subjects? }`; returns document without content |
| `POST {p}/documents/{id}/versions` | uploadDocumentVersion | E | Body: raw bytes (`application/octet-stream` or the file's type), headers `X-File-Name`, optional `Content-Digest` (sha-256, verified); max 200 MB (configurable); creates immutable version N+1; If-Match on the document |
| `GET {p}/documents/{id}/versions` | listDocumentVersions | R | |
| `GET {p}/documents/{id}/versions/{n}/content` | downloadDocumentVersion | R | Streams bytes; `ETag` = sha-256; `Content-Disposition` |
| `PATCH {p}/documents/{id}` | updateDocument | E | Metadata only |
| `POST {p}/documents/{id}/retire` | retireDocument | E | Lifecycle `retired`; bytes kept |

### 2.8 Baselines (phase C)

| Method and path | Operation | Role | Notes |
| --- | --- | --- | --- |
| `POST {p}/baselines` | createBaseline | E (V to release) | `{ name, description, kind: 'checkpoint' \| 'baseline', scope?: { modules?, artifactIds? } }`; reconciles, then pins each module's current version per artifact; dryRun shows the pins and unconfirmed modules |
| `GET {p}/baselines`, `GET {p}/baselines/{id}` | baselines | R | |
| `POST {p}/baselines/{id}/release` | releaseBaseline | V | Status `released` (immutable afterwards) |
| `POST {p}/baselines/{id}/compare` | compareBaseline | R | Against working state or another baseline: added, removed, version changed, lifecycle changed |

### 2.9 Product structure (only after ADR-0063 is accepted)

`GET/POST {p}/product-elements`, `GET/PATCH {p}/product-elements/{id}`, `GET {p}/product-elements/{id}/history`,
`GET/POST {p}/breakdowns`, `POST {p}/breakdowns/{id}/edges`, `POST {p}/breakdowns/{id}/edges/{edgeId}/remove`,
`POST {p}/breakdowns/{id}/move` (re-parent, If-Match). Element properties use quantities `{ value, unit }`
validated with the SDK unit algebra.

### 2.10 Views, activity, integrity, interchange

| Method and path | Operation | Role | Notes |
| --- | --- | --- | --- |
| `GET {p}/views/{viewId}` | getView | R | `viewId` ∈ product-breakdown, functional-architecture, requirements-hierarchy, physical-assembly, concept-hierarchy, verification, artifacts; query `root`, `depth`, `filter`; returns `ViewProjection` (views.md) |
| `GET {p}/activity` | listActivity | R | PM audit events + module events summarised (type, entity, actor, time), filters `kind`, `module`, `actor`, `since` |
| `GET {p}/events` | projectEvents | R | SSE |
| `POST {p}/integrity-checks` | runIntegrityCheck | R | Synchronous for ≤ 10k artifacts; report (lifecycle doc §6) |
| `POST {p}/exports` | createExport | A | Job; `{ include: { audit, documents, moduleContent } }`; returns job; result is a package blob |
| `GET {p}/exports/{jobId}`, `GET {p}/exports/{jobId}/package` | export status, download | A | |
| `POST /imports` | createImport | auth | Upload a package (raw bytes); always validates first (dry run) and returns an `ImportPlan` |
| `POST /imports/{jobId}/apply` | applyImport | auth (becomes A of the new project) | `{ mode: 'restore' \| 'copy', key?, name? }`; restore refuses ID collisions |

### 2.11 Meta

`GET /openapi.json`, `GET /docs` (Scalar via `registerApiDocs`), `GET /health` (registry consumer lag per
module, blob store reachable).

## 3. Main request and response shapes

```ts
export type ProjectLifecycleStatus = 'planning' | 'active' | 'on-hold' | 'completed' | 'cancelled'
export type ProjectRecordState = 'active' | 'archived' | 'deleted'

export interface Project {
  id: string                       // UUID, or 'PRJ-ACT100' for the legacy example
  key: string                      // display identifier, unique, e.g. 'EEP'
  name: string
  description: string
  objectives: string[]
  scope: string
  disciplines: Discipline[]
  status: ProjectLifecycleStatus
  state: ProjectRecordState
  templateId: string               // 'blank' or a template ID
  ownerId: string                  // accountable person (an administrator)
  tags: string[]
  createdAt: string; createdBy: string
  updatedAt: string; updatedBy: string
  archivedAt?: string; deletedAt?: string; purgeAfter?: string
  revision: number
  counts?: { members: number; artifacts: number; openWorkItems: number; milestones: number }
}

export type Discipline = 'systems' | 'mechanical' | 'electrical' | 'electronics' | 'software' | 'controls' | 'thermal' | 'structural' | 'manufacturing' | 'quality' | 'safety' | 'other'

export interface CreateProject {
  key: string
  name: string
  description?: string
  objectives?: string[]
  scope?: string
  disciplines?: Discipline[]
  templateId?: string              // default 'blank'
  /** Initial project settings, validated against the settings definitions and written through the settings service. */
  settings?: Record<string, boolean | number | string | null>   // e.g. { 'projects.units.system': 'si', 'projects.units.length': 'mm' }
  /** Modules enabled for this project (default: all installed). Disabling never deletes data. */
  modules?: string[]
  members?: { userId: string; role: 'reader' | 'editor' | 'reviewer' | 'administrator' }[]
  milestones?: { name: string; due?: string }[]
}

export interface ProjectTemplate {
  id: string
  name: string
  description: string
  /** Templates in v1 carry configuration only: no engineering artifacts. */
  content: 'blank'
  disciplines: Discipline[]
  settings: Record<string, boolean | number | string | null>
  modules?: string[]
  milestones?: { name: string; offsetDays?: number }[]
  workItems?: { kind: 'task'; title: string }[]   // planning items only, never engineering artifacts
  builtIn: boolean
  version: number
}

export interface ProjectContext {
  project: Project
  role: 'reader' | 'editor' | 'reviewer' | 'administrator'
  permissions: string[]
  modules: { module: string; name: string; installed: boolean; enabled: boolean; entitled: boolean; status: 'provisioned' | 'not-needed' | 'pending' | 'failed' | 'unavailable'; registryLagSeconds?: number }[]
  settings: { available: boolean; values: Record<string, boolean | number | string | null> }
}

export type WorkItemKind = 'task' | 'issue' | 'risk'

export interface WorkItem {
  id: string
  projectId: string
  key: string                      // TSK-001, ISS-001, RSK-001
  kind: WorkItemKind
  title: string
  description: string
  status: string                   // per kind, lifecycle doc §4
  priority: 'low' | 'medium' | 'high' | 'critical'
  assigneeId?: string
  due?: string
  milestoneId?: string
  /** Risks only. */
  risk?: { likelihood: 1 | 2 | 3 | 4 | 5; impact: 1 | 2 | 3 | 4 | 5; mitigation: string; response: 'avoid' | 'mitigate' | 'transfer' | 'accept' }
  /** Issues only. */
  issue?: { severity: 'minor' | 'major' | 'critical'; detectedIn?: string }
  subjects: string[]               // artifactIds (subject-of links)
  createdAt: string; createdBy: string; updatedAt: string; updatedBy: string
  revision: number
}

export interface Document {
  id: string
  projectId: string
  key: string                      // DOC-001
  title: string
  description: string
  documentKind: 'specification' | 'report' | 'drawing' | 'datasheet' | 'standard' | 'minutes' | 'image' | 'model-file' | 'other'
  lifecycle: 'working' | 'in-review' | 'released' | 'superseded' | 'retired'
  currentVersion: number           // 0 = metadata only
  versions?: DocumentVersion[]
  revision: number
}

export interface DocumentVersion {
  version: number
  fileName: string
  mediaType: string
  byteSize: number
  sha256: string
  uploadedAt: string
  uploadedBy: string
  note: string
}
```

## 4. SDK contract for the browser (proposed `contract/projects.ts`, SDK 1.7)

The workspace and tools reach Project Management only through this interface (`services.projects`); the
full typed client lives in `@ews/projects-client`.

```ts
export const PROJECTS_CONTRACT_VERSION = '1.0.0'

export interface ProjectSummary {
  id: string
  key: string
  name: string
  status: 'planning' | 'active' | 'on-hold' | 'completed' | 'cancelled'
  state: 'active' | 'archived' | 'deleted'
  role: 'reader' | 'editor' | 'reviewer' | 'administrator'
  updatedAt: string
  revision: number
}

export interface ArtifactSummary {
  artifactId: string
  ref: { module: string; kind: string; id: string }
  key: string
  title: string
  category: string
  lifecycle: 'working' | 'in-review' | 'released' | 'superseded' | 'retired'
  version: { value: number | string; label?: string }
  availability: 'available' | 'module-unavailable' | 'missing-in-module' | 'not-entitled'
  open?: { toolId: string; params: Record<string, string> }
}

export type ProjectsEventType =
  | 'project.created' | 'project.updated' | 'project.archived' | 'project.restored' | 'project.deleted'
  | 'project.members-changed'
  | 'artifact.registered' | 'artifact.updated' | 'artifact.availability-changed'
  | 'link.created' | 'link.removed'
  | 'work-item.created' | 'work-item.updated'
  | 'milestone.changed' | 'document.changed' | 'baseline.created' | 'baseline.released'

export interface ProjectsEvent {
  eventId: string
  type: ProjectsEventType
  projectId: string
  entityId: string
  committedRevision: number
  occurredAt: string
  actor: string
}

export type ProjectsErrorCode = 'not-found' | 'conflict' | 'invalid' | 'forbidden' | 'unauthenticated' | 'unavailable'

export class ProjectsServiceError extends Error {
  constructor(readonly code: ProjectsErrorCode, message: string, readonly details?: Record<string, unknown>) {
    super(message)
    this.name = 'ProjectsServiceError'
  }
}

export interface ProjectsService {
  readonly contractVersion: string
  readonly mode: 'api' | 'demo'
  list: (query?: { q?: string; state?: 'active' | 'archived' | 'deleted' | 'all'; limit?: number; cursor?: string }) => Promise<{ items: ProjectSummary[]; nextCursor?: string }>
  get: (projectId: string) => Promise<ProjectSummary | undefined>
  /** Artifact registry lookups for cross-module navigation (inspector "appears in project", links). */
  resolve: (projectId: string, refs: { module: string; kind: string; id: string }[]) => Promise<ArtifactSummary[]>
  artifacts: (projectId: string, query?: { q?: string; module?: string; category?: string; limit?: number; cursor?: string }) => Promise<{ items: ArtifactSummary[]; nextCursor?: string }>
  subscribe: (projectId: string, listener: (event: ProjectsEvent) => void) => () => void
}

/** The current project, owned by the platform (shared context). */
export interface CurrentProject {
  projectId: string
  key: string
  name: string
  role: ProjectSummary['role']
}
```

Additive changes alongside: `PlatformServices.projects?: ProjectsService`; `SharedContext.project?:
CurrentProject` (optional; `projectId` stays); `ArtifactModule` gains `'projects' | 'product' |
'conceptualize'` (the last also requested by design reasoning CR-S1). Exact list: CR-PM-SDK-1 in the
progress file.

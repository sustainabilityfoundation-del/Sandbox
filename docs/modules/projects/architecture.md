# Project Management: architecture

Status: **Proposed** (phase A, awaiting coordinator approval). Index: [README.md](README.md).
Brief: [project-management.md](../../specifications/project-management.md). Contracts:
[project-management-contracts.md](../../specifications/project-management-contracts.md).
Decisions: ADR-0060 to ADR-0068 (Proposed).

## 1. Purpose and principle

Project Management turns the platform from one hard-wired sample into many persistent projects. It is the
**top-level container and the cross-module index**, not a second engineering database:

- It owns the project itself, membership management, templates, the artifact registry (one global identity
  per artifact, mapped to the owning module's native reference), cross-module links that no module owns,
  work items (tasks, issues, risks), milestones, documents and attachments, project baselines, activity and
  audit, export/import and integrity checks. If the coordinator accepts ADR-0063, it also owns the
  server-side **product registry** (product/system/subsystem/assembly/part elements and breakdowns).
- Every engineering module stays authoritative for its domain data and storage. The registry stores
  references and summary metadata (key, title, kind, lifecycle state, current version), never requirement
  text, SysML elements, geometry or decision content.
- Views are projections assembled at read time from the registry, links and module APIs (ADR-0068).

## 2. Placement

| Package | Name | Role | Imports |
| --- | --- | --- | --- |
| `services/projects` | `@ews/projects-service` | Domain rules, schema `projects`, migrations, Fastify plugin at `/api/projects/v1`, OpenAPI 3.1, outbox + SSE, blob store adapters, registry consumer and reconciliation, interchange packager, integrity checker | `@ews/platform-sdk` only (framework-free entry) |
| `packages/projects-client` | `@ews/projects-client` | HTTP adapter of the SDK `ProjectsService` (after SDK 1.7), the module's full typed client, an in-memory **contract-test adapter**, the adapter contract test suite, the assistant contribution (`projects.*`) and help manifest | `@ews/platform-sdk` |
| `apps/workspace/src/projects/**` | (workspace) | Project Home, New Project wizard, Project Overview, Explorer, Artifact Inspector panel, Project Settings page, Activity: shell-level, design-system components | every package the workspace may use |

The plugin is hosted by `services/api` exactly like Requirements, Conceptualize and SysML (ADR-0011,
ADR-0015). No new runtime, database technology or paid service. The only new dependency planned is
`fflate` (MIT, already a dev dependency of `@ews/api`) for the interchange ZIP.

```
                          apps/workspace (shell)
   Project Home · Wizard · Overview · Explorer · Inspector · Settings · Activity
          │ ProjectsService (SDK 1.7)       │ module services (SDK)        │ settings (SDK 1.6)
          ▼                                 ▼                              ▼
 ┌──────────────────────── services/api (one Fastify host, one PostgreSQL) ───────────────────────┐
 │  identity · memberships (platform)                                                              │
 │  /api/projects/v1  ──► schema projects  ◄── ArtifactSource adapters (one per module, CR) ──┐    │
 │       registry · links · work items · documents · baselines · audit · outbox · blobs       │    │
 │  /api/requirements/v1  /api/concepts/v1  /api/sysml/v1  /api/cad/v1  /api/settings/v1 ─────┘    │
 └─────────────────────────────────────────────────────────────────────────────────────────────────┘
                    object storage (content-addressed; local filesystem in development)
```

## 3. Internal structure of `services/projects`

| Folder | Content |
| --- | --- |
| `src/db/migrations/` | `NNNN_*.sql`, append-only, checksummed (Conceptualize pattern) |
| `src/domain/` | Pure rules: lifecycle transitions, roles and permissions, link rules, work-item states, template validation, package manifest validation, integrity rules. Unit-tested without a database |
| `src/store/` | One module per aggregate: `projects`, `members`, `artifacts`, `links`, `workItems`, `milestones`, `documents`, `baselines`, `activity`, `exchange`; all writes through `withTransaction` with audit + outbox |
| `src/blob/` | `BlobStore` interface; `localBlobStore` (content-addressed under `.data/objects`), `memoryBlobStore` (tests). S3-compatible adapter later |
| `src/registry/` | Registry consumer (subscribes to `ArtifactSource`s), reconciliation scan, availability tracking |
| `src/exchange/` | Package writer/reader (`ews-project-package` 1.x), JSON Schemas, dry-run import |
| `src/http/` | Route registry, OpenAPI builder, plugin, SSE |
| `test/` | Real-PostgreSQL API tests, persistence/restart tests, OpenAPI conformance |

## 4. Host integration (what the plugin receives)

```ts
export interface ProjectsPluginOptions {
  pool: Pool
  events: ProjectsEventHub
  blobs: BlobStore
  authenticate: (request: FastifyRequest) => Promise<Principal>
  roleOf: (userId: string, projectId: string) => Promise<Role | null>
  /** Platform membership port (CR-PM-API-1). Called inside the projects transaction (same database). */
  memberships: MembershipPort
  /** One adapter per installed module (CR-PM-REG-*); absent modules are reported as unavailable. */
  artifactSources: ArtifactSource[]
  /** Settings service port for project-scoped values (CR-PM-SET-1); absent = settings not available. */
  settings?: ProjectSettingsPort
  production: boolean
}
```

The membership port receives the transaction client, so creating a project and making its creator the
administrator commit together (both schemas are in one PostgreSQL database). Module provisioning and
settings writes happen after commit as recorded, idempotent, retried steps (§6).

## 5. Identity

- **Project ID**: text. New projects get a UUID (`gen_random_uuid()` in the service, returned to the client);
  `PRJ-ACT100` stays the ID of the existing example project, registered by an additive migration as a legacy
  project. Every service already accepts both forms.
- **Project key**: a short display identifier chosen at creation (`EXP-001`-style, unique, case-insensitive,
  `^[A-Z][A-Z0-9-]{1,19}$`), changeable; never used as a reference.
- **Artifact ID**: UUID minted by Project Management when an artifact is first registered. The native
  reference (`ArtifactRef` without `revision`) is unique per project and maps 1:1 to it. If the owning module
  already uses a UUID it is still a separate global ID, so identity does not depend on any module's scheme.
- Work items, milestones, documents, links and baselines: UUIDs, with per-project display keys
  (`TSK-001`, `ISS-001`, `RSK-001`, `MS-001`, `DOC-001`).

## 6. Consistency model

- One module call = one local transaction. Project Management never spans a transaction across modules.
- Project creation is a **saga**: (1) one transaction writes the project, the creator's membership, the
  creation record (template, requested configuration) and the outbox event `project.created`; (2) after
  commit, provisioning steps per module run idempotently and are recorded in `projects.module_states`
  (`pending | provisioned | not-needed | failed | unavailable`), retried with back-off and on demand. A blank
  project is complete and usable after step 1; step 2 never adds engineering artifacts for a blank template.
- The registry is **eventually consistent** with the modules: updated by events (at-least-once, deduped by
  `eventId`), corrected by a reconciliation scan, and marked with the time and source revision it was last
  confirmed. The module is always the authority; the registry never overrides it.
- Baselines pin module revisions read at one instant per module; the baseline records each module's
  read time and source revision, so it states exactly what was pinned without implying a global snapshot.

## 7. Authorization and entitlements

- Project Management is a core capability on every plan (contracts §2.8): routes require authentication and
  a project role, but no `tool:*` entitlement. Creating a project needs only authentication.
- Roles reuse `platform.project_memberships` (reader, editor, reviewer, administrator):

| Operation | reader | editor | reviewer | administrator |
| --- | --- | --- | --- | --- |
| Read project, registry, views, activity, documents | ✓ | ✓ | ✓ | ✓ |
| Create/edit work items, milestones, documents, links | | ✓ | ✓ | ✓ |
| Edit project metadata (description, objectives, scope, lifecycle status) | | ✓ | ✓ | ✓ |
| Create a working baseline / checkpoint | | ✓ | ✓ | ✓ |
| Release a baseline (formal), close risks/issues as accepted | | | ✓ | ✓ |
| Rename key, settings, module configuration, membership, archive, restore, duplicate, export | | | | ✓ |
| Delete (soft) a project, import into a new project | | | | ✓ |

- Module data inside a project follows module entitlements, enforced by each module's server. The registry
  shows an artifact's summary to a project member only if the member is entitled to the owning module
  (summary fields are module data); otherwise it shows `{ module, kind, restricted: true }` so counts and
  integrity remain honest without leaking content.

## 8. Module availability (brief §3)

A module can be absent (not installed), disabled for the project, unsubscribed for the user, or
unreachable. In every case:

- registry entries remain and are labelled (`availability: 'module-unavailable' | 'not-entitled'`);
- Project Management never deletes, rewrites or "repairs" them;
- views show the gap explicitly (`incomplete: [{ module, reason }]`) and never substitute demo data;
- export includes the registry entries and whatever module payload is obtainable; a module payload that
  cannot be produced is listed as missing in the manifest, and import keeps foreign payloads it cannot
  apply as parked blobs (ADR-0064).

## 9. What this architecture deliberately does not do

- No universal object model holding every discipline's data (vision §5).
- No cross-module transactions, global locks or implicit synchronisation.
- No graph or document database; PostgreSQL relational tables with recursive queries suffice for the
  hierarchy sizes expected in phase 1 (validated by tests with 10k artifacts before claiming it).
- No concurrent multi-user editing of module content; revisions, baselines and optimistic concurrency come
  first (brief §7).
- No copy of module audit trails; project activity links to them.

## 10. Documents in this set

| Document | Content |
| --- | --- |
| [inspection.md](inspection.md) | What exists, overlaps and conflicts |
| [information-model.md](information-model.md) | Unified project information model and relationships |
| [api.md](api.md) | Project and artifact API specification |
| [schema.md](schema.md) | PostgreSQL schema `projects` |
| [registration-and-provisioning.md](registration-and-provisioning.md) | How modules register artifacts; how a new project starts empty everywhere |
| [interchange-package.md](interchange-package.md) | Open, versioned, portable project package |
| [lifecycle-and-persistence.md](lifecycle-and-persistence.md) | Lifecycle transitions and persistence guarantees |
| [views.md](views.md) | Views as projections |
| [ai-operations.md](ai-operations.md) | `projects.*` operations for the assistant |
| [plan.md](plan.md) | Phased implementation plan, acceptance mapping and backlog |

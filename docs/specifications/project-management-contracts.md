# Project Management: agreed contracts, ownership and governance

> **Amended (15 October 2026)** by the coordinator's [integration milestone 1](integration-milestone-1.md): shared contracts C1–C13, the acceptance workflow and the status vocabulary there take precedence where they are more specific.

Status: agreed by the coordinator, 15 October 2026, before delegation. Brief: [project-management.md](project-management.md).
Progress: [project-management-progress.md](project-management-progress.md).

## 1. What exists today (inspect before designing)

- **Projects are implicit.** Every service is keyed by a project ID string (`PRJ-ACT100`, seeded):
  Requirements (`services/requirements`), Conceptualize (`services/conceptualize`), SysML Modeler
  (`services/sysml`, has its own `sysml.projects` table). Authorization for all of them is
  `platform.project_memberships (project_id, user_id, role)` with roles administrator, reviewer, editor, reader
  (`services/api/src/platform/identity.ts`, `roleOf`), development identities via `X-Dev-User`.
- **The shared twin is browser-only.** `@ews/model-service` (`DemoRepository`, localStorage) holds components,
  SysML elements and CAD representations of the illustrative tools, relationships with ownership rules
  (`ARTIFACT_OWNER`, `RELATIONSHIP_RULES`, `DELEGATIONS`), revisions, baselines (with `BaselineDraft.external`
  pins for service-owned objects) and read-time projection of requirements (ADR-0012). The roadmap lists the
  server-side repository as an open decision.
- **Cross-module references** use the SDK `ArtifactRef { module, kind?, id, revision? }` (SDK 1.5). Agreed
  schemes: `{module:'sysml', kind:'sysml-model-element', id:'<projectId>/<elementId>', revision:<commit>}` and
  `{module:'cad', kind:'cad-modeler-entity', id:'<documentUuid>/<entityId>', revision:<document revision>}`;
  requirements by UUID; twin objects by twin ID.
- **CAD Modeler** saves documents as files today; `services/cad` with revisions is being built now (CAD agent).
- **Settings:** the AI connection agent is building a settings service (`services/settings`, user and project
  scopes) and SDK 1.6 `SettingsContribution`. Project settings (units, conventions, standards, module
  configuration) **must use that service and contract**, not a second store.
- **Design reasoning** (proposed, ADR-0039–0046): durable design knowledge (decisions, assumptions, rationale,
  alternatives, rejected options) is Conceptualize data. Project Management references it; it does not copy it.

## 2. Architectural boundaries (binding)

1. **Project Management owns:** the project registry (identity, key, name, description, objectives, scope,
   disciplines, lifecycle status, template, archive/restore/delete with retention), project membership
   management (writing `platform.project_memberships` through a platform membership API, so every service keeps
   one authorization source), templates, the **artifact registry** (a cross-module identity index: one stable
   global ID per artifact, mapped to its owning module's native reference; type, owner module, created/modified
   metadata, lifecycle state, current version), cross-module relationships that no module owns, tasks, issues,
   risks, milestones, documents and attachments (binary storage), project-level baselines (sets of pinned module
   revisions), project activity and audit, export/import and integrity checks.
2. **Modules keep their domain data and storage.** Requirements, Conceptualize, SysML, CAD and future modules stay
   authoritative. The registry stores references and summary metadata only (no copies of requirement text, SysML
   elements or geometry). A module's artifacts must survive the module being unavailable or unsubscribed:
   registry entries remain, marked "module unavailable", and are never deleted by Project Management.
3. **Registration contract (shared, coordinator-approved):** propose how modules register and update artifacts
   (preferred: each module publishes its existing outbox events; a Project Management consumer maintains the
   registry, plus a reconciliation scan; synchronous registration only where needed), and how a module is told
   that a project exists ("provisioning": a new project must start empty in every module, without seed data).
   This is a **shared contract**: write it as a proposed ADR and change requests; the coordinator routes the
   module changes to their agents. Do not edit other modules.
4. **Product structure.** The product/system/subsystem/assembly/part breakdown needs a server-side home. Today
   components live only in the browser twin. Propose (ADR) whether Project Management owns product-structure
   elements server-side and how the twin's components, `represents` links and baselines migrate or project
   (non-destructive, ADR-0009). This decision is the coordinator's; do not implement it before approval.
5. **Views are projections** of connected data (brief §5), assembled from the registry, relationships and module
   APIs; never maintained copies.
6. **IDs.** `PRJ-ACT100` and every existing ID keep working. New global IDs: UUIDs; human keys per project are
   display identifiers only (AGENTS.md "Model identity" rules).
7. **Object storage:** behind an interface; the development implementation is a content-addressed local
   filesystem store under `.data/` (git-ignored). An S3-compatible adapter may follow; no paid service.
8. **Subscriptions:** project management is a core platform capability available on every plan; module data inside
   a project follows module entitlements (enforced on the server).

## 3. Placement (to be confirmed by the agent's architecture)

| Package | Role |
| --- | --- |
| `services/projects` (`@ews/projects-service`) | Fastify plugin hosted by `services/api` at `/api/projects/v1`; schema `projects`; OpenAPI 3.1 + `registerApiDocs`; ETag/If-Match; Idempotency-Key (recorded inside the transaction); outbox + SSE; blob store |
| `packages/projects-client` (`@ews/projects-client`) | Browser client and contract-test adapter |
| `apps/workspace/src/projects/**` | Project Home, New Project wizard, Project Overview, Explorer, Artifact Inspector, Project Settings, Activity: shell-level, since Project Home exists before a project is open. Use the design system and the existing navigation (tabs, tree, inspector, palette, dialogs) |

SDK: propose `ProjectsService` and `PlatformServices.projects`, current-project context, and project lifecycle
events as an additive SDK change (1.7). The coordinator applies SDK changes; write the exact TypeScript in your
documents.

## 4. Gates

- **Phase A (now):** inspect, then write the architecture, information model, API specification, schema design,
  registration/provisioning contract, product-structure ADR, interchange package design, phased plan and backlog.
  Send the coordinator a summary (SendMessage) and **stop for approval**.
- While waiting you may build, inside your own packages only, parts that do not depend on the open decisions:
  the project registry and lifecycle, tasks/issues/risks/milestones, documents and the blob store, with tests.
- Integration into `main` requires coordinator review: ownership, tests, licences, no regressions.

## 5. File ownership

| Owner | Paths |
| --- | --- |
| Project Management agent | `services/projects/**`, `packages/projects-client/**`, `apps/workspace/src/projects/**` (new), `docs/modules/projects/**` (new), `docs/specifications/project-management-progress.md`, `docs/research/projects/**`, help pages for project management, new ADRs `docs/decisions/00NN-projects-*.md` numbered from **0060** (status Proposed; do not edit the index) |
| Agent, limited (append only; each in a `COORDINATOR REVIEW:` commit) | `services/api/src/server.ts`, `main.ts` (plugin registration), `services/api/src/platform/**` (only for the membership API, after approval), `apps/workspace/src/platform/tools.ts`, `apps/workspace/src/assistant/capabilities.ts`, shell header/navigation entry points for Project Home and the project switcher (after approval), `package.json` files (scripts prefixed `projects:`), `docs/dependencies.md`, `packages/platform-sdk/src/boundaries.test.ts` (rules for your packages) |
| Coordinator | Everything else: `packages/platform-sdk` contract, `packages/model-service`, other modules and services (Requirements, Conceptualize, SysML, CAD, assistant, settings), the rest of `apps/workspace`, `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/decisions/README.md` |

Other agents working in parallel: AI connection and settings (`feature/ai-connection`), CAD Modeler
(`feature/cad`), SysML Modeler (`feature/sysml`), Conceptualize (`feature/conceptualize`), Design Reasoning
(`feature/design-reasoning`). Request changes through your progress file; the coordinator forwards them.

## 6. AI integration

Every project operation is a typed command with server-side validation, authorization and audit, used by the UI
and the assistant alike. Assistant actions are named `projects.*`, listed in
`apps/workspace/src/assistant/capabilities.ts`; consequential changes are service proposals (preview, then
Apply), destructive ones need explicit confirmation. No direct database access by the assistant.

## 7. Licensing

Pre-authorised: MIT, BSD, Apache-2.0, ISC, zlib, MPL-2.0. Anything else, or a paid service, needs approval.

## 8. Definition of done

Brief §9 acceptance workflow from an empty database, with real module integrations where implemented and
contract-test adapters where not, each unverified step reported. Design-system components and tokens,
phone/tablet/desktop, both themes, keyboard; help manifest and pages; capability inventory entries;
`npm run check`, `npm run build`, `npm run build:harnesses`, `npm run req:test:db` green; existing browser flows
keep passing; the existing example projects preserved as fixtures or templates.

## 9. Environment

Worktree `C:\Users\kimge.000\Documents\Sandbox-projects`, branch `feature/project-management`. Ports: workspace
5206 and 5207, API 8802, embedded PostgreSQL 54344. Do not push; do not merge to `main`.

# Project Management: repository inspection (phase A)

Status: record of what exists, 15 October 2026, branch `feature/project-management` from `main` e83c098.
Index: [README.md](README.md).

Everything below was read in the repository (files named) or on the in-flight agent branches
(`git show <branch>:<path>`, read-only). Nothing here is a claim about behaviour that was not inspected.

## 1. Projects today: an implicit string key

| Where | What exists | Consequence for Project Management |
| --- | --- | --- |
| `packages/model-service/src/repository/seed.ts` | `PROJECT_ID = 'PRJ-ACT100'`, `Project { id, name }` inside `ModelSnapshot` | The browser twin knows exactly one project |
| `packages/model-service/src/repository/DemoRepository.ts:428` | `if (projectId !== PROJECT_ID) throw new RepositoryError('not-found', …)` | **The workspace cannot open any other project today.** A multi-project twin (or a server-side product structure) is a precondition for a blank project in the shell |
| `apps/workspace/src/App.tsx` | `start()` initialises the store with `PROJECT_ID` constant | No project selection, no Project Home |
| `services/api/src/platform/identity.ts` | `platform.users`, `platform.project_memberships (project_id text, user_id, role)`, `platform.entitlements`; `roleOf(userId, projectId)`; `seedPlatform(pool, 'PRJ-ACT100')`; `/api/platform/v1/me`, `/dev-users` | One authorization source for every service; no API to create or change memberships; no project registry table |
| `services/requirements` | Every table keyed by `project_id text`; seed only for `PRJ-ACT100`; allocation targets validated against a `TwinDirectory` (`services/requirements/src/twin.ts`) | A new project ID is automatically empty. **Allocation in a new project fails**: the host's `SAMPLE_TWIN` (static) lists components only for `PRJ-ACT100` |
| `services/conceptualize` | `project_id text`; seed only for `PRJ-ACT100`; route checks membership via `roleOf` | A new project ID is automatically empty once a membership exists |
| `services/sysml` | Own `sysml.projects (id uuid, platform_project_id text, …)`, `POST /projects` creates a SysML project with branch `main`; seed for `PRJ-ACT100` outside production | A platform project contains zero or more SysML projects; SysML needs an explicit SysML project before elements exist (natural "provisioning" step, can be lazy) |
| `services/cad` (branch `feature/cad`) | `cad.documents (id uuid, project_id text, …)`, immutable `cad.document_revisions`, outbox events `cad.document-created`, `cad.revision-created`, `cad.document-archived` | Empty for a new project; documents are natural registry artifacts |
| `services/settings` (branch `feature/ai-connection`) | `settings.scopes (scope user/project, owner_id)`, `settings.setting_values`, append-only `settings.history`; definitions are code (SDK 1.6 `SettingsContribution` in a `ToolDefinition`) | Project settings (units, conventions, standards, module configuration) go here (contracts §1). Project Management is not a tool, so it needs a way to contribute definitions (change request) |

Project ID format: every service accepts `projectId` as text of 1–100 characters (settings:
`^[A-Za-z0-9_.-]+$`). A UUID fits all of them; `PRJ-ACT100` keeps working.

## 2. Shared twin and identity rules

- `ModelSnapshot` holds components (`assembly`, `part`), SysML elements, CAD representations, scenarios,
  relationships, configurations; `ARTIFACT_OWNER` (`model-service/src/domain/ownership.ts`) maps
  `assembly`/`part`/`scenario` to module `product`, written only by `platform`.
- `RELATIONSHIP_RULES`: `allocated-to` (requirement → component), `represents` (SysML/CAD → component),
  `references`, `connects`, `satisfies`; retired Verification types read-only.
- Revisions: every object carries a model revision; `ObjectRevision` history is append-only (ADR-0004).
  Baselines pin `{id, revision}` and copy relationships; `BaselineDraft.external` pins service-owned
  objects (ADR-0005, ADR-0012).
- Requirements are projected read-time into the `ModelIndex` with legacy IDs as aliases (ADR-0012).
- Storage: browser `localStorage` (`ews.demo-repository.v3`), schema 3, additive upgrades (ADR-0009).

## 3. Service infrastructure pattern (reused, not reinvented)

Conceptualize (`services/conceptualize/src`) is the most complete example; Requirements and SysML follow
the same conventions with local copies (SysML asked for a shared package, CR-SYSML-06):

- `db/migrate.ts`: checksummed, append-only `NNNN_*.sql` per schema, advisory lock.
- `store/context.ts`: `withTransaction` (one transaction, transaction time, retry once on serialization
  failure), `withReadTransaction` (REPEATABLE READ), `audit()` into an append-only table with provenance
  (`X-Source-Kind`, `X-Conversation-Id`, `X-Proposal-Id`, `X-Message-Id`), `emit()` into the outbox.
- `events/hub.ts`: transactional outbox, one publisher by advisory lock, `delivery_seq`, LISTEN/NOTIFY
  plus polling, SSE with resume (`after`/`Last-Event-ID`) and `reset`.
- `http/route.ts`: `registerRoute` with TypeBox schemas, entitlement + role check, `If-Match`/`expectedRevision`,
  `Idempotency-Key` recorded **inside** the write transaction and replayed for 24 h, error body
  `{ error: { code, message, details } }`; `http/openapi.ts` builds OpenAPI 3.1 from the route registry;
  the host serves Scalar via `registerApiDocs`.
- Tests: `services/api/test/globalSetup.ts` starts a disposable embedded PostgreSQL; each file creates
  and drops its own `ews_test_*` database; `expectConforms` validates responses against OpenAPI.
- Object storage: `ObjectStorage` in `services/requirements/src/storage.ts` (content-addressed
  `sha256/<2>/<hash>`, local filesystem and memory adapters). `services/api/src/config.ts` already has
  `STORAGE_DIR` (default `.data/objects`, git-ignored).

## 4. Cross-module references

- SDK `ArtifactRef { module: 'requirements' | 'sysml' | 'cad' | 'analysis' | 'twin' | 'external', id,
  revision?, kind? }` (`packages/platform-sdk/src/contract/concepts.ts`, SDK 1.5).
- Agreed schemes (contracts §1): System Model `{module:'sysml', kind:'sysml-model-element',
  id:'<sysmlProjectId>/<elementId>', revision:<commit number>}`; CAD `{module:'cad',
  kind:'cad-modeler-entity', id:'<documentUuid>/<entityId>', revision:<document revision>}`;
  requirements by UUID; twin objects by twin ID.
- Design reasoning requested `ArtifactModule` + `'conceptualize' | 'reasoning'` (CR-S1, SDK 1.6, pending).

## 5. Events available for registration

| Module | Event types (outbox, after commit) | Payload |
| --- | --- | --- |
| Requirements | `requirement.created/updated/archived/restored/relationships-changed`, `requirements.baseline-created`, `requirements.import-completed`, `requirements.collection-changed` | `eventId, type, projectId, entityId, committedRevision, configurationId?, occurredAt, actor` |
| Conceptualize | `concept.created/revised/relationships-changed/implementation-linked/implementation-unlinked/selected/superseded/decision-recorded` | same shape |
| System Model | `sysml.project-created`, `sysml.branch-created`, `sysml.commit-created`, `sysml.tag-created` | per commit, not per element |
| CAD (branch) | `cad.document-created`, `cad.revision-created`, `cad.document-archived` | `documentId, revision, sourceKind` |

Events identify the entity and revision but carry no summary (name, kind, state). A registry consumer must
re-read summaries from the owning module; that is the reason for the `ArtifactSource.describe` call in
[registration-and-provisioning.md](registration-and-provisioning.md).

## 6. AI and help

- Assistant actions are contributed by **tools** (`AssistantContribution` in `ToolDefinition`), plus
  `PLATFORM_TOOLS` in `apps/workspace/src/assistant/toolSpecs.ts`. Service-backed changes use
  `ServiceProposal` (preview, Apply, optional undo). There is no destructive-confirmation field.
- `apps/workspace/src/assistant/capabilities.ts` is the coverage inventory; its tests require an entry per
  operation and toolbar item. `CapabilityModule` has no `'projects'` value.
- Help manifests come from tool definitions too (`ToolDefinition.help`). Project Management, as a shell
  capability, needs the same headless registration path for help, settings and assistant actions.

## 7. Overlaps and conflicts found

| # | Topic | Finding | Proposed resolution |
| --- | --- | --- | --- |
| O1 | Product structure | Components exist only in the browser twin; `ARTIFACT_OWNER` says `product`, written by `platform` | ADR-0063: the product registry is part of Project Management, server-side, with the twin projected read-time (decision is the coordinator's) |
| O2 | Allocation targets | Requirements validates allocations against a static development directory for `PRJ-ACT100` only | Host supplies a `TwinDirectory` backed by the product registry (CR-PM-API-3) |
| O3 | Baselines | Twin baselines (browser), Requirements baselines, SysML tags, CAD revisions: four mechanisms | Project baseline = a set of pinned module revisions; modules keep their own (ADR-0067) |
| O4 | Activity | Twin activity log (browser), per-service audit tables | Project activity is a projection over the PM audit plus module events; never a copy of module audit |
| O5 | Settings | Settings service is on `feature/ai-connection`, not yet on `main` | Project settings use it; PM records only the *requested* initial configuration in the creation record (provenance), applies it through the settings API, and reads values from there |
| O6 | Project in SysML | `sysml.projects` is a module-local container within a platform project | Keep; PM registers SysML projects as artifacts of kind `sysml-project`; provisioning creates none (lazy) |
| O7 | Decisions | Design knowledge (decisions, rationale, alternatives) is Conceptualize data | PM references and explains through `ConceptsService`; it stores no decision content |
| O8 | Workspace single project | `App.tsx` and `DemoRepository` are hard-wired to `PRJ-ACT100` | CR-PM-WS-1/CR-PM-MS-1: current-project context, empty twin per new project |
| O9 | Assistant/help registration | Only tools contribute actions, help and settings | CR-PM-WS-2: headless platform contribution (same request as design reasoning CR-A2) |
| O10 | Service principal | Background consumers have no identity; `roleOf` needs a membership | CR-PM-API-2: a non-login system principal for registry consumers and reconciliation |
| O11 | Duplicate infrastructure | Each service copies migrate/outbox/route helpers | PM copies the Conceptualize pattern (owned copies) until CR-SYSML-06 provides a shared package; no new pattern |
| O12 | Retention and delete | No service deletes user data; Concepts are archived | Project delete = soft delete with a retention window; module data is never deleted by PM (contracts §2.2); purge is a later, explicit, audited operation (ADR-0065) |

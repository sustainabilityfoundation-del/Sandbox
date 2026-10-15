# Requirements Management: progress

Maintained by the Requirements agent. Brief: [requirements-management.md](requirements-management.md)
(do not edit). Contracts: [requirements-contracts.md](requirements-contracts.md).

Branch: `feature/requirements-management`. Worktree: `C:\Users\kimge.000\Documents\Sandbox-requirements`.

## Status by stage

| Stage | Status | Notes |
| --- | --- | --- |
| 1. Research and acceptance matrix | Done (provisional where sources were inaccessible) | `docs/research/requirements/`: research-note.md, capability-matrix.md, acceptance-and-backlog.md (acceptance IDs AC-*) |
| 2. Shared domain contracts and schema | Done | SDK 1.2.0 contract unchanged. Schema `requirements`, migration `0001_initial.sql`; platform schema `platform` (`services/api/src/platform/migrations/0001_platform.sql`) |
| 3. PostgreSQL API | Done | `services/requirements` (Fastify plugin, OpenAPI 3.1, outbox, SSE), `services/api` host, `packages/requirements-client` (HTTP and demo adapters, module client, contract tests) |
| 4. Core Requirements UI | Done | `packages/tool-requirements`: table (search, filters, columns, cursor pagination, saved views, bulk edit), collections (headings, ordering without drag), detail tabs (edit with custom attributes, trace incl. allocation and impact, reviews/lifecycle, history with revision compare, comments and external references, quality, verification), matrix, baselines (historical read-only view, compare), quality page with conventions, import/export page, explicit demo mode, harness with API/demo and user selector. Browser-checked (see evidence) |
| 5. SysML integration | Done (agent side) | `docs/specifications/requirements-sysml-mapping.md` (SysML v2 mapping, unsupported list, SDK examples for SysML and CAD), contract test suite (`@ews/requirements-client/contract-tests`), cross-module API subset for `tool:sysml`. SysML-side UI is coordinator work |
| 6. ReqIF exchange | Done | `packages/reqif`, `services/requirements/src/exchange`, report `docs/specifications/requirements-reqif.md` (24 external files tested) |
| 7. Quality assistance and refinements | Done | Server checks with classes validation/heuristic (`quality/rules.ts`, unit tests), dismissals per revision, configurable conventions, quality tab and page; assistant actions `requirements.search`, `requirements.explain_quality`, API-mode proposals with preview/Apply/Reject/Undo |

## Commits

| Commit | Content |
| --- | --- |
| abb4ead | Stage 1 research note, capability matrix, acceptance criteria and backlog |
| fbc2783 | Stages 2–3: schema, migrations, seed, HTTP API, host, real-PostgreSQL tests |
| 3204094 | Requirements client: HTTP and demo SDK adapters, module client, SSE client, contract test suite |
| 4890c56 | Progress file update |
| 1d8cd6a | Stage 4 UI |
| a10b568 | `@ews/reqif` package with schema validation and corpus tests |
| c33f5be | Stage 6 exchange in the API (import preview/apply, export, JSON) |
| bc7cdd6 | Quality rule tests; UI fix |

## How to run

```bash
npm install
npm run dev:api          # starts embedded PostgreSQL (EWS_PG=embedded, default), migrates, seeds, API on :8787
npm run db:up | db:migrate | db:seed | db:reset | db:status
npm run req:test:db      # real-PostgreSQL tests (embedded-postgres in a temp dir, or EWS_TEST_PG_ADMIN_URL)
```

Docker Compose (`docker-compose.yml`, PostgreSQL 17) is the documented primary setup: set `EWS_PG=external`.
`db:reset` refuses any database other than `ews_dev` / `ews_test*`.

## Permissions matrix (enforced by the server; `x-permissions` per operation in OpenAPI)

| Permission | reader | editor | reviewer | administrator |
| --- | --- | --- | --- | --- |
| read (requirements, collections, relationships, history, baselines, quality) | ✓ | ✓ | ✓ | ✓ |
| export | ✓ | ✓ | ✓ | ✓ |
| save personal views | ✓ | ✓ | ✓ | ✓ |
| author (create, edit, archive, restore, relationships, collections, bulk) |  | ✓ |  | ✓ |
| comment |  | ✓ | ✓ | ✓ |
| request review / withdraw |  | ✓ |  | ✓ |
| decide review (approve, reject; not for a revision one authored) |  |  | ✓ | ✓ |
| retire / reinstate |  |  | ✓ | ✓ |
| create baseline |  |  | ✓ | ✓ |
| import |  | ✓ |  | ✓ |
| dismiss quality finding |  | ✓ | ✓ | ✓ |
| share saved views |  | ✓ | ✓ | ✓ |
| define attributes, edit conventions, renumber keys |  |  |  | ✓ |

Entitlement `tool:requirements` is required for every endpoint, except the cross-module subset
(get, resolve, list, trace links, relationship types, collections read, baselines read, events,
create/update of canonical fields title/statement/rationale/type) where `tool:sysml` suffices.
Development identity: `X-Dev-User` (refused when `NODE_ENV=production`, 401).

## Acceptance checks (brief §10)

| Check | Status | Evidence |
| --- | --- | --- |
| Persistence across restarts | Pass | `services/api/test/infrastructure.test.ts` "persistence across restarts" (stops and restarts PostgreSQL and the API) |
| Clean migrations and seeds | Pass | infrastructure.test.ts "migrations and seed": empty DB, idempotent re-run, edited migration refused, two seeded DBs identical |
| Concurrent-edit conflicts | Pass | requirements.api.test.ts "revisions and concurrency" (409 with currentRevision, three parallel writes → one wins) |
| Stable historical baselines | Pass | requirements.api.test.ts "baselines" (requirement, relationship and structure pinned after later edits; DB refuses changes) |
| Relationship constraints | Pass | requirements.api.test.ts "relationships" (endpoints, duplicates, self-links, cycles, twin type, DB checks) |
| Backend entitlement and permission enforcement | Pass | requirements.api.test.ts "permissions and entitlements"; production refusal in infrastructure.test.ts |
| Requirements and SysML resolve the same canonical data | Partial | Contract suite passes for HTTP adapter as eli and as SysML-only nia (`packages/requirements-client/test/http.contract.test.ts`); SysML tool wiring is coordinator work |
| Cross-tool and cross-window refresh | Pass (agent side) | SSE after commit, resume, rollback emits nothing (infrastructure.test.ts); browser: a second window (user rho) shows an edit made through the API without reload (harness flow `refresh`). Detached-window forwarding and SysML refresh are coordinator work |
| API failures preserve unsaved input | Pass | Browser flow: PATCH aborted (network) → error shown, rationale input kept; conflicting edit → explained, input kept, saved after "Load latest (keep my edits)"; committed changes from elsewhere do not reset an open form |
| Idempotent retries | Pass | requirements.api.test.ts "idempotency" (replay, reuse refused, parallel duplicates) |
| ReqIF interoperability and re-import | Pass (reading external files; no exchange into commercial tools) | `services/api/test/exchange.test.ts`: preview/apply/re-import without duplicates, conflicts, per-source mapping, no deletion on absence, .reqifz attachments, schema-valid export, self round trip; 24 external files (RMF/ReqIF Implementor Forum, DOORS, Polarion, ReqIF Studio, EA) imported and re-imported via the API; see requirements-reqif.md |
| Search and pagination on a larger generated dataset | Pass | infrastructure.test.ts: 5 000 generated requirements, 26 pages, no gaps/duplicates, natural key order, prefix search |

## Browser checks (harness on :5191 against the real API)

Scripts in the session scratchpad (`pw/req/req-flow.mjs`, `exchange-flow.mjs`), all passing on 14 Oct 2026: table from the API, collections panel, edit with unsaved state and new revision, failed save keeps input, conflict explained and resolved, quality tab, cross-window refresh, reader without editing actions, matrix/baselines/quality/import-export pages, baseline view labelled historical, phone (390 px) and tablet (900 px) without horizontal overflow, explicit demo mode, ReqIF import preview/apply and export download, no console errors.

## Sprint 002 (SDK 1.3 and hardening), 14 Oct 2026

See [docs/sprints/002-requirements-sdk13-hardening.md](../sprints/002-requirements-sdk13-hardening.md) for acceptance evidence.

- `requirements.collection-changed` emitted from the outbox for every committed collection change (create, metadata, node add/move/rename/remove, including nodes added by imports and by creating a requirement in a collection); the tool rereads collection trees on any event.
- HTTP adapter uses `RequirementWriteOptions.projectId` (no lookup).
- Internal errors: 500, code `unavailable`, `details.reason: internal-error`, `details.errorId`; no internals in messages; mapped database errors use generic messages; OpenAPI lists 500 on every operation.
- Outbox retention `OUTBOX_RETENTION_HOURS` (default 168 h), hourly purge, migration `0002_outbox_retention.sql` (index only); reset signal forwarded by the HTTP adapter (`onReset`, `onRequirementsReset`); the tool rereads on reset.

## Sprint 003 (requirements in SysML), 14 Oct 2026

See [docs/sprints/003-sysml-requirements-integration.md](../sprints/003-sysml-requirements-integration.md) for acceptance evidence and [requirements-sysml-mapping.md](requirements-sysml-mapping.md) §3 for the behaviour.

- SysML (`packages/tool-sysml/src/requirements.tsx`): place an existing requirement, create one through the service (idempotency key, waits for the projection before linking), inspector with canonical text and edit (expectedRevision), *Open in Requirements*; diagram label and text notation by key; unavailable service explained.
- Requirements tool: *Show in SysML* in the Trace tab's SysML section.
- `services/api/test/sysml.test.ts`: the SysML SDK paths against PostgreSQL. No migrations.

## Project Management integration (CR-PM-REG-1, CR-PM-REQ-2), 15 Oct 2026

Branch rebased on main edd7353 (SDK 1.7.0). Contract: docs/modules/projects/registration-and-provisioning.md (Project Management).

- **CR-PM-REG-1, done.** `createRequirementsArtifactSource(pool, events): ArtifactSource` in `@ews/requirements-service` (`services/requirements/src/artifacts.ts`):
  - Kinds `requirement` (category requirement), `requirement-collection` (requirement), `requirements-baseline` (baseline), all navigable. Open links: `{ toolId: 'requirements', params: { id | collectionId | baselineId } }`. The Requirements tool does not read these params yet (it opens on the workspace selection).
  - `list`: stable order (kind, id), at most 500 per page, opaque cursor, `kinds` filter, unknown project → empty page. Archived requirements and collections are listed with lifecycle `retired` so the registry does not mark them missing.
  - `describe`: request order; unknown refs, other modules' refs, non-UUID IDs and refs from another project are absent.
  - Descriptors read the module's tables directly (no HTTP, no principal). Requirement: key, current title, `moduleState` = status or `archived`, lifecycle draft → working, in-review → in-review, approved → released, retired/archived → retired; version = content revision (`rev n`). Collection: key and title = name, version `"revision.structureRevision"`. Baseline: key and title = name, version 1, lifecycle released.
  - `relations`: requirement → requirement links (derives-from, decomposes, depends-on) with `toRevision`, and allocations to product elements as `{ module: 'product', kind: 'product-element', id: <element UUID> }` (C3 scheme, decided 15 Oct 2026; allocations pin no target revision). A target counts as a product element when its canonical ID is a UUID: the ID the host's `TwinDirectory` returns (optional `createRequirementsArtifactSource(pool, events, { twin })`; pass the same composed directory the API validates with), else the stored ID. Allocations to the static sample twin (ROD-120 …) have no native module and are not reported.
  - `subscribe`: new `EventHub.subscribeAll` (every project, after commit, from the existing outbox). Mapping: created/updated/restored/relationships-changed → upserted requirement; archived → retired; baseline-created → upserted baseline; collection-changed → upserted collection (itemisable, so not `reconcile` as the proposed table in registration §4 says); import-completed and unknown future types → reconcile. Lifecycle changes (approve, retire) arrive as `requirement.updated`.
  - `provision` → `not-needed`, idempotent. Verified that a new project starts empty: after memberships only, provisioning twice and running the development seed again, every `requirements.*` table has zero rows for the new project and `list()` is empty. The seed writes `PRJ-ACT100` only.
  - `exportProject`/`importProject` not implemented (phase F).
- **CR-PM-REQ-2, done.** `ALLOCATABLE_TYPES` = assembly, part, product-element. The `TwinDirectory` port was already injected (`ServerOptions.twin`, default `SAMPLE_TWIN`). New `composeTwinDirectory(...directories)` (first directory that knows an ID answers) for the host: `composeTwinDirectory(SAMPLE_TWIN, productTwinDirectory(pool))` (CR-PM-API-3). PRJ-ACT100 is unchanged (ROD-120 accepted, SYS-003 refused). Error messages now say "component (assembly or part) or product element".
- Tests: `services/api/test/artifacts.test.ts` (10, real PostgreSQL), `services/requirements/src/artifacts.test.ts` (2, mappings). The Project Management contract-test suite (`@ews/projects-client/contract-tests`, registration §7) is not on main yet; these tests cover the same points and can be swapped for it when it lands.
- No migrations.

## Integration milestone 1: C9 headless operations, C13 project scoping, 15 Oct 2026

Merged main d628556 (docs/specifications/integration-milestone-1.md).

- **C9, done for Requirements.** `packages/tool-requirements/src/assistant.ts` takes the service from `AssistantActionContext.services.requirements` and the project from `ctx.captured.projectId`; `setAssistantConnection`, the view-held connection and the in-view proposal store (`src/proposals.ts`, the proposal cards in RequirementsView) are removed.
  - `requirements.update` returns a platform `service-proposal` (field preview with current and proposed text, Apply, Undo). Apply calls `saveRequirementEdit`, the same write as the editor (module client in API mode, SDK service in demo mode), with the base revision and reason `Assistant proposal <proposalId>`. The text is passed as given, so the server is the only validator.
  - `requirements.search` uses the SDK `list()` (demo and API). `requirements.read_for_component` uses the module client's allocation query in API mode, the twin otherwise. `requirements.explain_quality` needs API mode and says so in demo mode.
  - Without a service the twin behaviour of `read_for_component` and `update` is unchanged.
  - Status changes stay refused through the assistant (they are reviews and transitions).
- **Tests.**
  - `packages/tool-requirements/src/assistant.test.ts` (7, demo service, no view): search, proposal/Apply/Undo, a stale Apply refused, refusals.
  - `services/api/test/assistant.test.ts` (6, real API, no React):
    - every operation succeeds headless;
    - UI path vs assistant path give identical refusals (class, code, status, message) for a statement over 20 000 characters, a stale revision and a reader;
    - the empty-statement rule is identical on both paths. The server allows an empty statement in a draft and refuses it at request-review; this is an existing domain rule, kept, so "empty statement" is not a refusal on either path;
    - C13: PATCH, archive, transition and relationship writes to a PRJ-ACT100 requirement through another project's path are refused (4xx, never a conflict), nothing changes, and the project-bound client and the assistant in that project get `not-found`.
- **COORDINATOR REVIEW** commit 9bae3e9: `apps/workspace/src/assistant/assistant.test.ts` runs its twin demo flow without a Requirements service (it passed before only because no view was mounted). Test-only.
- Limitation: proposals are still closures (`apply`/`undo`) held by the workspace, not persisted declarative data (C9 §3); that needs `services/assistant` persistence and a declarative proposal contract from the coordinator. The Requirements Apply is already a pure function of (requirement ID, patch, expected revision, project), so it can be expressed declaratively when that contract exists.

## Open links and allocation relations, 15 Oct 2026

- `openLinkViewState(params)` (`packages/tool-requirements/src/domain.ts`) maps the artifact source's open params to view state: `id` → detail panel of the requirement, `collectionId` → collection in the table page, `baselineId` → historical baseline view. Non-UUID or unknown params are ignored.
- The SDK cannot pass params to a tool (`openTool(toolId)` only). Until it can, a host opens a collection or baseline link with `select([id])` and `openTool('requirements')`. The view looks up a selected UUID that is not a requirement in the model among the project's collections and baselines and applies the mapping once per selection. A selected requirement keeps today's behaviour (highlighted row). The `id` mapping is used only once params can be passed.
- Browser check not done: no host UI selects a collection or baseline ID yet (the Project Management artifact list will). Covered by unit tests (`src/openLink.test.ts`) and the type check.
- Allocation relations: see CR-PM-REG-1 above; test in `services/api/test/artifacts.test.ts` (by UUID, by an alias the directory resolves, and without a directory).

**SDK proposal (open params, for 1.8):** `openTool(toolId: string, options?: { params?: Record<string, string> })` on `ToolApi`, and `useOpenParams(): { params: Record<string, string>; nonce: number } | null` in `/react` (a new nonce per open, so reopening the same link applies again). The workspace passes `ArtifactDescriptor.open.params`. The Requirements view then calls `openLinkViewState(params)`, and the selection fallback can go.

**Request to Project Management** (`services/projects/src/twinDirectory.ts`): `productTwinDirectory.lookup` returns `id: <requested alias>`. Please return the element's canonical UUID as `id` (the map stays keyed by the requested ID). Then allocations made by alias are reported with the element UUID too.

## SDK change proposal (requests 5, 7, 9), 15 Oct 2026

For the coordinator to apply in the next SDK minor (all additive; CHANGELOG entries proposed below). The Requirements side is ready for each.

**5. Reset signal on `RequirementsService.subscribe`**

```ts
export interface RequirementsSubscribeOptions {
  /** The stream could not be resumed (events were purged after the retention window): reread everything. */
  onReset?: () => void
}
subscribe: (projectId: string, listener: (event: RequirementsEvent) => void, options?: RequirementsSubscribeOptions) => () => void
```

- Adapter: `createHttpRequirementsService` calls `options.onReset` wherever it calls `HttpServiceConfig.onReset` today; the demo adapter never resets. `onRequirementsReset` stays as a deprecated helper for one minor.
- Workspace: `apps/workspace/src/platform/store.ts` replaces `onRequirementsReset(requirements, projectId, refresh)` by passing `{ onReset: refresh }`.
- Tools: none need changes.

**7. Rationale in `RequirementSummary`**

```ts
export interface RequirementSummary {
  // …
  /** Why the requirement exists (SDK 1.8). Absent from adapters that do not provide it. */
  rationale?: string
}
```

- The API already returns `rationale`; the HTTP and demo adapters map it (one line each, tests in `packages/requirements-client`). `RequirementPatch.rationale` already exists.
- Tools: the SysML inspector can then edit rationale (tool-sysml change, optional).

**9. Wait for an object in the model**

```ts
export interface ToolApi<VS = unknown> {
  // …
  /**
   * Resolves with the object once the model contains it (e.g. a requirement just created through a
   * platform service and not yet projected), or undefined after timeoutMs (default 10 000).
   */
  whenObject: (id: string, options?: { timeoutMs?: number }) => Promise<ModelObject | undefined>
}
```

- Host: resolve on the model-change notification instead of polling; the mock host in `/harness` resolves from its model.
- Tools: tool-sysml replaces `waitForObject(() => api.getModel(), id)` with `api.whenObject(id)` (tool-sysml change, after the SDK lands).

Proposed CHANGELOG entry: "1.8.0: `subscribe(…, { onReset })`; `RequirementSummary.rationale?`; `ToolApi.whenObject`. Additive; no tool must change. Migration: the workspace passes `onReset` instead of calling `onRequirementsReset`."

## Contract change requests

1. **`RequirementWriteOptions.projectId` (optional)** — `RequirementsService.update()` carries no
   project. Workaround: the HTTP adapter remembers the project of IDs it has read and otherwise
   calls the project-free `GET /api/requirements/v1/requirements/{id}`. Proposal: add optional
   `projectId?: string` to `RequirementWriteOptions` (additive, SDK 1.3).
2. **Event type `requirements.collection-changed`** — collection structure changes emit no SDK
   event (the union has no suitable type), so other windows do not refresh collection trees until a
   requirement event arrives. Proposal: add `'requirements.collection-changed'` (entityId =
   collection ID, committedRevision = structure revision) to `RequirementsEventType`.
3. **Assistant service proposals** — `AssistantActionContext` has no services and proposals can only
   contain twin `ChangeInput`s, so API-backed edits cannot use the platform preview/Apply. Proposal:
   add `services: PlatformServices` to `AssistantActionContext`, and a result kind
   `{ kind: 'service-proposal', title, explanation, preview: { targetId, field, current, proposed }[], expectedRevision, apply(): Promise<void>, undo?(): Promise<void> }`
   that the platform shows with Apply/Reject and logs like other proposals. Workaround: see
   integration needs.
5. **Reset signal in the SDK** (new, sprint 002) — `RequirementsService.subscribe()` cannot tell a consumer that the server could not resume the stream (events were purged after the retention window). Proposal: `subscribe(projectId, listener, options?: { onReset?: () => void })` (additive, SDK 1.4). Workaround: `HttpServiceConfig.onReset` and `onRequirementsReset(service, projectId, cb)` from `@ews/requirements-client`; the workspace (coordinator) should register one to reread its requirement projection.
6. **Separate internal error code** (optional) — internal failures use code `unavailable` with HTTP 500 and `details.reason: internal-error`, because `RequirementsErrorCode` has no `internal`. If the coordinator prefers, add `'internal'` (SDK 1.4) and map it one-to-one.

Decided on 14 Oct 2026 (contracts §13): 1 and 2 approved (SDK 1.3.0, adopted in sprint 002), 3 and 4 deferred, demo-mode scope accepted.

7. **Rationale in `RequirementSummary`** (sprint 003, optional) — the summary has no `rationale`, so SysML edits title and statement only (the sprint allowed rationale as optional). Proposal: add `rationale?: string` to `RequirementSummary` (additive); the HTTP adapter already receives it.
8. **Keys in `resolveRepresentation` reasons** (model-service, sprint 003) — the "not referenced" reason names the canonical UUID. SysML now builds its own message with `displayId`; other tools would benefit if model-service used `displayId` in reasons.
9. **Await the projection** (optional, sprint 003) — after `create()` a consumer must poll `getModel()` until the projection contains the UUID (`waitForObject` in tool-sysml, 10 s timeout). Proposal: a host helper such as `ToolApi.whenObject(id, { timeoutMs })`, or let `submitChanges` accept a `references` target that the service knows but the projection has not loaded yet.
10. **Baseline in `SharedContext`** (optional) — the service supports `baselineId` but views have no shared baseline, so SysML shows the working revision of the view's configuration.

4. **Shared pure-domain package** (optional) — DTO types are mirrored in `@ews/requirements-client`
   because the client may not import the service. Conformance is tested by validating real
   responses against the published OpenAPI. A `@ews/requirements-types` package allowed for both
   would remove the duplication (boundaries.test.ts change).

## Integration needs for the coordinator

- **C9 capability inventory** (`apps/workspace/src/assistant/capabilities.ts`, coordinator-owned): the notes on `requirements.fields` ("preview is shown inside the Requirements tool") and `sysml.edit-requirement` ("needs an open Requirements view") are now outdated. `requirements.update` is a platform service proposal and works with every tab closed.

- **Project Management (15 Oct 2026):** wire `createRequirementsArtifactSource(pool, server.events)` into the Project Management plugin in `services/api/src/server.ts` (coordinator-owned host wiring), and pass `twin: composeTwinDirectory(SAMPLE_TWIN, productTwinDirectory(pool))` once CR-PM-API-3 lands. Send me that commit and I will add a test with the real product directory.
- The SDK package.json is at 1.5.0 while the contract is 1.7.0, so `@ews/requirements-service` declares `^1.5.0` (COORDINATOR REVIEW commit). Please bump the package version with the next SDK change.

- **Important**: the Requirements tool now reads canonical requirements only through `services.requirements`. Until the workspace provides it (HTTP adapter, or explicitly the demo adapter), the tool in the workspace shows "The Requirements service is not available here" instead of twin data (by design: no silent substitution). Workspace browser flows that open Requirements (e.g. scratchpad `vision-flow.mjs`) will need the adapter wired. `npm run check` stays green.
- The tool now declares `sdkVersion: '^1.2.0'` and depends on `@ews/requirements-client` (allowed by boundaries.test.ts).
- Root `vitest.config.ts` includes only `packages/*` and `apps/*`: please add
  `services/*/src/**/*.test.ts` (unit tests without a database). Real-PostgreSQL tests stay in
  `npm run req:test:db` (`services/api/vitest.db.config.ts`).
- Workspace: construct `createHttpRequirementsService({ baseUrl: '/api/requirements/v1', devUser })`,
  add the `/api` → `http://127.0.0.1:8787` dev proxy, a development user selector, and an explicit
  demo-mode setting (`createDemoRequirementsService()`).
- Twin directory: the API validates allocation targets against a static development list of the
  sample twin's components (`services/api/src/server.ts` `SAMPLE_TWIN`). Production needs a platform
  twin directory endpoint.
- Twin-owned links (`references`, `satisfies`, verification `verifies`) are not served by
  `traceLinks()`; the host should merge them, or the coordinator decides another owner.
- Twin migration from legacy `REQ-00x` to UUIDs and projection into the model index; until then the
  tool selects the legacy twin ID when a twin object exists, else the UUID.
- Assistant: until contract request 3 is decided, the existing twin-based actions
  (`requirements.read_for_component`, `requirements.update`) keep working on the legacy twin copies
  so workspace tests stay green; API-based actions are added in the tool.

## Unresolved decisions

- **Lifecycle and revisions** (options only; needs an owner decision): (a) keep today's rule: status changes are lifecycle events against the current content revision, so approval does not make verification evidence stale; (b) every status change creates a content revision (simpler history, but verification records pinned to the approved text become stale on approval); (c) a separate record version for status, exposed alongside the content revision (most precise, an SDK change).

- **Inaccessible research sources** (findings depending on them are provisional; see
  docs/research/requirements/acceptance-and-backlog.md §4). PDFs may be supplied in
  `docs/research/requirements/sources/` (gitignored; still empty): INCOSE GtWR v4 (403 bot
  challenge); ISO/IEC/IEEE 29148:2018 (paywalled; catalogue page only); Dick/Hull/Jackson 4th ed.;
  Laplante/Kassab 4th ed.; Pohl 2nd ed. (2025); van Lamsweerde 2009; Wiegers/Beatty 3rd ed.;
  Alexander/Stevens 2002 (TOC/listings only); Polarion official help (renders nothing without
  login/JS); Jama Data Exchange (ReqIF) guide (support portal).
- Full-text sources inspected: OMG ReqIF 1.2 + XSDs, OMG SysML v2.0 Language, NASA SE Handbook Rev 2 (Appendix C).
- Production identity provider (OIDC) and role administration.

## Proposed scope changes

- **Demo mode is limited to the SDK contract** (get, resolve, list, create, update, trace links,
  events). Collections, reviews, baselines, quality checks and ReqIF need API mode. Reason: one
  implementation of the domain rules (server), no drifting in-browser copy. The tool says so in demo
  mode. Not applied silently; recorded here for the coordinator.

## Limitations

- Lifecycle status changes do not create content revisions (they are lifecycle events against the
  current revision), so approval does not make verification evidence stale.
- Unexpected internal errors return HTTP 500 with code `unavailable` and `details.reason: internal-error` (documented; the SDK has no separate internal code, see request 6).
- Delivered outbox rows are purged after the retention window (default 7 days); clients that resume later get a reset.
- `services/api/src/platform/identity.ts` (coordinator-owned since integration) still includes the driver message when the platform database is unreachable; I did not change it. Suggest the same generic message as the Requirements service.
- History is append-only through the API (DB triggers); not tamper-proof.

## Handoff log

- 2026-10-15 (after aa2550f): allocation relations (C3 ref), open-link mapping, API help page rules (empty statement allowed in a draft, refused at request-review). No migrations.

- 2026-10-15 (integration milestone 1): C9 headless Requirements operations and C13 scoping tests committed (a95b4e4, review commit 9bae3e9). No migrations.

- 2026-10-15 (Project Management CRs): CR-PM-REG-1 and CR-PM-REQ-2 committed; SDK change proposal for requests 5, 7, 9 above. No migrations.

- 2026-10-14 (sprint 003): SysML integration committed (see the sprint file). No migrations. Requests 7–10 added.

- 2026-10-14 (sprint 002): see the sprint section above and the sprint file. Migration added: `services/requirements/src/db/migrations/0002_outbox_retention.sql` (index only).

- 2026-10-14 (2): stages 4–7 completed and committed (see commits). Docs: requirements-api.md, requirements-sysml-mapping.md, requirements-reqif.md, docs/modules/requirements.md, docs/dependencies.md rows. Migrations: `services/requirements/src/db/migrations/0001_initial.sql`, `services/api/src/platform/migrations/0001_platform.sql` (unchanged since commit fbc2783).

- 2026-10-14: resumed after reboot (stale `.data/pg/postmaster.pid` removed; no postgres running).
  Stages 1–3 committed (above). Stage 4 UI uncommitted at reboot; continuing.

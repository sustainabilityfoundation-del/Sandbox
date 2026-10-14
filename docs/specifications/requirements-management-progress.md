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
| 4. Core Requirements UI | In progress | API-mode UI in `packages/tool-requirements/src/ui/` (table, collections, detail tabs, matrix, baselines, bulk, saved views, quality, import/export page) |
| 5. SysML integration | Not started (agent side: SDK examples, mapping doc) | Coordinator implements SysML-side consumer changes |
| 6. ReqIF exchange | Not started | Client types and UI page for import preview drafted; `packages/reqif` and server routes pending |
| 7. Quality assistance and refinements | Server checks done (`services/requirements/src/quality/rules.ts`); UI in progress | |

## Commits

| Commit | Content |
| --- | --- |
| abb4ead | Stage 1 research note, capability matrix, acceptance criteria and backlog |
| fbc2783 | Stages 2–3: schema, migrations, seed, HTTP API, host, real-PostgreSQL tests |
| 3204094 | Requirements client: HTTP and demo SDK adapters, module client, SSE client, contract test suite |

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
| Cross-tool and cross-window refresh | Partial | SSE after commit, resume, rollback emits nothing (infrastructure.test.ts); UI refresh on events pending stage 4 browser check; window forwarding is coordinator work |
| API failures preserve unsaved input | Pending | UI stage 4 |
| Idempotent retries | Pass | requirements.api.test.ts "idempotency" (replay, reuse refused, parallel duplicates) |
| ReqIF interoperability and re-import | Pending | Stage 6 |
| Search and pagination on a larger generated dataset | Pass | infrastructure.test.ts: 5 000 generated requirements, 26 pages, no gaps/duplicates, natural key order, prefix search |

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
4. **Shared pure-domain package** (optional) — DTO types are mirrored in `@ews/requirements-client`
   because the client may not import the service. Conformance is tested by validating real
   responses against the published OpenAPI. A `@ews/requirements-types` package allowed for both
   would remove the duplication (boundaries.test.ts change).

## Integration needs for the coordinator

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
- Unexpected internal errors return HTTP 500 with code `unavailable` (the contract lists 503 only).
- Outbox rows are not purged (kept for resume).
- History is append-only through the API (DB triggers); not tamper-proof.

## Handoff log

- 2026-10-14: resumed after reboot (stale `.data/pg/postmaster.pid` removed; no postgres running).
  Stages 1–3 committed (above). Stage 4 UI uncommitted at reboot; continuing.

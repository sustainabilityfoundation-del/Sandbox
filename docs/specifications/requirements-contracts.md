# Requirements Management: agreed contracts and ownership

Status: agreed by the coordinator, 13 October 2026, before delegation.
Brief: [requirements-management.md](requirements-management.md). Progress:
[requirements-management-progress.md](requirements-management-progress.md).

This document records the boundaries the Requirements agent implements against. The agent may
**propose** changes (in the progress file, section "Contract change requests"); the coordinator
decides and edits coordinator-owned files. Record any agreed change here and, for SDK changes, in
`packages/platform-sdk/CHANGELOG.md`.

## 1. File ownership during the Requirements work

| Owner | Paths | Notes |
| --- | --- | --- |
| Requirements agent | `packages/tool-requirements/**` | UI, harness, assistant actions, README, AGENTS.md |
| Requirements agent | `packages/requirements-client/**` (new, `@ews/requirements-client`) | HTTP adapter and explicit demo adapter implementing `RequirementsService`, plus the module's full typed client |
| Requirements agent | `packages/reqif/**` (new, `@ews/reqif`) | ReqIF parsing, validation, serialization; no React, no database |
| Requirements agent | `services/requirements/**` (new, `@ews/requirements-service`) | Domain, PostgreSQL schema `requirements`, migrations, seed, routes (Fastify plugin), outbox, OpenAPI |
| Requirements agent, coordinator review | `services/api/**` (new, `@ews/api`) | Server host: composes plugins, development identities, entitlement and role checks, event stream. `services/api/src/platform/**` (identity, membership, entitlements) follows section 6 exactly and becomes coordinator-owned at integration |
| Requirements agent | `docs/specifications/requirements-*.md` (except this file and the brief), `docs/research/requirements/**`, `docs/modules/requirements.md`, `docker-compose.yml`, `.env.example` | |
| Requirements agent (append only) | `docs/dependencies.md` | Add rows for new dependencies with version and licence |
| Requirements agent (limited) | Root `package.json` | Only scripts prefixed `db:`, `api:`, `req:`, plus `dev:api`. Lockfile changes on the branch are expected |
| Coordinator | `apps/workspace/**`, `packages/platform-sdk/**`, `packages/model-service/**`, `packages/design-system/**`, `packages/tool-sysml/**`, `packages/tool-cad/**`, root `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/decisions/**`, this file, the brief | The agent does not edit these; it files requests |

New semantic icons or design-system components: request them; meanwhile build tool-local
components from existing design-system primitives inside `packages/tool-requirements`.

Package dependency rules are enforced by `packages/platform-sdk/src/boundaries.test.ts`:

```
tool-requirements      → platform-sdk, design-system, requirements-client
requirements-client    → platform-sdk (types and errors only; runs in the browser)
reqif                  → (no @ews packages)
requirements-service   → platform-sdk (framework-free entry only), reqif
api                    → platform-sdk, requirements-service
apps/workspace         → requirements-client (to construct the adapter), tool entry points
tool-sysml, tool-cad   → never any requirements-* package; they use ToolApi.services.requirements
```

The browser never connects to PostgreSQL and never holds credentials.

## 2. Ownership of data

| Data | Owner | Stored in |
| --- | --- | --- |
| Requirement identity, key, canonical text, rationale, type, source, owner, priority, lifecycle, reviews, applicability, verification method and acceptance criteria, custom attributes, comments, change records, external references | Requirements | PostgreSQL schema `requirements` |
| Collections, headings, membership, ordering; requirements baselines | Requirements | `requirements` |
| Requirement ↔ requirement links (`derives-from`, `decomposes`, `depends-on`) | Requirements | `requirements` |
| Allocation (`allocated-to`, requirement → twin component ID) | Requirements (from end) | `requirements`, endpoint is a twin ID validated through the platform |
| SysML requirement usage (`references`, SysML element → requirement ID) and `satisfies` | SysML | Shared twin |
| Verification records (`verifies`, artifact → exact requirement revision) | Requirements tool, as artifacts | Shared twin artifacts (unchanged, ADR-0007) |
| Components, SysML elements, CAD representations | Product / SysML / CAD | Shared twin. Never copied into `requirements` |
| Users, project membership, roles, entitlements | Platform (coordinator) | PostgreSQL schema `platform` |

Document hierarchy (collection membership, headings, order) never implies `derives-from` or
`decomposes`. Approval (review records), verification results (artifacts), compliance assessment and
modelled satisfaction (`satisfies`) stay distinct records.

## 3. Identity

- **Canonical ID**: UUID (`RequirementId`). The key (`REQ-001`) is display text, unique per project,
  and may be renumbered.
- **Legacy twin IDs**: today the twin uses `REQ-001`…`REQ-003` as object IDs. The seed creates these
  requirements with the fixed UUIDs below and records each legacy ID as an alias.
  `RequirementsService.resolve()` accepts a key or a legacy alias.

  | Legacy twin ID | Canonical UUID |
  | --- | --- |
  | `REQ-001` | `5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001` |
  | `REQ-002` | `5b1c7e2a-0002-4e6a-9c1d-6f0a3d2b1002` |
  | `REQ-003` | `5b1c7e2a-0003-4e6a-9c1d-6f0a3d2b1003` |

- The coordinator migrates twin references to canonical UUIDs (additive twin migration, ADR-0009)
  and projects requirements into the workspace's model index as read-only `requirement` objects with
  `id = UUID`. The agent does not change the twin.
- ReqIF identifiers are external references keyed by exchange source, never canonical IDs.
- Project ID: `PRJ-ACT100` (from `@ews/model-service` `PROJECT_ID`). Configurations: twin
  configuration IDs (`CFG-BASE`, …).

## 4. Cross-module SDK contract (SDK 1.2.0)

`packages/platform-sdk/src/contract/requirements.ts` defines `RequirementsService`,
`RequirementSummary`, `RequirementRef`, `RequirementsQuery`, `Page`, `RequirementTraceLink`,
`RequirementsEvent`, `RequirementsServiceError` and `PlatformServices`. Tools receive the service as
`ToolApi.services.requirements` (or `usePlatformServices()`); it is `undefined` when unavailable or
not entitled, and consumers show why instead of substituting data.

- `mode: 'api' | 'demo'` is explicit. The demo adapter is chosen deliberately (harness option or
  workspace setting); an API failure never switches to demo.
- Writes take `expectedRevision`; a mismatch fails with `conflict` and `details.currentRevision`.
- Retryable writes take an `idempotencyKey`.
- The Requirements tool may use the module's richer client from `@ews/requirements-client`
  directly; SysML and CAD use only the SDK contract.
- The harness passes services through `mountHarness(tool, element, { services })`.

## 5. HTTP API conventions

- Base path `/api/requirements/v1`; OpenAPI 3.1 at `/api/requirements/v1/openapi.json`; versioned by
  path. The workspace dev server proxies `/api` to the API (coordinator adds the proxy).
- API port **8787** (`API_PORT`). Development database `ews_dev`; tests create disposable databases.
- Errors: HTTP 400/422 `invalid`, 401 `unauthenticated`, 403 `forbidden`, 404 `not-found`,
  409 `conflict`, 503 `unavailable`, body `{ "error": { "code", "message", "details" } }`, mapped
  one-to-one to `RequirementsServiceError`.
- Concurrency: responses carry `ETag: "<revision>"`; writes require `If-Match` or
  `expectedRevision` in the body. No last-write-wins.
- Idempotency: `Idempotency-Key` header on POST/PATCH; stored with the response for 24 hours.
- Timestamps: RFC 3339 UTC with milliseconds, set by the server.
- Pagination: opaque `cursor`, `limit` 1–200 (default 50), stable ordering.
- Bulk operations: the agent defines per endpoint whether they are atomic or per-item, documented
  in OpenAPI.

## 6. Identity, roles and entitlements (development)

- No authentication exists. Development identities only, accepted when `NODE_ENV !== 'production'`:
  header `X-Dev-User: <userId>`. The server refuses the header in production and documents the
  production integration point (OIDC bearer token validated by the host, mapped to the same user
  record).
- Seeded users for `PRJ-ACT100`:

  | User | Role | Entitlements |
  | --- | --- | --- |
  | `ada` | administrator | `tool:requirements`, `tool:sysml`, `tool:cad` |
  | `rui` | reviewer | `tool:requirements`, `tool:sysml` |
  | `eli` | editor | `tool:requirements`, `tool:sysml`, `tool:cad` |
  | `rho` | reader | `tool:requirements` |
  | `nia` | editor | `tool:sysml`, `tool:cad` (no Requirements entitlement) |

- Every Requirements endpoint checks the `tool:requirements` entitlement **or**, for the
  cross-module subset (`get`, `resolve`, `list`, `traceLinks`, `create`/`update` of canonical fields
  from SysML), `tool:sysml`. The agent documents the full permissions matrix (reader, editor,
  reviewer, administrator) in the progress file and OpenAPI. Client-side gating stays UX only
  (ADR-0008).

## 7. Notifications

- Transactional outbox table in schema `requirements`, written in the same transaction as the
  change. A dispatcher publishes committed events only.
- Delivery to clients: Server-Sent Events at
  `GET /api/requirements/v1/projects/{projectId}/events?after=<eventId>` with `Last-Event-ID`
  resume. Event payload: `RequirementsEvent`.
- Consumers dedupe by `eventId`, invalidate caches and reread authoritative records. The workspace
  forwards events to detached windows over its existing window sync (coordinator).

## 8. Baselines and history

- Requirements baselines pin requirement revisions, relevant relationship revisions and collection
  structure, and are immutable. They are separate from platform (twin) baselines; the coordinator
  will let a platform baseline reference a requirements baseline ID.
- History records actor, timestamp and reason for each committed change; audit events are
  append-only through the API (no tamper-proof claim).

## 9. PostgreSQL locally

- Primary documented setup: Docker Compose (`docker-compose.yml`, PostgreSQL 16 or 17).
- This development machine has **no Docker and no PostgreSQL install**. Tests and local development
  must therefore also work with a real PostgreSQL started from npm (for example the
  `embedded-postgres` package, which runs official PostgreSQL binaries), selected by an environment
  variable. An in-memory imitation (pg-mem or similar) does **not** satisfy the brief's real-database
  tests.
- Reset command refuses any database whose name is not `ews_dev` or a test database.

## 10. Integration the coordinator performs

Not to be implemented by the agent; listed so the agent can prepare for it. Status as of 14 October
2026 (sprint [001](../sprints/001-requirements-integration.md)) in brackets.

1. Construct the HTTP adapter in the workspace, the `/api` proxy, demo-mode setting, development
   user selector. [Done: `apps/workspace/src/platform/services.ts`, header Requirements service menu.]
2. Project requirements into the model index; twin migration from legacy IDs to UUIDs. [Done as a read-time
   projection with aliases instead of rewriting stored twin data: ADR-0012.]
3. SysML tool: place an existing requirement, create a requirement through the API, navigate,
   refresh on events. The agent supplies SDK usage examples and a contract test suite that any
   `RequirementsService` adapter must pass. [Partly: SysML shows canonical text and links to UUIDs
   through the projection; creating a requirement from SysML through the API is open.]
4. Forward requirements events to detached windows. [Each window subscribes to the event stream
   itself instead; not yet browser-tested for detached windows.]
5. Final cross-module acceptance: Requirements ↔ SysML identity, revision, baseline and
   notification behaviour.

## 13. Contract change decisions (14 October 2026)

| Request (progress file) | Decision |
| --- | --- |
| 1. Optional `projectId` in `RequirementWriteOptions` | Approved; SDK 1.3.0 |
| 2. Event type `requirements.collection-changed` | Approved; SDK 1.3.0 |
| 3. Services in `AssistantActionContext` and a `service-proposal` result | Deferred: the AI interface design (docs/modules/ai-interface.md, proposed ADR-0013) is under review, and the current proposal-preview policy stays until then. Keep the in-tool workaround |
| 4. Shared `@ews/requirements-types` package | Deferred: optional; conformance is tested against the OpenAPI document |
| Proposed scope change: demo mode limited to the SDK contract | Accepted, as long as the tool says so in demo mode |
| 5. Reset signal in the SDK (`subscribe(projectId, listener, { onReset })`) | Approved in principle for SDK 1.4, together with the next contract change. Until then the workspace registers `onRequirementsReset` and rereads its projection (14 October 2026) |
| 6. Separate `internal` error code | Declined: HTTP 500 with code `unavailable`, `details.reason: "internal-error"` and `details.errorId` is sufficient and keeps the SDK code set stable |
| Generic message when the platform database is unreachable during authentication | Done by the coordinator (`services/api/src/platform/identity.ts`); the driver message is logged server-side only |

## 11. Handoff format

Each handoff (in the progress file and the final report) lists: completed functionality, changed or
requested contracts, migrations added, test results with commands, limitations, and integration
needs for the coordinator.

## 12. Validation commands

```bash
npm install
npm run check                      # type checks and all tests (must stay green)
npm run build                      # production build
npm run dev:requirements           # standalone harness (port 5181)
npx vitest run packages/tool-requirements packages/requirements-client packages/reqif services
```

The agent adds and documents `db:up`, `db:migrate`, `db:seed`, `db:reset`, `dev:api` and the
real-PostgreSQL test command.

# Requirements API: setup, conventions and operations

Maintained by the Requirements agent. The authoritative schema is the live OpenAPI 3.1 document at
`GET /api/requirements/v1/openapi.json` (generated from the same TypeBox schemas that validate
requests; tests validate real responses against it).

## 1. Local setup

| Step | Docker Compose (primary) | Without Docker (embedded PostgreSQL from npm) |
| --- | --- | --- |
| Configure | `cp .env.example .env`, set `EWS_PG=external` | `cp .env.example .env` (default `EWS_PG=embedded`) |
| Start database | `npm run db:up` (`docker compose up -d db`, PostgreSQL 17) | `npm run db:up` (foreground) or let `dev:api` start it |
| Migrate / seed | `npm run db:migrate`, `npm run db:seed` | same |
| API | `npm run dev:api` (http://127.0.0.1:8787) | same (starts embedded PostgreSQL 17.10, migrates, seeds an empty DB) |
| Frontend | `npm run dev:requirements` (harness, proxies `/api`); workspace after coordinator integration | same |
| Reset | `npm run db:reset` — refuses anything but `ews_dev` / `ews_test*` and `NODE_ENV=production` | same |
| Status | `npm run db:status` | same |
| ReqIF schemas / samples | `npm run req:reqif:schemas`, `npm run req:reqif:samples` | same |
| Real-PostgreSQL tests | `npm run req:test:db` (embedded server in a temp dir; or `EWS_TEST_PG_ADMIN_URL`) | same |

The embedded mode runs official PostgreSQL binaries (embedded-postgres), initialised with UTF-8.
Only the backend connects to PostgreSQL; the browser uses HTTP and holds no credentials. Attachments,
import files and export files go through the object-storage abstraction (`STORAGE_DIR`, local
filesystem adapter, content-addressed).

## 2. Conventions (contracts §5)

- Base path `/api/requirements/v1`, versioned by path; port 8787.
- Errors `{ "error": { "code", "message", "details" } }`: `invalid` 400 (malformed) / 422 (semantic,
  `details.fields`), `unauthenticated` 401, `forbidden` 403, `not-found` 404, `conflict` 409
  (`details.currentRevision`), `unavailable` 503 (database not reachable; nothing changed).
- Unexpected internal errors: HTTP **500**, code `unavailable`, `details.reason: "internal-error"`,
  `details.errorId` (UUID, also in the message and in the server log). The message never contains
  stack traces, SQL, table/constraint names or driver text; a write was rolled back. Database rule
  violations that are mapped (unique, foreign key, check, immutable record) use generic messages too.
  The SDK has no separate internal code, so clients see `RequirementsServiceError` with code
  `unavailable` (status 500 in `RequirementsApiError.status`). Every operation documents the 500
  response in OpenAPI.
- Concurrency: `ETag: "<revision>"` (collections: structure revision); writes need `If-Match` or
  `expectedRevision`; no last-write-wins.
- Idempotency: `Idempotency-Key` on POST/PATCH (required for creation and import upload), replayed
  for 24 h, refused when reused with a different request; concurrent duplicates yield one result.
- Timestamps: RFC 3339 UTC with milliseconds, set by the server (transaction time).
- Pagination: opaque cursor bound to its query, `limit` 1–200 (default 50), natural key order or
  newest revision first; `total` returned.
- Identity: `X-Dev-User` in development only (401 in production). Production integration point:
  validate an OIDC bearer token in `services/api/src/platform/identity.ts` `authenticate()` and map
  it to `platform.users`.
- Configuration context: `X-Configuration-Id` is recorded with emitted events.

## 3. Revision and configuration semantics

- Content revision 1, 2, … per requirement; lifecycle changes, archival and key renumbering are
  recorded as events against the current revision and do not create content revisions.
- `GET …/requirements/{id}?revision=n` returns that immutable revision (with the status it had);
  `?baselineId=` returns the pinned revision and the status/key recorded in the baseline.
- Applicability: empty = all configurations; `configurationId` filters reads and baselines.

## 4. Operation groups

| Group | Endpoints (prefix `/projects/{projectId}` unless noted) |
| --- | --- |
| Requirements | `GET/POST /requirements`, `GET /requirements/resolve?key=`, `GET/PATCH /requirements/{id}`, `POST …/archive`, `…/restore`, `GET /requirements/{id}` (no project prefix: lookup by UUID) |
| Lifecycle and reviews | `POST …/transitions` (request-review, withdraw, reopen, retire, reinstate), `GET …/reviews`, `POST …/reviews/{reviewId}/decisions`, `GET …/lifecycle` |
| History and baselines | `GET …/revisions`, `GET …/compare?from&to`, `GET …/history`, `GET/POST /baselines`, `GET /baselines/{id}`, `GET /baselines/{id}/compare?to=` |
| Traceability | `GET …/trace-links` (SDK), `GET …/relationships`, `GET/POST /relationships`, `DELETE /relationships/{id}`, `GET /relationship-types`, `GET /trace-matrix`, `GET …/impact` |
| Collections | `GET/POST /collections`, `GET/PATCH /collections/{id}`, `POST …/nodes`, `POST …/nodes/{nodeId}/move`, `PATCH/DELETE …/nodes/{nodeId}` |
| Attributes | `GET/POST /attribute-definitions`, `PATCH /attribute-definitions/{id}` |
| Comments, references | `GET/POST …/comments`, `GET/POST …/external-references`, `GET …/collections` |
| Bulk | `POST /bulk` — `atomic: true` (default; all or nothing, error lists per-item outcomes) or `false` (per-item outcomes, successful items commit) |
| Saved views | `GET/POST /views`, `PUT/DELETE /views/{id}` |
| Quality | `GET …/quality`, `POST …/quality/dismissals`, `GET /quality`, `GET/PUT /quality/conventions` |
| Exchange | `POST /imports` (raw file, preview), `GET /imports`, `GET /imports/{id}`, `POST /imports/{id}/apply`, `POST /imports/{id}/discard`, `POST /exports`, `GET /exports/{id}`, `GET /exports/{id}/content`, `GET /exchange-sources`, `GET /attachments/{id}/content` |
| Events | `GET /events` (SSE; `after` / `Last-Event-ID`; `reset` when the resume point is unknown) |
| Events (SDK 1.3) | `requirements.collection-changed` for every committed collection change (entityId = collection, committedRevision = structure revision; metadata edits carry the current structure revision) |
| Meta | `GET /permissions`, `GET /openapi.json` (no project); host: `GET /api/health`, `GET /api/platform/v1/me`, `GET /api/platform/v1/dev-users` (development only) |

## 5. Events (contracts §7)

The outbox row is written in the same transaction as the change. One publisher at a time (advisory
lock) assigns `delivery_seq` in commit order; every API process tails published rows and fans them
out to its SSE clients, so a transaction that commits late is never skipped. Events:
`requirement.created|updated|archived|restored|relationships-changed`,
`requirements.baseline-created`, `requirements.import-completed`, `requirements.collection-changed`
(SDK 1.3). Delivery is at-least-once; consumers dedupe by `eventId` and reread.

**Retention** (sprint 002): delivered events are kept for `OUTBOX_RETENTION_HOURS` (default 168 =
7 days) and purged hourly (and at start). Unpublished events are never purged. Publication time is
assigned under the single publisher's lock (`clock_timestamp()`), so every event after a retained
event is retained too: resuming from an event inside the window loses nothing. Resuming from a
purged or unknown event yields `event: reset`; the HTTP adapter then calls `config.onReset(projectId)`
and listeners registered with `onRequirementsReset(service, projectId, cb)` (the SDK `subscribe()`
has no reset signal; contract change request 5), and the Requirements tool rereads everything.
Idempotency records older than 24 hours are purged at the same time.

**SDK 1.3 writes**: the HTTP adapter uses `RequirementWriteOptions.projectId` when given and makes no
project lookup; otherwise it uses the project it has seen the ID in, or `GET /requirements/{id}`.

## 6. In-process integration for Project Management (SDK 1.7)

- **Artifact source** (CR-PM-REG-1): `createRequirementsArtifactSource(pool, events)` from
  `@ews/requirements-service` implements `ArtifactSource`. It reads the module's own tables (no HTTP)
  and maps the outbox events above to registry changes through `EventHub.subscribeAll`. Kinds,
  lifecycle mapping and paging are documented in the progress file. `provision` returns `not-needed`:
  data is keyed by project ID and a new project starts empty (the development seed writes
  `PRJ-ACT100` only).
- **Allocation targets** (CR-PM-REQ-2): `allocated-to` targets are validated by the host's
  `TwinDirectory` (`ServerOptions.twin`, default: the static sample twin for `PRJ-ACT100`). Allowed
  target types: `assembly`, `part`, `product-element`. `composeTwinDirectory(...)` combines
  directories, e.g. the sample twin and Project Management's product registry (CR-PM-API-3).

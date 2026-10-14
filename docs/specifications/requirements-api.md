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
  (`details.currentRevision`), `unavailable` 503 (500 for unexpected internal errors).
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
| Meta | `GET /permissions`, `GET /openapi.json` (no project); host: `GET /api/health`, `GET /api/platform/v1/me`, `GET /api/platform/v1/dev-users` (development only) |

## 5. Events (contracts §7)

The outbox row is written in the same transaction as the change. One publisher at a time (advisory
lock) assigns `delivery_seq` in commit order; every API process tails published rows and fans them
out to its SSE clients, so a transaction that commits late is never skipped. Events:
`requirement.created|updated|archived|restored|relationships-changed`,
`requirements.baseline-created`, `requirements.import-completed`. Delivery is at-least-once;
consumers dedupe by `eventId` and reread.

# Sprint 002: Requirements adopts SDK 1.3 and closes its backend limitations

## Plan

- Status: ready for coordinator review (implementation complete on `feature/requirements-management`; owner acceptance pending)
- Goal: collection edits made in one window appear in other windows and tools without reload;
  backend errors and event retention behave as documented, so the owner can rely on the service
  over long sessions.
- Baseline commit: the commit that adds this file on `main` (after `809fd3a`).
- Owner/coordinator: coordinator session; implementation by the Requirements agent (branch
  `feature/requirements-management`, worktree `C:\Users\kimge.000\Documents\Sandbox-requirements`).
- Scope:
  1. Adopt SDK 1.3.0: emit `requirements.collection-changed` from the outbox for every committed
     collection structure change; the client and tool refresh collection trees on it; adapters use
     `RequirementWriteOptions.projectId` when given and drop the project lookup then.
  2. Errors: unexpected internal failures get an explicit, documented code and HTTP status in OpenAPI
     and the client maps them to `RequirementsServiceError` without losing the message; no stack
     traces or SQL in responses.
  3. Outbox retention: a documented retention window for delivered events, a purge that never
     removes events a client could still resume from inside that window, and a clear "reset" signal
     (`onReset`) when a client resumes from a purged event.
  4. Keep the progress file, OpenAPI and docs/specifications/requirements-api.md accurate.
- Exclusions: assistant service proposals (contract request 3, deferred pending the AI interface
  review); shared types package (request 4, deferred); SysML-side changes (coordinator);
  lifecycle-revision semantics (needs an owner decision; record options only).
- Affected modules: `services/requirements`, `services/api`, `packages/requirements-client`,
  `packages/tool-requirements`. No coordinator files. Additive database migration only (ADR-0009).
- Dependencies: SDK 1.3.0 (on `main`). Research PDFs still outstanding (not needed for this sprint).

## Acceptance criteria

- [x] Reordering or adding a heading in a collection in window A refreshes the collection tree in
      window B (same or different user) without reload; the event is emitted only after commit.
- [x] `update()` with `projectId` makes no extra project lookup request (asserted in a client test).
- [x] A forced internal error returns the documented code/status, a safe message, and the client
      raises `RequirementsServiceError` with that code; OpenAPI lists it.
- [x] Events older than the retention window are purged; resuming from a purged event triggers
      `onReset` and a full reread; resuming inside the window loses no events (real-PostgreSQL test).
- [x] `npm run check`, `npm run build`, `npm run req:test:db` pass; the harness flow passes; the
      workspace integration still works (`npm run dev`, Requirements tab loads).

## Verification evidence

| Check | Result | Evidence or reason |
| --- | --- | --- |
| Required automated checks | pass | 14 Oct 2026 on code commit 581ee89: `npm run check` 320 tests passed; `npm run build` passed; `npm run build:harnesses` passed (4 harness builds); `npm run req:test:db` 6 files / 102 tests passed (temporary PostgreSQL on a random port 55000–58999, no collision with 54329) |
| Collection change refreshes another window (AC 1) | pass | Real-PostgreSQL: `services/api/test/sprint002.test.ts` "requirements.collection-changed": four structure changes give four events with structure revisions 1–4 after commit; a stale (409) change emits nothing; SDK subscribers of the HTTP adapter receive it. Browser: `collection-flow.mjs` (scratchpad) on the harness (:5191 → API :8797), eli adds a heading and moves it up, rui's window shows the heading and the new order without reload; no console errors |
| `update()` with projectId (AC 2) | pass | `packages/requirements-client/src/adapters.test.ts`: exactly one request (PATCH) with projectId; without it GET `/requirements/{id}` then PATCH |
| Internal error (AC 3) | pass | `sprint002.test.ts` "internal errors": a renamed table forces an unmapped database error → HTTP 500, code `unavailable`, `details.reason: internal-error`, `details.errorId`; no SQL/table names/stack in the body; nothing written; HTTP adapter raises `RequirementsServiceError` code `unavailable` with the message; OpenAPI lists 500 on every operation. Unit: adapters.test.ts maps the body keeping code, message and details |
| Retention, purge and reset (AC 4) | pass | `sprint002.test.ts` "outbox retention": events older than 168 h purged, newer and unpublished kept; resume inside the window delivers the following event with no reset; resume from a purged event yields reset; the HTTP adapter forwards it to `config.onReset` and `onRequirementsReset` listeners after a forced reconnect. The tool rereads on reset (data.tsx) |
| Harness and workspace workflow (AC 5) | pass | Harness flows `req-flow.mjs` (20 checks: edit, failed save keeps input, conflict, quality, cross-window refresh, pages, baseline view, phone/tablet, demo) and `exchange-flow.mjs` (ReqIF preview/apply/export) all passed against the sprint API. Workspace from this worktree (`API_PORT=8797 npm run dev -w @ews/workspace -- --port 5195`): Requirements tab lists REQ-001 from the API, no console errors. Your `npm run dev` (5173/8787/54329) was not touched |
| Documentation links and diff | pass | requirements-api.md (errors, retention, collection-changed, projectId), OpenAPI info, progress file (sprint section, requests 5–6, lifecycle options), .env.example (`OUTBOX_RETENTION_HOURS`); links checked by hand; `git diff --check` clean |

## Runnable checkpoint and walkthrough

- Candidate commit or tag: code checkpoint 581ee89 (docs and evidence in the following commit on `feature/requirements-management`).
- Startup: `npm run dev`; harness `npm run dev:requirements`.
- Owner walkthrough:
  1. `npm run dev`, open http://localhost:5173/workspace/ and Requirements in two windows (or the
     workspace and `npm run dev:requirements`). Choose the collection "ACT-100 System Requirements
     Specification" in both.
  2. In window A add a heading (Collections panel → Heading) and use its menu → Move up. Window B
     shows the heading and the new order within about a second, without reload.
  3. Optional: `OUTBOX_RETENTION_HOURS=1` for the API; a window that was offline longer than that
     rereads everything when it reconnects (no missed changes, no error).
- Migration: `0002_outbox_retention.sql` adds one index; no data is changed. Recovery: none needed;
  dropping the index is safe.

## Owner feedback and next increment

- Owner acceptance: pending
- Next increment (coordinator): create and place requirements from SysML through the API
  (contracts §10.3).

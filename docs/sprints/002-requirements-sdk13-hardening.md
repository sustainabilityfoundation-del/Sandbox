# Sprint 002: Requirements adopts SDK 1.3 and closes its backend limitations

## Plan

- Status: in progress
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

- [ ] Reordering or adding a heading in a collection in window A refreshes the collection tree in
      window B (same or different user) without reload; the event is emitted only after commit.
- [ ] `update()` with `projectId` makes no extra project lookup request (asserted in a client test).
- [ ] A forced internal error returns the documented code/status, a safe message, and the client
      raises `RequirementsServiceError` with that code; OpenAPI lists it.
- [ ] Events older than the retention window are purged; resuming from a purged event triggers
      `onReset` and a full reread; resuming inside the window loses no events (real-PostgreSQL test).
- [ ] `npm run check`, `npm run build`, `npm run req:test:db` pass; the harness flow passes; the
      workspace integration still works (`npm run dev`, Requirements tab loads).

## Verification evidence

| Check | Result | Evidence or reason |
| --- | --- | --- |
| Required automated checks | not run | |
| Harness and workspace workflow | not run | |
| Documentation links and diff | not run | |

## Runnable checkpoint and walkthrough

- Candidate commit or tag: to be recorded after the agent's handoff and coordinator review.
- Startup: `npm run dev`; harness `npm run dev:requirements`.
- Owner walkthrough: to be written at handoff.

## Owner feedback and next increment

- Owner acceptance: pending
- Next increment (coordinator): create and place requirements from SysML through the API
  (contracts §10.3).

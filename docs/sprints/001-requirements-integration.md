# Sprint 001: Requirements service integrated into the workspace

## Plan

- Status: ready for owner review
- Goal: the owner can start the workspace with one command and work with requirements stored in
  PostgreSQL in every tool: Requirements, SysML, the product tree, inspector, verification records
  and baselines all show the same canonical requirements.
- Baseline commit: `b866179` (local `main` after merging `feature/requirements-management` at
  `6faa779` and `origin/main` at `7120c29`).
- Owner/coordinator: coordinator session. The Requirements module itself was built by the delegated
  Requirements agent (branch `feature/requirements-management`, see its
  [progress file](../specifications/requirements-management-progress.md)).
- Scope: the workspace connects to the Requirements service (API or explicit demo, development user),
  `npm run dev` starts the backend, requirements are projected into the shared model
  ([ADR-0012](../decisions/0012-read-time-projection-of-external-objects.md)), verification records and
  platform baselines pin service revisions, keys are shown instead of UUIDs, regressions repaired.
- Exclusions (next increments): creating a requirement from SysML through the API; requirement
  history inside the workspace inspector (it points to the Requirements tool); a static production
  deployment with an API (the preview build is static); production authentication.
- Affected modules and contract/data changes: `apps/workspace`, `@ews/model-service` (additive:
  alias-aware `buildModelIndex`, `composeSnapshot`, `displayId`, `registerExternalObjects`, optional
  `BaselineDraft.external`), `@ews/platform-sdk` (re-exports `displayId`), `tool-requirements`
  (verification records keyed by canonical ID, keys shown), `tool-sysml` (keys shown), `services/api`
  (stale-lock recovery). Stored twin data is not migrated.
- Dependencies and blockers: none. Research PDFs from the owner are still outstanding; they affect
  provisional research findings only.

## Acceptance criteria

- [x] `npm run dev` starts PostgreSQL, the Requirements API and the workspace; a running API is reused.
- [x] After a crash, kill or reboot, startup clears the stale PostgreSQL lock and orphaned server
      processes of the dead server, and data persists.
- [x] The workspace Requirements tool reads from the API; the header menu switches API/demo and the
      development user; API down is reported, never replaced by demo data.
- [x] Product tree, inspector, search and SysML show the service's requirements by key, with canonical
      text; selecting the rod filters Requirements by the service's allocation.
- [x] Edit a requirement in Requirements: SysML text and the inspector show it without reload.
- [x] Verification record pinned to the service revision and a baseline; a later edit makes it stale;
      the verified statement comes from the service's history; change impact and baseline comparison
      show the change.
- [x] Existing workflows (CAD dimensions, subscriptions, detached CAD window, tool failure isolation,
      ownership rules) still pass.

## Verification evidence

| Check | Result | Evidence or reason |
| --- | --- | --- |
| `npm run check` | passed | 17 files, 316 tests |
| `npm run build`, `npm run build:harnesses` | passed | workspace, GLB viewer and three harnesses built |
| `npm run req:test:db` (real PostgreSQL 17.10) | passed | 5 files, 95 tests |
| Workspace browser flows | passed | platform flow, vision flow (Phase 1 workflow on the API), integration flow (service menu, reader identity, demo mode): 0 failures, no console errors |
| Harness browser flows | passed | Requirements harness (agent's flow, 19 checks incl. conflict, failure, cross-window refresh, phone/tablet); SysML and CAD harness flow |
| `npm run dev` restart after hard kill | passed | log: "Removed stale PostgreSQL lock …", API and workspace up, seed data intact |
| Detached workspace window refresh on requirement edit | not run | each window subscribes to events itself; browser-tested in the harness, not in a detached workspace window |
| Documentation links and diff | passed | `git diff --check`; new links point to existing files |

## Runnable checkpoint and walkthrough

- Candidate commit: recorded in the commit that follows this one (see `git log`).
- Startup: `npm install`, then `npm run dev`; open http://localhost:5173/workspace/. The first start
  initialises PostgreSQL (about a minute).
- Owner walkthrough:
  1. Open the header's **Requirements service** menu (requirements icon): "API reachable", user `eli`.
  2. Requirements tab: six requirements from PostgreSQL (REQ-001 … REQ-006), collections, Matrix,
     Baselines, Quality and Import/export pages.
  3. In CAD, click the rod, then open Requirements: REQ-001 and REQ-004 (allocated to the rod).
  4. Open REQ-001 (Enter), Edit tab: change the statement, give a reason, **Save revision**. Open SysML
     → Text: the new statement is shown. The product tree lists REQ-001 by key.
  5. Header **Baselines → Create baseline**; then in REQ-001's Verification tab record a passing result
     against that baseline: the table shows **Verified**. Edit REQ-001 again: **Stale evidence**, and
     **Show verified statement** shows the text that was verified. **Baselines → Compare** lists REQ-001.
  6. Switch the user to `rho` (reader) in the service menu: editing actions disappear. Switch to
     **Demo**: the header says "Demo data".
  7. Stop with Ctrl+C and run `npm run dev` again: your edits are still there.
- Known limitations, migrations and recovery:
  - Data: requirements in `.data/pg` (PostgreSQL). `npm run db:reset` resets only the development
    database. The twin's browser data is unchanged; legacy IDs are mapped at read time.
  - Verification records made before this sprint pinned twin revisions and now show as potentially
    stale (honest: the service numbers revisions anew).
  - If the API is down, the twin's legacy requirements stay visible and the header says the API is
    unreachable.
  - The static preview build has no API; use demo mode there.

## Owner feedback and next increment

- Owner acceptance: pending
- Actual feedback: pending
- Next increment: create and place requirements from SysML through the API (contracts §10.3), then
  detached-window verification and requirement history in the inspector.
- Handoff/blockers: research PDFs (INCOSE GtWR v4, ISO/IEC/IEEE 29148, six textbooks, Polarion help)
  to `docs/research/requirements/sources/` (git-ignored) when available.

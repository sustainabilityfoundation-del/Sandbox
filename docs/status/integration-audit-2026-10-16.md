# Integration audit, 16 October 2026

Requested by the owner. Audited main 515cba8 (and branch state at about 23:00 EDT). Evidence (screenshots, logs, API dumps) is in the
coordinator's session scratchpad (`audit-registry-exposure.md`, `audit-matrix/`, `audit-d1/`); the findings are summarised here.

## 1. Branches and worktrees against main

All module and earlier feature branches are fully merged. Implemented but not yet on main:

| Branch | Content | State |
| --- | --- | --- |
| `ui/retire-illustrative-rename-system-model` | Illustrative SysML and mock CAD tools retired from UI and AI (data and IDs kept); "System Model" display name; ADR-0077 | Approved; integration run in progress |
| `feature/ct-2c2-sdk` (contains `feature/ct-2c1-design-system`) | Design system 1.3.0 (menu bar, palettes, context sets, session strip, dock panels); SDK 1.14.0 | Approved; review fixes and browser-test robustness in progress |
| `cad/c1-sketching-reliability` (contains `d1/oss9-cad-check-kernel`) | Click-to-draw sketching, probe-first naming, repair reference, OCCT 8.0, kernel-measured pocket width | Approved after re-review; waiting for its integration run |
| `feature/ai-infra-a-core` | AI provider contract, model and pricing registries, insert-only usage ledger, ADR-0079 | Done; review pending |
| `feature/ecii-1-intent` | ECII engineering intent and clarification | In progress |

About 30 agent worktrees under `.claude/worktrees` belong to merged branches and can be removed.

## 2. Local development server

The owner's `npm run dev` processes (ports 5173 and 8787) started at 07:45 EDT. The API runs under `tsx` **without watch mode**, so it
still serves the morning's server code; Vite reloads the browser code from the current main checkout. Browser and server are
therefore out of step, and none of the day's server changes are live. **Action for the owner: restart `npm run dev`** (it also runs
new database migrations). From now on the main checkout stays on main; integration runs use `../Sandbox-integration`.

## 3. Capability registry against working controls

160 entries (requirements 26, platform 23, assistant 7, illustrative SysML 12, mock CAD 10, conceptualize 33, cad-modeler 25,
sysml-modeler 20, projects 4). Toolbar IDs and assistant actions match in both directions (0 mismatches); the existing checks pass.
Gaps: only Requirements declares `apiOperations`, so about 238 of 303 service operations elsewhere have no entry and no drift check;
six `api`-surface entries have no user control (`cad-modeler.check`, `cad-modeler.handoff`, `sysml-modeler.schema`,
`conceptualize.graph-api`, `requirements.events`, `requirements.permissions`).

## 4. Merged but not reachable by a user

1. CT-2a `CommandBar` and the command model are used only by the SDK harness; the workspace still renders `shell/ToolToolbar.tsx`
   (wiring is CT-2b and CT-2c3).
2. SDK 1.9 `FilesService` has no producer, so `projects.store_document` works only with inline data.
3. `cad-modeler.check` (D1 step 7) is assistant-only; its result appears only as chat text and an evidence record.
4. Project Management: work items, milestones, members, link creation, document upload, duplicate and delete project have service
   operations (51) but no UI.
5. The About page (`apps/workspace/src/platform/capabilities.ts`) still calls CAD Modeler and SysML Modeler "experimental" and Project
   Management "planned", contrary to the registry.
6. `THIRD_PARTY_NOTICES.txt` ships but is not linked from the UI; dependency register and licence checks run only in CI.

## 5. Duplicates and legacy

Illustrative `tool-sysml` and mock `tool-cad` (being retired, branch above); twin `represents` versus the product registry; three unit
tables (`engineering-calc`, `sysml-core`, SDK quantities; OSS-10); hard-coded visualization image prices; `design-reasoning-core` has no
importers outside its tests; a stale "until SDK 1.6" note in `cad-client`.

## 6. The empty SysML requirements matrix

Not a query bug. The matrix (`packages/sysml-core/src/query/matrix.ts`) builds rows only from SysML requirement usages and columns from
satisfy relationships in the current scope. D1 creates no SysML requirements or satisfy links (its two requirements live in the
Requirements service, allocated to the product element), so the D1 matrix is empty; the default example project shows 3 rows. Managed
requirements are never bridged into SysML rows. The matrix tab sits in the toolbar overflow, and its empty message does not explain
why.

## 7. D1 through the visible UI

Run with the fake provider, typing into the assistant panel and pressing Apply, navigating with the rail, then reloading in a fresh
browser. All nine D1 steps pass through the chat UI with no console errors or failed requests, and everything survives a fresh
session. Gaps:

1. **No UI for the CAD check** against constraint bounds (assistant-only).
2. **Thin SysML model:** one part definition, no requirement links (D1 step 4 asks for them).
3. **Raw UUIDs shown** instead of stable IDs: the matrix column header, the CAD binding ("constraint 9f873c52..." instead of CST-001),
   "Applies to Concept d84d43be".
4. Conceptualize constraint list truncates the bound; the right Inspector does not follow the selection.
5. REQ-002 left unallocated; no origin (stakeholder or AI-proposed) column in the requirements table.
6. The rail shows the old "SysML" and "CAD" demo tools beside the modelers (fixed by the retire branch).
7. The plumbing flow `demo-d1.mjs` bypasses the UI: it connects through the API, never opens the tool views, reads results through the
   API, and uses keyword prompts. It proves plumbing, not the AI's handling of a natural request; that needs the live run (D1
   acceptance).

## 8. Fix list (priority order)

| ID | Fix | Owner | When |
| --- | --- | --- | --- |
| AUD-1 | Restart `npm run dev` | Owner | Now |
| AUD-2 | Merge the queue: retire branch, CT-2c1/2c2, C1 (with OSS-9), AI increment A | Coordinator | In progress |
| AUD-3 | CAD check in the CAD UI (command, result panel with bounds, kernel provenance) | CAD | Done on cad/name-and-check-ui (toolbar "Check against constraints", result in Diagnostics) |
| AUD-4 | Stable IDs instead of UUIDs in the matrix, CAD binding labels and Conceptualize references | Each module | After the queue |
| AUD-5 | SysML: D1 script adds requirement usages, satisfy links and `link_requirement`; matrix empty message explains managed requirements; a command that brings a managed requirement into the System Model with its link | System Model | Now |
| AUD-6 | Conceptualize: show constraint bounds in full; Inspector follows the selection | Conceptualize | After ECII increment 1 |
| AUD-7 | About page derived from the capability registry | Platform | With CT-2b |
| AUD-8 | Requirements: origin column; D1 script allocates every requirement | Requirements | After the queue |
| AUD-9 | A UI producer for `FilesService` (file upload and CAD export staging) | Platform, Projects | Later |
| AUD-10 | API operation coverage check for all services | Platform | CT-2b |
| AUD-11 | Matrix and coverage tabs out of overflow | System Model | With the System Model toolbar (CT-3) |
| AUD-12 | Remove worktrees of merged branches | Coordinator | Now |
| AUD-13 | D1 with a real model and a natural-language request through the UI | Owner (acceptance) | When the owner has time |

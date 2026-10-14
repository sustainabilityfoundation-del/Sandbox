# Sprint 003: Requirements in SysML through the Requirements service

## Plan

- Status: ready for owner review (coordinator review done 14 October 2026)
- Goal: in the SysML tool the owner can place an existing requirement in the model, create a new
  requirement from SysML that is stored in the Requirements service, edit its canonical text with the
  same validation as the Requirements tool, and navigate between the requirement and its SysML usage.
  SysML never stores its own copy of the requirement text.
- Baseline commit: the commit on `main` that adds this file.
- Owner/coordinator: coordinator session; implementation by the Requirements agent, which for this
  sprint also owns `packages/tool-sysml` (worktree `C:\Users\kimge.000\Documents\Sandbox-requirements`,
  branch `feature/requirements-management`).
- Scope (brief §6, contracts §10.3):
  1. Place an existing requirement: the Add Requirement Reference dialog lists requirements from the
     projected model (canonical UUIDs, shown by key), searchable; creates a requirement usage with a
     `references` link to the canonical ID.
  2. Create from SysML: a "New requirement" path that calls `services.requirements.create` (with an
     idempotency key), then adds the usage and `references` link once the requirement is in the model;
     failures keep the user's input; no duplicate on retry.
  3. Edit canonical fields from SysML (title, statement; optional rationale) through
     `services.requirements.update` with `expectedRevision`; conflicts are explained, input kept.
  4. Navigate: from a requirement usage open the requirement in Requirements (`openTool` + select),
     and from a requirement selection show its SysML usages; selection stays shared.
  5. Baseline/configuration awareness where the SDK supports it; refresh after committed changes
     (already provided by the projection; verify, do not duplicate).
  6. Unavailable service (not entitled, API down): SysML explains and offers no stale copy.
  7. Update `docs/specifications/requirements-sysml-mapping.md`, `packages/tool-sysml/AGENTS.md`.
- Exclusions: SysML v2 conformance; new SysML constructs; workspace, SDK, model-service, design-system
  changes (request them); the AI capability registry (coordinator sprint 004 works in
  `apps/workspace/src/assistant/` and the shell, do not edit those).
- Affected modules: `packages/tool-sysml` (agent), possibly `packages/requirements-client` and
  `services/*` (agent). Contract changes only by request (contracts §13 process).
- Dependencies: SDK 1.3 `RequirementsService`; workspace projection (ADR-0012). Note: a newly created
  requirement becomes known to the twin only after the projection refreshes (change event, ~150 ms);
  links to it before that are refused by the twin repository. Design for this (wait for the object in
  the model, with a timeout and a clear message) or request a platform change.

## Acceptance criteria

- [x] Place REQ-005 in SysML: a requirement usage referencing its UUID appears; the diagram and text
      show the canonical text by key; no statement is stored on the SysML element.
- [x] Create a requirement from SysML: it exists in PostgreSQL (visible in the Requirements tool) and
      is referenced by a new SysML usage; retrying after a simulated network failure creates no duplicate.
- [x] Edit its statement from SysML: the Requirements tool shows the new revision; a stale edit is
      refused with an explanation and the input is kept.
- [x] Navigate both ways between a requirement and its SysML usage; selection is shared.
- [x] As `nia` (SysML-only entitlement) the cross-module subset works; as a user without `tool:sysml`
      writes are refused by the server.
- [x] Existing SysML features and the SysML harness flow still work; `npm run check`, `npm run build`,
      `npm run build:harnesses`, `npm run req:test:db` pass; workspace `npm run dev` flow passes.

## Verification evidence

| Check | Result | Evidence or reason |
| --- | --- | --- |
| Required automated checks | passed | `npm run check`: 19 files, 327 tests (includes `packages/tool-sysml/src/requirements.test.ts` and `boundaries.test.ts`); `npm run build` exit 0; `npm run build:harnesses` exit 0; `npm run req:test:db`: 7 files, 106 tests, including `services/api/test/sysml.test.ts` (4) |
| Place REQ-005 | passed | Workspace flow: usage appears with "REQ-005" in the diagram; inspector shows the canonical statement read from the service; text notation `doc /* REQ-005 Motor power: The motor shall deliver …`; every stored `sysml-element` of kind requirement has no title or statement (6 checked); unit test: the usage batch is `{ kind: 'requirement' }` plus `references` |
| Create from SysML, no duplicate | passed | Workspace flow: first POST reaches the server but the response is dropped (Playwright route); the dialog reports it and keeps the input; the retry yields exactly one row in PostgreSQL (queried through the API) and one usage referencing it (REQ-009). DB test: same with a lost response through the SDK adapter as nia; eli reads it |
| Edit statement, stale edit | passed | Workspace flow: SysML edit gives revision 2 in the API; after ada changes it, a stale SysML edit shows "Someone else changed this first" and keeps the typed text. DB test: history actor nia, reason "Edited in SysML"; conflict carries `currentRevision` |
| Navigate both ways | passed | Workspace flow: *Open in Requirements* shows the row selected in Requirements; Requirements Trace tab *Show in SysML* selects the usage in SysML (shared selection) |
| nia subset / users without tool:sysml | passed | Workspace flow as nia: create from SysML, `createdBy` nia (REQ-010). DB test: nia patching `owner` → 403; zed (CAD only) create and list → forbidden; rho (Requirements reader, no tool:sysml) create → forbidden |
| Existing SysML features (harness, :5192) | passed | Harness flow: diagram renders, Add Part, place REQ-003, inspector and New requirement explain the missing service, Connect (satisfy), text notation. Only console error: the harness has no favicon (404), pre-existing |
| Workspace dev flow | passed | Workspace on :5195 with API :8797 and embedded PostgreSQL :54339 (`npm run dev:api` + workspace dev server, i.e. the `npm run dev` pair on other ports); no console errors in the flow |
| Documentation links and diff | passed | requirements-sysml-mapping.md §3, tool-sysml AGENTS.md, progress file reviewed; links resolve |

Scripts (session scratchpad, not committed): `pw/req/sysml-workspace-flow.mjs` (13 checks), `pw/req/sysml-harness-flow.mjs` (8 checks).

## Runnable checkpoint and walkthrough

- Candidate commit: the head of `feature/requirements-management` after this file's commit (code in 4162511).
- Startup: `npm run dev`, open http://localhost:5173/workspace/?tool=sysml with requirements mode *api*.
- Owner walkthrough:
  1. In SysML choose *Add requirement reference* → *Existing requirement*, type "REQ-005", choose it, *Add reference*. The usage appears labelled REQ-005; the inspector shows the statement from Requirements; *Text* shows it as a `doc` comment.
  2. *Add requirement reference* → *New requirement*, enter title and statement, *Create requirement and add usage*. The new key appears in the diagram and in the Requirements table.
  3. Select the usage, *Edit text*, change the statement, *Save in Requirements*: the revision increases. Edit the same requirement in Requirements meanwhile, then save in SysML: the conflict is explained and your text stays.
  4. *Open in Requirements* selects it there; in Requirements, the Trace tab's *Show in SysML* returns to the usage.
- AI coverage: placing maps to `sysml.add_requirement_reference` (unchanged); create and edit from SysML have no assistant operation because proposals cannot carry service writes (contract request 3, deferred); see the mapping doc §3. Preview policy unchanged.
- Limitations: rationale not editable from SysML (request 7); no baseline in shared context (request 10); a requirement not in the projection within 10 s is created but not linked until *Add usage*; the harness has no Requirements service, so create and edit are workspace-only.

## Coordinator review (14 October 2026)

- Files changed only in the assigned area (`packages/tool-sysml`, Requirements packages, services, own docs).
- Merged into `main` with sprint 004; rerun on the merge: `npm run check` 333 passed, `npm run build`,
  `npm run build:harnesses` (3 harnesses), `npm run req:test:db` 106 passed; the agent's SysML workspace
  flow 13/13 on the coordinator's `npm run dev` (5173/8787); platform, vision, integration and coverage
  flows 0 failures (the platform flow needed a 500 ms pause after switching the subscription plan: a
  test-timing fix, not an application change).
- AI inventory updated with the three new SysML capabilities.
- Contract requests 7–10 decided: contracts §13.

## Owner feedback and next increment

- Owner acceptance: pending

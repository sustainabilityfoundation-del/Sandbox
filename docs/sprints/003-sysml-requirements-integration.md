# Sprint 003: Requirements in SysML through the Requirements service

## Plan

- Status: in progress
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

- [ ] Place REQ-005 in SysML: a requirement usage referencing its UUID appears; the diagram and text
      show the canonical text by key; no statement is stored on the SysML element.
- [ ] Create a requirement from SysML: it exists in PostgreSQL (visible in the Requirements tool) and
      is referenced by a new SysML usage; retrying after a simulated network failure creates no duplicate.
- [ ] Edit its statement from SysML: the Requirements tool shows the new revision; a stale edit is
      refused with an explanation and the input is kept.
- [ ] Navigate both ways between a requirement and its SysML usage; selection is shared.
- [ ] As `nia` (SysML-only entitlement) the cross-module subset works; as a user without `tool:sysml`
      writes are refused by the server.
- [ ] Existing SysML features and the SysML harness flow still work; `npm run check`, `npm run build`,
      `npm run build:harnesses`, `npm run req:test:db` pass; workspace `npm run dev` flow passes.

## Verification evidence

| Check | Result | Evidence or reason |
| --- | --- | --- |
| Required automated checks | not run | |
| Workspace and harness workflow | not run | |
| Documentation links and diff | not run | |

## Runnable checkpoint and walkthrough

- Candidate commit: to be recorded after handoff and coordinator review.
- Owner walkthrough: to be written at handoff.

## Owner feedback and next increment

- Owner acceptance: pending

# Sprint 004: AI capability inventory and inspection (AI Interface sprint 1)

## Plan

- Status: ready for owner review
- Goal: the owner can see what the product can do, which of it the assistant can do, through which
  operation, and where the gaps and mock features are (development plan sprint 1, feature AI-001).
- Baseline commit: `c645f62` (`main`).
- Owner/coordinator: coordinator session (in parallel, the Requirements agent works on sprint 003 in
  `packages/tool-sysml`; no shared files).
- Scope: a maintained inventory in `apps/workspace/src/assistant/capabilities.ts`; completeness tests;
  a read-only inspection dialog; a coverage report (`docs/modules/ai-interface/coverage.md`).
- Exclusions: the registry and execution gateway (ADR-0013 still proposed), contract changes, provider
  integration, any change to the preview policy.
- Affected modules: `apps/workspace` only (plus a boundary rule allowing the workspace's tests to use
  `@ews/platform-sdk/testing`). No contract or data changes.

## Acceptance criteria

- [x] The inventory covers UI controls, platform functions, assistant operations and every
      Requirements API operation, with effect, implementation status and AI coverage.
- [x] Tests fail when a toolbar item, assistant operation or API operation is missing or stale
      (mutation-checked by breaking the inventory).
- [x] Mock features (CAD, the scripted assistant) are never labelled implemented; not-built features
      (native CAD, STL) are listed as not available.
- [x] The owner can open the inventory from the command palette and from the assistant panel, filter
      by module and coverage, search, and see the overall coverage, on desktop and phone.
- [x] Existing workflows unaffected.

## Verification evidence

| Check | Result | Evidence or reason |
| --- | --- | --- |
| `npm run check` | passed | 19 files, 326 tests (6 new inventory tests; boundary rule updated) |
| Drift tests catch omissions | passed | renaming a toolbar item and an API operation in the inventory failed 2 tests; restored |
| Browser: coverage dialog | passed | palette and assistant-panel entry, summary 22 % (68 capabilities), coverage filter shows only gaps (39), search, phone 390 px as cards without horizontal overflow, no console errors |
| `npm run build` | see commit | run before committing |
| Documentation | passed | coverage.md, links checked |

## Runnable checkpoint and walkthrough

- Candidate commit: `5251a25` (merged into `main` at `b88f22f` with sprint 003).
- Startup: `npm run dev`, open http://localhost:5173/workspace/.
- Owner walkthrough:
  1. Ctrl+K → "AI capability coverage" (or ChatGPT panel → "What can the assistant do?").
  2. Read the summary: share covered and counts per coverage level.
  3. AI coverage → "No AI path" to see the gaps; Module → Requirements for that tool.
  4. Search "baseline" or an operation name such as `requirements.update`.
- Known limitations: the inventory is maintained by hand at capability granularity (tests check
  toolbars, assistant operations and API operations automatically; panels and fields are reviewed by
  hand). It does not execute anything.

## Owner feedback and next increment

- Owner acceptance: pending
- Decision needed: accept, change or reject ADR-0013 (registry shape, AssistantContribution
  migration) before sprint 2.
- Next increment: AI sprint 2, shared operations for one Requirements workflow (see coverage.md).

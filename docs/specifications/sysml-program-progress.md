# SysML / MBSE program: progress

Maintained by the SysML agent. Brief: [sysml-program.md](sysml-program.md) (do not edit).
Contracts and governance: [sysml-program-contracts.md](sysml-program-contracts.md).

Branch: `feature/sysml`. Worktree: `C:\Users\kimge.000\Documents\Sandbox-sysml`.

## Phase status

| Phase | Status | Evidence |
| --- | --- | --- |
| Research and architecture (brief §14 items 1-10) | Done (proposed, awaiting coordinator review) | docs/research/sysml/*, docs/modules/sysml/*, ADR-0030…0038 |
| 1 Foundation | In progress: core, service, client done; AI access next | packages/sysml-core (87 tests), services/sysml (15 DB tests), packages/sysml-client (contract suite, local + HTTP) |
| 2 Modeling environment | Not started | |

## Handoff log

- 2026-10-15 (interim): core, service and client committed (see `git log feature/sysml`). Next: tool
  `packages/tool-sysml-modeler` (browser, text editor, General/Interconnection views, inspector,
  validation, history, assistant actions, help, harness), workspace registration, capability inventory.
  Official corpus baseline (SysML-v2-Release 2026-08, EPL-2.0, not committed): 14.3% of 196 example and
  training files pass cleanly, 0 crashes (`npx vitest run --config packages/sysml-core/vitest.official.config.ts`
  after `npx tsx packages/sysml-core/scripts/fetch-official.ts`).

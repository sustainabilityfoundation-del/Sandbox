# CAD: development instructions for agents

For people and agents working on the CAD. Root rules: [AGENTS.md](../../../AGENTS.md);
contracts and ownership: [cad-program-contracts.md](../../specifications/cad-program-contracts.md).
Per-package rules: `packages/cad-core/AGENTS.md`, `packages/cad-kernel/AGENTS.md`,
`packages/tool-cad-modeler/AGENTS.md`.

## Working rules

1. **One operation layer.** Every model change is a command in `cad-core` (`registry.ts`) with an
   input JSON Schema, preconditions, error codes and undo text. The UI and the assistant build
   command objects; never mutate a document elsewhere. After adding or changing a command run
   `npm run cad:commands` and update the help page `commands.md`.
2. **Kernel isolation.** Only `cad-kernel` imports replicad or OCCT. New kernel operations extend
   `GeometryKernel` (cad-core `kernel.ts`), the OCCT adapter and the worker protocol together.
3. **Deterministic core.** No `Date`, `Math.random` or kernel handles in documents; IDs come from
   `nextId`. Regeneration results are derived and cached by content key.
4. **Names, not indices.** Refer to faces and edges by stable names (ADR-0024); new features must emit
   naming probes and tests that names survive dimension changes.
5. **Honest status.** Update [requirements.md](requirements.md), [backlog.md](backlog.md), the help
   pages and the progress file in the same change. Never label planned work as implemented.
6. **Format changes.** Additive changes bump the format minor version and the JSON Schema; breaking
   ones need a migration and an old-format fixture test (ADR-0009).
7. **Tests.** Numeric and topological assertions on the real kernel for geometry; pure tests for
   core logic; a browser flow for UI changes (`pw/cad/*.mjs` pattern: harness 5198, workspace 5199).
8. **Licences.** Pre-authorized: MIT, BSD, Apache-2.0, ISC, zlib, MPL-2.0, LGPL as a separately
   loaded module. Anything else needs coordinator approval first. Pin exact versions released at
   least two weeks earlier and record them in `docs/dependencies.md`.
9. **Shared files.** Coordinator-owned edits go in their own commits prefixed `COORDINATOR REVIEW:`.

## Commands

```bash
npm run cad:dev                                   # harness on :5198
npm run cad:test                                  # CAD tests (core, kernel, tool)
npm run cad:bench                                 # regeneration benchmarks
npm run cad:commands                              # regenerate docs/modules/cad/commands.json
npm run check && npm run build && npm run build:harnesses
```

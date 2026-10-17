# CAD Modeler: testing and validation strategy

Status: implemented for Phase 1 (CAD agent). Brief §12: geometry is validated numerically and
topologically, not only visually.

## 1. Test layers

| Layer | Location | Kernel | What it proves |
| --- | --- | --- | --- |
| Core unit tests | `packages/cad-core/src/core.test.ts` | none | Expressions, parameter cycles, solver (exact solutions, DOF, free points, redundancy, conflict isolation, driven dimensions, tangency/angles/arcs, determinism), profiles (holes, open loops), commands (placeholders, deterministic IDs, atomicity, validation codes, version checks), undo/redo and operation log, native round trip and rejection, dependency graph, catalogue completeness |
| Contract tests | `packages/cad-core/src/contracts.test.ts` | none | JSON Schema (Ajv, draft 2020-12) and TypeScript validator agree on accepted and rejected documents; `commands.json` is current; package boundaries |
| Kernel integration | `packages/cad-kernel/src/kernel.test.ts` | OCCT in-process | Volume, bounding box, centre of mass, mass, topology counts (solids, shells, faces, edges, vertices), BRepCheck validity; stable face names and normals across dimension changes; edge naming; incremental rebuild sets; failure and blocked reporting with recovery; revolve (full, partial, axis crossing); native round trip regenerates identically; STEP AP242 structural check and re-import with equal volume, counts and bounds; dry run; mesh face ranges; bounded kernel memory; benchmark model regression |
| AI workflow | `packages/tool-cad-modeler/src/assistant.test.ts` | OCCT in-process | Demo planning → proposal with predicted volume → Apply through the shared executor; structured reads; stale proposals refused; proposal undo; invalid commands reported before a proposal; STEP and native export after approval; reopen; help manifest maps every toolbar item and operation |
| Platform tests | `apps/workspace` (capabilities, help, platform), `packages/design-system` | none | Capability inventory lists every toolbar item and assistant operation; help manifest valid; styling contract (tokens only, shared controls, components layer) |
| Browser flows | scratchpad `pw/cad/harness-flow.mjs`, `pw/cad/workspace-flow.mjs` (Playwright, Chrome) | OCCT in a Web Worker | Human workflow end to end in the harness and the workspace (sketch, constrain, preview, extrude, pick face, edit, parameter binding, undo/redo, save, export, reopen, diagnostics), WebGL rendering (pixel check), responsive widths without overflow, dark theme, no console errors; AI workflow through the real demo assistant and proposal cards |

## 2. Numerical tolerances

Volumes and areas: relative 1e-6 or better against closed-form values; coordinates: 1e-9 mm after
solver cleaning; STEP re-import: volume to 1e-6, identical counts and bounding box.

## 3. Benchmark model library

`packages/cad-kernel/src/benchmarks.ts`: perforated plates (1×1, 3×3, 5×5 holes; 4–52 features) built
only from public commands, with exact expected volumes. `npm run cad:bench` prints build, upstream
and downstream edit timings ([performance.md](performance.md)).

## 4. Test models from outside

Use only public or appropriately licensed models: NIST MBE PMI models (US government work, no
restrictions, acknowledgement requested) for STEP import (Phase 5). The ABC dataset (per-model
copyright) and Fusion 360 Gallery (non-commercial) need review; GrabCAD models are not redistributable.

## 5. Gaps (backlog)

Fuzzing of command inputs; cross-browser runs (Firefox, Safari);
visual regression images; STEP validation with an independent checker (NIST STEP File Analyzer);
signature tests with real sample files; performance tracking in CI.

Done in sprint C1: planegcs as a solver oracle (`packages/cad-core/src/sketch/planegcsOracle.test.ts`, dev-only, ADR-0076); a real-kernel regression for names of split faces and fillets that survive a pocket-count change (`packages/cad-kernel/src/history.test.ts`, ADR-0075); an OCCT version test (`version.test.ts`); click-to-draw, tap and keyboard drawing and the Repair reference panel in the browser flow `tests/e2e/flows/cad-modeler.mjs`.

# CAD Modeler: architecture specification

Status: Proposed (CAD agent, 14–15 October 2026). Decisions: ADR-0020 (packages), ADR-0021 (kernel),
ADR-0022 (native format), ADR-0023 (commands), ADR-0024 (topological naming), ADR-0025 (sketch
solver), ADR-0026 (cross-module references). What is implemented is marked; everything else is a
design target.

## 1. Layers (brief §4.2)

| Layer | Where | Responsibility | Status |
| --- | --- | --- | --- |
| Geometric kernel | `cad-kernel` (OCCT WASM in a Web Worker) | Exact B-rep solids, booleans, analysis, tessellation, STEP | Implemented for Phase 1 operations |
| Parametric feature engine | `cad-core` `regen/`, `sketch/`, `expr/` | Parameters, sketches and constraints, features, dependency graph, incremental regeneration, failure reporting, naming probes | Implemented (sketch, extrude, revolve) |
| Engineering semantic layer | `cad-core` model (`semantics`, `references`, material) | Named interfaces, functional surfaces, design intent, links to Requirements/SysML/Concepts | Data model and commands implemented; consumers in other modules planned |
| Interaction layer | `cad-core` commands + `tool-cad-modeler` | One typed command layer used by the UI, scripts and the assistant | Implemented |
| Persistence and interoperability | `cad-core` format + `cad-kernel` STEP and detection | Open native JSON format, STEP AP242 export, format detection | Implemented (file-based); server store planned |

No feature logic lives in the interface: every dialog builds command objects (`makeRun` →
`CadEngine.execute`).

## 2. Packages and dependencies (ADR-0020)

```
tool-cad-modeler ──► cad-core, cad-kernel, platform-sdk, design-system, three
cad-kernel ───────► cad-core (types), replicad (MIT), replicad-opencascadejs (LGPL WASM, loaded at run time)
cad-core ─────────► nothing (no React, no DOM, no kernel)
```

The boundary test `packages/cad-core/src/contracts.test.ts` enforces this until the platform
boundary test includes the CAD packages.

## 3. Runtime structure

```
UI thread                                            Kernel worker (cad-kernel/worker)
──────────                                           ─────────────────────────────────
CadModelerView ─┐                                    OcctKernel (replicad + OCCT WASM)
Assistant actions ─► CadSession ─► CadEngine          shapes: Map<handle, TopoDS_Shape>
                     (documents)    ├ DocumentHistory  ▲
                                    │  (commands, undo/redo, log)
                                    ├ regenerate() ────┼─ makeSolid / boolean / analyze / mesh / exportStep (RPC, async)
                                    │  sketch solving and profiles run here (small, pure TS)
                                    └ RegenerationCache (content keys → handles, analyses)
```

- **Off the UI thread:** every OCCT call runs in the worker (`createWorkerKernel`). Meshes return
  as transferred typed arrays. Sketch solving runs on the UI thread because Phase 1 sketches are small
  (a few hundred unknowns at most, sub-millisecond to milliseconds). `regenerate()` is
  environment-free, so the whole engine can move into the worker when sketches grow (backlog).
- **Node:** the same engine runs with the in-process kernel (`@ews/cad-kernel/node`) for tests,
  scripts and benchmarks, and later a server-side job runner.
- **Rendering:** three.js (WebGL2) on the UI thread renders worker-produced meshes on demand.
  WebGPU is a later option; three.js abstracts it.
- **Desktop/native:** the `GeometryKernel` interface allows a native OCCT build (Tauri or Electron
  sidecar, or Node addon) without changing features or commands.

## 4. Document, commands and history (ADR-0022, ADR-0023)

- `CadDocument` (format `ews-cad` 1.0.0): parts → parameters, features (sketch, extrude, revolve),
  semantics, material; document-level references; `version`; `nextId` for deterministic IDs.
- Commands (`COMMANDS`, 30 in Phase 1) validate input against JSON Schema, check preconditions and
  mutate a working copy. `applyTransaction` is pure: same document and commands, same result.
- `DocumentHistory` commits transactions, keeps undo/redo stacks of snapshots, writes the operation
  log (source user/assistant/script, versions, affected IDs, rejections), and enforces
  `expectedVersion` for transactions, undo and redo.
- `CadEngine` adds regeneration (queued, latest version wins), dry runs, queries, STEP export and
  meshes. `CadSession` (tool) manages open documents, the kernel and file transfer.

## 5. Regeneration (brief §4.1)

1. Parameters are evaluated in dependency order (cycle detection, per-parameter errors).
2. Each feature in history order gets a **content key**: a hash of its evaluated inputs and the keys
   of the nodes it depends on (sketch key, target body key).
3. Sketch: evaluate the plane and dimension values, solve (ADR-0025), extract profiles. Cached by key.
4. Extrude/revolve: build a request (plane, profile regions, sweep), reuse the cached shape for the
   key or call the kernel; join/cut against the target body state (also keyed).
5. Final bodies are analysed (volume, area, centre of mass, bounding box, topology counts, BRepCheck
   validity, stable face names and edge names) and cached by key and probe set.
6. Failures are recorded per feature (`failed`, `blocked` with the upstream ID, warnings) and never
   abort the rest. `rebuilt` and `reused` lists make incrementality observable.
7. Cached kernel shapes not used for two committed regenerations are released (bounded memory, test
   covered).

Dependency graph (`dependencyGraph`): `param → param`, `param → feature`, `sketch → feature`, body
chain `feature → feature`. `downstreamOf` answers "what regenerates if this changes".

## 6. Topological naming (ADR-0024)

Generative names from design intent: `ext-5/cap-start`, `ext-5/cap-end`,
`ext-5/side:<sketch entity>`, `rev-9/side:<entity>`, `rev-9/start|end`, plus `#n` per region.
Features emit probes (points that must lie on the generated face); after each body change all
probes of the body's history are evaluated against the current faces; first hit wins, later hits
become aliases; unmatched faces get flagged unstable names. Edges are named by their adjacent faces.
Stability under dimension changes is tested (`kernel.test.ts`). Phase 2 adds kernel history
(`Generated/Modified`) as a second signal and a "needs repair" state for downstream references.

## 7. Sketch solver (ADR-0025)

Unknowns: point coordinates and circle radii; 19 constraint types; damped minimum-norm Gauss–Newton
from the drawn seed geometry; Jacobian rank → DOF; dependent rows → redundant constraints;
non-convergence → conflict isolation; null space → free points. Driven dimensions are measurements.
Profiles: shared points and coincident constraints join curves into loops; nesting gives holes;
open, branching and self-crossing loops are reported.

## 8. Persistence

- Phase 1: the native file (`.ewscad`) is downloaded and opened by the user; the session keeps
  documents in memory; unsaved changes are protected by the platform's `useUnsavedChanges`.
- Planned: `services/cad` (PostgreSQL) with immutable document revisions, exposed to tools as
  `PlatformServices.cad` (contract change request CR-CAD-2), and crash recovery from the operation
  log.

## 9. AI integration (brief §9, contracts §5)

Reads are queries; mutations are SDK 1.5 service proposals carrying the commands and a dry-run
prediction; Apply runs the same executor with the captured `expectedVersion`; Undo compensates only
if nothing changed since. Details: [ai-commands.md](ai-commands.md).

## 10. Extension points (brief §10, future modules)

- **New features**: add a `Feature` variant, its commands, its regeneration step and its naming
  probes; the format minor version increases.
- **Analysis modules (FEA, CFD, thermal, manufacturing, optimisation):** read-only access to
  regenerated geometry through `CadEngine` (`mesh`, `exportStep`, `query`), named faces and
  semantic annotations (`interface`, `functional-surface`) as boundary-condition anchors; results
  stay in the analysis module and reference CAD entities by `cadm:` IDs with the document version.
- **Optimisation:** parameters are the design variables (`set_parameter` in dry runs), mass
  properties and failures are the responses; dry runs never commit.
- **Specialised packages** (sheet metal, weldments, routing): separate packages contributing
  features through the same registry, not changes to the core engine.

# CAD program: progress

Maintained by the CAD agent. Brief: [cad-program.md](cad-program.md) (do not edit).
Contracts and governance: [cad-program-contracts.md](cad-program-contracts.md).
Module documentation: [docs/modules/cad](../modules/cad/README.md).

Branch: `feature/cad`. Worktree: `C:\Users\kimge.000\Documents\Sandbox-cad`. Main merged in at
09aafa7 (Conceptualize).

## Phase status

| Phase | Status | Evidence |
| --- | --- | --- |
| 0 Research and architecture | **Done** (decisions Proposed) | Research: `docs/research/cad/` (competitive matrix, interoperability, open-source survey, source logs). ADRs 0020–0026 (numbers provisional). Specifications: `docs/modules/cad/` (architecture, requirements, kernel selection, native format and JSON Schema, API and `commands.json`, AI commands, interoperability matrix, testing, performance, roadmap, backlog, integration contracts, agent instructions) |
| 1 Parametric foundation | **Implemented, ready for coordinator review** | Packages `cad-core`, `cad-kernel`, `tool-cad-modeler`; 39 CAD tests (core 23 incl. contracts, kernel 10 on real OCCT, tool/AI 6), plus platform inventory and help tests; browser flows in harness and workspace all passing; `npm run check`, `build`, `build:harnesses` green |
| 1b Persistence and integration | Not started (needs CR-CAD-1…4) | |

### Phase 1 acceptance (brief §13, §15 steps 10–12)

| Capability | Human (UI) | AI (assistant) | Tests |
| --- | --- | --- | --- |
| Create a part | New / Welcome "New part" | `run_commands` (creates document), `new_document` | assistant.test, browser flows |
| Sketch constrained 2D profiles (real solver) | Edit tab: geometry, constraints, DOF badge, sketcher | `create_sketch`, `add_*`, `apply_constraint` | core.test solver; kernel.test |
| Extrude and revolve | Extrude / Revolve dialogs with preview | `extrude_profile`, `revolve_profile` | kernel.test |
| Edit dimensions; incremental regeneration; failures reported | Parameters, dimension fields, feature edit; Diagnostics | `set_parameter`, `set_dimension`, `edit_feature`; `get_failures` | kernel.test incremental and failures |
| Save and reopen the native model | Save (.ewscad) / Open | `export {format: ewscad}`, `open_document`, `query get_document` | kernel.test round trip; assistant.test; browser |
| 3D viewport, geometry off the UI thread | three.js viewport; OCCT in a Web Worker | `get_entities` (stable face names) | browser pixel check; Diagnostics shows worker |
| Export STEP | Export STEP (AP242 + structural report) | `export {format: step}` | kernel.test (inspection + re-import); browser |

## Capability status (implemented / partial / experimental / planned)

Detailed table with IDs: [requirements.md](../modules/cad/requirements.md).

- **Implemented and tested:**
  - native open format with JSON Schema;
  - parameters and expressions;
  - sketch entities: point, line, circle, arc, rectangle;
  - 19 constraint types, with DOF, redundancy, conflict and driven dimensions;
  - profile extraction with holes;
  - extrude (normal, reverse, symmetric; new, join, cut) and revolve (axis line or sketch axis, partial angle);
  - suppression and deletion with dependency checks;
  - incremental regeneration with per-feature failures;
  - stable face and edge names;
  - mass properties and BRepCheck validity;
  - undo and redo with versioning and an operation log;
  - dry-run preview;
  - STEP AP242 export;
  - format detection;
  - 3D viewport (orbit, pan, zoom, views, picking);
  - sketcher;
  - help (20 topics, 1 tutorial);
  - assistant operations (7) with labelled demo planning;
  - capability inventory entries (17).
- **Partial:**
  - multi-body parts: bodies and targets exist, but there is no body-boolean command;
  - engineering semantics and references: stored and editable, but no consumers in other modules;
  - multiple documents: kept in the session, but there is no switcher UI;
  - STEP colour: written at solid level, not separately verified;
  - format detection: signatures for some proprietary formats rely on the file extension (low confidence).
- **Experimental:** none labelled experimental.
- **Planned:** everything in Phases 2–6 ([roadmap.md](../modules/cad/roadmap.md)), including fillets and chamfers, sketching on faces, imports, assemblies and drawings.

## Decisions (ADRs proposed)

Numbers are provisional; the coordinator renumbers at integration (they clash with the Design
Reasoning proposals).

| ADR | Decision |
| --- | --- |
| 0020 | Packages `cad-core` / `cad-kernel` / `tool-cad-modeler`, monorepo, separate tool `cad-modeler`, `services/cad` deferred |
| 0021 | OCCT via replicad-opencascadejs 1.1.0 (LGPL WASM, separately loaded) + replicad 1.1.0 (MIT) in a Web Worker, behind `GeometryKernel` |
| 0022 | Open JSON native format `ews-cad` 1.0.0 with JSON Schema; geometry is derived |
| 0023 | One typed command layer, transactions, version checks, snapshot undo, dry runs; assistant via service proposals |
| 0024 | Generative topological naming with geometric probes; edges by adjacent faces |
| 0025 | In-house numerical sketch solver (TypeScript) with DOF and conflict analysis; planegcs as later option |
| 0026 | Cross-module references and the ArtifactRef scheme for CAD Modeler entities (needs approval) |

## Contract change requests

- **CR-CAD-1:** `ArtifactRef` for CAD Modeler entities as `{ module: 'cad', id: 'cadm:<documentUuid>/<entityId>', kind: 'cad-part' | 'cad-feature' | 'cad-parameter' | 'cad-face' | 'cad-document', revision: <document version> }`. The alternative is a new `ArtifactModule` value `'cad-modeler'`. See ADR-0026.
- **CR-CAD-2:** `PlatformServices.cad` (`CadDocumentService`, SDK minor), backed by `services/cad` at `/api/cad/v1` with immutable document revisions.
- **CR-CAD-3:** read-time twin projection of parts that `represent` components (ADR-0012 pattern); no dimension synchronisation.
- **CR-CAD-4:** replacing the mock CAD tool needs a separate ADR with a non-destructive migration, as a coordinator decision.

## Integration needs for the coordinator

**Approved and committed** on `feature/cad`, each change in its own `COORDINATOR REVIEW:` commit:

- tool registration and the workspace dependency;
- capability entries and the `cad-modeler` module;
- the platform, help and design-system test lists, with the entitlement exception for `cad-modeler` (`tool:cad`);
- the root `cad:` scripts;
- the `docs/dependencies.md` rows.

**Pending, coordinator-owned:**

- Boundary rules for `packages/cad-*` in `boundaries.test.ts` (an interim local test is in `cad-core`).
- The root AGENTS.md rule "do not claim a CAD kernel".
- `apps/workspace/src/platform/capabilities.ts` (About page) and `docs/roadmap.md`.
- ADR numbering and the index.
- Whether to add `cad-modeler` to `DEFAULT_OPEN_TOOLS`.
- LGPL notices in production distributions: the workspace build emits `replicad_single.wasm` (23 MB, 7.3 MB gzip), so the licence text must ship with it.
- The workspace Vite config uses the default worker format. The worker builds as a single chunk and works in dev and build today. If code-splitting inside the worker is ever needed, set `worker.format = 'es'`, as the CAD harness already does.

## Licensing review

All CAD dependencies fall within contracts §3. **Nothing needs approval.** The coordinator accepted this on 15 October 2026.

| Package | Licence | Notes |
| --- | --- | --- |
| replicad 1.1.0 | MIT | |
| replicad-opencascadejs 1.1.0 | LGPL-2.1-only | OCCT; separate WASM file loaded at run time and replaceable by the user |
| Transitive packages | ISC, MIT | |
| three 0.180.0 | MIT | |

- **Avoided:** SolveSpace and libslvs (GPL-3). planegcs (LGPL) was evaluated only and is not shipped.
- **Would need approval later** (not used):
  - Parasolid, ACIS, JT or HOOPS translators;
  - Open Design Alliance (DWG);
  - libdxfrw and LibreDWG (GPL);
  - the Onshape and Autodesk translation services (paid, and user data goes to a third party).
- **Pin:** replicad releases 0.5.0–0.15.1 were AGPL, so the dependency stays pinned exactly at 1.1.0.

## Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-CAD-01 | The OCCT version inside the WASM build is not stated; the survey infers 7.6.x (2023), while upstream is 8.0.1 | Owning a custom WASM build pipeline (backlog #7, about 3–6 weeks) |
| R-CAD-02 | OCCT boolean and fillet robustness on hard inputs | Per-feature failures, BRepCheck after regeneration, no `sameFace` optimisation, regression models |
| R-CAD-03 | Probe-based naming can be ambiguous with coincident geometry from different features | Aliases and flags already in place; kernel history signal and a "needs repair" state in Phase 2 |
| R-CAD-04 | Persistence is file-only; documents are lost if the window closes without saving | Unsaved-change guard and "Not saved to a file" badge; CR-CAD-2 |
| R-CAD-05 | Sketch solving runs on the UI thread (dense numerics), fine for small sketches | Move regeneration into the worker (backlog #6) |
| R-CAD-06 | 23 MB WASM download and the wasm32 4 GB memory limit | Cached once; native desktop kernel later |
| R-CAD-07 | Most competitive research rests on search summaries (12 sources read in full, 99 summaries) | Treat vendor specifics as provisional; verify before relying on them |
| R-CAD-08 | Format-detection signatures for several proprietary formats are low confidence | Tests with public sample files (backlog) |

## Backlog (prioritized)

The top items are below; the full list is in [backlog.md](../modules/cad/backlog.md).

1. Server document store and `PlatformServices.cad` (CR-CAD-2).
2. ArtifactRef scheme and concept links (CR-CAD-1).
3. Fillet and chamfer on stable edge names.
4. Sketching on datum planes and faces.
5. Drag-drawing in the sketcher, with constraint inference.
6. Regeneration in the worker.
7. Custom OCCT 8 WASM build with the XCAF reader and IGES.
8. STEP import as a base body.

## Handoff log

| Date | Entry |
| --- | --- |
| 2026-10-14 | Phase 0 started. Kernel probe in Node: OCCT WASM loads in about 300 ms; extrude, revolve, cut, volume, mesh and STEP AP242 export and re-import all verified numerically. Delegated three research tasks; their reports are in `docs/research/cad/`. |
| 2026-10-14 | Commit 5296d33: ADRs, research and `cad-core`. Commit def9c05: `cad-kernel`, with 9 real-kernel tests. Found and fixed the `sameFace` boolean-void issue. |
| 2026-10-15 | Tool package (ab01e3d), plus `COORDINATOR REVIEW:` commits 95ddf6d, a415069, 1a47a0e and 824e40e. Merged main (69d02bd). |
| 2026-10-15 | Browser flows in the harness and the workspace. Fixed face picking (mesh groups use OCCT hash codes), the React key spread, invalid nesting, and the saved-state badge (dad539b). |
| 2026-10-15 | Contracts: JSON Schema checked with Ajv, a fresh `commands.json`, and a boundary test. Benchmarks; `validateDocument` hardened (c3e0296). Module documentation and progress written. |

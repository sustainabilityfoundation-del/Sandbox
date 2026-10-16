# CAD Modeler: prioritized feature backlog

Status: maintained by the CAD agent; the progress file summarises the top items. Priorities: P1
next sprint candidates, P2 Phase 2, P3 later. "Needs" names a coordinator decision when one is
required.

| # | Item | Priority | Phase | Needs |
| --- | --- | --- | --- | --- |
| 1 | Server-side document store with revisions (`services/cad`, `/api/cad/v1`, OpenAPI) and `PlatformServices.cad` | P1 | 1b | CR-CAD-2 |
| 2 | Adopt the ArtifactRef scheme for CAD Modeler entities; show "realizes concept" links | P1 | 1b | CR-CAD-1 |
| 3 | Fillet and chamfer on stable edge names, with reference-lost errors (**done**; repair in sprint C1) | P1 | 2 | — |
| 4 | Sketch on datum planes and planar faces (by stable face name) | P1 | 2 | — |
| 5 | Drag-based sketch drawing with constraint inference (keyboard alternatives kept) (**click-to-draw done in C1**: line, rectangle, circle, polygon with snapping and automatic coincident constraints; no dragging; drag-to-move and arcs remain) | P1 | 2 | — |
| 6 | Move regeneration (including sketch solving) into the worker | P1 | 2 | — |
| 7 | Custom WASM build: XCAF STEP reader, IGES, glTF writer (OCCT version verified in C1: the current WASM is 8.0) | P1 | 2/5 | — (LGPL) |
| 8 | STEP import as a history-free base body with ShapeFix healing | P2 | 5 | — |
| 9 | Shell, draft, hole wizard, sweep, loft, mirror, linear/circular patterns | P2 | 2 | — |
| 10 | Configurations / design tables (parameter sets) | P2 | 2 | — |
| 11 | Feature reorder, rollback bar, insert in history | P2 | 2 | — |
| 12 | Section views and measurement tools (distance, angle, radius) as queries and UI | P2 | 2 | — |
| 13 | planegcs as test oracle (and candidate solver) (**oracle done in C1**, dev-only, ADR-0076; the `SketchSolver` interface exists; a run-time solver is not planned) | P2 | 2 | — (LGPL module) |
| 14 | Viewport images for the assistant (supplementary context) | P2 | 2 | platform attachment contract |
| 15 | Multi-document switcher UI and per-view document pinning (**switcher done in C1**; pinning remains) | P2 | 2 | — |
| 16 | Unit-checked expressions (dimensional analysis) | P2 | 2 | — |
| 17 | Mesh exports (STL, 3MF, glTF) | P2 | 5 | — |
| 18 | Replace the mock CAD tool: migration of `cad-representation` objects, links and dimension delegation | P2 | 1b | coordinator ADR (CR-CAD-4) |
| 19 | Read-time twin projection of parts that represent components | P2 | 1b | CR-CAD-3 |
| 20 | Assemblies, mates, DOF, interference, BOM | P3 | 3 | — |
| 21 | Drawings, GD&T/MBD | P3 | 4 | — |
| 22 | Sheet metal, weldments, routing packages | P3 | 4 | — |
| 23 | Licence allow-list check in CI (pinned replicad ≥ 0.15.2) | P2 | — | coordinator (CI) |
| 24 | Independent STEP validation (NIST STEP File Analyzer) in a manual QA step | P2 | 5 | — |

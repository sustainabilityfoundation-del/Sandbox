# CAD Modeler: requirements specification

Status: Proposed (CAD agent, 15 October 2026). Derived from the owner brief
([cad-program.md](../../specifications/cad-program.md)) and the competitive research
([CAP-* requirements](../../research/cad/competitive-feature-matrix.md)). Each requirement has a
phase and an honest status: **implemented** (code and tests on `feature/cad`), **partial**,
**experimental**, **planned**. "Evidence" names the test or document that demonstrates it.

## 1. Modelling foundation

| ID | Requirement | Phase | Status | Evidence |
| --- | --- | --- | --- | --- |
| CAD-R-001 | History-based, feature-driven parametric model of parts | 1 | implemented | `cad-core` model; kernel tests |
| CAD-R-002 | Parameters with expressions, units, functions; cycle and unknown-name detection | 1 | implemented (unit consistency not checked) | `core.test.ts` expressions |
| CAD-R-003 | Upstream changes regenerate dependents incrementally, with a queryable dependency graph | 1 | implemented | `kernel.test.ts` incremental; `dependencyGraph` |
| CAD-R-004 | Robust per-feature failure reporting (failed, blocked, warnings); no abort of the rest | 1 | implemented | `kernel.test.ts` failures |
| CAD-R-005 | Stable entity identifiers; deterministic IDs; stable face/edge names across regeneration | 1 | implemented (probe method, ADR-0024) | `kernel.test.ts` naming |
| CAD-R-006 | Engineering metadata, material, mass properties | 1 | implemented | Inspect panel; `get_mass_properties` |
| CAD-R-007 | Engineering semantics (named interfaces, functional surfaces, design intent) | 1 | partial (data + commands; no consumers yet) | `add_semantic` |
| CAD-R-008 | Configurations and design tables | 2 | planned (reserved in format) | native-format.md |
| CAD-R-009 | Reference geometry (planes, axes, points) and sketches on arbitrary planes/faces | 2 | planned (standard planes with offsets implemented) | |
| CAD-R-010 | Feature suppression | 1 | implemented | `set_suppressed`; blocked dependents |
| CAD-R-011 | Feature reordering and rollback | 2 | planned | |

## 2. Sketching (brief §6.1)

| ID | Requirement | Phase | Status |
| --- | --- | --- | --- |
| CAD-R-101 | Sketches on planes; lines, arcs, circles, points, rectangles | 1 | implemented (standard planes + offset) |
| CAD-R-102 | Ellipses, splines, polygons, slots | 2 | planned |
| CAD-R-103 | Construction geometry | 1 | implemented |
| CAD-R-104 | Geometric constraints (12 types) and dimensional constraints (7 types) | 1 | implemented |
| CAD-R-105 | Fully/under-constrained status with DOF and free entities | 1 | implemented |
| CAD-R-106 | Redundant and conflicting constraint detection with candidates | 1 | implemented |
| CAD-R-107 | Driven (reference) and driving dimensions | 1 | implemented |
| CAD-R-108 | Automatic constraint inference while drawing | 2 | planned |
| CAD-R-109 | Sketch patterns, mirror and transforms | 2 | planned |
| CAD-R-110 | Projection/conversion of model geometry into sketches | 2 | planned |
| CAD-R-111 | Closed-profile extraction with holes; open/branching/crossing diagnostics | 1 | implemented (crossing check for polygonal approximation) |

## 3. Part features (brief §6.2)

| ID | Requirement | Phase | Status |
| --- | --- | --- | --- |
| CAD-R-201 | Extrude (blind, reverse, symmetric; new, join, cut) | 1 | implemented |
| CAD-R-202 | Revolve (sketch axis or line; partial angles; axis-crossing check) | 1 | implemented |
| CAD-R-203 | Multi-body parts (new body, explicit target) | 1 | partial (bodies and targets; no body-level booleans command) |
| CAD-R-204 | Sweep, loft, hole, fillet, chamfer, shell, draft, rib, mirror, patterns | 2 | planned |
| CAD-R-205 | Boolean operations between bodies | 2 | planned (join/cut through features implemented) |

## 4. Advanced geometry, assemblies, documentation, specialised (brief §6.3–6.6)

All planned for Phases 3–6 per [roadmap.md](roadmap.md): surfaces and NURBS editing, direct
editing recorded as features, geometry repair; assemblies, mates, DOF analysis, interference,
exploded views, BOM, large assemblies; drawings, sections, dimensions, GD&T, MBD; sheet metal,
weldments, frames, routing, mechanisms, family of parts. No partial implementations exist.

## 5. Interoperability (brief §7)

| ID | Requirement | Phase | Status |
| --- | --- | --- | --- |
| CAD-R-401 | Open native format with full design intent; JSON Schema; versioning | 1 | implemented |
| CAD-R-402 | STEP AP242 export of exact solids with names, units, colour | 1 | implemented (structure and re-import tested) |
| CAD-R-403 | Automatic format detection with informative diagnostics | 1 | implemented (signature confidence varies; see matrix) |
| CAD-R-404 | STEP import as base body; names/colours/assembly on import | 5 | planned (geometry-only re-import works in the kernel for verification) |
| CAD-R-405 | IGES, STL, OBJ, 3MF, glTF, DXF, 3DM | 5 | planned |
| CAD-R-406 | Proprietary native formats | 5 | requires approval (licensed translators or vendor APIs) |
| CAD-R-407 | Fidelity levels reported separately (solid, surface, mesh, structure, metadata, PMI, history) | 1 | implemented in detection messages and the matrix |

## 6. Interface (brief §8)

| ID | Requirement | Phase | Status |
| --- | --- | --- | --- |
| CAD-R-501 | Interactive 3D viewport: orbit, pan, zoom, fit, standard views | 1 | implemented (pointer, buttons, keyboard) |
| CAD-R-502 | Selection and highlighting of faces | 1 | implemented (single selection; picking by pointer or list) |
| CAD-R-503 | Feature tree with status; property inspection; dimension editing | 1 | implemented |
| CAD-R-504 | Sketch editing (2D) with DOF display | 1 | implemented (form-based input; no drag-drawing yet) |
| CAD-R-505 | Feature dialogs with preview | 1 | implemented |
| CAD-R-506 | Undo/redo, keyboard shortcuts | 1 | implemented |
| CAD-R-507 | Multi-selection, selection filters, visibility, section views, measurement | 2 | partial (multi-selection in sketches; others planned) |
| CAD-R-508 | Model diagnostics | 1 | implemented |
| CAD-R-509 | Multiple documents | 1 | partial (session holds several; no switcher UI beyond the active document) |
| CAD-R-510 | Phone, tablet, desktop; light/dark; keyboard; design system | 1 | implemented (browser-checked) |
| CAD-R-511 | Desktop (native) operation | 6 | planned (kernel interface ready) |

## 7. AI-native operation (brief §9)

| ID | Requirement | Phase | Status |
| --- | --- | --- | --- |
| CAD-R-601 | Every human modelling operation has a typed command shared with the AI | 1 | implemented (30 commands) |
| CAD-R-602 | Command metadata: schema, preconditions, errors, transaction, undo, version, affected IDs | 1 | implemented (`commands.json`) |
| CAD-R-603 | Structured observability: tree, parameters, constraints, entities, properties, dependencies, failures, mass, log | 1 | implemented (11 queries) |
| CAD-R-604 | Preview before commit, transactions, rollback, version checks, determinism, logs, approval | 1 | implemented |
| CAD-R-605 | Viewport images as supplementary context | 2 | planned |
| CAD-R-606 | Concept → interfaces → parameters → features traceability | 2 | partial (references and semantics stored; Conceptualize integration pending) |
| CAD-R-607 | Evaluating geometry against requirements | 3 | planned |

## 8. Quality and performance (brief §11–12)

| ID | Requirement | Status |
| --- | --- | --- |
| CAD-R-701 | Tests for kernel operations, constraint solving, regeneration, dependencies, naming, I/O, undo/redo, AI commands, serialization | implemented (see [testing-strategy.md](testing-strategy.md)) |
| CAD-R-702 | Benchmark model library and performance regression tests | implemented (initial; [performance.md](performance.md)) |
| CAD-R-703 | Assemblies of thousands of components, partial loading, multithreading | planned (Phase 6) |
| CAD-R-704 | Crash recovery | planned |

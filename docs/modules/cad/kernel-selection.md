# Geometric kernel selection report

Status: Proposed with ADR-0021 (CAD agent, 15 October 2026). Survey with sources:
[open-source-survey.md](../../research/cad/open-source-survey.md) (subagent research, public sources;
read depth recorded in [sources-open-source.md](../../research/cad/sources-open-source.md)).
Local verification below was performed by the CAD agent on 14–15 October 2026.

## 1. Decision

Open Cascade Technology (OCCT), used through the WebAssembly build **replicad-opencascadejs 1.1.0**
(LGPL-2.1-only, published 2026-09-04) and the TypeScript wrapper **replicad 1.1.0** (MIT,
2026-09-04), behind our `GeometryKernel` interface (`@ews/cad-core`), running in a Web Worker in
browsers and in-process in Node.

## 2. Candidates against the brief's criteria (§5)

| Criterion | OCCT (WASM) | SolveSpace kernel | truck (Rust) | Fornjot | manifold | Own kernel |
| --- | --- | --- | --- | --- | --- | --- |
| Exact B-rep solids | Yes | Yes (NURBS) | Yes | Early | No (meshes) | Years of work |
| Booleans | Yes (robustness limits on hard cases) | Yes | Basic | No | Robust, mesh only | — |
| NURBS curves/surfaces, trimming | Yes | Yes (limited) | Yes | No | No | — |
| Fillets, chamfers | Yes (known failure cases) | No | Not documented | No | No | — |
| Offsets, shelling | Yes | No | No | No | Mesh offsets | — |
| Intersections | Yes | Yes | Partial | No | Mesh | — |
| Topological naming | Not provided (OCAF TNaming not in our build) | No | No | No | No | — |
| Tolerances | Per-entity tolerances; ShapeFix healing | Global | — | — | — | — |
| STEP | AP203/214/242 read/write (XDE) | Export only | Limited | No | No | — |
| Large models | Proven in desktop CAD (FreeCAD, Salome); WASM memory 4 GB | Small models | Unproven | — | Fast for meshes | — |
| Cross-platform | C++ native and WASM | C++ | Rust/WASM | Rust | C++/WASM | — |
| Licence | LGPL-2.1 + exception (pre-authorized as separate module) | GPL-3 (needs approval) | Apache-2.0 | 0BSD (project archived June 2026) | Apache-2.0 | — |

Conclusion: OCCT is the only legally usable open-source kernel covering exact solids, fillets,
offsets and STEP today. A kernel of our own is not justified (estimated person-years before parity
with OCCT on booleans and blends). manifold remains a candidate for robust mesh booleans and 3MF
(Phase 5); SolveSpace stays reference only (GPL).

## 3. Local verification (CAD agent, Node 24, Windows)

| Check | Result |
| --- | --- |
| Load time of the WASM kernel in Node | ≈ 220–310 ms; ≈ 220 ms in Chrome worker (Diagnostics) |
| Extrude 40 × 20 × 10 | volume 8000.000000, 6 faces, 12 edges, bbox exact |
| Plate with through hole (cut) | volume exact to 1e-9 relative, 7 faces, 15 edges, 10 vertices, 1 shell, BRepCheck valid |
| Revolve tube (5–15 mm, 30 mm) | volume π(15²−5²)·30 to 1e-5, 4 faces |
| STEP export | FILE_SCHEMA `AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF` by default; product name, mm unit |
| STEP re-import | same volume (1e-6), same face/edge counts, valid |
| Mesh | triangles with per-face groups; groups reference faces by OCCT hash code (mapped to indices in our adapter) |
| Booleans with coplanar caps | the `sameFace` optimisation produced a solid with an internal void (2 shells, 9 faces); plain booleans plus `simplify()` give the correct result. Regression test added. |
| Bindings present | STEPControl_Reader/Writer, STEPCAFControl_Writer, XCAF tools, Interface_Static, BRepCheck_Analyzer, BRepAlgoAPI, BRepFilletAPI, BRepOffsetAPI (thick solid, pipe shell, thru sections), ShapeFix (Shape, Solid, Face, Wire) |
| Shape history | `BRepBuilderAPI_MakeShape::Modified/Generated/IsDeleted` are bound (with `NCollection_List_TopoDS_Shape`); used for face naming (ADR-0075). `ShapeUpgrade_UnifySameDomain::History()` returns an opaque handle (unusable), so the Boolean builders merge faces through `SimplifyResult` instead |
| Bindings absent | STEPCAFControl_Reader (names/colours on import), IGESControl_*, RWGltf_*, RWObj_*, TNaming/OCAF; TopExp map helpers |

## 4. Limitations carried into the product

1. **OCCT version: 8.0 (verified in sprint C1; risk R-CAD-01 closed).** The package does not state it and the research survey inferred 7.6.x, which was wrong. The linked library stamps `Open CASCADE STEP processor 8.0` into every STEP file it writes (the WASM also carries the strings `Open CASCADE 8.0`); `packages/cad-kernel/src/version.test.ts` asserts it and the kernel info string, so a dependency update that changes it fails the test. The patch level (8.0.x) is not exposed by the build. A custom build is still needed only for the missing readers and writers (backlog 7).
2. Booleans and fillets fail on some degenerate inputs; every failure is reported per feature and
   validity is checked with BRepCheck after regeneration.
3. No persistent naming in the kernel; ours is generative with probes (ADR-0024) plus OCCT shape history for the pieces of split faces (ADR-0075).
4. Missing readers (XCAF STEP, IGES, glTF, OBJ) need a custom build (still LGPL, no approval).
5. 23 MB WASM (7.3 MB gzip) downloaded once; wasm32 limit of 4 GB; single-threaded build in Phase 1
   (multi-threaded build needs COOP/COEP headers).
6. Browser floor ≈ Safari 16.4 (WASM exceptions and SIMD), per the survey.

## 5. LGPL compliance (contracts §3)

- The OCCT binary (`replicad_single.wasm`) is a separate file fetched at run time by the worker
  (`locateFile`) and in Node read from the package path or a caller-supplied `wasmPath`, so users
  can replace it with their own build of the same interface.
- Our code is not compiled into it; replicad (MIT) is a JavaScript wrapper calling its exports.
- Obligations recorded in `docs/dependencies.md`: licence text, source location
  (github.com/sgenoud/replicad, packages/replicad-opencascadejs; OCCT source dev.opencascade.org),
  statement of use, no prohibition of reverse engineering for debugging.
- replicad versions 0.5.0–0.15.1 were AGPL; we pin 1.1.0 (MIT) exactly. Keep the pin and add a
  licence allow-list check in CI (backlog).

## 6. Alternatives kept open

- `@salusoft89/planegcs` (LGPL WASM): in use as a development-time sketch-solver test oracle since sprint C1 (ADR-0076); a run-time solver would need a new ADR and approval.
- Native OCCT 8 (C++) for desktop and server jobs behind the same interface.
- manifold-3d (Apache-2.0) for mesh-level operations.

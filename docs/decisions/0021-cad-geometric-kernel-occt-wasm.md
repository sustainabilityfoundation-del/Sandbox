# ADR-0021: Open CASCADE Technology in WebAssembly as the geometric kernel

Status: Proposed (2026-10-14, CAD agent). Number provisional.

## Context

Brief §5 asks for an exact B-rep kernel (booleans, NURBS, trimming, fillets, offsets, intersections,
tolerances, STEP) and prefers proven open-source technology over a new kernel. Brief §8 asks not to
force heavy geometry into JavaScript. Contracts §3 pre-authorize LGPL only as a separately
replaceable module. Kernel evaluation: [kernel-selection.md](../modules/cad/kernel-selection.md);
survey: [open-source-survey.md](../research/cad/open-source-survey.md).

## Decision

- Kernel: **Open CASCADE Technology** (C++, LGPL-2.1 with the OCCT exception), consumed as the
  WebAssembly build **`replicad-opencascadejs` 1.1.0** (LGPL-2.1-only, released 2026-09-04) through
  the TypeScript wrapper **`replicad` 1.1.0** (MIT, 2026-09-04).
- The WASM binary is a separate file fetched at run time (`replicad_single.wasm`); users can replace
  it with their own build of the same interface. Our code is not linked into it. The LGPL notice,
  source location and replacement instructions are recorded in `docs/dependencies.md`.
- In the browser the kernel runs in a dedicated **Web Worker**; the UI thread never runs OCCT.
  Shapes stay in worker memory behind opaque handles; meshes are transferred as typed arrays.
- All kernel use goes through the `GeometryKernel` interface defined in `@ews/cad-core`. Only
  `@ews/cad-kernel` imports replicad or OCCT symbols.
- Single-threaded build in Phase 1 (no COOP/COEP requirement). The multi-threaded build
  (SharedArrayBuffer) is an option once the platform serves cross-origin-isolation headers.

Alternatives considered: building a kernel (years of work, no justification); SolveSpace's kernel
(GPL-3, needs approval, limited NURBS booleans); truck / Fornjot (Rust, promising but immature for
production booleans/fillets and STEP); manifold (mesh only, no exact B-rep; candidate for robust
mesh booleans in visualization and 3MF); commercial kernels (Parasolid, ACIS, C3D: proprietary, need
approval and paid licences).

## Consequences

- Exact solids, booleans, STEP AP242 export and re-import were verified numerically in Node on day 1
  (volume, bounding box, face counts, centre of mass).
- Known OCCT limitations carried into the product: fillet and boolean robustness on hard cases,
  tolerance growth, no built-in persistent naming (ADR-0024), ~23 MB WASM download, wasm32 memory
  limit (4 GB) for very large models. Mitigations: worker isolation, validity checks after every
  feature (BRepCheck), failure reporting per feature, a future native desktop build of the same
  adapter.
- Replacing the kernel means re-implementing `GeometryKernel` and re-running the kernel test suite.

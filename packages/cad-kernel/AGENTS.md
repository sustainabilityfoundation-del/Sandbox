# AGENTS.md: @ews/cad-kernel

Geometric kernel adapter of the CAD Modeler (ADR-0021). Owner: CAD agent.

## Responsibilities

- `OcctKernel`: `GeometryKernel` on Open CASCADE via replicad 1.1.0 (MIT) and
  replicad-opencascadejs 1.1.0 (LGPL-2.1-only WASM). Solids from profiles, booleans, analysis
  (mass properties, topology, BRepCheck validity, probe-based face names, adjacency edge names),
  tessellation with face/edge ranges, STEP AP242 export and geometry import.
- `worker/`: the kernel worker and its RPC client (browsers never run OCCT on the UI thread).
- `node.ts`: in-process kernel for tests, scripts and benchmarks (`wasmPath` lets users supply
  their own build of the LGPL library).
- `step.ts` (structural STEP inspection), `detect.ts` (format detection and diagnostics),
  `benchmarks.ts` (benchmark model library).

## Rules

- Only this package imports replicad / OCCT symbols. Keep the WASM a separate, runtime-loaded file.
- Pin exact versions; record them in `docs/dependencies.md`; do not use replicad < 0.15.2 (AGPL).
- Kernel failures throw `KernelError` with a code; never return silently wrong geometry.
- Mesh ranges and analysis use the same face/edge indices (OCCT hash codes are mapped).
- Do not use the `sameFace` boolean optimisation (produced voids with coplanar caps; tested).

## Commands

```bash
npx vitest run packages/cad-kernel   # real-kernel integration tests
npm run cad:bench
```

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
CAD assignment (strategy §10): evaluate Open CASCADE, FreeCAD, geometric constraint solvers, meshing libraries and interoperability components; avoid custom geometric kernels or solvers where established alternatives meet requirements.

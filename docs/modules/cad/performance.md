# CAD Modeler: performance targets and benchmarks

Status: targets proposed; Phase 1 measurements recorded (Node 24, in-process OCCT WASM, Windows
laptop, 15 October 2026). Machine-dependent; the regression test uses generous limits.

## 1. Targets

| Scenario | Phase 1 target | Long-term target (Phase 6) |
| --- | --- | --- |
| Kernel load (first use, cached download) | < 1 s after download | < 0.5 s |
| Dimension edit on a 50-feature part, downstream feature | < 300 ms to regenerated geometry | < 100 ms |
| Upstream parameter edit, 50-feature part | < 1.5 s | < 300 ms (parallel bodies) |
| UI thread | never blocked by kernel work | same; also sketch solving in the worker |
| Viewport | 60 fps orbit on a 50k-triangle part | 1M+ triangles with LOD, GPU instancing |
| Assemblies | — | thousands of components with lightweight loading |
| Memory | bounded cache (2 generations) | LRU by size, out-of-core |

## 2. Measurements (`npm run cad:bench`)

| Model | Features | Full build ms | Upstream change ms | Downstream edit ms | Volume error |
| --- | --- | --- | --- | --- | --- |
| perforated-plate-1x1 | 4 | 193 | 32 (2 rebuilt) | 27 (2 rebuilt) | 1.5e-14 % |
| perforated-plate-3x3 | 20 | 247 | 163 (10 rebuilt) | 51 (2 rebuilt) | 1.5e-14 % |
| perforated-plate-5x5 | 52 | 561 | 504 (26 rebuilt) | 127 (2 rebuilt) | 2.8e-14 % |

Browser: kernel ready in about 220 ms in a Chrome worker (Diagnostics); regeneration of the
example part reported 1–60 ms.

## 3. Observations and next steps

- Downstream edits rebuild exactly the changed sketch and its feature (incremental cache works).
- Upstream changes in a body chain are sequential booleans: each cut operates on the previous
  result. Phase 2: combine independent cut tools into one boolean (`BRepAlgoAPI` with multiple
  tools), parallel bodies in a worker pool, and caching of tool solids independent of the target.
- Analysis (face probing) is O(faces × probes); spatial indexing is needed beyond a few hundred faces.
- Snapshot undo copies the document per transaction; fine for Phase 1 sizes, to be replaced by
  structural sharing for large models.

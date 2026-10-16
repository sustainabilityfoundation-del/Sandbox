# ADR-0075: CAD naming: OCCT shape history as the second signal, build or integrate

Status: Proposed (16 October 2026, CAD module agent, sprint C1; amends ADR-0024)
Module: CAD Modeler (`packages/cad-core`, `packages/cad-kernel`)

## Capability and requirements

References to faces and edges (fillet and chamfer edges, sketches on faces) must survive upstream changes that are not meant to
break them. ADR-0024 names faces with geometric probes: sample points that each feature emits and that are re-evaluated against
the current body. The probes cannot name every piece of a face that a later operation splits. Evidence (`packages/cad-kernel/src/history.test.ts`,
before the change): a row of slots through a block splits the top face into strips; one strip kept the name `ext-19/cap-end`, the
others became `face#4`, `face#8` … whose numbers shift when the slot count changes, and `cap-end` jumped to another strip. A fillet
on a strip edge broke with `reference-lost` after a pocket-count change. Required: deterministic names for the pieces of a split
face, no change to existing names where the probe method already works, no new runtime dependency, work in the browser worker.
Serves the CAD brief, sprint C1 item 2 (`docs/specifications/cad-sprints-c1-c3.md`).

## Candidates considered

| Candidate | Upstream (URL) | Version checked | Licence (verified, with source) | Maturity and activity | Fit |
| --- | --- | --- | --- | --- | --- |
| OCCT shape history through `BRepBuilderAPI_MakeShape::Modified/Generated/IsDeleted` (the builder classes of `BRepAlgoAPI_*` and `BRepFilletAPI_*`) in the replicad-opencascadejs bindings | github.com/Open-Cascade-SAS/OCCT, github.com/sgenoud/replicad | OCCT 8.0 (STEP writer stamp in the WASM), replicad-opencascadejs 1.1.0 | LGPL-2.1 with the OCCT exception (already adopted, ADR-0021) | The standard OCCT mechanism; `BRepAlgoAPI_BuilderAlgo::SimplifyResult` includes the face merging in the history | Exposed in the bindings (`Modified`, `IsDeleted`, `NCollection_List_TopoDS_Shape`, builders constructible); replicad's own `cut`/`fuse`/`fillet` hide the builder, so the kernel adapter drives the builders directly |
| OCAF `TNaming` (`TNaming_Builder`, `TNaming_NamedShape`) | OCCT | not in the replicad build | LGPL-2.1 with exception | Mature, document-oriented (needs OCAF `TDF` labels) | Not bound in replicad-opencascadejs; would need the custom OCCT build (backlog #7) and a different data model |
| FreeCAD "Topological Naming Problem" work (realthunder's TNP branch, FreeCAD 1.0 `ElementMap`) | github.com/FreeCAD/FreeCAD | 1.0 | LGPL-2.1+ | Active; C++ in the application core, not a library | Concepts only (hashes of history, `;:` mapped names); the code is not reusable from TypeScript |
| CadQuery / build123d tag and selector approach | github.com/CadQuery/cadquery, github.com/gumyr/build123d | current | Apache-2.0 | Active | Selectors by geometry, no persistent naming; same limits as probes |
| Internal development (geometric containment of old face points in new faces) | none | n/a | n/a | n/a | Cannot name pieces of a split face that contain no sample point; this is the existing probe method |

## Licence assessment

No new dependency and no new licence terms. The WASM binary stays the separately loaded LGPL-2.1 file of ADR-0021; the history
calls go through the same bindings. Owner approval: none beyond ADR-0021, which stays open for the owner.

## Integration design

- `OcctKernel.boolean` and `OcctKernel.blendEdges` run the OCCT builders (`BRepAlgoAPI_Fuse/Cut` with `SimplifyResult`,
  `BRepFilletAPI_MakeFillet/MakeChamfer`) and read `Modified` and `IsDeleted` for every named face of the arguments.
- The kernel keeps, per shape handle, face names derived from history (`lineage`). A named face passes its name to the faces it
  became. When a face is split, the piece with the smallest centre (x, then y, then z, rounded to 1e-6 mm) keeps the name and the other pieces
  become `<name>~2`, `~3`, … continuing the numbers already used for that name, so earlier pieces keep their names when later
  operations add pieces. History names win over probe names; a probe may not take a name that history gave to another face; faces
  without a history name use the probes as before (fallback unchanged).
- `GeometryKernel.boolean` takes an optional `BooleanHint { targetProbes, toolProbes }` so the kernel can name the faces of both arguments
  before the operation. Kernels that ignore it keep the probe behaviour.
- History is used only when the clone the builder ran on lists faces and edges in the same order as the stored shape (checked by centres); otherwise
  the probe method alone applies.
- Errors: `KernelError` carries optional structured `details`; a lost edge or face reports `lost` names and the `available` names
  (see ADR-0024 and the `repair_reference` command).
- Tests at the boundary: `history.test.ts` (real OCCT) covers the split names, a fillet that survives pocket counts 2 to 6, and
  determinism of a fresh regeneration. All earlier naming tests (`kernel.test.ts`, `features2.test.ts`, `d1.test.ts`) pass unchanged.
- Provenance: the names are derived data; documents store the names only where a user or the AI chose them (edge lists, face references).

## Decision

Integrate: use the OCCT builder history through the existing bindings, with the probe method kept as the fallback (as ADR-0024
foresaw). OCAF TNaming was rejected because it is not in the build and needs another data model; no custom algorithm is needed.

## Contribution opportunities

None offered now. A note to the replicad maintainers that the builder history is not reachable from `Shape.cut`/`fuse`/`fillet`
could be offered later; nothing is submitted without the owner's authorisation.

## Consequences

- Dependencies: none added. `OcctKernel` no longer calls replicad's `cut`, `fuse`, `fillet`, `chamfer` or `simplify` for these
  operations; it uses the same OCCT builders (same options as replicad 1.1.0: `SimplifyResult(true, true, 0.001)`, `ChFi3d_Rational`). The
  second `ShapeUpgrade_UnifySameDomain` pass of the old code was redundant with `SimplifyResult` and is dropped (all volume and face-count tests agree).
- Names of split faces change from `face#n` to `<name>~k`; stored fillet edge lists that used such fallback names are not
  portable across this change (they were flagged unstable by ADR-0024). Names that were stable are unchanged.
- Limits: the convention for which piece keeps the name depends on the model axes; vertex naming is still not implemented; a face
  that is split in a way history cannot follow (for example a boolean the kernel runs without the hint) falls back to probes.
- Follow-ups: use the same history for patterns of fillets and holes (sprint C2), and for mirror and shell.

# CAD Modeler: sprints C1-C3 ("working better, more functionality")

Status: **coordinator brief, 16 October 2026**, from the owner's request "focus on getting the cad working better woth more
functionality". Planned by the architect agent (read-only, main 0e5f2ae) from [docs/research/cad](../research/cad/), the CAD
backlog in [cad-program-progress.md](cad-program-progress.md) and the CAD ADRs. Rules that apply to every item:
[open-source first](../architecture/OPEN_SOURCE_STRATEGY.md) (expose OCCT/replicad before writing own geometry; ADR note with at
least three candidates for each new capability) and [capability-complete toolbars](../architecture/CAPABILITY_TOOLBARS.md) (every
new command registered). D1 and the e2e flows `cad-modeler`, `cad-modeler-persistence`, `cad-d1` and `demo-d1` stay green.

## Today (evidence)

- 39 commands (`packages/cad-core/src/commands/registry.ts`); sketch point, line, circle, arc, rectangle, regular polygon;
  19 constraints with DOF, redundancy and conflict reporting; extrude (normal, reverse, symmetric; new, join, cut), revolve,
  fillet and equal chamfer on stable edge names, datum planes, sketches on planes and planar faces, linear pattern of
  extrudes and revolves; suppress, delete, parameters, bindings, references.
- Kernel port (`cad-core/src/kernel.ts`): makeSolid (extrude, revolve), fuse, cut, blendEdges, analyze (validity, mass
  properties), mesh, exportStep, importStep (no command or UI), distance.
- Missing: assemblies; shell, draft, loft, sweep, mirror, circular pattern, holes; booleans between existing bodies; measure UI,
  section view, imports, mesh export, feature reorder and rollback.
- Rough edges: sketch geometry is typed as coordinates (`ui/EditPanel.tsx`), not drawn; fillet and chamfer edge references break
  after upstream changes (`reference-lost`, ADR-0024 probes only); redo has no AI coverage; no document switcher; OCCT version in
  the WASM unverified (probably 7.6); 23 MB kernel download.

## Open-source leverage (no new runtime dependency)

replicad (MIT) already offers shell, draft, loft, sweep, mirror, intersect, offset, helix, volume and area measures, distance,
STEP and STL import, STL export. The OCCT bindings (LGPL-2.1 with exception, ADR-0021 held for the owner) include draft angle,
thick solid, through sections, pipe shell, section, common, hidden-line removal, shape distance, STL writer and the ShapeFix and
UnifySameDomain healing tools. Not in today's build: IGES and the XCAF STEP reader (names, colours, assembly structure), both
needing the custom OCCT build (backlog #7). planegcs (LGPL-2.0+) only as a development-time oracle; three.js (MIT) clipping planes
for section views and exporters for mesh output. Design references (concepts only): CadQuery and build123d (Apache-2.0), FreeCAD
PartDesign (LGPL).

## Sprint C1: sketching and reliability (starts after OSS-9 merges; both touch `regen/engine.ts`)

1. Click-to-draw sketching (line, rectangle, circle, polygon) with snapping and automatic coincident constraints; clicks map to the
   existing commands, forms stay as the keyboard path. Accept: e2e `cad-modeler` draws a closed profile by clicks; DOF shown.
2. OCCT shape history as the second naming signal (ADR-0024). Accept: a fillet survives a pocket-count change (regression test).
3. "Repair reference" on `reference-lost`: the user picks the replacement; never a silent re-bind. Accept: tested.
4. Actionable failure messages naming the upstream cause. Accept: shown in Diagnostics; tested.
5. AI coverage for redo; document switcher. Accept: capability coverage no longer `none`.
6. `SketchSolver` interface with planegcs oracle tests (OSS-11). Accept: tests only; planegcs a devDependency.
7. Verify and record the OCCT version; refresh the CAD progress status block.

## Sprint C2: part features (D1-relevant first)

0. If CT-2b has merged: the CAD capability inventory and toolbar layout (data only), so the toolbar shows the full planned scope
   (C2 and C3 entries as planned) while they are built.
1. `hole` (simple, counterbore, countersink; on a face at points; cosmetic thread attribute). Accept: exact volume; STEP read-back.
2. `mirror_features`. 3. `pattern_circular`. 4. Patterns of fillets, chamfers and holes. 5. `shell` (remove faces, thickness).
6. `draft` (faces, angle, neutral plane). 7. `combine_bodies` (join, cut, intersect existing bodies).
Accept for each: real-OCCT test, stable names, dry-run preview for AI use, help page, capability entry.

## Sprint C3: measurement, exchange and sweeps

1. `measure` query (distance, angle, radius), also for the AI. 2. Section view (clipping plane; view state only).
3. `import_step` as a base body, healed, labelled history-free. 4. STL export. 5. `loft` and `sweep`.
6. Feature reorder and rollback bar.

## Common rules for every new command

Typed command with JSON Schema in the registry; regenerate `commands.json`; help page; entry in
`packages/tool-cad-modeler/src/capabilities.ts` (today's fields until CT-2b, then placement, verifiedBy, limitations, backlog);
AI access through `cad-modeler.run_commands` with dry-run preview; proposal-preview policy unchanged; no change to existing
operation names. Keep out of `cad-core/src/expr` (OSS-10 units work).

## Owner decisions

1. Assemblies out of scope for C1-C3 (recommended).
2. Import formats: STEP now, IGES after the custom OCCT build?
3. D1's "clip": what it is and whether it is required (possible today as a sketch on a face, extruded with join, plus fillets).
4. Mock CAD tool retirement timing (ADR-0027, OSS-17).

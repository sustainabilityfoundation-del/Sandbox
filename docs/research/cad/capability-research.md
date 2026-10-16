# CAD: capability research, target command inventory and toolbar layout (CT-3 step 1)

Status: research note, 16 October 2026 (researcher, branch `research/cad-capabilities`, based on main d2bf14f). Documentation only: no
code was changed. The tool's display name is **CAD** (owner decision); module and capability IDs stay `cad-modeler`.

Inputs: [capability toolbar directive](../../architecture/CAPABILITY_TOOLBARS.md), [registry specification](../../specifications/capability-registry.md)
(§1 fields, §4 toolbar, §8 recipe step 1), [open-source strategy §3](../../architecture/OPEN_SOURCE_STRATEGY.md),
[sprints C1-C3](../../specifications/cad-sprints-c1-c3.md), [competitive matrix](competitive-feature-matrix.md) and
[open-source survey](open-source-survey.md) (reused, not repeated), the 25 entries in
`packages/tool-cad-modeler/src/capabilities.ts` and the 39 commands in `packages/cad-core/src/commands/registry.ts`.
Owner decision received during this work: toolbars follow the structure and completeness of a professional tool (the No Magic
interface as reference). Section 3 therefore proposes a full main menu, a main toolbar, contextual command sets, the browser
and a properties panel, and lists what the current `CommandBar` contract cannot express (§3.8, input to CT-2b).

Evidence abbreviations in tables: **CAP** = `packages/tool-cad-modeler/src/capabilities.ts`, **REG** =
`packages/cad-core/src/commands/registry.ts`, **TYP** = `packages/cad-core/src/model/types.ts`, **KER** =
`packages/cad-core/src/kernel.ts`, **VP** = `packages/tool-cad-modeler/src/ui/Viewport.tsx`, **MP** = `ui/ModelPanel.tsx`,
**IP** = `ui/InspectPanel.tsx` (the last three under `packages/tool-cad-modeler/src/`). "C1-3" means sprint C1 item 3 in the sprint brief.

---

## 1. Sources

All accessed **2026-10-16** unless stated. Public documentation only. Functions are described in our own words. "Fetched" means
the page was read through the fetch tool (a model digest, not verbatim); "search digest" means only a search-result summary was
available. Where a vendor page returned only navigation or a bot-protection page, the finding rests on the search digest plus
general domain knowledge, marked `(bg)`. Confidence for the per-tool columns in §2 is therefore **medium**: category-level
structure is sourced, the exact per-command offering in each vendor tool is partly `(bg)`.

| # | Tool | URL | Access | Depth | Used for |
| --- | --- | --- | --- | --- | --- |
| S1 | No Magic / MagicDraw 2021x R2, "Understanding the user interface" | https://docs.nomagic.com/spaces/MD2021xR2/pages/82747994/Understanding+the+user+interface | 2026-10-16 | Fetched (names parts only) | UI anatomy: main menu, main toolbars, model browser, diagram toolbars, diagram palette (owner reference) |
| S2 | SolidWorks 2023 help, "Features Toolbar" | https://help.solidworks.com/2023/English/SolidWorks/Sldworks/c_Features_Top.htm | 2026-10-16 | Search digest (page body returned navigation only on fetch) | Feature categories: boss/cut extrude and revolve, sweep, loft, fillet, shell, rib, draft, wrap, dome, mirror, patterns |
| S3 | SolidWorks 2013 help, same topic | https://help.solidworks.com/2013/English/SolidWorks/Sldworks/c_Features_Top.htm | 2026-10-16 | Search digest | Same; loft base/boss/cut/surface |
| S4 | Hawk Ridge Systems, "Features Basics in SOLIDWORKS" | https://hawkridgesys.com/blog/features-basics-in-solidworks | 2026-10-16 | Search digest | Sketched versus applied features |
| S5 | Autodesk Fusion help, "Solid overview" | https://help.autodesk.com/cloudhelp/ENU/Fusion-Model/files/GUID-99E108D3-07E9-4FFA-AEF9-A97D3278ED91.htm | 2026-10-16 | Fetched (general text only) | Solid tab = parametric and direct solid tools |
| S6 | Autodesk Fusion help, "Insert tools" and "Insert designs" | https://help.autodesk.com/cloudhelp/ENU/Fusion-Model/files/SLD-INSERT-TOOLS.htm ; https://help.autodesk.com/cloudhelp/ENU/Fusion-Designs/files/ASM-INSERT-FUSION-DESIGN.htm | 2026-10-16 | Search digest | Ribbon panels Create, Modify, Assemble, Construct, Inspect, Insert, Select |
| S7 | Onshape help, "Feature Basics" | https://cad.onshape.com/help/Content/PartStudio/feature_basics.htm | 2026-10-16 | Fetched | Feature toolbar swaps to Sketch toolbar while sketching; `S` shortcut toolbar; feature list with rollback and Final button; extrude as combination tool; variables |
| S8 | Onshape help, "Linear Pattern", "Mirror" | https://cad.onshape.com/help/Content/PartStudio/linear_pattern.htm ; https://cad.onshape.com/help/Content/PartStudio/mirror.htm | 2026-10-16 | Search digest | Pattern types (linear, circular, mirror, curve); Boolean options (new, add, remove, intersect) |
| S9 | Siemens Solid Edge ST6 help, "Feature modeling" (mirror) | https://soliddna.com/SEHelp/ST6/EN/feature_modeling/featmod1a.htm | 2026-10-16 | Fetched | Sketch-based, manufactured (hole) and treatment (round, draft, thin wall) features; lofted, helical, rib, chamfer variants; circular, rectangular, fill, fast and smart patterns; mirror copy. Siemens NX itself: no public page retrieved, so Solid Edge stands in for the Siemens family; NX entries are `(bg)` |
| S10 | FreeCAD wiki, PartDesign pages (MultiTransform, LinearPattern, PolarPattern, Legacy) | https://wiki.freecad.org/PartDesign_MultiTransform/en ; https://wiki.freecad.org/PartDesign_LinearPattern | 2026-10-16 | Search digest (direct fetch hit a bot-protection page) | Additive/subtractive features, dress-up (fillet, chamfer, draft, thickness), transformation features, multi-transform chaining |
| S11 | FreeCAD wiki, Sketcher reference and requirement pages | https://wiki.freecad.org/Sketcher_reference ; https://wiki.freecad.org/Sketcher_requirement_for_a_sketch | 2026-10-16 | Search digest | Constraint set (coincident, point-on-object, horizontal/vertical, parallel, perpendicular, tangent/collinear, equal, symmetric, block); tools fillet, chamfer, trim, split, extend, external geometry, carbon copy, array/polar/scale transform, offset, symmetry, B-spline tools |
| S12 | FreeCAD wiki, TechDraw pages (Balloon, PageDefault, Basic tutorial) | https://wiki.freecad.org/TechDraw_Balloon ; https://wiki.freecad.org/TechDraw_New_Default ; https://wiki.freecad.org/Basic_TechDraw_Tutorial | 2026-10-16 | Search digest | Page from template; views, projection group, section, complex section, detail; dimension types; balloons; hatching; annotations |
| S13 | FreeCAD wiki, Part and Sketcher workbench indexes | https://wiki.freecad.org/Sketcher_Workbench ; https://wiki.freecad.org/PartDesign_Workbench | 2026-10-16 | Not accessed (bot-protection page) | Listed so the gap is visible; FreeCAD Part workbench entries are `(bg)` |
| S14 | build123d documentation, cheat sheet | https://build123d.readthedocs.io/en/latest/cheat_sheet.html | 2026-10-16 | Fetched | Object, operation and selector inventory (1D/2D/3D objects, hole variants, draft, loft, sweep, thicken, section, mirror, offset, project, split, brake-formed sheet metal) |
| S15 | CadQuery documentation, API reference | https://cadquery.readthedocs.io/en/latest/apireference.html | 2026-10-16 | Fetched | Workplane 2D and 3D methods (cboreHole, cskHole, shell, twistExtrude, union/intersect, offset2D), selectors, STEP/DXF/SVG import and export |
| S16 | Existing repository research (not re-fetched) | [competitive-feature-matrix.md](competitive-feature-matrix.md), [sources-competitive.md](sources-competitive.md), [open-source-survey.md](open-source-survey.md), [interoperability.md](interoperability.md) | accessed 2026-10-14 by earlier passes | n/a | Capability definitions, kernel and licence facts, IGES/XCAF position. Versions and licences quoted in §4 come from the survey and were not re-verified here |

Not accessed: SolidWorks web-help bodies (JS-rendered), Autodesk Fusion ribbon reference page (404), Onshape toolbar reference
(landing page only), Siemens NX documentation (login-gated), FreeCAD wiki direct pages (bot protection). No login or paywalled material was used.

---

## 2. Target command inventory for CAD

### 2.0 Conventions

- **ID**: the existing ID where one exists, otherwise `cad-modeler.<group>.<command>` (group slug of the tab or group).
- **Icon**: a semantic name. Names already in `packages/design-system/src/icons/names.ts` are plain; names that must be added
  (shared contract, additive) are marked with `*`. Existing names are limited (about 140), so many commands need new names;
  the count is in §3.9.
- **Prereq**: DOC = open document; SK = active sketch; PROF = closed profile in a sketch; FACE / EDGE / BODY / FEAT = selected
  face, edge, body or feature; 2B = two bodies; PROJ = project connection.
- **Tools** (which reference tools offer it): SW SolidWorks, FU Autodesk Fusion, ON Onshape, SE Solid Edge, NX Siemens NX (`bg`),
  FC FreeCAD, B build123d, CQ CadQuery. A dash means none of them offers it as a command.
- **Status** (computed from evidence, per the registry rule: bound and verified = implemented; bound with a limitation = partial;
  unbound = planned). Status is read from the CAP entries and COMMANDS; `verifiedBy` links do not exist yet, so "implemented"
  here means implemented and described by an existing capability entry. A limitation is stated for every *partial*.
- **Backlog**: C1-n, C2-n, C3-n are items in the [sprint brief](../../specifications/cad-sprints-c1-c3.md); `CAD-n` are new
  backlog items proposed here (defined in §5).
- A command whose current entry has `surface: 'panel'`, `'tree'` or `'inspector'` (no toolbar item) is still listed in its natural
  ribbon group; the `Placement` of §1 of the registry spec will place it.

**Totals (tables in this section):** 206 commands in 10 tabs and 22 groups (7 tabs and 26 groups on screen, §3.4):
**25 implemented, 42 partial, 139 planned.** All 25 current capability entries appear (some as several rows when one entry covers
a tab's worth of commands). 18 of the 139 planned rows are covered by sprint items C1-C3 alone; the other 121 reference a `CAD-n` item (some together with a sprint item).

### 2.1 Tab: Document

#### Group: File

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.new` | **New**: new document with one part | add | - | all | Implemented (CAP:6; REG:262 `create_part`) | - |
| `cad-modeler.open` | **Open**: open a stored revision of the project or a native `.ewscad` file | folder-open | - | all | Partial: disk files only native `.ewscad`; other formats identified and explained (CAP:7) | C3-3 (import), CAD-17 |
| `cad-modeler.save` | **Save**: save a new revision in the project (CAD service) | repository | DOC | all | Implemented (CAP:8) | - |
| `cad-modeler.download` | **Save file**: download the parametric model as `.ewscad` | save | DOC | all | Implemented (CAP:9) | - |
| `cad-modeler.file.save-copy` | **Save a copy**: save as a new document with a note, leaving the open one unchanged | save | DOC | SW, FU, ON | Planned | CAD-29 |
| `cad-modeler.file.templates` | **New from template**: start from a template with units, material and standard planes | document | - | SW, SE, NX | Planned | CAD-29 |
| `cad-modeler.file.properties` | **Document properties**: title (editable today), units, standards, custom properties | settings | DOC | all | Partial: title only, in the model panel (MP:27; REG:202 `set_document_metadata`); no units or custom fields | CAD-29 |

#### Group: History

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.undo` | **Undo**: undo the last CAD transaction | undo | DOC | all | Implemented (CAP:20) | - |
| `cad-modeler.redo` | **Redo**: redo a transaction | redo* | DOC | all | Partial: UI only; no AI operation (coverage `none`, CAP:21) | C1-5 |
| `cad-modeler.history.rebuild` | **Rebuild**: force a full regeneration and show what was rebuilt or reused | reset | DOC | SW, FU, SE | Planned (regeneration runs automatically; diagnostics show rebuilt/reused, CAP:29) | CAD-29 |
| `cad-modeler.history.rollback` | **Rollback bar**: move the end of the feature list back and forward to edit earlier steps | history | DOC | SW, ON, SE, FC | Planned | C3-6 |
| `cad-modeler.history.reorder` | **Reorder features**: drag a feature earlier or later in the tree when dependencies allow | swap | FEAT | SW, FU, ON, SE, FC | Planned | C3-6 |

#### Group: Parameters and links

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.parameters` | **Parameters**: named values and expressions with units (create, edit, delete) | tune | DOC | SW, FU, ON, SE, FC | Implemented (CAP:25; REG:311, 344, 367) | - |
| `cad-modeler.bindings` | **Bindings**: tie a parameter to a design constraint (revision-pinned); outdated-binding report | link | DOC, PROJ | - (differentiator) | Partial: panel shows and removes; creating a binding and the outdated report are assistant-only (CAP:17; REG:1088) | CAD-33 |
| `cad-modeler.handoff` | **Start from handoff**: new part from a Conceptualize CAD handoff, gaps listed | trace-derive | PROJ | - (differentiator) | Partial: assistant operation only, no toolbar control (CAP:18) | CAD-33 |
| `cad-modeler.document.configurations` | **Configurations**: variants of one part driven by a table of parameter values | category | DOC | SW, FU, SE, NX | Planned | CAD-30 |
| `cad-modeler.semantics` | **Semantics**: material, named interfaces, cross-module references | attach | DOC | - (differentiator) | Partial: other modules show no CAD links yet (CAP:28; REG:1182, 1227) | - |
| `cad-modeler.document.material` | **Material**: assign a named material with density (editable today); library of standard materials | category | BODY | SW, FU, SE, NX | Partial: free-form name and density (IP:190; REG:295 `set_material`); no library | CAD-31 |

#### Group: Diagnostics

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.diagnostics` | **Diagnostics**: kernel and version, regeneration, failures, STEP report, operation log | bug | DOC | SW (rebuild errors), FC (report view) | Implemented (CAP:29) | C1-4 (messages), C1-7 |
| `cad-modeler.check` | **Check against constraints**: regenerate and compare with design-constraint bounds read from Conceptualize | validate | DOC, PROJ | - (differentiator) | Partial: assistant operation only, no view control (CAP:19) | CAD-33 |

### 2.2 Tab: Sketch

The Sketch tab is always visible; its drawing groups are *unavailable* (not hidden) until a sketch is active, and it is selected
automatically on entering a sketch (Onshape swaps its toolbar the same way, S7).

#### Group: Sketch

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.sketch` | **Sketch**: create a sketch on a standard plane, datum plane or planar face | cad-sketch | DOC | all | Implemented (CAP:10, 15; REG:390 `create_sketch`) | - |
| `cad-modeler.sketch.finish` | **Finish sketch**: leave sketch mode, validate the profile | check | SK | all | Partial: editing state lives in view state and the panel; no registry entry | CAD-33 |
| `cad-modeler.sketch.plane` | **Change sketch plane**: move a sketch to another plane, datum or face | swap | SK | SW, FU, SE, FC | Partial: command exists (REG:409 `set_sketch_plane`), no control or capability entry | CAD-33 |
| `cad-modeler.sketch.look-at` | **Look at sketch**: orient the view normal to the sketch plane | cad-representation | SK | SW, FU, ON, SE, FC | Planned | CAD-16 |
| `cad-modeler.sketch.project` | **Project / include geometry**: bring edges or faces of the model into the sketch as references | link | SK, EDGE | SW, FU, ON, SE, FC, B (`project`) | Planned | CAD-3 |
| `cad-modeler.sketch.underlay` | **Sketch picture**: place an image as a tracing underlay | image* | SK | SW, FU, FC | Planned | CAD-3 |

#### Group: Draw

All draw commands currently take typed coordinates in the edit panel (CAP:24; sprint brief "Rough edges"); click-to-draw with snapping
is C1-1. The registry commands exist, so each is *partial* until C1-1 lands.

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.draw.point` | **Point**: a sketch point | point* | SK | all | Partial: coordinates only (REG:444 `add_point`) | C1-1 |
| `cad-modeler.draw.line` | **Line**: a line between two points | line* | SK | all | Partial: coordinates only (REG:460 `add_line`) | C1-1 |
| `cad-modeler.draw.rectangle` | **Rectangle**: corner or centre rectangle with driving width and height | rectangle* | SK | all | Partial: coordinates only; corner/centre variants (REG:523 `add_rectangle`) | C1-1 |
| `cad-modeler.draw.circle` | **Circle**: centre and radius | circle* | SK | all | Partial: coordinates only (REG:481 `add_circle`) | C1-1 |
| `cad-modeler.draw.arc` | **Arc**: arc from endpoints and a third point or centre | arc* | SK | all | Partial: coordinates only (REG:501 `add_arc`) | C1-1 |
| `cad-modeler.draw.polygon` | **Regular polygon**: 3 to 64 sides, fully constrained, across flats or circumradius | polygon* | SK | SW, FU, SE, FC, B | Partial: coordinates only; fully constrained (CAP:24; REG:583) | C1-1 |
| `cad-modeler.draw.polyline` | **Polyline**: connected line and arc chain in one gesture | polyline* | SK | all | Planned | C1-1, CAD-3 |
| `cad-modeler.draw.slot` | **Slot**: straight or arc slot with end radii | slot* | SK | SW, FU, SE, FC, B, CQ | Planned | CAD-3 |
| `cad-modeler.draw.ellipse` | **Ellipse and elliptical arc** | ellipse* | SK | all | Planned | CAD-3 |
| `cad-modeler.draw.spline` | **Spline**: fit-point or control-point curve, with tangency handles | spline* | SK | all | Planned (needs a solver extension) | CAD-3 |
| `cad-modeler.draw.text` | **Sketch text**: text outlines for emboss and cut | text | SK | SW, FU, FC, B, CQ | Planned | CAD-11 |
| `cad-modeler.draw.construction` | **Construction toggle**: mark geometry as reference only | cad-sketch | SK | all | Partial: toggle by form (REG:812 `set_construction`) | C1-1 |

#### Group: Edit sketch

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.sketch-edit` | **Edit geometry**: panel for geometry, constraints, dimensions, delete | edit | SK | all | Implemented (CAP:24; REG:763 `delete_sketch_entities`) | - |
| `cad-modeler.edit.move` | **Move point**: drag or type a new position, solver re-solves | select | SK | all | Partial: typed position only (REG:793 `move_sketch_point`) | C1-1 |
| `cad-modeler.edit.delete` | **Delete geometry** with dependent constraints | minus | SK | all | Implemented (REG:763) | - |
| `cad-modeler.edit.trim` | **Trim**: cut a curve back to the nearest intersections | trim* | SK | all | Planned | CAD-2 |
| `cad-modeler.edit.extend` | **Extend**: lengthen a curve to the next boundary | extend* | SK | all | Planned | CAD-2 |
| `cad-modeler.edit.split` | **Split**: break a curve at a point | split | SK | SW, FU, FC | Planned | CAD-2 |
| `cad-modeler.edit.offset` | **Offset**: offset a chain of curves by a distance | offset* | SK | all, B (`offset`), CQ (`offset2D`) | Planned | CAD-2 |
| `cad-modeler.edit.fillet` | **Sketch fillet**: round a corner between two curves | fillet* | SK | all | Planned | CAD-2 |
| `cad-modeler.edit.chamfer` | **Sketch chamfer**: bevel a corner | chamfer* | SK | all | Planned | CAD-2 |
| `cad-modeler.edit.mirror` | **Mirror sketch geometry** about a line | mirror* | SK | all, B (`mirror`), CQ (`mirrorX/Y`) | Planned | CAD-2 |
| `cad-modeler.edit.pattern` | **Sketch pattern**: linear and circular arrays of sketch geometry | pattern* | SK | SW, FU, FC, CQ (`rarray`, `polarArray`) | Planned | CAD-2 |
| `cad-modeler.edit.transform` | **Move, rotate, scale, copy** selected sketch geometry | move* | SK | SW, FU, SE, FC | Planned | CAD-2 |
| `cad-modeler.edit.convert` | **Convert to construction / to B-spline, join curves** | spline* | SK | FC, SW | Planned | CAD-3 |

#### Group: Constrain

Constraint rows are applied by `apply_constraint` (REG:677); the 12 geometric and 7 dimensional types are in TYP:280-295. DOF count,
redundancy and conflict reporting exist (sprint brief "Today"). Panel entry only today, so each row is *partial* on picking.

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.constrain.coincident` | **Coincident**: join two points, or a point to the origin | constraint | SK | all | Partial: form entry (TYP:281) | C1-1 |
| `cad-modeler.constrain.horizontal` | **Horizontal** | constraint | SK | all | Partial: form entry (TYP:282) | C1-1 |
| `cad-modeler.constrain.vertical` | **Vertical** | constraint | SK | all | Partial: form entry (TYP:283) | C1-1 |
| `cad-modeler.constrain.parallel` | **Parallel** | constraint | SK | all | Partial: form entry (TYP:284) | C1-1 |
| `cad-modeler.constrain.perpendicular` | **Perpendicular** | constraint | SK | all | Partial: form entry (TYP:285) | C1-1 |
| `cad-modeler.constrain.tangent` | **Tangent**: line/arc/circle tangency | constraint | SK | all | Partial: form entry (TYP:291) | C1-1 |
| `cad-modeler.constrain.equal` | **Equal**: equal length or radius | constraint | SK | all | Partial: form entry (TYP:286) | C1-1 |
| `cad-modeler.constrain.concentric` | **Concentric** | constraint | SK | all | Partial: form entry (TYP:292) | C1-1 |
| `cad-modeler.constrain.midpoint` | **Midpoint** | constraint | SK | all | Partial: form entry (TYP:290) | C1-1 |
| `cad-modeler.constrain.point-on-line` | **Point on line** | constraint | SK | all | Partial: form entry (TYP:288) | C1-1 |
| `cad-modeler.constrain.point-on-circle` | **Point on circle / arc** | constraint | SK | all | Partial: form entry (TYP:289) | C1-1 |
| `cad-modeler.constrain.fixed` | **Fix**: lock a point or curve | locked | SK | all | Partial: form entry (TYP:287) | C1-1 |
| `cad-modeler.constrain.symmetric` | **Symmetric** about a line or point | constraint | SK | SW, FU, SE, FC | Planned (not among the 19 types) | CAD-3 |
| `cad-modeler.constrain.collinear` | **Collinear** | constraint | SK | SW, FU, SE | Planned (not among the 19 types; FreeCAD merges it into tangent) | CAD-3 |
| `cad-modeler.constrain.block` | **Block**: freeze a curve in place | locked | SK | FC | Planned | CAD-3 |
| `cad-modeler.constrain.dimension` | **Dimension**: smart dimension that picks distance, length, radius, diameter, angle, x/y distance from the selection | dimensions | SK | all | Partial: seven dimensional types by form, driving or driven (TYP:295; REG:677, 703, 724) | C1-1 |
| `cad-modeler.constrain.dimension-edit` | **Edit dimension**: change value or expression, toggle driving or reference | edit | SK | all | Partial: value and driving flag by form (REG:703, 724) | C1-1 |
| `cad-modeler.constrain.delete` | **Delete constraint** | minus | SK | all | Partial: by form (REG:745) | C1-1 |

#### Group: Sketch status

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.status.dof` | **Degrees of freedom and conflicts**: remaining DOF, redundant and conflicting constraints, named | warning | SK | SW, FU, SE, FC | Implemented (sprint brief "Today"; shown in the sketch panel, CAP:24) | - |
| `cad-modeler.status.show-constraints` | **Show or hide constraint glyphs** on the canvas | visibility | SK | SW, FU, SE, FC | Planned | C1-1 |
| `cad-modeler.status.profile-check` | **Profile check**: open ends, self-intersections, overlapping loops before extruding | validate | SK | SW (Sketch Contour), FU, FC | Planned | CAD-3 |
| `cad-modeler.status.snap` | **Snap and grid settings** | tune | SK | all | Planned | C1-1 |

### 2.3 Tab: Features

#### Group: Reference geometry

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.datum` | **Datum plane**: plane offset from a standard plane, datum plane or face | datum-plane* | DOC | all | Partial: offset planes only; no three-point, angled, midplane or tangent planes (CAP:15; REG:425) | CAD-6 |
| `cad-modeler.ref.datum-plane-variants` | **Plane by 3 points / angle / midplane / tangent** | datum-plane* | DOC | SW, FU, ON, SE, FC | Planned | CAD-6 |
| `cad-modeler.ref.axis` | **Datum axis**: through two points, along an edge, cylinder axis | datum-axis* | DOC | all | Planned | CAD-6 |
| `cad-modeler.ref.point` | **Datum point** | point* | DOC | all | Planned | CAD-6 |
| `cad-modeler.ref.coordinate-system` | **Coordinate system** | coordinate-system* | DOC | SW, FU, ON, SE, FC | Planned | CAD-6 |

#### Group: Create

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.extrude` | **Extrude**: profile to new body, join or cut; normal, reverse or symmetric; with preview | cad-extrude | PROF | all | Partial: blind distance only; no through-all, up-to-face, two-sided end, draft or thin wall (CAP:11; REG:835-860) | CAD-1 |
| `cad-modeler.revolve` | **Revolve**: profile about an axis, new body, join or cut, with preview | revolve* | PROF | all | Implemented (CAP:12; REG:868) | - |
| `cad-modeler.create.hole` | **Hole**: simple, counterbore, countersink at points on a face; cosmetic thread attribute | hole* | FACE | SW, FU, ON, SE, FC, B, CQ | Planned | C2-1 |
| `cad-modeler.create.sweep` | **Sweep**: profile along a path, with optional guide | sweep* | PROF | all | Planned | C3-5 |
| `cad-modeler.create.loft` | **Loft**: blend between two or more profiles | loft* | PROF | all | Planned | C3-5 |
| `cad-modeler.create.rib` | **Rib**: supporting web from an open sketch contour, with draft | rib* | SK | SW, SE, FU | Planned | CAD-9 |
| `cad-modeler.create.thin` | **Thin extrude / revolve**: wall of given thickness instead of a solid | thin* | PROF | SW, FU, SE | Planned | CAD-9 |
| `cad-modeler.create.helix` | **Helix and coil**: helical sweep for springs and threads | helix* | SK | SW, FU, SE, B (`Helix`) | Planned | CAD-10 |
| `cad-modeler.create.thread` | **Thread**: modelled thread on a cylindrical face (cosmetic first) | thread* | FACE | SW, FU, SE, FC | Planned | CAD-10 |
| `cad-modeler.create.emboss` | **Emboss and deboss**: raise or cut sketch text or shapes on a face | emboss* | SK, FACE | SW (Wrap), FU, FC | Planned | CAD-11 |
| `cad-modeler.create.box` | **Box** primitive | box* | DOC | FU, FC, B, CQ | Planned | CAD-7 |
| `cad-modeler.create.cylinder` | **Cylinder** primitive | cylinder* | DOC | FU, FC, B, CQ | Planned | CAD-7 |
| `cad-modeler.create.sphere` | **Sphere** primitive | sphere* | DOC | FU, FC, B, CQ | Planned | CAD-7 |
| `cad-modeler.create.cone-torus-wedge` | **Cone, torus, wedge** primitives | cone* | DOC | FU, FC, B, CQ | Planned | CAD-7 |

#### Group: Modify

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.fillet` | **Fillet**: round edges chosen by stable names, constant radius, with preview | fillet* | EDGE | all | Partial: constant radius only; references break after upstream changes (`reference-lost`) (CAP:13; REG:902) | CAD-5, C1-2, C1-3 |
| `cad-modeler.chamfer` | **Chamfer**: equal-distance bevel on edges, with preview | chamfer* | EDGE | all | Partial: equal distance only (CAP:14; REG:932) | CAD-5, C1-2, C1-3 |
| `cad-modeler.modify.fillet-variable` | **Variable and face fillet, full round** | fillet* | EDGE | SW, FU, SE, ON | Planned | CAD-5 |
| `cad-modeler.modify.chamfer-variants` | **Chamfer by distance and angle, or two distances** | chamfer* | EDGE | SW, FU, ON, SE, FC | Planned | CAD-5 |
| `cad-modeler.modify.shell` | **Shell**: hollow a body, removing chosen faces, wall thickness | shell* | BODY, FACE | SW, FU, ON, SE, CQ | Planned | C2-5 |
| `cad-modeler.modify.draft` | **Draft**: taper faces by an angle about a neutral plane | draft* | FACE | SW, FU, ON, SE, FC, B | Planned | C2-6 |
| `cad-modeler.modify.combine` | **Combine bodies**: join, cut, intersect existing bodies | combine* | 2B | SW, FU, ON (Boolean), SE, FC, B, CQ | Planned | C2-7 |
| `cad-modeler.modify.thicken` | **Thicken**: turn a face or surface into a solid of given thickness | thicken* | FACE | SW, FU, ON, SE, B | Planned | CAD-9 |
| `cad-modeler.modify.split-body` | **Split body**: cut a body with a plane, face or sketch | split | BODY | SW, FU, ON, FC, B, CQ | Planned | CAD-8 |
| `cad-modeler.modify.move-body` | **Move / copy body**: translate or rotate a body, optionally keeping a copy | move* | BODY | SW, FU, ON, FC | Planned | CAD-8 |
| `cad-modeler.modify.scale-body` | **Scale body** uniformly or per axis | scale* | BODY | SW, FU, FC, B | Planned | CAD-8 |
| `cad-modeler.modify.delete-body` | **Delete body** | minus | BODY | all | Planned | CAD-8 |
| `cad-modeler.modify.offset-face` | **Offset face**: push or pull faces by a distance (direct edit) | offset* | FACE | SW, FU, ON, SE (synchronous), NX | Planned | CAD-12 |
| `cad-modeler.modify.delete-face` | **Delete / heal face**: remove a face and close the gap | delete-face* | FACE | SW, FU, ON, SE, NX | Planned | CAD-12 |
| `cad-modeler.modify.replace-face` | **Replace face** with another surface | replace-face* | FACE | SW, FU, SE | Planned | CAD-12 |
| `cad-modeler.modify.move-face` | **Move face** (direct edit) | move* | FACE | FU, SE, NX | Planned | CAD-12 |
| `cad-modeler.feature-tree` | **Feature actions**: edit, suppress, delete, rename a feature (tree menu) | tree | FEAT | all | Implemented (CAP:26; MP:57-71; REG:278, 962, 1143, 1160) | - |
| `cad-modeler.modify.edit-feature` | **Edit feature**: reopen a feature's dialog with its current values and preview | edit | FEAT | all | Implemented (REG:962 `edit_feature`; CAP:11-16 notes) | - |
| `cad-modeler.modify.suppress` | **Suppress / unsuppress** | hidden | FEAT | SW, FU, SE, FC | Implemented (REG:1143; MP:66) | - |
| `cad-modeler.modify.delete-feature` | **Delete feature** | minus | FEAT | all | Implemented (REG:1160; MP:67) | - |
| `cad-modeler.modify.rename` | **Rename** a part or feature | edit | FEAT | all | Implemented (REG:278; IP:126) | - |

#### Group: Pattern

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.pattern` | **Linear pattern**: count and spacing (parameters) of extrudes or revolves, with measured gap | pattern* | FEAT | all | Partial: extrudes and revolves only; one direction (CAP:16; REG:1053) | C2-4, CAD-32 |
| `cad-modeler.pattern.circular` | **Circular pattern** about an axis | pattern-circular* | FEAT | all | Planned | C2-3 |
| `cad-modeler.pattern.mirror` | **Mirror features** across a plane or planar face | mirror* | FEAT | all | Planned | C2-2 |
| `cad-modeler.pattern.mirror-body` | **Mirror body** | mirror* | BODY | SW, FU, ON, FC, B, CQ | Planned | C2-2 |
| `cad-modeler.pattern.feature-types` | **Patterns of fillets, chamfers and holes** (extends the pattern input types) | pattern* | FEAT | all | Planned | C2-4 |
| `cad-modeler.pattern.curve` | **Curve- or sketch-driven pattern** | pattern* | FEAT | SW, FU, ON, SE | Planned | CAD-32 |
| `cad-modeler.pattern.fill` | **Fill pattern** within a boundary | pattern* | FEAT | SW, SE, NX | Planned | CAD-32 |
| `cad-modeler.pattern.multi` | **Multi-transform**: chain mirror, linear and circular patterns | pattern* | FEAT | FC | Planned | CAD-32 |
| `cad-modeler.pattern.table` | **Table-driven pattern** | pattern* | FEAT | SW, SE | Planned | CAD-32 |

### 2.4 Tab: Inspect

#### Group: Measure

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.inspect.measure` | **Measure**: distance, angle, radius between picked entities, also for the assistant | measure* | DOC | all | Planned (kernel `distance` exists, KER:149, used for the pattern gap only) | C3-1 |
| `cad-modeler.inspect.measure-extras` | **Measure extras**: area, perimeter, bounding box, closest points | measure* | DOC | SW, FU, ON, SE | Planned | CAD-13 |
| `cad-modeler.inspect` | **Properties**: face, body, feature properties; mass properties; stable face names | info | DOC | SW, FU, ON, SE, FC | Implemented (CAP:27; IP) | - |
| `cad-modeler.inspect.mass` | **Mass properties**: volume, mass (with material), centre of mass, inertia | analysis | BODY | SW, FU, ON, SE, FC | Partial: mass and centre of mass; no inertia tensor shown (IP:93-108) | CAD-13 |

#### Group: Analyse

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.inspect.section` | **Section view**: clipping plane through the model (view state only) | section* | DOC | SW, FU, ON, SE, FC | Planned | C3-2 |
| `cad-modeler.inspect.interference` | **Interference and clearance** between bodies | interference* | 2B | SW, FU, ON, SE, FC | Planned | CAD-13 |
| `cad-modeler.inspect.curvature` | **Curvature and zebra stripes** | curvature* | FACE | SW, FU, SE, NX | Planned | CAD-14 |
| `cad-modeler.inspect.draft-analysis` | **Draft analysis** against a pull direction | draft* | BODY | SW, FU, SE | Planned | CAD-14 |
| `cad-modeler.inspect.thickness` | **Thickness analysis** | thickness* | BODY | SW, FU | Planned | CAD-14 |
| `cad-modeler.inspect.validity` | **Geometry check**: solid validity, healing report | validate | BODY | SW, FU, FC, SE | Partial: validity inside Diagnostics and the STEP report, no explicit command (KER `analyze`; CAP:29) | CAD-13 |

#### Group: Design checks

`cad-modeler.check`, `cad-modeler.bindings` and `cad-modeler.semantics` (§2.1) are the engineering-link checks; the Inspect tab
shows them again by reference (a registry entry has one placement; the tab lists them as shortcuts, see §3).

### 2.5 Tab: Surface (planned)

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.surface.extrude` | **Surface extrude / revolve**: open profile to surface | surface* | SK | all | Planned | CAD-20 |
| `cad-modeler.surface.offset` | **Offset surface** | offset* | FACE | SW, FU, ON, SE, B | Planned | CAD-20 |
| `cad-modeler.surface.planar` | **Planar surface** from a closed sketch | surface* | PROF | SW, FU | Planned | CAD-20 |
| `cad-modeler.surface.trim` | **Trim surface** with a curve or surface | trim* | FACE | SW, FU, ON | Planned | CAD-20 |
| `cad-modeler.surface.extend` | **Extend surface** | extend* | EDGE | SW, FU, ON | Planned | CAD-20 |
| `cad-modeler.surface.knit` | **Knit / stitch** surfaces into a solid | knit* | FACE | SW, FU, ON | Planned | CAD-20 |
| `cad-modeler.surface.loft` | **Surface loft and sweep** | loft* | SK | all | Planned | CAD-21 |
| `cad-modeler.surface.fill` | **Fill / patch** a boundary | patch* | EDGE | SW, FU, FC | Planned | CAD-21 |
| `cad-modeler.surface.boundary` | **Boundary surface** | surface* | EDGE | SW, FU, ON | Planned | CAD-21 |
| `cad-modeler.surface.fillet` | **Surface fillet** | fillet* | FACE | SW, FU | Planned | CAD-21 |

### 2.6 Tab: Sheet metal (planned)

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.sheet.base-flange` | **Base flange**: sheet from a sketch with thickness and bend rules | sheet* | PROF | SW, FU, ON, SE, NX, FC (SheetMetal addon), B (`make_brake_formed`) | Planned | CAD-22 |
| `cad-modeler.sheet.edge-flange` | **Edge flange** | flange* | EDGE | SW, FU, ON, SE | Planned | CAD-22 |
| `cad-modeler.sheet.contour-flange` | **Contour flange** from an open profile | flange* | SK | FU, SE, ON | Planned | CAD-23 |
| `cad-modeler.sheet.hem` | **Hem** | hem* | EDGE | SW, FU, ON, SE | Planned | CAD-23 |
| `cad-modeler.sheet.jog` | **Jog** | jog* | SK | SW, SE | Planned | CAD-23 |
| `cad-modeler.sheet.corner-relief` | **Corner relief** | relief* | EDGE | SW, FU, SE | Planned | CAD-23 |
| `cad-modeler.sheet.cutout` | **Sheet metal cut / punch** | cut* | SK | SW, FU, SE | Planned | CAD-23 |
| `cad-modeler.sheet.unfold` | **Unfold and refold** | unfold* | BODY | SW, FU, ON, SE | Planned | CAD-22 |
| `cad-modeler.sheet.flat-pattern` | **Flat pattern**: developed outline with bend lines | flat-pattern* | BODY | SW, FU, ON, SE, NX | Planned | CAD-22 |
| `cad-modeler.sheet.rules` | **Bend rules**: K-factor, bend allowance, bend table | tune | DOC | SW, FU, SE | Planned | CAD-22 |
| `cad-modeler.sheet.export-dxf` | **Export flat pattern as DXF** | export* | BODY | SW, FU, ON, SE | Planned | CAD-19 |

### 2.7 Tab: Assembly (planned; owner decision pending, sprint brief decision 1)

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.assembly.new` | **New assembly** of parts | assembly | DOC | all | Planned | CAD-24 |
| `cad-modeler.assembly.insert` | **Insert component**: part or sub-assembly, linked to a platform component | component | DOC | all | Planned | CAD-24 |
| `cad-modeler.assembly.joint` | **Joint / mate**: rigid, revolute, slider, cylindrical, planar, ball | joint* | 2B | all, FC (Assembly, OndselSolver) | Planned | CAD-24 |
| `cad-modeler.assembly.ground` | **Ground / fix component** | locked | BODY | all | Planned | CAD-24 |
| `cad-modeler.assembly.pattern` | **Component pattern and mirror** | pattern* | BODY | SW, FU, ON, SE | Planned | CAD-25 |
| `cad-modeler.assembly.interference` | **Assembly interference check** | interference* | DOC | SW, FU, ON, SE | Planned | CAD-25 |
| `cad-modeler.assembly.explode` | **Exploded view** | explode* | DOC | SW, FU, ON, SE, FC | Planned | CAD-25 |
| `cad-modeler.assembly.motion` | **Motion study / joint limits** | motion* | DOC | SW, FU, ON, SE | Planned | CAD-25 |
| `cad-modeler.assembly.bom` | **Bill of materials** from components | table* | DOC | all | Planned | CAD-25 |
| `cad-modeler.assembly.in-context` | **Edit in context** | edit | BODY | SW, FU, SE | Planned | CAD-25 |

### 2.8 Tab: Drawing (planned)

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.drawing.new` | **New drawing sheet** from a template | drawing* | DOC | all, FC (TechDraw page) | Planned | CAD-26 |
| `cad-modeler.drawing.base-view` | **Base view** | view-base* | DOC | all, FC | Planned | CAD-26 |
| `cad-modeler.drawing.projected-view` | **Projected / auxiliary view** | view-projected* | DOC | all, FC (projection group) | Planned | CAD-26 |
| `cad-modeler.drawing.section-view` | **Section view** (also complex section) | section* | DOC | all, FC | Planned | CAD-26 |
| `cad-modeler.drawing.detail-view` | **Detail view** | view-detail* | DOC | all, FC | Planned | CAD-26 |
| `cad-modeler.drawing.break-view` | **Break view and broken-out section** | view-break* | DOC | SW, FU, SE | Planned | CAD-26 |
| `cad-modeler.drawing.dimension` | **Dimension**: length, radius, diameter, angle, ordinate, chain | dimensions | DOC | all, FC | Planned | CAD-27 |
| `cad-modeler.drawing.annotation` | **Notes, leaders, centrelines, centre marks** | text | DOC | all, FC | Planned | CAD-27 |
| `cad-modeler.drawing.balloon` | **Balloon** | balloon* | DOC | all, FC | Planned | CAD-27 |
| `cad-modeler.drawing.gdt` | **Tolerances: feature control frame, datum symbol, surface finish** | gdt* | DOC | SW, FU, SE, NX | Planned | CAD-27 |
| `cad-modeler.drawing.table` | **BOM, hole and revision tables** | table* | DOC | SW, FU, SE | Planned | CAD-27 |
| `cad-modeler.drawing.hatch` | **Hatch** section faces | hatch* | DOC | all, FC | Planned | CAD-26 |
| `cad-modeler.drawing.titleblock` | **Title block and sheet format** | document | DOC | all, FC | Planned | CAD-26 |
| `cad-modeler.drawing.export` | **Export drawing as PDF or DXF** | export* | DOC | all, FC | Planned | CAD-28 |

### 2.9 Tab: Exchange (Import/Export)

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.export-step` | **Export STEP AP242** with a structural check | export* | DOC | all | Implemented (CAP:23; KER:143) | - |
| `cad-modeler.exchange.import-step` | **Import STEP** as a healed, history-free base body | import* | DOC | all, CQ | Planned: kernel port has `importStep` (KER:145) and read-back uses it (`regen/readback.ts`), but no command or UI | C3-3 |
| `cad-modeler.exchange.export-stl` | **Export STL** (binary or ASCII, tolerance) | export* | BODY | all, CQ | Planned | C3-4 |
| `cad-modeler.exchange.export-mesh` | **Export glTF, OBJ, 3MF** | export* | BODY | FU, FC, CQ (3MF) | Planned | CAD-17 |
| `cad-modeler.exchange.step-xcaf` | **STEP with names, colours and structure** (XCAF) | export* | DOC | all | Planned: needs the custom OCCT build (backlog #7) | CAD-17 |
| `cad-modeler.exchange.import-iges` | **Import IGES** | import* | DOC | SW, FU, SE, NX, FC | Planned: not in the current WASM build; owner decision 2 | CAD-18 |
| `cad-modeler.exchange.export-iges` | **Export IGES** | export* | DOC | SW, FU, SE, NX, FC | Planned: same | CAD-18 |
| `cad-modeler.exchange.import-dxf` | **Import DXF** as sketch geometry | import* | SK | all, CQ | Planned | CAD-19 |
| `cad-modeler.exchange.export-dxf` | **Export sketch as DXF** | export* | SK | all, CQ | Planned | CAD-19 |
| `cad-modeler.exchange.import-mesh` | **Import mesh** (STL, OBJ) as a reference body | import* | DOC | FU, FC | Planned | CAD-17 |
| `cad-modeler.exchange.export-image` | **Export image** of the current view (PNG) | image* | DOC | all | Planned | CAD-17 |
| `cad-modeler.exchange.export-svg` | **Export SVG outline** | export* | DOC | CQ | Planned | CAD-19 |

Not planned for import: proprietary native formats (SLDPRT, F3D, Parasolid, NX); they need commercial translators (see [interoperability.md](interoperability.md)).

### 2.10 Tab: View

| ID | Label and description | Icon | Prereq | Tools | Status (evidence) | Backlog |
| --- | --- | --- | --- | --- | --- | --- |
| `cad-modeler.fit` | **Fit**: fit the model in the 3D view | fit | DOC | all | Implemented (CAP:22) | - |
| `cad-modeler.viewport` | **3D view**: orbit, pan, zoom, face picking and highlight | cad-representation | DOC | all | Partial: no camera control or image for the assistant (CAP:30) | CAD-16 |
| `cad-modeler.view.zoom` | **Zoom in / out** | zoom-in | DOC | all | Implemented (VP:397-398) | - |
| `cad-modeler.view.iso` | **Isometric view** | cad-representation | DOC | all | Implemented (VP:393) | - |
| `cad-modeler.view.front` | **Front view** | panel-bottom | DOC | all | Implemented (VP:394) | - |
| `cad-modeler.view.top` | **Top view** | panel-left | DOC | all | Implemented (VP:395) | - |
| `cad-modeler.view.right` | **Right view** | panel-right | DOC | all | Implemented (VP:396) | - |
| `cad-modeler.view.other-views` | **Back, bottom, left views and view cube** | view-cube* | DOC | all | Planned | CAD-16 |
| `cad-modeler.view.edges` | **Show / hide edges** | visibility | DOC | all | Implemented (VP:399; setting `showEdges`) | - |
| `cad-modeler.view.display-mode` | **Display mode**: shaded, shaded with edges, wireframe, hidden lines, transparency | display | DOC | all | Planned | CAD-15 |
| `cad-modeler.view.appearance` | **Appearance**: colour and finish of bodies | palette* | BODY | SW, FU, ON, SE, FC | Planned | CAD-15 |
| `cad-modeler.view.projection` | **Perspective / orthographic** | projection* | DOC | all | Planned | CAD-16 |
| `cad-modeler.view.visibility` | **Hide / show** bodies, sketches, planes | hidden | FEAT | all | Planned | CAD-16 |
| `cad-modeler.view.named` | **Named and saved views** | favorite | DOC | SW, FU, ON, SE | Planned | CAD-16 |
| `cad-modeler.view.normal-to` | **Normal to face** | cad-representation | FACE | SW, FU, ON, SE, FC | Planned | CAD-16 |
| `cad-modeler.view.select-filter` | **Selection filter**: faces, edges, bodies, sketches | filter | DOC | SW, FU, SE, NX | Planned | CAD-4 |
| `cad-modeler.view.panels` | **Show or hide browser, properties, parameters, diagnostics** | layout | DOC | all | Partial: tabs inside the view, not a toggle (CAP:24-29) | CAD-34 |

---

## 3. Proposed toolbar layout (Focused Canvas, professional structure)

Principle (owner decision during this work): the CAD tool offers the structure of a professional tool: a full main menu, a main
(quick-access) toolbar, the tabbed command bar, context-sensitive command sets near the canvas, a feature browser, and a properties
panel. The reference S1 names five parts (main menu, main toolbars, model browser, diagram toolbars, diagram palette); the design
carries them over to CAD and adds the properties panel found in S2, S5 and S7. Everything is rendered with existing
`@ews/design-system` components; gaps are listed in §3.8.

### 3.1 Window anatomy (desktop, `.ws-tool-host`)

```
 Main menu    File  Edit  View  Sketch  Insert  Modify  Inspect  Tools  Window  Help        [search commands] [document tab]
 Main toolbar [New][Open][Save] | [Undo][Redo] | [Select] [Sketch] [Extrude] [Fillet] | [Measure] [Fit] | mode: Part  units: mm
 Command bar  Document | Sketch | Features | Inspect | Exchange | View | More  (planned tabs)         <- tabs -> groups -> commands
 +-----------------+------------------------------------------------------+--------------------+
 | Browser         | 3D canvas                                            | Properties         |
 |  Part           |  [floating selection palette: context commands]      |  selection or      |
 |   Parameters    |  view tools (corner), sketch overlay                 |  feature editor    |
 |   Planes        |                                                      |  Parameters tab    |
 |   Sketches      |                                                      |  Diagnostics tab   |
 |   Features      |                                                      |                    |
 |   Bodies        |                                                      |                    |
 |  rollback bar   |                                                      |                    |
 +-----------------+------------------------------------------------------+--------------------+
 Status bar: kernel, regeneration state, DOF of active sketch, selection summary, units
```

The tool lives in the canvas container (platform rule), so the "main menu" and "main toolbar" are rendered as the tool's own top
rows inside `.ws-tool-host`; the platform top bar is not duplicated (see gap G1).

### 3.2 Main menu (full; every capability appears in a menu, planned ones muted)

Menus show shortcut hints with `Kbd`; planned items are muted with the same "planned" ring as the command bar and open the same
explanation popover; unavailable ones explain what is missing.

| Menu | Items (submenus in parentheses) |
| --- | --- |
| **File** | New, New from template, Open, Open recent, Save, Save a copy, Save file (.ewscad), Import (STEP, IGES, DXF, mesh), Export (STEP, STL, glTF/OBJ/3MF, IGES, DXF, image, drawing PDF), Document properties, Close |
| **Edit** | Undo, Redo, Rebuild, Rollback, Select all, Selection filter (faces, edges, bodies, sketches), Delete, Suppress, Rename, Edit feature, Find command |
| **View** | Fit, Zoom in/out, Standard views (iso, front, top, right, back, bottom, left), Normal to, Display mode (shaded, shaded with edges, wireframe, hidden lines), Perspective/orthographic, Hide/show, Section view, Named views, Panels (Browser, Properties, Parameters, Diagnostics) |
| **Sketch** | Sketch, Finish sketch, Change plane, Draw (point, line, rectangle, circle, arc, polygon, polyline, slot, ellipse, spline, text), Edit (trim, extend, offset, fillet, mirror, pattern, transform), Constrain (geometric types, symmetric, collinear, block), Dimension, Project, Construction toggle, Look at sketch |
| **Insert** | Reference geometry (plane, axis, point, coordinate system), Solids (extrude, revolve, sweep, loft, hole, rib, thread, emboss, primitives), Surface (planned), Sheet metal (planned), Assembly (planned), Drawing (planned) |
| **Modify** | Fillet, Chamfer, Shell, Draft, Combine, Thicken, Split, Move/copy, Scale, Delete body, Direct edits (offset, delete, replace, move face), Patterns (linear, circular, mirror, curve, fill, multi) |
| **Inspect** | Measure, Properties, Mass properties, Section, Interference, Curvature, Draft analysis, Thickness, Geometry check, Check against constraints, Bindings |
| **Tools** | Parameters, Material, Configurations, Semantics, Start from handoff, Settings (units, snap, tessellation tolerance) |
| **Window** | Panels reset, Compact/comfortable density (platform), Documents |
| **Help** | CAD help, Command reference, Keyboard shortcuts, Capability status (what is implemented, partial, planned), Diagnostics |

Menu structure is derived from `Placement` (registry spec §1) by adding an optional `menu` path per entry (gap G2); until then it
is generated from tab and group.

### 3.3 Main toolbar (quick access; always visible; one row; 28 px quiet buttons)

`New`, `Open`, `Save` (primary) | `Undo`, `Redo` | `Select`, `Sketch` (toggle), `Extrude` (split: boss, cut), `Fillet` | `Measure`, `Fit` |
document status text (mode, units, unsaved dot). Phone: Save, Undo and a "more" menu. The quick-access set is user-configurable
later (gap G9).

### 3.4 Command bar: tabs and groups (desktop)

The 12 inventory ribbons (Sketch, Features, Modify, Pattern, Inspect, Surface, Sheet metal, Assembly, Drawing, Import/Export,
View, Document) are 10 tabs in §2 (Modify and Pattern are groups of Features) and 7 tabs on screen: the four fully planned tabs
share one **More** tab until their first command is implemented (recommendation of registry spec §9: planned groups inline per tab, all-planned collapsed into one menu; hiding is not
allowed by the directive).

| Tab | Groups |
| --- | --- |
| **Document** | File, History, Parameters and links, Diagnostics |
| **Sketch** (always shown; selected on entering a sketch; drawing groups unavailable without a sketch) | Sketch, Draw, Edit sketch, Constrain, Sketch status |
| **Features** | Reference geometry, Create, Modify, Pattern |
| **Inspect** | Measure, Analyse, Design checks (shortcuts to check, bindings, semantics) |
| **Exchange** | Import, Export |
| **View** | Navigate, Views, Display, Visibility |
| **More** (planned) | Surface, Sheet metal, Assembly, Drawing: each a muted group with its planned commands inline |

### 3.5 Contextual command sets

| Context | Trigger | Where | Commands |
| --- | --- | --- | --- |
| **Sketching** | A sketch is active | Sketch tab auto-selected; sketch overlay on canvas; status bar shows DOF | Draw, Edit sketch, Constrain, Finish sketch (primary), Look at sketch |
| **Feature edit** | A feature dialog is open (new or edit) | Replaces the command bar by an edit strip: feature name, parameters, Preview toggle, OK (primary), Cancel; properties panel shows the feature form | OK, Cancel, Preview, Reverse, Operation (new, join, cut), Target body |
| **Face selected** | One planar face picked | Floating selection palette near the pick and a Features-tab highlight | Sketch on face, Extrude, Hole, Shell (remove face), Draft, Offset face, Look at, Measure |
| **Edge(s) selected** | Edges picked | Palette | Fillet, Chamfer, Measure, Select chain (planned) |
| **Body selected** | Body picked in canvas or browser | Palette and browser menu | Combine, Split, Move/copy, Mirror body, Mass properties, Appearance, Hide, Delete |
| **Feature selected (browser)** | Row picked | Browser context menu and Edit menu | Edit, Suppress, Rename, Delete, Roll back to here, Pattern, Properties |
| **Two bodies selected** | Two picks | Palette | Combine, Interference, Measure distance |
| **Nothing selected** | Empty canvas | Right-click menu and palette | Sketch, Fit, Views, Paste, Properties of document |

No essential action depends on right-click or hover: each context set is also reachable from the Edit menu and the command bar,
with the unavailable reason shown (platform rule).

### 3.6 Browser (feature tree)

Left panel with `PanelHeader` (title "Browser", filter field, collapse), body in `CollapsibleSection`s: **Parameters**, **Reference
geometry** (origin planes, datum planes), **Sketches**, **Features** (in order, with suppressed, failed and outdated states and
the rollback bar), **Bodies**, **References and semantics**. Row actions in a `Menu` (edit, suppress, delete, rename, hide, roll
back here). Drag to reorder (C3-6) needs a keyboard alternative ("Move earlier / later"). Selection syncs with the canvas and the
properties panel. Current implementation: `ui/ModelPanel.tsx` (custom tree list, MP:57-71).

### 3.7 Properties / specification panel

Right panel with `Tabs`: **Properties** (selection-driven), **Parameters**, **Diagnostics**. The Properties tab shows, for the
selection: document (title, units, material), body (mass properties, material, appearance), face (stable name, surface type,
area, normal, "Sketch on face"), edge (stable name, length, adjacent faces, fillet/chamfer shortcuts), feature (form with live
preview; the same form is the feature-edit strip's content), sketch (entities, constraints, DOF). It follows the No Magic
specification-window idea (one place to read and edit everything about the selected element) without a modal dialog. Current
implementation: `ui/InspectPanel.tsx`, `ui/EditPanel.tsx`, `ui/DiagnosticsPanel.tsx` (CAP:24-29).

### 3.8 Tablet and phone

| Element | Desktop | Tablet (under 840 px tool width) | Phone (under 520 px) |
| --- | --- | --- | --- |
| Main menu | Menu row | Collapses to one "Menu" button with submenus | Same, inside the overflow button |
| Main toolbar | Full | Primary only (New, Save, Undo, Sketch, Extrude, Fit) | Save, Undo, more |
| Command bar | Tabs and groups | `secondary` commands into per-group menus | Tabs become a `Select`, groups become menus; primary commands stay visible |
| Planned items | Inline, muted | In the group menu, muted | Under "More" in the tab Select; explanation popover as a `Sheet` |
| Contextual set | Floating palette near the selection | Docked strip above the canvas | Bottom `Sheet` with large targets |
| Browser | Left panel | Drawer | Drawer via a panel toggle |
| Properties | Right panel | Drawer | Bottom `Sheet` |
| Sketch status | Status bar | Status bar | Status chip on the canvas |

Primary (always visible) commands: New, Save, Undo, Sketch, Finish sketch, Extrude, Fillet, Fit. Everything else is `secondary`.

### 3.9 What the current CommandBar contract cannot express (input to CT-2b)

Checked against `packages/design-system/src/components/CommandBar.tsx`, `docs/modules/design-system/components.md` and registry spec §1 and §4.

| # | Missing structure | Needed for | Closest existing piece |
| --- | --- | --- | --- |
| G1 | **Menu bar**: hierarchical menus with submenus, shortcuts and checked items, built from the registry | Main menu (§3.2) | `MenuButton`, `MenuItem`, `SubmenuTrigger` exist; no `MenuBar` composite, no registry-derived menu model, no `menu` path on `Placement` |
| G2 | **Vertical or floating palette** at the canvas, selection-driven | Context sets, selection palette (§3.5) | None; `CommandBar` is horizontal and tab-based |
| G3 | **Command-level contextual sets**: only whole tabs can be `contextual`; groups and commands cannot appear by selection type | Face/edge/body command sets | `Prerequisite { kind: 'selection' }` exists, but only as availability, not as "show this set" |
| G4 | **Command session / edit strip**: modal strip with OK, Cancel, Preview and parameter fields replacing the bar during a feature edit | Feature edit (§3.5) | `active` toggle on a command; `select`/`text` entries; no numeric/text input entries in the bar, no OK/Cancel session |
| G5 | **Split buttons and galleries**: one command with variants (extrude boss/cut, fillet types, display mode) | Extrude, Fillet, Chamfer, Pattern, View | Group menus only on tablet/phone |
| G6 | **Collapsing all-planned groups into one tab** ("More") or one menu, as recommended in registry spec §9 | Surface, Sheet metal, Assembly, Drawing | Tabs list is flat; no per-tab or per-group collapse rule |
| G7 | **Exclusive toggle groups** (display mode, selection filter) | View tab | `SegmentedControl` exists outside the bar; bar entries are command, select, text, separator only |
| G8 | **Panel layout contract**: browser, properties, diagnostics with docking, toggles and responsive drawers; registry `surface` values (`tree`, `inspector`, `panel`) have no layout | §3.6, §3.7 | `PanelHeader`, `CollapsibleSection`, `Panel`, `ResizeHandle`, `Sheet`, `Drawer`; no tree component (the CAD tree is custom CSS) |
| G9 | **Customisable quick-access toolbar** and user-assignable shortcuts | Main toolbar | None; `shortcut` is a fixed string |
| G10 | **Context menus from the registry** (right-click and long-press) with keyboard alternative | Browser, canvas | `Menu` exists; no model |
| G11 | **Large and small button sizes**, group launcher | Professional ribbon feel | 28 px quiet buttons only (by design; document as a deliberate non-goal) |
| G12 | **More than about 8 tabs on desktop** needs an overflow rule; today the tab strip has none (phone uses `Select`) | 7-10 tabs | `layout` forces `phone` |
| G13 | **Mixed planned and implemented counts** per group (a "3 of 9 available" hint) for discoverability | Planned scope visibility | Not available |
| G14 | **New icon names**: about 77 new semantic names (`*` in §2) | Every new command | `names.ts` (147 names) |

---

## 4. Build versus integrate, by area

Format follows the [evaluation template](../../architecture/open-source-evaluation-template.md) (candidate, upstream, version,
licence, maturity, fit) plus a decision column. **Versions, licences and activity are quoted from the
[open-source survey](open-source-survey.md) (accessed 2026-10-14) and the sprint brief; they were not re-verified in this pass and
each new capability still needs its ADR with fresh checks.** Kernel: OCCT through `replicad-opencascadejs`; the sprint brief says
the WASM OCCT version is unverified (probably 7.6, C1-7).

| Area / planned commands | Candidate | Upstream | Version (per survey) | Licence (per survey) | Maturity / fit | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| **Sketch editing** (trim, extend, offset, fillet, mirror, patterns, transforms; CAD-2, CAD-3) | Own on the in-house solver; replicad 2D offset/boolean helpers for offset only | replicad: https://github.com/sgenoud/replicad | replicad 1.1.0 | MIT | Mature enough for offsets; trim/extend are sketch-topology logic with the solver, no library does it for our model | **Build** (differentiation: sketch model and naming); use replicad/OCCT only for offset curves |
| | planegcs (solver) | `@salusoft89/planegcs` | 1.3.0 | LGPL-2.0-or-later (npm metadata) | Test oracle only (C1-6) | **Reference / oracle** |
| **Hole, shell, draft, thicken, mirror, loft, sweep, combine, split, scale, offset face** (C2, C3, CAD-8, CAD-9) | replicad over OCCT: shell, draft, loft, sweep, mirror, intersect, offset, helix, split/cut plane | replicad | 1.1.0 | MIT | Covers most; no persistent naming | **Integrate** behind `Kernel` port; names are ours (ADR-0024) |
| | OCCT bindings: draft angle, thick solid, through sections, pipe shell, common, section, ShapeFix, UnifySameDomain | `replicad-opencascadejs` / OCCT | OCCT per C1-7 | LGPL-2.1 with exception | Mature, 23 MB WASM | **Integrate** for `hole` (cylinder cut plus cbore/csk profile), `thicken`, healing |
| | CadQuery / build123d | https://github.com/CadQuery/cadquery ; https://github.com/gumyr/build123d | 2.8.0 / 0.13.0 | Apache-2.0 | API design and test geometry (selectors, hole variants, `make_brake_formed`) | **Reference only** |
| | FreeCAD PartDesign | https://github.com/FreeCAD/FreeCAD | n/a | LGPL-2.1+ | Parameters and dress-up behaviour reference | **Reference only** |
| **Fillet / chamfer variants** (CAD-5) | OCCT `BRepFilletAPI_MakeFillet` (variable radius), `MakeChamfer` (distance-angle) via bindings | OCCT | per C1-7 | LGPL-2.1 + exception | Variable radius reachable only if exposed in the replicad-opencascadejs build | **Integrate**; check exposure first (open point) |
| **Patterns** (circular, mirror, curve, fill, multi; C2-2..4, CAD-32) | Own pattern features; OCCT transforms for copies | n/a | n/a | n/a | Pure feature-tree logic over transforms | **Build** (feature model is ours) |
| **Measure, interference, mass** (C3-1, CAD-13) | OCCT `BRepExtrema`, `GProp`; kernel `distance` already in the port (KER:149) | OCCT | per C1-7 | LGPL-2.1 + exception | Mature | **Integrate** |
| **Section view** (C3-2) | three.js clipping planes | https://github.com/mrdoob/three.js | 0.186.1 | MIT | View state only; no B-rep section needed for display; OCCT section for drawing views later | **Integrate** |
| **Analysis** (curvature, zebra, draft, thickness; CAD-14) | three.js shaders over our mesh; OCCT surface curvature queries | three.js / OCCT | as above | MIT / LGPL | Medium effort; shader work is ours | **Extend** |
| **Display modes, appearance, view cube** (CAD-15, CAD-16) | three.js materials, edges, orthographic camera | three.js | 0.186.1 | MIT | Mature | **Integrate**; view cube custom with three.js |
| **STEP import** (C3-3) | OCCT STEP reader; port `importStep` exists | OCCT | per C1-7 | LGPL-2.1 + exception | Names/colours/assembly need XCAF | **Integrate** (geometry only now) |
| **STEP names, colours, structure; IGES** (CAD-17, CAD-18) | **Custom OCCT build** adding XCAF (`STEPCAFControl`, `XCAFDoc`) and IGES readers/writers | opencascade.js build tooling (reference) | OCCT 7.6 or newer (to decide) | LGPL-2.1 (IGES 5.3 also LGPL per interoperability.md) | Not in the current WASM build; build pipeline decision (survey §2.2, §10) | **Build the build** (own custom OCCT WASM build), owner decision 2 |
| **STL / mesh / glTF / image export** (C3-4, CAD-17) | OCCT `StlAPI_Writer` (or three.js exporters) from our mesh | OCCT / three.js | as above | LGPL / MIT | Trivial | **Integrate** |
| **DXF** (CAD-19) | CadQuery's DXF module as design reference; evaluate a JS DXF writer for licence | n/a (candidate to evaluate in ADR) | n/a | to verify | Writers are small; sheet-metal and drawings need it | **Evaluate**, then integrate or build (small) |
| **Surface** (CAD-20, CAD-21) | OCCT `BRepOffsetAPI`, `BRepFill`, `BRepBuilderAPI_Sewing`, filling | OCCT | per C1-7 | LGPL-2.1 + exception | Exposure in the WASM build to verify | **Integrate** |
| **Sheet metal** (CAD-22, CAD-23) | FreeCAD SheetMetal addon (reference), build123d `make_brake_formed` (reference) | FreeCAD addon / build123d | n/a | to verify (addon licence unchecked) | Needs unfolding algorithm, bend tables | **Build** on OCCT (reference only for algorithms) |
| **Assembly** (CAD-24, CAD-25; owner decision) | OndselSolver for joints | https://github.com/FreeCAD/OndselSolver | per survey | LGPL-2.1 | Survey: evaluate later | **Evaluate** when decision 1 is reversed |
| **Drawing** (CAD-26..28) | OCCT hidden-line removal (`HLRBRep`) for views; own sheet and annotation model; FreeCAD TechDraw as design reference | OCCT / FreeCAD | n/a | LGPL | HLR exists; annotations and standards are large | **Extend** HLR; **Build** annotation model |
| **Naming and references** (C1-2, C1-3) | OCCT shape history, own generative naming | OCCT TNaming reference | n/a | n/a | Survey §4 | **Build** (ADR-0024); differentiation |
| **Configurations, materials, units** (CAD-29..31) | Own; expression engine already in `cad-core/src/expr` (OSS-10 owns units work) | n/a | n/a | n/a | n/a | **Build**, coordinate with OSS-10 |
| **UI toolbar, menus, browser** (CAD-34, CAD-35) | `@ews/design-system` + React Aria; concepts from VS Code, Lumino, Theia (ADR-0074) | n/a | n/a | n/a | Registry spec §0 | **Build** in the design system (CT-2b) |

### What remains our differentiation (build, not integrate)

1. Native parametric model with stable face and edge names over OCCT history, and repair of lost references (C1-2, C1-3).
2. Parameters bound to design constraints and concepts (revision-pinned), the check against constraint bounds, handoff from
   Conceptualize, cross-module semantics: no reference tool has an equivalent.
3. One command registry shared by the toolbar, the assistant (dry-run previews) and the capability list.
4. The sketch model and solver with DOF, redundancy and conflict reporting, and its feature-history regeneration engine.
5. The capability-honest toolbar itself (planned, partial and unavailable states).

### Needs the custom OCCT build (backlog #7)

IGES import and export; the XCAF STEP reader and writer (names, colours, assembly structure, PMI); possibly `RWGltf` (not in the current
build per the survey). Everything else in the plan is reachable through replicad or the OCCT bindings already shipped (to be confirmed,
class by class, in each capability's ADR).

---

## 5. Prioritised backlog

Order: (1) items that serve D1 and the e2e flows `cad-modeler`, `cad-modeler-persistence`, `cad-d1`, `demo-d1`; (2) sprint items
C1, C2, C3; (3) new items. D1 relevance: D1's CAD step is a parametric bit holder with a pocket, a clip and fillets (sprint brief
"Today", decision 3), bound to concept parameters and checked against constraints.

### 5.1 Sprint items (unchanged, order as in the sprint brief)

| Sprint | Items |
| --- | --- |
| C1 (sketching and reliability) | C1-1 click-to-draw with snapping and automatic constraints (also unlocks "partial" for all Draw and Constrain rows); C1-2 OCCT shape history as second naming signal; C1-3 repair reference; C1-4 actionable failure messages; C1-5 redo AI coverage and document switcher; C1-6 `SketchSolver` and planegcs oracle; C1-7 OCCT version and progress status |
| C2 (part features) | C2-0 CAD inventory and toolbar layout data (this note feeds it); C2-1 hole; C2-2 mirror; C2-3 circular pattern; C2-4 patterns of fillets, chamfers, holes; C2-5 shell; C2-6 draft; C2-7 combine bodies |
| C3 (measurement, exchange, sweeps) | C3-1 measure; C3-2 section view; C3-3 import STEP; C3-4 STL export; C3-5 loft and sweep; C3-6 reorder and rollback |

### 5.2 New items proposed here (`CAD-n`), D1-relevant first

| ID | Item | Why | Suggested sprint | D1 |
| --- | --- | --- | --- | --- |
| CAD-1 | Extrude end conditions: through-all, up-to-face, two-sided, draft, thin wall | Pockets and clips in real parts need more than blind depth | C2 (before hole) | yes |
| CAD-5 | Fillet variants (variable, face, full round) and chamfer distance-angle / two distances | Completes the dress-up group; D1 uses fillets | C2 | yes |
| CAD-33 | Registry entries and controls for existing but unregistered functions: finish sketch, change plane, create binding, handoff, check, edit feature (toolbar controls and `verifiedBy` links) | Moves 8 rows from partial to implemented without new geometry | C2-0 | yes |
| CAD-4 | Selection filter and on-canvas selection palette | Needed by every edge/face command; feeds CT-2b G2/G3 | C2 | yes |
| CAD-31 | Material library (named materials with density, units) | Mass and the design-constraint check depend on the material | C2 | yes |
| CAD-2 | Sketch edit tools: trim, extend, offset, 2D fillet/chamfer, mirror, sketch patterns, transforms | Sketching without trim is not workable after C1-1 | C2 | no |
| CAD-3 | Sketch geometry and constraint extensions: polyline, slot, ellipse, spline, project, symmetric, collinear, block, profile check | Common profile shapes | C2/C3 | no |
| CAD-6 | Reference geometry variants: axis, point, coordinate system, plane by 3 points/angle/midplane | Required for revolve axes and sweeps | C2 | no |
| CAD-16 | View navigation: view cube, projection, named views, normal-to, hide/show | Usability with more features | C3 | no |
| CAD-15 | Display modes and appearance | Visual review | C3 | no |
| CAD-17 | Mesh and image export, STEP with names and colours (XCAF, custom OCCT build), mesh import | Interchange beyond geometry | C3 + build | no |
| CAD-29 | Document: units, templates, save a copy, forced rebuild | Professional document handling | C3 | no |
| CAD-32 | Pattern variants: curve- and sketch-driven, fill, multi-transform, table | Pattern completeness | C3 | no |
| CAD-7 | Primitives (box, cylinder, sphere, cone, torus, wedge) | Fast blocking-out | C3 | no |
| CAD-8 | Body operations: move/copy, scale, split, delete | Multi-body parts | C3 | no |
| CAD-9 | Rib, thicken, thin features | Part variety | C3 | no |
| CAD-10 | Helix, thread (cosmetic then modelled) | Fasteners | later | no |
| CAD-11 | Emboss, wrap, sketch text | Marking | later | no |
| CAD-12 | Direct face edits: offset, delete, replace, move face | Imported-body editing after C3-3 | later | no |
| CAD-13 | Interference/clearance, measure extras, inertia, geometry check command | Verification | later | no |
| CAD-14 | Analysis: curvature, zebra, draft, thickness | Quality | later | no |
| CAD-18 | IGES import/export (custom OCCT build, owner decision 2) | Legacy exchange | after build | no |
| CAD-19 | DXF import/export (sketches, flat patterns), SVG outline | 2D exchange | with drawings | no |
| CAD-20, CAD-21 | Surface basics, then advanced (fill, boundary, surface fillet) | Surface scope | later | no |
| CAD-22, CAD-23 | Sheet metal core (base flange, edge flange, unfold, flat pattern, rules), then extended | Sheet metal scope | later | no |
| CAD-24, CAD-25 | Assembly basics, then extended (owner decision pending) | Assembly scope | after decision 1 | no |
| CAD-26..CAD-28 | Drawing views, annotations and tolerances, output | Drawing scope | later | no |
| CAD-30 | Configurations (parameter tables) | Product families | later | no |
| CAD-34 | Main menu, context menus and panel toggles (UI structure, depends on CT-2b G1, G2, G8, G10) | Professional structure | with CT-2b | no |
| CAD-35 | Properties panel with selection-driven forms and feature-edit strip (depends on G4) | Specification-window equivalent | with CT-2b | yes (usability) |

### 5.3 Open points

- Whether the shipped replicad-opencascadejs build exposes variable-radius fillet, sewing, filling and `HLRBRep`: verify class by class (C1-7).
- Whether the "clip" in D1 (decision 3) needs CAD-1 or is covered by sketch-on-face plus extrude join.
- Weldments, GD&T beyond annotation symbols, rendering, simulation and CAM are out of the CAD tab inventory (see the
  [matrix](competitive-feature-matrix.md) for their definitions); they belong to other modules or later phases.
- Licences and versions in §4 are inherited from the survey and must be re-verified in each capability's ADR.

# Competitive Feature Matrix: Mechanical CAD Leaders

**Status:** research input, not a specification. Nothing here describes a working capability of this platform.
**Date:** 2026-10-14. **Sources:** see `sources-competitive.md`; IDs in square brackets (R = read in full via fetch, S = search snippet only, X = not accessed).

**Systems compared:** Dassault Systemes CATIA (V5 and 3DEXPERIENCE), Dassault Systemes SOLIDWORKS, Siemens NX, Autodesk Inventor, PTC Creo Parametric.

**Confidence markers**
- `(snippet)`: the claim rests only on a search-result summary. Lower confidence.
- `(bg)`: the claim is the author's background domain knowledge and was not re-verified this session. Lowest confidence, so verify before relying on it.
- No marker: supported by a page read in full (R-source). Vendor marketing pages are still marketing.

**Target platform assumptions (ours)**
- Open CASCADE Technology (OCCT) B-rep kernel, compiled to WebAssembly and running in a browser Web Worker. Feasibility is shown by OpenCascade.js, an auto-generated Emscripten binding [R12, S25].
- TypeScript parametric core: feature graph, sketch solver integration, naming, regeneration scheduling.
- Phases: 1 parametric foundation; 2 professional part modeling; 3 assemblies; 4 surfacing, direct modeling, drawings and specialized modules; 5 interoperability; 6 scalability.
- Under the repository rules (AGENTS.md), the CAD tool currently uses mock geometry. An OCCT dependency would need an ADR and an entry in `docs/dependencies.md` (OCCT is LGPL-2.1 with an exception, (bg)). Do not claim a kernel in UI or docs until one ships.

**Kernel landscape** [R01]
- SOLIDWORKS and NX: Parasolid.
- Inventor: ShapeManager, an ACIS fork.
- Creo: Granite.
- CATIA: CGM.
- OCCT is used by FreeCAD.

None of the five leaders uses OCCT, so OCCT robustness gaps in booleans, fillets and offsets (bg) are a competitive risk to plan for.

---

## 1. Part modeling

| System | Implementation (public names) |
|---|---|
| CATIA | Part Design workbench with Sketcher; solids live in Bodies (PartBody), and wireframe and surfaces in Geometrical Sets / Ordered Geometrical Sets [S82, S83] (snippet) |
| SOLIDWORKS | Part document; FeatureManager design tree; Hole Wizard and Instant3D (bg; Instant3D [S65] snippet) |
| NX | Modeling application; Part Navigator; expressions; history and history-free (synchronous) modes [R02, R03] |
| Inventor | Part (.ipt) environment; model browser; parameters (Manage tab) [S09] (snippet) |
| Creo | Part mode; Model Tree; Sketcher; Flexible Modeling tab [R05] |

**Functional requirements**
- CAP-PM-01: A part document holds one or more bodies, datums, sketches and an ordered feature list.
- CAP-PM-02: Every feature has a stable ID, a display name and editable parameters. Names are for display only.
- CAP-PM-03: Regeneration produces the B-rep per body and reports per-feature status (ok, warning, failed, suppressed).
- CAP-PM-04: Rollback marker: the user can insert features at any point in history.
- CAP-PM-05: Units and model tolerance are set per document.

**Workflow:** create a sketch on a datum plane; extrude or revolve it; add holes, fillets and patterns; edit dimensions and regenerate.

**Challenges:** feature ordering and rollback semantics, robust references to generated faces (topological naming, see §3), clear error recovery when an upstream edit breaks downstream features.

**Priority / phase:** P0, Phase 1 (minimum: sketch, extrude, revolve, boolean), Phase 2 (full set). Depends on OCCT `BRepPrimAPI` / `BRepAlgoAPI` running in the worker (bg).

## 2. Sketching and constraint solving

| System | Implementation |
|---|---|
| CATIA | Sketcher workbench with geometric and dimensional constraints (bg) |
| SOLIDWORKS | Sketch with relations and smart dimensions. Status colours: black = fully defined, blue = under-defined, red = over-defined, plus driven (gray) and dangling states; SketchXpert resolves conflicts [S75, S76] (snippet) |
| NX | Sketch task environment. Synchronous technology was developed with Siemens' D-Cubed constraint technology and Parasolid [R03] |
| Inventor | 2D sketch with geometric constraints and dimensions; "Show Dimensions" for feature dimensions [S98] (snippet) |
| Creo | Sketcher with "weak" and "strong" dimensions and constraints (bg) |

D-Cubed 2D DCM is a commercially licensed constraint solver embedded by many CAD vendors [S50] (snippet). This research did not confirm which of the five systems besides NX embed it.

**Functional requirements**
- CAP-SK-01: Entities: point, line, arc, circle, ellipse, spline, construction geometry, projected or external references.
- CAP-SK-02: Constraints: coincident, horizontal, vertical, parallel, perpendicular, tangent, equal, concentric, symmetric, fix, midpoint, point-on-curve.
- CAP-SK-03: Driving and driven (reference) dimensions; expressions referencing parameters.
- CAP-SK-04: The solver reports degrees of freedom per entity and the definition state (under, fully or over-constrained, conflicting). The UI shows the state without relying on colour alone.
- CAP-SK-05: Auto-inference of constraints while drawing, with an undoable suggestion.
- CAP-SK-06: Drag under-constrained geometry while the solver preserves existing constraints (a minimal-move solution).
- CAP-SK-07: Diagnose over-constraint: identify the redundant or conflicting set and offer to convert a dimension to driven.

**Workflow:** pick a plane or face; draw a rough profile with inferred constraints; add dimensions until fully defined (the status indicator changes); exit and use the profile in a feature.

**Challenges:**
- Solver choice: build in TypeScript (Newton/LM with graph decomposition) or compile an open solver such as PlaneGCS (FreeCAD) or SolveSpace to WASM (bg).
- Numerical stability and solution "jumping" (branch selection) during drags.
- Interactive drag performance needs incremental solving.
- Sketches attached to model faces inherit topological naming risk.

**Priority / phase:** P0, Phase 1. The solver can run in TypeScript or WASM in the worker and is independent of OCCT. OCCT is only needed to build wires and faces from the solved sketch.

## 3. Feature-based parametric modeling

| System | Implementation |
|---|---|
| CATIA | Ordered features in Bodies; parameters and formulas through Knowledgeware [S10, S11] (snippet) |
| SOLIDWORKS | FeatureManager history; equations; global variables; Design Tables [S28] (snippet) |
| NX | History mode with expressions; can be mixed with history-free modeling [R02, R03] |
| Inventor | Feature browser; parameters dialog; iLogic rules drive parameters [R04] |
| Creo | Model Tree with regenerating features; relations and parameters (bg); Family Tables [S33] (snippet) |

**How leaders keep references stable (topological naming)**
- **Inventor:** "reference keys", byte arrays from `GetReferenceKey`, resolved with `ReferenceKeyManager.BindKeyToObject`. B-rep entities need a key context, and the binding can return several candidate matches with a primary first [S89] (snippet).
- **SOLIDWORKS:** API persistent reference IDs (`GetPersistReference3`) that persist across sessions [S68] (snippet).
- **OCCT:** the OCAF `TNaming` framework records old/new shape pairs per label, with evolution types (PRIMITIVE, GENERATED, MODIFY, DELETE, REPLACE, SELECTED) [R11, S26, S27].
- **FreeCAD 1.0:** shipped a toponaming mitigation, initially limited to Sketcher and PartDesign, with fillets and chamfers reported as still fragile [S24] (snippet).
- **Literature:** Kripac (1997) [S99], Agbodan/Marcheix/Pierra [S15], and the KAIST survey [S16] (all snippet).

**Functional requirements**
- CAP-FP-01: A feature graph (DAG) of typed features with parameter inputs and geometric references. Regeneration is in topological order.
- CAP-FP-02: Geometric references are stored as persistent names (feature ID + generator role + local topological signature), never as raw kernel indices.
- CAP-FP-03: When a name resolves to several or zero candidates, the feature is marked "needs repair" and the UI offers candidates. Never re-bind silently.
- CAP-FP-04: Parameters and expressions (units-aware) with dependency tracking. Cycles are rejected.
- CAP-FP-05: Suppress / unsuppress, reorder (with dependency validation), rollback, and edit-in-place.
- CAP-FP-06: The feature graph is serialized as a versioned, kernel-independent schema. B-rep is a derived cache.

**Workflow:** create a feature from the toolbar; select references; set parameters in a contextual panel; confirm. Later, double-click the feature in the tree to edit it and regenerate.

**Challenges:**
- Topological naming is the core risk: OCCT's `BRepAlgoAPI` / `BRepBuilderAPI` history (`Generated`, `Modified`, `IsDeleted`) gives the raw evolution data, but a naming scheme must be designed in the TypeScript core (bg).
- Determinism of regeneration across WASM builds.
- Partial regeneration: regenerate only downstream features.

**Priority / phase:** P0, Phase 1 (graph, parameters, naming v1). Phase 2 (repair UI, reorder).

## 4. Direct modeling

| System | Implementation |
|---|---|
| CATIA | 3DEXPERIENCE "Live Shape" style direct editing (bg; not verified) |
| SOLIDWORKS | Move Face, Delete Face and Instant3D. One commentary argues these are history features, not true history-free editing [S64, S65] (snippet) |
| NX | Synchronous Modeling: move, resize and rotate faces irrespective of feature order; intelligent relationships preserve design intent; works on imported data [R02, R03] |
| Inventor | "Direct Edit" command (bg; this research found no confirming source) |
| Creo | Flexible Modeling (tab in Creo Parametric; FMX extension): geometry-based editing that does not create new geometry, with recognition tools for patterns and symmetry. Since Creo 7.0 it works across multibody parts; Remove, Mirror and Pattern accept references from one body only [R05, S66, S67] |

**Functional requirements**
- CAP-DM-01: Move or rotate a face set with automatic adjacent-face extension or trimming.
- CAP-DM-02: Offset face, replace face, delete face (heal the gap), and modify radius of round/fillet faces.
- CAP-DM-03: Recognize and preserve relationships during edits: coplanar, coaxial, tangent, symmetric, pattern members.
- CAP-DM-04: Each direct edit is recorded as a feature in the history (hybrid approach, like Creo's Flexible Modeling) so it can be edited and is replayable.
- CAP-DM-05: Direct edits work on imported bodies with no history.

**Workflow:** select one or more faces; drag a handle or type a distance; choose which recognized relationships to keep; accept. A feature is added to the tree.

**Challenges:** face extension and re-intersection are kernel-hard. OCCT has `BRepOffsetAPI` and local operations, but robustness on complex blends is limited (bg). Relationship recognition is heuristic. Combining direct edits with downstream references needs naming support.

**Priority / phase:** P2, Phase 4 (hybrid direct edits recorded as features). Depends on OCCT local operations.

## 5. Surface modeling

| System | Implementation |
|---|---|
| CATIA | Generative Shape Design (GSD): wireframe and surface features, constructive and history-based [S52] (snippet) |
| SOLIDWORKS | Surface features (extrude, revolve, loft, boundary, fill, knit, trim) (bg) |
| NX | Surface modeling plus freeform tools (bg); Realize Shape for subdivision (see §13) [S53] (snippet) |
| Inventor | Surface features plus the T-spline Freeform environment [S54] (snippet) |
| Creo | Surface features and quilts; Style (ISDX) for freeform [S55, S88] (snippet) |

**Functional requirements**
- CAP-SU-01: Surface extrude, revolve, sweep, loft and boundary (with G0/G1/G2 edge conditions), fill / N-sided patch.
- CAP-SU-02: Trim, extend, offset, knit/sew, untrim, thicken, and convert a closed shell to a solid.
- CAP-SU-03: Analysis: zebra stripes, curvature comb, deviation and continuity check.
- CAP-SU-04: Surfaces are first-class bodies in the feature graph (separate from solids).

**Workflow:** build wireframe curves; create boundary or loft surfaces; trim and knit; thicken or close to a solid.

**Challenges:** continuity control with OCCT `GeomFill` / `BRepFill` / `BRepOffsetAPI_MakeFilling` (bg); sewing tolerance management; analysis rendering in the browser.

**Priority / phase:** P1, Phase 4 (basic surfaces may be pulled into Phase 2 for lofts and sweeps).

## 6. Solid modeling

| System | Implementation |
|---|---|
| CATIA | Part Design solid features; Boolean operations Assemble / Add / Remove / Intersect / Union Trim / Remove Lump between bodies [S82, S83] (snippet) |
| SOLIDWORKS | Boss/cut features, Combine, shell, draft, rib (bg) |
| NX | Feature modeling on Parasolid [R01]; Unite / Subtract / Intersect (bg) |
| Inventor | Extrude, revolve, sweep, loft, coil, shell, combine (bg) |
| Creo | Extrude, revolve, sweep, blend, shell, draft (bg); multibody since Creo 7.0 [R05] |

**Functional requirements**
- CAP-SO-01: Extrude/revolve with end conditions (blind, through all, up to face, symmetric, two-sided), draft, thin.
- CAP-SO-02: Sweep (with twist and guide), loft (with guides), helix/coil.
- CAP-SO-03: Fillet (constant, variable), chamfer, shell, draft, rib, hole (standard sizes), thread (cosmetic).
- CAP-SO-04: Linear, circular, curve-driven and table patterns; mirror.
- CAP-SO-05: Booleans with explicit target and tool bodies.
- CAP-SO-06: Validity check after each feature, using a `BRepCheck`-style validator (bg).

**Workflow:** profile, then extrude; fillet edges; shell; pattern holes.

**Challenges:** fillet/chamfer robustness in OCCT is a known pain point (bg). Pattern performance can be improved by instancing transformed shapes instead of re-booleaning each instance. Tolerance growth.

**Priority / phase:** P0, Phase 1 (extrude, revolve, boolean, fillet, chamfer); Phase 2 (sweep, loft, shell, draft, patterns, holes).

## 7. Assembly modeling

| System | Implementation |
|---|---|
| CATIA | Assembly Design workbench / product structure with assembly constraints (bg) |
| SOLIDWORKS | Assembly document with mates; patterns instead of repeated mates recommended for performance [R06] |
| NX | Assembly Navigator; assembly constraints; reference sets [S70] (snippet) |
| Inventor | Assembly (.iam) with constraints/joints (bg); Model States for assembly variants [S30, S31] (snippet) |
| Creo | Assembly mode with component placement constraints and mechanism connections (bg) |

**Functional requirements**
- CAP-AS-01: Assembly document with component instances (part or subassembly) and placement transforms.
- CAP-AS-02: Mates/constraints: coincident, concentric, distance, angle, parallel, tangent, plus joint types (rigid, revolute, slider, cylindrical, planar, ball).
- CAP-AS-03: Degree-of-freedom feedback, under/over-constrained diagnosis, and drag within remaining DOF.
- CAP-AS-04: Component patterns and mirror; fixed/grounded component.
- CAP-AS-05: Interference and clearance checks; exploded views.
- CAP-AS-06: Each component instance links to a platform physical component through `represents` (repository identity rules). Never create duplicate components.

**Workflow:** insert a base component (grounded); insert the next component; select two faces or axes and choose a mate type; repeat; check interference.

**Challenges:**
- A 3D assembly constraint solver is a different solver from the 2D sketch solver (D-Cubed sells 3D DCM separately [S50] (snippet)).
- Mate references to faces need the naming system across documents.
- Transform propagation, plus BVH-based interference performance in WASM.

**Priority / phase:** P0, Phase 3.

## 8. Large assembly management

| System | Implementation |
|---|---|
| CATIA | CGR cache / visualization mode: unchanged components open as visualization data and only changed parts in design mode (described via the Windchill CATIA V5 integration) [S72] (snippet) |
| SOLIDWORKS | Lightweight mode, Large Assembly Mode (threshold-triggered settings), Large Design Review, SpeedPak (only faces/bodies needed for mating), simplified/defeatured configurations [R06, S03, S04] |
| NX | Partial loading; lightweight (faceted) vs exact representations; reference sets [S70, S71] (snippet; KB not accessed X07) |
| Inventor | Model States (replaced Level of Detail in 2022); Simplify command (successor to Shrinkwrap); Express mode [S30, S73, S74] (snippet) |
| Creo | Simplified representations; Shrinkwrap (outer-skin lightweight model) [S06, S07] (snippet) |

**Functional requirements**
- CAP-LA-01: Load levels per component: bounding box, tessellated display only, lightweight (display + selected B-rep), full.
- CAP-LA-02: Persistent tessellation cache per component revision. Display does not require kernel regeneration.
- CAP-LA-03: User-defined simplified representations (include, exclude, substitute) saved with the assembly.
- CAP-LA-04: Envelope / shrinkwrap generation: an outer-skin simplified body for downstream use.
- CAP-LA-05: Lazy, prioritized loading (visible and near-camera components first). Progress is cancellable.

**Workflow:** open an assembly in lightweight mode; select a subassembly and switch it to full to edit; save a simplified representation for reviewers.

**Challenges:** browser memory ceilings (WASM 32-bit address space by default, bg); GPU instancing; cache invalidation keyed on input revisions (matches the platform's artifact/revision model); deciding which mates need exact geometry.

**Priority / phase:** P1, Phase 6, but design the load-level and cache contracts in Phase 3.

## 9. Configuration and product families

| System | Implementation |
|---|---|
| CATIA | Design Tables, part of the Knowledgeware relations family [S11] (snippet) |
| SOLIDWORKS | Configurations (ConfigurationManager) and Design Tables (embedded Excel). Tables control dimensions, suppression, Hole Wizard sizes, custom properties, and in assemblies component suppression and mate dimensions [S28, S29] (snippet; X03 nav only) |
| NX | Part families (bg); Product Template Studio; Parameter Table selection widget in Feature/Product Templates [S34] (snippet) |
| Inventor | iParts / iAssemblies (table-driven); Model States (2022+). The two are mutually exclusive within a file [S30, S31] (snippet) |
| Creo | Family Tables (generic + instances); skeletons can have their own family tables [S32, S33] (snippet) |

**Functional requirements**
- CAP-CF-01: One document holds multiple named variants. A variant overrides parameter values, suppression states and properties.
- CAP-CF-02: Tabular editor (grid) for variants. Import/export CSV. No dependency on Excel.
- CAP-CF-03: Assembly variants select component variants and suppression.
- CAP-CF-04: Variants map to the platform "configuration" shared context. A variant is not a separate object identity unless explicitly published as a part number.
- CAP-CF-05: Regeneration caches are per variant.

**Workflow:** open the variant table; add a row; set overriding values; activate the variant to regenerate.

**Challenges:** the cache explodes with N variants; naming must be stable across variants whose suppression differs; drawings and BOMs must follow the active variant.

**Priority / phase:** P1, Phase 2 (part variants); Phase 3 (assembly variants).

## 10. Top-down design

| System | Implementation |
|---|---|
| CATIA | Skeleton method plus Publications, which control external references between components; design in context and link management [S37, S38] (snippet) |
| SOLIDWORKS | In-context features and external references; the vendor advises limiting in-context features for performance [R06] |
| NX | WAVE Geometry Linker (associative inter-part links; extended WAVE licensing for position-independent links) and interpart expressions; Feature Templates can perform WAVE linking (NX 2212+) [S34, S35, S36] (snippet) |
| Inventor | Derived components and adaptive parts (bg) |
| Creo | Skeleton models, Copy Geometry / External Copy Geometry, Publish Geometry [S32] (snippet) |

**Functional requirements**
- CAP-TD-01: A skeleton/layout part whose published elements (datums, sketches, surfaces, parameters) are explicitly exported.
- CAP-TD-02: Consumers reference only published elements. Links record the source document revision.
- CAP-TD-03: Link states (up to date, out of date, broken, frozen) with explicit update. No implicit synchronisation, matching repository policy.
- CAP-TD-04: Reference viewer showing inter-document dependencies.

**Workflow:** create the skeleton; publish interface geometry; create parts referencing the publications; change the skeleton and update the consumers.

**Challenges:** cross-document naming, update order across documents, cycles. These map well onto the platform's revision-pinned references.

**Priority / phase:** P1, Phase 3.

## 11. Sheet metal

| System | Implementation |
|---|---|
| CATIA | Generative Sheetmetal Design: walls/flanges, bends, hems, cut-outs, unfold to flat pattern [S48] (snippet) |
| SOLIDWORKS | Sheet metal features from a base flange; convert-to-sheet-metal; sheet metal cut lists [S39, S40] (snippet) |
| NX | NX Sheet Metal; Flat Pattern feature with "fix at current timestamp" (NX12+) and corner treatments in the API [S46, S47] (snippet) |
| Inventor | Sheet metal environment; Flat Pattern (disabled in multi-body parts; use Make Components) [S43] (snippet) |
| Creo | Sheetmetal mode; flat states (managed via family tables historically); Flat Pattern feature always last; Flat Pattern Manager for multibody (Creo+ 2024) [S44, S45] (snippet) |

**Functional requirements**
- CAP-SM-01: Sheet metal rules: thickness, bend radius, K-factor or bend table, relief types.
- CAP-SM-02: Base flange, edge flange, miter flange, hem, jog, sketched bend, convert solid to sheet metal.
- CAP-SM-03: Unfold/refold and a flat pattern with bend lines, and export to DXF.
- CAP-SM-04: Flat pattern extents (length, width, area) exposed as properties.

**Workflow:** set the sheet metal rule; create a base flange from a sketch; add edge flanges; generate the flat pattern and export DXF.

**Challenges:** unfolding is not provided by OCCT and must be implemented (bg); bend allowance math; naming of flanges across fold states.

**Priority / phase:** P2, Phase 4.

## 12. Weldments and structural members

| System | Implementation |
|---|---|
| CATIA | Structure Design (linear/curved members and plates from standard or user sections) [S49] (snippet) |
| SOLIDWORKS | Weldments: structural members along sketch paths, custom profiles, weld beads, automatic cut lists with length, size, quantity and material [S39, S40, S41] (snippet) |
| NX | Structure Designer (bg) |
| Inventor | Frame Generator with Content Center section libraries; custom sections can be authored [S42] (snippet) |
| Creo | Advanced Framework Extension (AFX) (bg; no source found this session) |

**Functional requirements**
- CAP-WS-01: Profile library (parametric cross-sections by standard), extensible by users.
- CAP-WS-02: Place members along sketch segments or edges; end treatments (miter, butt, trim to member, cope).
- CAP-WS-03: Cut list grouping identical members, with length, profile, material and quantity.
- CAP-WS-04: Weld bead representation (cosmetic or simplified solid).

**Workflow:** draw a 3D skeleton sketch; choose a profile; select path segments; set corner treatments; review the cut list.

**Challenges:** robust miter/trim booleans for many members; 3D sketch support; cut list identity across edits.

**Priority / phase:** P3, Phase 4.

## 13. Freeform and advanced surfacing

| System | Implementation |
|---|---|
| CATIA | ICEM Shape Design (ICM/IEX) for Class A patch modeling with control-point and continuity control; FreeStyle (bg); Imagine & Shape subdivision (bg) [S51, S52] (snippet) |
| SOLIDWORKS | Freeform feature and boundary surfaces (bg); 3DEXPERIENCE xShape subdivision (bg) |
| NX | Realize Shape subdivision modeling (control mesh to curvature-continuous surfaces), introduced in NX 9 [S53] (snippet) |
| Inventor | Freeform environment based on T-splines (since 2015), more limited than Fusion [S54] (snippet) |
| Creo | Style / ISDX (style curves, surfaces, single Style feature); Freestyle subdivision-like push/pull; ISDX can reference Freestyle [S55, S56, S88] (snippet) |

**Functional requirements**
- CAP-FS-01: Control-point editing of B-spline curves and surfaces with continuity constraints at boundaries.
- CAP-FS-02: Subdivision cage modeling converted to B-spline (NURBS) bodies.
- CAP-FS-03: Class A analyses (highlight lines, curvature maps, G2/G3 checks).

**Workflow:** create a primitive cage; push/pull and crease edges; convert to a B-rep surface; trim and connect to solid features.

**Challenges:** subdivision-to-NURBS conversion is not in OCCT (bg); interactive mesh editing must be on the main thread or the GPU for latency; G2 matching.

**Priority / phase:** P3, Phase 4 (late) or later. A low priority for mechanical-first users.

## 14. Multi-body modeling

| System | Implementation |
|---|---|
| CATIA | Multiple Bodies with Boolean operations; geometrical sets for surfaces; restrictions on re-applying booleans to bodies already combined [S82, S83] (snippet) |
| SOLIDWORKS | Multibody parts (Solid Bodies folder, Combine, Split, cut-list folders for weldments/sheet metal) [S40] (snippet) |
| NX | Multiple bodies per part (bg) |
| Inventor | Multi-body parts; Make Components / Make Part to derive parts [S43] (snippet) |
| Creo | Multibody design since Creo 7.0, including Flexible Modeling across bodies [R05] |

**Functional requirements**
- CAP-MB-01: Each feature declares its target body (new body or merge into an existing one).
- CAP-MB-02: Body operations: combine, subtract, intersect, split, move/copy, delete.
- CAP-MB-03: Derive parts and assemblies from bodies, keeping an associative link.

**Workflow:** create bodies for separate features; split; Make Components into an assembly.

**Challenges:** body identity through splits and merges (naming); per-body regeneration caching.

**Priority / phase:** P1, Phase 2.

## 15. Reference geometry

| System | Implementation |
|---|---|
| CATIA | Wireframe and datum elements in geometrical sets (points, lines, planes) (bg) |
| SOLIDWORKS | Reference geometry: planes, axes, coordinate systems, points, mate references (bg) |
| NX | Datum plane/axis/CSYS (bg) |
| Inventor | Work planes, work axes, work points, UCS (bg) |
| Creo | Datum planes, axes, points, coordinate systems, curves (bg) |

**Functional requirements**
- CAP-RG-01: Datum plane (offset, angle, through 3 points, normal to curve, midplane, tangent), axis, point, coordinate system.
- CAP-RG-02: Datums are features with persistent IDs, visible and selectable, and can be published.
- CAP-RG-03: Default origin planes and coordinate system in every part.

**Workflow:** select references; choose the datum type inferred from the selection; set offset or angle.

**Challenges:** little kernel risk; inference UX; dependence on naming for face-referenced datums.

**Priority / phase:** P0, Phase 1.

## 16. GD&T

| System | Implementation |
|---|---|
| CATIA | 3D Functional Tolerancing & Annotation (FT&A): annotations checked against the selected standard; views and captures [S95, S96] (snippet) |
| SOLIDWORKS | DimXpert; SOLIDWORKS MBD [S57] (snippet) |
| NX | PMI with PMI Advisor (rules-based authoring) [S59] (snippet) |
| Inventor | Tolerance Feature command (datums, feature control frames), Tolerance Advisor, General Profile Note; standards via Active Standard; ASME Y14.5 support [R07, S97] |
| Creo | GD&T Advisor (Sigmetrix-based) for authoring and validation [S58] (snippet) |

**Functional requirements**
- CAP-GD-01: Datum features and datum reference frames tied to model faces by persistent names.
- CAP-GD-02: Feature control frames for form, orientation, location, profile and runout, under ASME Y14.5 and ISO 1101 (selectable standard).
- CAP-GD-03: Semantic validation: datum completeness, under-constrained features, invalid modifiers (advisor function).
- CAP-GD-04: Tolerances are data (semantic), not just graphics, so they can be exported (see CAP-MBD).

**Workflow:** define datums A/B/C on faces; select a feature to get the suggested control type; set tolerance values; the advisor reports status.

**Challenges:** standard rule encoding (licensing of standards texts: encode rules, do not copy text); annotation attachment surviving regeneration.

**Priority / phase:** P2, Phase 4.

## 17. Model-based definition (MBD)

| System | Implementation |
|---|---|
| CATIA | FT&A views/captures reusable to create 2D drawing views; STEP export with semantic PMI ("Authorable & Graphic") via an extended STEP interface [S79, S95] (snippet) |
| SOLIDWORKS | SOLIDWORKS MBD: 3D dimensions, tolerances, datums, notes; publish to eDrawings, STEP 242 and 3D PDF [S57] (snippet) |
| NX | PMI; PMI inheritance into drawings [S93, S94] (snippet) |
| Inventor | 3D annotations in parts/assemblies, annotation scale per view representation, Tolerance Analysis stack-up [R07] |
| Creo | Creo MBD; AP242 export (graphical by default, semantic option; no assembly-level annotations) [S58, S78] (snippet) |

**Functional requirements**
- CAP-MBD-01: Annotation views (camera, visible annotations, section) saved in the model.
- CAP-MBD-02: Export of semantic PMI to STEP AP242. Graphical presentation as a fallback [S77] (snippet).
- CAP-MBD-03: An MBD package is published as an immutable artifact with input revisions (platform `saveArtifact`).
- CAP-MBD-04: Annotations follow geometry through regeneration or are flagged orphaned.

**Workflow:** annotate; create annotation views; validate; publish the MBD artifact (3D viewer plus STEP AP242).

**Challenges:** OCCT has STEP read/write via XDE including GD&T entities (bg; check coverage); browser 3D PDF is impractical, so a web viewer is preferred.

**Priority / phase:** P2, Phase 4 (authoring), Phase 5 (AP242 exchange).

## 18. 2D engineering drawings

| System | Implementation |
|---|---|
| CATIA | Generative Drafting (views generated from 3D; "View From 3D" from FT&A) [S95] (snippet) |
| SOLIDWORKS | Drawings with model items, standard views, BOM tables; drawing performance tips [S01] (snippet) |
| NX | Drafting with associative views and PMI inheritance options ("Aligned to Drawing", "Show PMI on Drawing") [S93] (snippet) |
| Inventor | Drawing (.idw/.dwg) environment; shared 3D annotation views can be used in 2D drawings; export of annotated models to 3D PDF/DWF/STEP [S100] (snippet) |
| Creo | Drawing mode with shown/created dimensions (bg) |

**Functional requirements**
- CAP-DR-01: Sheet formats and title blocks bound to properties.
- CAP-DR-02: Projected, auxiliary, section, detail, broken and isometric views, associative to the model revision.
- CAP-DR-03: Hidden-line removal and tangent-edge display from exact geometry (`HLRBRep` in OCCT, bg).
- CAP-DR-04: Dimensions (retrieved model dimensions plus reference dimensions), annotations, BOM/parts list, balloons.
- CAP-DR-05: Export to PDF, SVG and DXF. A drawing is an artifact pinned to model revisions, with staleness derived from them.

**Workflow:** create a drawing from a template; place base and projected views; retrieve dimensions; add a BOM; export PDF.

**Challenges:** HLR performance in WASM for big parts; dimension attachment persistence; drafting standards (ISO 128 / ASME Y14).

**Priority / phase:** P1, Phase 4 (a basic view-only drawing could be an early Phase 2 demo).

## 19. CAD interoperability

| System | Implementation |
|---|---|
| CATIA | STEP/IGES translators; semantic PMI via extended STEP [S79] (snippet) |
| SOLIDWORKS | 3D Interconnect (since 2017): open Creo, Inventor, NX, Solid Edge and CATIA V5 natively, keep or break the link, and refresh on source change; no feature tree imported [S60] (snippet) |
| NX | JT as a strong neutral/visualization format; synchronous modeling edits imported data [R03] |
| Inventor | AnyCAD: reference non-native files (CATIA V5, Creo, NX, SOLIDWORKS, STEP, DWG) without conversion; local edits stored at assembly level [S61, S62] (snippet) |
| Creo | Creo Unite: direct open, convert-on-demand and automatic update for Inventor, CATIA, Creo Elements/Direct, NX and SOLIDWORKS; collaboration licences needed [R08, S84, S85] |

**Functional requirements**
- CAP-IO-01: Import/export STEP AP203/AP214/AP242, IGES, STL, OBJ, glTF; export DXF for 2D.
- CAP-IO-02: An imported body is a "base feature" with no history, editable via direct modeling (CAP-DM-05).
- CAP-IO-03: Reference-import mode: keep a link to the source file and its revision, and offer re-import with reference re-mapping.
- CAP-IO-04: Import diagnostics run automatically (see §23).
- CAP-IO-05: Native proprietary formats are out of scope unless licensed SDKs are adopted. Note it as a gap.

**Workflow:** drag a STEP file in; review the diagnostics; place it in an assembly or edit it directly.

**Challenges:** OCCT's STEP/IGES readers are good but heavy in WASM bundle size, so use custom builds [S25] (snippet). Assembly-structure mapping to platform components; colour/name/PMI retention.

**Priority / phase:** P1 for STEP import/export in Phase 2 (essential for demos with real parts); full interoperability in Phase 5.

## 20. Design automation

| System | Implementation |
|---|---|
| CATIA | Knowledgeware / Knowledge Advisor: parameters, formulas, rules, checks, reactions, design tables; PowerCopy / UDF and Product Knowledge Template (bg; UDF mentioned in job listings [S21]) [S10, S11, S12] (snippet) |
| SOLIDWORKS | Equations, global variables, Design Tables; DriveWorksXpress (bg) |
| NX | Expressions; Knowledge Fusion (KBE language, adoption of interactive objects into KF rules); Feature and Product Templates [S34, S86, S87] (snippet) |
| Inventor | iLogic: VB.NET rules embedded in documents, triggered by parameter changes or events; drag-and-drop forms; external rules [R04] |
| Creo | Relations and parameters, Family Tables, UDFs; Behavioral Modeling (bg) |

**Functional requirements**
- CAP-DA-01: Expressions with units, conditionals and functions (safe evaluator, no arbitrary code).
- CAP-DA-02: Rules: declarative conditions that set parameters or suppression, triggered on change, deterministic and ordered.
- CAP-DA-03: Checks: boolean conditions that report pass/fail (design standards), visible in the tree.
- CAP-DA-04: Forms: generated parameter UIs from a schema, using design-system components.
- CAP-DA-05: Reusable feature templates (UDF/PowerCopy) with input reference mapping.
- CAP-DA-06: Rules execute only through registered operations so that user and AI paths share validation (repository AI policy).

**Workflow:** define parameters; write a rule ("if length > 500 then rib count = 3"); create a form; end users drive variants from the form.

**Challenges:** sandboxing user code in the browser (avoid eval; use a typed expression DSL); rule ordering and loops; debugging UX.

**Priority / phase:** P1, Phase 2 (expressions and checks); Phase 4 (rules, forms, templates).

## 21. CAD APIs and scripting

| System | Implementation |
|---|---|
| CATIA | V5 Automation (VBA / CATScript, COM); CAA-RADE C++ component APIs (more than 2500 APIs claimed for V5); EKL in V5/V6/3DEXPERIENCE; automation architecture differs between V5 and 3DEXPERIENCE [S21, S22, S23] (snippet) |
| SOLIDWORKS | COM API (VBA macros, VB.NET/C# add-ins); persistent reference IDs [S68] (snippet); macro recording (bg) |
| NX | NX Open in C++, .NET (C#/VB), Java and Python; journal recording in those languages [S17] (snippet) |
| Inventor | COM Automation object model (Application root, collections, base/derived classes); access via VBA, add-ins, standalone EXE and Apprentice Server (read-only, no UI); iLogic [R09, R04] |
| Creo | Creo TOOLKIT (C, most low-level, feature creation; licensed); free PFC APIs J-Link (Java), Web.Link (JavaScript), VB API with limited functionality (forum: cannot create new features directly, use UDFs); Object TOOLKIT C++/Java; Creo.JS [S18, S19, S20] (snippet) |

**Observed API styles:**
1. COM object models mirroring the UI tree (SOLIDWORKS, Inventor, CATIA V5).
2. "Builder" pattern: create a builder, set properties, commit (NX Open, e.g. `FlatPatternBuilder` [S47]) (snippet).
3. Journal/macro recording that emits replayable code (NX, SOLIDWORKS).
4. Tiered APIs: free high-level versus licensed low-level (Creo).
5. Embedded rule languages in documents (iLogic, EKL, Knowledge Fusion).

**Functional requirements**
- CAP-API-01: A public TypeScript API over the feature graph using the builder pattern (create, set, validate, commit), with the same validation as the UI.
- CAP-API-02: Every UI command maps to a typed, discoverable operation (repository AI-capability rule). Command history is recordable as a script (journal).
- CAP-API-03: Persistent references in the API are opaque serialized names (like Inventor reference keys) with an explicit bind/resolve call that can return multiple candidates.
- CAP-API-04: Headless execution (worker or server) for batch jobs.
- CAP-API-05: Version the API with the SDK semver. Breaking changes need migration notes.

**Workflow:** record a journal of interactive steps; edit the script parameters; run it headless to create variants.

**Challenges:** API stability while the core evolves; sandboxing; transaction semantics mapped onto `submitChanges` atomic batches.

**Priority / phase:** P1, Phase 1 (internal operation layer, since the UI is built on it); Phase 4/5 (public scripting).

## 22. Revision and dependency management

| System | Implementation |
|---|---|
| CATIA | ENOVIA / 3DEXPERIENCE platform (revisions, change); Publications for controlled links [S37] (snippet) |
| SOLIDWORKS | SOLIDWORKS PDM (vault, check-in/out, revision history, Where Used and Contains tabs) [S80] (snippet) |
| NX | Teamcenter integration (bg) |
| Inventor | Autodesk Vault (bg) |
| Creo | Windchill (vaulting, revision control, relationship updates) [S81] (snippet); Reference Viewer (bg) |

**Functional requirements**
- CAP-RV-01: Every CAD document and its features belong to the platform repository revision model. Edits carry their base revision; stale edits are rejected.
- CAP-RV-02: Where-used and contains queries across parts, assemblies, drawings and skeleton links.
- CAP-RV-03: Inter-document references pin an exact revision or deliberately follow latest (platform rule). The UI shows out-of-date links.
- CAP-RV-04: Derived outputs (meshes, drawings, STEP exports) are immutable artifacts with input revisions.
- CAP-RV-05: Compare two revisions (parameter diff, feature diff, geometric diff overlay).

**Workflow:** check that a part is up to date; edit it (a new working revision); the assembly shows the component out of date; update and save a baseline.

**Challenges:** fine-grained (feature-level) versus document-level revisions; performance of where-used across large graphs. The platform already provides revisions and baselines (SDK `^1.1.0`).

**Priority / phase:** P0, Phase 1 for document revisions (reuse the platform); Phase 3 for cross-document links.

## 23. Geometry healing and repair

| System | Implementation |
|---|---|
| CATIA | Healing Assistant workbench (bg; no source found) |
| SOLIDWORKS | Import Diagnostics (Attempt to Heal All faces/gaps), effective only before features are added [S63] (snippet) |
| NX | Optimize Face / healing tools (bg; no source found) |
| Inventor | Repair environment for imported bodies (bg) |
| Creo | Import DataDoctor: Repair, Match, Close (gaps, slivers), Replace (edges), Troubleshooter diagnostics by severity, automatic heal options in import profile [S90, S91] (snippet) |

**Functional requirements**
- CAP-HL-01: Diagnostics on import: invalid faces, gaps, open shells, sliver faces, short edges, self-intersections, with severity.
- CAP-HL-02: Automatic healing: sew with tolerance, fix small edges/faces, unify same-domain faces, rebuild solid.
- CAP-HL-03: Manual tools: delete-and-fill face, replace edge, close gaps.
- CAP-HL-04: Healing operations are recorded as features on the base body.

**Workflow:** import; review the diagnostics list (sorted by severity); run auto-heal; fix residual issues manually; convert to a solid.

**Challenges:** OCCT `ShapeFix`, `ShapeUpgrade` and `ShapeAnalysis` provide a solid baseline (bg). Tolerance handling and worst-case runtimes in the worker need cancellation.

**Priority / phase:** P1, Phase 5 (with interoperability); basic `ShapeFix` on import in Phase 2.

## 24. Performance and scalability

| System | Implementation |
|---|---|
| CATIA | Visualization-mode loading with CGR cache [S72] (snippet) |
| SOLIDWORKS | Lightweight / Large Assembly Mode / Large Design Review / SpeedPak; avoid unnecessary helical threads; save files to the current version [R06] |
| NX | Partial and lightweight loading [S70] (snippet). Siemens: display tasks and loading parallelize; parametric feature updates are order-dependent and hard to multithread, so it recommends segmentation [R10] |
| Inventor | Express mode, Model States, Simplify [S73] (snippet). Autodesk: history-based operations "must be performed serially"; import, mass properties, rendering parallelize [R10] |
| Creo | Simplified reps, Shrinkwrap [S07] (snippet); core regeneration is sequential, threads used for shading and NC [S92] (snippet) |

**Functional requirements**
- CAP-PF-01: Regeneration runs off the main thread (worker). The UI stays responsive, and every long operation is cancellable.
- CAP-PF-02: Incremental regeneration: only features downstream of a change. Cache B-rep and tessellation per feature result, keyed by input hash.
- CAP-PF-03: Parallelize independent work: per-body or per-part regeneration across a worker pool, tessellation, HLR, mass properties. Do not expect to parallelize a single history chain.
- CAP-PF-04: Performance budgets: sketch drag at 60 fps, single-feature edit under 1 s for typical parts, first display of a 1,000-part assembly from cache under 5 s (targets to validate).
- CAP-PF-05: Telemetry: per-feature regeneration time shown in the tree (a "feature statistics" view).

**Workflow:** the user edits a dimension; preview shows quickly on the main thread; the worker regenerates downstream features; tessellation streams back.

**Challenges:**
- WASM memory limits and copying B-rep between workers. Each worker needs its own OCCT instance and shape serialization (BRep text/binary) (bg).
- OpenCascade.js exception handling via Emscripten adds size and overhead [S25] (snippet).
- Kernel startup time and bundle size need custom builds.

**Priority / phase:** P0 architecture in Phase 1 (worker, cache, cancellation); scaling in Phase 6.

---

## Summary matrix (capability x system)

Cells are short labels; confidence follows the sections above.

| Capability | CATIA | SOLIDWORKS | NX | Inventor | Creo |
|---|---|---|---|---|---|
| Part modeling | Part Design, Bodies + Geom. Sets | FeatureManager parts | Modeling app, Part Navigator | .ipt browser | Part mode, Model Tree |
| Sketching | Sketcher | Sketch, relations, status colours, SketchXpert | Sketch (D-Cubed lineage) | 2D sketch, constraints | Sketcher, weak/strong dims (bg) |
| Parametric features | Ordered features + Knowledgeware | History + equations | History mode + expressions | Features + parameters + iLogic | Regenerating features + relations |
| Direct modeling | Live Shape (bg) | Move Face / Instant3D (history-based) | Synchronous Modeling | Direct Edit (bg) | Flexible Modeling (recorded as features) |
| Surface modeling | Generative Shape Design | Surface features (bg) | Surfacing (bg) | Surfaces + Freeform | Quilts + Style |
| Solid modeling | Part Design + body Booleans | Boss/cut, Combine | Feature modeling | Standard features | Standard features, multibody |
| Assembly | Assembly Design (bg) | Mates | Assembly constraints, ref sets | Constraints/joints | Placement constraints |
| Large assembly | CGR cache / visualization mode | Lightweight, LAM, LDR, SpeedPak | Partial + lightweight load | Model States, Simplify, Express | Simplified reps, Shrinkwrap |
| Configurations | Design Tables | Configurations + Design Tables | Part families (bg), templates | iParts/iAssemblies, Model States | Family Tables |
| Top-down | Skeleton + Publications | In-context references | WAVE Geometry Linker | Derive/adaptive (bg) | Skeleton, Copy/Publish Geometry |
| Sheet metal | Generative Sheetmetal Design | Sheet metal + cut lists | NX Sheet Metal, Flat Pattern | Sheet metal, Flat Pattern | Sheetmetal, flat states |
| Weldments/structures | Structure Design | Weldments + cut lists | Structure Designer (bg) | Frame Generator + Content Center | AFX (bg) |
| Freeform | ICEM Shape Design, Imagine & Shape (bg) | Freeform (bg) | Realize Shape (SubD) | T-spline Freeform | Style/ISDX, Freestyle |
| Multi-body | Multiple Bodies + Booleans | Multibody parts | Multiple bodies (bg) | Multi-body + Make Components | Multibody (7.0+) |
| Reference geometry | Wireframe/datums (bg) | Reference geometry (bg) | Datums/CSYS (bg) | Work features (bg) | Datums (bg) |
| GD&T | FT&A | DimXpert / MBD | PMI + PMI Advisor | Tolerance Feature + Advisor | GD&T Advisor |
| MBD | FT&A views, semantic STEP | SOLIDWORKS MBD, STEP 242, 3D PDF | PMI, inherit to drawing | 3D annotations, tolerance analysis | Creo MBD, AP242 |
| Drawings | Generative Drafting | Drawings, model items | Drafting, PMI inheritance | Drawings, shared MBD views | Drawing mode (bg) |
| Interoperability | STEP/IGES, semantic PMI | 3D Interconnect | JT, edits imported data | AnyCAD | Creo Unite |
| Design automation | Knowledgeware, PKT (bg) | Equations, Design Tables | Knowledge Fusion, templates | iLogic | Relations, UDFs, Family Tables |
| APIs | Automation (COM), CAA C++, EKL | COM API, macros | NX Open (C++/.NET/Java/Python), journals | COM API, Apprentice, iLogic | TOOLKIT C, J-Link, Web.Link, OTK |
| Revision/dependency | ENOVIA / 3DEXPERIENCE | SOLIDWORKS PDM | Teamcenter (bg) | Vault (bg) | Windchill |
| Healing | Healing Assistant (bg) | Import Diagnostics | Optimize Face (bg) | Repair env. (bg) | Import DataDoctor |
| Performance | Cache, visualization mode | Lightweight modes; serial history | Partial load; serial feature updates | Express; serial history | Simplified reps; serial regen |

## Recommended capability roadmap

**Phase 1: parametric foundation**
1. Worker-hosted OCCT/WASM kernel service with a cancellable job protocol and B-rep/tessellation caching (CAP-PF-01, PF-02).
2. Feature graph, parameters and expressions, and a persistent naming scheme v1 (CAP-FP-01..04, CAP-DA-01).
3. Sketcher with 2D constraint solver and DOF feedback (CAP-SK-01..04, 06).
4. Reference geometry (CAP-RG-01..03).
5. Core solids: extrude, revolve, boolean, fillet, chamfer (CAP-SO-01, 03 partial, 05).
6. Document revisions on the platform repository; internal typed operation layer (CAP-RV-01, CAP-API-01..02).

**Phase 2: professional part modeling**
1. Sweep, loft, shell, draft, holes, patterns, mirror (CAP-SO-02..04).
2. Multi-body parts (CAP-MB-01..02).
3. Part variants / configuration table (CAP-CF-01..02).
4. Naming repair UI, reorder, rollback (CAP-FP-03, 05).
5. STEP import/export with basic ShapeFix (CAP-IO-01 partial, CAP-HL-02 partial).
6. Checks and expression functions (CAP-DA-03).

**Phase 3: assemblies**
1. Assembly document, 3D constraint/joint solver, DOF feedback (CAP-AS-01..04).
2. Component identity linked to platform physical components (CAP-AS-06).
3. Interference, exploded views (CAP-AS-05).
4. Skeleton/publication top-down links with revision-pinned references (CAP-TD-01..04, CAP-RV-02..03).
5. Assembly variants (CAP-CF-03); load-level contract designed (CAP-LA-01).

**Phase 4: surfacing, direct modeling, drawings, specialized**
1. 2D drawings with HLR, views, dimensions, BOM, PDF/DXF (CAP-DR-01..05).
2. Hybrid direct edits recorded as features (CAP-DM-01..05).
3. Surface modeling and analysis (CAP-SU-01..04).
4. Sheet metal with flat pattern (CAP-SM-01..04).
5. GD&T and MBD authoring (CAP-GD-01..04, CAP-MBD-01, 03, 04).
6. Rules, forms, feature templates (CAP-DA-02, 04, 05); weldments (CAP-WS); freeform last (CAP-FS).

**Phase 5: interoperability**
1. Full neutral-format coverage, assembly structure mapping and reference import (CAP-IO-01..04).
2. Healing workbench (CAP-HL-01..04).
3. STEP AP242 semantic PMI (CAP-MBD-02).
4. Public scripting API and journals (CAP-API-03..05).

**Phase 6: scalability**
1. Lightweight / partial loading, simplified representations, envelopes (CAP-LA-01..05).
2. Worker pool parallelism per body or part (CAP-PF-03).
3. Performance budgets and telemetry (CAP-PF-04..05).
4. Revision compare (CAP-RV-05).

## Interaction-pattern observations

These are described in our own words from public descriptions and general familiarity. No proprietary UI assets are reproduced.

1. **Feature tree as the spine.** All five systems centre editing on an ordered tree of features (FeatureManager, Model Tree, Part Navigator, browser, specification tree).
   - Common affordances: a rollback bar or insert marker, suppression toggles, failure icons on the feature that broke, and grouping into folders or bodies.
   - Lightweight/simplified states show as a distinct per-node icon state (for example a lightweight marker on SOLIDWORKS components [S02] (snippet)).
   - **Recommendation:** use the design-system tree component with explicit status chips (not colour alone) and per-node regen time.
2. **Contextual command panels instead of modal dialogs.** Feature creation typically opens a docked property panel with the reference selection lists, parameter fields, preview in the viewport and OK/cancel.
   - Selection lists show which pick is "active".
   - **Recommendation:** use one panel pattern for every feature. Each field has a help ID. Every action is also a typed operation, so assistants can drive it.
3. **Contextual toolbars near the cursor.** After a selection, a small floating toolbar offers the most likely commands for that entity type (sketch on face, edit feature, hide, measure).
   - It reduces travel to the ribbon.
   - **Recommendation:** provide it, but because repository rules forbid hover-only or right-click-only actions, every contextual command must also be reachable from the main toolbar or panel, and work by touch.
4. **Sketch dimension editing.**
   - Dimension values are edited in place by a direct click on the dimension: an inline numeric field that accepts expressions and parameter names.
   - The sketch definition state is indicated per entity (SOLIDWORKS colours [S75] (snippet)).
   - Over-definition prompts to make a dimension driven/reference.
   - **Recommendation:** inline editor with units and expression parsing, and a separate non-colour state indicator (icon plus text "2 DOF remaining").
5. **Selection filters.**
   - Toolbar toggles restrict picks to faces, edges, vertices, bodies, components, sketches or datums.
   - "Select other" cycles through overlapping candidates.
   - Intent-based selection (tangent chain, loop, feature faces) speeds up fillets and direct edits.
   - **Recommendation:** filter toggles in the viewport toolbar; a keyboard- and touch-accessible "cycle candidates" control; chain/loop expansion as explicit commands.
6. **Hybrid history plus direct editing.** The trend is consistent across leaders.
   - NX's synchronous technology runs history-free edits alongside history mode [R02].
   - Creo's Flexible Modeling records geometry edits as features and redirects references [R05, S66].
   - SOLIDWORKS adds direct-style tools as history features [S64] (snippet).
   - **Recommendation:** direct edits as recorded features (Creo style) are the most compatible with a revisioned, replayable TypeScript feature graph.
7. **Visibility of dependency state.** Out-of-date links, broken references and failed features are surfaced in the tree and in a reference viewer (Creo Reference Viewer (bg); CATIA link management [S38] (snippet)).
   - **Recommendation:** a platform-consistent "stale" badge, derived from input revisions.

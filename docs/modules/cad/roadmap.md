# CAD Modeler: development roadmap

Status: Proposed (CAD agent, 15 October 2026), refining brief §13 with the research
([competitive roadmap](../../research/cad/competitive-feature-matrix.md#recommended-capability-roadmap)).
Each phase is delivered as short sprints with demonstrable milestones; the backlog
([backlog.md](backlog.md)) orders the work.

| Phase | Outcome | Milestones | Status |
| --- | --- | --- | --- |
| 0 Research and architecture | Feature matrix, kernel decision, native format, API, licensing, roadmap, performance targets | M0.1 research reports; M0.2 ADRs 0020–0026; M0.3 specifications in this folder | **Done** (ADRs Proposed) |
| 1 Parametric foundation | Part with constrained sketches, extrude/revolve, parameters, incremental regeneration, native save/open, 3D viewport (kernel off the UI thread), STEP AP242 export, same operations for the AI | M1.1 cad-core; M1.2 OCCT kernel + worker; M1.3 tool UI; M1.4 assistant + help; M1.5 tests, browser flows, benchmarks | **Implemented on `feature/cad`**, integration review pending |
| 1b Persistence and integration | Server-side document revisions (`services/cad`), crash recovery from the log, CAD links shown in Conceptualize / Requirements / inspector, decision on replacing the mock CAD tool | M1b.1 `PlatformServices.cad` contract; M1b.2 `services/cad` with revisions; M1b.3 ArtifactRef scheme adopted; M1b.4 replacement ADR with non-destructive migration | Planned, needs coordinator decisions (CR-CAD-1…4) |
| 2 Professional part modeling | Fillet, chamfer, shell, draft, hole, sweep, loft, mirror, patterns; sketch on faces and datum planes; reference geometry; ellipses/splines/slots; constraint inference and dragging; reorder/rollback; configurations; naming with kernel history and repair; planegcs evaluation; worker-side regeneration | M2.1 dress-up features on named edges; M2.2 references and datums; M2.3 sketcher productivity; M2.4 configurations | Planned |
| 3 Assemblies | Components and instances, mates with a 3D solver, DOF analysis, interference and clearance, exploded views, BOM, links to twin components | M3.1 assembly document; M3.2 mates; M3.3 analysis tools | Planned |
| 4 Advanced modeling and drawings | Surfaces, hybrid direct editing as features, sheet metal, weldments, drawings (HLR views, sections, dimensions, PDF/DXF), GD&T/MBD | M4.1 drawings; M4.2 direct edits; M4.3 sheet metal; M4.4 MBD | Planned |
| 5 Interoperability | STEP import (base body, XCAF names/colours/assemblies, healing), IGES, STL/OBJ/3MF/glTF, 3DM, semantic PMI export; licensed paths after approval | M5.1 custom WASM build (OCCT 8, XCAF reader, IGES); M5.2 mesh formats; M5.3 PMI | Planned |
| 6 Scalability | Large assemblies, partial loading, worker pools, native desktop kernel, performance budgets in CI | | Planned |

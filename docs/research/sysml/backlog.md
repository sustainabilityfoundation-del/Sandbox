# Prioritised Feature Backlog (research-derived)

- **Priority:** P0 = required for the Phase-1/2 vertical slice; P1 = needed for credible MBSE use; P2 = advanced or enterprise; P3 = later or differentiating.
- **Phases** follow the program brief §14: 1 foundation, 2 modelling environment, 3 engineering integration, 4 advanced modelling, 5 enterprise, 6 AI-native.
- **Brief §** refers to `docs/specifications/sysml-program.md`.
- Sources: [sources.md](sources.md). This backlog is a proposal; it is not agreed scope.

| ID | Pri | Item | Acceptance hint | Brief § | Phase | Sources |
|---|---|---|---|---|---|---|
| BL-001 | P0 | TS KerML/SysML abstract-syntax core: Element, Relationship, Namespace/Membership/OwningMembership, Type/Classifier/Feature, Specialization family, definition/usage metaclasses generated from OMG `SysML.json`/XMI | Every metaclass and attribute present; derived properties computed for the core subset | §4, §5.A, §9.1 | 1 | [S-18][S-19][S-22][S-23] |
| BL-002 | P0 | Canonical KerML 10.4 JSON (de)serialiser (`@id`, `@type`, `{@id}` references, multiplicity rules) | Round-trips pilot JSON for the Release examples | §4, §11 | 1 | [S-18][S-25] |
| BL-003 | P0 | Standard library loader from Release repo tag ≥ 2026-04 (EPL-2.0, unmodified), with UUID v5 library IDs verified against the spec algorithm | All Kernel/Systems/Domain libraries load; IDs match the spec rule | §4 | 1 | [S-01][S-04][S-18][S-06] |
| BL-004 | P0 | Hand-written incremental textual parser for KerML + SysML (keyword and production tables generated from official `.kebnf`), lossless CST | 100% of Release `examples` + `training` parse; diagnostics diffed against the pilot oracle | §4, §9.2, §13 | 1 | [S-06][S-01][S-28][S-29][S-46] |
| BL-005 | P0 | Textual serialiser (pretty-printer) with formatting preservation for unchanged regions | text → model → text is stable on the corpus | §4, §11, §13 | 1 | [S-18][S-19] |
| BL-006 | P0 | Name resolution, imports, implied specialisations (to library base types) | `isImpliedIncluded` semantics; matches pilot "implied" XMI on samples | §4 | 1 | [S-18][S-01] |
| BL-007 | P0 | PostgreSQL repository on the API model: project, commit (multi-parent, immutable), data_identity, data_version (JSONB), branch, tag; one atomic `submitChanges` batch = one commit | Commit invariants of API §7.1.2 enforced by tests | §4, §9.3, §10 | 1 | [S-21] |
| BL-008 | P0 | REST subset aligned with the OMG OpenAPI: projects, branches, tags, commits (GET/POST), changes, elements, roots, relationships(`direction`), cursor pagination with `Link` headers | Contract tests generated from OMG `OpenAPI.json`; labelled "aligned", not "conformant" | §4, §11 | 1 | [S-25][S-21] |
| BL-009 | P0 | Basic well-formedness validation (metamodel constraints subset) in a worker | Validation results diffed against the pilot on fixtures | §4, §13 | 1 | [S-18][S-19][S-11] |
| BL-010 | P0 | Typed AI/model operations (create element, set property, add relationship, query) with schema discovery, dry-run and preview over BL-007 | Same operations used by UI and assistant | §6 | 1 | [S-67] (market), platform AI rules |
| BL-011 | P0 | Conformance-test harness: fixture corpus (Release ≥ 2026-04, OOSEM), pilot JVM oracle in CI, optional OpenSysML WASM differential | CI job reports pass/diff counts | §13 | 1 | [S-01][S-16][S-11][S-46][S-49] |
| BL-012 | P0 | Textual editor (Monaco/CodeMirror) with diagnostics, completion, go-to-definition, live sync with model | Edit in text and see tree/diagram update incrementally | §5.E, §9.6 | 2 | [S-56][S-37][S-45] |
| BL-013 | P0 | Model browser (Browser View semantics: membership tree, imports, filters, search) | Phone/tablet/desktop; no hover-only actions | §5.E | 2 | [S-19][S-62] |
| BL-014 | P0 | Schema-driven property inspector (from the metamodel) | Any metaclass is editable without a custom form | §5.E | 2 | [S-62] |
| BL-015 | P0 | General View and Interconnection View as projections of view usages; elkjs layout in a worker; manual positions as private view state | Diagram edits create model changes only through operations | §5.E | 2 | [S-19][S-34][S-40] |
| BL-016 | P1 | Grid View: dependency/relationship matrix and generic tables with in-cell editing | Matrix over satisfy/allocate/connect relationships | §5.C, §5.E | 2 | [S-19][S-61][S-34] |
| BL-017 | P1 | Action Flow View and State Transition View | Standard-view node/edge sets per 9.2.20 | §5.B, §5.E | 2 | [S-19][S-34] |
| BL-018 | P1 | KPAR import/export (tolerant reader: nested metadata, bad index entries; writer per KerML 10.3 with checksum) | Imports OMG and Release KPARs; exported KPAR re-imports in the pilot | §4, §11 | 2 | [S-18][S-26][S-27] |
| BL-019 | P1 | Requirements integration: SysML requirement usages reference Requirements-tool records via stable IDs and revisions (no second requirements DB) | Satisfy/verify links resolve to pinned revisions | §5.C, §8 | 3 | brief §5.C; [S-19] |
| BL-020 | P1 | CAD and Conceptualize links (`represents` to components) | Selection resolves across tools | §7, §8 | 3 | platform rules |
| BL-021 | P1 | Traceability and coverage analysis (requirements to architecture to verification), impact query | Gap report for unsatisfied requirements | §5.C | 3 | [S-56][S-61] |
| BL-022 | P1 | Quantities and units: ISQ/SI library with dimensional checking in expressions | Unit mismatch diagnostics | §5.A, §5.D | 4 | [S-06][S-07][S-46] |
| BL-023 | P1 | Expression evaluation: calculations, constraints, roll-ups; requirement constraint checks | Mass roll-up example evaluates | §5.D, §5.F | 4 | [S-56][S-46][S-01] |
| BL-024 | P1 | Query service: OMG Query (PrimitiveConstraint, CompositeConstraint) compiled to SQL; saved queries | API query endpoints pass contract tests | §4, §11 | 4 | [S-21][S-25] |
| BL-025 | P2 | Sequence View, Geometry View | | §5.B, §5.E | 4 | [S-19][S-34] |
| BL-026 | P2 | State machine and action execution (stepping, simulated time, scenario runs); descriptive and executable models clearly flagged | Executes the training state examples | §5.F | 4 | [S-18] Annex A, [S-46][S-64] |
| BL-027 | P2 | Analysis cases and trade studies (TradeStudies library) | Trade study example evaluates | §5.D | 4 | [S-06][S-56] |
| BL-028 | P2 | External solver adapters (FMI co-simulation first), as separately replaceable services | FMU run from an analysis case | §5.D, §5.F | 4 | [S-64][S-69] |
| BL-029 | P1 | Branches and tags UI; diff between commits (API `diff`) with element-level change visualisation | Diff view shows added/changed/deleted elements | §5.E, §10 | 5 | [S-21][S-25][S-56] |
| BL-030 | P1 | Semantic 3-way merge with conflict resolution producing multi-parent merge commits | API merge invariants hold | §10 | 5 | [S-21][S-60] |
| BL-031 | P2 | Concurrent editing: optimistic commits with base-commit checks, presence and change notifications | Two users editing different elements never block | §10 | 5 | [S-56][S-33] |
| BL-032 | P2 | Access control on the project permission target; audit history | Role tests | §10 | 5 | [S-21][S-56] |
| BL-033 | P2 | Large-model performance: lazy loading per namespace, indexes, virtualised views; target above 150k elements / 1k nodes per view | Benchmark suite in CI | §9, §13 | 5 | [S-33][S-46] |
| BL-034 | P2 | Review and comment workflow on commits and elements; publication (document views from view usages) | Review of a branch before merge | §10, §5.E | 5 | [S-66][S-67][S-19] |
| BL-035 | P2 | SysML v1.7 XMI import via a subset of the v1→v2 mappings; diagrams regenerated as v2 views (no direct mapping claimed) | Partial-conformance subset documented | §4, §11 | 5 | [S-20][S-76][S-56] |
| BL-036 | P3 | OSLC adapter for lifecycle links | | §11 | 5 | [S-21][S-73] |
| BL-037 | P2 | AI: architecture generation, behaviour generation, allocation proposals as branch commits with diff preview and approval | Every AI change reviewable, revertible and attributed | §6 | 6 | [S-67][S-21] |
| BL-038 | P2 | AI: inconsistency detection, impact analysis and explanation using validation, execution and query services | Explanations cite model elements | §6 | 6 | [S-46][S-67] |
| BL-039 | P3 | MCP-style external AI tool surface mirroring typed operations | Discoverable schema | §6 | 6 | [S-67][S-44] |
| BL-040 | P3 | Variant and configuration management (variation/variant usages, configuration-aware views) | | §5.A | 4 | [S-19][S-73][S-67] |
| BL-041 | P1 | Help documentation per platform help architecture (language reference, tutorials, AI command docs) | Help manifest registered | §12 | 2 | platform rules |
| BL-042 | P3 | Interop round-trip tests against Cameo SysML v2 API (needs licensed instance) | Verified round-trip before any compatibility claim | §11 | 5 | [S-56] |

## Sources
Full details are in [sources.md](sources.md). All sources accessed 2026-10-14.

| ID | URL | Title | Accessed | Access level |
|---|---|---|---|---|
| S-01 | https://github.com/Systems-Modeling/SysML-v2-Release (raw README.md, master) | SysML v2 Release README | 2026-10-14 | read in full |
| S-04 | https://github.com/Systems-Modeling/SysML-v2-Release/releases/tag/2026-04 | Release 2026-04 notes | 2026-10-14 | read partially (fetched; full notes) |
| S-06 | https://api.github.com/repos/Systems-Modeling/SysML-v2-Release/git/trees/master?recursive=1 | Release repo file tree (1,759 paths) | 2026-10-14 | read in full (listing) |
| S-07 | Raw files: `sysml.library/Kernel Libraries/Kernel Semantic Library/Base.kerml`, `sysml.library/Domain Libraries/Quantities and Units/ISQBase.sysml`, `sysml.library/Systems Library/.meta.json` | Library file headers | 2026-10-14 | read partially (first 25–30 lines each) |
| S-11 | Raw: Pilot `LICENSE`, `org.omg.sysml.plantuml/META-INF/MANIFEST.MF`, `pom.xml`; `LICENSE-GPL` returned 404 | Pilot licence and PlantUML dependency | 2026-10-14 | read partially |
| S-16 | https://github.com/Systems-Modeling/OOSEM-v2-Release/blob/HEAD/LICENSE.md | OOSEM v2 Release LICENSE | 2026-10-14 | read partially |
| S-18 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/1-Kernel_Modeling_Language.pdf | Kernel Modeling Language (KerML) v1.1 Beta 2 (Release 2026-07) | 2026-10-14 | read partially (Cl. 2 Conformance, 3, 6.1 Architecture, 8.3 TOC and metaclass descriptions for Element, Relationship, Membership, OwningMembership, FeatureMembership, Namespace, Type, Classifier, Feature, Specialization, Subclassification, Subsetting, FeatureTyping, Conjugation; 9.1 library UUID rule; Cl. 10 Model Interchange in full; Annex A start) |
| S-19 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/2a-OMG_Systems_Modeling_Language.pdf | OMG SysML v2.1 Beta 2, Part 1: Language Specification | 2026-10-14 | read partially (TOC, Cl. 2 Conformance, 3, 7.26 Views and Viewpoints, 8.2.3 graphical notation intro, 9.2.20 Standard View Definitions) |
| S-20 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/2b-SysML_v1_to_v2_Transformation.pdf | OMG SysML v2.1 Beta 2, Part 2: SysML v1 to SysML v2 Transformation | 2026-10-14 | read partially (TOC, Cl. 1 Scope, 2 Conformance, 3, 6 Mapping Approach; keyword search for "diagram") |
| S-21 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/3-Systems_Modeling_API_and_Services.pdf | Systems Modeling API and Services v1.1 Beta 2 | 2026-10-14 | read partially (front-matter licence, Cl. 2 Conformance, 3, 7.1 API Model, 8.1 REST/HTTP PSM incl. Tables 9–10 and pagination, 8.2 media types, Annex B.1 examples) |
| S-22 | https://www.omg.org/spec/SysML/2.0 | OMG SysML 2.0 spec page | 2026-10-14 | read partially (fetched) |
| S-23 | https://www.omg.org/spec/KerML/1.0 | KerML 1.0 spec page | 2026-10-14 | read partially (fetched) |
| S-25 | https://www.omg.org/spec/SystemsModelingAPI/20250201/OpenAPI.json | Systems Modeling API and Services REST/HTTP PSM, OpenAPI 3.1, version 1.0 | 2026-10-14 | read in full (machine-parsed: all paths, verbs, operationIds, parameters, media types, key schemas) |
| S-26 | https://www.omg.org/spec/SysML/20250201/Systems-Library.kpar and https://www.omg.org/spec/KerML/20250201/Semantic-Library.kpar | Normative library KPARs (Systems Library 2.0.0, Kernel Semantic Library 1.0.0) | 2026-10-14 | read partially (archive listing, .project.json, .meta.json, one library file) |
| S-27 | Raw: `sysml.library.kpar/SysML_Quantities_and_Units_Library-2.1.0-dev.20260801.kpar` (.project.json) | Release-repo KPAR metadata | 2026-10-14 | read partially |
| S-28 | https://github.com/sensmetry/sysml-2ls (README, LICENSE, API metadata, `packages/syside-languageserver/package.json`) | SysIDE Editor Legacy (sysml-2ls) | 2026-10-14 | read partially (README, LICENSE header, package.json dependencies) |
| S-29 | https://sensmetry.com/syside-editor-rebirth-sysml-v2-0-50x-speed-up-license-change-free-as-before/ | "Syside Editor rebirth: SysML v2.0, 50x speed-up, licence change" | 2026-10-14 | read partially (fetched) |
| S-33 | SysON repo docs: `doc/content/modules/developer-guide/pages/api/api.adoc`, `api-details.adoc`; `user-manual/pages/features/collaboration.adoc`, `import-export-textual.adoc`, `scaling-limits.adoc`, `validation.adoc` | SysON documentation sources | 2026-10-14 | read partially (first ~45 lines each) |
| S-34 | https://doc.mbse-syson.org/syson/main/user-manual/features/sysmlv2-overview.html | SysON SysML v2 overview | 2026-10-14 | read partially (fetched) |
| S-37 | https://github.com/eclipse-langium/langium (README), https://registry.npmjs.org/langium | Eclipse Langium | 2026-10-14 | read partially (README, npm metadata) |
| S-40 | https://github.com/kieler/elkjs (LICENSE.md), npm `elkjs` | elkjs (ELK layout for JS) | 2026-10-14 | read partially (LICENSE, metadata) |
| S-44 | https://github.com/daltskin/sysml-v2-lsp (README, metadata) | sysml-v2-lsp | 2026-10-14 | read partially |
| S-45 | https://github.com/Open-MBEE/tree-sitter-sysml (README); npm `tree-sitter-sysml` (gitlab.com/nomograph) | tree-sitter grammars for KerML/SysML | 2026-10-14 | read partially |
| S-46 | https://github.com/Open-MBEE/OpenSysML (README) | OpenSysML REDK | 2026-10-14 | read partially (intro sections) |
| S-49 | https://github.com/Open-MBEE/sysmlv2-testing (README) | sysmlv2-testing ledger | 2026-10-14 | read partially |
| S-56 | https://docs.nomagic.com/SYSML2P/2026x-refresh1/catia-magic-cameo-sysml-v2-solution-312246433.html | CATIA Magic / Cameo SysML v2 solution | 2026-10-14 | read partially (fetched) |
| S-60 | Search: TWC merging and element locking (MagicDraw/TWC 19.0–2022x docs) | TWC merge and lock | 2026-10-14 | search summary only |
| S-61 | Search: MagicDraw 2024x dependency matrix / generic table | MagicDraw analysis diagrams | 2026-10-14 | search summary only |
| S-62 | Search: MagicDraw active validation | MagicDraw validation | 2026-10-14 | search summary only |
| S-64 | Search: Cameo Simulation Toolkit 2024x FMI / Simulink | CST co-simulation | 2026-10-14 | search summary only |
| S-66 | Search: Cameo Collaborator for TWC | Cameo Collaborator | 2026-10-14 | search summary only |
| S-67 | https://www.ibm.com/new/announcements/scaling-sysml-v2-systems-engineering-with-ibm-rhapsody-systems-engineering-v1-8 | IBM Rhapsody Systems Engineering 1.8 announcement | 2026-10-14 | read partially (fetched) |
| S-69 | Search: IBM Rhapsody (classic) simulation / Java API | Rhapsody (Systems Design) | 2026-10-14 | search summary only |
| S-73 | Search: PTC Modeler SysML v2 (PTC community, PTC blogs) | PTC Modeler 10.2/10.3 | 2026-10-14 | search summary only |
| S-76 | Search: XMI interchange problems (OMG MIWG wiki, ICSEA 2015 Zusāne et al., Brambilla blog) | Model interchange issues | 2026-10-14 | search summary only |

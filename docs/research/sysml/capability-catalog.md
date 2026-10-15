# MBSE Capability Catalog

Priority: **Essential** (needed for credible MBSE use), **Advanced** (expected by power users and enterprises), **Differentiator** (where an AI-native web tool can lead). "Who has it" uses the column codes from [tool-benchmark.md](tool-benchmark.md). V/A tags follow that file. Sources: [sources.md](sources.md).

## Structure
| ID | Capability | Definition | Who has it (evidence) | Priority |
|---|---|---|---|---|
| CAP-ST-01 | KerML/SysML abstract syntax core | CRUD on all metaclasses with well-formedness validation (Abstract Syntax Conformance) [S-18][S-19] | CSM v2 [S-56] V, RSE [S-67] V, SON [S-31] V, pilot [S-08] V | Essential |
| CAP-ST-02 | Definition/usage modelling | Part/attribute/port/item/connection/interface/allocation defs and usages, specialisation, subsetting, redefinition [S-19] | CSM, RSE, SON (V via S-56/S-67/S-34) | Essential |
| CAP-ST-03 | Containment / membership browser | Tree over OwningMembership, with imports and aliases visible (Browser View) [S-18][S-19] | All (see benchmark) | Essential |
| CAP-ST-04 | Standard library resolution | Load Kernel/Systems/domain libraries; name resolution; UUID v5 library IDs [S-18] | CSM, SON, pilot (V) | Essential |
| CAP-ST-05 | Variability (variation/variant) | SysML v2 variation points (7.6.7) [S-19]; product-line integration | PTC [S-73] A, RSE PLE early access [S-67] V | Advanced |

## Behavior
| ID | Capability | Definition | Who has it | Priority |
|---|---|---|---|---|
| CAP-BH-01 | Actions and action flows | Action defs/usages, successions, control nodes, flows [S-19] 7.17 | CSM, RSE, SON (Action Flow View [S-34] V) | Essential |
| CAP-BH-02 | States and transitions | State defs/usages, transitions, triggers [S-19] 7.18 | CSM, RSE, SON (State Transition View [S-34] V) | Essential |
| CAP-BH-03 | Interactions / sequences | Event occurrences, messages, Sequence View [S-19] | SON [S-34] V, CSM A0 | Advanced |
| CAP-BH-04 | Use cases | Use case defs/usages [S-19] 7.25 | CSM, SON A0 | Advanced |

## Requirements and verification
| ID | Capability | Definition | Who has it | Priority |
|---|---|---|---|---|
| CAP-RQ-01 | Requirement defs/usages with constraints | Requirements as constraint-bearing elements; satisfy/verify [S-19] 7.21 | CSM, RSE, SON | Essential |
| CAP-RQ-02 | Traceability across tools | Links to the platform Requirements tool, DOORS/Polarion via OSLC | PTC OSLC [S-73] A, SIE Requirement VP [S-74] A | Essential (internal link) / Advanced (OSLC) |
| CAP-RQ-03 | Verification cases | Verification case defs, objectives, verdicts [S-19] 7.24 | CSM evaluation [S-56] V | Advanced |
| CAP-RQ-04 | Requirement evaluation | Automatic check of requirement constraints against values | CSM [S-56] V, OpenSysML [S-46] V | Differentiator |
| CAP-RQ-05 | ReqIF exchange | ReqIF import/export | Unverified for all tools | Advanced |

## Parametrics and analysis
| ID | Capability | Definition | Who has it | Priority |
|---|---|---|---|---|
| CAP-PA-01 | Quantities and units | ISQ/SI library, dimensional checking [S-06][S-07] | CSM A0, OpenSysML (units carried and checked) [S-46] V | Essential |
| CAP-PA-02 | Calculations and constraints evaluation | Evaluate calc/constraint expressions, roll-ups | CSM [S-56] V | Advanced |
| CAP-PA-03 | Analysis cases / trade studies | Analysis case defs, TradeStudies library [S-06] | CSM [S-56] V | Advanced |
| CAP-PA-04 | External solver coupling | FMI co-simulation, Simulink, Modelica | CST [S-64] A, RHP [S-69] A | Advanced |

## Views and visualisation
| ID | Capability | Definition | Who has it | Priority |
|---|---|---|---|---|
| CAP-VW-01 | Standard views as projections | General, Interconnection, Action Flow, State Transition, Sequence, Grid, Browser, Geometry [S-19] | SON (all) [S-34] V, CSM [S-56] V | Essential (GV, IV, AFV, STV, BV) / Advanced (SV, GrV, GeV) |
| CAP-VW-02 | Textual notation editor with live sync | Text ↔ model ↔ diagram synchronisation | CSM [S-56] V, RSE [S-68] A | Essential |
| CAP-VW-03 | Matrices and tables | Dependency matrix, generic table (Grid View) | CSM [S-61] A, SON Grid [S-34] V | Essential |
| CAP-VW-04 | Auto layout with manual override | Layered/orthogonal layout with ports, persisted manual positions | (implementation choice: elkjs [S-40]) | Essential |
| CAP-VW-05 | User-defined views and viewpoints | View defs with expose/filter/render; document composition [S-19] 7.26 | CSM (query-generated views) [S-56] V | Advanced |
| CAP-VW-06 | Relation map / impact graph | Interactive exploration of relationships | CSM [S-63] A | Advanced |

## Execution and simulation
| ID | Capability | Definition | Who has it | Priority |
|---|---|---|---|---|
| CAP-EX-01 | Static evaluation | Expression evaluation without changing the model | CSM Evaluation Console [S-56] V | Advanced |
| CAP-EX-02 | State machine / action execution | Stepping behaviour on a clock | CST A0, RHP [S-69] A, OpenSysML [S-46] V | Advanced |
| CAP-EX-03 | Instance materialisation | KerML Annex A style instantiation [S-18] | OpenSysML [S-46] V | Differentiator |

## Collaboration and lifecycle
| ID | Capability | Definition | Who has it | Priority |
|---|---|---|---|---|
| CAP-CO-01 | Commit history (immutable commits) | API-aligned commits, DataVersions [S-21] | TWC (own model) [S-56] V; SON N [S-33] V | Essential |
| CAP-CO-02 | Branches, tags, baselines | Branch heads, immutable tags [S-21] | TWC [S-56] V | Essential |
| CAP-CO-03 | Semantic diff and 3-way merge | Element-level diff, conflict resolution, merge commits with multiple parents [S-21] | TWC/CSM [S-60] A | Advanced |
| CAP-CO-04 | Concurrent editing | Lock-free or locking concurrency | TWC lock-free [S-56] V, SON shared [S-33] V | Advanced |
| CAP-CO-05 | Review and comments | Web review, comments on elements and diagrams | CC [S-66] A, RSE [S-67] V | Advanced |
| CAP-CO-06 | Access control | Project-level permission targets [S-21], RBAC, markings | TWC [S-56] V | Advanced (Enterprise) |

## Interchange
| ID | Capability | Definition | Who has it | Priority |
|---|---|---|---|---|
| CAP-IX-01 | KPAR import/export | Minimum Model Interchange Conformance [S-18][S-19] | Pilot/release KPARs [S-06] V | Essential |
| CAP-IX-02 | Standard JSON (`@id`/`@type`) | KerML 10.4 JSON [S-18] | API pilot [S-12] V, SON JSON [S-33] V | Essential |
| CAP-IX-03 | SysML v2 REST API (aligned subset) | Projects/commits/branches/tags/elements/queries [S-25] | CSM claim [S-56] V, SON partial [S-33] V | Essential |
| CAP-IX-04 | SysML v1 import (XMI) via the transformation spec | [S-20] | CSM [S-56] V | Advanced |
| CAP-IX-05 | OSLC | Lifecycle linking | PTC [S-73] A | Advanced |

## Extensibility and AI
| ID | Capability | Definition | Who has it | Priority |
|---|---|---|---|---|
| CAP-AI-01 | Typed model operations for AI | Assistant acts through registered, validated operations | RSE MCP API [S-67] V | Differentiator |
| CAP-AI-02 | AI model generation / refactoring with preview | Text-to-model proposals as reviewable commits | none verified | Differentiator |
| CAP-AI-03 | AI explanation / impact analysis | Model-aware Q&A, change impact | RSE [S-67] V | Differentiator |
| CAP-AI-04 | Metadata-based extension | Metadata defs and user libraries [S-19] 7.27 | SON user libraries [S-35] A | Advanced |
| CAP-AI-05 | Scripting API | JS/TS SDK over the semantic core | CSM macros [S-65] A, EA [S-72] A | Advanced |

## Sources
Full details are in [sources.md](sources.md). All sources accessed 2026-10-14.

| ID | URL | Title | Accessed | Access level |
|---|---|---|---|---|
| S-06 | https://api.github.com/repos/Systems-Modeling/SysML-v2-Release/git/trees/master?recursive=1 | Release repo file tree (1,759 paths) | 2026-10-14 | read in full (listing) |
| S-07 | Raw files: `sysml.library/Kernel Libraries/Kernel Semantic Library/Base.kerml`, `sysml.library/Domain Libraries/Quantities and Units/ISQBase.sysml`, `sysml.library/Systems Library/.meta.json` | Library file headers | 2026-10-14 | read partially (first 25–30 lines each) |
| S-08 | https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation (README.adoc raw, root listing) | Pilot Implementation README | 2026-10-14 | read partially (licence line, install, copyright header template) |
| S-12 | https://github.com/Systems-Modeling/SysML-v2-API-Services (README, LICENSE) | API Services pilot | 2026-10-14 | read partially (fetched README; raw LICENSE heading) |
| S-18 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/1-Kernel_Modeling_Language.pdf | Kernel Modeling Language (KerML) v1.1 Beta 2 (Release 2026-07) | 2026-10-14 | read partially (Cl. 2 Conformance, 3, 6.1 Architecture, 8.3 TOC and metaclass descriptions for Element, Relationship, Membership, OwningMembership, FeatureMembership, Namespace, Type, Classifier, Feature, Specialization, Subclassification, Subsetting, FeatureTyping, Conjugation; 9.1 library UUID rule; Cl. 10 Model Interchange in full; Annex A start) |
| S-19 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/2a-OMG_Systems_Modeling_Language.pdf | OMG SysML v2.1 Beta 2, Part 1: Language Specification | 2026-10-14 | read partially (TOC, Cl. 2 Conformance, 3, 7.26 Views and Viewpoints, 8.2.3 graphical notation intro, 9.2.20 Standard View Definitions) |
| S-20 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/2b-SysML_v1_to_v2_Transformation.pdf | OMG SysML v2.1 Beta 2, Part 2: SysML v1 to SysML v2 Transformation | 2026-10-14 | read partially (TOC, Cl. 1 Scope, 2 Conformance, 3, 6 Mapping Approach; keyword search for "diagram") |
| S-21 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/3-Systems_Modeling_API_and_Services.pdf | Systems Modeling API and Services v1.1 Beta 2 | 2026-10-14 | read partially (front-matter licence, Cl. 2 Conformance, 3, 7.1 API Model, 8.1 REST/HTTP PSM incl. Tables 9–10 and pagination, 8.2 media types, Annex B.1 examples) |
| S-25 | https://www.omg.org/spec/SystemsModelingAPI/20250201/OpenAPI.json | Systems Modeling API and Services REST/HTTP PSM, OpenAPI 3.1, version 1.0 | 2026-10-14 | read in full (machine-parsed: all paths, verbs, operationIds, parameters, media types, key schemas) |
| S-31 | https://github.com/eclipse-syson/syson (README.md, NOTICE, LICENSE-LGPL, recursive tree, API metadata) | Eclipse SysON | 2026-10-14 | read partially |
| S-33 | SysON repo docs: `doc/content/modules/developer-guide/pages/api/api.adoc`, `api-details.adoc`; `user-manual/pages/features/collaboration.adoc`, `import-export-textual.adoc`, `scaling-limits.adoc`, `validation.adoc` | SysON documentation sources | 2026-10-14 | read partially (first ~45 lines each) |
| S-34 | https://doc.mbse-syson.org/syson/main/user-manual/features/sysmlv2-overview.html | SysON SysML v2 overview | 2026-10-14 | read partially (fetched) |
| S-35 | https://blog.obeosoft.com/stability-and-usability-with-syson-2026-3 (and related release notes) | SysON 2026.3 release blog | 2026-10-14 | search summary only |
| S-40 | https://github.com/kieler/elkjs (LICENSE.md), npm `elkjs` | elkjs (ELK layout for JS) | 2026-10-14 | read partially (LICENSE, metadata) |
| S-46 | https://github.com/Open-MBEE/OpenSysML (README) | OpenSysML REDK | 2026-10-14 | read partially (intro sections) |
| S-56 | https://docs.nomagic.com/SYSML2P/2026x-refresh1/catia-magic-cameo-sysml-v2-solution-312246433.html | CATIA Magic / Cameo SysML v2 solution | 2026-10-14 | read partially (fetched) |
| S-60 | Search: TWC merging and element locking (MagicDraw/TWC 19.0–2022x docs) | TWC merge and lock | 2026-10-14 | search summary only |
| S-61 | Search: MagicDraw 2024x dependency matrix / generic table | MagicDraw analysis diagrams | 2026-10-14 | search summary only |
| S-63 | Search: MagicDraw smart manipulator / relation map | MagicDraw diagram UX | 2026-10-14 | search summary only |
| S-64 | Search: Cameo Simulation Toolkit 2024x FMI / Simulink | CST co-simulation | 2026-10-14 | search summary only |
| S-65 | Search: MagicDraw macros (Macro Engine) | MagicDraw scripting | 2026-10-14 | search summary only |
| S-66 | Search: Cameo Collaborator for TWC | Cameo Collaborator | 2026-10-14 | search summary only |
| S-67 | https://www.ibm.com/new/announcements/scaling-sysml-v2-systems-engineering-with-ibm-rhapsody-systems-engineering-v1-8 | IBM Rhapsody Systems Engineering 1.8 announcement | 2026-10-14 | read partially (fetched) |
| S-68 | Search: IBM Rhapsody SysML v2 (IBM, SodiusWillert, 321Gang, IBM Ideas) | Rhapsody SE positioning | 2026-10-14 | search summary only |
| S-69 | Search: IBM Rhapsody (classic) simulation / Java API | Rhapsody (Systems Design) | 2026-10-14 | search summary only |
| S-72 | Search: EA scripting / automation interface | EA scripting | 2026-10-14 | search summary only |
| S-73 | Search: PTC Modeler SysML v2 (PTC community, PTC blogs) | PTC Modeler 10.2/10.3 | 2026-10-14 | search summary only |
| S-74 | Search: Siemens System Modeling Workbench / Systems Modeler for SysML v2 | Siemens SE tools | 2026-10-14 | search summary only |

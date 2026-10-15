# Modelling Workflows and User Interfaces

Most commercial UI facts here come from search summaries of vendor documentation (**Assumed**). Items tagged A0 are general domain knowledge without a source consulted in this research. Sources: [sources.md](sources.md).

## 1. Cameo / MagicDraw (desktop, SysML v1 with a v2 plugin)

| UI element | Workflow role | Evidence | Tag |
|---|---|---|---|
| **Containment tree** | Primary model browser. Auxiliary resources (e.g. built-in validation suites) appear only when "Show Auxiliary Resources" is on. Validation results navigate back to the tree | [S-62] | Assumed |
| **Diagram palette + diagram pane** | Element creation per diagram type (BDD, IBD, activity, etc.) | A0 | Assumed |
| **Smart manipulators** | Toolbar on selected symbols with standard and extra modes. Lets you draw a relationship and create the target element in one step. Can be disabled in Environment Options | [S-63] | Assumed |
| **Specification window** | Full property editor for any element, opened from tree, diagram or validation results | [S-62] | Assumed |
| **Relation map** | Graph exploration with criteria, layout and depth. Toolbar for context, relation criteria, element type, scope. Can show implied relationships (older-version docs) | [S-63] | Assumed |
| **Generic tables / dependency matrices** | Tabular editing and cross-dependency analysis. Matrix criteria include UML/SysML relationships, property-based semantic dependencies and transitive relations; filter related / unrelated. Accessible to Report Wizard templates through a DependencyMatrixTool | [S-61] | Assumed |
| **Active validation** | Validation suites stereotyped `«activeValidationSuite»` check correctness and completeness continuously while you model. Built-in suites include UML correctness and ownership checks. Users can create their own | [S-62] | Assumed |
| **Simulation (CST)** | Run state machines and activities; co-simulate FMUs (FMI 1.0/2.0) and Simulink; export FMUs | [S-64] | Assumed |
| **Collaboration (TWC)** | Commit/update to the server. Element locks per branch. Merge "From" with automatic ancestor detection and 3-way merge. v2 marketing says lock-free simultaneous editing with auto-merge of non-conflicting changes | [S-60][S-56] | Assumed / Verified (v2 page) |
| **Web review (Collaborator / MagicLab)** | Publish to the web. Model View and Document View. Text and graphical comments. MagicLab read-only viewer and multi-branch review | [S-66][S-56] | Assumed / Verified |
| **SysML v2 plugin** | Textual editor with two-way sync to diagrams. Graphical, tabular and textual views. Views generated from queries and rebuilt on change. Evaluation console | [S-56] | Verified |

Workflow pattern (A0, consistent with the above): create structure in the containment tree or BDD palette, then wire IBDs with smart manipulators, edit details in the specification window, check with active validation, analyse with matrices and relation maps, simulate with CST, commit to TWC, publish to Collaborator.

**Lessons for us**
1. Keep the **browser, property panel and canvas** trio, but make the property panel schema-driven from the metamodel (no per-type forms).
2. "Create relationship and target in one gesture" (smart manipulator) is a major productivity feature. Our equivalent must not depend on hover, per the repository UI rules, so it should be command-palette and selection-action driven.
3. Make validation continuous but scoped: run it incrementally on changed elements in a worker.
4. Matrices and tables are first-class editing surfaces, not just reports.

## 2. Obeo/CEA SysON (web, SysML v2)

| Aspect | Finding | Tag |
|---|---|---|
| Views | All 8 standard views: General, Interconnection, Action Flow, State Transition, Sequence, Geometry, Grid (generalises tabular and relationship matrix), Browser [S-34] | Verified |
| Text | Import of `.sysml` files and "New objects from text" into a selected element, with partial-success reports. Dependencies must be imported first, recursively. Export to text. Text editor not yet integrated (planned via SysIDE) [S-33][S-34] | Verified |
| Validation | Validation view lists language-constraint diagnostics by severity; marked experimental [S-33] | Verified |
| Collaboration | Share projects, models and diagrams by link; exchange via files [S-33] | Verified |
| Versioning | Single commit/branch per project [S-33] | Verified |
| Scale guidance | About 10 MB models, 150,000 semantic elements, 2,000 representations per project, 1,000 elements per representation, 1,000 projects and 80 concurrent users per server [S-33] | Verified |

**Lessons:** SysON shows that a web SysML v2 editor is feasible. Its gaps (no commit history, partial text round-trip, text editor not integrated) are our openings.

## 3. IBM Rhapsody

| Aspect | Finding | Tag |
|---|---|---|
| Classic Rhapsody | Executable models with animated statecharts, activity and sequence diagrams for design-level debugging; FMI/FMU co-simulation; Java API [S-69] | Assumed |
| Rhapsody SE (v2) | Cloud-native web tool; guided modelling of valid SysML v2 constructs; configurable quality checks; JS/Python extensions [S-68]. 1.8 adds governed reporting, cross-application drag-and-drop, MCP API, HarmonyIQ process guidance, PLE early access [S-67] | Verified (S-67) / Assumed (S-68) |
| Gap | Customer request for exchange and traceability between Rhapsody SE and Rhapsody Systems Design (v1) [S-68] | Assumed |

## 4. Sparx Enterprise Architect

| Aspect | Finding | Tag |
|---|---|---|
| Model browser, diagrams, many notations | Broad UML/SysML 1.x/BPMN/UAF modeller [S-70] | Assumed |
| Repository workflow | Start file-based, move to DBMS or cloud (Pro Cloud Server) [S-71] | Assumed |
| Automation | Scripts in JavaScript, JScript, VBScript with a `Repository` object; COM automation [S-72] | Assumed |
| SysML v2 | Not in EA 17; separate "Trechoro" product in development [S-70] | Assumed |

## 5. UI requirements derived for our editor (recommendations)
| ID | Requirement | Rationale |
|---|---|---|
| UI-1 | Synchronised **text, diagram, tree and property** panes over one semantic model, with sub-second incremental update | Leading v2 tools sell two-way sync [S-56]; SysON lacks it [S-34] |
| UI-2 | Standard-view projections first (GV, IV, AFV, STV, BV, Grid) | Spec conformance target for graphical notation [S-19] |
| UI-3 | Command-driven creation ("add part typed by…", "connect ports") available to both users and AI | Platform rule: user and AI share operations; no hover-only actions |
| UI-4 | Matrix and table editors on Grid View semantics | [S-19][S-34][S-61] |
| UI-5 | Inline continuous validation with explain-and-fix actions | [S-62] |
| UI-6 | Commit, branch and diff UX built into the editor (not a separate admin tool) | TWC strength [S-56], SysON gap [S-33] |

## Sources
Full details are in [sources.md](sources.md). All sources accessed 2026-10-14.

| ID | URL | Title | Accessed | Access level |
|---|---|---|---|---|
| S-19 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/2a-OMG_Systems_Modeling_Language.pdf | OMG SysML v2.1 Beta 2, Part 1: Language Specification | 2026-10-14 | read partially (TOC, Cl. 2 Conformance, 3, 7.26 Views and Viewpoints, 8.2.3 graphical notation intro, 9.2.20 Standard View Definitions) |
| S-33 | SysON repo docs: `doc/content/modules/developer-guide/pages/api/api.adoc`, `api-details.adoc`; `user-manual/pages/features/collaboration.adoc`, `import-export-textual.adoc`, `scaling-limits.adoc`, `validation.adoc` | SysON documentation sources | 2026-10-14 | read partially (first ~45 lines each) |
| S-34 | https://doc.mbse-syson.org/syson/main/user-manual/features/sysmlv2-overview.html | SysON SysML v2 overview | 2026-10-14 | read partially (fetched) |
| S-56 | https://docs.nomagic.com/SYSML2P/2026x-refresh1/catia-magic-cameo-sysml-v2-solution-312246433.html | CATIA Magic / Cameo SysML v2 solution | 2026-10-14 | read partially (fetched) |
| S-60 | Search: TWC merging and element locking (MagicDraw/TWC 19.0–2022x docs) | TWC merge and lock | 2026-10-14 | search summary only |
| S-61 | Search: MagicDraw 2024x dependency matrix / generic table | MagicDraw analysis diagrams | 2026-10-14 | search summary only |
| S-62 | Search: MagicDraw active validation | MagicDraw validation | 2026-10-14 | search summary only |
| S-63 | Search: MagicDraw smart manipulator / relation map | MagicDraw diagram UX | 2026-10-14 | search summary only |
| S-64 | Search: Cameo Simulation Toolkit 2024x FMI / Simulink | CST co-simulation | 2026-10-14 | search summary only |
| S-66 | Search: Cameo Collaborator for TWC | Cameo Collaborator | 2026-10-14 | search summary only |
| S-67 | https://www.ibm.com/new/announcements/scaling-sysml-v2-systems-engineering-with-ibm-rhapsody-systems-engineering-v1-8 | IBM Rhapsody Systems Engineering 1.8 announcement | 2026-10-14 | read partially (fetched) |
| S-68 | Search: IBM Rhapsody SysML v2 (IBM, SodiusWillert, 321Gang, IBM Ideas) | Rhapsody SE positioning | 2026-10-14 | search summary only |
| S-69 | Search: IBM Rhapsody (classic) simulation / Java API | Rhapsody (Systems Design) | 2026-10-14 | search summary only |
| S-70 | Search: Sparx Enterprise Architect SysML v2 (17.0 guide, forum, newsletter) | EA SysML support | 2026-10-14 | search summary only |
| S-71 | Search: EA DBMS repositories / Pro Cloud Server | EA repositories | 2026-10-14 | search summary only |
| S-72 | Search: EA scripting / automation interface | EA scripting | 2026-10-14 | search summary only |

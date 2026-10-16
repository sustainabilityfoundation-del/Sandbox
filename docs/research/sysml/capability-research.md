# System Model: capability research and target toolbar (CT-3 step 1)

Question: what is the full intended command scope of a professional MBSE modelling tool, how does the System Model tool (module id `sysml-modeler`) map onto it today, what should its toolbar look like, and what do we build or integrate?
Status: research note, 16 October 2026, researcher agent. Documentation only; no code changed. Input to CT-3 ([registry spec §8](../../specifications/capability-registry.md), step 1) and to the open-source assessment (OSS-3). Branch `research/system-model-capabilities`.

Scope statements kept from AGENTS.md: nothing here claims SysML v2 compliance or conformance. "SysML v2 textual notation" and "aligned subset" are the only claims we make, and they are not changed by this note. The tool's display name becomes "System Model" (owner decision); ids stay `sysml-modeler`.

Existing research reused, not repeated: the 56-line capability catalogue [capability-catalog.md](capability-catalog.md) (CAP-xx ids), the benchmark [tool-benchmark.md](tool-benchmark.md), the licence and maturity table [open-source-landscape.md](open-source-landscape.md) (accessed 2026-10-14, sources S-nn in [sources.md](sources.md)), the research backlog [backlog.md](backlog.md) (BL-nnn) and the UI workflows [workflows-and-ui.md](workflows-and-ui.md). This note adds what they lack: a command-level inventory shaped as a toolbar, the evidence-based status of each command, and the toolbar layout.

## 1. Sources

All accessed 2026-10-16 unless stated. "Read" means the page was fetched and summarised by the fetch tool; the wording below is mine. Where a page did not cover a topic, the topic is marked unverified in the inventory (dagger in the "Tools" column).

| ID | URL | Used for | Depth |
| --- | --- | --- | --- |
| R-1 | https://docs.nomagic.com/spaces/MD2021xR2/pages/82747994/Understanding+the+user+interface | Owner's reference. Window anatomy: main menu, main toolbars, model browser, diagram toolbars, diagram palette. Links to the pages below. It does not itself describe the containment tree, specification window, validation, search or views. | read |
| R-2 | https://docs.nomagic.com/spaces/MD2021xR2/pages/82748078/Main+menu | The eleven main menus and what each covers (File, Edit, View, Layout, Diagrams, Options, Tools, Analyze, Collaborate, Window, Help). | read |
| R-3 | https://docs.nomagic.com/spaces/MD2021xR2/pages/82747999/Toolbars | Two toolbar kinds (main, diagram); show/hide, customise dialog, reset to defaults. Does not list buttons. | read |
| R-4 | https://docs.nomagic.com/spaces/MD2021xR2/pages/82748011/Model+Browser | Browser tabs (Containment, Structure, Inheritance, Diagrams, Model Extensions, Search Results, Lock View), operations, type filter, sort, search results. | read |
| R-5 | https://docs.nomagic.com/spaces/MD2021xR2/pages/82748022/Using+the+Model+Browser | Auto-hide/float toggles, Window menu tab control, browser options. Little else. | read |
| R-6 | https://docs.nomagic.com/spaces/MD2021xR2/pages/82745863/Customizing+diagram+palette | Palette belongs to one diagram type; ordered buttons; grouped buttons; custom entries via profile. | read |
| R-7 | https://docs.nomagic.com/x/BKnuB ("Functions of Specification window") and https://docs.nomagic.com/x/8KjuB ("Specification window"), both MD2021xR2 | Non-modal specification window: property groups, open referenced element, back/forward, relationships, documentation, hyperlinks, tags, constraints, diagram usage, select in containment tree, traceability. | read (short links, resolved by the fetch tool) |
| R-8 | Search result summary for MD2021xR2 validation suites (pages reached via https://docs.nomagic.com/x/GZ-uB and neighbours) | Validation: manual predefined suites versus continuously running active suites; custom and cloned suites. | search summary only |
| R-9 | Search result summary for MD2021xR2 "Actions can be invoked from" (docs.nomagic.com/x/...) | Every action is reachable from main menu, main toolbar, palette, diagram toolbar, browser and diagram shortcut menus, smart manipulator, keyboard. | search summary only |
| R-10 | https://doc.mbse-syson.org/syson/main/user-manual/features/sysmlv2-overview.html | SysON: eight standard views, navigation list of its features (projects browser, cross-project search, explorer, details, related elements, validation, query, expressions, publication, library import, version control). | read |
| R-11 | https://doc.mbse-syson.org/syson/main/user-manual/features/validation.html | SysON validation view: project-wide diagnostics grouped by severity; flagged experimental. | read |
| R-12 | https://mbse-capella.org/ | Capella: open-source tool for the Arcadia method; viewpoints and add-ons (requirements, collaboration, safety, documentation). Page names no layers, diagrams or licence. | read (thin) |
| R-13 | https://github.com/eclipse-capella/capella | Capella licence EPL-2.0; 351 stars; no release or date visible in the fetch. | read (thin) |
| R-14 | https://eclipse.dev/papyrus/ | Papyrus: model explorer configurations, filterable/custom palettes, custom properties views, all UML 2.5 editors; SysML 1.6 block, internal block, requirement and parametric diagrams plus requirement and allocation tables. Licence not stated on the page. | read |
| R-15 | https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation | Pilot: Xtext textual editors for KerML and SysML in Eclipse, optional PlantUML view (needs GraphViz), Jupyter kernel/JupyterLab/installer projects, EPL-2.0. | read |
| R-16 | https://github.com/Systems-Modeling/SysML-v2-Release/tree/master/install/jupyter | Jupyter installation only (Java 21+, Miniconda, install script, `jupyter lab`). Magic commands not listed. | read |
| R-17 | Web search "SysML v2 Jupyter kernel magic commands" (2026-10-16) | Only `%help` confirmed (pilot release 2023-07 notes). Other magic names (visualise, show, list, publish, evaluate, export) are recalled from memory and **unverified**; do not rely on them. | search summary only |
| R-18 | Repository: `packages/tool-sysml-modeler/src/capabilities.ts`, `index.ts`, `view/*.tsx`, `session.ts`, `packages/sysml-core/src/commands/commands.ts`, `validation/validate.ts`, `packages/sysml-client/src/types.ts` | Our status evidence (file:line in section 2). | read, commit d2bf14f |
| R-19 | Earlier repo research S-nn (accessed 2026-10-14) as cited in [open-source-landscape.md](open-source-landscape.md) and [capability-catalog.md](capability-catalog.md) | Licences and versions of SysON, Sirius Web, elkjs, React Flow, dagre, Langium, tree-sitter-sysml, OpenSysML, pilot; Cameo/MagicDraw features known only from search summaries. | reused, not re-fetched |

Confidence and gaps. R-1 to R-7 are the primary source for the tool-window structure and are solid for that. The No Magic pages do not list individual toolbar buttons or menu commands, so commands marked `MD` come either from those pages (menu groupings, browser, palette, specification window) or, with a dagger, from the earlier research and recall (for example matrices, simulation, smart manipulator); verify the daggered ones before building. Capella and Papyrus were read at landing-page depth only: their entries are coarse. The pilot's Jupyter magic commands are unverified (R-17). Papyrus' licence was not verified from upstream in this pass (the guessed repository URLs returned 404).

Reference-tool codes used below: `MD` = MagicDraw/Cameo (owner's reference); `SO` = Eclipse SysON; `PP` = Eclipse Papyrus; `CP` = Eclipse Capella; `PI` = SysML v2 pilot implementation and its Jupyter kernel. A dagger means not confirmed on a page fetched in this pass.

## 2. Target command inventory for System Model

Hierarchy: tab, group, command. IDs: existing id kept verbatim; otherwise `sysml-modeler.<group>.<command>`. Status: **implemented** (genuine, evidence given), **partial** (limitation given), **planned** (SM-n in section 5; no binding, no fake implementation). Evidence paths are relative to `packages/tool-sysml-modeler/src/` unless a package is named. A note on granularity: the 20 existing entries are coarse (for example `properties` covers nine edits); where the toolbar needs a finer command, a new id is proposed and marked "split of `<existing>`" so CT-3 can keep the old id as the aggregate or retire it, whichever the registry owner prefers.

Prerequisite shorthand: *proj* = a project with a loaded model; *sel* = an element selected; *ns* = a namespace selected; *dia* = a diagram view open; *write* = model is editable (not read-only).

### Tab: Model

#### Model › Project

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.projects` | Project and branch | Choose or create a SysML project and pick its branch. | folder-open | platform project | MD SO | implemented | `capabilities.ts:19`; `ModelerView.tsx` project dialog (`Dialogs.tsx` kind `project`). Branch/tag creation is API-only. |
| `sysml-modeler.start-modelling` | Start modelling | Create the SysML model of a platform project lazily. | play | platform project, empty | MD† | implemented | `ModelerView.tsx:93`, `session.ts:114`, `tool.test.ts:250` |
| `sysml-modeler.project.properties` | Project settings | Default branch, default libraries, unit system and naming options of the project. | settings | proj | MD SO† | planned | SM-21 |

#### Model › Create

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.add` | Add | Add a package, definition or usage to the selected namespace (Add dialog and Add member). | add | proj, ns, write | MD SO PP CP PI | implemented | `index.ts:71`, `view/Dialogs.tsx:147` (kind select over `CREATABLE_KINDS`, `sysml-core/src/commands/commands.ts:21`), `view/Inspector.tsx:119` |
| `sysml-modeler.create.by-kind` | Create by kind menu | Split button listing the common kinds (part, attribute, port, action, state, requirement, constraint) so one click opens Add preset to that kind. | add-menu | proj, ns, write | MD SO PP | planned | SM-11 |
| `sysml-modeler.create.satisfy` | Satisfy | Create a satisfy relationship from a design element to a requirement. | link-requirement | proj, sel (requirement), write | MD SO PP | partial | Core command `satisfy` (`commands.ts:81`, `:420`) and assistant `satisfy_requirement` exist; no dialog and no toolbar item, so people use the text editor. SM-2 |
| `sysml-modeler.create.verify` | Verify | Create a verify relationship from a verification case to a requirement. | check-link | proj, sel (requirement), write | MD SO PP | planned | SM-2 (needs a core command) |
| `sysml-modeler.create.requirement-from-managed` | New from managed requirement | Create a SysML requirement from a Requirements-tool record. | requirement-new | proj, Requirements service | (ours) | partial | Assistant `satisfy_requirement` creates it (`capabilities.ts:13` note); manual path is Link only. SM-6 |

#### Model › Relate

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.connect` | Connect | Connect parts or ports: connection, interface, flow, binding, succession, allocation. | connect | proj, Interconnection View open, write | MD SO PP CP | implemented | `index.ts:86`, `view/Dialogs.tsx:167` (`CONNECT_KINDS`, `commands.ts:41`). Limitation: only enabled in the Interconnection View; allocation of actions to parts has no dialog outside it. |
| `sysml-modeler.relate.typing` | Set type | Type a usage by a definition; remove typing. | type | proj, sel (usage), write | MD SO PP CP | implemented | `view/Inspector.tsx:148`; split of `sysml-modeler.properties` |
| `sysml-modeler.relate.specialize` | Specialise | Add or remove subclassification, subsetting, redefinition, reference-subsetting. | specialize | proj, sel, write | MD SO PP CP | implemented | `view/Inspector.tsx:160`; split of `sysml-modeler.properties` |
| `sysml-modeler.represents` | Represents | Link a part or item to a Project Management product element; show CAD references. | link-product | proj, sel (part/item), write | (ours) | implemented | `capabilities.ts:20`, `view/Represents.tsx:50` |
| `sysml-modeler.requirement-link` | Link requirement | Link a SysML requirement to a managed requirement with a pinned revision. | link-requirement | proj, sel (requirement), Requirements service | (ours) | implemented | `capabilities.ts:12`, `view/RequirementLink.tsx:69`; assistant can add links only |
| `sysml-modeler.relate.cad-pick` | Pick CAD entity | Choose a CAD Modeler entity for a CadRepresentation link. | cad-link | proj, sel, CAD read service | (ours) | planned | SM-3 (waits for a CAD read service, `capabilities.ts:20` note) |

#### Model › Edit

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.undo` | Undo | Undo the last commit via a compensating commit. | undo | proj, a revertible commit | MD SO PP CP | implemented | `index.ts:106`, `session.ts:144`. Limitation: last commit only; the assistant can only undo its own proposals. |
| `sysml-modeler.edit.redo` | Redo | Re-apply an undone commit. | redo | proj, an undone commit | MD SO PP CP | planned | SM-7 |
| `sysml-modeler.edit.rename` | Rename | Change name and short name. | rename | proj, sel, write | MD SO PP CP | implemented | `view/Inspector.tsx:140`; split of `sysml-modeler.properties` |
| `sysml-modeler.edit.multiplicity` | Multiplicity | Set lower and upper bound. | multiplicity | proj, sel (feature), write | MD SO PP | implemented | `view/Inspector.tsx:176` |
| `sysml-modeler.edit.value` | Value | Set or clear a value expression, default or initial. | value | proj, sel (feature), write | MD SO PP | implemented | `view/Inspector.tsx:181` |
| `sysml-modeler.edit.direction` | Direction | Set in, out, inout or none. | direction | proj, sel (feature), write | MD SO PP | implemented | `view/Inspector.tsx:184` |
| `sysml-modeler.edit.abstract` | Abstract | Mark a definition or usage abstract. | abstract | proj, sel, write | MD SO PP | implemented | `view/Inspector.tsx:190` |
| `sysml-modeler.edit.documentation` | Documentation | Edit the element's documentation text. | note | proj, sel, write | MD SO PP CP | implemented | `view/Inspector.tsx:196` |
| `sysml-modeler.edit.delete` | Delete | Delete an element with a reference check and optional reference removal. | delete | proj, sel, write | MD SO PP CP | implemented | `view/Inspector.tsx:215` to `:254` |
| `sysml-modeler.edit.move` | Move to | Move an element to another namespace (drag in the browser or a picker). | move | proj, sel, write | MD SO PP CP | partial | Core command `move` (`commands.ts:82`, `:434`) is reachable through assistant `propose_commands`; no browser drag or picker. SM-4 |
| `sysml-modeler.edit.duplicate` | Duplicate | Copy an element with its subtree as a new member, with new ids. | copy | proj, sel, write | MD† SO† PP† | planned | SM-16 |
| `sysml-modeler.edit.copy` | Copy / paste | Copy elements and paste them into another namespace or project. | clipboard | proj, sel, write | MD | planned | SM-16 |
| `sysml-modeler.edit.metadata` | Metadata and tags | Edit metadata annotations, hyperlinks and tags on an element. | tag | proj, sel, write | MD | planned | SM-22 (only the four platform metadata kinds are written, through Link/Represents) |

### Tab: Views

#### Views › Diagram views

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.general` | General | General View of a namespace with automatic layout. | sysml-block | proj, ns | MD SO PP | implemented | `index.ts:94`, `projection/graph.ts`, `tool.test.ts:18` |
| `sysml-modeler.interconnection` | Interconnection | Parts, ports and connections of a part definition. | relationship | proj, sel (part def) | MD SO PP | implemented | `index.ts:95`, `tool.test.ts:36` |
| `sysml-modeler.action-flow` | Action flow | Actions, parameters, successions and flows. | procedure | proj, sel (action) | MD SO PP CP | partial | `index.ts:96`, `tool.test.ts:86`. Decision, fork, join and merge nodes are not drawn (`capabilities.ts:18`). SM-17 |
| `sysml-modeler.state-transition` | States | States with entry/do/exit, transitions with triggers and guards. | sync | proj, sel (state) | MD SO PP CP | implemented | `index.ts:97`, `tool.test.ts:62`, `:78`. Descriptive only, not simulated. |
| `sysml-modeler.views.sequence` | Sequence | Lifelines and messages of an interaction. | sequence | proj, sel | MD SO PP CP | planned | SM-24 |
| `sysml-modeler.views.geometry` | Geometry | 2D/3D view of spatial items, linked to CAD. | cube | proj, sel | SO | planned | SM-25 |
| `sysml-modeler.views.browser-view` | Browser view | Containment structure from a chosen root as a view usage. | tree | proj, sel | SO MD | planned | SM-26 (the side browser exists, below) |

#### Views › Tables

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.views.table` | Generic table | Editable table of elements and their features (grid view). | table | proj, ns | MD SO PP | planned | SM-14 |
| `sysml-modeler.views.table-cells` | Edit in table | Create or remove relationships and change values from cells. | table-edit | table view, write | MD† | planned | SM-14 |

#### Views › View definitions

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.views.new-view` | New view | Define a view usage with expose and filter, rendered as a chosen view type. | view-new | proj, write | SO MD† | planned | SM-26 |
| `sysml-modeler.views.viewpoint` | Viewpoint | Define stakeholder concerns and viewpoints that views satisfy. | viewpoint | proj, write | SO CP | planned | SM-26 |
| `sysml-modeler.views.saved` | Saved views | Reopen user-defined views and their layout. | bookmark | proj | MD SO | planned | SM-26 |

#### Views › Text

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.text` | Text | Edit a namespace as SysML v2 text with preview and apply, identity-preserving. | text | proj, ns | PI SO† | implemented | `index.ts:98`, `view/TextEditor.tsx:12-13`, `tool.test.ts:170` |
| `sysml-modeler.text.completion` | Completion and diagnostics | Keyword, name and qualified-member completion; parse errors as you type. | autocomplete | text tab | PI | implemented | `view/CodeEditor.tsx`, `tool.test.ts:231` |
| `sysml-modeler.text.navigate` | Go to definition / rename symbol | Jump to a definition; rename a symbol in text and model together. | goto | text tab, write | PI SO† | planned | SM-15 |
| `sysml-modeler.text.format` | Format | Pretty-print the namespace text. | format | text tab | PI | planned | SM-15 |

### Tab: Analyze

#### Analyze › Validate

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.validate` | Validate | Show the results of 19 well-formedness rules, filterable by severity. | check | proj | MD SO PP | implemented | `index.ts:102`, `view/Panels.tsx:11`, `:39`; `sysml-core/src/validation/validate.ts:22-41` (19 rules) |
| `sysml-modeler.validate.go-to` | Go to element | Select the offending element from a diagnostic. | goto | validation tab | MD SO | planned | SM-5 |
| `sysml-modeler.validate.fix` | Quick fix | Propose a command that resolves a diagnostic (previewed). | fix | validation tab, write | MD† | planned | SM-5 |
| `sysml-modeler.validate.scope` | Validate selection | Run validation on the selected namespace only. | filter-check | proj, ns | MD SO† | planned | SM-5 |
| `sysml-modeler.validate.rules` | Custom rules and suites | Create, clone and toggle rule suites, including always-on checking. | rules | proj | MD | planned | SM-32 |

#### Analyze › Trace

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.matrix` | Matrix | Relationship matrices for satisfy, allocate, connect (read-only). | trace | proj | MD† SO PP | implemented | `index.ts:99`, `view/Matrix.tsx:13`, `tool.test.ts:181` |
| `sysml-modeler.coverage` | Coverage | Requirement coverage: satisfied by, verified by, managed link, gaps. | requirement | proj | MD† SO | implemented | `index.ts:100`, `tool.test.ts:181` |
| `sysml-modeler.impact` | Impact | Referenced-by list and impact query for an element. | impact | proj, sel | MD SO | implemented | `view/Inspector.tsx:200`; `sysml-core/src/query/query.ts:138` |
| `sysml-modeler.analyze.relation-map` | Relation map | Interactive graph of related elements and paths. | graph | proj, sel | MD† SO | planned | SM-27 |
| `sysml-modeler.analyze.related` | Related elements | Show paths and related elements of the selection. | related | proj, sel | MD SO | planned | SM-27 |

#### Analyze › Evaluate

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.analyze.evaluate` | Evaluate expression | Evaluate an expression in a model context (console). | function | proj, sel | MD SO PI | partial | Inline "Evaluates to" for a value in the Inspector (`view/Inspector.tsx:181`) and rule `SYSML-CONSTRAINT-FALSE` (`validate.ts:40`); no console. SM-18 |
| `sysml-modeler.analyze.units` | Quantities and units | Pick quantity types and units; convert and check dimensions. | units | proj, sel (attribute), write | MD† SO PI | partial | Validation only (`SYSML-UNIT-DIMENSION`, `SYSML-UNIT-MISSING`, `validate.ts:31-32`); no picker. SM-18 |
| `sysml-modeler.analyze.verification` | Verification cases | Define verification cases and record verdicts. | verify | proj, write | MD† SO PP | planned | SM-28 |
| `sysml-modeler.analyze.trade-study` | Trade study | Analysis cases and trade studies with objective evaluation. | scale | proj, write | MD† | planned | SM-29 |

#### Analyze › Simulate

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.simulate.state` | Run state machine | Step a state machine on a simulated clock; descriptive models flagged. | play-step | proj, sel (state) | MD† PP† | planned | SM-30 |
| `sysml-modeler.simulate.action` | Run action | Execute an action definition with inputs. | play | proj, sel (action) | MD† PI† | planned | SM-30 |
| `sysml-modeler.simulate.fmi` | Co-simulate (FMI) | Run an analysis case against an FMU. | chip | proj, analysis case | MD† | planned | SM-31 |

### Tab: Collaborate

#### Collaborate › History

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.history` | History | Commits with provenance (person, assistant, import, API, undo). | history | proj | MD SO | implemented | `index.ts:103`, `view/Panels.tsx:50-56` |
| `sysml-modeler.collab.revert-commit` | Revert a commit | Revert any earlier commit, not only the last. | undo-commit | proj, a commit selected, write | MD† SO | partial | `session.revert(commitId)` accepts any commit (`session.ts:144`); the UI offers only the last (`index.ts:106`). SM-7 |
| `sysml-modeler.collab.diff` | Compare | Element-level difference between two commits, branches or tags. | diff | proj, two refs | MD SO | planned | SM-9 |

#### Collaborate › Branches and tags

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.collab.branch` | New branch | Create a branch from a commit. | branch | proj | MD SO | partial | `SysmlClient.createBranch` (`sysml-client/src/types.ts:130`); no UI (`capabilities.ts:19` note). SM-8 |
| `sysml-modeler.collab.tag` | Tag | Create an immutable named baseline. | tag | proj, a commit | MD SO | partial | `SysmlClient.createTag` (`types.ts:132`); no UI. SM-8 |
| `sysml-modeler.collab.merge` | Merge | Merge a branch with semantic conflict resolution. | merge | proj, two branches, write | MD | planned | SM-23 |

#### Collaborate › Review

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.collab.comment` | Comment | Comment on an element or diagram; resolve threads. | comment | proj, sel | MD† CP† | planned | SM-33 |
| `sysml-modeler.collab.presence` | Presence and locks | See who edits what; lock elements where policy requires. | people | proj, collaboration service | MD SO | planned | SM-34 |
| `sysml-modeler.collab.access` | Access | Project permissions and audit. | shield | proj, admin | MD | planned | SM-34 |

### Tab: Exchange

#### Exchange › Import

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.exchange.import-text` | Import SysML text | Load `.sysml` / `.kerml` files into a namespace. | import | proj, write | PI SO | planned | SM-10 (the Text tab applies pasted text only) |
| `sysml-modeler.exchange.import-json` | Import JSON | Load standard JSON model interchange. | import-json | proj, write | SO PI | planned | SM-10 |
| `sysml-modeler.exchange.import-kpar` | Import KPAR | Load a packaged project or library archive. | import-archive | proj, write | PI SO | planned | SM-10 |
| `sysml-modeler.exchange.import-v1` | Import SysML v1 | Import a v1 model through the published mapping, subset only. | import-legacy | proj, write | MD SO† | planned | SM-37 |

#### Exchange › Export

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.exchange.export-text` | Export text | Download namespace text. | export | proj | PI SO | planned | SM-10 |
| `sysml-modeler.exchange.export-json` | Export JSON | Download standard JSON. | export-json | proj | SO PI | planned | SM-10 |
| `sysml-modeler.exchange.export-kpar` | Export KPAR | Download a packaged archive. | export-archive | proj | PI SO | planned | SM-10 |
| `sysml-modeler.exchange.export-image` | Export image | Save the diagram as SVG, PNG or PDF. | image | dia | MD SO PP CP | planned | SM-12 |
| `sysml-modeler.exchange.export-table` | Export table | Save a matrix or table as CSV. | csv | matrix or table open | MD† | planned | SM-14 |

#### Exchange › Publish and link

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.exchange.report` | Report | Generate a document from view usages and templates. | report | proj | MD SO CP | planned | SM-33 |
| `sysml-modeler.exchange.oslc` | Lifecycle link (OSLC) | Link elements to external lifecycle tools. | external | proj, connection | MD† | planned | SM-38 |

### Tab: Tools

#### Tools › Assistant

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.ai.propose-text` | Propose model text | Ask the assistant to draft SysML v2 text as a previewed proposal. | sparkle | proj, AI connection | (ours) | partial | Assistant operations `propose_text`, `create_project` exist (`assistant.ts:398`); no toolbar item. SM-6 |
| `sysml-modeler.ai.explain` | Explain commit / element | Assistant explains a commit or element, citing model elements. | sparkle-note | proj, AI connection | (ours) | partial | `explain_commit`, `read_element` (`capabilities.ts:8`, `:9`); no toolbar item. SM-6 |
| `sysml-modeler.ai.refactor` | Generate or refactor architecture | Allocation proposals, inconsistency detection, architecture generation as reviewable commits. | sparkle-build | proj, AI connection | (ours) | planned | SM-39 |

#### Tools › Libraries and scripting

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.tools.libraries` | Libraries | Browse and import standard and user libraries; units and quantities. | library | proj | MD SO PI | planned | SM-19 |
| `sysml-modeler.tools.query` | Saved queries | Build and save element queries; cross-project search. | query | proj | MD SO | planned | SM-20 |
| `sysml-modeler.tools.script` | Scripts and macros | Run scripts over the model through the typed operations. | terminal | proj, write | MD† PI | planned | SM-36 |
| `sysml-modeler.tools.variants` | Variants | Variation points and configuration-aware views. | variants | proj | MD† SO | planned | SM-35 |
| `sysml-modeler.schema` | Command schemas | Discover command schemas and supported metaclasses (API/AI). | schema | none | (ours) | implemented | `capabilities.ts:14`; `assistant.ts` `describe_commands`; `tool.test.ts:130` |

#### Tools › Options and help

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.tools.customize` | Customise toolbar | Show, hide and reorder commands and groups; reset. | customize | none | MD | planned | SM-21 |
| `sysml-modeler.tools.shortcuts` | Keyboard shortcuts | View and rebind shortcuts. | keyboard | none | MD SO | planned | SM-21 |
| `sysml-modeler.tools.options` | Options | Layout defaults, units, naming, validation severity. | settings | none | MD SO PP | planned | SM-21 |
| `sysml-modeler.help.topics` | Help | Language reference, tool help, per-command help ids. | help | none | MD SO PP CP | implemented | `help.ts`; `tool.test.ts:110` (manifest maps every toolbar item) |

### Side panels (always available; menu entries under View)

#### Panels › Model browser

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.browser` | Model browser | Containment tree with keyboard navigation, name search and kind filter. | tree | proj | MD SO PP CP | implemented | `view/Browser.tsx:32`, `:49-51` (keys), `:97` (search), `:98` (kind filter) |
| `sysml-modeler.browser.tabs` | Browser tabs | Alternative trees: inheritance, diagrams/views, extensions, search results. | tabs | proj | MD PP | planned | SM-20 |
| `sysml-modeler.browser.sort` | Sort and group | Sort members; group by kind. | sort | proj | MD | planned | SM-20 |
| `sysml-modeler.browser.reveal` | Reveal in tree | Select the diagram selection or a reference in the tree. | locate | proj, sel | MD SO | planned | SM-22 |

#### Panels › Properties (specification)

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.properties` | Properties | Inspector: name, typing, specialisation, multiplicity, value, direction, abstract, documentation, delete (aggregate of the `edit.*` and `relate.*` commands above). | properties | proj, sel | MD SO PP | implemented | `view/Inspector.tsx:34`; `capabilities.ts:10` |
| `sysml-modeler.properties.history` | Back / forward | Move between visited elements in the Inspector. | arrows-lr | proj | MD | planned | SM-22 |
| `sysml-modeler.properties.relationships` | Relationships list | List incoming and outgoing relationships; reverse, retarget, add. | relationships | proj, sel, write | MD SO | planned | SM-22 |
| `sysml-modeler.properties.diagram-usage` | Shown in views | List views that show the element and open them. | views | proj, sel | MD | planned | SM-22 |

### Contextual tab: Diagram (any diagram view open)

#### Diagram › Navigate

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.diagram.zoom-in` | Zoom in | Magnify the diagram. | zoom-in | dia | MD SO PP CP | implemented | `view/Diagram.tsx:165` |
| `sysml-modeler.diagram.zoom-out` | Zoom out | Reduce magnification. | zoom-out | dia | MD SO PP CP | implemented | `view/Diagram.tsx:163` |
| `sysml-modeler.diagram.fit` | Fit to width | Fit the diagram to the pane. | fit | dia | MD SO PP CP | implemented | `view/Diagram.tsx:166`, `:65-74` |
| `sysml-modeler.diagram.up` | Up to owner | Show the owning namespace. | arrow-up | dia, ns has owner | SO | implemented | `view/Diagram.tsx:161` |
| `sysml-modeler.diagram.open` | Open element | Double-click a node to show its own diagram. | open | dia, sel | MD SO | implemented | `view/Diagram.tsx:126` |

#### Diagram › Layout

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.diagram.layout-auto` | Automatic layout | Layered layout with ports and hierarchy, computed off the main thread. | layout | dia | MD SO PP CP | implemented | `projection/layout.ts:4`, `:57` (elkjs in a worker). Always on; not a user command. |
| `sysml-modeler.diagram.layout-options` | Layout options | Direction, spacing, edge routing, re-layout now. | layout-settings | dia | MD SO PP CP | planned | SM-12 |
| `sysml-modeler.diagram.layout-manual` | Move and pin nodes | Drag nodes; keep positions as private view state. | drag | dia, write view | MD SO PP CP | planned | SM-12 |

#### Diagram › Display

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.diagram.compartments` | Compartments | Show or hide attribute, part, port, constraint compartments. | compartments | dia | MD SO PP | planned | SM-13 |
| `sysml-modeler.diagram.depth` | Depth and expose | Limit nesting depth; expose or hide packages and kinds. | depth | dia | MD SO | planned | SM-13 |
| `sysml-modeler.diagram.legend` | Legend and notation | Toggle keyword labels, textual notation inside nodes. | legend | dia | SO PP | planned | SM-13 |

#### Diagram › Edit on canvas

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.diagram.manipulator` | Selection toolbar | Small floating toolbar next to the selected node: add related, connect, delete, open specification. | selection-tools | dia, sel, write | MD SO† | planned | SM-11 |
| `sysml-modeler.diagram.drag-connect` | Draw a relationship | Drag from a port or node edge to another to create a connection. | draw-link | dia, write | MD SO PP CP | planned | SM-11 (today: Connect dialog) |
| `sysml-modeler.diagram.delete-view` | Remove from view | Hide a node without deleting the model element. | hide | dia, sel | MD SO PP CP | planned | SM-13 |

### Contextual tab: Matrix and table (matrix or table view open)

#### Matrix › Grid

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.matrix.kind` | Matrix kind | Switch satisfy, allocate, connect. | switch | matrix tab | MD† | implemented | `view/Matrix.tsx:13` |
| `sysml-modeler.matrix.create-link` | Link from cell | Create or remove the relationship at a cell. | cell-link | matrix tab, write | MD† SO† | planned | SM-14 |
| `sysml-modeler.matrix.filter` | Filter and transpose | Filter rows and columns by kind or text; swap axes. | filter | matrix tab | MD† | planned | SM-14 |

### Contextual tab: Text (text editor open)

#### Text › Editor

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.text.preview` | Preview | Dry-run the text against the model (names, validation, change set). | preview | text tab | PI | implemented | `view/TextEditor.tsx:12-13` |
| `sysml-modeler.text.apply` | Apply | Commit the text; matched elements keep their identity. | apply | text tab, write | PI | implemented | `view/TextEditor.tsx:13`, `tool.test.ts:170` |
| `sysml-modeler.text.find` | Find and replace | Search within the text. | search | text tab | PI | planned | SM-15 |

### Palettes (vertical, per diagram type; context-sensitive; all planned, SM-11)

Today diagrams are read-only projections: elements are created in the Add dialog or in text, never on the canvas. Each palette is a vertical strip of tool groups, one tool active at a time, as in the owner's reference (R-6). Tool lists mirror `CREATABLE_KINDS`, `CONNECT_KINDS` and the action and state metaclasses in `sysml-core`. Every row below is planned and unbound; `Tools` shows who has an equivalent tool. IDs follow `sysml-modeler.palette.<view>.<tool>`.

#### Palette: General View › Definitions

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.palette.general.package` | Package | Place a package. | package | dia, write | MD SO PP CP | planned | SM-11 |
| `sysml-modeler.palette.general.part-def` | Part definition | Place a part definition. | sysml-block | dia, write | MD SO PP CP | planned | SM-11 |
| `sysml-modeler.palette.general.item-def` | Item definition | Place an item definition. | item | dia, write | MD SO PP | planned | SM-11 |
| `sysml-modeler.palette.general.attribute-def` | Attribute definition | Place an attribute definition. | attribute | dia, write | MD SO PP | planned | SM-11 |
| `sysml-modeler.palette.general.port-def` | Port definition | Place a port definition. | port | dia, write | MD SO PP | planned | SM-11 |
| `sysml-modeler.palette.general.enum-def` | Enumeration | Place an enumeration definition. | enum | dia, write | MD SO PP | planned | SM-11 |
| `sysml-modeler.palette.general.interface-def` | Interface definition | Place an interface or connection definition. | interface | dia, write | MD SO PP | planned | SM-11 |
| `sysml-modeler.palette.general.action-def` | Action definition | Place an action definition. | procedure | dia, write | MD SO PP CP | planned | SM-11 |
| `sysml-modeler.palette.general.state-def` | State definition | Place a state definition. | sync | dia, write | MD SO PP CP | planned | SM-11 |
| `sysml-modeler.palette.general.requirement-def` | Requirement definition | Place a requirement definition. | requirement | dia, write | MD SO PP CP | planned | SM-11 |
| `sysml-modeler.palette.general.constraint-def` | Constraint / calculation | Place a constraint or calculation definition. | constraint | dia, write | MD SO PP | planned | SM-11 |

#### Palette: General View › Relationships

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.palette.general.specialization` | Specialisation | Draw subclassification between definitions. | specialize | dia, write | MD SO PP CP | planned | SM-11 |
| `sysml-modeler.palette.general.composition` | Part usage (composition) | Draw a part usage inside a definition, typed by another. | composition | dia, write | MD SO PP CP | planned | SM-11 |
| `sysml-modeler.palette.general.typing` | Typing / reference | Type a usage; add a reference usage. | type | dia, write | MD SO PP | planned | SM-11 |
| `sysml-modeler.palette.general.satisfy` | Satisfy | Draw satisfy to a requirement. | link-requirement | dia, write | MD SO PP | planned | SM-11, SM-2 |
| `sysml-modeler.palette.general.allocate` | Allocate | Draw an allocation. | allocate | dia, write | MD SO PP CP | planned | SM-11 |

#### Palette: Interconnection View

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.palette.interconnection.part` | Part | Add a part usage to the shown definition. | part | dia, write | MD SO PP CP | planned | SM-11 |
| `sysml-modeler.palette.interconnection.port` | Port | Add a port to a part. | port | dia, write | MD SO PP CP | planned | SM-11 |
| `sysml-modeler.palette.interconnection.connection` | Connection | Connect two ends. | connect | dia, write | MD SO PP CP | planned | SM-11 (dialog exists as `sysml-modeler.connect`) |
| `sysml-modeler.palette.interconnection.interface` | Interface | Connect ports through an interface. | interface | dia, write | MD SO PP CP | planned | SM-11 |
| `sysml-modeler.palette.interconnection.flow` | Flow | Flow items between ports. | flow | dia, write | MD SO PP CP | planned | SM-11 |
| `sysml-modeler.palette.interconnection.binding` | Binding | Bind two features equal. | bind | dia, write | MD SO PP | planned | SM-11 |

#### Palette: Action Flow View

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.palette.action.action` | Action | Add an action usage. | procedure | dia, write | MD SO PP CP | planned | SM-11 |
| `sysml-modeler.palette.action.parameter` | Parameter | Add an input or output parameter. | parameter | dia, write | MD SO PP | planned | SM-11 |
| `sysml-modeler.palette.action.succession` | Succession | Order two actions. | arrow-right | dia, write | MD SO PP CP | planned | SM-11 |
| `sysml-modeler.palette.action.flow` | Item flow | Flow an item between actions. | flow | dia, write | MD SO PP CP | planned | SM-11 |
| `sysml-modeler.palette.action.control` | Decision, merge, fork, join | Add control nodes. | control-node | dia, write | MD SO PP CP | planned | SM-17 |
| `sysml-modeler.palette.action.perform` | Perform | Make a part perform an action. | perform | dia, write | MD SO | planned | SM-11 |

#### Palette: State Transition View

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.palette.state.state` | State | Add a state usage. | sync | dia, write | MD SO PP CP | planned | SM-11 |
| `sysml-modeler.palette.state.transition` | Transition | Add a transition with trigger, guard, effect. | transition | dia, write | MD SO PP CP | planned | SM-11 (text editor today) |
| `sysml-modeler.palette.state.actions` | Entry, do, exit | Add state actions. | state-action | dia, write | MD SO PP CP | planned | SM-11 |
| `sysml-modeler.palette.state.parallel` | Parallel / composite | Mark a state parallel or add substates. | state-parallel | dia, write | MD SO PP | planned | SM-11 |

#### Palette: Sequence View (when the view exists)

| ID | Label | What it does | Icon | Prerequisites | Tools | Status | Evidence / backlog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sysml-modeler.palette.sequence.lifeline` | Lifeline | Add a participant. | lifeline | dia, write | MD SO PP CP | planned | SM-24 |
| `sysml-modeler.palette.sequence.message` | Message | Add a message between lifelines. | message | dia, write | MD SO PP CP | planned | SM-24 |
| `sysml-modeler.palette.sequence.fragment` | Fragment | Add a combined fragment. | fragment | dia, write | MD PP | planned | SM-24 |

### Totals

Counted by script over the rows of this section (one row per command, ids unique).

| Measure | Count |
| --- | --- |
| Commands | 155 (120 on ribbon tabs and side panels, 35 palette tools) |
| Implemented | 39 |
| Partial | 11 |
| Planned | 105 |
| Main tabs | 6 (Model, Views, Analyze, Collaborate, Exchange, Tools) |
| Contextual tabs | 3 (Diagram, Matrix, Text) |
| Palette sets | 5 diagram palettes (General, Interconnection, Action Flow, State Transition, Sequence) in 6 groups |
| Groups | 35 (27 ribbon groups, 2 side-panel groups, 6 palette groups) |

All 20 existing ids in `capabilities.ts` appear unchanged in the inventory. Of them, 19 stay implemented and `action-flow` is shown as partial (control nodes not drawn, as its own note says). The other implemented rows are finer commands split out of those entries (Inspector edits, diagram navigation, text editor, matrix kind); they are real behaviour with file:line evidence, but CT-3 may keep them as aggregates. Tests are named in the evidence column where one exists; binding `verifiedBy` is CT-3's job.

## 3. Proposed toolbar layout

Design basis. The owner's decision is that the toolbars should be like the No Magic interface (R-1): a main menu, main toolbars, diagram toolbars, a context-sensitive diagram palette, the model browser (containment tree) and the specification window. We render that structure in the Faber design system and the Focused Canvas style: compact, quiet, one primary action, planned commands muted but discoverable, no hover-only actions. Every command is reachable from the command palette and search, as the directive requires (R-9 shows the reference tool also makes each action reachable from several surfaces).

### 3.1 Mapping the reference interface onto Faber surfaces

| Reference element (R-1 to R-7) | Faber surface | How it is built | Note |
| --- | --- | --- | --- |
| Main menu: File, Edit, View, Layout, Diagrams, Options, Tools, Analyze, Collaborate, Window, Help (R-2) | **App menu** (button at the left of the tool header) plus the **command palette** | A projection of the same registry: each command has one `placement` (tab, group); the menu is generated from tabs and groups, so nothing is declared twice. Mapping below. | The CommandBar contract has no menu structure (gap G1). |
| Main toolbars: project-wide commands under the menu (R-3) | **CommandBar tabs** Model, Views, Analyze, Collaborate, Exchange, Tools | Compact ribbon: one row of groups, labels under icons on desktop, icons only on tablet | Expressible today. |
| Diagram toolbar over the diagram pane (R-3) | **Contextual tab "Diagram"** (and Matrix, Text), shown only while that view is open | Tab visible by `contextual` prerequisite; selects automatically when a view takes focus | Contract expresses "contextual" only by a generic prerequisite (gap G3). |
| Diagram palette: one palette per diagram type, grouped, ordered, customisable (R-6) | **Palette rail** docked at the left edge of the diagram pane; content switches with the open view (General, Interconnection, Action Flow, State Transition, Sequence) | Vertical strip of tool groups; one tool armed at a time; Escape disarms; phone: a bottom sheet from an "Add" button | Not expressible (gap G2, G4). |
| Smart manipulator (selection toolbar, R-9, daggered) | **Selection toolbar** floating beside the selected node | Planned `diagram.manipulator` | Gap G5. |
| Model browser, Containment tab (R-4, R-5) | **Left panel** (today: `Browser.tsx`) with tabs Containment, Views, Inheritance, Search results | Name search and kind filter exist; extra tabs planned (`browser.tabs`) | Panel tabs are module UI, not CommandBar. |
| Specification window, non-modal, multiple instances, back/forward, relationships, documentation, tags, diagram usage (R-7) | **Inspector** (right panel on desktop, pane on tablet, full screen on phone) | Today single-instance; planned back/forward, relationships list, shown-in-views, metadata | The Inspector is a panel, not a window; multiple open specifications are replaced by history navigation. |
| Validation: suites, active validation (R-8) | **Analyze › Validate** group and the Validation pane | Severity filter exists; go-to, quick fix, scope, custom rules planned | |
| Search: Search Results tab (R-4), Find (R-2 Edit) | **Search field** in the browser and the **command palette**; results as a browser tab | Name search exists (`Browser.tsx:97`) | |
| Views: view definitions, standard views (R-10) | **Views** tab and Views group | | |
| Window menu: tab control, reset windows (R-5) | **Panes** toggles (View menu) and "Reset layout" | Existing pane switcher on phone (`ModelerView.tsx:125`) | Gap G6 (dock layouts). |
| Customize Toolbars dialog (R-3) | **Tools › Customise toolbar** | planned (`tools.customize`) | Gap G7. |

App menu mapping (menu names are ours; the reference names in brackets):

| App menu | Contains (groups) | Reference menu |
| --- | --- | --- |
| Project | Model › Project, Exchange › Import, Exchange › Export | File |
| Edit | Model › Edit, Model › Create, Model › Relate | Edit |
| View | Panels (browser, properties, validation, history), zoom, display, reset layout | View, Window |
| Layout | Diagram › Layout (contextual, disabled when no diagram) | Layout |
| Views | Views › Diagram views, Tables, View definitions, Text | Diagrams |
| Analyze | Analyze › Validate, Trace, Evaluate, Simulate | Analyze |
| Collaborate | Collaborate › History, Branches and tags, Review | Collaborate |
| Tools | Tools › Assistant, Libraries and scripting, Options | Tools, Options |
| Help | Help topics, planned-command catalogue (all planned commands with status) | Help |

### 3.2 Desktop layout

Header row: tool name "System Model", project and branch picker (`projects`), the app menu button, command search field, undo/redo. Below, one tab strip and one ribbon row (about 56 px, Focused Canvas density).

| Tab | Groups (left to right) | Primary action |
| --- | --- | --- |
| Model | Project · Create · Relate · Edit | Add |
| Views | Diagram views · Tables · View definitions · Text | General |
| Analyze | Validate · Trace · Evaluate · Simulate | Validate |
| Collaborate | History · Branches and tags · Review | History |
| Exchange | Import · Export · Publish and link | (none) |
| Tools | Assistant · Libraries and scripting · Options and help | (none) |
| *Diagram* (contextual) | Navigate · Layout · Display · Edit on canvas | Fit |
| *Matrix* (contextual) | Grid | Matrix kind |
| *Text* (contextual) | Editor | Apply |

Rules: implemented commands render normally; partial commands carry a small marker and a tooltip stating the limitation; planned commands are muted and open a non-modal description with status and backlog id when pressed (never a success); commands whose prerequisite is unmet are disabled with the reason, visibly different from muted planned ones. Groups whose commands are all planned (Simulate, Review, Publish and link) collapse into one "More" menu per tab, as the CT specification recommends (§9). Left side: browser (resizable); centre: view; right: Inspector. Palette rail sits inside the centre pane.

Tooltip content for every command: label, one-line description, prerequisites, status, shortcut where one exists, and the help id.

### 3.3 Tablet and phone

| Surface | Tablet (about 768-1100 px) | Phone (under 768 px) |
| --- | --- | --- |
| Tabs | Tab strip kept; ribbon shows icons only; groups wrap into overflow "More" after the primary row | Bottom bar with five slots: Model, Views, Analyze, Add, More; Collaborate, Exchange, Tools move into More |
| Contextual tabs | Appear as an extra tab at the right end | Fold into the More sheet while a view is open |
| Palette | Rail collapsed to a single "Add to view" button that opens a popover with the same groups | Bottom sheet |
| App menu | Same as desktop | Full-screen menu, same tree, search first |
| Panels | Browser as drawer, Inspector as side sheet | One pane at a time via the existing pane switcher (`ModelerView.tsx:125`) |
| Overflow rule | Anything with `priority: 'secondary'` moves to overflow first; primary actions Add, Validate, Undo stay visible | Only Add and the active view's primary command stay on the bar |

Touch: minimum 40 px targets, no hover-only actions, long-press on a node opens the selection toolbar.

### 3.4 Structure the current CommandBar contract cannot express (input to CT-2b)

Checked against [capability-registry.md](../../specifications/capability-registry.md) §1: `CommandLayout` = tabs → groups (optional icon) with `contextual?: Prerequisite`; `Placement` = tab, group, order, priority.

| Gap | Needed for | Why the contract falls short | Suggested minimum |
| --- | --- | --- | --- |
| G1 Menu bar | App menu with File/Edit/View/... (R-2) | Layout has tabs and groups only. | Generate the menu from `commandLayout` plus an optional `menu` label per tab or group; allow nested submenus and separators. No second registry. |
| G2 Vertical palette with tool groups | Per-diagram-type palette (R-6) | No notion of a second surface, orientation or tool groups; the tab/group model is a horizontal ribbon. | A `palettes` entry in `commandLayout` (id, label, `contextual`, groups, orientation) and `Placement.surface: 'ribbon' | 'palette' | 'menu' | 'selection'`. |
| G3 Context by diagram type | Contextual tabs and palettes per view | `contextual` is a generic `Prerequisite`; `module-state` can carry text but is not a typed "active view is X". | A prerequisite kind `{ kind: 'view'; types: string[] }` or a module-declared context id evaluated by the host. |
| G4 Tool mode | A palette tool stays armed until Escape | Commands are one-shot (`onClick`), with no toggle or armed state. | Command `mode: 'action' | 'toggle' | 'tool'` and `isActive` in the runtime model. |
| G5 Selection toolbar | Floating toolbar near a node | Not a placement. | `surface: 'selection'` with a host-supplied anchor. |
| G6 Panel and layout commands | View menu toggles, reset layout, perspectives | Toggle commands and checked state are not modelled. | `mode: 'toggle'` with `checked`. |
| G7 User customisation | Customise toolbar, show/hide, reorder, reset (R-3) | Layout is static data. | A per-user override store keyed by capability id and a reset; the registry stays the source. |
| G8 Split buttons | Add by kind, Connect kind | A command is a single button. | `children?: CapabilityId[]` shown as a dropdown on one placement. |
| G9 Shortcuts | Accelerators in tooltips and menu rows | No field. | Optional `shortcut` on `CapabilityEntry`. |
| G10 Specification-style panel | Back/forward, multiple specifications | A panel, outside the command bar. | Not a contract change; module UI. |

## 4. Build versus integrate per area

Columns follow [open-source-evaluation-template.md](../../architecture/open-source-evaluation-template.md): candidates, upstream, version checked, licence (verified source), fit. Versions and licences marked "2026-10-14" come from the earlier verified table [open-source-landscape.md](open-source-landscape.md) and were not re-fetched; "2026-10-16" were checked in this pass. This note records the research; a decision still needs an ADR per area when work starts (strategy §3 step 6). Licence policy: [OPEN_SOURCE_STRATEGY.md](../../architecture/OPEN_SOURCE_STRATEGY.md) §2 and the pre-authorised list in the landscape note.

| Area (inventory groups) | Candidates | Version checked | Licence (verified source) | Fit and recommendation |
| --- | --- | --- | --- | --- |
| Diagram rendering and interaction (palette, drag-connect, selection toolbar: SM-11, SM-12, SM-13) | React Flow `@xyflow/react`; Eclipse Sprotty; Eclipse GLSP; our own SVG (today, `Diagram.tsx`) | React Flow 12.12.0, Sprotty 1.4.0, GLSP 2.8.0 (2026-10-14) | React Flow MIT; Sprotty and GLSP EPL-2.0 or GPL-2.0 with Classpath exception (2026-10-14, S-38/S-39/S-42) | **Integrate or extend**: React Flow is the strongest candidate for pan, zoom, handles, sub-flows and drag-connect, while keeping our projection and our commands as the only writers. GLSP is heavyweight and server-centric. Re-check React Flow fit against ports and nested nodes in a spike before adopting. |
| Layout (SM-12) | elkjs; dagre | elkjs 0.12.0, dagre 3.1.1 (2026-10-14) | elkjs EPL-2.0 OR GPL-3.0-or-later; dagre MIT (S-40/S-41) | **Already integrated**: elkjs in a worker (`projection/layout.ts:4`). Add options and pinned positions on top. |
| Textual editor, completion, navigation (SM-15) | CodeMirror 6 (today); Langium; tree-sitter-sysml; sysml-v2-lsp; pilot Xtext | Langium 4.4.0, tree-sitter-sysml (Open-MBEE) pushed 2026-09-18, sysml-v2-lsp 0.36.0 (2026-10-14) | CodeMirror MIT (per source header `CodeEditor.tsx:11`); Langium MIT; tree-sitter Apache-2.0; sysml-v2-lsp MIT; pilot EPL-2.0 (S-37/S-44/S-45/S-11) | **Extend what we have**: our own parser and CodeMirror editor stay; the pilot stays an oracle. Go-to-definition and rename are our own over our name resolution; no candidate gives them without a second model. |
| Standard views set, view definitions, viewpoints (SM-26) | Eclipse SysON (Sirius Web based); pilot PlantUML view; our projections | SysON v2026.9.3 (2026-10-14) | SysON EPL-2.0; its bundled standard libraries LGPL-3.0-only (NOTICE, S-31); Sirius Web EPL-2.0 (S-36) | **Inspiration, not dependency**: SysON is a Java/Sirius server with its own model (EMF); embedding it would give us a second model and break the single semantic core. Use its view list (R-10) as the checklist; build the view-usage semantics ourselves. |
| Sequence and geometry views (SM-24, SM-25) | SysON; Mermaid/PlantUML renderers; own SVG + elkjs | n/a | SysON EPL-2.0 (S-31); PlantUML dependency of the pilot is a licence question (S-11, not resolved) | **Build** on elkjs; evaluate PlantUML only if its licence is cleared. Geometry view couples to CAD and is a differentiator. |
| Validation rules and quick fixes (SM-5, SM-32) | Pilot validator as oracle; SysON validation (experimental, R-11); our 19 rules | Pilot monthly releases (2026-10-14) | EPL-2.0 (S-11, S-31) | **Build**: rules and fixes are tied to our command model. Use the pilot as a differential oracle (BL-009, BL-011). Quick fixes as previewed proposals through the existing propose/apply path are our differentiation. |
| Browser/tree, tabs, filters, search (SM-20) | Own tree (`Browser.tsx`); react-arborist (not evaluated); Papyrus/SysON explorers (design only) | n/a | n/a | **Build**: small; keep keyboard and accessibility behaviour. Evaluate a tree library only if virtualisation becomes necessary (BL-033). |
| Properties / specification (SM-22) | Own Inspector; Papyrus custom property views (R-14, design only); SysON details view (R-10, design only) | n/a | n/a | **Build**; schema-driven forms from the metamodel (BL-014) are the aim. |
| Tables and matrices with editing (SM-14) | Own grid; TanStack Table (not evaluated); SysON grid view | n/a | SysON EPL-2.0 (S-31) | **Build the semantics, integrate a table widget** after a short evaluation (licence not yet checked). |
| Interchange: JSON, KPAR, text (SM-10) | Pilot (oracle); OMG OpenAPI contract; OpenSysML REDK (Go, WASM); our `sysml-client` | OpenSysML 0.10.0 (2026-10-14) | OpenSysML Apache-2.0 (S-46); pilot EPL-2.0 (S-11); KPAR reader/writer rules from KerML clause 10 | **Build** the (de)serialisers in TypeScript (BL-002, BL-018) and test against the pilot; OpenSysML WASM is an optional differential oracle. No conformance claim. |
| Branch, diff, merge (SM-8, SM-9, SM-23) | API-aligned store (ours); Flexo MMS; OpenMBEE MMS; SysON versioning | Flexo pushed 2026-09-29 (2026-10-14) | Apache-2.0 (S-48) | **Build** the element-level diff and merge over our immutable commits (BL-029, BL-030); the others are design inspiration. |
| Simulation and analysis (SM-18, SM-28 to SM-31) | OpenSysML runtime; FMI libraries; pilot Jupyter kernel; own evaluator | OpenSysML 0.10.0; pilot (2026-10-14) | Apache-2.0; EPL-2.0 with LGPL-3.0-or-later npm metadata for the JupyterLab extension (S-11/S-43) | **Integrate behind a service boundary** for execution (OpenSysML as an optional engine; FMI via a separate replaceable service, BL-028); **build** the expression evaluator we already started. Jupyter is an oracle and a documentation channel, not a dependency. |
| Scripting and macros (SM-36) | Our typed operations (`describe_commands`); Jupyter; Monaco | n/a | n/a | **Build** on the typed command schema: one operation set for UI, scripts and the assistant. |
| Frameworks for process-oriented method (Capella/Arcadia) | Eclipse Capella | no release visible in the fetch (2026-10-16) | EPL-2.0 (GitHub licence link, R-13) | **Comparison only**: Arcadia is a different method and desktop RCP stack; borrow the viewpoint idea for SM-26. |
| Papyrus (SysML 1.6 editors, palettes, property views) | Eclipse Papyrus | not checked | **not verified** (landscape: Assumed EPL-2.0; page R-14 silent) | **Comparison only**: SysML v1 and UML; the palette and explorer configuration concepts inform SM-11 and SM-20. Verify licence before any reuse. |

Our differentiation (build, no good open-source equivalent that fits the single semantic core): previewed AI proposals shared with the human path (SM-6, SM-39), cross-module links (Requirements, Project Management, CAD) with pinned revisions (SM-2, SM-3), the capability-complete toolbar shared by human and AI (SM-1), validation quick fixes as proposals (SM-5), the geometry view tied to CAD (SM-25) and browser-based, phone-capable modelling.

## 5. Prioritised backlog

D1 = the end-to-end engineering demonstration. P0 items either complete the D1 chain (requirement, architecture, CAD or product element, verification) or are needed to show the full toolbar honestly. These are proposals; the coordinator assigns scope. SM items extend, and reference, the existing research backlog BL-nnn.

| ID | Pri | Item | Acceptance hint | Related |
| --- | --- | --- | --- | --- |
| SM-1 | P0 D1 | Register the full inventory above in the manifest: ids, placement, descriptions, planned entries unbound, `commandLayout` with tabs, groups and contextual tabs; data only | `npm run check`; planned entries show muted with backlog id; no handler changes | CT-3, registry §8 |
| SM-2 | P0 D1 | Satisfy and verify commands in the Relate group: a dialog over the existing `satisfy` command, a new verify command, both previewed | Create satisfy from a requirement to a part without typing text; validation rule `SYSML-SATISFY-TARGET` holds | BL-021 |
| SM-3 | P0 D1 | CAD entity picking for Represents (needs a CAD read service) | Select a CAD entity in the dialog; `SYSML-CAD-REFERENCE` passes | BL-020 |
| SM-4 | P0 D1 | Move element in the UI (browser drag or Move to picker) over the existing `move` command | Cycle and ownership refusals shown; commit has provenance | existing core command |
| SM-5 | P0 | Validation workflow: go to element, validate selection, quick fix as a previewed proposal | Click a diagnostic selects the element; fix applies through the same transaction path | BL-009 |
| SM-6 | P0 D1 | Assistant entries in the Tools › Assistant group bound to the existing operations (propose text, explain, new from managed requirement) | Same ids as the AI registry; unavailable without an AI connection | CT-2b, ADR-0013 |
| SM-7 | P1 | Redo and revert of any commit from History | Redo restores after undo; reverting an older commit reports conflicts | `session.ts:144` |
| SM-8 | P1 | Branch and tag UI | Create, switch, tag; API already present | BL-029 |
| SM-9 | P1 | Commit and branch comparison view | Added, changed, deleted elements listed | BL-029 |
| SM-10 | P1 | Import and export: text, JSON, KPAR | Round-trip pilot examples; labelled "aligned", no conformance claim | BL-002, BL-018 |
| SM-11 | P1 | Canvas editing: palette per diagram type, drag-connect, selection toolbar (needs contract gaps G2 to G5) | Every canvas edit issues a command through the transaction boundary | extends BL-015 |
| SM-12 | P1 | Layout options, pinned positions as view state, diagram image export | Positions survive reload; SVG/PNG export | BL-015 |
| SM-13 | P1 | Display options: compartments, depth, expose, remove from view | Per-view settings persist | CAP-VW-05 |
| SM-14 | P1 | Generic tables with in-cell editing; link from matrix cell; CSV export | Matrix cell creates a satisfy or allocation | BL-016 |
| SM-15 | P1 | Text editor: go to definition, rename symbol, format, find | Navigation uses our name resolution | BL-012 |
| SM-16 | P1 | Duplicate, copy and paste subtrees | New ids; references handled | CAP-ST-03 |
| SM-17 | P1 | Decision, merge, fork and join nodes in the Action Flow View | Nodes drawn from model; test fixture | BL-017 |
| SM-18 | P1 | Expression console and quantity/unit picker | Mass roll-up example evaluates; unit mismatch shown | BL-022, BL-023 |
| SM-19 | P1 | Library browser and import (standard and user) | Library elements searchable and referenceable | BL-003 |
| SM-20 | P1 | Saved queries, cross-project search, browser tabs and sorting | Saved query returns the same elements for UI and assistant | BL-024 |
| SM-21 | P1 | Customise toolbar, shortcuts, options, project settings (needs G7, G9) | Per-user layout with reset | R-3 |
| SM-22 | P1 | Inspector as specification: back/forward, relationships list, shown-in-views, metadata and hyperlinks, reveal in tree | Navigate through references without losing context | R-7 |
| SM-23 | P2 | Semantic merge with conflict resolution | Multi-parent merge commits | BL-030 |
| SM-24 | P2 | Sequence View and its palette | Standard-view node/edge sets | BL-025 |
| SM-25 | P2 | Geometry View linked to CAD | Spatial items drawn from CAD | BL-025 |
| SM-26 | P2 | View definitions, viewpoints and saved views | Expose/filter/render usages | CAP-VW-05 |
| SM-27 | P2 | Relation map and related-elements paths | Interactive graph from impact query | CAP-VW-06 |
| SM-28 | P2 | Verification cases and verdicts | Verdict recorded per requirement | CAP-RQ-03 |
| SM-29 | P2 | Analysis cases and trade studies | Trade study example evaluates | BL-027 |
| SM-30 | P2 | State and action execution (stepping), descriptive vs executable flagged | Training state example runs | BL-026 |
| SM-31 | P2 | FMI co-simulation as a replaceable service | FMU runs from an analysis case | BL-028 |
| SM-32 | P2 | Custom validation suites and always-on checking | User-defined rule runs on change | R-8 |
| SM-33 | P2 | Comments, review, reports and publication | Branch review before merge | BL-034 |
| SM-34 | P2 | Presence, locks, access control and audit | Role tests | BL-031, BL-032 |
| SM-35 | P3 | Variants and configuration-aware views | | BL-040 |
| SM-36 | P3 | Scripts and macros over typed operations | | CAP-AI-05 |
| SM-37 | P3 | SysML v1 import (subset) | Partial subset documented | BL-035 |
| SM-38 | P3 | OSLC lifecycle links | | BL-036 |
| SM-39 | P2 | AI architecture generation, refactoring, inconsistency detection as reviewable commits | Every AI change previewed and revertible | BL-037, BL-038 |

### Open points

- Verify the daggered `MD`, `SO`, `PP` entries against the vendor pages before building (the No Magic pages fetched here do not list menu commands or toolbar buttons).
- Verify the Jupyter kernel magic commands and Papyrus' licence from upstream; neither was confirmed.
- The decision between React Flow and our own SVG for SM-11 needs a spike and an ADR.
- The contract gaps G1 to G10 need the architect's view in CT-2b; SM-11 and SM-21 depend on them.

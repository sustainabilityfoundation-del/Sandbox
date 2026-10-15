# Open-Source Landscape: SysML v2 Parsers, Semantics, Language Servers, Graphics, MBSE Platforms

Fit categories: **Dependency** (may ship), **Inspiration** (study design only), **Oracle** (test counterpart outside the shipped app), **Not suitable**. Licence policy: MIT/BSD/Apache-2.0/ISC/zlib/MPL-2.0/EPL-2.0 (unmodified library) are pre-authorised. LGPL only as a replaceable module. GPL/AGPL, proprietary and paid need approval. Sources: [sources.md](sources.md).

## 1. SysML v2 language tooling

| Project | Licence | Language / runtime | Maturity and activity | Conformance claims | Maintenance risk | Fit | Tag |
|---|---|---|---|---|---|---|---|
| **SysIDE Editor Legacy (sysml-2ls)**, Sensmetry | "EPL-2.0 **or** GPL-2.0 with GNU Classpath Exception" (LICENSE header) [S-28] | TypeScript; **Langium ~1.2 + Chevrotain 9** [S-28] | 0.9.1 (2025-10-02); repo **archived**; targets the 2024-12 spec release [S-28] | Parser + LSP for KerML/SysML 2024-12 [S-28] | **High**: deprecated, pre-formal grammar | Inspiration (Langium-based SysML grammar design); EPL dependency possible but not advised | Verified |
| **Syside (new Editor / Modeler / Automator)**, Sensmetry | New editor is "licensed under a new license without source code access", free for commercial and non-commercial use [S-29]. PyPI `syside`: `LicenseRef-Proprietary` [S-30] | Not stated (new base from their professional suite) [S-29] | Active (announcement 2025-09-25) [S-29] | Claims SysML v2.0 support and a 50x speed-up over legacy [S-29] | Vendor-controlled | **Not suitable** as a dependency. Possible external oracle only if its terms permit (Unknown) | Verified |
| **Eclipse SysON**, Obeo + CEA | **EPL-2.0**. NOTICE: bundled standard libraries are **LGPL-3.0-only** [S-31] | Java (Spring/Sirius Web backend), TS/React frontend; GraphQL + REST `/api/rest/` [S-31][S-33] | v2026.9.3 (2026-10-02), monthly; 349 stars [S-31] | 8 standard views [S-34]. "The SysML v2 API isn't fully available yet". Each project uses a **single commit and branch** whose IDs equal the project ID; creating more commits "isn't functional" [S-33]. Textual import/export via add-on, "most important" concepts [S-33] | Medium: well funded, but Java stack | **Inspiration** (UX, view coverage, scaling limits); **Oracle** for graphical views (run in Docker) | Verified |
| SysON's parser | Text import calls **syside-cli** to produce a JSON AST, then `ASTTransformer` converts it to EMF elements [S-32] | Node CLI from Java | | | Couples SysON to Syside legacy | Insight: even SysON did not build its own parser | Verified |
| **sysml-v2-lsp** (daltskin) | MIT [S-44] | TypeScript, **ANTLR4** [S-44] | 0.36.0 (2026-10-11), first published 2026-02; 20 stars; single maintainer [S-43][S-44] | Diagnostics, symbols, completion, rename, semantic validation (unresolved types, multiplicity, duplicates), Mermaid preview, MCP server [S-44] | High (bus factor 1) | Inspiration / Oracle (npm, MIT); possible grammar reference | Verified |
| **tree-sitter-sysml** (Open-MBEE) | Apache-2.0 [S-47] | C (tree-sitter), shared JS grammar definition for KerML and SysML dialects [S-45] | Pushed 2026-09-18 [S-47] | Highlight/fold/indent/tags queries; diagnostics left to OpenSysML's `sysml-lsp` [S-45] | Medium | **Dependency candidate** for syntax highlighting (via `web-tree-sitter` WASM; Assumed integration path) | Verified |
| npm `tree-sitter-sysml` (gitlab nomograph) | MIT [S-43] | tree-sitter | 0.1.0 (2026-03-11) [S-43] | | High (single release) | Inspiration | Verified |
| **OpenSysML REDK** (Open-MBEE) | Apache-2.0 [S-46][S-47] | **Go**; LSP, REPL, execution runtime; clients for Python, Node/TS, Java, Rust, Julia, MATLAB. npm `@openmbee/opensysml` and `@openmbee/opensysml-wasm` 0.10.0 (Apache-2.0) [S-43][S-46] | Very new (npm first 2026-09-30) but highly active [S-43][S-47] | KerML 1.1 + SysML v2. Diagnostics compared against the pinned OMG pilot. "No conformance certification is claimed". Executes models (instances, units, state machines, requirement checks). Reported Apollo 11 model (7,200 lines) parse in 8 ms [S-46] | Medium (young) | **Oracle** (Node/WASM, same CI as ours) + **Inspiration** for execution semantics; dependency possible later (Apache-2.0) | Verified (claims are the project's own) |
| npm `sysml-validate` / `sysml-diagram` (voidaliot) | "SEE LICENSE IN LICENSE" (unknown) [S-43] | TS | 0.49.0 (2026-10-12) [S-43] | Headless validator / diagram renderer [S-43] | Unknown | **Not suitable** until the licence is known | Verified (metadata) |
| Other npm SysML packages (`sysml2-mermaid`, `sysml-reactflow`, `@sysml2renderer/*`, `@opensyster/diagram-*`, MCP servers) | Mostly MIT [S-43] | TS | 0.x, 2025–2026 [S-43] | Unverified | High | Inspiration only | Verified (metadata) |
| **SysML v2 Pilot Implementation** | EPL-2.0 [S-11] | Java 21 / Xtext | Monthly [S-09] | Reference implementation of the RIWG | Low | **Oracle** (see reference-implementations.md) | Verified |
| **Jupyter SysML kernel** | Part of the pilot (EPL-2.0); npm JupyterLab extension LGPL-3.0-or-later metadata [S-11][S-43] | Java kernel + JupyterLab | With the pilot | | Low | Oracle (interactive) | Verified |
| **PySysML2** (DAF DTO) | Apache-2.0 [S-51] | Python | No releases; last push 2024-10-23 [S-51] | | High (stale) | Not suitable | Verified |
| **sysml2py** (PyPI) | Licence not declared in metadata [S-51] | Python | 0.5.3 [S-51] | | Unknown | Not suitable | Verified (metadata) |

## 2. Language and graphics frameworks (TypeScript stack)

| Project | Licence | Runtime | Activity | Strengths / weaknesses for us | Fit | Tag |
|---|---|---|---|---|---|---|
| **Langium** | MIT [S-37] | TS; parsers powered by **Chevrotain**; built-in LSP; successor to Xtext [S-37] | 4.4.0 (2026-09); 1,040 stars [S-37] | Fast to a working LSP. Generated AST and linking. But: sysml-2ls built on Langium 1.2 was later replaced by a closed rewrite claiming 50x speed [S-28][S-29]. Langium's AST would need mapping to our KerML abstract syntax anyway | Dependency candidate (editor/LSP layer) | Verified (facts) / Assumed (perf causality) |
| **Eclipse GLSP** | "EPL-2.0, or GPL-2.0 with GNU Classpath Exception" [S-38] | TS client + Java/Node servers | 2.8.0 (2026-08-28). `glsp-client` repo **archived** (Sep 2026), activity moved to the `eclipse-glsp/glsp` repo [S-38] | Full diagram-editor protocol, but heavyweight and server-centric | Inspiration | Verified |
| **Eclipse Sprotty** | EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0 [S-39] | TS/SVG | Last release 1.4.0 (2024-12-17); repo still pushed 2026-10 [S-39] | SVG diagram framework with ELK integration (Assumed) | Inspiration (risk: release cadence) | Verified |
| **elkjs** | EPL-2.0 OR GPL-3.0-or-later [S-40] | JS (GWT-transpiled ELK) | 0.12.0 (2026-07-17); 2,817 stars [S-40] | Layered layout with **ports, hierarchy and orthogonal routing**, which suits IBD/interconnection views (Assumed from ELK capabilities, not read here). Runs in a web worker | **Dependency** (EPL-2.0 unmodified) | Verified (licence) / Assumed (features) |
| **dagre** (`@dagrejs/dagre`) | MIT [S-41] | JS/TS | 3.1.1 (2026-08-08) [S-41] | Simple layered layout. Weak on ports and compound graphs (Assumed) | Fallback dependency | Verified / Assumed |
| **React Flow (`@xyflow/react`)** | MIT [S-42] | React | 12.12.0 (2026-09-24); 38.7k stars [S-42] | Mature interaction layer (pan/zoom, handles, sub-flows). Rendering is DOM/SVG per node; very large views need virtualisation (Assumed) | **Dependency candidate** for interaction scaffolding | Verified / Assumed |
| **Eclipse Sirius Web** | EPL-2.0 [S-36] | Java + TS | v2026.9.3 (2026-10-02) [S-36] | Generic web modelling platform behind SysON | Inspiration | Verified |

## 3. MBSE platforms (comparison)

| Project | Licence | Runtime | Activity | Notes | Fit | Tag |
|---|---|---|---|---|---|---|
| **OpenMBEE MMS (exec-mms)** | Apache-2.0 [S-48] | Java | Pushed 2025-11-08 [S-48] | Model Management System libraries (v1 era) | Inspiration | Verified |
| **OpenMBEE View Editor (exec-ve)** | Apache-2.0 [S-48] | JavaScript | Pushed 2025-11-25 [S-48] | Document-style web views over models | Inspiration (documents-as-views) | Verified |
| **Flexo MMS Layer 1** | Apache-2.0 [S-48] | Kotlin; state in a **SPARQL quadstore** (Apache Jena Fuseki) [S-48] | Pushed 2026-09-29 [S-48] | RDF-native versioned model store | Inspiration | Verified |
| **OpenMBEE sysmlv2-python-client, sysml-sdk, sysml-toolkit, sysmlv2-rdf-ontology** | Apache-2.0 [S-47] | Python / C++ / Rust | 2026 [S-47] | Ecosystem growing fast in 2026 | Inspiration / Oracle | Verified (metadata) |
| **Eclipse Capella** (Arcadia) | EPL-2.0 [S-52] | Java/Eclipse RCP | v7.1.0 (2026-08-03) [S-52] | Arcadia method, not SysML. Team for Capella is the collaboration add-on (commercial; Assumed) [S-53] | Comparison only | Verified / Assumed |
| **Papyrus (SysML 1.6 / 2.0)** | EPL-2.0 (Assumed) | Java/Eclipse | Not checked | SysON is described as the core of Papyrus's SysML v2 editing [S-31][S-55] | Comparison only | Assumed |
| **Modelio** | **GPL-3.0** [S-54] | Java | v6.2.0 (2026-08-26) [S-54] | UML/BPMN/SysML modules (Assumed) | Not suitable (GPL) | Verified (licence) |

## 4. Recommendations

### 4.1 Parser: build our own TS parser, using Langium for the editor layer only if it pays off
| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Langium full stack | Fastest path to LSP features; MIT; TS [S-37] | Generated AST ≠ KerML abstract syntax, so a second model and mapping are needed. A prior SysML-on-Langium effort (sysml-2ls) was abandoned for a faster rewrite [S-28][S-29]. Less control over error recovery and lossless round-trip | Prototype / fallback |
| ANTLR4 (as sysml-v2-lsp) | Mature grammar tooling [S-44] | Runtime size and TS target ergonomics (Assumed); still needs AST-to-metamodel mapping | Not preferred |
| **Hand-written recursive-descent + Pratt expression parser, keyword/production tables generated from the official `.kebnf`** [S-01][S-06] | Produces our KerML elements directly (with `@id`, memberships). Full control over incremental re-parse, recovery and **concrete syntax trees for formatting-preserving serialisation**. No framework lock-in. Can run in browser, worker and Node | More upfront work; grammar coverage must be proven | **Recommended**. Validate against Release examples/training corpus, pilot oracle and OpenSysML differential [S-46] |

LSP and editor: implement with `vscode-languageserver` (MIT; Assumed) or directly on Monaco/CodeMirror in the React client. Use tree-sitter-sysml (Apache-2.0) for instant highlighting before the semantic pass if needed [S-45].

### 4.2 Graph layout: elkjs, with dagre as a fallback
elkjs (EPL-2.0 unmodified, pre-authorised) is the only maintained JS option with port constraints, compound/nested nodes and orthogonal edge routing, which interconnection and action-flow views need (Assumed features) [S-40]. Run it in a Web Worker. Persist manual positions as private view state; use ELK only for initial and incremental "tidy" layout. Use dagre (MIT) for simple trees and browser views where the cost of ELK is not justified [S-41].

### 4.3 Diagram rendering: own projection renderer in React/SVG; optional React Flow interaction
SysML v2 standard views are **projections of view usages** with compartments, nested parts, ports on borders and textual compartments [S-19]. Build a renderer that maps (view usage + exposed elements + filters) to a typed scene graph (nodes, compartments, ports, edges), rendered in SVG via design-system tokens. Use `@xyflow/react` (MIT) only as an interaction substrate if it keeps compartment rendering under our control [S-42]. GLSP and Sprotty are inspiration only: dual EPL/GPL licences are acceptable as EPL, but GLSP is server-centric and Sprotty's release cadence has slowed [S-38][S-39].

### 4.4 Oracles
Pilot (JVM, EPL-2.0) is the primary oracle. OpenSysML (`@openmbee/opensysml-wasm`, Apache-2.0) is a second, Node-native differential oracle. SysON (Docker) is the oracle for view coverage and UX comparison [S-11][S-43][S-46][S-34].

## Sources
Full details are in [sources.md](sources.md). All sources accessed 2026-10-14.

| ID | URL | Title | Accessed | Access level |
|---|---|---|---|---|
| S-01 | https://github.com/Systems-Modeling/SysML-v2-Release (raw README.md, master) | SysML v2 Release README | 2026-10-14 | read in full |
| S-06 | https://api.github.com/repos/Systems-Modeling/SysML-v2-Release/git/trees/master?recursive=1 | Release repo file tree (1,759 paths) | 2026-10-14 | read in full (listing) |
| S-09 | https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation/releases | Pilot releases | 2026-10-14 | read partially (fetched; latest 5) |
| S-11 | Raw: Pilot `LICENSE`, `org.omg.sysml.plantuml/META-INF/MANIFEST.MF`, `pom.xml`; `LICENSE-GPL` returned 404 | Pilot licence and PlantUML dependency | 2026-10-14 | read partially |
| S-19 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/2a-OMG_Systems_Modeling_Language.pdf | OMG SysML v2.1 Beta 2, Part 1: Language Specification | 2026-10-14 | read partially (TOC, Cl. 2 Conformance, 3, 7.26 Views and Viewpoints, 8.2.3 graphical notation intro, 9.2.20 Standard View Definitions) |
| S-28 | https://github.com/sensmetry/sysml-2ls (README, LICENSE, API metadata, `packages/syside-languageserver/package.json`) | SysIDE Editor Legacy (sysml-2ls) | 2026-10-14 | read partially (README, LICENSE header, package.json dependencies) |
| S-29 | https://sensmetry.com/syside-editor-rebirth-sysml-v2-0-50x-speed-up-license-change-free-as-before/ | "Syside Editor rebirth: SysML v2.0, 50x speed-up, licence change" | 2026-10-14 | read partially (fetched) |
| S-30 | https://pypi.org/pypi/syside/json | PyPI `syside` (Syside Automator) | 2026-10-14 | read in full (metadata) |
| S-31 | https://github.com/eclipse-syson/syson (README.md, NOTICE, LICENSE-LGPL, recursive tree, API metadata) | Eclipse SysON | 2026-10-14 | read partially |
| S-32 | https://github.com/eclipse-syson/syson/blob/main/backend/application/syson-sysml-import/src/main/java/org/eclipse/syson/sysml/services/SysideSysMLTextImporter.java | SysON text importer | 2026-10-14 | read in full |
| S-33 | SysON repo docs: `doc/content/modules/developer-guide/pages/api/api.adoc`, `api-details.adoc`; `user-manual/pages/features/collaboration.adoc`, `import-export-textual.adoc`, `scaling-limits.adoc`, `validation.adoc` | SysON documentation sources | 2026-10-14 | read partially (first ~45 lines each) |
| S-34 | https://doc.mbse-syson.org/syson/main/user-manual/features/sysmlv2-overview.html | SysON SysML v2 overview | 2026-10-14 | read partially (fetched) |
| S-36 | https://github.com/eclipse-sirius/sirius-web | Eclipse Sirius Web | 2026-10-14 | read partially (API metadata) |
| S-37 | https://github.com/eclipse-langium/langium (README), https://registry.npmjs.org/langium | Eclipse Langium | 2026-10-14 | read partially (README, npm metadata) |
| S-38 | https://github.com/eclipse-glsp/glsp (LICENSE), npm `@eclipse-glsp/client` | Eclipse GLSP | 2026-10-14 | read partially (LICENSE header, metadata) |
| S-39 | https://github.com/eclipse-sprotty/sprotty, npm `sprotty` | Eclipse Sprotty | 2026-10-14 | read partially (metadata) |
| S-40 | https://github.com/kieler/elkjs (LICENSE.md), npm `elkjs` | elkjs (ELK layout for JS) | 2026-10-14 | read partially (LICENSE, metadata) |
| S-41 | https://github.com/dagrejs/dagre, npm `@dagrejs/dagre` | dagre | 2026-10-14 | read partially (metadata) |
| S-42 | https://github.com/xyflow/xyflow, npm `@xyflow/react` | React Flow (xyflow) | 2026-10-14 | read partially (metadata) |
| S-43 | https://registry.npmjs.org/-/v1/search?text=sysml&size=30 | npm search "sysml" | 2026-10-14 | read in full (listing) |
| S-44 | https://github.com/daltskin/sysml-v2-lsp (README, metadata) | sysml-v2-lsp | 2026-10-14 | read partially |
| S-45 | https://github.com/Open-MBEE/tree-sitter-sysml (README); npm `tree-sitter-sysml` (gitlab.com/nomograph) | tree-sitter grammars for KerML/SysML | 2026-10-14 | read partially |
| S-46 | https://github.com/Open-MBEE/OpenSysML (README) | OpenSysML REDK | 2026-10-14 | read partially (intro sections) |
| S-47 | https://api.github.com/orgs/Open-MBEE/repos?sort=pushed | Open-MBEE org repo listing | 2026-10-14 | read in full (top 30) |
| S-48 | https://github.com/Open-MBEE/exec-mms, https://github.com/Open-MBEE/exec-ve, https://github.com/Open-MBEE/flexo-mms-layer1-service (README) | MMS, View Editor, Flexo MMS | 2026-10-14 | read partially |
| S-51 | https://github.com/DAF-Digital-Transformation-Office/PySysML2 (metadata); https://pypi.org/pypi/sysml2py/json | PySysML2; sysml2py | 2026-10-14 | read partially (metadata) |
| S-52 | https://github.com/eclipse-capella/capella (metadata) | Eclipse Capella | 2026-10-14 | read partially (metadata) |
| S-53 | Search: Capella / Team for Capella (Wikipedia, mbse-capella.org, Obeo) | Capella ecosystem | 2026-10-14 | search summary only |
| S-54 | https://github.com/ModelioOpenSource/Modelio (metadata) | Modelio | 2026-10-14 | read partially (metadata) |
| S-55 | Search: Papyrus SysML 2.0 / SysON (projects.eclipse.org, SysON docs) | Papyrus and SysON relationship | 2026-10-14 | search summary only |

# Master Source Register (SysML / MBSE research)

All sources accessed 2026-10-14 (local time; some GitHub timestamps are already 2026-10-15 UTC).
This file holds the single source numbering. Every other file in this folder cites these `[S-nn]` IDs.

**Access levels**
- **read in full**: the raw file or page was downloaded and read directly (GitHub raw files, the GitHub REST API JSON, npm/PyPI registry JSON, PDF text extracted locally with `pdftotext`, the OMG OpenAPI JSON parsed with Node).
- **read partially (sections …)**: only the named sections were read. "(fetched)" means the page came through the WebFetch tool, which returns a model-extracted summary of the page, not the verbatim page.
- **search summary only**: seen only as a web-search result summary or snippet. Claims that rest only on these are marked **Assumed** in the other files.

## A. OMG specifications and normative artifacts

| ID | URL | Title | Publisher | Date of item | Access level | Used for |
|---|---|---|---|---|---|---|
| S-18 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/1-Kernel_Modeling_Language.pdf | Kernel Modeling Language (KerML) v1.1 Beta 2 (Release 2026-07) | OMG / SST, via SMC release repo | Aug 2026 | read partially (Cl. 2 Conformance, 3, 6.1 Architecture, 8.3 TOC and metaclass descriptions for Element, Relationship, Membership, OwningMembership, FeatureMembership, Namespace, Type, Classifier, Feature, Specialization, Subclassification, Subsetting, FeatureTyping, Conjugation; 9.1 library UUID rule; Cl. 10 Model Interchange in full; Annex A start) | KerML layers, abstract syntax, conformance, JSON/KPAR interchange, library IDs |
| S-19 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/2a-OMG_Systems_Modeling_Language.pdf | OMG SysML v2.1 Beta 2, Part 1: Language Specification | OMG / SST | Aug 2026 | read partially (TOC, Cl. 2 Conformance, 3, 7.26 Views and Viewpoints, 8.2.3 graphical notation intro, 9.2.20 Standard View Definitions) | SysML conformance, views/viewpoints, standard views, graphical notation stance |
| S-20 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/2b-SysML_v1_to_v2_Transformation.pdf | OMG SysML v2.1 Beta 2, Part 2: SysML v1 to SysML v2 Transformation | OMG / SST | Aug 2026 | read partially (TOC, Cl. 1 Scope, 2 Conformance, 3, 6 Mapping Approach; keyword search for "diagram") | v1-to-v2 transformation scope |
| S-21 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/3-Systems_Modeling_API_and_Services.pdf | Systems Modeling API and Services v1.1 Beta 2 | OMG / SST | Aug 2026 | read partially (front-matter licence, Cl. 2 Conformance, 3, 7.1 API Model, 8.1 REST/HTTP PSM incl. Tables 9–10 and pagination, 8.2 media types, Annex B.1 examples) | API resource model, commit semantics, endpoint mapping, conformance |
| S-22 | https://www.omg.org/spec/SysML/2.0 | OMG SysML 2.0 spec page | OMG | page accessed 2026-10-14 | read partially (fetched) | Status (Formal, Sep 2025), document numbers, machine-readable files |
| S-23 | https://www.omg.org/spec/KerML/1.0 | KerML 1.0 spec page | OMG | page accessed 2026-10-14 | read partially (fetched) | Status, document number, machine-readable files |
| S-24 | https://www.omg.org/spec/SystemsModelingAPI/1.0 | Systems Modeling API and Services 1.0 spec page | OMG | page accessed 2026-10-14 | read partially (fetched) | Status, machine-readable files (OpenAPI.json, Schema.json, OSLC TTL) |
| S-25 | https://www.omg.org/spec/SystemsModelingAPI/20250201/OpenAPI.json | Systems Modeling API and Services REST/HTTP PSM, OpenAPI 3.1, version 1.0 | OMG | 2025-02-01 artifact | read in full (machine-parsed: all paths, verbs, operationIds, parameters, media types, key schemas) | Verified endpoint list and JSON schemas |
| S-26 | https://www.omg.org/spec/SysML/20250201/Systems-Library.kpar and https://www.omg.org/spec/KerML/20250201/Semantic-Library.kpar | Normative library KPARs (Systems Library 2.0.0, Kernel Semantic Library 1.0.0) | OMG | Mar 2025 build | read partially (archive listing, .project.json, .meta.json, one library file) | Library packaging and metadata; licence field check |

## B. Systems Modeling Community (SMC) reference implementation repositories

| ID | URL | Title | Publisher | Date of item | Access level | Used for |
|---|---|---|---|---|---|---|
| S-01 | https://github.com/Systems-Modeling/SysML-v2-Release (raw README.md, master) | SysML v2 Release README | OMG SMC RIWG | master as of 2026-09-12 | read in full | Contents, spec status, **licensing section** |
| S-02 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/LICENSE | Release repo LICENSE (EPL-2.0) | OMG SMC | master | read partially (title, Secondary Licence definition, Exhibit A) | Exact licence text |
| S-03 | https://github.com/Systems-Modeling/SysML-v2-Release/releases | Release repo releases | OMG SMC | 2026-08 latest | read partially (fetched; latest 5 releases) | Release cadence, Beta 2 docs |
| S-04 | https://github.com/Systems-Modeling/SysML-v2-Release/releases/tag/2026-04 | Release 2026-04 notes | OMG SMC | 2026-05-14 | read partially (fetched; full notes) | Licence change LGPL to EPL, library forms, XMI caveat |
| S-05 | https://raw.githubusercontent.com/Systems-Modeling/SysML-v2-Release/2026-03/README.md and the same path at tag 2025-02, plus LICENSE at both tags | Release README and LICENSE at earlier tags | OMG SMC | 2026-04 / 2025-03 | read partially (licensing section, LICENSE heading) | Prior licence (LGPL-3.0) of models and libraries |
| S-06 | https://api.github.com/repos/Systems-Modeling/SysML-v2-Release/git/trees/master?recursive=1 | Release repo file tree (1,759 paths) | GitHub API | master | read in full (listing) | Library, example, training, bnf, kpar inventory |
| S-07 | Raw files: `sysml.library/Kernel Libraries/Kernel Semantic Library/Base.kerml`, `sysml.library/Domain Libraries/Quantities and Units/ISQBase.sysml`, `sysml.library/Systems Library/.meta.json` | Library file headers | OMG SMC | master | read partially (first 25–30 lines each) | Per-file licence headers (none found); ISO 80000 provenance note |
| S-08 | https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation (README.adoc raw, root listing) | Pilot Implementation README | OMG SMC | master as of 2026-10-15 | read partially (licence line, install, copyright header template) | Licence, runtime (Eclipse 2025-12, Java 21, Maven, Xtext) |
| S-09 | https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation/releases | Pilot releases | OMG SMC | 2026-08 (2026-09-11) | read partially (fetched; latest 5) | Maintenance activity |
| S-10 | https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation/releases/tag/2026-04 | Pilot release 2026-04 | OMG SMC | 2026-05-13 | read partially (fetched) | Licence change LGPL to EPL (PR #752) |
| S-11 | Raw: Pilot `LICENSE`, `org.omg.sysml.plantuml/META-INF/MANIFEST.MF`, `pom.xml`; `LICENSE-GPL` returned 404 | Pilot licence and PlantUML dependency | OMG SMC | master | read partially | EPL-2.0 text; PlantUML import; stale README reference to LICENSE-GPL |
| S-12 | https://github.com/Systems-Modeling/SysML-v2-API-Services (README, LICENSE) | API Services pilot | OMG SMC | release 2026-04 (2026-05-14) | read partially (fetched README; raw LICENSE heading) | Tech stack (Play, Java 11, sbt, PostgreSQL), EPL-2.0 |
| S-13 | https://api.github.com/orgs/Systems-Modeling/repos and per-repo `/releases?per_page=1` | Systems-Modeling org metadata | GitHub API | 2026-10-14 | read in full (JSON) | SPDX licences, last push, latest release tags |
| S-14 | Raw: SysML-v2-API-Java-Client `LICENSE`, root listing; Python client metadata | Java/Python API clients | OMG SMC | 2021-09 release | read partially | LGPL-3.0 (plus LICENSE-GPL), stale since 2021 |
| S-15 | https://github.com/Systems-Modeling/SysML-v2-API-Cookbook (root listing, README) | API Cookbook | OMG SMC | release 2025-02 | read in full (listing); README scanned for licence | No LICENSE file present |
| S-16 | https://github.com/Systems-Modeling/OOSEM-v2-Release/blob/HEAD/LICENSE.md | OOSEM v2 Release LICENSE | OMG SMC / INCOSE OOSEM WG | 2026-09 | read partially | Apache-2.0 models, CC-BY-4.0 other artifacts |
| S-17 | https://github.com/Systems-Modeling/SysML-v2-AADL-Release (README) | AADL library for SysML v2 | OMG SMC | 2026-03 | read partially (licence and status sections) | CC-BY-ND-4.0 |
| S-27 | Raw: `sysml.library.kpar/SysML_Quantities_and_Units_Library-2.1.0-dev.20260801.kpar` (.project.json) | Release-repo KPAR metadata | OMG SMC | 2026-08-01 | read partially | Version naming, no licence field |

## C. Open-source landscape

| ID | URL | Title | Publisher | Date of item | Access level | Used for |
|---|---|---|---|---|---|---|
| S-28 | https://github.com/sensmetry/sysml-2ls (README, LICENSE, API metadata, `packages/syside-languageserver/package.json`) | SysIDE Editor Legacy (sysml-2ls) | Sensmetry | 0.9.1, 2025-10-02; archived | read partially (README, LICENSE header, package.json dependencies) | Licence (EPL-2.0 or GPL-2.0 with Classpath Exception), deprecation, built on Langium ~1.2 / Chevrotain 9 |
| S-29 | https://sensmetry.com/syside-editor-rebirth-sysml-v2-0-50x-speed-up-license-change-free-as-before/ | "Syside Editor rebirth: SysML v2.0, 50x speed-up, licence change" | Sensmetry | 2025-09-25 | read partially (fetched) | New Syside licence is closed-source and free of charge |
| S-30 | https://pypi.org/pypi/syside/json | PyPI `syside` (Syside Automator) | Sensmetry | 0.11.0 | read in full (metadata) | `LicenseRef-Proprietary` |
| S-31 | https://github.com/eclipse-syson/syson (README.md, NOTICE, LICENSE-LGPL, recursive tree, API metadata) | Eclipse SysON | Obeo / CEA | v2026.9.3, 2026-10-02 | read partially | Licence (EPL-2.0; bundled libraries marked LGPL-3.0-only), module structure |
| S-32 | https://github.com/eclipse-syson/syson/blob/main/backend/application/syson-sysml-import/src/main/java/org/eclipse/syson/sysml/services/SysideSysMLTextImporter.java | SysON text importer | Obeo | 2026 | read in full | SysON parses text through syside-cli into a JSON AST |
| S-33 | SysON repo docs: `doc/content/modules/developer-guide/pages/api/api.adoc`, `api-details.adoc`; `user-manual/pages/features/collaboration.adoc`, `import-export-textual.adoc`, `scaling-limits.adoc`, `validation.adoc` | SysON documentation sources | Obeo | main | read partially (first ~45 lines each) | API status, single commit/branch, scaling limits, validation |
| S-34 | https://doc.mbse-syson.org/syson/main/user-manual/features/sysmlv2-overview.html | SysON SysML v2 overview | Obeo | main | read partially (fetched) | Supported standard views |
| S-35 | https://blog.obeosoft.com/stability-and-usability-with-syson-2026-3 (and related release notes) | SysON 2026.3 release blog | Obeo | 2026 | search summary only | Textual import/export progress |
| S-36 | https://github.com/eclipse-sirius/sirius-web | Eclipse Sirius Web | Obeo | v2026.9.3, 2026-10-02 | read partially (API metadata) | Licence and activity |
| S-37 | https://github.com/eclipse-langium/langium (README), https://registry.npmjs.org/langium | Eclipse Langium | Eclipse Foundation / TypeFox | 4.4.0, 2026-09 | read partially (README, npm metadata) | MIT, TypeScript, Chevrotain, LSP |
| S-38 | https://github.com/eclipse-glsp/glsp (LICENSE), npm `@eclipse-glsp/client` | Eclipse GLSP | Eclipse Foundation | 2.8.0, 2026-08-28 | read partially (LICENSE header, metadata) | Dual licence, glsp-client repo archived |
| S-39 | https://github.com/eclipse-sprotty/sprotty, npm `sprotty` | Eclipse Sprotty | Eclipse Foundation | 1.4.0, 2024-12-17 | read partially (metadata) | Licence, release cadence |
| S-40 | https://github.com/kieler/elkjs (LICENSE.md), npm `elkjs` | elkjs (ELK layout for JS) | Kiel University / Eclipse ELK | 0.12.0, 2026-07-17 | read partially (LICENSE, metadata) | EPL-2.0 OR GPL-3.0-or-later |
| S-41 | https://github.com/dagrejs/dagre, npm `@dagrejs/dagre` | dagre | dagrejs | 3.1.1, 2026-08-08 | read partially (metadata) | MIT, activity |
| S-42 | https://github.com/xyflow/xyflow, npm `@xyflow/react` | React Flow (xyflow) | xyflow | 12.12.0, 2026-09-24 | read partially (metadata) | MIT, activity |
| S-43 | https://registry.npmjs.org/-/v1/search?text=sysml&size=30 | npm search "sysml" | npm | 2026-10-14 | read in full (listing) | TS/JS SysML packages and their declared licences |
| S-44 | https://github.com/daltskin/sysml-v2-lsp (README, metadata) | sysml-v2-lsp | individual maintainer | 0.36.0, 2026-10-11 | read partially | MIT, ANTLR4-based TypeScript LSP |
| S-45 | https://github.com/Open-MBEE/tree-sitter-sysml (README); npm `tree-sitter-sysml` (gitlab.com/nomograph) | tree-sitter grammars for KerML/SysML | OpenMBEE; nomograph | 2026-09 / 0.1.0 (2026-03) | read partially | Apache-2.0 (OpenMBEE) and MIT (nomograph) |
| S-46 | https://github.com/Open-MBEE/OpenSysML (README) | OpenSysML REDK | OpenMBEE | 2026-10 | read partially (intro sections) | Go implementation, Apache-2.0, differential testing against the pilot |
| S-47 | https://api.github.com/orgs/Open-MBEE/repos?sort=pushed | Open-MBEE org repo listing | GitHub API | 2026-10-14 | read in full (top 30) | Ecosystem inventory and licences |
| S-48 | https://github.com/Open-MBEE/exec-mms, https://github.com/Open-MBEE/exec-ve, https://github.com/Open-MBEE/flexo-mms-layer1-service (README) | MMS, View Editor, Flexo MMS | OpenMBEE | 2025-11 / 2026-09 | read partially | Licences, activity, Flexo on a SPARQL quadstore |
| S-49 | https://github.com/Open-MBEE/sysmlv2-testing (README) | sysmlv2-testing ledger | OpenMBEE | 2026-09 | read partially | Conformance-testing approach; treats spec PDFs as non-redistributable |
| S-50 | https://github.com/Open-MBEE/sysmlv2-web-modeler (README) | SysML v2 Visualization Service | Planetary Utilities Corp. / OpenMBEE | 2026-10 | read partially | Pattern: pilot jars plus bundled library behind a web service |
| S-51 | https://github.com/DAF-Digital-Transformation-Office/PySysML2 (metadata); https://pypi.org/pypi/sysml2py/json | PySysML2; sysml2py | DAF DTO; unknown | 2024-10; 0.5.3 | read partially (metadata) | Licence and activity |
| S-52 | https://github.com/eclipse-capella/capella (metadata) | Eclipse Capella | Eclipse Foundation / Thales / Obeo | v7.1.0, 2026-08-03 | read partially (metadata) | EPL-2.0, activity |
| S-53 | Search: Capella / Team for Capella (Wikipedia, mbse-capella.org, Obeo) | Capella ecosystem | various | various | search summary only | Team for Capella positioning |
| S-54 | https://github.com/ModelioOpenSource/Modelio (metadata) | Modelio | Modeliosoft | v6.2.0, 2026-08-26 | read partially (metadata) | GPL-3.0 |
| S-55 | Search: Papyrus SysML 2.0 / SysON (projects.eclipse.org, SysON docs) | Papyrus and SysON relationship | Eclipse / CEA | various | search summary only | Papyrus SysML v2 is delivered through SysON |

## D. Commercial tool documentation (benchmark)

| ID | URL | Title | Publisher | Date of item | Access level | Used for |
|---|---|---|---|---|---|---|
| S-56 | https://docs.nomagic.com/SYSML2P/2026x-refresh1/catia-magic-cameo-sysml-v2-solution-312246433.html | CATIA Magic / Cameo SysML v2 solution | Dassault Systèmes | 2026x Refresh1 | read partially (fetched) | SysML v2 textual editor, API conformance claim, TWC collaboration, migration, evaluation |
| S-57 | Search: CATIA Magic SysML v2 2026x (docs.nomagic.com SYSML2P/SYSML2EP, GoEngineer, TriMech) | CATIA Magic SysML v2 editions and prerequisites | various | 2025–2026 | search summary only | Editions required, Community Edition 500-element limit, 2026x HF1 |
| S-58 | https://docs.nomagic.com/x/IYE5C | Teamwork Cloud and Services 2024x: Cassandra installation | Dassault Systèmes | 2024x | read partially (fetched) | TWC uses Apache Cassandra (4.0/4.1) |
| S-59 | Search: Teamwork Cloud Cassandra (2021x–2024x docs) | TWC sizing and deployment | Dassault Systèmes | various | search summary only | Cassandra topology, NVMe advice |
| S-60 | Search: TWC merging and element locking (MagicDraw/TWC 19.0–2022x docs) | TWC merge and lock | Dassault Systèmes | various | search summary only | 3-way merge, partial locking, element locks |
| S-61 | Search: MagicDraw 2024x dependency matrix / generic table | MagicDraw analysis diagrams | Dassault Systèmes | 2024x | search summary only | Matrices, generic tables, relation map |
| S-62 | Search: MagicDraw active validation | MagicDraw validation | Dassault Systèmes | 2024x | search summary only | Active validation suites |
| S-63 | Search: MagicDraw smart manipulator / relation map | MagicDraw diagram UX | Dassault Systèmes | 2024x / 19.0 | search summary only | Smart manipulators, relation map |
| S-64 | Search: Cameo Simulation Toolkit 2024x FMI / Simulink | CST co-simulation | Dassault Systèmes | 2024x | search summary only | FMI 1.0/2.0, Simulink co-simulation, FMU export |
| S-65 | Search: MagicDraw macros (Macro Engine) | MagicDraw scripting | Dassault Systèmes | 2021x–2024x | search summary only | Groovy, JavaScript (Rhino), Jython, BeanShell; Open API |
| S-66 | Search: Cameo Collaborator for TWC | Cameo Collaborator | Dassault Systèmes | 2024x | search summary only | Web publishing, review and comments |
| S-67 | https://www.ibm.com/new/announcements/scaling-sysml-v2-systems-engineering-with-ibm-rhapsody-systems-engineering-v1-8 | IBM Rhapsody Systems Engineering 1.8 announcement | IBM | GA 2026-07-09 | read partially (fetched) | Web-based SysML v2 tool, MCP API, reporting, PLE early access |
| S-68 | Search: IBM Rhapsody SysML v2 (IBM, SodiusWillert, 321Gang, IBM Ideas) | Rhapsody SE positioning | various | 2024–2026 | search summary only | Textual and graphical v2, JS/Python extensions, SE–SD exchange gap |
| S-69 | Search: IBM Rhapsody (classic) simulation / Java API | Rhapsody (Systems Design) | IBM | various | search summary only | Animation, FMI/FMU, Java API |
| S-70 | Search: Sparx Enterprise Architect SysML v2 (17.0 guide, forum, newsletter) | EA SysML support | Sparx Systems | 2023–2025 | search summary only | EA 17 supports SysML 1.x only; "Trechoro" v2 product in development |
| S-71 | Search: EA DBMS repositories / Pro Cloud Server | EA repositories | Sparx Systems | 15.0–17.0 | search summary only | DBMS repositories, Pro Cloud Server |
| S-72 | Search: EA scripting / automation interface | EA scripting | Sparx Systems | 9–15 | search summary only | JavaScript, JScript, VBScript, COM automation |
| S-73 | Search: PTC Modeler SysML v2 (PTC community, PTC blogs) | PTC Modeler 10.2/10.3 | PTC | 2025–2026 | search summary only | SysML 2.0 support, OSLC integrations |
| S-74 | Search: Siemens System Modeling Workbench / Systems Modeler for SysML v2 | Siemens SE tools | Siemens / Obeo | 2018–2025 | search summary only | SMW is Capella-based; Siemens Systems Modeler for SysML v2 is powered by Rhapsody SE |
| S-77 | https://sparxsystems.com/press/newsletter/2025-08.html | Sparx newsletter Aug 2025 | Sparx Systems | 2025-08 | **not accessible** (HTTP 403); content known only through S-70 | Trechoro |

## E. Literature and community evidence (weaknesses)

| ID | URL | Title | Publisher | Date of item | Access level | Used for |
|---|---|---|---|---|---|---|
| S-75 | Search: MBSE adoption challenges (NSF PAR 10330127/10330129, INCOSE IS2024 paper 558, IEEE SysCon 2022 survey, Mountain Scholar thesis, vendor blog) | MBSE adoption barriers | various | 2021–2024 | search summary only | Tool, cost, interoperability and learning-curve barriers |
| S-76 | Search: XMI interchange problems (OMG MIWG wiki, ICSEA 2015 Zusāne et al., Brambilla blog) | Model interchange issues | various | 2009–2015 | search summary only | XMI information loss, MIWG test suite |

## Coverage note
IDs S-01 to S-77 are used, with no gaps. Spec PDFs [S-18]–[S-21] are the **1.1 / 2.1 Beta 2** documents in the release repository master (Release 2026-07). The **formal** KerML 1.0, SysML 2.0 and API 1.0 PDFs at omg.org were not downloaded. Their status comes from [S-22]–[S-24]. Their normative machine-readable files [S-25], [S-26] were downloaded and read.

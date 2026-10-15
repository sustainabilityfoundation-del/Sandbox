# SysML / MBSE Research Pack

Research input for the SysML module (brief: `docs/specifications/sysml-program.md` §3, §4, §9, §11). Status: research findings. This pack contains no decisions; ADRs must be written separately.

## Files
| File | Content |
|---|---|
| [sources.md](sources.md) | Master source register S-01…S-77, with access levels |
| [standards.md](standards.md) | KerML, SysML v2, API and Services, v1→v2 transformation: status, normative artifacts, abstract syntax, JSON/KPAR, libraries, conformance, **verified REST endpoint list** |
| [reference-implementations.md](reference-implementations.md) | SMC repositories, **licence facts** and the fixture/bundle/oracle recommendation table |
| [open-source-landscape.md](open-source-landscape.md) | Parsers, language servers, graphics/layout frameworks, MBSE platforms; build-vs-reuse recommendations |
| [tool-benchmark.md](tool-benchmark.md) | Feature matrix of Cameo family, Rhapsody, EA, PTC, Siemens, SysON, Capella |
| [capability-catalog.md](capability-catalog.md) | Essential / Advanced / Differentiator capabilities per area |
| [workflows-and-ui.md](workflows-and-ui.md) | Cameo, SysON, Rhapsody and EA workflows and UI patterns; derived UI requirements |
| [persistence-collaboration-apis.md](persistence-collaboration-apis.md) | Storage and collaboration models; standards-based vs proprietary interfaces |
| [weaknesses-opportunities.md](weaknesses-opportunities.md) | Common weaknesses and opportunities for an AI-native web tool |
| [backlog.md](backlog.md) | BL-001…BL-042 prioritised backlog traced to sources, brief § and phase |

## Method
1. **Primary artifacts read directly.**
   - Spec PDFs from the SMC release repository were downloaded and their text extracted locally (KerML 1.1 Beta 2, SysML 2.1 Beta 2 Parts 1–2, API 1.1 Beta 2) [S-18]–[S-21].
   - The OMG formal OpenAPI.json was machine-parsed to list every path, verb and parameter [S-25].
   - OMG and release KPARs were unpacked [S-26][S-27].
2. **Licences** were read from LICENSE files, README licensing sections, NOTICE files and earlier tags, cross-checked with GitHub SPDX detection and npm/PyPI metadata [S-01]–[S-17][S-28]–[S-54].
3. **Vendor capabilities** came from vendor pages where fetchable [S-56][S-58][S-67], otherwise from search summaries. Those claims are tagged **Assumed**.
4. Tags: **Verified** = seen in a read source; **Assumed** = search summary, secondary source or inference; **A0** = domain knowledge with no source consulted.

## Limits (what could not be accessed or was not done)
- **Formal** OMG PDFs (KerML 1.0, SysML 2.0, API 1.0 at omg.org) were not downloaded. Clause-level content was read from the **1.1/2.1 Beta 2** documents. Formal status and machine-readable files come from the omg.org spec pages [S-22]–[S-24]. Clause numbering and content may differ slightly between formal and beta versions.
- Only selected spec clauses were read (see access levels in [sources.md](sources.md)). Annex A (API conformance test cases) and the full textual grammar were not reviewed.
- Commercial documentation (docs.nomagic.com, IBM, Sparx, PTC, Siemens) was mostly seen through search summaries. The Sparx newsletter returned HTTP 403 [S-77]. No commercial tool was run. Every benchmark cell marked A or A0 needs confirmation.
- **ReqIF** support of the benchmarked tools was not verified.
- Licences of PlantUML (a pilot dependency), Papyrus and Team for Capella were not checked.
- This is not legal advice. Licence interpretations (bundling EPL library files, using OMG schema files for codegen) need owner/legal confirmation.

## Top-10 findings that should drive architecture
1. **Standards are formal and stable enough to build on.** KerML 1.0, SysML 2.0 and API 1.0 are Formal (Sep 2025; formal/26-03-01…04), with 1.1/2.1 revisions in Beta 2 [S-22]–[S-24][S-03]. Target the 2025-02-01 artifacts and plan a 1.1/2.1 migration.
2. **Licence change in April 2026.** From SysML-v2-Release tag **2026-04**, all models (libraries, examples, training) are **EPL-2.0**. Earlier tags were **LGPL-3.0** [S-01][S-04][S-05]. Copies of the libraries elsewhere (for example SysON's NOTICE: LGPL-3.0-only) carry the old licence [S-31]. Source fixtures and bundled libraries only from tags ≥ 2026-04.
3. **The pilot is a viable CI oracle and nothing more.** It is EPL-2.0, Java 21 and released monthly [S-08][S-09][S-11]. It cannot be part of a TS product. The API Java/Python clients are LGPL-3.0 and stale [S-13]. The Cookbook has no licence [S-15].
4. **JSON is the canonical model form.** KerML 10.4 JSON (`@id` = elementId, `@type` = metaclass, references as `{@id}`) is the standard serialisation and the API payload form [S-18][S-25]. Use it for storage (JSONB) and the wire.
5. **The minimum conformance bar is Abstract Syntax plus Model Interchange (KPAR).** Text and graphics are optional conformance points [S-18][S-19]. KPAR import/export is therefore Phase-1/2 critical. Library element IDs are normative UUID v5 [S-18].
6. **The repository should implement the API's commit model.** Immutable multi-parent Commits, DataVersion/DataIdentity, mutable Branches, immutable Tags, cursor pagination, Derived Property Passthrough/Full conformance levels [S-21][S-25]. This gives semantic diff/merge on element identity.
7. **Ownership lives in relationships.** Containment is chains of OwningMembership/FeatureMembership elements, so persistence and the browser must treat relationships as first-class elements [S-18].
8. **Diagrams are views, and their layout is not standardised.** Standard views (8) are library view definitions; diagrams are views exposing model content [S-19]. The v1→v2 transformation covers models, not diagrams [S-20]. Keep layout as private view state and generate v2 views for v1 imports.
9. **Build the parser; reuse layout.** The only mature TS SysML parser (sysml-2ls, Langium) was archived and replaced by closed source after a performance rewrite [S-28][S-29]. SysON delegates parsing to that CLI [S-32]. A hand-written incremental TS parser driven by the official KEBNF, plus elkjs (EPL-2.0) for layout and an own React/SVG projection renderer, gives control and keeps licensing clean [S-01][S-40][S-42].
10. **The market gap is web-native, versioned and AI-operable.** Cameo has the depth, but it is desktop and edition-gated, and Teamwork Cloud runs on Cassandra [S-56][S-57][S-58]. SysON is web but has a single commit/branch and partial text/API support [S-33]. Only IBM advertises an MCP/AI API [S-67]. Typed operations shared by UI and AI, git-like collaboration on the standard API, and executable validation (as OpenSysML demonstrates) are the differentiators [S-46].

## Sources
Full details are in [sources.md](sources.md). All sources accessed 2026-10-14.

| ID | URL | Title | Accessed | Access level |
|---|---|---|---|---|
| S-01 | https://github.com/Systems-Modeling/SysML-v2-Release (raw README.md, master) | SysML v2 Release README | 2026-10-14 | read in full |
| S-02 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/LICENSE | Release repo LICENSE (EPL-2.0) | 2026-10-14 | read partially (title, Secondary Licence definition, Exhibit A) |
| S-03 | https://github.com/Systems-Modeling/SysML-v2-Release/releases | Release repo releases | 2026-10-14 | read partially (fetched; latest 5 releases) |
| S-04 | https://github.com/Systems-Modeling/SysML-v2-Release/releases/tag/2026-04 | Release 2026-04 notes | 2026-10-14 | read partially (fetched; full notes) |
| S-05 | https://raw.githubusercontent.com/Systems-Modeling/SysML-v2-Release/2026-03/README.md and the same path at tag 2025-02, plus LICENSE at both tags | Release README and LICENSE at earlier tags | 2026-10-14 | read partially (licensing section, LICENSE heading) |
| S-06 | https://api.github.com/repos/Systems-Modeling/SysML-v2-Release/git/trees/master?recursive=1 | Release repo file tree (1,759 paths) | 2026-10-14 | read in full (listing) |
| S-07 | Raw files: `sysml.library/Kernel Libraries/Kernel Semantic Library/Base.kerml`, `sysml.library/Domain Libraries/Quantities and Units/ISQBase.sysml`, `sysml.library/Systems Library/.meta.json` | Library file headers | 2026-10-14 | read partially (first 25–30 lines each) |
| S-08 | https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation (README.adoc raw, root listing) | Pilot Implementation README | 2026-10-14 | read partially (licence line, install, copyright header template) |
| S-09 | https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation/releases | Pilot releases | 2026-10-14 | read partially (fetched; latest 5) |
| S-10 | https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation/releases/tag/2026-04 | Pilot release 2026-04 | 2026-10-14 | read partially (fetched) |
| S-11 | Raw: Pilot `LICENSE`, `org.omg.sysml.plantuml/META-INF/MANIFEST.MF`, `pom.xml`; `LICENSE-GPL` returned 404 | Pilot licence and PlantUML dependency | 2026-10-14 | read partially |
| S-12 | https://github.com/Systems-Modeling/SysML-v2-API-Services (README, LICENSE) | API Services pilot | 2026-10-14 | read partially (fetched README; raw LICENSE heading) |
| S-13 | https://api.github.com/orgs/Systems-Modeling/repos and per-repo `/releases?per_page=1` | Systems-Modeling org metadata | 2026-10-14 | read in full (JSON) |
| S-14 | Raw: SysML-v2-API-Java-Client `LICENSE`, root listing; Python client metadata | Java/Python API clients | 2026-10-14 | read partially |
| S-15 | https://github.com/Systems-Modeling/SysML-v2-API-Cookbook (root listing, README) | API Cookbook | 2026-10-14 | read in full (listing); README scanned for licence |
| S-16 | https://github.com/Systems-Modeling/OOSEM-v2-Release/blob/HEAD/LICENSE.md | OOSEM v2 Release LICENSE | 2026-10-14 | read partially |
| S-17 | https://github.com/Systems-Modeling/SysML-v2-AADL-Release (README) | AADL library for SysML v2 | 2026-10-14 | read partially (licence and status sections) |
| S-18 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/1-Kernel_Modeling_Language.pdf | Kernel Modeling Language (KerML) v1.1 Beta 2 (Release 2026-07) | 2026-10-14 | read partially (Cl. 2 Conformance, 3, 6.1 Architecture, 8.3 TOC and metaclass descriptions for Element, Relationship, Membership, OwningMembership, FeatureMembership, Namespace, Type, Classifier, Feature, Specialization, Subclassification, Subsetting, FeatureTyping, Conjugation; 9.1 library UUID rule; Cl. 10 Model Interchange in full; Annex A start) |
| S-19 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/2a-OMG_Systems_Modeling_Language.pdf | OMG SysML v2.1 Beta 2, Part 1: Language Specification | 2026-10-14 | read partially (TOC, Cl. 2 Conformance, 3, 7.26 Views and Viewpoints, 8.2.3 graphical notation intro, 9.2.20 Standard View Definitions) |
| S-20 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/2b-SysML_v1_to_v2_Transformation.pdf | OMG SysML v2.1 Beta 2, Part 2: SysML v1 to SysML v2 Transformation | 2026-10-14 | read partially (TOC, Cl. 1 Scope, 2 Conformance, 3, 6 Mapping Approach; keyword search for "diagram") |
| S-21 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/3-Systems_Modeling_API_and_Services.pdf | Systems Modeling API and Services v1.1 Beta 2 | 2026-10-14 | read partially (front-matter licence, Cl. 2 Conformance, 3, 7.1 API Model, 8.1 REST/HTTP PSM incl. Tables 9–10 and pagination, 8.2 media types, Annex B.1 examples) |
| S-22 | https://www.omg.org/spec/SysML/2.0 | OMG SysML 2.0 spec page | 2026-10-14 | read partially (fetched) |
| S-23 | https://www.omg.org/spec/KerML/1.0 | KerML 1.0 spec page | 2026-10-14 | read partially (fetched) |
| S-24 | https://www.omg.org/spec/SystemsModelingAPI/1.0 | Systems Modeling API and Services 1.0 spec page | 2026-10-14 | read partially (fetched) |
| S-25 | https://www.omg.org/spec/SystemsModelingAPI/20250201/OpenAPI.json | Systems Modeling API and Services REST/HTTP PSM, OpenAPI 3.1, version 1.0 | 2026-10-14 | read in full (machine-parsed: all paths, verbs, operationIds, parameters, media types, key schemas) |
| S-26 | https://www.omg.org/spec/SysML/20250201/Systems-Library.kpar and https://www.omg.org/spec/KerML/20250201/Semantic-Library.kpar | Normative library KPARs (Systems Library 2.0.0, Kernel Semantic Library 1.0.0) | 2026-10-14 | read partially (archive listing, .project.json, .meta.json, one library file) |
| S-27 | Raw: `sysml.library.kpar/SysML_Quantities_and_Units_Library-2.1.0-dev.20260801.kpar` (.project.json) | Release-repo KPAR metadata | 2026-10-14 | read partially |
| S-28 | https://github.com/sensmetry/sysml-2ls (README, LICENSE, API metadata, `packages/syside-languageserver/package.json`) | SysIDE Editor Legacy (sysml-2ls) | 2026-10-14 | read partially (README, LICENSE header, package.json dependencies) |
| S-29 | https://sensmetry.com/syside-editor-rebirth-sysml-v2-0-50x-speed-up-license-change-free-as-before/ | "Syside Editor rebirth: SysML v2.0, 50x speed-up, licence change" | 2026-10-14 | read partially (fetched) |
| S-30 | https://pypi.org/pypi/syside/json | PyPI `syside` (Syside Automator) | 2026-10-14 | read in full (metadata) |
| S-31 | https://github.com/eclipse-syson/syson (README.md, NOTICE, LICENSE-LGPL, recursive tree, API metadata) | Eclipse SysON | 2026-10-14 | read partially |
| S-32 | https://github.com/eclipse-syson/syson/blob/main/backend/application/syson-sysml-import/src/main/java/org/eclipse/syson/sysml/services/SysideSysMLTextImporter.java | SysON text importer | 2026-10-14 | read in full |
| S-33 | SysON repo docs: `doc/content/modules/developer-guide/pages/api/api.adoc`, `api-details.adoc`; `user-manual/pages/features/collaboration.adoc`, `import-export-textual.adoc`, `scaling-limits.adoc`, `validation.adoc` | SysON documentation sources | 2026-10-14 | read partially (first ~45 lines each) |
| S-34 | https://doc.mbse-syson.org/syson/main/user-manual/features/sysmlv2-overview.html | SysON SysML v2 overview | 2026-10-14 | read partially (fetched) |
| S-35 | https://blog.obeosoft.com/stability-and-usability-with-syson-2026-3 (and related release notes) | SysON 2026.3 release blog | 2026-10-14 | search summary only |
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
| S-49 | https://github.com/Open-MBEE/sysmlv2-testing (README) | sysmlv2-testing ledger | 2026-10-14 | read partially |
| S-50 | https://github.com/Open-MBEE/sysmlv2-web-modeler (README) | SysML v2 Visualization Service | 2026-10-14 | read partially |
| S-51 | https://github.com/DAF-Digital-Transformation-Office/PySysML2 (metadata); https://pypi.org/pypi/sysml2py/json | PySysML2; sysml2py | 2026-10-14 | read partially (metadata) |
| S-52 | https://github.com/eclipse-capella/capella (metadata) | Eclipse Capella | 2026-10-14 | read partially (metadata) |
| S-53 | Search: Capella / Team for Capella (Wikipedia, mbse-capella.org, Obeo) | Capella ecosystem | 2026-10-14 | search summary only |
| S-54 | https://github.com/ModelioOpenSource/Modelio (metadata) | Modelio | 2026-10-14 | read partially (metadata) |
| S-56 | https://docs.nomagic.com/SYSML2P/2026x-refresh1/catia-magic-cameo-sysml-v2-solution-312246433.html | CATIA Magic / Cameo SysML v2 solution | 2026-10-14 | read partially (fetched) |
| S-57 | Search: CATIA Magic SysML v2 2026x (docs.nomagic.com SYSML2P/SYSML2EP, GoEngineer, TriMech) | CATIA Magic SysML v2 editions and prerequisites | 2026-10-14 | search summary only |
| S-58 | https://docs.nomagic.com/x/IYE5C | Teamwork Cloud and Services 2024x: Cassandra installation | 2026-10-14 | read partially (fetched) |
| S-67 | https://www.ibm.com/new/announcements/scaling-sysml-v2-systems-engineering-with-ibm-rhapsody-systems-engineering-v1-8 | IBM Rhapsody Systems Engineering 1.8 announcement | 2026-10-14 | read partially (fetched) |
| S-77 | https://sparxsystems.com/press/newsletter/2025-08.html | Sparx newsletter Aug 2025 | 2026-10-14 | **not accessible** (HTTP 403); content known only through S-70 |

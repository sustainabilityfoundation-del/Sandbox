# Persistence, Collaboration, APIs and Interoperability

Sources: [sources.md](sources.md). A0 = general domain knowledge, no source consulted.

## 1. Persistence and collaboration approaches

| Approach | Storage model | Concurrency / versioning | Evidence | Tag |
|---|---|---|---|---|
| Cameo local files (`.mdzip`) | Zipped XMI-based project file | File-level; merge via the tool | A0 | Assumed |
| **Teamwork Cloud** | Server backed by **Apache Cassandra** (NoSQL, distributed). The 2024x docs give Cassandra 4.0/4.1 configuration. Cassandra can be co-located or separate; NVMe DAS recommended; managed Cassandra services (e.g. Amazon Keyspaces) not supported | Commits, branches, element locks, partial locking during merge, 3-way merge; for v2: lock-free editing with auto-merge of non-conflicting changes, patch-based branch reintegration, RBAC, SAML, auditing, cross-cluster sync | [S-58] V; [S-59] A; [S-60] A; [S-56] V | Verified (Cassandra) |
| EA file repositories (`.qea`/`.eapx`) | File databases (Access, Firebird; newer SQLite-based `.qea` A0) | File-level | [S-71] (file-based DBs) | Assumed |
| **EA DBMS repositories** | Relational DBMS (SQL Server, Oracle, MySQL, …); Pro Cloud Server for HTTP access | Element/package locking, baselines (A0) | [S-71] | Assumed |
| Rhapsody | Classic: file-based units; Rhapsody Model Manager (Jazz/ELM) [S-69]. SE: cloud-native server [S-67] | U | [S-67] V; [S-69] A | Mixed |
| SysON / Sirius Web | Server-side (PostgreSQL per the docker-compose in repo; not read, A0); GraphQL | Shared live projects; **single commit/branch** exposed via REST [S-33] | [S-33] V | Verified (versioning) |
| **SysML v2 API commit model** | Projects → immutable Commits (multi-parent) → DataVersions (payload or null) keyed by DataIdentity; Branch (mutable head), Tag (immutable) | Optimistic, merge-based; conflicts resolved in the merge commit's change set | [S-21] V | Verified |
| API Services pilot | PostgreSQL (Play/Java) implementation of the REST PSM | As the API | [S-12] V | Verified |
| OpenMBEE MMS (classic) | Java libraries (exec-mms) | Refs (branches) and commits (A0) | [S-48] V (existence) | Assumed (model) |
| OpenMBEE **Flexo MMS** | RDF in a SPARQL 1.1 quadstore (Fuseki); state and config stored alongside user data | Versioned graphs (A0) | [S-48] V | Verified (storage) |

### Recommended persistence design for our PostgreSQL repository (derived from [S-21][S-18])
| Table | Content |
|---|---|
| `project`, `branch`, `tag` | API records; branch.head → commit; tag immutable |
| `commit` | id, project, created (UTC, µs, strictly monotonic per parent), message/description |
| `commit_parent` | (commit, parent, ordinal); supports merges |
| `data_identity` | id = elementId (UUID; v5 for library elements), created_at/deleted_at derived |
| `data_version` | id, identity, commit, payload JSONB (KerML 10.4 JSON) or NULL for delete |
| `commit_snapshot` or materialised path | Fast `versionedData` at any commit: periodic full snapshots plus delta chain, or a closure table of (commit, identity) → data_version |
| Indexes | GIN on payload `@type`, owner/membership references for navigation and relationship queries (`direction=in/out/both`) |

This maps cleanly onto the platform rules (atomic `submitChanges` batch → one commit; revision checks → base commit/head compare-and-swap).

## 2. Extensibility, scripting and APIs: assessment

| Tool | Scripting / API | Standard or proprietary | Tag |
|---|---|---|---|
| Cameo | Java Open API; Macro Engine with Groovy, JavaScript (Rhino; Nashorn removed in 2024x), Jython, BeanShell [S-65]; claims SysML v2 API and Services conformance plus proprietary Model Evaluation API extensions [S-56] | Open API: proprietary. v2 REST: standard | Assumed / Verified |
| TWC | REST API (A0) | Proprietary | Assumed |
| Rhapsody | Java API (COM-based on Windows) [S-69]. SE: JS/Python extensions [S-68], **MCP API** for AI [S-67] | Proprietary; MCP is an open protocol but the tool schema is IBM's | Mixed |
| EA | Script environment (JavaScript, JScript, VBScript), Automation Interface (COM), add-ins [S-72] | Proprietary | Assumed |
| PTC Modeler | OSLC integrations (Codebeamer, Windchill, DOORS Next, Polarion) [S-73] | OSLC: standard | Assumed |
| SysON | GraphQL (Sirius Web) + partial SysML v2 REST under `/api/rest/` [S-33] | GraphQL: proprietary schema; REST: standard (partial) | Verified |
| Pilot / API Services | REST PSM reference [S-12]; Jupyter kernel [S-11] | Standard | Verified |

## 3. Import/export: standards-based versus proprietary

| Interface | Standard? | Notes | Tag |
|---|---|---|---|
| SysML v2 textual notation (`.sysml`, `.kerml`) | **Standard** (KerML/SysML concrete syntax) [S-18][S-19] | Primary human and AI exchange format | Verified |
| KerML JSON (`@id`/`@type`) | **Standard** [S-18] 10.4 | Lossless abstract-syntax form | Verified |
| KPAR (`.kpar` ZIP + `.project.json` / `.meta.json`) | **Standard** [S-18] 10.3 | Required for Model Interchange Conformance [S-19] | Verified |
| OMG XMI for KerML/SysML v2 | **Standard** (MOF XMI artifacts) [S-22][S-23] | The pilot's Eclipse XMI (`.kermlx` / `.sysmlx`) is **not** fully normative [S-01] | Verified |
| Systems Modeling API REST (OpenAPI 3.1) and OSLC PSM | **Standard** [S-21][S-24] | | Verified |
| SysML v1 XMI | Standard format, but interchange suffers information loss in practice; OMG MIWG ran a test suite of 48 cases [S-76] | | Assumed |
| v1 → v2 transformation | **Standard** mapping (model only, no diagrams) [S-20] | Vendors extend it to diagrams [S-56] | Verified |
| FMI / FMU | **Standard** (Modelica Association) | CST, Rhapsody [S-64][S-69] | Assumed |
| ReqIF | **Standard** (OMG ReqIF) | Tool support not verified in this pass | Unknown |
| OSLC | **Standard** (OASIS) | PTC [S-73]; API OSLC PSM [S-21] | Mixed |
| `.mdzip`, TWC protocols, Cameo Open API, EA `.qea`/`.eapx`/DBMS schema and COM API, Rhapsody project files and Java API, SysON GraphQL | **Proprietary** | | A0 / [S-33][S-65][S-72] |

## 4. Implications
1. Our **only native formats should be standard ones**: textual notation, KerML JSON and KPAR. Our API is the standard REST PSM (aligned subset) plus platform-internal operations. This avoids building yet another proprietary island.
2. Collaboration should follow the API model: optimistic commits and merges, not locks. Element-level semantic diff over DataIdentity is natural in this model.
3. Interop with Cameo becomes viable through the standard API that Dassault claims to implement [S-56]. Plan an interop test once access to a Cameo v2 instance is available. Owner action.

## Sources
Full details are in [sources.md](sources.md). All sources accessed 2026-10-14.

| ID | URL | Title | Accessed | Access level |
|---|---|---|---|---|
| S-01 | https://github.com/Systems-Modeling/SysML-v2-Release (raw README.md, master) | SysML v2 Release README | 2026-10-14 | read in full |
| S-11 | Raw: Pilot `LICENSE`, `org.omg.sysml.plantuml/META-INF/MANIFEST.MF`, `pom.xml`; `LICENSE-GPL` returned 404 | Pilot licence and PlantUML dependency | 2026-10-14 | read partially |
| S-12 | https://github.com/Systems-Modeling/SysML-v2-API-Services (README, LICENSE) | API Services pilot | 2026-10-14 | read partially (fetched README; raw LICENSE heading) |
| S-18 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/1-Kernel_Modeling_Language.pdf | Kernel Modeling Language (KerML) v1.1 Beta 2 (Release 2026-07) | 2026-10-14 | read partially (Cl. 2 Conformance, 3, 6.1 Architecture, 8.3 TOC and metaclass descriptions for Element, Relationship, Membership, OwningMembership, FeatureMembership, Namespace, Type, Classifier, Feature, Specialization, Subclassification, Subsetting, FeatureTyping, Conjugation; 9.1 library UUID rule; Cl. 10 Model Interchange in full; Annex A start) |
| S-19 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/2a-OMG_Systems_Modeling_Language.pdf | OMG SysML v2.1 Beta 2, Part 1: Language Specification | 2026-10-14 | read partially (TOC, Cl. 2 Conformance, 3, 7.26 Views and Viewpoints, 8.2.3 graphical notation intro, 9.2.20 Standard View Definitions) |
| S-20 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/2b-SysML_v1_to_v2_Transformation.pdf | OMG SysML v2.1 Beta 2, Part 2: SysML v1 to SysML v2 Transformation | 2026-10-14 | read partially (TOC, Cl. 1 Scope, 2 Conformance, 3, 6 Mapping Approach; keyword search for "diagram") |
| S-21 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/3-Systems_Modeling_API_and_Services.pdf | Systems Modeling API and Services v1.1 Beta 2 | 2026-10-14 | read partially (front-matter licence, Cl. 2 Conformance, 3, 7.1 API Model, 8.1 REST/HTTP PSM incl. Tables 9–10 and pagination, 8.2 media types, Annex B.1 examples) |
| S-22 | https://www.omg.org/spec/SysML/2.0 | OMG SysML 2.0 spec page | 2026-10-14 | read partially (fetched) |
| S-23 | https://www.omg.org/spec/KerML/1.0 | KerML 1.0 spec page | 2026-10-14 | read partially (fetched) |
| S-24 | https://www.omg.org/spec/SystemsModelingAPI/1.0 | Systems Modeling API and Services 1.0 spec page | 2026-10-14 | read partially (fetched) |
| S-33 | SysON repo docs: `doc/content/modules/developer-guide/pages/api/api.adoc`, `api-details.adoc`; `user-manual/pages/features/collaboration.adoc`, `import-export-textual.adoc`, `scaling-limits.adoc`, `validation.adoc` | SysON documentation sources | 2026-10-14 | read partially (first ~45 lines each) |
| S-48 | https://github.com/Open-MBEE/exec-mms, https://github.com/Open-MBEE/exec-ve, https://github.com/Open-MBEE/flexo-mms-layer1-service (README) | MMS, View Editor, Flexo MMS | 2026-10-14 | read partially |
| S-56 | https://docs.nomagic.com/SYSML2P/2026x-refresh1/catia-magic-cameo-sysml-v2-solution-312246433.html | CATIA Magic / Cameo SysML v2 solution | 2026-10-14 | read partially (fetched) |
| S-58 | https://docs.nomagic.com/x/IYE5C | Teamwork Cloud and Services 2024x: Cassandra installation | 2026-10-14 | read partially (fetched) |
| S-59 | Search: Teamwork Cloud Cassandra (2021x–2024x docs) | TWC sizing and deployment | 2026-10-14 | search summary only |
| S-60 | Search: TWC merging and element locking (MagicDraw/TWC 19.0–2022x docs) | TWC merge and lock | 2026-10-14 | search summary only |
| S-64 | Search: Cameo Simulation Toolkit 2024x FMI / Simulink | CST co-simulation | 2026-10-14 | search summary only |
| S-65 | Search: MagicDraw macros (Macro Engine) | MagicDraw scripting | 2026-10-14 | search summary only |
| S-67 | https://www.ibm.com/new/announcements/scaling-sysml-v2-systems-engineering-with-ibm-rhapsody-systems-engineering-v1-8 | IBM Rhapsody Systems Engineering 1.8 announcement | 2026-10-14 | read partially (fetched) |
| S-68 | Search: IBM Rhapsody SysML v2 (IBM, SodiusWillert, 321Gang, IBM Ideas) | Rhapsody SE positioning | 2026-10-14 | search summary only |
| S-69 | Search: IBM Rhapsody (classic) simulation / Java API | Rhapsody (Systems Design) | 2026-10-14 | search summary only |
| S-71 | Search: EA DBMS repositories / Pro Cloud Server | EA repositories | 2026-10-14 | search summary only |
| S-72 | Search: EA scripting / automation interface | EA scripting | 2026-10-14 | search summary only |
| S-73 | Search: PTC Modeler SysML v2 (PTC community, PTC blogs) | PTC Modeler 10.2/10.3 | 2026-10-14 | search summary only |
| S-76 | Search: XMI interchange problems (OMG MIWG wiki, ICSEA 2015 Zusāne et al., Brambilla blog) | Model interchange issues | 2026-10-14 | search summary only |

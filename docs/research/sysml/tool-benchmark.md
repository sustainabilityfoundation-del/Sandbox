# MBSE Tool Benchmark: Feature Matrix

**Cell format:** `Y` / `P` (partial) / `N` / `U` (unknown), then the source tag, then **V** (Verified: seen in a vendor or official page I read) or **A** (Assumed: search summary, secondary source or inference). `A0` means Assumed from general domain knowledge, **with no source consulted in this research**. Treat A0 cells as hypotheses to check. "–" means not applicable to that product. Sources: [sources.md](sources.md).

**Columns**
- **CSM**: Cameo Systems Modeler / MagicDraw / Cameo Enterprise Architecture (CATIA Magic; v1, plus the SysML v2 plugin from 2026x)
- **CST**: Cameo Simulation Toolkit
- **TWC**: Teamwork Cloud
- **CC**: Cameo Collaborator for TWC
- **RHP**: IBM Rhapsody (classic, Systems Design)
- **RSE**: IBM Rhapsody Systems Engineering (web, SysML v2)
- **EA**: Sparx Enterprise Architect 17.x
- **PTC**: PTC Modeler (formerly Windchill Modeler)
- **SIE**: Siemens: System Modeling Workbench (Capella-based) / Systems Modeler for SysML v2
- **SON**: Obeo/CEA SysON
- **CAP**: Eclipse Capella (open-source comparison)

| Capability | CSM | CST | TWC | CC | RHP | RSE | EA | PTC | SIE | SON | CAP |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Model browser / containment tree | Y [S-62] A | – | – | P "Model View resembles MagicDraw" [S-66] A | Y A0 | U | Y A0 | Y A0 | Y A0 | Y Explorer view [S-33] V | Y A0 |
| SysML v1 diagrams (BDD, IBD, act, stm, sd, req, par, pkg, uc) | Y A0 | – | – | P (view only) [S-66] A | Y stm/act/seq animation [S-69] A | N A0 | Y SysML 1.1–1.5 [S-70] A | Y A0 | P Arcadia + SysML import/export add-on [S-74] A | N (v2 only) [S-34] V | N (Arcadia diagrams) A0 |
| SysML v2 standard views (General, Interconnection, Action Flow, State Transition, Sequence, Grid, Browser, Geometry) | Y graphical/tabular/textual, query-generated views [S-56] V | – | – | U | N A0 | Y [S-67] V, [S-68] A | N [S-70] A | P (10.2 areas) [S-73] A | Y via Systems Modeler (Rhapsody SE) [S-74] A | Y all 8 [S-34] V | N |
| SysML v2 textual notation | Y two-way text–diagram sync, validated as you type [S-56] V | – | – | U | N A0 | Y [S-68] A | N [S-70] A | Y 10.3 [S-73] A | U | P import/export add-on; editor planned [S-33][S-34] V | N |
| Relationship / dependency matrices, generic tables | Y dependency matrix, generic table [S-61] A | – | – | U | Y A0 | U | Y A0 | Y A0 | Y A0 | P Grid view, table services [S-34][S-31] V | Y A0 |
| Relation map (graph exploration) | Y [S-63] A | – | – | U | U | U | U | U | U | N A0 | U |
| Model validation (rule sets, active validation) | Y active validation suites [S-62] A; v2 validation [S-56] V | – | – | – | Y A0 | Y configurable quality checks [S-68] A | Y A0 | U | Y A0 | P experimental validation view [S-33] V | Y A0 |
| Execution: state machines / activities | – | Y A0 | – | – | Y animation [S-69] A | U | Y A0 | U | U | N A0 | N A0 |
| Parametrics / evaluation | Y v2 Evaluation plugin: calculations, constraints, requirements, roll-ups, trade studies [S-56] V | Y A0 | – | – | P A0 | U | P A0 | P analysis areas [S-73] A | U | N A0 | N A0 |
| External solvers (FMI, Modelica, MATLAB) | – | Y FMI 1.0/2.0, Simulink, FMU export; Modelica U [S-64] A | – | – | Y FMI/FMU co-sim [S-69] A | U | U | U | U | N | N |
| Server repository | – | – | Y, Apache **Cassandra** backend [S-58] V | – (on TWC) | P Rhapsody Model Manager [S-69] A | Y web, multi-user [S-67] V | Y DBMS repos (SQL Server, Oracle, …) + Pro Cloud Server [S-71] A | U | U | Y web server [S-31] V | P Team for Capella [S-53] A |
| Concurrency model | – | – | Lock-free simultaneous editing, auto-merge non-conflicting [S-56] V; element locks, partial lock on merge [S-60] A | – | U | U | Lock-based A0 | U | U | Real-time shared projects; ≤ 80 concurrent users per server [S-33] V | U |
| Branches / baselines / tags | – | – | Y branching, patch-based reintegration [S-56] V | Y multi-branch review [S-56] V | U | U | Y baselines A0 | U | U | N (single commit/branch per project) [S-33] V | U |
| Semantic diff / 3-way merge | Y 3-way merge between branches [S-60] A | – | Y [S-60] A | – | U | U | P baseline compare A0 | U | U | N [S-33] V | P A0 |
| Access control | – | – | Y RBAC, SAML, DoD data markings, auditing [S-56] V | Y A0 | U | U | Y A0 | U | U | P security page exists [S-34] A | U |
| Review / commenting on web | – | – | – | Y textual and graphical comments, web edits [S-66] A; MagicLab Collaborator [S-56] V | U | Y in-context review [S-67] V | U | U | U | P share by link [S-33] V | U |
| Requirements traceability | Y A0 | – | – | – | Y A0 | Y A0 | Y A0 | Y OSLC to DOORS Next, Codebeamer, Polarion [S-73] A | Y Requirement VP, Teamcenter links [S-74] A | Y v2 requirements (view set) [S-34] V | Y A0 |
| ReqIF import/export | U | – | – | – | U | U | U | U | U | U | U |
| SysML v2 support status | Y 2026x plugin; Enterprise edition, CEA, MCSE, MSoSA only; Community Edition ≤ 500 elements [S-56] V, [S-57] A | P (v2 evaluation plugin instead) [S-56] V | Y collaboration for v2 [S-56] V | U | N A0 | Y native, GA 1.8 (Jul 2026) [S-67] V | N; "Trechoro" v2 product in development [S-70] A | P 10.2 (2025) / 10.3 [S-73] A | Y Systems Modeler (Rhapsody SE-powered, Jun 2025) [S-74] A | Y [S-31] V | N |
| APIs / scripting | Open API; macros: Groovy, JavaScript (Rhino), Jython, BeanShell [S-65] A; SysML v2 API conformance claimed [S-56] V | U | REST A0 | U | Java API [S-69] A | JS/Python extensions [S-68] A; MCP API [S-67] V | JavaScript, JScript, VBScript; COM automation [S-72] A | OSLC [S-73] A | U | GraphQL; partial v2 REST at `/api/rest/` [S-33] V | Python4Capella A0 |
| Interoperability: XMI | Y A0 | – | – | – | Y A0 | U | Y XMI 1.1/2.1 [S-72] A | U | P SysML import/export [S-74] A | N A0 | N A0 |
| Interoperability: SysML v2 API / KPAR | Y API [S-56] V | – | – | – | N | U | N | U | U | P JSON/text exchange; API partial [S-33] V | N |
| Interoperability: FMI | – | Y [S-64] A | – | – | Y [S-69] A | U | U | U | U | N | N |
| Interoperability: OSLC | U | – | U | – | U | U | U | Y [S-73] A | U | N A0 | U |
| Document generation / publishing | Y Report Wizard templates [S-61] A | – | – | Y document portal, templates [S-66] A | Y A0 | Y via ELO Publishing [S-67] V | Y A0 | U | U | P publication page exists [S-34] A | Y A0 |
| Variant management | U | – | – | – | U | P early-access PTC Pure Variants integration [S-67] V | U | Y variability modelling (10.2) [S-73] A | Y Teamcenter Product Configurator link (SMW) [S-74] A | U | U |
| Web / browser client | N (desktop); MagicLab read-only web viewer [S-56] V | – | – | Y [S-66] A | N A0 | Y cloud-native, air-gapped capable [S-67] V | N (desktop; WebEA A0) | P Azure deployment 10.3 [S-73] A | U | Y [S-31] V | N |
| AI assistance | U | – | – | – | U | Y MCP API, HarmonyIQ guidance [S-67] V | U | U | U | U | U |

## Reading the matrix
- The deepest v1 feature set and collaboration stack is Dassault's (CSM + CST + TWC + CC). It is now extended to SysML v2 with a textual editor, evaluation and SysML v2 API conformance claims [S-56]. The v2 features are restricted to the higher editions [S-57].
- IBM and Siemens converge on **Rhapsody SE** as a web-native v2 tool [S-67][S-74]. IBM is first to advertise an **MCP API** for AI agents [S-67].
- EA had no SysML v2 support in its 17 line according to the sources found [S-70]. PTC claims partial SysML 2.0 coverage [S-73].
- Open source: SysON is the only web SysML v2 graphical editor, but it has **no versioning** (single commit/branch) and partial API/text support [S-33].
- **ReqIF** support could not be verified for any tool in this pass. It is a research gap.

## Sources
Full details are in [sources.md](sources.md). All sources accessed 2026-10-14.

| ID | URL | Title | Accessed | Access level |
|---|---|---|---|---|
| S-31 | https://github.com/eclipse-syson/syson (README.md, NOTICE, LICENSE-LGPL, recursive tree, API metadata) | Eclipse SysON | 2026-10-14 | read partially |
| S-33 | SysON repo docs: `doc/content/modules/developer-guide/pages/api/api.adoc`, `api-details.adoc`; `user-manual/pages/features/collaboration.adoc`, `import-export-textual.adoc`, `scaling-limits.adoc`, `validation.adoc` | SysON documentation sources | 2026-10-14 | read partially (first ~45 lines each) |
| S-34 | https://doc.mbse-syson.org/syson/main/user-manual/features/sysmlv2-overview.html | SysON SysML v2 overview | 2026-10-14 | read partially (fetched) |
| S-53 | Search: Capella / Team for Capella (Wikipedia, mbse-capella.org, Obeo) | Capella ecosystem | 2026-10-14 | search summary only |
| S-56 | https://docs.nomagic.com/SYSML2P/2026x-refresh1/catia-magic-cameo-sysml-v2-solution-312246433.html | CATIA Magic / Cameo SysML v2 solution | 2026-10-14 | read partially (fetched) |
| S-57 | Search: CATIA Magic SysML v2 2026x (docs.nomagic.com SYSML2P/SYSML2EP, GoEngineer, TriMech) | CATIA Magic SysML v2 editions and prerequisites | 2026-10-14 | search summary only |
| S-58 | https://docs.nomagic.com/x/IYE5C | Teamwork Cloud and Services 2024x: Cassandra installation | 2026-10-14 | read partially (fetched) |
| S-60 | Search: TWC merging and element locking (MagicDraw/TWC 19.0–2022x docs) | TWC merge and lock | 2026-10-14 | search summary only |
| S-61 | Search: MagicDraw 2024x dependency matrix / generic table | MagicDraw analysis diagrams | 2026-10-14 | search summary only |
| S-62 | Search: MagicDraw active validation | MagicDraw validation | 2026-10-14 | search summary only |
| S-63 | Search: MagicDraw smart manipulator / relation map | MagicDraw diagram UX | 2026-10-14 | search summary only |
| S-64 | Search: Cameo Simulation Toolkit 2024x FMI / Simulink | CST co-simulation | 2026-10-14 | search summary only |
| S-65 | Search: MagicDraw macros (Macro Engine) | MagicDraw scripting | 2026-10-14 | search summary only |
| S-66 | Search: Cameo Collaborator for TWC | Cameo Collaborator | 2026-10-14 | search summary only |
| S-67 | https://www.ibm.com/new/announcements/scaling-sysml-v2-systems-engineering-with-ibm-rhapsody-systems-engineering-v1-8 | IBM Rhapsody Systems Engineering 1.8 announcement | 2026-10-14 | read partially (fetched) |
| S-68 | Search: IBM Rhapsody SysML v2 (IBM, SodiusWillert, 321Gang, IBM Ideas) | Rhapsody SE positioning | 2026-10-14 | search summary only |
| S-69 | Search: IBM Rhapsody (classic) simulation / Java API | Rhapsody (Systems Design) | 2026-10-14 | search summary only |
| S-70 | Search: Sparx Enterprise Architect SysML v2 (17.0 guide, forum, newsletter) | EA SysML support | 2026-10-14 | search summary only |
| S-71 | Search: EA DBMS repositories / Pro Cloud Server | EA repositories | 2026-10-14 | search summary only |
| S-72 | Search: EA scripting / automation interface | EA scripting | 2026-10-14 | search summary only |
| S-73 | Search: PTC Modeler SysML v2 (PTC community, PTC blogs) | PTC Modeler 10.2/10.3 | 2026-10-14 | search summary only |
| S-74 | Search: Siemens System Modeling Workbench / Systems Modeler for SysML v2 | Siemens SE tools | 2026-10-14 | search summary only |

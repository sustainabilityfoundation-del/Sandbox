# Common Weaknesses and Opportunities for an AI-Native Web MBSE Environment

Evidence quality is mixed. Literature evidence came from search summaries only ([S-75], [S-76]), so it is **Assumed**. Product facts are tagged per source. Sources: [sources.md](sources.md).

## 1. Weaknesses observed

| # | Weakness | Evidence | Tag |
|---|---|---|---|
| W1 | **Steep learning curve / perceived complexity** | Adoption studies report insufficient tool knowledge and lack of skilled staff. Perceived complexity is a barrier. A vendor blog calls the learning curve one of the most common barriers [S-75] | Assumed |
| W2 | **Tool issues are a real but secondary barrier** | An IEEE SysCon 2022 aerospace survey ranked cultural issues (42%) and workforce issues (22%) above tool issues (12%) [S-75] | Assumed |
| W3 | **Interoperability gaps** | INCOSE IS2024 material lists lack of standardisation and interoperability among tools [S-75]. XMI interchange still loses information [S-76]. Even the reference XMI for v2 libraries is Eclipse XMI, "not a fully normative OMG XMI" [S-01] | Assumed / Verified |
| W4 | **Desktop-centric, heavyweight clients** | Cameo is desktop with a separate read-only web viewer and a separate Collaborator product [S-56][S-66]. EA is desktop with a cloud server add-on [S-71] | Verified / Assumed |
| W5 | **Collaboration friction** | Element locking and lock-during-merge in TWC [S-60]. SysON has no commit history or branches [S-33] | Assumed / Verified |
| W6 | **Scale ceilings** | SysON documents ~150k elements, 1,000 elements per diagram and 80 concurrent users per server [S-33]. Sensmetry rewrote its Langium-based editor for a claimed 50x speed-up, which implies the earlier stack hit performance limits [S-28][S-29] | Verified (stated limits) / Assumed (causality) |
| W7 | **Licensing cost and edition gating** | Cameo SysML v2 needs the Enterprise edition or higher-tier products; the free Community Edition is capped at 500 elements [S-57]. Collaborator commenting needs a separate licence [S-56] | Assumed / Verified |
| W8 | **Fragmented SysML v2 maturity** | EA had no v2 in the 17 line [S-70]; PTC partial [S-73]; SysON partial text and API [S-33]; Rhapsody SE lacks exchange with Rhapsody v1 projects [S-68] | Assumed / Verified |
| W9 | **Closed source drift in open tooling** | SysIDE moved from EPL/GPL to closed source [S-28][S-29]. Pilot clients remain LGPL and stale since 2021 [S-13] | Verified |
| W10 | **AI largely absent or bolt-on** | Only IBM advertises an MCP API and model-aware guidance (Rhapsody SE 1.8) [S-67]. No other benchmarked vendor page read showed AI features | Verified (IBM) / Assumed (absence elsewhere) |
| W11 | **Validation is syntactic, not behavioural** | OpenSysML reports that a public Apollo 11 model passes the pilot validator without findings yet has defects only execution reveals [S-46] | Verified (project claim) |

## 2. Opportunities

| # | Opportunity | Concrete product move | Addresses | Evidence base |
|---|---|---|---|---|
| O1 | **Text-first and diagram-first parity in the browser** | Single TS semantic core shared by client, worker and server. Text, diagram, tree and table update incrementally from the same model | W1, W4, W8 | [S-56] (competitor sells sync), [S-34] (SysON gap) |
| O2 | **Git-like collaboration on the standard API model** | Immutable commits, branches, tags, element-level semantic diff, 3-way merge with conflict UI; optimistic concurrency; review as commits | W5 | [S-21][S-33][S-60] |
| O3 | **Standards-only interchange** | KPAR, KerML JSON, textual notation, REST PSM subset. No proprietary file format | W3 | [S-18][S-19][S-21] |
| O4 | **AI through typed operations** | Every editor command is a typed operation usable by the assistant. AI proposals are previewed as diffs/commits on a branch. Also expose an MCP-style surface | W10, W1 | [S-67] (IBM shows market direction); platform AI rules |
| O5 | **AI as tutor and reviewer** | Explain diagnostics, suggest idiomatic v2 patterns from the standard library, check requirement coverage | W1, W2, W11 | [S-46][S-75] |
| O6 | **Executable semantics as validation** | Evaluate calculations and units, requirement checks and roll-ups in TS; use execution to find defects static checks miss | W11 | [S-46][S-56] |
| O7 | **Performance by design** | Hand-written incremental parser, worker-based validation and layout (elkjs), virtualised views; set explicit scale targets above SysON's published ones | W6 | [S-33][S-40] |
| O8 | **Low entry cost** | Free tier without crippling element caps; v2 features not edition-gated | W7 | [S-57] |
| O9 | **Cross-tool digital thread inside the platform** | Native links to the platform Requirements and CAD tools via `represents` relations; OSLC later | W3 | [S-73] (OSLC as industry practice) |
| O10 | **v1 migration path** | Implement a subset of the v1→v2 mappings for XMI import; diagrams re-projected as standard views with auto layout | W8 | [S-20][S-56] |

## Sources
Full details are in [sources.md](sources.md). All sources accessed 2026-10-14.

| ID | URL | Title | Accessed | Access level |
|---|---|---|---|---|
| S-01 | https://github.com/Systems-Modeling/SysML-v2-Release (raw README.md, master) | SysML v2 Release README | 2026-10-14 | read in full |
| S-13 | https://api.github.com/orgs/Systems-Modeling/repos and per-repo `/releases?per_page=1` | Systems-Modeling org metadata | 2026-10-14 | read in full (JSON) |
| S-18 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/1-Kernel_Modeling_Language.pdf | Kernel Modeling Language (KerML) v1.1 Beta 2 (Release 2026-07) | 2026-10-14 | read partially (Cl. 2 Conformance, 3, 6.1 Architecture, 8.3 TOC and metaclass descriptions for Element, Relationship, Membership, OwningMembership, FeatureMembership, Namespace, Type, Classifier, Feature, Specialization, Subclassification, Subsetting, FeatureTyping, Conjugation; 9.1 library UUID rule; Cl. 10 Model Interchange in full; Annex A start) |
| S-19 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/2a-OMG_Systems_Modeling_Language.pdf | OMG SysML v2.1 Beta 2, Part 1: Language Specification | 2026-10-14 | read partially (TOC, Cl. 2 Conformance, 3, 7.26 Views and Viewpoints, 8.2.3 graphical notation intro, 9.2.20 Standard View Definitions) |
| S-20 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/2b-SysML_v1_to_v2_Transformation.pdf | OMG SysML v2.1 Beta 2, Part 2: SysML v1 to SysML v2 Transformation | 2026-10-14 | read partially (TOC, Cl. 1 Scope, 2 Conformance, 3, 6 Mapping Approach; keyword search for "diagram") |
| S-21 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/3-Systems_Modeling_API_and_Services.pdf | Systems Modeling API and Services v1.1 Beta 2 | 2026-10-14 | read partially (front-matter licence, Cl. 2 Conformance, 3, 7.1 API Model, 8.1 REST/HTTP PSM incl. Tables 9–10 and pagination, 8.2 media types, Annex B.1 examples) |
| S-28 | https://github.com/sensmetry/sysml-2ls (README, LICENSE, API metadata, `packages/syside-languageserver/package.json`) | SysIDE Editor Legacy (sysml-2ls) | 2026-10-14 | read partially (README, LICENSE header, package.json dependencies) |
| S-29 | https://sensmetry.com/syside-editor-rebirth-sysml-v2-0-50x-speed-up-license-change-free-as-before/ | "Syside Editor rebirth: SysML v2.0, 50x speed-up, licence change" | 2026-10-14 | read partially (fetched) |
| S-33 | SysON repo docs: `doc/content/modules/developer-guide/pages/api/api.adoc`, `api-details.adoc`; `user-manual/pages/features/collaboration.adoc`, `import-export-textual.adoc`, `scaling-limits.adoc`, `validation.adoc` | SysON documentation sources | 2026-10-14 | read partially (first ~45 lines each) |
| S-34 | https://doc.mbse-syson.org/syson/main/user-manual/features/sysmlv2-overview.html | SysON SysML v2 overview | 2026-10-14 | read partially (fetched) |
| S-40 | https://github.com/kieler/elkjs (LICENSE.md), npm `elkjs` | elkjs (ELK layout for JS) | 2026-10-14 | read partially (LICENSE, metadata) |
| S-46 | https://github.com/Open-MBEE/OpenSysML (README) | OpenSysML REDK | 2026-10-14 | read partially (intro sections) |
| S-56 | https://docs.nomagic.com/SYSML2P/2026x-refresh1/catia-magic-cameo-sysml-v2-solution-312246433.html | CATIA Magic / Cameo SysML v2 solution | 2026-10-14 | read partially (fetched) |
| S-57 | Search: CATIA Magic SysML v2 2026x (docs.nomagic.com SYSML2P/SYSML2EP, GoEngineer, TriMech) | CATIA Magic SysML v2 editions and prerequisites | 2026-10-14 | search summary only |
| S-60 | Search: TWC merging and element locking (MagicDraw/TWC 19.0–2022x docs) | TWC merge and lock | 2026-10-14 | search summary only |
| S-66 | Search: Cameo Collaborator for TWC | Cameo Collaborator | 2026-10-14 | search summary only |
| S-67 | https://www.ibm.com/new/announcements/scaling-sysml-v2-systems-engineering-with-ibm-rhapsody-systems-engineering-v1-8 | IBM Rhapsody Systems Engineering 1.8 announcement | 2026-10-14 | read partially (fetched) |
| S-68 | Search: IBM Rhapsody SysML v2 (IBM, SodiusWillert, 321Gang, IBM Ideas) | Rhapsody SE positioning | 2026-10-14 | search summary only |
| S-70 | Search: Sparx Enterprise Architect SysML v2 (17.0 guide, forum, newsletter) | EA SysML support | 2026-10-14 | search summary only |
| S-71 | Search: EA DBMS repositories / Pro Cloud Server | EA repositories | 2026-10-14 | search summary only |
| S-73 | Search: PTC Modeler SysML v2 (PTC community, PTC blogs) | PTC Modeler 10.2/10.3 | 2026-10-14 | search summary only |
| S-75 | Search: MBSE adoption challenges (NSF PAR 10330127/10330129, INCOSE IS2024 paper 558, IEEE SysCon 2022 survey, Mountain Scholar thesis, vendor blog) | MBSE adoption barriers | 2026-10-14 | search summary only |
| S-76 | Search: XMI interchange problems (OMG MIWG wiki, ICSEA 2015 Zusāne et al., Brambilla blog) | Model interchange issues | 2026-10-14 | search summary only |

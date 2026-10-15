# Systems Modeling Community Reference Implementations: Contents and Licences

Licence facts come from LICENSE files, README licensing sections and GitHub's SPDX detection, as cited. **This is engineering research, not legal advice.** The recommendations need owner and legal confirmation before anything ships. Sources: [sources.md](sources.md).

## 1. Repository inventory

| Repository | Contents | Language / runtime | Licence (exact) | Activity (verified) | Tag |
|---|---|---|---|---|---|
| **SysML-v2-Release** | Spec PDFs (KerML 1.1 Beta 2, SysML 2.1 Beta 2 Parts 1–2, API 1.1 Beta 2 in master) and change-bar PDFs; intro presentations; Eclipse and Jupyter installers; `kerml/` examples (94 `.kerml` files in the repo overall); `sysml/src/examples` (22 example folders, e.g. Vehicle, Flashlight, Camera, Variability, v1 Spec Examples) and `sysml/src/training` (numbered lessons 01–…); `sysml.library` (textual); `sysml.library.kpar`; `sysml.library.xmi` / `.xmi.implied` (Eclipse XMI); `bnf/` (KerML and SysML textual `.kebnf`, SysML graphical `.kgbnf`, HTML renderings, SVG notation images) [S-01][S-06] | Content repo (models, docs) | **EPL-2.0** for "the Jupyter and Eclipse software and all included KerML and SysML v2 models", which covers examples, training and libraries [S-01]. LICENSE = "Eclipse Public License - v 2.0" with an **unfilled Exhibit A** (no Secondary Licence designated) [S-02]. Spec PDFs: copyrighted by the listed organisations "under the terms given there" [S-01]. Intro presentations: **CC-BY-4.0** [S-01] | Latest release **2026-08** (published 2026-09-12) [S-13]; monthly cadence [S-03] | Verified |
| (history) SysML-v2-Release ≤ 2026-03 | same | | **LGPL-3.0** ("GNU Lesser General Public License (LGPL) v3.0 (see `LICENSE` and `LICENSE-GPL` files)") at tags 2025-02 and 2026-03 [S-05]. Changed to EPL in release 2026-04 [S-04] | | Verified |
| **SysML-v2-Pilot-Implementation** | Eclipse/Xtext editors for `.kerml`/`.sysml`; EMF metamodel (`org.omg.sysml.model`); logic (`org.omg.sysml.logic`); execution (`org.omg.sysml.execution`); interactive (`org.omg.sysml.interactive`); Jupyter kernel and JupyterLab extension; PlantUML visualisation; UML/Ecore importer; Xpect tests; copy of `sysml.library`, `sysml`, `kerml` [S-08][S-11] | Java 21, Eclipse Modeling Tools 2025-12, Maven, Xtext [S-08][S-11] | **EPL-2.0** (LICENSE file = EPL 2.0 [S-11]; README: "licensed under the Eclipse Public License" [S-08]). Changed from LGPL in 2026-04 (PR #752) [S-10]. README still mentions `LICENSE-GPL`, which returns 404 on master (stale reference) [S-11]. **PlantUML** is imported (`net.sourceforge.plantuml` 1.2022.7) [S-11]. PlantUML's own licence was not checked | Release **2026-08** (2026-09-11, plugin 0.62.0); default branch pushed 2026-10-15 [S-09][S-13] | Verified (PlantUML licence: Unknown) |
| **SysML-v2-API-Services** | Proof-of-concept REST/HTTP PSM provider; Swagger at `/docs/`; JSON schemas under `conf/json/schema` (api, metamodel) [S-12] | Java (JDK 11), Play Framework, sbt, PostgreSQL [S-12] | **EPL-2.0** (LICENSE heading) [S-12]; the only change in 2026-04 was the licence [S-04] | Release **2026-04** (2026-05-14) [S-13] | Verified |
| **SysML-v2-API-Cookbook** | Jupyter notebooks: Element CRUD, owned elements, project/commit/branch/tag recipe, queries, requirement/structure/behaviour decomposition [S-15] | Python notebooks | **No LICENSE file**; README has no licence text [S-15]. GitHub reports no licence [S-13] | Release 2025-02 (2025-03-10) [S-13] | Verified |
| **SysML-v2-API-Java-Client** | OpenAPI-generated Java client [S-14] | Java | **LGPL-3.0** (LICENSE) plus a LICENSE-GPL file [S-14] | Release 2021-09 (2021-10-14); stale [S-13] | Verified |
| **SysML-v2-API-Python-Client** | OpenAPI-generated Python client | Python | **LGPL-3.0** (SPDX) [S-13] | Release 2021-09; last push 2021-10-14 [S-13] | Verified |
| **OOSEM-v2-Release** | OOSEM v1/v2 baselines, resources | SysML v2 models | Models and source not otherwise annotated: **Apache-2.0**; other artifacts: **CC-BY-4.0** [S-16] | Pushed 2026-09-17 [S-13] | Verified |
| **SysML-v2-AADL-Release** | AADL v2 core as a SysML v2 library, plus examples | SysML v2 models | **CC-BY-ND-4.0** (Attribution-NoDerivatives) [S-17] | Pushed 2026-03-01 [S-13] | Verified |
| npm `@systems-modeling/jupyterlab-sysml` | JupyterLab extension from the pilot | TS/JS | npm metadata: **LGPL-3.0-or-later** at 0.62.0 (2026-09-11) [S-43]. This may be stale relative to the EPL switch | | Verified (metadata) |

Test suites: the API spec defines a **Conformance Test Suite** in Annex A (cases per service plus cross-cutting) [S-21]. The pilot has Xpect test projects (`org.omg.kerml.xpect.tests`, `org.omg.sysml.xpect.tests`) [S-11]. I did not find a separately published official language conformance test corpus. OpenMBEE's `sysmlv2-testing` is a community ledger, not an OMG suite [S-49]. **Verified** (existence) / **Assumed** (no other official suite exists).

## 2. Licence questions answered

### (a) Standard library `.sysml`/`.kerml`, examples and training models
| Item | Licence | May copy into our repo as **test fixtures**? | May **bundle in shipped app**? | Conditions | Tag |
|---|---|---|---|---|---|
| `sysml.library/**` and `sysml.library.kpar/*` from SysML-v2-Release at tag **≥ 2026-04** | EPL-2.0 [S-01][S-04] | **Yes** | **Yes, under the pre-authorised "EPL-2.0 (unmodified library)" class**, if shipped unmodified as data files loaded at runtime | Keep the EPL-2.0 text and the README copyright list (DEKonsult, Intercax, Mgnite, Model Driven Solutions, SAF Consulting, Siemens, Twingineer, JPL, IncQuery, Itemis) with the files. Do not edit files in place. If a fix is needed, a modified file is still EPL-2.0 and its source must be made available, which needs owner approval. Pin the exact tag and record it in `docs/dependencies.md` | Verified (licence) / Assumed (interpretation) |
| Same files from tags **≤ 2026-03**, or copies inside other projects (e.g. SysON's bundled `kerml.libraries`/`sysml.libraries`, which SysON's NOTICE labels **LGPL-3.0-only**) | LGPL-3.0 [S-05][S-31] | Avoid | **Do not use** (LGPL needs the "separately replaceable module" treatment) | Always take libraries from the Release repo ≥ 2026-04 | Verified |
| OMG normative KPARs at omg.org (`…/20250201/*.kpar`) | No `license` field in `.project.json` [S-26]. They fall under the specification copyright and permission notice: permission to use the spec "to create and distribute software … based upon this specification", with copying conditions including "no modifications" [S-21] front matter | Reference and checksum only; prefer the EPL copy | Prefer the EPL-2.0 copy from the Release repo | Use the OMG KPARs to **verify** that EPL copies match the normative content (diff), not as the shipped source | Verified (notice text) / Assumed (applicability to KPARs) |
| `sysml/src/examples/**`, `sysml/src/training/**`, `kerml/src/examples/**` (≥ 2026-04) | EPL-2.0 ("all included KerML and SysML v2 models") [S-01] | **Yes** (best parser/semantic corpus) | Yes if needed (e.g. a sample gallery), unmodified, with notice | Keep the licence notice in the fixtures folder | Verified / Assumed (interpretation) |
| `bnf/*.kebnf`, `*.kgbnf` | Repo licence EPL-2.0 [S-01]. The release notes say the BNF was extracted from the specs and manually corrected [S-04] | Yes (for grammar generation and tests) | Not needed at runtime | Derived from OMG spec text. Generated parser code is our own work, but keep provenance notes | Verified / Assumed |
| ISQ/SI library content | EPL-2.0 file; generated "from standard ISO/IEC 80000" [S-07] | Yes | Yes (as above) | Low residual risk because the files are distributed openly under EPL by the SMC | Assumed |
| Spec PDFs | OMG/contributor copyright; permission notice forbids posting on networks and modification [S-21] | **No** (link only). OpenMBEE's testing ledger also gitignores them as non-redistributable [S-49] | No | | Verified |
| OMG OpenAPI.json / Schema.json / KerML.json / SysML.json | OMG machine-readable spec files [S-24] | Store **unmodified** with the OMG notice, or fetch at build time; generate TS types from them | Generated types are ours. Do not ship modified schema files | Owner or legal confirmation recommended | Assumed |
| Intro presentations | CC-BY-4.0 [S-01] | Reference only | No | Attribution if quoted | Verified |
| OOSEM v2 models | Apache-2.0 [S-16] | Yes | Yes (pre-authorised) | Keep the NOTICE/licence | Verified |
| AADL library | CC-BY-ND-4.0 [S-17] | Unmodified fixtures only | Do not bundle without approval (ND restricts adaptations) | | Verified / Assumed |
| API Cookbook notebooks | No licence (all rights reserved by default) [S-15] | **No** (read and learn only) | No | | Verified / Assumed (default copyright) |

### (b) Pilot implementation as an external test oracle (JVM)
**Yes, feasible and licence-compatible.** It is EPL-2.0 [S-11], it runs on Java 21 + Maven [S-08], and it is maintained monthly [S-09]. It is used **outside the shipped app** (CI container), so EPL obligations apply only if we distribute it. Do not distribute it. Others already use it this way:
- OpenMBEE OpenSysML compares every diagnostic against "the pinned OMG pilot implementation over that implementation's own corpora" [S-46].
- `sysmlv2-web-modeler` packages the pilot jars plus `sysml.library` behind a web service [S-50].

Proposed oracle uses (Assumed design):
1. Parse and validate each fixture with the pilot (`org.omg.sysml.interactive` / Jupyter kernel or a small Java CLI) and diff diagnostics against our TS parser.
2. Export pilot JSON (the API Services and Jupyter `%publish` path; Assumed) and compare normalised `@type` and ownership trees.
3. Use the pilot API-Services Docker image as an API conformance counterpart.

Caveats: PlantUML licensing (Unknown; not needed for headless oracle use). The JVM toolchain lives in CI only.

## 3. Recommendation table

| Artifact | Recommendation | Rationale |
|---|---|---|
| Release repo `sysml.library` / KPARs, tag ≥ 2026-04 | **May vendor as fixture / may bundle** (unmodified, with EPL-2.0 notice) | EPL-2.0, pre-authorised class [S-01][S-04] |
| Release repo examples and training | **May vendor as fixture**; may bundle unmodified samples | EPL-2.0 [S-01] |
| Release repo `bnf/` | **May vendor as fixture / grammar source** | EPL-2.0; spec-derived [S-01][S-04] |
| Release repo ≤ 2026-03, SysON-bundled libraries | **Do not use** | LGPL-3.0 copies [S-05][S-31] |
| OMG normative KPARs, OpenAPI.json, Schema.json | **Oracle only / codegen input** (unmodified) | OMG spec notice [S-21][S-24] |
| Spec PDFs | **Do not use** (link only) | Copyright notice [S-21] |
| Pilot Implementation (JVM) | **Oracle only** (CI, not shipped) | EPL-2.0; Java 21 [S-08][S-11] |
| API Services pilot | **Oracle only** / inspiration for API behaviour | EPL-2.0, Java 11, Play [S-12] |
| API Java/Python clients | **Do not use** | LGPL-3.0, stale since 2021 [S-13][S-14] |
| API Cookbook | **Do not use** (read for understanding only) | No licence [S-15] |
| jupyterlab-sysml npm | **Do not use** in shipped app | LGPL-3.0-or-later per npm metadata [S-43] |
| OOSEM v2 models | **May vendor as fixture / may bundle** | Apache-2.0 [S-16] |
| AADL v2 library | **Oracle only / unmodified fixture** (approval to bundle) | CC-BY-ND-4.0 [S-17] |

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
| S-21 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/3-Systems_Modeling_API_and_Services.pdf | Systems Modeling API and Services v1.1 Beta 2 | 2026-10-14 | read partially (front-matter licence, Cl. 2 Conformance, 3, 7.1 API Model, 8.1 REST/HTTP PSM incl. Tables 9–10 and pagination, 8.2 media types, Annex B.1 examples) |
| S-24 | https://www.omg.org/spec/SystemsModelingAPI/1.0 | Systems Modeling API and Services 1.0 spec page | 2026-10-14 | read partially (fetched) |
| S-26 | https://www.omg.org/spec/SysML/20250201/Systems-Library.kpar and https://www.omg.org/spec/KerML/20250201/Semantic-Library.kpar | Normative library KPARs (Systems Library 2.0.0, Kernel Semantic Library 1.0.0) | 2026-10-14 | read partially (archive listing, .project.json, .meta.json, one library file) |
| S-31 | https://github.com/eclipse-syson/syson (README.md, NOTICE, LICENSE-LGPL, recursive tree, API metadata) | Eclipse SysON | 2026-10-14 | read partially |
| S-43 | https://registry.npmjs.org/-/v1/search?text=sysml&size=30 | npm search "sysml" | 2026-10-14 | read in full (listing) |
| S-46 | https://github.com/Open-MBEE/OpenSysML (README) | OpenSysML REDK | 2026-10-14 | read partially (intro sections) |
| S-49 | https://github.com/Open-MBEE/sysmlv2-testing (README) | sysmlv2-testing ledger | 2026-10-14 | read partially |
| S-50 | https://github.com/Open-MBEE/sysmlv2-web-modeler (README) | SysML v2 Visualization Service | 2026-10-14 | read partially |

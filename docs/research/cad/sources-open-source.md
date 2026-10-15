# Sources: Open-Source Kernels, Solvers and Topological Naming Survey

This is the companion file to [`open-source-survey.md`](open-source-survey.md). It lists every source consulted during this research pass.

## How the sources were gathered

- **Date accessed:** 2026-10-14, for every entry.
- **Method:**
  - Web search and fetches of public pages only.
  - No login-only, paywalled or proprietary material was accessed.
  - Academic papers behind paywalls are cited from bibliographic records or abstracts, and this is said where it applies.

## Read-depth legend

| Depth | Meaning |
|---|---|
| **Full** | The page was fetched and its main content was processed. The fetch tool returns a model-generated digest, not a verbatim copy, so "full" means read in full via that digest. |
| **Partial** | The page was fetched, but only part of it was processed (truncation), or the page lacked the needed content. |
| **Search summary only** | Seen only as a web-search result summary and not fetched. Claims that rest only on these entries are marked `(snippet)` in the survey and are lower confidence. |
| **Not accessed** | The fetch failed or returned unreadable content: bot protection, redirect not followed, or a scanned or compressed PDF. |

**Background knowledge.** Statements marked `(bg)` in the survey come from the author's general knowledge and were not re-verified this session.

## A. Package registries and package contents

| ID | Source | URL | Depth |
|---|---|---|---|
| S01 | npm registry metadata, `replicad-opencascadejs` (licence LGPL-2.1-only, 1.1.0 published 2026-09-04, no repository field) | https://registry.npmjs.org/replicad-opencascadejs | Full |
| S02 | npm registry metadata, `replicad` (licence history: AGPL-3.0-or-later for 0.5.0–0.15.1, MIT from 0.15.2; dates of 0.21.0–1.1.0). Read in two passes. | https://registry.npmjs.org/replicad | Full |
| S03 | npm registry metadata, `@salusoft89/planegcs` (version and date table, README excerpt). The last ~10% of the page was not read. | https://registry.npmjs.org/@salusoft89/planegcs | Partial |
| S10 | npm registry metadata, `opencascade.js` (dist-tags 1.1.1 / 2.0.0-beta.b5ff984, LGPL-2.1-only on early versions). Only the first 100k of 1.3M characters was read. | https://registry.npmjs.org/opencascade.js | Partial |
| S14 | PyPI JSON, `build123d` (0.13.0, 2026-09-21, Apache-2.0, `cadquery-ocp-novtk>=8.0,<8.1`) | https://pypi.org/pypi/build123d/json | Full |
| S15 | PyPI JSON, `cadquery` (2.8.0, 2026-06-21, Apache-2.0, `cadquery-ocp>=7.9.3.1,<8.0`) | https://pypi.org/pypi/cadquery/json | Full |
| S26 | crates.io API, `truck-modeling` (0.6.0, 2024-09-20, Apache-2.0) | https://crates.io/api/v1/crates/truck-modeling | Full |
| S28 | npm, `manifold-3d` latest (3.5.4, Apache-2.0) | https://registry.npmjs.org/manifold-3d/latest | Full |
| S46 | `replicad-opencascadejs` package.json in the replicad repository (exports for single and multi, Docker build scripts) | https://raw.githubusercontent.com/sgenoud/replicad/main/packages/replicad-opencascadejs/package.json | Full |
| S48 | Docker Hub tags, `donalffons/opencascade.js` (latest tags updated 2023-03-23 to 2023-03-27) | https://hub.docker.com/v2/repositories/donalffons/opencascade.js/tags?page_size=10 | Full |
| S73 | unpkg file listing, `@salusoft89/planegcs@1.3.0` (wasm 484,003 bytes) | https://unpkg.com/@salusoft89/planegcs@1.3.0/?meta | Full |
| S74 | `gcs_wrapper.d.ts` in planegcs 1.3.0 (public API) | https://unpkg.com/@salusoft89/planegcs@1.3.0/dist/sketch/gcs_wrapper.d.ts | Full |
| S75 | planegcs 1.3.0 package.json (LGPL-2.0-or-later, no runtime dependencies) | https://unpkg.com/@salusoft89/planegcs@1.3.0/package.json | Full |
| S79 | docs.rs, `truck-stepio` (0.3.0, 2024-09-20) | https://docs.rs/crate/truck-stepio/latest | Full |
| S84 | npm, `three` latest (0.186.1, MIT) | https://registry.npmjs.org/three/latest | Full |

## B. Repositories, READMEs, licence files and build configurations

| ID | Source | URL | Depth |
|---|---|---|---|
| S04 | OCCT GitHub releases (V8.0.1 30 Jul, V8.0.0 7 May; years inferred from assets). The tail of the page was not read. | https://github.com/Open-Cascade-SAS/OCCT/releases | Partial |
| S05 | replicad GitHub repository page (MIT, 702 stars, 492 commits) | https://github.com/sgenoud/replicad | Full |
| S06 | `OCCT_LGPL_EXCEPTION.txt` (paraphrased, not reproduced) | https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/master/OCCT_LGPL_EXCEPTION.txt | Full |
| S07 | OCCT GitHub repository page (licence statement, root files, 7,159 commits) | https://github.com/Open-Cascade-SAS/OCCT | Full |
| S08 | opencascade.js GitHub repository page (LGPL-2.1, OCCT 7.6.2 badge). The README body was not rendered in the fetch. | https://github.com/donalffons/opencascade.js | Partial |
| S11 | replicad repository, `packages/replicad-opencascadejs` directory and README | https://github.com/sgenoud/replicad/tree/main/packages/replicad-opencascadejs | Full |
| S12 | CadQuery GitHub repository page | https://github.com/CadQuery/cadquery | Full |
| S13 | build123d GitHub repository page | https://github.com/gumyr/build123d | Full |
| S16 | FreeCAD GitHub releases (1.1.4 latest; 26.3 RC1; weekly builds). Only the first ten releases were shown. | https://github.com/FreeCAD/FreeCAD/releases | Partial |
| S19 | realthunder, FreeCAD_assembly3 wiki "Topological Naming" (element map design) | https://github.com/realthunder/FreeCAD_assembly3/wiki/Topological-Naming | Full |
| S21 | Ondsel-Development/OndselSolver (LGPL-2.1; archived 2025-03-01) | https://github.com/Ondsel-Development/OndselSolver | Full |
| S22 | FreeCAD/OndselSolver (continuing fork; 220 commits) | https://github.com/FreeCAD/OndselSolver | Full |
| S23 | SolveSpace GitHub repository page (GPL v3 or later; experimental web build) | https://github.com/solvespace/solvespace | Full |
| S24 | truck GitHub repository page | https://github.com/ricosjp/truck | Full |
| S25 | Fornjot GitHub repository page (0BSD; shut down, archived 2026-06-19) | https://github.com/hannobraun/fornjot | Full |
| S27 | manifold GitHub repository page | https://github.com/elalish/manifold | Full |
| S29 | libfive GitHub repository page | https://github.com/libfive/libfive | Full |
| S30 | OpenSCAD GitHub repository page. The licence was not stated in the fetched content. | https://github.com/openscad/openscad | Partial |
| S32 | Curv GitHub repository page (archived 2023-09-27) | https://github.com/curv3d/curv | Full |
| S33 | Mayo GitHub repository page (BSD-2-Clause) | https://github.com/fougue/mayo | Full |
| S36 | SolveSpace GitHub releases. Years were not shown. | https://github.com/solvespace/solvespace/releases | Partial |
| S43 | replicad `build-source` directory (custom_build_single/multi.yml, defaults.yml) | https://github.com/sgenoud/replicad/tree/main/packages/replicad-opencascadejs/build-source | Full |
| S44 | replicad GitHub releases page ("There aren't any releases here") | https://github.com/sgenoud/replicad/releases | Full |
| S45 | `custom_build_multi.yml` (pthread flags) | https://raw.githubusercontent.com/sgenoud/replicad/main/packages/replicad-opencascadejs/build-source/custom_build_multi.yml | Full |
| S47 | `defaults.yml` (emcc flags, binding list: fillet, offset, mesh, ShapeFix, STEP classes; no RWGltf, no STEPCAFControl_Reader). The file was processed by the fetch digest. Absence findings depend on that digest and should be confirmed with a direct grep. | https://raw.githubusercontent.com/sgenoud/replicad/main/packages/replicad-opencascadejs/build-source/defaults.yml | Full |
| S49 | opencascade.js commit history (last commits 2023-03-26/27) | https://github.com/donalffons/opencascade.js/commits/master | Full |
| S50 | replicad commit history (2026-09-04 v1.1.0 commits; 2026-08-14 licence-fix commit) | https://github.com/sgenoud/replicad/commits/main | Full |
| S66 | three.js GitHub repository page (MIT; WebGL and WebGPU renderers) | https://github.com/mrdoob/three.js | Full |
| S68 | FreeCAD GitHub repository page (LGPL-2.1, 34.3k stars) | https://github.com/FreeCAD/FreeCAD | Full |
| S71 | FreeCAD `planegcs/GCS.cpp` source (SPDX header, solver and diagnosis symbols). Only the first 100k of 234k characters was read. | https://raw.githubusercontent.com/FreeCAD/FreeCAD/main/src/Mod/Sketcher/App/planegcs/GCS.cpp | Partial |
| S72 | Salusoft89/planegcs GitHub repository and README (two fetches: main page and README.md) | https://github.com/Salusoft89/planegcs | Full |
| S77 | Tauri GitHub repository page (Apache-2.0 / MIT) | https://github.com/tauri-apps/tauri | Full |
| S78 | CadQuery/OCP GitHub repository page (Apache-2.0, pywrap) | https://github.com/CadQuery/OCP | Full |
| S85 | manifold GitHub releases (v3.5.4 25 Sep, v3.5.3 7 Sep, v3.5.2 27 Jun; years not shown) | https://github.com/elalish/manifold/releases | Partial |

## C. Official documentation and vendor pages

| ID | Source | URL | Depth |
|---|---|---|---|
| S09 | replicad documentation, introduction | https://replicad.xyz/docs/intro | Full |
| S18 | FreeCAD blog, "FreeCAD Version 1.0 Released" (2024-11-19) | https://blog.freecad.org/2024/11/19/freecad-version-1-0-released/ | Full |
| S31 | CGAL licence page | https://www.cgal.org/license.html | Full |
| S37 | SolveSpace, "library" page (libslvs, GPLv3) | https://solvespace.com/library.pl | Full |
| S38 | OCCT User Guide, OCAF (TNaming sections). Only the first 100k of 210k characters was read. | https://occt3d.com/dev/doc/overview/html/occt_user_guides__ocaf.html | Partial |
| S39 | OCCT User Guide, Mesh (BRepMesh) | https://occt3d.com/dev/doc/overview/html/occt_user_guides__mesh.html | Full |
| S40 | OCCT3D, Open CASCADE Technology product page (8.0.1, licence statement). This is the redirect target of dev.opencascade.org/resources/licensing. | https://occt3d.com/open-cascade-technology/index.html | Full |
| S42 | OCCT User Guide, Data Exchange wrapper (format table) | https://occt3d.com/dev/doc/overview/html/occt_user_guides__de_wrapper.html | Full |
| S55 | Onshape FeatureScript documentation, "Modeling" (ids, queries, qCreatedBy) | https://cad.onshape.com/FsDoc/modeling.html | Full |
| S60 | Siemens PLM Components blog, "Geometric constraint solving 1: introduction" (2022-08-02) | https://blogs.sw.siemens.com/plm-components/geometric-constraint-solving-1-introduction/ | Full |
| S62 | MDN, `SharedArrayBuffer` (security requirements) | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer | Full |
| S64 | WebAssembly website `features.json` (browser support for memory64, threads, exceptions, SIMD) | https://raw.githubusercontent.com/WebAssembly/website/main/features.json | Full |
| S70 | OCCT specification, Boolean Operations. Only the first 100k of 196k characters was read; the advanced options were not covered. | https://occt3d.com/dev/doc/overview/html/specification__boolean_operations.html | Partial |
| S80 | OpenCascade.js documentation, "Custom builds" | https://ocjs.org/docs/app-dev-workflow/custom-builds | Full |
| S81 | GNU LGPL v2.1 licence text (§6 paraphrased). The first attempt returned HTTP 429; the retry succeeded. | https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html | Full (§6 focus) |
| S82 | OCCT User Guide, Modeling Algorithms. Characters 0–200k of 259k were read; the ThruSections details were not reached. | https://occt3d.com/dev/doc/overview/html/occt_user_guides__modeling_algos.html | Partial |
| S86 | SolveSpace, technology page (solver method) | https://solvespace.com/tech.pl | Full |
| S89 | web.dev, "Making your website cross-origin isolated using COOP and COEP" | https://web.dev/articles/coop-coep | Full |

## D. Academic sources

Full texts were mostly not available. Each entry states exactly what was read.

| ID | Source | URL | Depth |
|---|---|---|---|
| S51 | Kripac, J. (1997), "A mechanism for persistently naming topological entities in history-based parametric solid models", *CAD* 29(2):113–122. Bibliographic record and citing patents/papers only. The full text and abstract were not read. Also in this search: Bidarra/Bronsvoort TU Delft papers and US6445388B1. | Search results: https://ibl.kb.nl/articles/0000000010055/29/2 ; https://patents.justia.com/patent/6445388 | Search summary only |
| S52 | Capoyleas, V., Chen, X., Hoffmann, C. M. (1996), "Generic naming in generative, constraint-based design", *CAD* 28(1):17–26. The Purdue tech-report PDF was fetched but is a scanned image and could not be read. The abstract is known from the Purdue e-Pubs search summary. | https://www.cs.purdue.edu/cgvlab/www/resources/papers/Capoyleas-Computer_aided_design-1996-Generic_naming_in_generative.pdf ; https://docs.lib.purdue.edu/cstech/1114 | Not accessed (PDF) / Search summary only (abstract) |
| S53 | Marcheix, D., Pierra, G. (2002), "A survey of the persistent naming problem", 7th ACM Symposium on Solid Modeling. Programme listing only. | https://computational-geometry.org/mailing-lists/compgeom-announce/2002-May/000602.html | Search summary only |
| S58 | Owen, J. C. (1991), "Algebraic solution for geometry from dimensional constraints", ACM SMA '91, pp. 397–407. Secondary descriptions only: Joan-Arinyo et al. reformulation; Owen and Power, "Generic 3-connected planar constraint systems are not soluble by radicals". | https://api.crossref.org/works/10.1007%2FBFB0017460 ; https://upcommons.upc.edu/entities/publication/d315f679-3e91-4c84-a52e-e910088514ba | Search summary only |
| S61 | Bettig, B., Hoffmann, C. M. (2011), "Geometric constraint solving in parametric computer-aided design", *JCISE* 11(2), DOI 10.1115/1.3593408. The PDF was fetched but its compressed streams were unreadable. The abstract is known from the search summary. | https://www.cs.purdue.edu/cgvlab/www/resources/papers/Bettig-Comp_and_Info_Sci_in_Eng-2011-Geometric_Constraint_Solving_In_Parametric_CAD.pdf | Search summary only |
| S83 | Jermann, Trombettoni, Neveu, Mathis, "Decomposition of geometric constraint systems: a survey", *IJCGA* (2006). HAL abstract via search. Volume and pages conflict between sources. | https://hal.archives-ouvertes.fr/hal-00481267 | Search summary only |
| S87 | Zou, Q. et al. (2022), "A review on geometric constraint solving", arXiv:2202.13795. Abstract page only. | https://arxiv.org/abs/2202.13795 | Partial (abstract) |
| S88 | Agbodan, D., Marcheix, D., Pierra, G. et al. (2003), "A topological entity matching technique...". The PDF was fetched but was unreadable binary. | https://www.lias-lab.fr/publications/7076/2003-ICSMA-AGBODAN.pdf | Not accessed |

## E. Search-result summaries and failed fetches

| ID | Topic | URL(s) seen | Depth |
|---|---|---|---|
| S17 | FreeCAD wiki, "Topological naming problem". The fetch was blocked by Anubis bot protection. | https://wiki.freecad.org/Topological_naming_problem | Not accessed |
| S20 | Ondsel blog, "Milestone: toponaming fix phase 2 done". The redirect was not followed; the content is known from a search snippet only. | https://ondsel.com/blog/milestone-toponaming-fix-phase-2-done | Search summary only |
| S34 | OpenSCAD licence (GPL-2.0-or-later) and Manifold becoming the default backend (mailing list, 2025-08-17) | https://en.wikipedia.org/wiki/OpenSCAD ; https://lists.openscad.org/empathy/thread/TMJEJCZINIJNYJX2YF7IDNBAPQY66KIF ; https://packages.guix.gnu.org/packages/openscad | Search summary only |
| S35 | SolveSpace / libslvs licence and packaging | https://Www.wikipedia.org/wiki/SolveSpace ; https://librearts.org/2013/08/solvespace-released-under-gpl/ | Search summary only |
| S41 | OCCT 8.0.0 release announcement (C++17 baseline, NCollection changes, vendor STEP performance claim) | https://dev.opencascade.org/content/open-cascade-technology-800-release ; https://dev.opencascade.org/content/occt-800-planned-q1-2026-performance-stability-and-support-services | Search summary only |
| S54 | Onshape forum, deterministic IDs (`transientQueriesToStrings`; fillet/chamfer IDs not resolvable) | https://forum.onshape.com/discussion/26062/please-help-me-deterministicids-do-not-in-all-ids-returned-by-qeverything ; https://forum.onshape.com/discussion/comment/35113/ | Search summary only |
| S56 | Search for Onshape's public description of its topological naming. No official source was found. | https://forum.onshape.com/discussion/17478/how-to-handle-broken-references-when-modifications-to-a-part-studio-cause-named-parts-to-be-renamed | Search summary only |
| S57 | D-Cubed DCM licensees (Altair, MSC, Bentley, Sescoi, Joe Gibbs Racing; Siemens list) | https://www.digitalengineering247.com/article/altair-expands-use-of-siemens-d-cubed ; https://www.digitalengineering247.com/article/bentley-licenses-d-cubed-2d-dcm-3d-dcm-and-cdm-components ; https://blogs.sw.siemens.com/plm-components/?p=1050 | Search summary only |
| S59 | FreeCAD Sketcher QR diagnosis (wiki Sketcher Dialog, tracker issues 2281/4501, commits on partial redundancy and tolerances) | https://wiki.freecad.org/Sketcher_Dialog ; https://tracker.freecad.org/view.php?id=4501 ; https://github.com/FreeCAD/FreeCAD/commit/2625aabe25e815fbad30df05e59ffcc43fbbf9ef | Search summary only |
| S63 | memory64 browser status and performance caveat (platform.uno State of WebAssembly; byteiota checklist) | https://platform.uno/blog/state-of-webassembly-2024-2025/ ; https://byteiota.com/webassembly-3-wasmgc-memory64-production-checklist/ | Search summary only |
| S65 | WebGPU browser support timeline. The Khronos page fetch failed because the content was too large. | https://www.khronos.org/developers/linkto/webgl-and-webgpu-sigg26 ; https://github.com/gpuweb/gpuweb/wiki/implementation-status | Search summary only |
| S67 | SALOME licence (LGPL 2.1) and 9.16.0 release notes (June 2026) | https://www.salome-platform.org/wp-content/uploads/2026/07/SALOME_9_16_0_Release_Notes.pdf ; https://old.salome-platform.org/downloads/license | Search summary only |
| S69 | OCCT fillet failure reports (tracker 22727, 27030, 30208, 31229, 33877; forum threads) | https://tracker.dev.opencascade.org/view.php?id=33877 ; https://tracker.dev.opencascade.org/view.php?id=30208 ; https://dev.opencascade.org/content/brepfilletapimakefillet-fillet-failed | Search summary only |
| S76 | Ondsel shutdown (autumn 2024) | https://ondsel.com/blog/goodbye/ ; https://www.ondsel.com/faq/ ; https://librearts.org/2024/11/week-recap-3-nov-2024/ | Search summary only |
| S90 | FreeCAD 1.0 topological naming coverage (release 18 Nov 2024; realthunder algorithm; wiki caveats) | https://alternativeto.net/news/2024/11/freecad-1-0-launches-with-enhanced-ui-ux-built-in-assembly-workbench-and-tnp-fixes/ ; https://wiki.freecad.org/Topological_naming_problem/en | Search summary only |

## Counts

- **Full:** 55 (S01, S02, S05, S06, S07, S09, S11–S15, S18, S19, S21–S29, S31–S33, S37, S39, S40, S42–S50, S55, S60, S62, S64, S66, S68, S72–S75, S77–S81, S84, S86, S89).
- **Partial:** 13 (S03, S04, S08, S10, S16, S30, S36, S38, S70, S71, S82, S85, S87).
- **Search summary only:** 19 (S20, S34, S35, S41, S51, S53, S54, S56–S59, S61, S63, S65, S67, S69, S76, S83, S90). The abstract of S52 was also seen only as a search summary.
- **Not accessed:** 3 (S17, S88, and the S52 PDF).

**Total:** 90 IDs (S01–S90). S52 is counted once, under "not accessed".

**Gap:** no primary source was read for Electron's licence, the three.js `GLTFExporter`, or the glTF 2.0 specification. These are marked `(bg)` in the survey.

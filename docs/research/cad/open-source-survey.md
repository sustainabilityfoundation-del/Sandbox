# Open-Source CAD Kernels, Constraint Solvers and Topological Naming: Survey

- **Status:** research note (input to CAD architecture decisions). Not an ADR, and not a claim that any capability is implemented in this repository.
- **Date:** 2026-10-14
- **Scope:** public sources only. Each source is listed with its read depth in [`sources-open-source.md`](sources-open-source.md); citations look like `[S07]`.
- **Confidence markers:**
  - `[Sxx]`: backed by a fetched source.
  - `(snippet)`: backed only by a search-result summary. Lower confidence.
  - `(bg)`: author background knowledge that was not re-verified this session. Lowest confidence; check before relying on it.
  - `(inference)`: a conclusion drawn from several facts and not stated by any source.
- **Not legal advice.** The licence analysis below is an engineering reading of licence texts. Have a qualified person review it before commercial distribution.

The provisional choice being tested is:

- **Kernel:** Open CASCADE Technology (OCCT), reached through `replicad` 1.1.0 (MIT, TypeScript API) and `replicad-opencascadejs` 1.1.0 (LGPL-2.1-only, a custom opencascade.js WebAssembly build of about 23 MB, in single- and multi-threaded variants).
- **Runtime:** a Web Worker in the browser, and in-process in Node for tests.
- **Sketch solver:** an in-house TypeScript Newton/Levenberg-Marquardt solver.

---

## 1. Executive summary

**Verdict:** the provisional kernel choice holds up. OCCT is the only open-source, permissively usable (LGPL with exception), production-grade exact B-rep kernel with STEP, healing and meshing. replicad is the most mature TypeScript layer over it.

Three findings change how we should hold that choice:

1. **The OCCT inside our wasm is probably about 4 years old.** `replicad-opencascadejs` is built with the `donalffons/opencascade.js` Docker image [S46, S11]. That image's tags were last updated in March 2023 [S48]. The opencascade.js repository's last commits are from 26–27 March 2023 [S49], and its version badge says OCCT 7.6.2 [S08]. Upstream OCCT is now at 8.0.1 (July 2026) [S04, S40]. The exact OCCT version in replicad 1.1.0 is not stated anywhere I could read; that it is 7.6.x is an inference. Fixes and performance work from 7.7 through 8.0 (for example the vendor-claimed STEP read speed-up [S41], snippet) are therefore probably missing. The build toolchain is also unmaintained upstream.
2. **The replicad build exposes only a subset of OCCT.** In the binding list [S47]:
   - No glTF writer (`RWGltf_*`).
   - On the STEP side, only `STEPCAFControl_Writer` and the plain `STEPControl_Reader`/`Writer`. There is no `STEPCAFControl_Reader`, so importing STEP with XDE metadata (names, colours, assembly structure) is not available without a custom build.
   - Plain geometry re-import, which we verified, works.
   - glTF export should be done in JavaScript from the mesh (three.js), which is cheap.
3. **The in-house TypeScript sketch solver is adequate for Phase 1 only with diagnosis built in from day one.** Diagnosis means a rank-revealing QR or SVD of the Jacobian that reports redundant and conflicting constraints. FreeCAD's solver shows that this diagnosis, not the iteration itself, is where most of the difficulty and bugs live [S59, snippet; S71].
   - `@salusoft89/planegcs` 1.3.0 (5 October 2026, LGPL, 484 KB wasm) already exposes conflicting, redundant and partially redundant constraint queries [S73, S74, S03].
   - It should be kept as a ready fallback and used as a test oracle.

**Licensing:**

- Everything we would ship is LGPL or permissive.
- GPL projects (SolveSpace/libslvs, OpenSCAD, the GPL parts of CGAL, libfive Studio) must stay reference-only.
- replicad versions 0.5.0–0.15.1 were AGPL-3.0-or-later. Only 0.15.2 and later are MIT [S02], so the dependency must be pinned to at least 0.15.2. 1.1.0 is fine.

### Recommendation table

| Component | Choice | Licence (SPDX) | Status |
|---|---|---|---|
| Exact B-rep kernel | OCCT via `replicad-opencascadejs` 1.1.0 | LGPL-2.1-only, plus the OCCT exception [S01, S06] | **Adopt** (Phase 1). **Evaluate** an own opencascade.js-style build pipeline against OCCT 8.0.x in Phase 2 |
| TypeScript modelling API | `replicad` 1.1.0 | MIT [S02] | **Adopt** behind our own kernel-adapter interface |
| Raw OCCT JS bindings / build system | `opencascade.js` 1.1.1 / 2.0.0-beta | LGPL-2.1-only [S10] | **Reference only** (upstream dormant since 2023 [S49]). Fork its build tooling only if we need a newer OCCT |
| Python OCCT layers (CadQuery, build123d, OCP) | n/a | Apache-2.0 [S12, S13, S78] | **Reference only**: API design, selectors, and test cases |
| Sketch solver, Phase 1 | In-house TypeScript (LM / dog-leg with QR diagnosis) | our own | **Adopt**, with a scope cap (see §3.6) |
| Sketch solver, fallback | `@salusoft89/planegcs` 1.3.0 | LGPL-2.0-or-later (npm metadata; see §3.1 for inconsistencies) [S75] | **Evaluate** now as a test oracle. Adopt if the triggers in §3.6 fire |
| SolveSpace / libslvs | n/a | GPL-3.0-or-later [S23, S37] | **Avoid (licence)**. Reference only for algorithms |
| Assembly solver | OndselSolver (now `FreeCAD/OndselSolver`) | LGPL-2.1 (original repo) [S21] | **Evaluate** later (assembly phase) |
| D-Cubed DCM | n/a | proprietary [S60] | **Reference only** (commercial option if we ever need it) |
| Mesh booleans / robust mesh CSG | `manifold-3d` 3.5.4 | Apache-2.0 [S27, S28] | **Evaluate** for mesh-only workflows (STL repair, lattice, previews). Not a B-rep substitute |
| Rust B-rep kernels | truck / Fornjot | Apache-2.0 / 0BSD [S24, S25] | **Reference only**. Truck has had no crate release since September 2024 [S26]; Fornjot was shut down and archived in June 2026 [S25] |
| Implicit modelling | libfive core / Curv | MPL-2.0 core (Studio GPL-2.0-or-later) / Apache-2.0 [S29, S32] | **Reference only**. Curv is archived [S32] |
| OpenSCAD | n/a | GPL-2.0-or-later (snippet) [S34] | **Avoid (licence)**. Reference only |
| CGAL | n/a | GPL-3.0-or-later / LGPL-3.0-or-later per package, or commercial [S31] | **Avoid** the GPL packages. LGPL packages are possible but not needed |
| Salome (GEOM/SHAPER) | n/a | LGPL-2.1 (snippet) [S67] | **Reference only** |
| Mayo | n/a | BSD-2-Clause [S33] | **Reference only** (desktop viewer/converter; useful for checking STEP/glTF files) |
| Visualisation | three.js 0.186.1 (WebGL2 default, WebGPU optional) | MIT [S66, S84] | **Adopt** |
| Tessellation | OCCT `BRepMesh_IncrementalMesh` (in our build [S47]) | LGPL-2.1-only + exception | **Adopt** |
| glTF export | three.js `GLTFExporter` from our mesh, (bg) for the exporter name | MIT | **Adopt**. OCCT `RWGltf` is not in our build [S47] |
| Topological naming | In-house generative naming + OCCT history (`Generated`/`Modified`/`IsDeleted`) + geometric signature fallback | our own | **Adopt** (design in §4). FreeCAD's element map is a reference |
| Desktop shell (later) | Tauri 2 | Apache-2.0 OR MIT [S77] | **Evaluate** when a desktop build is in scope |

### Ten points the CAD agent should act on

1. Record that the OCCT version inside `replicad-opencascadejs` is unverified and probably 7.6.x. Ask the replicad maintainer, or inspect the wasm build, before the kernel ADR is approved.
2. Keep replicad behind a thin internal kernel adapter, so that a later OCCT 8 build, or direct bindings, can replace it.
3. Deliver the LGPL obligations in Phase 1 (§2.2): notices, a replaceable `.wasm`, and a source/offer for the OCCT build.
4. Do not plan STEP import with colours, names or assembly structure, or glTF export via OCCT, on the current build.
5. Build glTF from our tessellated mesh in JavaScript.
6. Build the TypeScript solver with Jacobian-rank diagnosis, and keep planegcs as a differential-testing oracle.
7. Implement topological naming ourselves from feature + sketch-entity + role, propagated with OCCT history. Do not depend on OCAF/TNaming through replicad; replicad does not expose it (inference from its API focus [S05, S09]).
8. Multi-threaded wasm needs cross-origin isolation (COOP `same-origin` + COEP `require-corp` [S89]). Ship single-threaded by default and add multi-threading when the hosting is isolated.
9. Plan for the 4 GB wasm32 ceiling. Our build sets `MAXIMUM_MEMORY=4GB` [S47], and Safari has no memory64 [S64].
10. Keep GPL code (SolveSpace, OpenSCAD, CGAL-GPL) out of the dependency tree and out of copied code.

---

## 2. Geometric kernels and kernel-based projects

### 2.1 Open CASCADE Technology (OCCT)

- **What:** a C++ exact B-rep kernel plus visualisation, data exchange and application framework (OCAF) [S40].
- **Owner:** Open Cascade SAS, branded OCCT3D, "Part of Capgemini" [S40].
- **Repository:** github.com/Open-Cascade-SAS/OCCT. About 3.0k stars, 7,159 commits on master [S07].
- **Releases:**
  - V8.0.0: 7 May 2026, after five release candidates and three betas.
  - V8.0.0p1: 17 June 2026.
  - V8.0.1: 30 July 2026 [S04, S40].
  - 8.0 moves to a C++17 baseline and reworks the NCollection containers, including `Size()` now returning `size_t` [S41, snippet]. This is relevant to anyone regenerating JavaScript bindings.

**Licence:**

- `LGPL-2.1-only` with the "Open CASCADE Exception" (`LICENSE_LGPL_21.txt` and `OCCT_LGPL_EXCEPTION.txt` [S07]).
- The exception allows object code of a work that uses OCCT to contain material from OCCT headers (inline functions, templates, CDL generics) and still be distributed on the distributor's own terms. The condition is a prominent notice in supporting documentation that the product uses OCCT [S06].
- Commercial licences are also offered [S07].
- SPDX has no dedicated identifier for this exception. Record it as `LGPL-2.1-only WITH LicenseRef-OCCT-exception` (inference about notation).

**Capabilities and what we verified:**

| Area | Notes | Evidence |
|---|---|---|
| B-rep topology, NURBS/B-spline geometry | Core of the kernel | [S40, S82] |
| Booleans (General Fuse framework) | Fuzzy value, glue option, non-destructive mode, parallel mode. Arguments must be valid and not self-interfering. Geometry should be at least C1 | [S70] |
| Fillets and chamfers | `BRepFilletAPI_MakeFillet` with variable radius; the fillet propagates along tangent-continuous edges. `MakeChamfer`; `MakeFillet2d` for planar faces | [S82] |
| Offsets and shelling | `MakeOffsetShape` (`PerformByJoin` / `PerformBySimple`), `MakeThickSolidByJoin` for shells. The simple mode may grow tolerances | [S82] |
| Sweeps and lofts | `MakePipe` (spine must be G1) and `MakePipeShell` (sharp transitions). `ThruSections` exists [S47]; I did not read its documentation | [S82, S47] |
| Draft | `BRepOffsetAPI_DraftAngle` on planar, cylindrical and conical faces | [S82] |
| Operation history | `Generated()`, `Modified()`, `IsDeleted()` on makers; `BRepTools_History` merges histories | [S82, S70] |
| Healing | `ShapeFix_*`, included in our build | [S47]; healing scope (bg) |
| Data exchange | STEP, IGES, glTF, OBJ, STL, VRML, BREP, XBF (read/write); PLY (write) | [S42] |
| Assemblies and metadata | XDE/XCAF | [S40, S42] |
| Meshing | `BRepMesh_IncrementalMesh`: linear/angular deflection, relative mode, parallel, Delabella option | [S39] |
| Naming | OCAF `TNaming` (NamedShape, Builder, Selector), with evolutions PRIMITIVE / GENERATED / MODIFY / DELETE / SELECTED | [S38] |

**Known weaknesses:**

- **Fillet robustness.** The OCCT tracker has long-running reports:
  - fillets on box/cylinder fuse edges fail on 7.8.0 (reported 2025);
  - fillet radius larger than an adjacent short edge;
  - two geometrically equivalent but differently built shapes give different fillet results [S69, snippet].
- **Tolerances.** Booleans need valid, non-self-interfering inputs and may need a fuzzy value [S70]. Offset "simple" mode grows tolerances [S82]. Geometry built in metres versus millimetres can change outcomes [S69, snippet].
- **Persistent naming is a framework, not a solution.** TNaming requires every algorithm to supply face/edge/vertex history. Seam and degenerate edges need special handling, and `Solve()` must be called after every upstream change [S38]. Most OCCT-based tools (FreeCAD, CadQuery, build123d) built their own naming or selector layers instead (§4).

**Verdict:** adopt. No open-source alternative comes close in exact solids, STEP and healing (matrix in §5).

### 2.2 opencascade.js and replicad-opencascadejs (the WASM layer)

**opencascade.js**

- Emscripten port of OCCT. LGPL-2.1-only [S08, S10]. npm dist-tags: `latest` 1.1.1, `beta` 2.0.0-beta.b5ff984 [S10].
- Its YAML "custom build" system:
  - selects the classes to bind (`bindings`), which lets dead-code elimination shrink the module;
  - accepts extra C++ (`additionalCppCode`);
  - overrides `emccFlags` [S80].
- **Maintenance:**
  - last commits 26–27 March 2023 ("release 2.0.0") [S49];
  - Docker Hub tags last updated 23–27 March 2023 [S48];
  - repository badge says OCCT 7.6.2 [S08];
  - 51 open issues and 26 open pull requests [S08].
  - Conclusion: dormant (inference).

**replicad-opencascadejs 1.1.0**

| Item | Finding | Evidence |
|---|---|---|
| Licence and release | `LGPL-2.1-only`, published 4 September 2026 | [S01, S46] |
| What it is | Built by running the opencascade.js Docker image with replicad's own YAML (`custom_build_single.yml`, `custom_build_multi.yml`, `defaults.yml`) | [S11, S43, S46] |
| Exports | Single-threaded build by default (`.`); multi-threaded build at `./multi` | [S46] |
| Compile flags | `-fwasm-exceptions`, `-O3`, `-msimd128`, `ALLOW_MEMORY_GROWTH`, `INITIAL_MEMORY=100MB`, `MAXIMUM_MEMORY=4GB`, 8 MB stack | [S47] |
| Multi-threaded variant | `-pthread`, `USE_PTHREADS`, `SHARED_MEMORY`, `PTHREAD_POOL_SIZE=navigator.hardwareConcurrency` | [S45] |
| Included bindings | `BRepFilletAPI_MakeFillet`/`MakeChamfer`; `BRepOffsetAPI_MakeOffsetShape`, `MakePipeShell`, `ThruSections`, `MakeFilling`; `BRepMesh_IncrementalMesh`; `ShapeFix_*`; `STEPControl_Reader`/`Writer`; `STEPCAFControl_Writer` | [S47] |
| Bindings not found | `RWGltf_*` and `STEPCAFControl_Reader` | [S47] |
| Size | About 23 MB per variant (from the brief; not independently measured here) | — |
| OCCT version | **Not stated** in any file I read. Because the build uses the 2023 Docker image, it is probably 7.6.x | (inference) [S08, S46, S48] |
| Recent licence fix | Commit "Use the correct license for replicad-opencascade" on 14 August 2026 | [S50] |

The August 2026 licence-fix commit is a reason to check that the `LICENSE` file in the tarball matches `package.json` (inference).

**What the LGPL means for a browser-delivered wasm.** This is an engineering reading of LGPL-2.1 §6 [S81] plus the OCCT exception [S06]:

- **Notices.**
  - State that the product uses OCCT, in the documentation and the about/help page. This is required by the exception.
  - Ship the LGPL-2.1 text.
  - Show the OCCT copyright notice wherever runtime notices are shown.
- **Replaceability.**
  - Load OCCT as a separate `.wasm` + JS glue file that a user could swap for a modified, interface-compatible build. This is the closest analogue to §6(b), the shared-library mechanism.
  - Do not merge the OCCT wasm into our own wasm or minified bundle.
- **Source.**
  - Make available the exact OCCT source, the opencascade.js build tooling, replicad's YAML build configuration, and any patches, from the same place the app is downloaded, or with a written offer (§6(a), (c), (d)).
  - Mirroring the `replicad-opencascadejs` source and build configuration at the shipped version is the simplest way.
- **Terms of use.** Our terms must not forbid modifying the app for personal use or reverse engineering to debug such modifications (§6 preamble [S81]).
- **replicad itself (MIT)** needs only its copyright notice.
- **Server-side Node use** does not distribute the binary, so it triggers fewer obligations (bg). Desktop distribution (Tauri/Electron) does distribute it.

**Verdict:**

- Adopt for Phase 1.
- Treat "own OCCT 8 wasm build" as a Phase 2 evaluation item. Effort: regenerate the bindings for a C++17 OCCT, using the opencascade.js generator or a fork; weeks, not days (inference). Also review the 8.0 container API changes [S41, snippet].

### 2.3 replicad (TypeScript API)

- **What:** "library first" code-CAD over OpenCascade for embedding in web apps [S05, S09]. MIT [S05].
- **Activity:**
  - 702 stars, 492 commits [S05];
  - 1.0.0 on 14 August 2026, 1.0.1 on 21 August 2026, 1.1.0 on 4 September 2026 [S02];
  - recent work: split/cutPlane operations, refactored fillets/chamfers, "shape functions" entry point [S50];
  - single maintainer by appearance, so bus-factor risk (inference).
- **Licence history (important):** versions 0.5.0–0.15.1 are `AGPL-3.0-or-later`; 0.15.2 onwards is `MIT` [S02]. Lockfiles must never resolve to an old AGPL version.
- **No GitHub Releases** are published [S44], so changelogs have to be read from commits.

**Limitations relevant to us (inference from the API's code-CAD focus):**

- No persistent naming layer.
- No sketch constraint solver.
- No exposure of OCAF/XDE.
- Selection is by finder/filter predicates, similar to CadQuery/build123d selectors.

That fits a feature-tree CAD that owns naming and constraints itself.

**Verdict:** adopt, behind our adapter. Where replicad lacks an operation, drop to the `replicad-opencascadejs` raw bindings in the same module.

### 2.4 CadQuery, build123d and OCP (Python over OCCT)

| Project | Licence | Latest release | OCCT binding | Notes |
|---|---|---|---|---|
| CadQuery | Apache-2.0 [S12] | 2.8.0 (21 June 2026) [S15] | `cadquery-ocp` >=7.9.3.1, <8.0 [S15] | Fillets, lofts, assemblies, STEP/DXF/STL/3MF export [S12] |
| build123d | Apache-2.0 [S13, S14] | 0.13.0 (21 September 2026) [S14] | `cadquery-ocp-novtk` >=8.0, <8.1, i.e. **OCCT 8.0** [S14] | No persistent naming. Topology is selected with sortable/filterable `ShapeList` selectors [S13] |
| OCP | Apache-2.0 [S78] | n/a | pywrap-generated thin bindings [S78] | — |

- **Relevance:** server-side Python is not part of our architecture, but these projects are useful for three things:
  - **API design references** (selectors, builder/algebra modes);
  - **regression geometry** (their test suites exercise OCCT edge cases);
  - **evidence that OCCT 8 is already consumed downstream** (build123d), which lowers the risk of an OCCT 8 upgrade.
- **Licence:** Apache-2.0 makes code reuse permissible with attribution and notice.
- **Verdict:** reference only.

### 2.5 FreeCAD (Part, PartDesign, Sketcher, Assembly)

- **Overview:**
  - C++/Python desktop CAD over OCCT. 34.3k stars, about 49k commits [S68].
  - The GitHub page says LGPL-2.1 [S68]; the planegcs source header says `LGPL-2.1-or-later` [S71].
- **Releases:**
  - 1.0 was announced on 18–19 November 2024 [S18, S90 snippet]. It brought the realthunder topological-naming mitigation in Sketcher and PartDesign, and a built-in Assembly workbench using the Ondsel solver [S18].
  - Current stable is 1.1.4 (28 September 2026, the last planned 1.1.x release).
  - The project has moved to calendar versions: 26.3 RC1 on 8 October 2026, then 27.1/27.2/27.3 [S16].
- **Topological naming:** realthunder's element-map design, summarised in §4.4 [S19].
  - The FreeCAD wiki says the mitigation is incomplete and more automatic and assisted repair will follow. Users are still advised to avoid fragile references [S90, snippet]. The wiki page itself was blocked by bot protection [S17].
  - Ondsel's write-up credits Chris Hennes and John Dupuy for the upstreaming phases (snippet) [S20].
- **Sketcher:** planegcs. Solvers: DogLeg, Levenberg-Marquardt, BFGS, SQP. Diagnosis: Eigen dense or sparse QR with a pivot threshold [S71, S59].
- **Verdict:** reference only (desktop application). FreeCAD is the best open reference for how an OCCT feature modeller handles naming and sketch diagnosis. Its code is LGPL, so we can link it as a library (planegcs), but copying code into our MIT/proprietary TypeScript would make those files LGPL. Re-implement from published descriptions instead.

### 2.6 SolveSpace (own NURBS kernel and libslvs)

- **What:** parametric 2D/3D CAD with its own kernel and constraint solver.
- **Licence:** `GPL-3.0-or-later` [S23]. libslvs is likewise GPLv3. SolveSpace states this generally forbids linking with proprietary software and asks commercial users to contact them [S37].
- **Latest release:** 3.2 (date shown as 27 March; year not shown) [S36].
- **Web build:** the Emscripten build is "very experimental", with many critical bugs and unimplemented core functions [S23].
- **Solver design:** a symbolic equation system solved with a modified Newton method. Underconstrained systems are handled by least squares with each equation treated as a penalty. Non-convergence usually means a real conflict [S86].
- **Verdict:** avoid (licence) for code. Its solver design (least squares on underconstrained sketches, which makes dragging behave well) is a good reference for our TypeScript solver.

### 2.7 truck (Rust)

- **What:** Rust B-rep with NURBS, split into crates (geometry, topology, shapeops booleans, meshalgo, stepio, wgpu rendering) [S24].
- **Licence:** Apache-2.0 [S24, S26].
- **Activity:** `truck-modeling` 0.6.0 (20 September 2024) is the latest crate release [S26]; `truck-stepio` 0.3.0 is from the same date [S79].
- **Gaps:** fillets are not mentioned in the README [S24], and STEP coverage is undocumented [S79].
- **Verdict:** reference only. It is not a replacement: no fillet/offset maturity is evident and releases have stalled for two years.

### 2.8 Fornjot (Rust)

- **Licence:** 0BSD.
- **Status:** "This project has been shut down. Its goals were never reached." Archived 19 June 2026 [S25].
- **Verdict:** avoid (dead project).

### 2.9 manifold (mesh booleans)

- **What:** C++ library with guaranteed-manifold mesh booleans [S27]. Apache-2.0.
- **Package:** npm `manifold-3d` 3.5.4 [S28]; v3.5.4 tagged 25 September (year inferred as 2026) [S85].
- **WASM:** serial-only and slower than native [S27].
- **Users:** OpenSCAD, Blender, Godot, Babylon.js, BRL-CAD [S27].
- **Verdict:** evaluate for mesh-domain features: STL import operations, robust mesh CSG previews, lattice, 3D-printing workflows. It is not exact geometry, so it cannot replace B-rep booleans or produce STEP.

### 2.10 libfive and Curv (implicit / f-rep)

- **libfive:** MPL-2.0 core and Python bindings; Studio and Guile bindings GPL-2.0-or-later [S29].
- **Curv:** Apache-2.0, archived in September 2023, development moved to Codeberg [S32].
- **Verdict:** reference only. Implicit modelling suits lattices and generative shapes but does not produce B-rep/STEP without meshing.

### 2.11 OpenSCAD

- **Licence:** `GPL-2.0-or-later` per most packagers and Wikipedia (snippet) [S34]. The GitHub page did not state it in the fetched content [S30].
- **Backend:** Manifold became the default CSG backend in development snapshots in August 2025, with CGAL still available (snippet) [S34].
- **Verdict:** avoid (licence). Reference only for how a CSG language maps onto manifold.

### 2.12 CGAL

- **Licence:** dual. Foundational kernel/support packages are LGPL-3.0-or-later; most higher-level algorithms are GPL-3.0-or-later. Commercial licences are available from GeometryFactory [S31].
- **Verdict:** avoid the GPL packages. Nothing in Phase 1 needs CGAL.

### 2.13 Salome (GEOM / SHAPER)

- **What:** LGPL (2.1 on the older licence page) numerical-simulation platform over OCCT. 9.16.0 release notes are dated June 2026 (snippet) [S67].
- **Verdict:** reference only, for meshing/simulation pre-processing ideas.

### 2.14 Mayo

- **What:** Qt + OCCT viewer and converter. BSD-2-Clause [S33].
- **Formats:** STEP/IGES/BREP/glTF/OBJ/STL among others [S33].
- **Verdict:** reference only. Useful as an independent tool for checking our STEP and glTF exports manually.

### 2.15 three.js and WebGPU

- **three.js:** MIT; npm `three` 0.186.1 [S84]. Builds include WebGL and WebGPU renderers [S66].
- **WebGPU by browser:**
  - Chrome since 113 (April 2023);
  - Safari 26 (2025, including iOS/iPadOS 26);
  - Firefox on Windows (July 2025) and Apple-silicon Mac (November 2025);
  - Linux and Android remain gaps (all snippet; the Khronos page itself failed to load) [S65].
- **Verdict:** adopt three.js with **WebGL2 as the default renderer**. WebGPU is opt-in until Firefox on Linux and Android catch up.

---

## 3. Constraint solvers

### 3.1 FreeCAD planegcs and `@salusoft89/planegcs`

**Upstream (FreeCAD planegcs):**

- Solvers: `solve_DL` (DogLeg), `solve_LM`, `solve_BFGS`, and SQP for temporary constraints [S71, S72].
- Diagnosis: Eigen sparse or dense QR, an automatic choice, a pivot threshold, and conflicting / redundant / partially-redundant tags plus dependent-parameter groups [S71].
- File header: `SPDX-License-Identifier: LGPL-2.1-or-later`, while the prose says "version 2 ... or any later version" [S71].
- Documented pitfalls:
  - dense QR gets slow on large sketches;
  - rank results are sensitive to the pivot threshold (1e-13 default; 1e-15 changes the rank in one bug report);
  - partially redundant constraints can be dropped silently;
  - near-zero gradients are misclassified as locked (snippet) [S59].

**The wasm port, `@salusoft89/planegcs`:**

| Item | Finding | Evidence |
|---|---|---|
| Version history | 1.3.0 on 5 October 2026; 1.2.0 on 6 July 2026; a gap between 1.1.7 (April 2025) and 1.2.0 | [S03] |
| Licence | npm metadata `LGPL-2.0-or-later` [S75]; README "LGPL-2.1" [S72]; upstream SPDX `LGPL-2.1-or-later` [S71]. All are LGPL ≥2, and all are compatible with loading it as a separate wasm. Record the most conservative reading (LGPL-2.1-or-later) and raise the mismatch with the maintainer | — |
| Size | `planegcs.wasm` 484,003 bytes; no runtime dependencies | [S73, S75] |
| API, setup | `init_planegcs_module()` → `new GcsWrapper(new module.GcsSystem())` | [S72] |
| API, data | JSON primitives referencing each other by id: point, line, circle, arc, ellipse, elliptical arc, hyperbola, parabola, B-spline, and all planegcs constraints. Constraint values can be numbers, named sketch parameters, or properties of other geometry. Options `driving`, `temporary`, `scale` | [S72] |
| API, methods | `push_primitives_and_params`, `solve(algorithm?) → SolveStatus`, `apply_solution`, `get_gcs_conflicting_constraints()`, `get_gcs_redundant_constraints()`, `get_gcs_partially_redundant_constraints()` (plus `has_*` variants), `push_sketch_param` / `set_sketch_param`, `set_max_iterations` (default 100), `set_convergence_threshold` (default 1e-10), `destroy_gcs_module()` (frees wasm memory) | [S74, S72] |
| API, DOF | **No DOF getter** in the public wrapper [S74]. DOF would come from the parameter count minus the Jacobian rank, which is not exposed (inference) | [S74] |
| Algorithms | DogLeg (default), LevenbergMarquardt, BFGS; SQP whenever a temporary constraint exists | [S72] |
| Maintenance | Built as part of the author's thesis; the README warns it may be outdated and that FreeCAD parsing scripts can break on new FreeCAD versions. 107 stars, 312 commits | [S72] |

**Verdict:** evaluate now. Use it as a test oracle (differential tests against our TypeScript solver), and adopt it if the triggers in §3.6 fire.

### 3.2 SolveSpace libslvs

- GPL-3.0-or-later [S37]. Linking it into our proprietary or MIT distribution is not acceptable; a commercial licence from SolveSpace is the only route.
- **Verdict:** avoid (licence). Its algorithm description is a reference only [S86].

### 3.3 OndselSolver (FreeCAD Assembly)

- **What:** "Assembly Constraints and Multibody Dynamics code" [S21, S22]. The original Ondsel repository (LGPL-2.1) was archived on 1 March 2025 [S21]; development continues at `FreeCAD/OndselSolver` (220 commits) [S22].
- **Backing company:** Ondsel ceased operations in autumn 2024 and its work went upstream into FreeCAD (snippet) [S76].
- **Activity:** FreeCAD's September 2026 weekly builds still fix Assembly DOF calculation issues [S16], so the solver is alive but young.
- **Verdict:** evaluate in the assembly phase. It is the only LGPL assembly/kinematics solver of note.

### 3.4 D-Cubed DCM (Siemens)

- **What:** proprietary 2D/3D Dimensional Constraint Manager. D-Cubed was founded by John Owen in Cambridge, UK, and later acquired by Siemens [S60].
- **Licensees (Siemens list, undated):** Autodesk, PTC, Onshape, IronCAD, ZWCAD; CAE vendors including ANSYS, Altair, COMSOL (snippet) [S57].
- **Verdict:** reference only. It is the benchmark for "commercial-grade" solving, and a fallback purchase if our solver scope grows beyond what we can maintain.

### 3.5 Academic background (short)

- **Two solver families:**
  - **Graph-constructive solvers** decompose the constraint graph into rigid subproblems and solve those algebraically or by construction.
    - Owen (1991) analysed the graph top-down into triconnected components and passed generic subproblems to an algebraic solver [S58, snippet].
    - Later work reformulated this decomposition [S58, snippet].
    - Owen and Power showed that some generic 3-connected planar systems cannot be solved by radicals at all, which limits pure algebraic approaches [S58, snippet].
  - **Numerical solvers** (Newton, LM, dog-leg) handle any well-posed system but can converge to the "wrong" root and do not explain over-constraint by themselves.
- **Hybrids:** commercial systems are understood to combine both families: decompose first, then solve numerically (bg; consistent with the Bettig & Hoffmann 2011 survey's framing, which I could not read in full [S61, snippet]).
- **Decomposition surveys:** Jermann, Trombettoni, Neveu and Mathis classify decomposition techniques into four families and weigh them against industrial requirements [S83, snippet].
- **Recent review:** Zou et al. (2022) say the field shifted from late 2000s onwards to detecting and decomposing under- and over-constrained parts, which must be found before numerical solving [S87].
- **DOF and redundancy in practice:**
  - DOF = number of free parameters minus the rank of the constraint Jacobian at the current point.
  - Redundant or conflicting constraints show up as rank deficiency. You find which ones with a rank-revealing factorisation (column-pivoted QR, or SVD) of Jacobian rows, then test the residual to separate redundant (consistent) from conflicting (inconsistent) constraints (bg; this is what FreeCAD does with QR [S59, S71]).
  - Structural (graph) DOF counting is cheaper but misses geometric degeneracies (bg).

### 3.6 Recommendation: in-house TypeScript solver versus planegcs

**Adequate for Phase 1 if scope is capped** (inference from the above):

- **Entities:** points, lines, circles, arcs.
- **Constraints:** coincident, horizontal/vertical, parallel/perpendicular, tangent (line–arc, arc–arc), equal length/radius, distance, angle, radius/diameter, point-on-object, symmetric, fix.
- **Size:** about 200 parameters per sketch.

**Must have from day one:**

1. Sparse Jacobian assembly and LM or dog-leg with scaling.
2. A rank-revealing QR (column pivoting) with a relative tolerance. Report DOF and list redundant versus conflicting constraints. This is the hard part [S59].
3. Least-squares behaviour on underconstrained sketches, with weak "stay near the previous solution" regularisation for dragging. SolveSpace documents why this matters [S86].
4. Deterministic results: the same input gives the same output. This is critical for topological naming stability (§4).
5. A solver interface (`solve(sketch) → {params, status, dof, redundant[], conflicting[]}`) that planegcs can also implement.

**Switch to or adopt planegcs when any of these fires:**

- Ellipses, conics or B-splines are needed. planegcs already has them [S72].
- Sketches pass a few hundred parameters, or interactive drag rates fall below about 30 Hz.
- Diagnosis disagrees with the planegcs oracle in more than a handful of fuzz cases that we cannot fix within a sprint.
- We need temporary/SQP drag semantics like FreeCAD's.

**Planned use of planegcs (start in Phase 1):** run it in CI only, as a differential test oracle on generated sketches. Compare DOF classification and solved positions. This costs little: 484 KB, LGPL, and not shipped to users (inference).

---

## 4. Topological naming

### 4.1 The problem

- A history-based model stores references to faces and edges produced by earlier features (for example, "fillet edge 7" or "sketch on face 3").
- After a parameter change, the kernel regenerates the topology, and indices or object identities change.
- The task is to re-identify the referenced entities in the new model, or to report clearly that this cannot be done.
- Marcheix and Pierra surveyed this "persistent naming problem" at ACM Solid Modeling 2002 (snippet; full text not read) [S53].
- Bidarra et al. argue that it is inherent to history-based modelling and cannot be fully solved by naming schemes alone (snippet) [S51].

### 4.2 Literature (abstract or citation level only; say so when citing)

- **Kripac (1997)**, *Computer-Aided Design* 29(2):113–122.
  - Widely cited as the first full mechanism for persistent naming in history-based solid modellers. Autodesk cited it as prior art in its 1999 loft-naming patent (snippet) [S51].
  - From background knowledge, not re-read: it names faces by their generating feature and the generating topology, records a face-history graph across operations, and matches through that history (bg).
- **Capoyleas, Chen and Hoffmann (1996)**, "Generic naming in generative, constraint-based design", *CAD* 28(1):17–26 (technical report 1994/95).
  - Names elements algorithmically and generically from how they were generated, with a companion algorithm for matching names after edits (snippet).
  - The Purdue PDF is a scanned image and I could not read it [S52].
- **Marcheix and Pierra (2002)**, survey (snippet) [S53]. Agbodan et al. (2003) present a topological entity matching technique [S88, not readable].
- **Onshape:**
  - FeatureScript publicly documents that features reference geometry through **queries**, which are criteria rather than entity pointers, for example `qCreatedBy(featureId)`.
  - Operations carry hierarchical operation `Id`s, and `evaluateQuery` returns transient queries [S55].
  - Forum threads mention "deterministic IDs", reachable via `transientQueriesToStrings`, and report that some IDs inside fillets/chamfers cannot be resolved this way (snippet) [S54].
  - Onshape's internal naming algorithm is **not publicly documented** in anything I found [S56].
  - The public model is still informative: entities are identified by the creating operation id plus criteria, and the kernel (Parasolid, (bg)) supplies history.

### 4.3 OCCT TNaming / OCAF

- **Data structure:** `TNaming_NamedShape` stores old→new pairs with one evolution type per attribute: PRIMITIVE, GENERATED, MODIFY, DELETE, SELECTED [S38].
- **Building names:** `TNaming_Builder` records the pairs.
- **Re-resolving:** `TNaming_Selector::Select()` builds a name from context and history, and `Solve()` re-resolves it after a change [S38].
- **Requirements:** history must be provided for faces, edges and vertices; seam and degenerate edges need care; one attribute per GUID per label [S38].
- **Fit for us:** our wasm build does not appear to bind TNaming/OCAF (they are not in the inspected binding list [S47]; inference). OCAF also brings a document model that would compete with our own model service.
- **Verdict:** use OCCT's maker history (`Generated`/`Modified`/`IsDeleted` [S82]) directly, not OCAF.

### 4.4 FreeCAD's element map (realthunder, merged for 1.0)

- **Element map:** every `TopoShape` can carry an `ElementMap` that maps stable names to element indices. An element can have several names [S19].
- **Tags:** each owning object has an integer tag; names copied from inputs get a `;:T<tag>` postfix [S19].
- **Generated names:** for real modelling operations, names are generated from OCCT `BRepBuilderAPI_MakeShape` history (generated/modified) [S19]. The detailed boolean rules are on a separate page that I did not read.
- **Length control:** long names can be hashed through a `StringHasher` [S19].
- **Versioning:** an element-map version string (algorithm + OCCT version + hasher settings) forces a recompute when it changes. Any change to shape-building logic can rename elements, so features must bump their version [S19].
- **Known costs** [S19]:
  - names grow with model depth;
  - copy/paste breaks identity;
  - primitives have no map by default.
- **Status:** shipped as a *mitigation*, not a complete fix [S18, S90 snippet].

### 4.5 Practical strategy (recommended)

**Layer 1: generative names (primary).**

- Each face/edge/vertex produced by a feature gets a structured name: `{featureId, role, source, discriminator}`.
  - **role:** for example `extrude.side`, `extrude.capStart`, `extrude.capEnd`, `revolve.side`, `fillet.blend`, `boolean.fromTool`, `boolean.fromTarget`.
  - **source:** the *stable sketch-entity id* that generated it. Sketch entities carry UUIDs, never indices.
  - **discriminator:** splits multiple results deterministically, for example by order along the profile or a split index.
- This is the Kripac/Capoyleas idea combined with Onshape's "creating operation" query model [S51, S52, S55].

**Layer 2: history propagation.**

- For modifying operations (booleans, fillets, chamfers, shell, draft), map every input sub-shape to output sub-shapes with OCCT `Modified()`, `Generated()` and `IsDeleted()` [S82, S70].
- Carry names forward:
  - **modified:** keep the name and append the operation;
  - **generated:** new name `{opId, role, fromName}`;
  - **split:** add a deterministic split discriminator.
- This mirrors FreeCAD's approach [S19] without copying its code.
- Store maps as `TopoName → current index`, rebuilt at every regeneration. Never persist kernel indices.

**Layer 3: geometric signature fallback.**

- When Layers 1–2 cannot resolve a reference uniquely, match by signature:
  - surface/curve type;
  - normal or axis direction;
  - centroid;
  - area or length;
  - adjacency to resolved names.
- Score the candidates. Accept a match automatically only above a threshold and with a unique best candidate.
- Otherwise mark the dependent feature "reference needs repair" and show the user the candidate faces. Never silently pick one.

**Rules:**

- Version the naming algorithm per feature type, as FreeCAD does [S19].
- Keep a golden-file regression suite of parametric edits, for example "change extrude depth, sketch dimension, hole count; assert that fillet references resolve".
- Make solver output deterministic (§3.6), because a solver that flips to the other root renames everything.

**What this costs:** see §6.

---

## 5. Kernel comparison matrix

Legend: ● strong/production, ◐ partial or immature, ○ absent, ? unverified.

| Criterion | OCCT (via replicad wasm) | SolveSpace kernel | truck (Rust) | Fornjot | manifold | libfive | OpenSCAD (CGAL/manifold) |
|---|---|---|---|---|---|---|---|
| B-rep | ● [S40] | ◐ (bg) | ◐ [S24] | ◐ early, dead [S25] | ○ mesh [S27] | ○ implicit [S29] | ○ mesh/Nef (bg) |
| Exact solids | ● | ◐ (bg) | ◐ | ◐ | ○ (approximate mesh) | ○ | ◐ CGAL exact Nef polyhedra (bg) |
| Booleans | ● with robustness caveats [S70, S69] | ◐ (bg) | ◐ [S24] | ? | ● robust mesh [S27] | ● (implicit, trivial) | ● |
| NURBS | ● [S40] | ● own NURBS (bg) | ● [S24] | ? | ○ | ○ | ○ |
| Trimmed surfaces | ● (bg) | ◐ (bg) | ◐ (bg) | ? | ○ | ○ | ○ |
| Fillets / chamfers | ◐–● (works but fails on hard cases [S69]) | ◐ (bg) | ○ not documented [S24] | ○ | ○ | ◐ (blends, implicit) | ○ (minkowski workarounds, (bg)) |
| Offset / shell | ◐–● [S82] | ○ (bg) | ? | ○ | ◐ mesh offset (bg) | ● implicit offsets (bg) | ◐ |
| Curve/surface intersections | ● [S82] | ◐ | ◐ | ? | n/a | n/a | n/a |
| Topological naming | ◐ TNaming framework; history API ● [S38, S82] | ○ (bg) | ○ (bg) | ○ | n/a | n/a | n/a (no B-rep refs) |
| Tolerance handling | ◐ per-entity tolerances, fuzzy booleans, but tolerance growth [S70, S82] | ? | ? | ? | ● (guaranteed manifold) | n/a | ◐ |
| Regeneration robustness | ◐ (depends on our naming layer) | ◐ | ? | ? | ● | ● | ● (no references) |
| Large-model performance | ◐ in wasm (4 GB cap, serial unless isolated) [S47, S45]; ● native | ◐ | ? | ? | ● native, ◐ wasm serial [S27] | ● | ● with manifold (snippet) [S34] |
| Cross-platform / web | ● wasm (built here); native everywhere | ◐ web build "very experimental" [S23] | ● Rust + wasm (bg) | ◐ | ● npm wasm [S28] | ◐ | ◐ (bg) |
| STEP exchange | ● (AP242 write and read verified locally; XDE import not in our build [S47]) | ◐ STEP export (bg) | ◐ `truck-stepio` undocumented [S79] | ○ (3MF) [S25] | ○ | ○ | ○ |
| Maintenance | ● 8.0.1 July 2026 [S04]; ◐ for our wasm toolchain (2023) [S48, S49] | ◐ 3.2 [S36] | ◐ last crate September 2024 [S26] | ○ archived 2026 [S25] | ● 3.5.4 September 2026 [S85] | ? [S29] | ◐ stable 2021.01, snapshots since (snippet) [S34] |
| Licensing for us | ● LGPL-2.1-only + exception (obligations §2.2) | ✗ GPL-3.0-or-later | ● Apache-2.0 | ● 0BSD | ● Apache-2.0 | ◐ MPL-2.0 core | ✗ GPL-2.0-or-later |

**Reading:**

- OCCT is the only column with strong marks across B-rep, NURBS, fillets, offsets and STEP.
- Its weak cells are tolerance/fillet robustness and naming. The first is mitigated by healing and good modelling practice; the second we must build ourselves in any case.
- manifold is the robust choice *for meshes*, a different job.

---

## 6. Cost of building missing pieces ourselves

Rough engineering estimates (inference; one experienced developer; excludes UI):

| Missing piece | Why we need it | Build ourselves | Alternative | Estimate |
|---|---|---|---|---|
| Persistent topological naming (§4.5) | No open TS/wasm library provides it; replicad does not | Generative names + OCCT history mapping + signature fallback + repair UI + regression suite | Port ideas from FreeCAD's element map (LGPL code; re-implement, do not copy) | Layer 1: 2–3 weeks for extrude/revolve/boolean. Layer 2 for fillet/chamfer/shell: +3–4 weeks. Layer 3 with repair UX: +2–3 weeks. Robustness work is ongoing |
| 2D sketch solver with diagnosis (§3.6) | Interactive sketching | Sparse LM/dog-leg + pivoted QR + DOF/redundancy reporting | `@salusoft89/planegcs` (LGPL wasm, ready) | Core solver 1–2 weeks. Diagnosis and fuzz hardening 2–3 weeks. Splines/ellipses: weeks more, which is the point to adopt planegcs |
| glTF export | Rendering/interop | Mesh from `BRepMesh` → three.js `GLTFExporter` (bg), with per-face groups carrying topological names | Rebuild wasm with `RWGltf` (needs a custom build) | 2–4 days |
| STEP import with colours/names/assembly | Interop with other CAD | Not reasonable in TypeScript | Custom wasm build adding `STEPCAFControl_Reader` + XCAF bindings | 1–2 weeks (build pipeline + bindings + tests) |
| OCCT 8 wasm build | Bug fixes, performance, long-term support | Fork the opencascade.js generator, update for C++17/NCollection changes [S41], CI the build | Wait for replicad upstream | 3–6 weeks initially, then ongoing maintenance per OCCT release |
| Assembly solver | Assemblies phase | 3D constraint solver for mates | OndselSolver (LGPL), D-Cubed (commercial) | Months to build; evaluate OndselSolver first |
| Robust fillet fallback | OCCT fillet failures [S69] | Retry strategies (split edge sets, alternative radius ordering, healing before and after) + clear error messages | None in open source | 1–2 weeks for a retry/diagnosis wrapper; true kernel fixes are out of scope |

---

## 7. Interop to rendering

- **Tessellation:** `BRepMesh_IncrementalMesh(shape, linDeflection, isRelative, angDeflection, inParallel)` [S39].
  - The documentation calls an angular deflection of about 12–20° relatively safe. Relative mode scales deflection with model size, which fits a viewer handling mixed sizes [S39].
  - Small linear deflection values make meshes very large [S39]. Expose a quality preset, not raw numbers.
  - `InParallel` only helps in the multi-threaded wasm (inference from [S45]).
- **Face mapping:** read the per-face triangulation (`BRep_Tool::Triangulation`) [S39] and emit one index range per B-rep face, tagged with its topological name. Picking in three.js can then map a triangle back to a face name, and from there to a feature reference.
- **Edges:** render edges from edge polygons (`PolygonOnTriangulation`) [S39] as line segments for crisp silhouettes.
- **glTF:**
  - OCCT has read/write glTF in the data-exchange layer [S42], but our wasm does not bind it [S47].
  - Produce glTF 2.0 (`.glb`) in JavaScript from the same buffers with three.js's exporter (bg). This also fits the repository's existing GLB viewer app.
- **WebGPU:** optional. WebGL2 stays the baseline (§2.15) [S65].

---

## 8. Native/WASM performance and deployment

- **Threads:**
  - The multi-threaded build needs `SharedArrayBuffer`, which requires a secure context and cross-origin isolation: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Check with `crossOriginIsolated` at runtime [S62, S89].
  - Every cross-origin resource (fonts, CDN scripts, iframes) must then opt in through CORS/CORP. COEP `credentialless` was Chromium-only when the web.dev article was written [S89].
  - wasm threads are supported in Chrome 74+, Firefox 79+, Safari 14.1+ [S64].
  - **Recommendation:** detect isolation and load `replicad-opencascadejs/multi` only when isolated; otherwise use the default single-threaded build [S46].
- **Memory:**
  - Our build grows from 100 MB up to `MAXIMUM_MEMORY=4GB` [S47].
  - memory64 ships in Chrome 133 and Firefox 134, but Safari only has it behind a flag (Technology Preview) [S64]. There is also an engine-level performance cost to 64-bit pointers (snippet) [S63].
  - Mobile browsers will kill tabs well before 4 GB (bg).
  - **Plan:** treat 4 GB as a hard ceiling. Free OCCT objects deterministically: replicad/opencascade.js objects need explicit `.delete()` (bg), and planegcs needs `destroy_gcs_module()` [S72]. Keep memory telemetry in the worker.
- **Exceptions and SIMD:** the build uses native wasm exceptions (`-fwasm-exceptions`) and SIMD128 [S47]. The minimum browsers are therefore those with wasm exception handling (Chrome 95, Firefox 100, Safari 15.2 for the legacy proposal) and SIMD (Chrome 91, Firefox 89, Safari 16.4) [S64]. Safari 16.4 and later is the effective floor (inference).
- **Worker architecture (recommended):**
  - One dedicated "kernel worker" owns the OCCT module and the document's B-rep cache.
  - The main thread sends commands (`regenerate(featureTree, fromFeatureId)`) and receives transferable typed arrays (positions, normals, indices, face ranges) plus topological name tables.
  - The sketch solver runs in a separate light worker, or on the main thread for small sketches, so dragging never waits on a boolean.
  - Requests are cancellable through generation counters, because a stale regeneration result is discarded, not applied.
  - In Node tests, the same module runs in-process (verified locally per the brief).
- **Native cores later:**
  - Native OCCT (C++), or a Rust core via truck, is only relevant for a desktop or server build. Native OCCT gets real threads and no 4 GB limit.
  - **Tauri 2** (Apache-2.0 OR MIT; system webview; Rust backend) [S77] could host either the wasm (simplest) or a native OCCT sidecar.
  - **Electron** (MIT, (bg)) bundles Chromium, which gives a consistent WebGPU/wasm feature set at the cost of size.
  - The LGPL obligations in §2.2 apply to any desktop distribution.

---

## 9. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | The wasm OCCT is old (probably 7.6.x) and the opencascade.js toolchain is dormant since 2023 [S48, S49]. Upstream fixes are unavailable | High | Medium–High | Verify the version. Adapter layer. Phase 2 spike: own OCCT 8 build (§6) |
| R2 | replicad is effectively a single-maintainer project | Medium | High | Pin versions. Use only a thin API surface. Keep a fork-ready setup (MIT allows it) |
| R3 | LGPL compliance gaps (no source offer, bundling wasm, restrictive terms of service) | Medium | High (legal) | §2.2 checklist in the release process. Mirror the build source. Legal review |
| R4 | Accidental pull-in of old AGPL replicad (<0.15.2) or GPL code (SolveSpace, OpenSCAD, CGAL-GPL) | Low | High | Licence allow-list check in CI. Record in `docs/dependencies.md` |
| R5 | Fillet/boolean failures on user models [S69] | High | Medium | Pre/post healing, retry strategies, precise error messages, failing-case corpus |
| R6 | Topological naming instability leads to broken downstream features | High | High | §4.5 three-layer strategy, versioned algorithms, regression suite, explicit repair UX |
| R7 | In-house solver diagnosis is wrong (threshold sensitivity, partial redundancy [S59]) | Medium | Medium | planegcs differential oracle in CI. Switch triggers (§3.6) |
| R8 | Memory ceiling (4 GB; no memory64 in Safari) on large models [S47, S64] | Medium | Medium | Explicit deletes, LOD meshing, server/desktop native path later |
| R9 | Cross-origin isolation breaks third-party embeds, so multi-threading is unavailable in some hosts [S89] | Medium | Low–Medium | Single-thread default, feature detection |
| R10 | Missing XDE STEP import and glTF in the current wasm [S47] | Certain | Low (Phase 1) | JS glTF export. Custom build when XDE import is needed |
| R11 | planegcs is a thesis-derived, single-maintainer port with inconsistent licence metadata [S72, S75] | Medium | Low (only an oracle in Phase 1) | Pin the version. Ask the maintainer to fix the licence fields. Can be rebuilt from FreeCAD sources |
| R12 | WebGPU fragmentation (Linux Firefox, Android) [S65] | Medium | Low | WebGL2 default |

---

## 10. Open questions to verify before the kernel ADR

1. What exact OCCT version is compiled into `replicad-opencascadejs` 1.1.0? Check strings in the wasm, or ask upstream.
2. Does the published `replicad-opencascadejs` tarball contain the LGPL text and a pointer to the build sources? The npm metadata has no repository field [S01].
3. Measure the real gzip/brotli transfer size and startup time of the single and multi variants, in our app.
4. Does STEP AP242 re-import with `STEPControl_Reader` keep everything we need (solids only), and what is lost without XCAF?
5. Prototype a 50-case sketch fuzz set comparing our solver with planegcs 1.3.0.

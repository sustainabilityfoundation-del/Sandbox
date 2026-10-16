# Open-source assessment, Phase 1 (section 12 report)

Status: **proposal for owner and coordinator decisions**, 16 October 2026. Prepared by the architect agent (read-only, main
316368c) for [the open-source strategy](OPEN_SOURCE_STRATEGY.md) §12; recorded by the coordinator. Licences marked "verified"
were read from the upstream LICENSE file or the npm registry on that date. Nothing here is adopted until decided.

## 1. What already uses open source

| Area | Component | Licence (strategy §2 category) |
| --- | --- | --- |
| CAD kernel (`packages/cad-kernel`) | replicad 1.1.0 (MIT) over OCCT via replicad-opencascadejs 1.1.0; OCCT also tessellates and writes/reads STEP, so there is no own meshing code | LGPL-2.1-only + OCCT exception (verified): **Conditional**, ADR-0021 held for the owner |
| Rendering | three 0.180; @react-three/fiber and drei (GLB viewer) | MIT: Preferred |
| Editors and diagram layout (SysML Modeler) | CodeMirror 6, Lezer; elkjs 0.11.1 (unmodified) | MIT: Preferred; elkjs EPL-2.0: **Conditional** |
| Mathematics (`packages/engineering-calc`) | mathjs 15.2.0, used for parsing | Apache-2.0 (verified): Preferred |
| Database and server | PostgreSQL 17 (embedded-postgres), pg, fastify, typebox, ajv | Preferred |
| UI | React, react-aria-components, zustand, Tailwind, Lucide icons, IBM Plex fonts, driver.js, @scalar/api-reference | Preferred (Apache-2.0, MIT, ISC, OFL-1.1) |
| Exchange (`packages/reqif`) | @xmldom/xmldom, fflate, xmllint-wasm | MIT: Preferred |

Lockfile: 596 third-party entries. MIT 515, Apache-2.0 29, ISC 19, MPL-2.0 12, BSD-3-Clause 10, BSD-2-Clause 2, OFL-1.1 2, and
one each of EPL-2.0, LGPL-2.1-only, CC-BY-4.0, (AFL-2.1 OR BSD-3-Clause), (MIT OR CC0), 0BSD and "none".
**No GPL or AGPL.** The MPL-2.0 entries are lightningcss (build tool, not shipped); CC-BY-4.0 is caniuse-lite (build data); the
"none" entry is webgl-constants (GLB viewer only; its LICENSE file says MIT). @scalar/api-reference brings in the Vercel `ai` SDK
and `@ai-sdk/*` (Apache-2.0), which docs/dependencies.md does not list.

## 2. Own code where mature open source exists

The strategy (§4) allows replacement only with a demonstrated benefit.

| Area | Our code | Candidates (licence) | Replace now? |
| --- | --- | --- | --- |
| Sketch constraint solver | `packages/cad-core/src/sketch/solver.ts`, `linalg.ts` (~590 lines, ADR-0025) | planegcs 1.3.0 (LGPL-2.0-or-later); SolveSpace libslvs (GPL-3.0); D-Cubed (commercial) | No: D1 sketches are small and every alternative's licence is worse. Use planegcs as a development-only test oracle and put `solveSketch` behind a `SketchSolver` interface |
| SysML v2 parser and semantic core | `packages/sysml-core/src/syntax/*` (~2,600 lines, ADR-0031) | Pilot implementation, SysON (EPL-2.0, Java); OpenSysML `@openmbee/opensysml-wasm` 0.10.1 (Apache-2.0, 34.8 MB, very new) | Not now: ADR-0031's reasons hold. Add OpenSysML as a second conformance oracle and reassess later |
| Units and quantities | Three tables: SDK `contract/quantities.ts`, `sysml-core/src/units/*`, `cad-core` `UNIT_FACTORS` (mm, deg, no dimension check) | mathjs units (installed); js-quantities, UnitMath (licences not verified) | No library swap; the benefit is **consolidating** onto the SDK algebra so D1's inch/mm bindings cannot drift |
| Mathematical reasoning | `engineering-calc` (own interpreter over the mathjs syntax tree, intervals); `design-reasoning-core` | SymPy (BSD-3), SciPy, NLopt, HiGHS in a worker | No for D1 (assignments and bound checks exist). A worker is ADR-0044 phase 3. Design reasoning is proprietary differentiation (§2) |
| Meshing | none (OCCT) | Gmsh (GPL-2+ with linking exception; commercial licence for closed source) | Not needed until analysis (FEA) |
| Graph and traceability | recursive SQL queries (ADR-0041) | Apache AGE (Apache-2.0) | No: it adds a PostgreSQL extension, and the queries are adequate |
| ReqIF | `packages/reqif` (TypeScript) | strictdoc reqif (Python, Apache-2.0; its samples are already used); Eclipse RMF (not verified) | No maintained JavaScript library found; ReqIF is not in D1 |
| Mock CAD tool | `packages/tool-cad` | already superseded by the CAD Modeler on OCCT | Retire through ADR-0027 after D1 (owner decision) |

## 3. Greatest immediate advantage for D1 (none delays it)

- **OCCT for D1's check step:** the CAD check should take volume, bounding box and solid validity from OCCT through the existing
  `GeometryKernel` port (`cad-core/src/kernel.ts`), not from own geometry code. The current implementation was not inspected.
- **Mathematical reasoning through engineering-calc and mathjs** in Conceptualize calculations: pocket across-flats with
  clearance, wall thickness from pitch and across-corners, mass.
- **Development-only oracles** (nothing shipped): planegcs for regular-polygon sketches; OCCT STEP read-back (already used).
- **Not before D1:** SymPy/SciPy workers, Apache AGE, Gmsh, swapping the SysML parser.

## 4. Licence and IP risks

1. **OCCT (LGPL-2.1) runs in the browser** (services/cad has the kernel only as a development dependency; the WASM is 22 MB),
   so every browser user receives the library and the LGPL distribution duties apply **even for a hosted (SaaS) deployment**.
   In place: the WASM is a separate, replaceable file, and the notice ships. Still needed: a page saying where the corresponding
   source and build recipe are (OCCT version "7.6" is inferred); terms of service that do not forbid reverse engineering for
   debugging; never modifying the WASM without publishing the changes. **Owner decision (ADR-0021).**
2. **Notices file incomplete:** `THIRD_PARTY_NOTICES.txt` covers replicad and OCCT only. elkjs (EPL-2.0, ships to browsers),
   the Apache-2.0 NOTICE files (react-aria, mathjs, the `ai` SDK), the OFL font licence and the ISC icon licence are missing.
   A compliance gap, not a blocker.
3. **SysML v2 release corpus (EPL-2.0):** downloaded for tests, not committed or shipped. Residual risk: OMG text copied into
   `sysml-core/src/library/text.ts`; a provenance review is advisable.
4. **Lockfile:** three entries need a recorded licence choice: json-schema (choose BSD-3), webgl-constants (MIT per its LICENSE
   file), the MIT-or-CC0 entry. Keep replicad pinned at 1.1.0 (releases 0.5 to 0.15.1 were AGPL).
5. **OpenAI:** the assistant and the visualization service send user content to OpenAI. Whether "Sign in with ChatGPT" may be
   used in a hosted multi-user product is not verified; D1 limits it to local installation. **Owner decision** (terms, data
   processing).

## 5. Target architecture and priorities

Solver-neutral ports, each owned by the consuming module, with versioned types, units from the SDK algebra and provenance
(engine name and version):

- **Mathematics:** a `CalculationEngine` port in `packages/engineering-calc`; today's interpreter is backend 1; a Python worker
  later, in a service, by its own ADR.
- **Geometry:** `GeometryKernel` exists in cad-core; add `SketchSolver`.
- **Simulation:** reserve a contract only; nothing to build before a simulation module exists.
- **Visualization:** three.js stays inside each tool; AI image generation already has an adapter registry.

Priorities: P1 compliance notices, dependency register, SBOM and licence checks in CI (OSS-2, OSS-6); P2 D1 checks through the
OCCT and engineering-calc ports; P3 unit consolidation; P4 oracles (planegcs, OpenSysML); P5 formal ports (OSS-4); P6 retire the
mock CAD tool after D1; P7 module assessments (OSS-3).

## 6. Documentation and instructions still required

- AGENTS.md "Ownership" has no owner for engineering-calc, design-reasoning-core, reqif, visualization-client, and
  services/assistant, settings, visualization, api.
- No package AGENTS.md for reqif, platform-sdk, model-service, cad-client, requirements-client, visualization-client,
  services/api, services/cad, services/requirements.
- [docs/architecture.md](../architecture.md) is out of date (SDK 1.8 instead of 1.12, Phase 1 packages only, "mock geometry only").
- docs/dependencies.md omits transitive dependencies (the `ai` SDK) and the "none" entry.
- ADR-0025 and ADR-0031 lack the evaluation-template sections (verified licences, the OpenSysML option); ADR-0044 should record
  mathjs as adopted.

## Backlog (proposed)

| ID | Task | Owner | Owner decision? | Depends on | Effect on D1 |
| --- | --- | --- | --- | --- | --- |
| OSS-6 | Complete THIRD_PARTY_NOTICES (elkjs, Apache NOTICE files, OFL, ISC) | Platform | No | | None |
| OSS-7 | Decide ADR-0021: LGPL in the browser and SaaS, corresponding-source page, terms-of-service clause | Coordinator | **Yes** | OSS-6 | None (unblocks release) |
| OSS-8 | Record json-schema, webgl-constants and the `ai` SDK in the register | Coordinator | No | OSS-2 | None |
| OSS-9 | D1 checks use only `GeometryKernel` measurements and engineering-calc | CAD Modeler, Conceptualize | No | | Speeds up D1 |
| OSS-10 | Consolidate the unit tables onto SDK quantities | Platform, then SysML and CAD | No | SysML part after D1 | Lowers D1 binding risk |
| OSS-11 | `SketchSolver` interface; planegcs as development-only oracle | CAD Modeler | No | | None |
| OSS-12 | OpenSysML WASM as a second conformance oracle | SysML Modeler | No | | None |
| OSS-13 | `CalculationEngine` port; ADR for a SymPy/SciPy worker | Conceptualize (calculation owner to assign) | **Yes** (Python runtime, hosting cost) | OSS-4 | None (after D1) |
| OSS-14 | OpenAI terms for a hosted product (ChatGPT sign-in, images) | Coordinator | **Yes** | | None (D1 local) |
| OSS-15 | Ownership table, missing AGENTS.md files, refresh architecture.md | Coordinator | No | | None |
| OSS-16 | Provenance review of sysml-core library text | SysML Modeler | No | | None |
| OSS-17 | Retire the mock CAD tool (ADR-0027) | Platform, CAD | **Yes** | D1 accepted | None |

**Not verified:** the licences of js-quantities, UnitMath and Eclipse RMF; OpenAI's current terms; how `cad-modeler.check`
computes its values today; the OCCT version inside the WASM. Gmsh's licence was read from gmsh.info.

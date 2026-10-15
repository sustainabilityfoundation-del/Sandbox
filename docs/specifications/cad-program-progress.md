# CAD program: progress

Maintained by the CAD agent. Brief: [cad-program.md](cad-program.md) (do not edit).
Contracts and governance: [cad-program-contracts.md](cad-program-contracts.md).
Module documentation: [docs/modules/cad](../modules/cad/README.md).

Branch: `feature/cad`. Worktree: `C:\Users\kimge.000\Documents\Sandbox-cad`. Main merged in at
09aafa7 (Conceptualize).

## Phase status

| Phase | Status | Evidence |
| --- | --- | --- |
| 0 Research and architecture | **Done** (decisions Proposed) | Research: `docs/research/cad/` (competitive matrix, interoperability, open-source survey, source logs). ADRs 0020–0026 (numbers provisional). Specifications: `docs/modules/cad/` (architecture, requirements, kernel selection, native format and JSON Schema, API and `commands.json`, AI commands, interoperability matrix, testing, performance, roadmap, backlog, integration contracts, agent instructions) |
| 1 Parametric foundation | **Implemented, ready for coordinator review** | Packages `cad-core`, `cad-kernel`, `tool-cad-modeler`; 39 CAD tests (core 23 incl. contracts, kernel 10 on real OCCT, tool/AI 6), plus platform inventory and help tests; browser flows in harness and workspace all passing; `npm run check`, `build`, `build:harnesses` green |
| 1b Persistence and integration | **I1: C4 done; C5 (artifact source, read client) and C9 done; ready for coordinator review** | `services/cad` + `@ews/cad-client` (CR-CAD-2), CR-CAD-1 scheme, Project Management artifact source (CR-PM-REG-4), mock replacement ADR-0027 (Proposed, CR-CAD-4). See *Sprint 2* below |
| 2 (part) Modeling depth | **Fillet, chamfer, datum planes and sketches on faces implemented**; regeneration in the worker | See *Sprint 2* |

### Phase 1 acceptance (brief §13, §15 steps 10–12)

| Capability | Human (UI) | AI (assistant) | Tests |
| --- | --- | --- | --- |
| Create a part | New / Welcome "New part" | `run_commands` (creates document), `new_document` | assistant.test, browser flows |
| Sketch constrained 2D profiles (real solver) | Edit tab: geometry, constraints, DOF badge, sketcher | `create_sketch`, `add_*`, `apply_constraint` | core.test solver; kernel.test |
| Extrude and revolve | Extrude / Revolve dialogs with preview | `extrude_profile`, `revolve_profile` | kernel.test |
| Edit dimensions; incremental regeneration; failures reported | Parameters, dimension fields, feature edit; Diagnostics | `set_parameter`, `set_dimension`, `edit_feature`; `get_failures` | kernel.test incremental and failures |
| Save and reopen the native model | Save (.ewscad) / Open | `export {format: ewscad}`, `open_document`, `query get_document` | kernel.test round trip; assistant.test; browser |
| 3D viewport, geometry off the UI thread | three.js viewport; OCCT in a Web Worker | `get_entities` (stable face names) | browser pixel check; Diagnostics shows worker |
| Export STEP | Export STEP (AP242 + structural report) | `export {format: step}` | kernel.test (inspection + re-import); browser |

## Sprint 3 (after the I1 merge, main 34b868f)

| Item | Status | Evidence |
| --- | --- | --- |
| ADR-0027 answers | Recorded; still Proposed. CAD-side reference only, no twin delegation, phase 2 targets product elements after PM I1 | `docs/decisions/0027-…` |
| 1. Validate `product` references | **Implemented against the SDK contract.** When `PlatformServices.projects` is present, `ProjectsService.resolve` checks the ID. Unknown, unavailable or wrong-category elements are refused; a valid one is stored with its label and revision. Without the service, the ID is stored unverified and the person is told. **Not verified against a real Project Management service** (none on main yet, and the workspace does not supply `projects`) | `productRefs.test.ts` (fake service) |
| 2. C13 in the view | **Done.** Session documents belong to a project; the list and the active document follow the current project; switching back restores that project's document; a document cannot be saved into another project | `session.project.test.ts` |
| 3. Deep link | **Done.** `?tool=cad-modeler&document=<uuid>&revision=<n>` opens the stored document from the current project, and the parameters are then removed. Artifact kinds are `navigable: true` with `open: { toolId: 'cad-modeler', params: { document } }` | `deepLink.test.ts`, `artifacts.test.ts`, e2e flow |
| 4. Committed browser flow | **Done.** `tests/e2e/flows/cad-modeler-persistence.mjs`, 25 checks, folded from the scratch flow. It found a C9 regression in `run_commands` target resolution, now fixed and tested | `npm run e2e -- cad-modeler cad-modeler-persistence` |
| 5. Settings | **Done**, display-only and per user. COORDINATOR REVIEW 5685337 registers the definitions on the API host (the service validates writes) | `settings.test.ts` (tool, DB) |

Settings implemented (`@ews/cad-client` `CAD_SETTINGS`, help `cad-modeler.settings`):

| ID | Type, default | Effect |
| --- | --- | --- |
| `cad-modeler.units.measurements` | enum mm, cm, m, in; default mm | Measured volume, area, bounding box and mass in the Model and Inspect panels and in previews. Dimension entry and storage stay in mm |
| `cad-modeler.display.mesh-tolerance` | 0.01–1 mm, default 0.05 | Viewport tessellation; visible bodies are re-tessellated |
| `cad-modeler.view.orientation` | iso, front, top, right; default iso | Direction of the first fit |
| `cad-modeler.view.show-edges` | boolean, default true | New views; the view toggle overrides it |

Not exposed, by design: the solver and naming tolerances. A per-user value would make regeneration of
a stored revision depend on the viewer (C4).

## Integration milestone 1 (binding, docs/specifications/integration-milestone-1.md)

Priority per the milestone: persistence, shared references and regeneration integrity before more
features. Fillet, chamfer and sketches on faces were already implemented in sprint 2 (below). No
further modelling features are added until C4 and C5 are merged.

### C4 CAD persistence: done (I1 checkpoint)

| Requirement | Implementation | Test (real API host and PostgreSQL) |
| --- | --- | --- |
| Immutable document revisions | `cad.document_revisions`, append-only by trigger | `cad.api.test` immutability |
| If-Match concurrency | 428 without a revision, 409 when stale (`details.currentRevision`), 400 when body and header disagree | `c4.integrity.test` stale If-Match |
| Idempotency-Key recorded in the write transaction | key, request hash and response written in the commit transaction; replay after a lost response; reuse with different input → 422 | `c4.integrity.test` retry and 422; `cad.api.test` rollback forgets failures |
| Transactional outbox | events written in the save transaction; pg_notify; SSE with resume | `cad.api.test`, artifact source tests |
| `tool:cad` on the server | route guard before any work | `cad.api.test` access |
| Project scoping (C13) | every query filters by the path project; the document UUID belongs to one project; reader and archived projects refused | `c4.integrity.test` cross-project writes (404/409/403); `cad.api.test` reader refusal |
| File save/open as export/import | tool: Save file / Open file next to the project store | sprint2 browser flow |
| Deterministic regeneration, no authoritative derived geometry | revisions hold the native model only; no geometry columns | `c4.integrity.test`: identical mass properties for a stored revision after a server restart, fresh engine and cache |

### C5 cross-module resolution and registration

- **ArtifactSource (CR-PM-REG-4):** `createCadArtifactSource(pool, events)` in `@ews/cad-service`
  (see [service.md](../modules/cad/service.md)). Tested in `services/cad/test/artifacts.test.ts`.
  Host wiring is the coordinator's.
- **Read client (implemented as `createCadReadService` in `@ews/cad-client`, tested over the real
  API in `services/cad/test/read.c5.test.ts`).** Proposed SDK 1.8 TypeScript, to be added to
  `packages/platform-sdk/src/contract` (exact text):

```ts
/** CAD Modeler read access for other modules (SDK 1.8, contract C5). Read-only. */
export interface CadArtifactRefInput {
  module: string
  kind: string
  /** '<documentUuid>/<entityId>'; the document UUID twice for the whole document. */
  id: string
  /** Pinned revision; omitted = follow the latest. */
  revision?: number
}

export type CadReadResult<T> =
  | { status: 'resolved'; value: T }
  | { status: 'missing'; reason: 'not-a-cad-reference' | 'document-not-found' | 'revision-not-found' | 'entity-not-found' | 'no-geometry'; message: string }
  | { status: 'unavailable'; reason: 'forbidden' | 'unauthenticated' | 'service-unavailable' | 'kernel-unavailable'; message: string }

export interface CadEntitySummary {
  /** The reference with the revision it resolved at. */
  ref: { module: 'cad'; kind: 'cad-modeler-entity'; id: string; revision: number }
  documentId: string
  entityId: string
  /** 'document' | 'part' | 'face' | 'parameter' | a feature type ('extrude', 'fillet', …) | 'sketch-element' */
  entityType: string
  label: string
  documentTitle: string
  pinned: boolean
  latestRevision: number
  archived: boolean
  /** False for face names: only regeneration can confirm a face exists. */
  verifiedInGeometry: boolean
}

export interface CadBodyMassProperties {
  bodyId: string
  /** mm³ */
  volume: number
  /** mm² */
  surfaceArea: number
  /** mm */
  centerOfMass: [number, number, number]
  boundingBox: { min: [number, number, number]; max: [number, number, number]; size: [number, number, number] }
  /** kg; null without a material. */
  mass: number | null
  material: { name: string; density: number } | null
  /** OCCT BRepCheck validity of the solid. */
  valid: boolean
  units: { length: 'mm'; volume: 'mm³'; area: 'mm²'; mass: 'kg' }
}

export interface CadMassPropertiesResult {
  ref: CadEntitySummary['ref']
  parts: { partId: string; name: string; bodies: CadBodyMassProperties[] }[]
  regeneration: { ok: boolean; failures: { partId: string; featureId: string; status: string; code?: string; message?: string }[]; kernel: string; location: string }
  /** Recomputed from the stored native model of that revision; never stored. */
  derivedFrom: 'regeneration'
}

export interface CadService {
  summary(projectId: string, ref: CadArtifactRefInput): Promise<CadReadResult<CadEntitySummary>>
  /** Parts and whole documents only; other entities give missing / 'no-geometry'. */
  massProperties(projectId: string, ref: CadArtifactRefInput): Promise<CadReadResult<CadMassPropertiesResult>>
}

// PlatformServices gains:  cad?: CadService
```

  Host wiring for the workspace (coordinator):

  ```ts
  createCadReadService({ client: createHttpCadClient({ baseUrl: '/api/cad/v1', devUser }), regenerator: () => createWorkerKernel().createRegenerator() })
  ```

  The regenerator should be one kernel worker shared per window and created lazily. Results are
  cached per (document, revision).

### C9 headless AI boundary: done

- Every `cad-modeler.*` operation works with no view mounted. It targets the named document, else
  the open document of the captured project, else the project's only stored document; with
  several, the caller must give `documentId`. A document that is not open is loaded from the
  project's CAD service through the injected client (`PlatformServices.cad` once SDK 1.8 adds
  writes, or the tool's own client until then).
- Regeneration, dry runs and previews run in the kernel worker.
- While no view is mounted, an applied change (commands, undo, new document) is saved as a revision
  with the proposal's provenance, and the preview names the revision. A failed save reverts the
  in-memory change.
- Documents stored in another project are refused (C13).
- Tests (`packages/tool-cad-modeler/src/assistant.headless.test.ts`, real OCCT):
  - all 9 operations with no view;
  - durable revisions;
  - ambiguity and cross-project refusal;
  - parity, where 4 invalid commands are refused with the same code and message by the UI executor
    and the assistant.
- Not verified in the browser with the tab closed. The AI connection agent's "all tabs closed" test
  can now drop CAD Modeler from its known-failing list.

## Sprint 2 (2026-10-15): service, edge features, face sketches, worker regeneration

| Outcome | Human (UI) | AI (assistant) | Tests |
| --- | --- | --- | --- |
| Save, open and revisions in the project (API mode) | Save / Open dialog (revision picker), storage badge, notice when someone else saved | `save_document`, `open_document`, `list_documents` (provenance recorded) | services/cad DB tests (24), client contract (local + HTTP), assistant.test, sprint2 browser flow |
| Concurrency: no silent overwrite | Stale save refused; "Open the latest revision", "Save file" keeps the local change | same path | DB tests (428/409/400), browser flow |
| Fillet / chamfer on stable edge names, with failure reporting | Fillet / Chamfer forms: edge list with filter, picking edges in the 3D view, preview | `fillet_edges`, `chamfer_edges` (demo planner: "fillet the vertical edges … 3 mm") | features2.test on real OCCT (volumes vs analytic, name stability, `reference-lost`, `invalid-value`) |
| Datum planes; sketches on datum planes and planar faces | Datum plane form; Sketch "Plane" offers standard, datum and planar faces; the sketch follows the face | `create_datum_plane`, `create_sketch` with `datum` / `face` | features2.test (face follows, side-face frame, offsets, `face-not-planar`, lost face) |
| Regeneration in the kernel worker | Diagnostics: "Regeneration runs in the kernel worker" | n/a | regenerator.test (worker-boundary emulation), browser flow |
| Project Management readiness | n/a | n/a | Part UUIDs (v5) in summaries and events; migration 0002 on an 0001 fixture; reader/archived-project refusal; artifact source contract tests (6) |

Browser evidence (Playwright and Chrome, scratchpad `pw/cad/sprint2-flow.mjs`, workspace 5199 → API 8799): 20 of 20 checks pass. The flow covers:

- save as revision 1 and listing by the service;
- fillet on the 4 top edges by stable name, removing 202.9 mm³ as the analytic (1 − π/4)·r²·L predicts;
- picking an edge in the 3D view;
- a boss on the top face (+251.3 mm³ = π·4²·5);
- a datum plane;
- Diagnostics reporting the worker;
- another user's revision 3 shown by SSE, and the stale save refused;
- Save file, then opening the latest revision;
- assistant fillet and save with provenance (`sourceKind: assistant`, `proposalId`);
- reopening revision 1 regenerates 30869 mm³.

**CAD settings to contribute to SDK 1.6 `SettingsContribution`** (sprint 2 proposal, superseded: what was
built is in *Sprint 3*. Model tolerances were left out on purpose):

| Setting | Values | Default | Where it applies |
| --- | --- | --- | --- |
| `cad.units.length` | mm, cm, m, in | mm | Display and entry. The native format stays in mm |
| `cad.units.angle` | deg, rad | deg | Display and entry |
| `cad.units.massDensity` | kg/m³, g/cm³ | kg/m³ | Material and mass properties |
| `cad.tolerance.solver` | 1e-12 … 1e-6 (residual) | 1e-9 | Sketch solver convergence (`solveSketch`) |
| `cad.tolerance.naming` | 1e-6 … 1e-2 mm | 1e-4 mm | Naming probes (`PROBE_TOLERANCE`). Changing it can rename faces, so it should stay an administrator setting with a warning, or not be exposed at all |
| `cad.mesh.deflection` | 0.01 … 1 mm linear, 0.1 … 1 rad angular | 0.05 mm / 0.3 rad | Viewport tessellation (performance against fidelity) |
| `cad.view.projection` | perspective, orthographic | perspective (35°) | New views; orthographic is not implemented yet |
| `cad.view.defaultOrientation` | fit, iso, front, top, right | iso | New views |
| `cad.view.showEdges` | boolean | true | New views |
| `cad.regeneration.location` | worker, main thread | worker | Diagnostics and fallback |

## Capability status (implemented / partial / experimental / planned)

Detailed table with IDs: [requirements.md](../modules/cad/requirements.md).

- **Implemented and tested:**
  - native open format with JSON Schema;
  - parameters and expressions;
  - sketch entities: point, line, circle, arc, rectangle;
  - 19 constraint types, with DOF, redundancy, conflict and driven dimensions;
  - profile extraction with holes;
  - extrude (normal, reverse, symmetric; new, join, cut) and revolve (axis line or sketch axis, partial angle);
  - fillet and chamfer (equal distance) on stable edge names; datum planes; sketches on datum planes and planar faces (format 1.1);
  - server document store with immutable revisions, ETag/If-Match, idempotency, provenance, SSE, OpenAPI 3.1 (`services/cad`), save and open from the project in the tool;
  - regeneration (solver and geometry) in the kernel worker;
  - Project Management artifact source (`createCadArtifactSource`; wiring into the host is pending);
  - suppression and deletion with dependency checks;
  - incremental regeneration with per-feature failures;
  - stable face and edge names;
  - mass properties and BRepCheck validity;
  - undo and redo with versioning and an operation log;
  - dry-run preview;
  - STEP AP242 export;
  - format detection;
  - 3D viewport (orbit, pan, zoom, views, picking);
  - sketcher;
  - help (20 topics, 1 tutorial);
  - assistant operations (7) with labelled demo planning;
  - capability inventory entries (17).
- **Partial:**
  - multi-body parts: bodies and targets exist, but there is no body-boolean command;
  - engineering semantics and references: stored and editable; reported to Project Management as relations through the artifact source (not yet wired); product-element IDs are not validated;
  - multiple documents: kept in the session, but there is no switcher UI;
  - STEP colour: written at solid level, not separately verified;
  - format detection: signatures for some proprietary formats rely on the file extension (low confidence).
- **Experimental:** none labelled experimental.
- **Planned:** everything in Phases 2–6 ([roadmap.md](../modules/cad/roadmap.md)), including variable fillets, unequal chamfers, imports, assemblies, configurations and drawings.

## Decisions (ADRs proposed)

Numbers are provisional; the coordinator renumbers at integration (they clash with the Design
Reasoning proposals).

| ADR | Decision |
| --- | --- |
| 0020 | Packages `cad-core` / `cad-kernel` / `tool-cad-modeler`, monorepo, separate tool `cad-modeler`, `services/cad` deferred |
| 0021 | OCCT via replicad-opencascadejs 1.1.0 (LGPL WASM, separately loaded) + replicad 1.1.0 (MIT) in a Web Worker, behind `GeometryKernel` |
| 0022 | Open JSON native format `ews-cad` 1.0.0 with JSON Schema; geometry is derived |
| 0023 | One typed command layer, transactions, version checks, snapshot undo, dry runs; assistant via service proposals |
| 0024 | Generative topological naming with geometric probes; edges by adjacent faces |
| 0025 | In-house numerical sketch solver (TypeScript) with DOF and conflict analysis; planegcs as later option |
| 0026 | Cross-module references and the ArtifactRef scheme for CAD Modeler entities (needs approval) |

## Contract change requests

- **CR-CAD-1 (approved with a change):** `{ module: 'cad', kind: 'cad-modeler-entity', id: '<documentUuid>/<entityId>', revision }`, no prefix. Implemented (`entityRef`, `resolveEntity`). ADR-0026.
- **CR-CAD-2 (approved):** `services/cad` and `@ews/cad-client` implemented. The coordinator adds `PlatformServices.cad` (SDK 1.6); the tool then switches from its own client.
- **CR-CAD-3:** deferred (not implemented).
- **CR-CAD-4:** ADR-0027 written as **Proposed**: phased, non-destructive replacement of the mock tool. The mock tool is unchanged.
- **CR-PM-REG-4:** `createCadArtifactSource(pool, events)` implemented and tested in `@ews/cad-service`. Host wiring is pending.
- **CR-PM-CAD-1:** ADR-0026 updated: new projects reference product elements (`module: 'product'`), and PRJ-ACT100 keeps twin references. `product` is added to the format 1.1 reference modules and to the Inspect panel.

## Integration needs for the coordinator

**Approved and committed** on `feature/cad`, each change in its own `COORDINATOR REVIEW:` commit:

- tool registration and the workspace dependency;
- capability entries and the `cad-modeler` module;
- the platform, help and design-system test lists, with the entitlement exception for `cad-modeler` (`tool:cad`);
- the root `cad:` scripts;
- the `docs/dependencies.md` rows.

**Pending, coordinator-owned (sprint 2 additions first):**

- Wire `createCadArtifactSource(pool, cadEvents)` into the Project Management plugin in `services/api`. `cadPlugin` exposes its hub through `onReady`.
- Add `services/cad` and `packages/cad-client` to `boundaries.test.ts`. Interim rules are in `cad-core/src/contracts.test.ts`: `services/cad` → cad-core and platform-sdk; `cad-client` → cad-core.
- `PlatformServices.cad` (SDK 1.6) and the settings contribution listed above.
- Index entries for ADR-0026 and ADR-0027 in `docs/decisions/README.md`.
- A workspace deep link into the CAD Modeler (open document or part). Artifact kinds stay `navigable: false` until it exists.


- Boundary rules for `packages/cad-*` in `boundaries.test.ts` (an interim local test is in `cad-core`).
- The root AGENTS.md rule "do not claim a CAD kernel".
- `apps/workspace/src/platform/capabilities.ts` (About page) and `docs/roadmap.md`.
- ADR numbering and the index.
- Whether to add `cad-modeler` to `DEFAULT_OPEN_TOOLS`.
- LGPL notices in production distributions: the workspace build emits `replicad_single.wasm` (23 MB, 7.3 MB gzip), so the licence text must ship with it.
- The workspace Vite config uses the default worker format. The worker builds as a single chunk and works in dev and build today. If code-splitting inside the worker is ever needed, set `worker.format = 'es'`, as the CAD harness already does.

## Licensing review

All CAD dependencies fall within contracts §3. **Nothing needs approval.** The coordinator accepted this on 15 October 2026.

| Package | Licence | Notes |
| --- | --- | --- |
| replicad 1.1.0 | MIT | |
| replicad-opencascadejs 1.1.0 | LGPL-2.1-only | OCCT; separate WASM file loaded at run time and replaceable by the user |
| Transitive packages | ISC, MIT | |
| three 0.180.0 | MIT | |

- **Avoided:** SolveSpace and libslvs (GPL-3). planegcs (LGPL) was evaluated only and is not shipped.
- **Would need approval later** (not used):
  - Parasolid, ACIS, JT or HOOPS translators;
  - Open Design Alliance (DWG);
  - libdxfrw and LibreDWG (GPL);
  - the Onshape and Autodesk translation services (paid, and user data goes to a third party).
- **Pin:** replicad releases 0.5.0–0.15.1 were AGPL, so the dependency stays pinned exactly at 1.1.0.

## Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-CAD-01 | The OCCT version inside the WASM build is not stated; the survey infers 7.6.x (2023), while upstream is 8.0.1 | Owning a custom WASM build pipeline (backlog #7, about 3–6 weeks) |
| R-CAD-02 | OCCT boolean and fillet robustness on hard inputs | Per-feature failures, BRepCheck after regeneration, no `sameFace` optimisation, regression models |
| R-CAD-03 | Probe-based naming can be ambiguous with coincident geometry from different features | Aliases and flags already in place; kernel history signal and a "needs repair" state in Phase 2 |
| R-CAD-04 | In file mode (demo), documents are lost if the window closes without saving | API mode stores revisions in the project; file mode keeps the unsaved-change guard |
| R-CAD-05 | Fillets on edges whose names changed upstream fail with `reference-lost` (by design) | The failure lists the available edges; edit the feature to choose again |
| R-CAD-09 | `req:test:db` sprint002 (Requirements) flaked once under load and passed in isolation; it is not a CAD test | Reported to the coordinator |
| R-CAD-06 | 23 MB WASM download and the wasm32 4 GB memory limit | Cached once; native desktop kernel later |
| R-CAD-07 | Most competitive research rests on search summaries (12 sources read in full, 99 summaries) | Treat vendor specifics as provisional; verify before relying on them |
| R-CAD-08 | Format-detection signatures for several proprietary formats are low confidence | Tests with public sample files (backlog) |

## Backlog (prioritized)

The top items are below; the full list is in [backlog.md](../modules/cad/backlog.md).

1. Switch to `PlatformServices.cad` when SDK 1.6 lands; settings contribution.
2. Show CAD links in other modules, and validate product-element IDs (needs a Project Management client).
3. ADR-0027 phase 2, after approval: convert mock representations into parametric parts.
4. Drag-drawing in the sketcher, with constraint inference.
5. Variable-radius fillets, unequal chamfers, shell and draft.
6. Workspace deep links into documents and parts.
7. Custom OCCT 8 WASM build with the XCAF reader and IGES.
8. STEP import as a base body.

## Handoff log

| Date | Entry |
| --- | --- |
| 2026-10-14 | Phase 0 started. Kernel probe in Node: OCCT WASM loads in about 300 ms; extrude, revolve, cut, volume, mesh and STEP AP242 export and re-import all verified numerically. Delegated three research tasks; their reports are in `docs/research/cad/`. |
| 2026-10-14 | Commit 5296d33: ADRs, research and `cad-core`. Commit def9c05: `cad-kernel`, with 9 real-kernel tests. Found and fixed the `sameFace` boolean-void issue. |
| 2026-10-15 | Tool package (ab01e3d), plus `COORDINATOR REVIEW:` commits 95ddf6d, a415069, 1a47a0e and 824e40e. Merged main (69d02bd). |
| 2026-10-15 | Browser flows in the harness and the workspace. Fixed face picking (mesh groups use OCCT hash codes), the React key spread, invalid nesting, and the saved-state badge (dad539b). |
| 2026-10-15 | Contracts: JSON Schema checked with Ajv, a fresh `commands.json`, and a boundary test. Benchmarks; `validateDocument` hardened (c3e0296). Module documentation and progress written. |
| 2026-10-15 | Final validation on the branch tip. `npm run check`: 483 passed, 1 skipped (the CAD suite alone: 39). `npm run build` and `npm run build:harnesses` green. Browser flows (Playwright, Chrome, scratchpad `pw/cad/`), all passing: `harness-flow` (23 checks: human workflow, save, export, reopen, responsive, dark theme); `workspace-flow` (AI workflow through the demo assistant and proposal cards, a human edit, version handling, operation log); `regression-flow` (default tabs, mock CAD selection, SysML, the mock CAD dimension proposal on the twin, Help listing). The coordinator's older scratch scripts (`platform-flow`, `assistant-flow`) use selectors and paths from before main's current UI, so they were not usable as evidence. One workspace dev server briefly bound port 5175 because npm did not pass the port flag; it was stopped. All servers are stopped. |
| 2026-10-15 | Sprint 2. Merged main (eceba15), then services/cad and cad-client; fillet and chamfer; datum planes and face sketches (format 1.1); worker regeneration (af43158 and earlier). The browser flow found unnamed cap faces on the example plate, because a centred hole removed the probe point; cap probes now rank fallback points (regression test). |
| 2026-10-15 | Project Management readiness (ae98423): part UUIDs, descriptive events (migration 0002), refusal for readers. Docs and ADR-0027 (cf55b88). Merged main at SDK 1.7.0 (69355eb), then CR-PM-REG-4 (artifact source) and CR-PM-CAD-1. |
| 2026-10-15 | Integration milestone 1. Merged main (ccb5e61; conflicts in the services/api registration, root scripts and boundaries, both sides kept). C4/C13 tests (f454872), C5 read client (a271119), C9 headless operations (c8dca69). The sprint2 browser flow passed 20/20 on the merged code after an API restart; one run timed out on Vite's cold compile, and the rerun passed. |
| 2026-10-15 | Sprint 3. ADR-0027 answers (8ef547d). C13 view (cc2d107), deep link (d35b8bc), both merged by the coordinator in 34b868f. Merged main (129db68). Settings (64f03b1 + COORDINATOR REVIEW 5685337), product-reference validation (49e292f), C9 target fix (7d94782), e2e flow (d46aa4b). |

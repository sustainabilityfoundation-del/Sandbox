# Demonstration D1: AI-driven engineering of a small part, from concept to editable CAD and STEP

Owner: coordinator. Status: **primary delivery objective** (15 October 2026). Shared priority for every agent:
**deliver the smallest credible end-to-end AI engineering workflow before broadening individual modules.**
D1 is the narrow path through [integration milestone 1](integration-milestone-1.md); milestone work that D1 does
not need waits. Standards-aware assurance is the deferred epic
[E-ASSURE](../roadmap.md#deferred-epic-e-assure-standards-aware-development-assurance-and-safety-engineering) and is
not a prerequisite. Boundaries: [ADR-0070](../decisions/0070-development-assurance-boundaries.md).

## 1. The engineering problem

A **drill bit holder**: a small block that holds several 1/4-inch hex-shank bits and mounts to a cordless drill's
accessory interface (the existing AI example, "for a Milwaukee drill"; the brand appears only as a compatibility
description, interface dimensions are **assumptions** unless a cited public source is given). It exercises
meaningful constraints (bit count, hex size with clearance, wall thickness between pockets, mounting-hole spacing,
overall size and mass) and several parametric features (base extrude, hex pocket cut, linear pattern of pockets,
mounting holes), without simulation.

All example-specific values, wording and scripts live in **project data or isolated fixtures** (a template or tutorial
fixture, test fixtures, help tutorial). Generic product code (prompts, operations, checks) never mentions drills,
bits or these numbers.

## 2. Workflow (through the product interface, with a real model)

| # | Step | Operations used (module) | Persisted in |
| --- | --- | --- | --- |
| 1 | Create a clean project (no artifacts) | `projects.create` (Project Management) | projects, memberships |
| 2 | Conceptualize from a plain-language need: function, constraints, interfaces, assumptions, open questions; ask only questions that change the design; expose assumptions | `conceptualize.create`, `create_function`, `create_constraint`, `record_assumption`, question statements | Conceptualize |
| 3 | Requirements: a few measurable requirements linked to the concept; origin shown as user constraint, AI-proposed choice or derived | `requirements.create` (new), constraints `formalizes` requirements | Requirements, Conceptualize |
| 4 | Architecture: proportionate functional and physical decomposition; allocate requirements; interfaces | product elements (`projects.*`), SysML Modeler `propose_commands`/`propose_text`, `link_requirement`, `represents` product element; `requirements.allocate` (new) | Project Management, SysML, Requirements |
| 5 | Design reasoning: selected approach, alternatives, key dimensional decisions linked to objects and assumptions | `develop_alternatives`, `compare`, `propose_decision` | Conceptualize |
| 6 | Generate CAD with real modelling commands; parameters **bound** to the constraints they implement | `cad-modeler.new_document`, `run_commands` (incl. new regular polygon and linear pattern), parameter bindings (new) | CAD service |
| 7 | Check against requirements: measured or computed values vs constraint bounds; assumptions disclosed | `cad-modeler.check` (new) → `conceptualize.record_evidence` (new) | CAD, Conceptualize |
| 8 | Change in plain language: affected requirements, constraints, parameters and geometry identified; regenerate; rerun affected checks; history kept; review flags | `requirements.update`, `conceptualize.revise_constraint` (new), `cad-modeler.check_bindings` (new), `run_commands`, `check`, decision review flags | all |
| 9 | Save, reopen (fresh browser, restarted services), export STEP, read it back | `cad-modeler.export` (headless STEP with read-back report); export stored as a project document | CAD, Project Management |

Every change is a previewed proposal the person applies (autonomy policy unchanged). AI proposals, results and
approved records stay distinguishable, with provenance. Checks report what was measured or computed, with the CAD
document revision and kernel version (ADR-0070 item 3); they never claim structural adequacy, safety or compliance.
STEP is described as geometry only; the native `ews-cad` model keeps the feature history.

## 3. Smallest reusable increments (owners)

| ID | Increment | Owner | Notes |
| --- | --- | --- | --- |
| D1-PM | `projects.create`/`open`, product-element operations for the assistant; Project Home, project switcher and reopen in the workspace (WS-1, C12 defaults); project documents for exported files | Project Management | critical path |
| D1-REQ | `requirements.create` (headless, origin: `stakeholder` / `ai-proposed` / `derived`, with provenance) and `requirements.allocate` (to product elements and SysML elements) | Requirements | |
| D1-CON | `revise_constraint`, `record_evidence` (source `ArtifactRef` with revision, tool and version, results with C11 qualifications), review-flag read; CR-PM-CON-1 and C3 resolution of `cad-modeler-entity`, `sysml-model-element`, `product-element` | Conceptualize | |
| D1-CAD | Regular-polygon sketch command; linear pattern feature with count and spacing expressions; parameter **bindings** (`{ ref: ArtifactRef with revision, quantity }`) stored in the native model; `check` (dimensions, spacing, wall thickness, bounding size, volume and mass, solid validity) against bound constraint bounds read through `PlatformServices.concepts`; `check_bindings` (bindings pinned to superseded revisions); headless STEP export with read-back report | CAD | |
| D1-SYS | Confirm the architecture step works headless with product-element `represents` and requirement links; fix only what blocks D1 | SysML | |
| D1-AI | Generic engineering-workflow instructions for the model (material questions only, explicit assumptions, origin labels, propose before change); enough tool-call budget for multi-step work; persisted declarative proposals (C9); platform-module registry; move the drill example out of `DemoAssistantService` into an isolated fixture or tutorial; committed `tests/e2e/flows/demo-d1.mjs` | AI connection | |
| D1-SDK | SDK 1.8: `PlatformServices.cad`, `PlatformServices.sysml`, `ConceptsService` constraint reads (CR-S3 subset), declarative proposals (AI part) | Coordinator | |
| D1-RUN | Reproducible run instructions, the e2e flow, evidence capture, report | Coordinator | |

Deferred until D1 is accepted: CAD feature parity (assemblies, drawings, more features), more SysML diagram types,
the design reasoning service (R4+), standards work, certification dashboards, unrelated UI.

## 4. Acceptance

- The workflow runs through the product interface with **genuine AI integration**: the model (connected by the owner
  in Settings → AI and reasoning) invokes real domain operations. A scripted or fake-provider run proves the
  plumbing and is committed as a regression test, but **does not count** as acceptance.
- Artifacts are created through the actual services and APIs; concept, requirements, architecture, decisions and CAD
  are connected by typed, revision-pinned references.
- A plain-language change propagates through requirements, constraints, parameters and geometry; affected checks are
  rerun; superseded evidence is stale; review flags are raised where decisions depend on the change.
- The project survives save, service restart and reopen in a fresh browser session.
- CAD stays editable in the native representation; STEP export is read back and matches the expected geometry
  (solid count, bounding box, volume within tolerance).
- Checks report actual results and disclose open assumptions.
- The example is isolated from reusable product functionality.
- Another developer reproduces it from §5.
- Every mocked or adapter-backed dependency is reported.

## 5. How to run

**A. Plumbing test (no model, no account; a regression test, not acceptance).**

1. `npm install`, then `npm run ai:dev:fake`. This is `npm run dev` with the development-only fake provider, which
   replays the recorded tool-call script `tests/e2e/fixtures/fake-scripts/d1-plumbing.json`. Other ports: set
   `API_PORT` and `EMBEDDED_PG_PORT`; extra arguments go to the workspace dev server (for example `-- --port 5202`).
2. In a second terminal: `npm run e2e -- demo-d1` (`E2E_BASE` and `E2E_API` for other ports). The flow connects
   development user eli to the fake provider, then sends each step as a message and applies every preview through
   the panel:
   - a new project `D1-xxxxx` through `projects.create` and `projects.open`;
   - a Concept, a function, two constraints and an assumption;
   - two requirements (origin `stakeholder` and `ai-proposed`);
   - a product element and a SysML project, then `requirements.allocate` and `sysml-modeler.link_product_element`;
   - alternatives;
   - CAD `run_commands`: a block with a hexagonal pocket, a linear pattern of six, and `af` bound to the pocket-width
     constraint. The CAD view stays closed; the CAD operations run headless;
   - `cad-modeler.check` and `conceptualize.record_evidence`;
   - the change: `revise_constraint`, then `check_bindings` finds the outdated binding, `run_commands` updates and
     re-binds the parameter, and the check runs again;
   - STEP export with read-back, then a STEP download;
   - the transcript export, and a read-back in a fresh browser session and from the service APIs.
3. Steps the script cannot exercise are printed as PENDING with their change requests. Screenshots, the transcript
   and the replies are written to `tests/e2e/.output/demo-d1/`. In the dev server, the first CAD use optimises the
   kernel dependencies and reloads the page once. If the reply that was running is shown as interrupted, run the flow
   again.

**B. Live run with a real model (acceptance).** Follow
[d1-live-run.md](../modules/ai-interface/d1-live-run.md):

1. `npm run dev`, Settings → Platform: API mode, development user eli.
2. The owner connects their own OpenAI account in Settings → AI and reasoning (API key, or Sign in with ChatGPT for
   a local installation). The credential stays encrypted on the server.
3. Send the step messages in the panel, review each preview and apply.
4. Capture the evidence:
   - **Export transcript** in the panel: every operation with its arguments, the proposals and the model;
   - the audit, at `GET /api/assistant/v1/audit`;
   - the committed artifacts, through the module APIs;
   - the STEP file.
5. For every step, report whether it ran with the live provider against the real service.

The live run has not been done yet: it needs the owner's account.

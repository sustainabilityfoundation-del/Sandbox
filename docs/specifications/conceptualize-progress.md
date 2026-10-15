# Conceptualize: progress

Maintained by the Conceptualize agent. Brief: [conceptualize.md](conceptualize.md) (do not edit).
Contracts: [conceptualize-contracts.md](conceptualize-contracts.md).

Branch: `feature/conceptualize`. Worktree: `C:\Users\kimge.000\Documents\Sandbox-conceptualize`.
Base: `main` 6b7ea34.

## Implementation plan and milestones

Same architecture and conventions as Requirements (ADR-0011, ADR-0015): `services/conceptualize`
(schema `conceptualize`, migrations, seed, Fastify plugin, TypeBox schemas → Ajv + OpenAPI 3.1,
outbox + SSE, idempotency, ETags), `packages/conceptualize-client` (transport, full module client,
HTTP and demo adapters of the SDK `ConceptsService`, contract test suite, natural-language and unit
helpers), `packages/tool-conceptualize` (UI, assistant contribution with `demo` planner, help,
harness). No new third-party dependencies: TypeBox, Fastify, pg, Ajv are already used by Requirements;
the graph view is plain SVG.

| # | Milestone | Content | Status |
| --- | --- | --- | --- |
| M0 | Plan | This plan, conflicts, ownership check | done |
| M1 | Domain and persistence | Schema: concepts, immutable revisions, typed statements (intent, assumptions, questions, with basis and provenance), relationships (9 types, validated, no containment cycles), decompositions, alternative sets, decisions, trade studies (criteria, options, append-only scores), evidence, implementations + artifact refs + realization requests, concept↔artifact links (requirements), maturity events, audit, outbox, idempotency. Unit-aware quantities with dimension checks | done (f5fd9eb) |
| M2 | HTTP API | CRUD, revisions/compare/history, maturity and verification status, branch, assessment, graph, relationships, decompositions, alternatives, decisions (approval gate), trade studies with computed results, evidence, implementations, links, artifact→concepts, explorations (atomic AI/UI bulk create + compensating undo), permissions, SSE, OpenAPI + docs; registered in services/api | done (f5fd9eb) |
| M3 | Client | HTTP adapter (SDK), module client, demo adapter (SDK read contract), contract tests on both | done (c40a038) |
| M4 | Tool UI | Concept Explorer (search, filters, tree and graph), Concept Workspace (intent, structure, history, decisions), Alternative Explorer (side-by-side trade study, branching, decisions), AI collaboration (hypotheses to confirm, assumptions, questions, next steps, provenance), Engineering integration (implementations, requirement traceability, stale/broken links, change notifications, realization requests); harness; workspace registration | done (1a419b5, c193f8f) |
| M5 | AI | `conceptualize.*` actions (contracts say `concepts.*`, see change request 1) returning service proposals (apply via API with idempotency key and provenance, undo), scripted `demo` planner for the actuator prompt and similar, preliminary calculations computed (not invented) and labelled estimates | done (1a419b5) |
| M6 | Integration | Draft requirements proposed through `services.requirements`; SysML/CAD links through twin IDs and the model index; CAD generation as recorded realization request; analysis via labelled test adapter | done (2bb1937): draft requirements via services.requirements, SysML/CAD links by twin ID, CAD realization requests, analysis test adapter, live requirement change detection |
| M7 | Documentation and tests | Help manifest and pages, capability inventory entries, docs/modules/conceptualize.md, real-PostgreSQL tests, browser flows | done (f0e61dc, 2bb1937) |
| M8 | Remaining functionality | See backlog | in progress: evidence, verification, decompositions, supersede, criteria, realization status, exploration undo done (2bb1937); rest in backlog |

Vertical slice = M1–M5 plus the help/test parts of M7, working end to end in the workspace on the
real API and PostgreSQL.

## Sprint 2: design knowledge (Design Reasoning P1, refined by R1)

Source: `docs/modules/design-reasoning/contract-change-requests.md` (CR-C1…C6, C9, C10 and the R1
refinements R1-1…R1-10), `packages/design-reasoning-core/src/contract/conceptualize.ts`. Merged main
ec16cf2 (R1) into the branch before aligning. C7, C8 and C11–C13 are next sprint.

| CR | Content | Status |
| --- | --- | --- |
| C10 / R1-1 | `POST /batch`: `items: [{ op, as?, body }]`, ops = R1 operationIds (createFunction, createConcept, createConstraint, reviseConstraint, createAssumption, createEvidence, createLink, createAlternativeSet, createTradeStudy, putScores, proposeDecision, recordDecision, flagDecisionForReview, createImplementation, createCalculationModel) plus extensions (updateConcept, updateFunction, createRelationship, createConceptLink, addAlternative); placeholders substituted anywhere; one transaction, one provenance, Idempotency-Key required; errors name `Item i (op)` and the field; per-item permissions | done |
| C1 | Function (FN-…), immutable revisions, `performanceObjectives` (minimize/maximize/target, basis), flows, `decomposes-into` (acyclic, shared sub-functions), named function decompositions, `performs` (Concept → Function), Concept `performs` in create; explicit, previewed **convert-to-function** (no automatic migration) | done |
| C3 | Assumption (ASM-…), revisions, scope, dependsOn, append-only validation history; **automatic additive migration** from assumption statements of the current revision (0002); `assumptions-from-statements` for new statements; R1-2 validation rules | done |
| C2 / R1-4 | DesignConstraint (CST-…): kinds, bound, strength, source requirement (pinned, exactly one `formalizes`, created automatically) / derived / stated (with basis); `constrains` from subjects; user-invoked **promote-statement**; reviseConstraint (content + status); relaxing/retiring a hard formalizing constraint needs a reviewer; `suspect` derived by clients | done |
| C4 | Link-type registry (`link_types`, built-ins per R1 with `propagation` and `artifactModules`; administrators register namespaced types), `/design-links` with endpoint, duplicate, cycle, assistant-flag and basis rules | done (path deviation below) |
| C5 / R1-3, R1-7 | Decisions: support, assumption and constraint pins (`{ id, revision }` or DesignRef; revision must exist), affected, invalidation conditions, review flags `{ at, by, reason, impactReportId?, cleared? }`, **derived validity**, superseding by a recorded decision invalidates, rationale endpoint (stale pins) | done |
| C6 / R1-6 | Evidence: subjects, applicability (text), manifest, source, assumptionIds; append-only reviews (reviewer, never the author or the assistant), derived `validationStatus`; basis `assessment` and `calculated` (calculated needs a manifest, refused from the assistant until C8) enforced on the server | done (conflict 1 below) |
| C9 / R1-8, R1-10 | `POST /graph/traverse` (follow, depth, nodeTypes, where, limit/cursor, **asOf implemented**), `GET /graph/neighbourhood`, `POST /graph/paths`, `GET /search` across types; derived edges with R1 names and `derived: true`; `builtFrom.revision` = latest audit sequence | done |

UI: Explorer record types (Concepts, Functions, Constraints, Assumptions) with status and basis labels;
inspector for each record (objectives, flows, links, decompose, status, source and pinned requirement,
validation history); Concept *Design knowledge* tab (previewed conversion, promote, assumptions from
statements, typed links with search); Intent shows the Assumption/Constraint key next to statements;
decision rationale with stale pins, flag for review, Still valid / Invalidate; evidence reviews.
Assistant (service proposals): `create_function` (one batch), `convert_to_function`,
`create_constraint`, `promote_constraint`, `record_assumption`, `create_link`; reads `rationale`,
`traverse`, `search_design`. Help topic `conceptualize.knowledge`; capability entries appended.

### Deviations from the contract (recorded; coordinator informed)

1. **Design links at `/design-links`**, not `/links` (integration.md §3): `/links` already serves
   Concept→artifact links (v1). Moving them is a breaking v1 change; proposal: keep `/design-links`, or
   rename the v1 paths in a coordinated major change.
2. **operationId collisions with v1**: R1 names the design-link write `createLink`, but v1 uses
   `createLink` for Concept→artifact links; the decision write is `createDecision` (v1, R1:
   `proposeDecision`) and scores `putTradeScores` (R1: `putScores`). The **batch accepts the R1 names**
   (`createLink` = design link; v1 Concept links are `createConceptLink` in a batch). OpenAPI keeps the v1
   operationIds; operations added this sprint use the R1 names (`setAssumptionValidation`,
   `flagDecisionForReview`, `reviseConstraint`). Single-endpoint design-link create stays
   `createDesignLink`. Decision needed: rename the v1 operationIds (breaking for generated clients) or
   keep the mapping.
3. **Not implemented until later CRs** (answer HTTP 501 with code `invalid`, `details.notImplemented`;
   the SDK error codes have no `not-implemented`): `createCalculationModel` and evidence `calculation`
   (C8), alternative-set `functionId` (C7), implementation `realizedConceptRevision` (C11).
4. **Alternative sets need a parent Concept** in v1 (`parentConceptId` required; R1 makes it optional).
5. **Stricter than the R1 test adapter** (kept deliberately): the assistant may only set assumptions
   *under-review* (adapter: refuses only *validated*); unknown `$placeholders` are errors (adapter leaves
   them as text); function and constraint creation defaults (`active`, `proposed`) as before for
   constraints. Assumption validation changes do not create a new content revision (separate history).
6. Calculated basis cannot be written by the assistant until C8 (manifest verification).

### Conflicts with sprint-1 behaviour (need a coordinator decision; not changed)

1. **R1-6 "basis `evidence` is never written directly"** vs v1: Conceptualize records verified
   evidence as `basis: 'evidence'` with an artifact reference, by a person, and verification status
   needs it (contracts, sprint 1). Options: (a) keep for person-recorded evidence with a twin/analysis
   artifact, (b) derive `evidence` from an accepted review only. Today (a); the assistant cannot write it.
2. **R1-3 "reviewers do not author"** vs v1 `createDecision` with `record: true`, which a reviewer may
   call (create and record in one step). The batch follows R1 (proposeDecision needs author,
   recordDecision needs decide); the single endpoint keeps v1 behaviour until you decide.

### Coordinator decisions (15 October 2026, after cf33f80)

Deviations 1–5 accepted.

- **(a) Agreed reading of R1-6** (for the notes of `docs/modules/design-reasoning/contract-change-requests.md`;
  the coordinator reconciles the document): a person (editor or above) may record evidence with basis
  `evidence` directly when it carries an artifact reference, because verification depends on it. The
  assistant may never write `evidence`, `user-assertion` or `decision`. Evidence may also become
  `evidence` when an accepted review exists. Implemented as before (v1).
- **(b) R1-3 on the single endpoint**: `createDecision` needs the author permission; reviewers get 403
  ("Reviewers do not author decisions: propose as an editor, then record."); `record: true` is for
  administrators only. The seed now proposes as eli and records as rui; tests and the browser flow use
  ada for one-step recording; the dialog shows *Record decision* to administrators only. OpenAPI
  description and help (`conceptualize.decision`) updated.
- **(c) Keep v1 operationIds**; OpenAPI operations carry `x-r1-operation` with the R1 name (table
  `R1_OPERATION` in `http/openapi.ts`), the v1 Concept-link `createLink` carries `x-r1-note`. Mapping in the
  API help page.

### Settings Conceptualize would contribute to a future SDK `SettingsContribution`

| Setting | Scope | Today |
| --- | --- | --- |
| Data mode (API / demo) | user | platform service settings |
| Default basis for new statements (user statement / assumption) | user | fixed: user statement |
| Explorer default record type and view (tree / graph) | user | view state |
| Show AI hypotheses banner / highlight | user | always on |
| Default trade-study method and qualitative scale labels | project | fixed (weighted sum, 1–5) |
| Approval gates: maturities that need a reviewer | project (admin) | fixed in `rules.ts` |
| Assistant may assert link types (per type) | project (admin) | `link_types.assistant_assertable` |
| Registered link types | project (admin) | `POST /link-types` |
| Seed example data on start | deployment | `SEED_ON_START` |
| Stale-link check interval / requirement change notifications | user | on open |

### Change requests still open (SDK)

CR-S1 (`DesignRef`, `ArtifactModule` + `conceptualize`/`reasoning`), CR-S3 (`ConceptsService.getFunction`,
`traverse`, `decisionRationale`), CR-S4 (`ServiceProposalItem.basis` + `assessment`/`calculated`):
the client defines `DesignRef` locally until S1 ships; the assistant maps assessment/calculated to the
nearest existing preview basis until S4.

## Domain model (summary; full description in docs/modules/conceptualize.md)

- **Concept**: UUID + key `CON-001`; record (maturity, verification status, current revision) and
  immutable **revisions** (name, summary, description, abstraction, classifications, purpose,
  attributes as quantities, statements). Provenance on every revision: actor, source kind
  (`user`, `assistant` with conversation/proposal/message IDs, `import`, `system`), reason.
- **Statements** (hybrid semantic representation): kind (`function`, `behavior`, `principle`,
  `effect`, `input`, `output`, `constraint`, `interface`, `mechanism`, `problem`, `capability`,
  `performance`, `assumption`, `uncertainty`, `question`, `rationale`, `note`), text, optional quantity
  `{value, unit, min, max}`, and **basis**: `user-assertion`, `ai-hypothesis`, `assumption`,
  `estimate`, `evidence` (needs an evidence record), `decision` (needs a recorded decision). Stable
  statement IDs across revisions. The server refuses assistant-sourced writes that set
  `user-assertion`, `evidence` or `decision`, and refuses promoting an AI hypothesis to evidence or
  decision without the record. Confirming a hypothesis is an explicit user action.
- **Maturity** (idea … archived) separate from **implementation status** (derived from
  implementations) and **verification status** (recorded, needs verified evidence). No mandatory
  sequence; `selected` and later, and superseding such a Concept, need reviewer or administrator.
- **Relationships**: contains (inverse part-of), depends-on, interfaces-with (with interface
  definition), alternative-to, derived-from, refines, implements, conflicts-with, replaces. Many to
  many, across abstraction levels; no self links; acyclic types refuse cycles (containment over the
  union of all decompositions); symmetric types refuse duplicates in either direction.
- **Decompositions**: named alternative decomposition structures of a parent; contains links may
  belong to one; shared children allowed.
- **Alternative sets**: a question under a parent Concept with member Concepts (each its own identity,
  so branches never overwrite each other). Member status changes only through decisions.
- **Design decisions**: `DEC-001`, outcomes per Concept (accepted, rejected, deferred) with rationale,
  status proposed → recorded / withdrawn, supersession preserves the old record.
- **Trade studies**: criteria (performance, mass, cost, complexity, manufacturability, risk, custom;
  weight, direction, unit or qualitative scale), options, append-only scores (value or range, qualitative
  1–5, basis, rationale). Results computed by the server with ranges and coverage; labelled
  preliminary unless every score is evidence.
- **Evidence**: calculations, analyses, tests, references, estimates; inputs, outputs, units,
  assumptions, model/artifact revision; immutable.
- **ConceptImplementation**: `IMP-001`, realizes one or more Concepts, status, artifact refs (SDK
  `ArtifactRef`, revision-pinned), realization requests (pending CAD generation and similar).
- **Concept links**: Concept ↔ requirement (satisfies, derives, refines, proposes) or any artifact
  (references), revision-pinned.

## Roles and permissions (server-enforced, documented in OpenAPI `x-permissions`)

| Permission | reader | editor | reviewer | administrator |
| --- | --- | --- | --- | --- |
| read (everything, events, assessment) | ✓ | ✓ | ✓ | ✓ |
| author (Concepts, statements, relationships, decompositions, alternative sets, trade studies, evidence, implementations, links, explorations, maturity up to `evaluated`, proposed decisions, deferred decisions) |  | ✓ |  | ✓ |
| decide (record accepted/rejected decisions, select alternatives, maturity `selected` and later, supersede or archive Concepts that are `selected` or later, verification status) |  |  | ✓ | ✓ |

Entitlement `tool:conceptualize` on every route.

## Vertical slice acceptance (brief §13)

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Create a Concept from natural language | Done | UI: New concept → deterministic draft (name, functions, quantities with units and bounds, questions) → Create (browser flow `nl-draft`, `persist`, `nl-store`). Assistant: *Create a concept: …* → `conceptualize.create` service proposal → Apply. Tests: `nl.test.ts`, `assistant.test.ts` |
| 2 | Persist and retrieve it | Done | PostgreSQL schema `conceptualize`, immutable revisions, ETag/If-Match, idempotency (`concepts.api.test.ts` › revisions and concurrency; browser `persist`) |
| 3 | Decompose into child Concepts | Done | Add child (contains), decompositions, shared children, cycle refusal (`concepts.api.test.ts` › decomposition; browser `decompose`) |
| 4 | Generate multiple alternatives | Done | Demo assistant with the owner's prompt → one exploration proposal (parent, 3 alternatives, decompositions, interfaces, computed estimates, trade study) → Apply (browser `ai-preview`, `ai-apply`); branching (API test › branches) |
| 5 | Compare and select alternatives | Done | Alternative Explorer side by side + trade study with ranges; editor proposes, reviewer records; selected/rejected kept; superseding decision (browser `compare`, `propose`, `select`; API test › selects an alternative) |
| 6 | Link to a mock or real artifact through the contract | Done | ConceptImplementation with version-aware ArtifactRef to CAD-120 (twin model), status Current; SDK `conceptsForArtifact` (browser `link`; contract suite on HTTP and demo adapters) |
| 7 | Concept identity preserved when the implementation changes | Done | Replace CAD-120 → CAD-130, retire implementation and add another: id, key and revision unchanged (browser `identity`, `replaced`; API test › implementations) |
| 8 | Traceability of AI-generated modifications | Done | X-Source-Kind/X-Conversation-Id/X-Proposal-Id recorded on revisions, records and audit; `/history?proposalId=`; AI collaboration page lists assistant changes; assistant cannot write user assertions, verified evidence or record decisions (browser `ai-trace`; API test › refuses assistant writes) |
| 9 | Visualization of hierarchy and alternatives | Done | Tree with decompositions, alternative sets, shared marks; SVG graph; side-by-side comparison (browser `seed`, `tree-sets`, `graph`, screenshots) |
| 10 | Unit, integration and API contract tests pass | Done | `npm run check` 404 passed; `npm run req:test:db` 121 passed (includes 29 Conceptualize DB tests and the OpenAPI conformance checks); contract suite on both adapters |

## Contract change requests

1. **Assistant action names**: contracts §5 say `concepts.*`, but the workspace registry requires
   actions prefixed with the tool ID. Implemented as `conceptualize.*`. Proposal: amend §5 to
   `conceptualize.*` (or relax the registry rule for this tool).
2. **Service-proposal card bug (platform)**: `proposeService` in `apps/workspace/src/assistant/executor.ts`
   did not return `proposalId` on the outcome, so service-proposal cards never rendered and could not
   be applied. Fixed in a separate commit `cf98d7e` ("COORDINATOR REVIEW") for you to keep or replace;
   a regression test in `serviceProposals.test.ts` (rendering or outcome shape) is advisable.
3. **Proposal IDs are unique only per conversation** (`CP-1` in every conversation). Apply handlers
   therefore scope idempotency keys with the conversation ID; consider globally unique proposal IDs
   (provenance queries by proposal ID also need the conversation today).
4. **SDK quantity helpers** (optional, additive): the service has unit parsing, dimension checks and
   conversion (`services/conceptualize/src/domain/units.ts`); move to the SDK if other modules need them.
5. **Events**: add `concept.trade-study-changed` (trade-study changes are announced as `concept.revised`
   with the study ID) and a reset signal on `ConceptsService.subscribe` (like Requirements request 5).
6. **Design system**: a semantic `concept` icon (the tool uses `category`).
7. **Capability inventory test**: scan `services/conceptualize` operationIds too, so Conceptualize
   entries can list `apiOperations` (today they are named in `note`).

## Integration needs for the coordinator

1. Review the two "COORDINATOR REVIEW" commits: `f94d946` (test expectations listing exactly three
   tools: designSystem, help, platform tests) and `cf98d7e` (service-proposal card fix).
2. `services/api/src/server.ts` `prepareDatabase` grants `tool:conceptualize` to ada, rui, eli, rho after
   `seedPlatform` (fresh databases); please move this into `DEV_USERS` in `platform/identity.ts`.
   Migration `0002_conceptualize_entitlement.sql` covers existing databases.
3. Packages added as dependencies of `apps/workspace` (`@ews/tool-conceptualize`,
   `@ews/conceptualize-client`) and `services/api` (`@ews/conceptualize-service`); the boundary test
   requires them.
4. `DEFAULT_OPEN_TOOLS` now includes `conceptualize` (tools.ts) so the owner sees it; revert if unwanted.
5. `apps/workspace/src/platform/capabilities.ts` (About dialog) and `docs/roadmap.md`,
   `docs/architecture.md`, root `AGENTS.md`/`README.md` should mention Conceptualize (coordinator files).
6. Workspace inspector "Concepts" section: `services.concepts.conceptsForArtifact` with the §3 module
   values returns implementations; other module values return an empty list (no error).
7. `npm run db:status` / `db:migrate` messages in `services/api/scripts/db.ts` do not list the
   conceptualize schema yet (migrations do run through `prepareDatabase`).

## Architectural conflicts found

(Beyond contracts §9.)

1. **Registering a fourth tool breaks coordinator-owned tests** that enumerate the tools:
   `packages/design-system/src/theme/designSystem.test.ts` ("finds the tool packages" expects exactly
   cad, requirements, sysml) and `apps/workspace/src/platform/platform.test.ts` (expects the registry
   to be exactly requirements, sysml, cad). Registration is allowed (contracts §2), so these
   expectations must change with it; see integration needs.
2. **Fresh databases do not get `tool:conceptualize`** from an additive migration alone: platform
   migrations run before `seedPlatform` creates the development users, so a migration can only grant
   the entitlement to users that already exist (the coordinator's dev database). See integration needs.
3. **Service proposals are prepared together, applied later**: the demo planner plans all calls up
   front and the user applies each proposal separately, so later calls cannot reference records
   created by earlier applies. Multi-record AI work is therefore one atomic *exploration* proposal.
4. **No SDK dimension helpers**: the SDK has `Quantity` and `formatQuantity` but no dimensional
   analysis; the service implements unit parsing and dimension checks (contract change request).
5. **No Concept icon** in the design system; the tool uses an existing semantic icon (request).
6. **Provenance is asserted by the browser**: service proposals run in the browser, so the server
   records the source kind the client declares (`X-Source-Kind: assistant`). It enforces the stricter
   rules for assistant-sourced writes, but cannot prove a request did not come from the assistant
   until the execution gateway of ADR-0013 exists.

## Limitations and risks

- **No model provider**: the assistant is the scripted demo; alternative generation uses a small
  principle library (linear actuation, power transmission) and honest placeholders otherwise.
  Estimates are textbook formulas with stated assumptions, not validated analyses.
- **Provenance is client-asserted** (`X-Source-Kind`): the server enforces the assistant rules for
  declared assistant writes but cannot detect an assistant call that claims to be a user (ADR-0013
  gateway needed).
- **Stale and broken links are checked in the browser** (contracts §9); a Concept not open in a view is
  not checked, and there is no server-side impact analysis or notification inbox yet.
- **Analysis** references are labelled test-adapter IDs (no Analysis module); **CAD generation** is a
  pending realization request (no CAD API, no kernel).
- **Demo-data mode is read-only** (SDK subset), like the Requirements demo adapter.
- **Natural-language extraction** is deterministic and covers common phrasing only; the draft is
  always shown for review.
- **Two coordinator-owned files were changed** in separate commits for review (test expectations
  `f94d946`, service-proposal card fix `cf98d7e`), plus the allowed registration files.
- Trade-study evaluation is a weighted sum with interval propagation; no sensitivity analysis or
  Pareto view yet.
- Graph view is a simple layered SVG of the open Concept's neighbourhood; large projects need a
  proper layout or paging.
- Seed data is development data (`SEED_ON_START`); production has no example Concepts.

## Feature backlog (prioritized)

1. Server-side link resolver and change-impact notifications (persisted inbox, events from
   Requirements/twin) instead of client-only checks (needs a contract change).
2. Workspace inspector and product tree: Concepts for the selected object (coordinator integration,
   `conceptsForArtifact` is ready).
3. Real model provider through ADR-0013's gateway; replace the scripted generator; server-side
   verification of the assistant source.
4. Trade studies: sensitivity to weights, Pareto view, criteria templates, scores from evidence outputs.
5. Concept comparison of revisions in the UI (API `compare` exists), revision restore as a new revision.
6. Requirement conflict detection (concept constraints vs requirement statements with units).
7. SysML formalization helper: propose SysML parts/ports from a decomposition through the SysML tool's
   operations (needs a SysML API or service proposal path).
8. Design-reasoning extensions (Function entity, DesignExploration, invalidation conditions) when the
   coordinator routes the contract changes.
9. Import/export of Concepts (JSON), and bulk operations.
10. Performance: pagination of the graph endpoint, indexes for history queries at scale.

## Migrations

- `services/conceptualize/src/db/migrations/0001_initial.sql`: schema `conceptualize` (24 tables,
  immutability triggers, outbox with notify trigger).
- `services/api/src/platform/migrations/0002_conceptualize_entitlement.sql`: additive grant of
  `tool:conceptualize` to ada, rui, eli, rho where they exist.
- `0002_design_knowledge.sql` (sprint 2, additive): basis CHECKs widened (assessment, calculated);
  functions, constraints, assumptions (+ revisions, validations), link_types, design_links,
  evidence_subjects (backfilled from concept_id), evidence_reviews; decision and evidence columns with
  defaults; decompositions may have a function parent. **CR-C3 data migration**: one Assumption
  (ASM-nnn, provenance `system`, reason "migrated from statement", origin = statement) per assumption
  statement of each Concept's current revision. Test: `test/migration.test.ts` on an 0001-format fixture
  (old rows unchanged, assumption created, decisions valid, evidence subjects backfilled).
- `0003_r1_link_vocabulary.sql` (additive): `link_types.propagation`, `artifact_modules`; built-in rows
  widened to the R1 vocabulary; user-registered types unchanged (tested on an 0002-format fixture).
  Function objectives written before R1 with direction `min`/`max` are read as `target` (no rewrite).

## Test commands and results (last run)

| Command | Result |
| --- | --- |
Sprint 2 (after merging main ec16cf2, R1):

| Command | Result |
| --- | --- |
| `npm run check` | 733 passed, 1 skipped |
| `npm run build` | OK |
| `npm run concept:test:db` | 55 passed (migration 0002 and 0003 fixtures, 21 design-knowledge API tests incl. R1 invariants, 29 v1 tests, contract suite) |
| `npx vitest run packages/tool-conceptualize` | 8 passed (design operations, batch apply with provenance) |
| Browser: design knowledge (`pw/concept/design-flow.mjs`) | 27/27, no console errors (functions, constraints, assumptions, convert, promote, links, rationale, flag, validity, evidence review, assistant batch, phone width, reader) |
| Browser: workspace vertical slice (`pw/concept/workspace-flow.mjs`) | all passed (regression) |
| Browser: assistant operations (`pw/concept/assistant-flow.mjs`) | all passed (regression) |

Sprint 1 (last run): check 407 passed; build and harnesses OK; req:test:db 121 passed; concept:test:db
29 passed; browser flows 19/19, 8/8, 5/5, 3/3.

## Demonstration

Start: `API_PORT=8798 EMBEDDED_PG_PORT=54340 EMBEDDED_PG_DIR=.data/pg-concept npm run dev:api`, then
in `apps/workspace` `API_PORT=8798 npx vite --port 5196` and open http://localhost:5196/workspace/
(service settings: API mode, user eli). Conceptualize opens as a tab.

1. Explorer: CON-001 (ACT-100 with functional decomposition and implementation IMP-001 → ACT-100,
   SYS-001, CAD-120, CAD-110), CON-005 with alternatives ALT-001 and recorded DEC-001 (brief §3),
   CON-010 with two decompositions sharing functions (brief §4), the seeded 500 N actuator example.
2. New concept → describe → review the draft → Create. Add child.
3. ChatGPT panel: “Develop three alternative concepts for a compact mechanical actuator capable of
   delivering 500 N of linear force within a 100 mm envelope.” → review the preview (AI hypotheses,
   estimates) → Apply.
4. Alternatives: compare side by side, trade study with ranges; Decide → Propose; as rui: Record.
5. Implementations: add, Link artifact CAD-120, Replace with CAD-130 (Concept unchanged).
6. Requirement traceability: link a requirement; change it in Requirements → “Changed since linked”
   → Accept revision.
7. AI collaboration: confirm or remove AI hypotheses, next steps, explorations with Undo, assistant
   provenance. Further prompts: “Decompose CON-0xx into …”, “Link CON-0xx to SYS-003”, “Propose
   requirements for CON-0xx”, “Request CAD generation for CON-0xx”, “Pursue CON-0xx”.

Design knowledge (sprint 2): Explorer → record type **Functions** → FN-001 *Deliver controlled linear
force* (objectives with basis, sub-functions, the 500 N alternatives performing it, the 100 mm envelope
constraint). **Constraints** → the constraint formalizing REQ-001 rev 1 (reviewer gate). **Assumptions** →
migrated ASM records; record a validation. Open CON-005 → *Design knowledge* → **Preview conversion**
(four implements → performs) → Convert. A Concept with a quantified constraint statement → **Promote
to constraint**; add a typed link. A recorded decision → **Rationale and validity** (stale pins) →
Flag for review → as rui **Still valid**; Evidence → Accept (rui). Assistant: “Convert CON-005 to a
function”, “Create a function "Reject heat" performed by CON-006”, “Why was DEC-001 made?”, “Which
concepts perform FN-001?”. API: `POST /batch` with `items` (see OpenAPI example).

## Handoff log

- f5fd9eb: service, schema, API (≈50 operations), seed, host registration, platform migration 0002, 19 real-PostgreSQL API tests, domain unit tests.
- c40a038: client package (HTTP + demo adapters, module client, NL drafts), contract tests on both adapters (29 DB tests green). Contracts §3 clarification applied (cad = CAD-…, sysml = SYS-…, twin = components and saved results).
- b5e2668: the owner's 500 N example seeded as an exploration (computed estimates).
- f94d946 (COORDINATOR REVIEW): tool-enumerating test expectations. cf98d7e (COORDINATOR REVIEW): service-proposal card fix.
- 1a419b5, c193f8f: tool, assistant, help, workspace registration; vertical slice green (check, build, harnesses, req:test:db, browser flows in workspace and harness).
- Earlier plan note (done): vertical slice in the real workspace: tool-conceptualize (Explorer tree/graph, Workspace, Alternative Explorer, implementation linking), assistant actions with service proposals and demo planner, workspace registration (tools.ts, services.ts, capabilities.ts), help, seed the 500 N example, browser check; then message the coordinator ("main") and continue with M6–M8.
- f0e61dc: docs/modules/conceptualize.md, package AGENTS.md files, dependency note.
- 2bb1937: evidence recording, verification status, decompositions, supersede with replacement, criteria editing, realization status, exploration undo, live requirement notifications; help updated.
- Coordinator notified of the slice checkpoint (c0031f8) with SendMessage.
- Resume here: backlog above; all validation green at the last commit. Servers used: API 8798, embedded PostgreSQL 54340 (.data/pg-concept, git-ignored data dir inside the worktree), workspace 5196, harness 5197.

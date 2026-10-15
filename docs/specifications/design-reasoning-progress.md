# Design Reasoning Layer: progress

Maintained by the Design Reasoning Architecture Agent. Brief: [design-reasoning.md](design-reasoning.md)
(do not edit). Governance: [design-reasoning-governance.md](design-reasoning-governance.md).

Branch: `feature/design-reasoning`. Worktree: `C:\Users\kimge.000\Documents\Sandbox-reasoning`.
Base: `main` 9cf0cba. Conceptualize state read: `feature/conceptualize` b5e2668 (read-only).

Architecture set: [docs/modules/design-reasoning/](../modules/design-reasoning/README.md).

## Phase A report (brief §16)

### 1. Existing architecture relevant to the task

| Area | What exists (inspected) | Relevance |
| --- | --- | --- |
| Monorepo, boundaries | npm workspaces (`packages/*`, `services/*`, `apps/*`), dependency rules enforced in `packages/platform-sdk/src/boundaries.test.ts`; services import only `@ews/platform-sdk` (+ own libraries) | New packages need boundary rules (CR-P4) |
| Service pattern | Requirements (ADR-0011) and Conceptualize (ADR-0015): Fastify plugin in `services/<module>`, PostgreSQL schema per module, TypeBox → Ajv + OpenAPI 3.1, outbox + SSE, ETag/If-Match, Idempotency-Key, development identities, hosted by `services/api` | The reasoning service follows it exactly |
| SDK 1.5 | `ConceptsService` (read-only: get, list, conceptsForArtifact, implementations, subscribe), `ArtifactRef`, `RequirementsService`, `HelpService`, `ServiceProposal` with `apply`/`undo` closures, `DemoPlanner` | Base for CR-S1…S5 |
| AI Interface | Browser executor (`executor.ts`): platform operations + tool `AssistantContribution` actions, entitlement re-check, argument schema check, change previews, service proposals; handlers kept in memory per window; `RemoteAssistantService` adapter but no provider backend; capability inventory with completeness tests; ADR-0013 registry and gateway proposed, not implemented | Reasoning tools plug in here; declarative proposals needed (CR-A1) |
| Twin | `@ews/model-service`: browser `DemoRepository`, `ModelIndex`, ownership/delegation/relationship rules, revisions, baselines, `changeImpact`, read-time projection of requirements (ADR-0012); quantities are `{value, unit}` without dimension algebra | Server cannot read it (conflict 3) |
| Conceptualize (in progress) | Schema with concepts, immutable revisions, typed statements with basis, maturity, 9 relationship types with cycle checks, decompositions, alternative sets, decisions (approval gate), trade studies with computed interval results, evidence (immutable), implementations with pinned refs and realization requests, concept links, explorations (atomic bulk create + undo), audit, outbox, idempotency; own unit parser with dimension vectors; maturity assessment; seed with ACT-100 drive-train trade study and the 500 N compact actuator exploration with computed estimates (Euler buckling as text) | The knowledge store this layer extends |
| Requirements | Implemented service; `traceLinks`, `impact`, draft creation through API, events | Constraints formalize requirements; impact source |
| SysML, CAD | Experimental subsets in the twin; no SysML v2 conformance; CAD mock geometry, no generation API | Formalization targets via ConceptImplementation; client-attested reads |
| Analysis | Retired module (read-only data only) | `AnalysisPort` with a labelled test adapter |

### 2. Proposed module and service boundaries

- **Conceptualize** owns all durable design knowledge, extended by CR-C1…C13 (Function, Constraint,
  Assumption, CalculationModel, structured DesignExploration, typed design links, decision and evidence
  extensions, graph API, batch writes, implementation sync).
- **Design Reasoning Engine** (`services/design-reasoning`, schema `reasoning`, `/api/reasoning/v1`; core
  library `packages/design-reasoning-core`) owns runs, plans, invocations, budgets, checkpoints, context
  manifests, justifications and drafts. Headless; writes nothing to other modules.
- **Calculation engine** (`packages/engineering-calc`): framework-free, deterministic; used by the engine and
  by Conceptualize (validation and re-verification of calculated evidence).
- **AI Interface** keeps conversation, model access, registry, previews and Apply; gains declarative proposals,
  a headless contribution for `reasoning.*` and (phase 3) a server-side model gateway.
- **Engineering modules** unchanged and authoritative; integration through SDK and HTTP APIs.
- Details: [overview.md](../modules/design-reasoning/overview.md), [integration.md](../modules/design-reasoning/integration.md).

### 3. Major architectural decisions (proposed ADRs)

| ADR | Decision |
| --- | --- |
| [0039](../decisions/0039-design-reasoning-engine-boundary.md) | Separate headless engine service owning only operational state |
| [0040](../decisions/0040-conceptualize-design-knowledge-extension.md) | Extend Conceptualize with Function, Constraint, Assumption, DesignExploration, typed links |
| [0041](../decisions/0041-relational-knowledge-and-graph-api.md) | Relational knowledge + persistence-independent graph API; no graph/vector DB |
| [0042](../decisions/0042-declarative-service-proposals.md) | Declarative service proposals applied by the platform |
| [0043](../decisions/0043-basis-of-knowledge-and-promotion.md) | Basis ladder (adds `assessment`, `calculated`) and promotion rules |
| [0044](../decisions/0044-calculation-models-and-math-stack.md) | Calculation models in Conceptualize; engine on mathjs 15.2.0 + platform unit algebra; re-verified calculated evidence |
| [0045](../decisions/0045-reasoning-runs-and-model-access.md) | Model access only through the AI Interface; runs with budgets, checkpoints, replay; no chain-of-thought |
| [0046](../decisions/0046-change-impact-and-invalidation.md) | Possible vs demonstrated impact; review flags, never silent invalidation; implementation sync states |

### 4. Conflicts with existing designs

| # | Conflict | Resolution proposed |
| --- | --- | --- |
| 1 | **Conceptualize model gaps**: functions are Concepts (`abstraction: function`) linked by `implements`; constraints and assumptions are statements; no invalidation conditions; explorations are bulk-create logs; relationships only Concept↔Concept | CR-C1…C7 with additive migrations (explicit conversion for functions and constraints; automatic additive Assumption records) |
| 2 | **ServiceProposal closures** live in one browser window (`serviceProposals.ts`); a server-side engine cannot produce them | Declarative proposals (CR-A1, ADR-0042) |
| 3 | **Twin is browser-only**; a server-side engine cannot read components, SysML or CAD | Client-attested twin snapshot (CR-P1); twin-side impact runs in the browser via `design-reasoning-core`; honest labelling |
| 4 | **ADR-0013** (proposed registry and gateway) overlaps with tool discovery and execution | Use today's `AssistantContribution` via a headless contribution (CR-A2); tool definitions served as data by `/tools` so they move into the registry unchanged; no competing gateway |
| 5 | **Preview policy** must stay; engine-driven exploration wants autonomy | Autonomy limited to operational work (read, calculate, draft) within budgets; every durable change previewed and applied by the user |
| 6 | **No Analysis module** | `AnalysisPort` with a labelled test adapter; results at most `estimate` |
| 7 | **Two unit systems** risk: Conceptualize's parser vs a math library's units | Promote Conceptualize's parser to the SDK (CR-S2, also its own conflict 4); do not use mathjs units |
| 8 | **Browser-asserted provenance** (Conceptualize conflict 6) also weakens reasoning provenance | Declarative proposals executed by the platform; no tamper-proof claims until the ADR-0013 gateway |
| 9 | **Conceptualize multi-record AI work** cannot reference records created by earlier applies (its conflict 3) | Batch endpoint with placeholders (CR-C10) |
| 10 | Existing `implements` relationship meaning overlaps with the brief's `performs`/`realizes`/`implemented by` | `performs` for Concept→Function; `realizes` = implementation membership; `implemented-by` is its inverse reading; `implements` stays for Concept→Concept refinement |
| 11 | Docs drift: `docs/architecture.md` and `docs/modules/platform.md` still say SDK 1.1.0 while the code is 1.5.0 | Coordinator housekeeping (noted, not changed) |

### 5. Recommended domain model

Target model: [domain-model.md](../modules/design-reasoning/domain-model.md). Summary: Function (what) ←
`performs` — Concept (how, in principle) ← `realizes` — ConceptImplementation → ArtifactRefs (SysML, CAD, twin,
analysis); DesignConstraint `constrains` Functions/Concepts and `formalizes` one pinned requirement or is
conceptual; Assumption and Evidence are first-class with validation status; DesignDecision decides an
AlternativeSet (architectures = Concept + decomposition) with support, assumptions, constraints, affected
artifacts and invalidation conditions; DesignExploration structures objectives, design space, investigations
and convergence; CalculationModel defines relations whose executions are calculated Evidence. All of it is
Conceptualize data. The engine's entities (run, plan, step, invocation, manifest, checkpoint, draft,
justification) are operational.

### 6. Documentation locations

| What | Where |
| --- | --- |
| Architecture set A–J | `docs/modules/design-reasoning/` (README, overview, domain-model, knowledge-representation, reasoning-orchestration, integration, formalization, ai-tools, user-experience, mathematics, exploration, governance-security, roadmap, contract-change-requests) |
| ADRs | `docs/decisions/0039-…` to `0046-…` (Proposed) |
| Research | `docs/research/design-reasoning/research-note.md` |
| Progress, report, proposed coordinator text | this file |
| Later (phase B and beyond) | package `AGENTS.md`/README for new packages; help topics in the module that ships each UI or operation |

### 7. Implementation milestones

R1 validation prototype → R2 Conceptualize knowledge extensions + SDK 1.6 → R3 calculation engine production
→ R4 reasoning service → R5 AI integration → R6 synchronization → R7 engine-driven exploration → R8 analysis.
Acceptance criteria and risks: [roadmap.md](../modules/design-reasoning/roadmap.md).

## Contract change requests (Conceptualize, SDK, AI Interface)

Full text with migrations: [contract-change-requests.md](../modules/design-reasoning/contract-change-requests.md).

| CR | Owner | Summary | Priority |
| --- | --- | --- | --- |
| C1 | Conceptualize | Function entity, `performs`, function decomposition; convert-to-Function operation | P1 |
| C2 | Conceptualize | DesignConstraint entity; `formalizes` requirement (pinned); promotion from statements | P1 |
| C3 | Conceptualize | Assumption entity; additive migration from assumption statements | P1 |
| C4 | Conceptualize | Typed design links across entity types; link-type registry | P1 |
| C5 | Conceptualize | Decision support, assumptions, constraints, affected, invalidation conditions, validity, review flag, rationale read | P1 |
| C6 | Conceptualize | Evidence subjects, applicability, reviews, manifest; basis `assessment`, `calculated` | P1 |
| C7 | Conceptualize | Alternatives as architectures; structured DesignExploration; Pareto in results | P1/P2 |
| C8 | Conceptualize | CalculationModel; validation and re-verification with `@ews/engineering-calc` | P1 |
| C9 | Conceptualize | Graph traverse/neighbourhood/paths, cross-type search | P1 |
| C10 | Conceptualize | Atomic batch with placeholders | P1 |
| C11 | Conceptualize | Implementation sync states, realized concept revision, deviations | P2 |
| C12 | Conceptualize | New event types | P1/P2 |
| C13 | Conceptualize | `source_kind: reasoning`, run/step IDs | P2 |
| S1 | SDK (coordinator) | `DesignRef`; `ArtifactModule` + conceptualize, reasoning | P1 |
| S2 | SDK (coordinator) | `quantities` unit algebra promoted from Conceptualize | P1 |
| S3 | SDK (coordinator) | `ConceptsService` read additions, event types | P1 |
| S4 | SDK (coordinator) | Proposal item basis + metadata; declarative variant | P1 |
| S5 | SDK (coordinator) | `ReasoningService`, `PlatformServices.reasoning` | P2 |
| A1 | AI Interface (coordinator) | Declarative service proposals executed by the platform | P1/P2 |
| A2 | AI Interface (coordinator) | Headless assistant contributions | P2 |
| A3 | AI Interface (coordinator) | Server-side model gateway | P3 |
| A4 | AI Interface (coordinator) | Proposal card metadata; run panel | P2 |
| A5 | AI Interface (coordinator) | Capability inventory entries | P2 |
| P1 | Platform (coordinator) | Client-attested twin snapshot or twin directory with revisions | P1 |
| P2 | API host (coordinator) | Host registration, boundary rules, entitlement migration | P2 |
| P3 | model-service (coordinator) | `changeImpact` shape for merging | P2 |
| P4 | Coordinator | New packages, boundary rules, mathjs in dependencies.md | P1 |

## Proposed updates to coordinator-owned files

Exact text; to be applied by the coordinator on approval.

### docs/decisions/README.md

Replace the "Proposed for review" paragraph under *Open decisions* with:

```markdown
Proposed for review: [ADR-0013: complete AI coverage through shared semantic operations](0013-ai-semantic-capability-coverage.md) (renumbered from 0011, which was already taken by the Requirements service boundary).
This extends ADR-0010 without changing the current proposal-preview policy.

Proposed for review (design reasoning layer, phase A, 14 October 2026; [architecture set](../modules/design-reasoning/README.md)):

| ADR | Decision | Status |
| --- | --- | --- |
| [0039](0039-design-reasoning-engine-boundary.md) | Design Reasoning Engine as a separate service owning only operational state | Proposed |
| [0040](0040-conceptualize-design-knowledge-extension.md) | Extend Conceptualize with first-class Function, Constraint, Assumption, DesignExploration and typed design links | Proposed |
| [0041](0041-relational-knowledge-and-graph-api.md) | Relational knowledge with a persistence-independent graph API; no graph or vector database | Proposed |
| [0042](0042-declarative-service-proposals.md) | Declarative (serializable) service proposals applied by the platform | Proposed |
| [0043](0043-basis-of-knowledge-and-promotion.md) | Basis-of-knowledge ladder and promotion rules | Proposed |
| [0044](0044-calculation-models-and-math-stack.md) | Calculation models in Conceptualize; deterministic calculation engine on mathjs and the platform unit algebra | Proposed |
| [0045](0045-reasoning-runs-and-model-access.md) | Reasoning runs: model access through the AI Interface, budgets, checkpoints, reproducibility, no chain-of-thought | Proposed |
| [0046](0046-change-impact-and-invalidation.md) | Change impact distinguishes possible from demonstrated; invalidation is flagged, never silent | Proposed |
```

On acceptance, move each accepted row into the main table with status Accepted.

### AGENTS.md (new section after "AI capability design")

```markdown
## Design reasoning layer

Architecture: [docs/modules/design-reasoning/](docs/modules/design-reasoning/README.md) (ADR-0039 to ADR-0046).

- Durable design knowledge (functions, concepts, alternatives, decisions, assumptions, evidence, constraints,
  explorations, calculation models and their typed links) is **Conceptualize** data. Do not create another
  store for it; request Conceptualize contract changes instead.
- The Design Reasoning Engine (`services/design-reasoning`, `packages/design-reasoning-core`) owns only
  operational state (runs, plans, tool invocations, budgets, checkpoints, context-used manifests, draft
  proposals). It reads other modules through their APIs as the user and never writes them: durable changes
  are previewed service proposals the user applies.
- Language models are reached only through the AI Interface. The engine has no provider SDK or credentials.
- Numbers presented as calculated come from the deterministic calculation engine (`packages/engineering-calc`)
  with a reproducibility manifest; never present model-generated numbers as calculated or verified. Keep the
  basis of knowledge (ADR-0043) visible in UI and data.
- Modules that realize designs (Requirements, SysML, CAD, future Analysis) link to Concepts through
  ConceptImplementations and the SDK `ConceptsService`; implementation changes never rewrite design intent.
```

### docs/architecture.md (new section after "6a. Help and documentation")

```markdown
## 6b. Design reasoning layer (proposed)

Status: **Proposed**, not implemented. Architecture set: [modules/design-reasoning](modules/design-reasoning/README.md);
decisions ADR-0039 to ADR-0046 (Proposed).

The platform distinguishes the engineering problem (requirements, functions, constraints), the proposed
solution (concepts, alternatives, decisions, evidence; owned by Conceptualize) and the implemented design
(SysML, CAD, components, verification). A headless Design Reasoning Engine (`services/design-reasoning`,
schema `reasoning`) is planned for tool-assisted reasoning: context resolution, investigation plans,
deterministic calculations (`packages/engineering-calc`), evidence classification, change impact and draft
proposals. It owns only operational state, reaches models only through the AI Interface and changes
authoritative data only through previewed proposals applied by the user. Phase 1 adds no reasoning service:
it extends Conceptualize and adds the calculation and core libraries.
```

### docs/roadmap.md (rows)

Add to the Phase 1 table:

```markdown
| Design reasoning layer: architecture and proposed ADRs 0039–0046 | Proposed (architecture review) |
| Design reasoning validation prototype (functions vs concepts, deterministic calculation, decision with evidence, change impact) | Planned (after architecture approval) |
| Conceptualize knowledge extensions: functions, constraints, assumptions, typed design links, calculation models | Planned (contract change requests C1–C10) |
```

Add under Phase 2 (planned):

```markdown
Design reasoning service: context resolution, investigation plans, calculation orchestration, evidence
evaluation, change impact and AI-generated proposals through the AI Interface (roadmap R4–R6 in
[design reasoning roadmap](modules/design-reasoning/roadmap.md)).
```

Add under Phase 3 (planned):

```markdown
AI-driven design exploration: engine-driven runs with budgets, parallel exploration branches, multiobjective
search and supervised optimization, through the AI Interface model gateway (design reasoning roadmap R7).
```

`apps/workspace/src/platform/capabilities.ts` ("About this platform") needs matching "Planned, not available"
entries when the coordinator applies the roadmap rows (AGENTS.md: keep them in step).

## Open questions for the owner

1. **Function migration**: convert existing function-level Concepts explicitly (proposed), or accept an automatic
   additive migration that creates Functions for every `abstraction: function` Concept?
2. **Prototype persistence**: may the validation prototype stay in-memory against a labelled Conceptualize
   contract adapter (proposed), or must it wait for Conceptualize to implement CR-C1…C10 in PostgreSQL?
3. **Entitlement**: reasoning operations under `tool:conceptualize` (proposed) or a separate
   `service:design-reasoning` entitlement?
4. **Calculation model ownership**: Conceptualize until a Mathematics module exists (proposed), or start a small
   Mathematics module now?
5. **Autonomy in phase 3**: is "operational autonomy only (read, calculate, draft; every durable change
   previewed)" the intended limit, or should scoped autonomous Apply be considered later under ADR-0013?
6. **Retention** of run records (proposed 2 years, configurable).
7. **Requirements quantities**: should Requirements gain a structured quantity field so that formalizing
   constraints can be checked against it (P3 nice-to-have)?

Answered on 15 October 2026; see Phase B below.

## Phase B: validation prototype R1 (approved 15 October 2026)

### Owner and coordinator decisions applied

| Question | Decision |
| --- | --- |
| 1 Function migration | Explicit conversion to Function; no automatic migration |
| 2 Prototype persistence | In memory, against a labelled Conceptualize contract test adapter |
| 3 Entitlement | `tool:conceptualize` |
| 4 Calculation models | Stay in Conceptualize; no Mathematics module yet |
| 5 Autonomy | **Owner-approved** (governance "Owner decisions", main c5a531e): operational autonomy only (read, calculate, draft); every durable change is previewed and applied by a person. Open to later revision |
| 6 Retention | **Owner-approved** (same record): run records kept 2 years, configurable |
| 7 Requirements quantity field | Deferred (P3) |

Change requests: S2 done by the coordinator (SDK 1.6 `quantities`, used by engineering-calc); P4 approved (two
packages, mathjs 15.2.0, boundary rules); P1 approved for the prototype (client-attested twin snapshot); S1, S3, S4
approved in principle, with exact types in design-reasoning-core and in contract-change-requests.md; A1 approved in
principle (drafts are declarative data; executor support comes later); A2 later; A3 is being built by the AI
connection agent (`services/assistant`, settings namespace `ai.reasoning.*`) and is treated as the future model
gateway; the C1–C10 P1 set was routed to Conceptualize.

### R1 checkpoint (ready for coordinator review)

Commits on `feature/design-reasoning` after merging main (6651e39): a673c84 (COORDINATOR REVIEW: boundary rules),
b217a3e (engineering-calc and the mathjs dependency row), a5b4d92 (design-reasoning-core), then the documentation
commit that records this checkpoint.

| Package | Content |
| --- | --- |
| `packages/engineering-calc` | `ews-expr/1` (mathjs used to parse only; own interpreter over a whitelisted AST), dimensional analysis on the SDK unit algebra (no mathjs units), deterministic evaluation, constraint checks with margins, validity conditions, interval bounds by vertex enumeration, reproducibility manifest with SHA-256 digests, `verifyManifest` |
| `packages/design-reasoning-core` | The proposed Conceptualize contract as TypeScript; a **TEST ADAPTER** implementing it in memory with its invariants; client-attested twin snapshot; Requirements reader (SDK subset; a fixture in the scenario); binding resolution; tool definitions with closed JSON schemas and a validator; assistant-driven runs with invocations, context manifests and budgets; change impact (possible, demonstrated, checked-unaffected); Pareto dominance; rationale assembly; declarative drafts and the platform-apply emulation; the actuator scenario and a demo script |

Acceptance (roadmap R1, brief §14), automated in `packages/design-reasoning-core/src/prototype/actuatorScenario.test.ts`:

| # | Demonstration | Evidence |
| --- | --- | --- |
| 1 | Functional objective without a solution | FN-001 with flows and objective; an implementation that references a Function is refused |
| 2 | Several candidate concepts | 4 Concepts drafted by `reasoning.propose_solution_concepts` (scripted candidates stand in for a model; the duplicate "Ball-screw" is left out), all `ai-hypothesis`, with the run ID in provenance |
| 3 | Functions and concepts are separate | Distinct types, keys and reads |
| 4 | Alternatives linked to one objective | All four `performs` FN-001; the set's `functionId` refuses non-performers |
| 5 | Assumptions and constraints | ASM-001…004; CST-001 formalizes REQ-001 at revision 1 (pinned); CST-002 stated |
| 6 | Deterministic calculation | Euler buckling of ROD-120 (d and L client-attested, revision 2): P_cr 110.4 kN, matching an independent formula within 1e-9; manifest re-verified; a forged manifest is refused |
| 7 | Comparison with explicit criteria | Weighted sum (preliminary, uncertain ranking) and Pareto (hydraulic robustly dominated) |
| 8 | Decision with evidence | DEC-001 proposed from a draft by eli (editor); recording by eli refused; recorded by rui (reviewer); support EVD-001 [calculated], 3 assumptions and 2 constraints pinned, 2 invalidation conditions |
| 9 | Link to existing CAD/SysML | IMP-001 realizes the ball screw: twin:ROD-120@2, cad:CAD-120@5, sysml:SYS-003@5 (the sample twin's real IDs and revisions) |
| 10 | Constraint change → affected decisions and implementations | Hypothetical 15 kN: DEC-001 checked-unaffected. Applied revision to 120 kN: EVD-001 and DEC-001 demonstrated (path binds → produced-by), IMP-001 and its artifacts possible, REQ-001 possible, the other alternatives possible (reconsideration); review flag drafted and applied by a person; rationale unchanged |

Checks run on 15 October 2026:
- `npm run check`: all workspaces type-check; 36 test files, 724 tests passed, 1 skipped.
- `npx vitest run packages/engineering-calc packages/design-reasoning-core`: 57 passed.
- `packages/platform-sdk/src/boundaries.test.ts`: 63 passed.
- `npx tsx packages/design-reasoning-core/scripts/demo.ts`: prints the ten-step walkthrough, ending with "Run …:
  completed; 8 tool calls, 5 context manifests, 4 drafts (4 applied by a person)".
- `npm run build` was not run: no application or build configuration changed, and neither package is used by the
  workspace yet.

Walkthrough for review: `npm ci`, then `npx tsx packages/design-reasoning-core/scripts/demo.ts` from the repository root.

Contract refinements found while building, recorded in contract-change-requests.md ("Exact TypeScript and
refinements", R1-1…R1-10):
- all writes are batch items named by operationId;
- reviewers do not author, so decisions are proposed by an editor and recorded by a reviewer;
- derived graph edges;
- the binding shape;
- evidence validation status;
- review flags.

Limitations:
- No persistence: the adapter is not Conceptualize.
- No UI.
- The candidate concepts are scripted; no model is involved.
- Twin values are attested by a test helper that stands in for the executor.
- The calculation engine has no worker isolation or timeouts yet. The engine is pure and bounded; the service adds
  isolation in R3/R4.
- Interval bounds are exact only for monotonic relations.

Needs your confirmation: the boundary rule for design-reasoning-core also allows `@ews/platform-sdk/testing`,
because the scenario tests and the demo use the sample twin.

Next recommended increment: switch the scenario from the test adapter to the Conceptualize API when the P1 change
requests land, so the contract tests become the acceptance; then harden the calculation engine (R3).

## R3: calculation engine production (checkpoint)

R1 was accepted and merged into main (ec16cf2). The coordinator also accepted the `@ews/platform-sdk/testing`
boundary rule for tests only. R3 scope as set by the coordinator: worker isolation with timeouts and resource
limits, an error taxonomy, exact or honestly labelled interval bounds, manifest versioning with stable digests,
a library of reviewed relations, and performance tests.

| Item | Result |
| --- | --- |
| Isolation | `@ews/engineering-calc/node`: `createIsolatedEvaluator` runs evaluations in a worker thread with V8 `resourceLimits` (default 64 MB old generation), a hard timeout (default 5 s) that terminates and replaces the worker, a start-up handshake so loading never counts as evaluation time (own limit, 30 s), and per-worker failure handling. The portable main entry has a cooperative operation budget (`resource-limit`) and deadline (`timeout`) |
| Error taxonomy | `ERROR_TAXONOMY`: 10 codes with meaning, retryability, who fixes it and the tool error code; `CalcError.toJSON`/`fromJSON` across the worker boundary; the reasoning core maps codes through it (new tool codes `timeout`, `resource-limit`, `internal`) |
| Interval bounds | New `interval` mode. Bounds are **exact** where every partial derivative has a proven sign (symbolic differentiation plus interval enclosure of the derivative). Otherwise they are a sound **enclosure** with an inner bound and a note naming the non-monotonic inputs. Checks are `satisfied` or `violated` only when proven over the whole range, otherwise `uncertain`. Validity conditions not proven are listed as uncertain. The v1 vertex method is kept only to verify v1 manifests |
| Manifests | Version 2 with `digestSpec: 'ews-digest/1'` (canonical JSON, -0 normalized, 12-significant-digit output digest). Verification compares values with a 1e-10 relative tolerance and statuses, model and input digests exactly, so it works across JavaScript engines; `exactDigestMatch` is reported for information. A v1 manifest generated by the R1 engine (b217a3e) is a stored fixture that keeps verifying |
| Library | Six relations: Euler buckling (with the Euler–Johnson transition), cantilever and simply supported beams, bolt preload (nut-factor method, ISO tensile stress area), motor torque and power, screw lead to speed and force. Each has validity conditions, assumptions, limitations, citations (not consulted; see the research note §4) and reference cases recomputed independently in tests. Status **agent-checked, engineering review required**: definitions are `ai-hypothesis`/`unvalidated`, so their results are `estimate` until a person validates them |
| Performance | Measured over several runs (medians of five batches after warm-up): compile 1.3–3.2 ms; point evaluation 0.26–0.28 ms; exact interval evaluation with 5 ranged inputs ≈ 0.9 ms; verification 2.3–3.1 ms; worst case within the static limits 53–108 ms (0.49 M operations). The test thresholds are several times higher (mathematics.md §11) |
| Other | Dimensional-analysis corpus of 68 relations (43 valid, 25 invalid). Unknown inputs and values outside their own range are refused. A core test checks that no non-test source in design-reasoning-core imports `@ews/platform-sdk/testing`. engineering-calc is version 0.2.0 (core dependency updated) |

Checks run on 15 October 2026 after `git merge main`:
- `npm run check`: all workspaces type-check; 43 test files (42 passed, 1 skipped); 864 tests passed, 1 skipped.
- `npx vitest run packages/engineering-calc`: 169 tests, including the corpus.
- The full suite was run three more times after making the performance timing robust: 864 passed, 1 skipped, each time. One earlier run had failed the compile-time threshold under parallel load, which prompted that fix.
- The reasoning core tests still pass.
- `npm run build` was not run: no application or build configuration changed.

Limitations:
- Bounds are not rigorous to the last bit, because rounding is not directed.
- `abs`, `min`, `max` and `atan2` always get enclosures.
- Sensitivity is computed internally but not yet reported.
- The worker needs `--import tsx` from TypeScript sources; a bundled service must pass its built worker URL
  and `execArgv: []` (R4).
- Memory limits apply to the worker only; the in-process entry relies on the static limits and the operation
  budget.
- The library relations are not engineering-reviewed.

Next: point the actuator scenario at the real Conceptualize API when its P1 checkpoint lands; then R4 (reasoning
service), which uses the isolated evaluator.

## Review status

Phase A: approved by the coordinator (15 October 2026; merged into main as 4f7884b, ADRs renumbered 0039–0046, still Proposed until R1 is reviewed).
Phase B (R1): accepted by the coordinator and merged into main (ec16cf2, 15 October 2026).
R3 (calculation engine production): **ready for coordinator review** (15 October 2026). Owner acceptance pending.

## Handoff log

- 5723e69: architecture set (14 documents), proposed ADRs 0039–0046, research note.
- 015c133: progress file with the §16 report, change-request summary, proposed coordinator text and open questions.
- a673c84, b217a3e, a5b4d92: R1 boundary rules, engineering-calc, design-reasoning-core; (this commit) R1 documentation and checkpoint.
- R3: engineering-calc 0.2.0 (isolation, taxonomy, interval bounds, manifest v2, library, performance) and documentation; see the R3 commits on the branch after ec16cf2.

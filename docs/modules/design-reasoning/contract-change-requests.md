# Contract change requests

Status: Proposed, for coordinator decision and routing. Baseline of "today": `main` 9cf0cba (SDK 1.5.0) and
`feature/conceptualize` at b5e2668 (schema `0001_initial.sql`, rules, seed). Every migration below is
**additive** (ADR-0009): no existing row is rewritten or deleted; old API shapes keep working.

Priority: **P1** needed for the phase 1 knowledge model and the validation prototype; **P2** needed for
phase 2 (engine service); **P3** later.

## Conceptualize (owner: Conceptualize agent; services/conceptualize, conceptualize-client, tool-conceptualize)

### CR-C1 Function as a first-class entity (P1)
- **Change**: entity `Function` (key `FN-001`) with revisions, flows, desired behaviours (statements),
  performance objectives (quantities), classifications, status; endpoints `/functions…`; link type `performs`
  (Concept → Function); function decomposition (`decomposes-into`, acyclic, shared children). Invariants in
  [domain-model.md §3](domain-model.md#3-function-new-cr-c1). Implementation may share the revision and
  statement machinery of Concepts (one table with an `entity_kind` discriminator, or separate tables); the
  contract only requires a distinct type, key prefix, endpoints and invariants.
- **Today**: functions are Concepts with `abstraction: 'function'` (seed: "Provide controlled mechanical power
  transmission"), solution Concepts point at them with `implements`.
- **Migration**: (1) add tables/columns; (2) no automatic conversion of existing Concepts; (3) operation
  `POST /concepts/{id}/convert-to-function` creates a Function from the Concept's current revision (name,
  statements of kind function/behavior/performance/constraint copied as the Function's first revision),
  links Function `derived-from` Concept, and re-expresses each `implements` link into the old Concept as a
  new `performs` link to the Function; the old Concept and links remain as history (Concept may then be
  archived by the user); (4) seed: new example data uses Functions; (5) SDK `ConceptAbstraction` keeps
  `'function'` for compatibility.

### CR-C2 DesignConstraint entity and its relation to requirements (P1)
- **Change**: entity `DesignConstraint` (`CST-001`): kind, statement, bound, expression ref, strength, subjects
  (`constrains`), source (requirement ref pinned / derived / stated), status, derived `suspect`;
  `formalizes` link to a requirement (exactly one per formalizing constraint).
- **Today**: statements of kind `constraint` with a quantity (`{max: 100, unit: 'mm'}`).
- **Migration**: additive table; for each existing statement of kind `constraint` **with a quantity**, an
  optional, user-invoked "promote to constraint" operation creates a Constraint referencing
  `{conceptId, statementId}` as its origin; statements stay unchanged. No automatic promotion (statements
  are often informal). The prototype seeds Constraints directly.

### CR-C3 Assumption entity (P1)
- **Change**: entity `Assumption` (`ASM-001`): statement, quantity, scope (subjects, applicability),
  validation status with records, basis, `dependsOn`, `validatedBy`. Endpoints `/assumptions…`.
- **Today**: statements of kind `assumption` or basis `assumption`; evidence has `assumptions text[]`.
- **Migration**: an **automatic additive migration** creates one Assumption per existing assumption statement
  (current revision only), with `origin: {conceptId, statementId}`, `validationStatus: 'unvalidated'`,
  `basis` copied, provenance `system` with reason "migrated from statement". Statements and evidence text
  arrays are untouched; the UI shows the statement linked to its Assumption. Evidence `assumptions` text
  stays; new evidence uses `assumptionIds`.

### CR-C4 Typed design links and a link-type registry (P1)
- **Change**: `design_links` table and `link_types` registry ([knowledge-representation.md §2](knowledge-representation.md#2-typed-design-links)):
  types `performs`, `decomposes-into` (functions), `depends-on`, `constrains`, `interfaces-with` (functions),
  `derived-from`, `supported-by`, `contradicted-by`, `verified-by`, `invalidated-by`, `formalizes`, plus
  namespaced registered types; endpoint rules, symmetry, acyclicity, assistant-assertable flag, impact
  propagation default; `GET /link-types`, `POST /link-types` (administrator).
- **Today**: 9 Concept↔Concept relationship types; `concept_links` Concept → artifact.
- **Migration**: existing tables unchanged and exposed through the same graph API as views; `implements`
  remains valid between Concepts (abstraction refinement); new types stored only in `design_links`.

### CR-C5 Decision extensions (P1)
- **Change**: `support[]` (evidence/calculation refs with role supports/contradicts), `assumptionIds[]`,
  `constraintIds[]` (pinned revisions), `affected[]` (DesignRef/ArtifactRef), `invalidationConditions[]`,
  derived `validity`, `POST /decisions/{id}/review-flag` (sets under-review with a reason and an impact
  report ref; reviewer clears or records invalidation), `GET /decisions/{id}/rationale` (assembled read).
- **Today**: `decisions` with question, rationale, outcomes, set, trade study, supersession.
- **Migration**: new nullable jsonb/array columns default empty; existing decisions get `validity: 'valid'`
  and no conditions; nothing rewritten.

### CR-C6 Evidence extensions and basis ladder (P1)
- **Change**: `subjects[]`, `applicability`, review records (`evidence_reviews`, append-only) with derived
  `validationStatus`, `manifest` (calculation), `source` ArtifactRef; Basis gains `assessment` and
  `calculated` (statements, scores, links, evidence), with rules of ADR-0043 enforced server-side.
- **Today**: `evidence.concept_id NOT NULL`, basis `ai-hypothesis|assumption|estimate|evidence`.
- **Migration**: `evidence_subjects` table; existing rows have their `concept_id` as the only subject
  (computed, or backfilled into the new table additively); CHECK constraints widened by adding values
  (drop and re-create the CHECK with a superset: no data change).

### CR-C7 Alternatives as architectures; structured DesignExploration (P1 for exploration fields, P2 for investigations)
- **Change**: alternative set `functionId?`; member `decompositionId?`; "reconsider" via superseding proposed
  decision; exploration fields `question` (alias of `objective`), `objectives[]`, `constraintIds[]`,
  `designSpace`, `alternativeSetIds[]`, `tradeStudyIds[]`, `investigations[]`, `uncertainties`,
  `decisionIds[]`, `convergence`; `PATCH /explorations/{id}`; trade-study criterion may reference a function
  objective; results include Pareto dominance.
- **Today**: `explorations` as an atomic creation record with undo; one set and one study.
- **Migration**: new nullable columns and child tables; existing rows: `question = objective`,
  `alternativeSetIds = [set_id]`, `tradeStudyIds = [trade_study_id]`, `convergence.status = 'open'`; the
  existing `created_ids`, `generator` and undo remain the "generation" record.

### CR-C8 Calculation models and verified calculated evidence (P1)
- **Change**: entity `CalculationModel` (`CALC-001`, revisions) per [mathematics.md §2](mathematics.md#2-calculationmodel);
  write-time validation with `@ews/engineering-calc`; Conceptualize re-evaluates the manifest of any evidence
  with basis `calculated` and refuses mismatches; boundary rule `services/conceptualize → @ews/engineering-calc`.
- **Today**: calculation method as evidence text (`P_cr = π² E I / (K L)², I = π d⁴ / 64` in the seed).
- **Migration**: additive; existing estimate evidence stays `estimate`; the seed may add the buckling model
  and re-record a calculated evidence item alongside the existing estimate.

### CR-C9 Graph traversal and search API (P1)
- **Change**: `POST /graph/traverse`, `GET /graph/neighbourhood`, `POST /graph/paths`, `GET /search` across
  entity types, `asOf` support ([knowledge-representation.md §3](knowledge-representation.md#3-graph-traversal-api-persistence-independent)).
- **Today**: `GET /graph` (concept graph), FTS on concept revisions.
- **Migration**: none (new endpoints; `GET /graph` kept).

### CR-C10 Atomic batch endpoint with placeholders (P1)
- **Change**: `POST /batch` executing a list of create/link/update operations in one transaction, with
  placeholders (`"$fn1"`) usable by later items, one provenance for the batch, per-item expected revisions,
  idempotency key for the whole batch; response maps placeholders to IDs. Generalizes the exploration
  bulk create and resolves Conceptualize's own conflict 3 (later calls cannot reference earlier applies).
- **Migration**: none.

### CR-C11 Implementation synchronization (P2)
- **Change**: implementation `realizedConceptRevision` (per realized Concept), derived `syncState`
  (`in-sync | implementation-ahead | intent-ahead | diverged | broken`), `checkedProperties`, deviation
  records, re-pin and confirm operations ([formalization.md §2](formalization.md#2-synchronization-states-cr-c11)).
- **Today**: implementations with pinned artifact refs and `repin`; v1 stale/broken detection in the client.
- **Migration**: `realizedConceptRevision` is unknown for existing rows → stored as `null` and shown as
  "not recorded" until the user confirms; nothing is inferred.

### CR-C12 Events (P1 for entity events, P2 for review flags)
New outbox event types listed in [integration.md §5](integration.md#5-domain-events); SDK `ConceptsEventType`
extended additively (CR-S3).

### CR-C13 Provenance for reasoning writes (P2)
`source_kind` value `reasoning` and nullable `run_id`, `step_id` columns on records that already carry
`conversation_id`/`proposal_id`; header `X-Reasoning-Run`. Same rules as `assistant` for basis (cannot write
`user-assertion`, `evidence`, `decision`).

## SDK (owner: coordinator; packages/platform-sdk)

| CR | Change | Version | Priority |
| --- | --- | --- | --- |
| CR-S1 | `DesignRef`, `DesignEntityType`; `ArtifactModule` + `'conceptualize' | 'reasoning'` | 1.6, additive | P1 |
| CR-S2 | `contract/quantities.ts`: `parseUnit`, `convert`, `sameDimension`, `dimensionName`, `quantityProblem`, `Dims`, `COMMON_UNITS`, promoted unchanged from Conceptualize's `services/conceptualize/src/domain/units.ts` (which then re-exports from the SDK). Answers Conceptualize's own conflict 4 | 1.6 | P1 |
| CR-S3 | `ConceptsService` read additions: `functions(query)`, `getFunction`, `traverse(request)` (read-only), `decisionRationale(id)`, `constraintsFor(ref)`; `ConceptsEventType` additions; `ConceptsQuery.types` | 1.6 | P1 (read) |
| CR-S4 | `ServiceProposalItem.basis` + `'assessment' | 'calculated'`; optional `ServiceProposal` fields `evidence`, `uncertainty`, `affected`, `requiredApprovals`, `runRef`; the declarative variant of CR-A1 | 1.6 | P1 |
| CR-S5 | `contract/reasoning.ts`: `ReasoningService` (`getRun`, `listRuns`, `impact`, `rationale`, `subscribe`), `PlatformServices.reasoning?` | 1.7 | P2 |

Migration notes go to `packages/platform-sdk/CHANGELOG.md`; no tool needs to change for 1.6 (all optional).

## AI Interface (owner: coordinator / AI Interface; apps/workspace/src/assistant)

### CR-A1 Declarative service proposals (P1 for the prototype path, P2 for the engine)
- **Change**: `ServiceProposal` may carry `operations: ModuleOperation[]` instead of (or in addition to)
  `apply`. The executor stores the proposal as plain data and, on Apply, executes the operations through
  the module client the workspace already constructs (`services.ts`), with `If-Match`, idempotency keys
  (`proposalId:index`), provenance headers, and placeholder substitution; reports partial completion.
  `undo` similarly as compensating operations.
- **Why**: a server-side engine cannot create closures; today a service proposal can be applied only in the
  window that prepared it (`serviceProposals.ts`); declarative proposals fix both and are what a future
  server-side gateway (ADR-0013) would execute.
- **Migration**: closure-based proposals keep working; modules move when convenient. ADR-0042.

### CR-A2 Headless assistant contributions (P2)
- **Change**: the workspace registers assistant contributions that are not tools (no view, no toolbar), with
  an entitlement and help mapping: `registerAssistantContribution({ id: 'reasoning', entitlement, assistant, help })`.
  Their actions appear in `availableOperations()` and in the capability inventory.
- **Alternative** if refused: contribute `reasoning.*` through `tool-conceptualize` (Conceptualize agent), at
  the cost of coupling the engine's release to the Conceptualize tool.

### CR-A3 Server-side model gateway (P3)
- **Change**: an AI Interface backend port `ModelGateway.complete({ purpose, messages, tools, budget, runRef })`
  that the engine calls for engine-driven model steps; provider adapters, credentials, token accounting and
  data-routing policy live behind it. Depends on AI development-plan sprint 4 (backend provider).

### CR-A4 Proposal card and run panel (P2)
Proposal card shows the CR-S4 metadata; a run panel per message shows plan, invocations, manifest, budget,
cancel/resume ([user-experience.md §2](user-experience.md#2-assistant-panel-additions-ai-interface)).

### CR-A5 Capability inventory entries (P2)
Append `reasoning.*` operations and the reasoning API operations to `capabilities.ts` with coverage levels;
analysis-dependent tools listed as `mock`/test adapter.

## Platform and API host (owner: coordinator)

| CR | Change | Priority |
| --- | --- | --- |
| CR-P1 | **Client-attested twin snapshot**: the executor attaches, for refs requested by a reasoning call, `{id, type, revision, properties (requested), relationships}` from the `ModelIndex`, marked `via: client-attested`; or a read-only twin directory endpoint with revisions on the API host. Long term: twin server-side | P1 (prototype uses it) |
| CR-P2 | Host registration of `@ews/design-reasoning-service` at `/api/reasoning/v1` with `registerApiDocs`; boundary rules of [overview.md §3](overview.md#3-packages-and-placement); migration for the entitlement chosen in Q3 | P2 |
| CR-P3 | `@ews/model-service`: expose `changeImpact` results in a shape the impact analyzer can merge (twin side), no behaviour change | P2 |
| CR-P4 | New packages `packages/engineering-calc` and `packages/design-reasoning-core` added to the workspace and boundary tests; `mathjs` 15.2.0 recorded in `docs/dependencies.md` | P1 |

## Requirements (owner: Requirements agent, idle)

No change required. Used as is: `get`, `resolve`, `traceLinks`, `create` (draft), events. Nice to have (P3):
a quantity field on requirements so that formalizing constraints can be checked against a structured value
instead of human-read text.

## Exact TypeScript and refinements from the validation prototype (R1, 15 October 2026)

The coordinator approved S1, S3 and S4 in principle and asked for the exact types, defined in
`@ews/design-reasoning-core` until they are promoted to the SDK. The Conceptualize change requests
(C1–C10) are implemented from **this document**; the TypeScript below and in
`packages/design-reasoning-core/src/contract/conceptualize.ts` is its exact form. The in-memory test
adapter (`src/adapters/conceptualizeContractAdapter.ts`) implements it and its tests list the failures the
real API must produce.

### CR-S1 (exact)

```ts
type DesignEntityType = 'function' | 'concept' | 'implementation' | 'constraint' | 'assumption' | 'evidence'
  | 'decision' | 'alternative-set' | 'trade-study' | 'exploration' | 'calculation-model' | 'statement'
interface DesignRef { module: 'conceptualize'; type: DesignEntityType; id: string; revision?: number }
type ExtendedArtifactModule = ArtifactRef['module'] | 'conceptualize' | 'reasoning'
interface ArtifactRefX extends Omit<ArtifactRef, 'module'> { module: Exclude<ExtendedArtifactModule, 'conceptualize'> }
type AnyRef = DesignRef | ArtifactRefX
```

On promotion: `ArtifactModule` gains `'reasoning'` (and `'conceptualize'` only inside `DesignRef`), so
`ArtifactRefX` collapses into `ArtifactRef`.

### CR-S4 (exact)

```ts
type Basis = 'user-assertion' | 'ai-hypothesis' | 'assumption' | 'assessment' | 'estimate' | 'calculated' | 'evidence' | 'decision'
interface ProposalItem { targetId?: string; label: string; current?: string; proposed: string; basis?: Basis }   // = ServiceProposalItem + 2 basis values
interface ModuleOperation { module: 'conceptualize' | 'requirements'; operationId: string; params: Record<string, string>
  body: unknown; ifMatch?: string; idempotencyKey: string }                                                    // CR-A1
interface ProposalDraft {
  id: string; runId: string; stepId: string
  status: 'draft' | 'offered' | 'applied' | 'rejected' | 'expired' | 'superseded'
  module: 'conceptualize' | 'requirements'; title: string; action: string; rationale: string
  affected: AnyRef[]; expectedEffects: string[]; evidence: { ref: AnyRef; basis: Basis }[]
  assumptions: { text: string; ref?: AnyRef }[]
  uncertainty: { summary: string; ranges?: { name: string; min: number; max: number; unit: string }[] }
  requiredApprovals: { permission: 'author' | 'decide'; module: string; reason: string }[]
  operations: ModuleOperation[]; preview: ProposalItem[]; createdAt: string; expiresAt: string
  applied?: { at: string; by: string; results: unknown[] }
}
```

Promotion path: `ServiceProposalItem.basis` takes `Basis`; `ServiceProposal` gains the optional fields of
`ProposalDraft` from `action` to `requiredApprovals`, plus `operations` as the declarative alternative to
`apply` (ADR-0042). Apply allowlist: Conceptualize `batch` only in R1.

### CR-S3 (read subset for other modules, exact signatures proposed)

```ts
interface ConceptsService {                         // additions, SDK 1.7 when Conceptualize ships C1, C5, C9
  getFunction(id: string, scope: { projectId: string; revision?: number }): Promise<FunctionRecord | undefined>
  traverse(request: TraverseRequest, scope: { projectId: string }): Promise<TraverseResponse>
  decisionRationale(id: string, scope: { projectId: string }): Promise<DecisionRationale>
}
```

### Refinements of the Conceptualize contract found while building R1

| # | Refinement | Affects |
| --- | --- | --- |
| R1-1 | **All writes are batch items** (`POST /batch`, CR-C10). Item `op` names are the OpenAPI operationIds: `createFunction`, `createConcept`, `createConstraint`, `reviseConstraint`, `createAssumption`, `createEvidence`, `createLink`, `createAlternativeSet`, `createTradeStudy`, `putScores`, `proposeDecision`, `recordDecision`, `flagDecisionForReview`, `createImplementation`, `createCalculationModel`. The single-record endpoints of integration.md §3 take the same bodies. Placeholders are strings starting with `$`, substituted anywhere in later bodies | C10 |
| R1-2 | Non-batch operations: `reviewEvidence(id, { outcome, method, note })` (reviewer) and `setAssumptionValidation(id, { status, reason, evidence? })`; validating needs an evidence ref and a person; validating or invalidating an assumption used by a recorded decision needs a reviewer | C3, C6 |
| R1-3 | Roles follow Conceptualize's existing matrix: **reviewers do not author**, so a decision is proposed by an editor (or applied from a draft by an editor) and recorded by a reviewer. A reasoning draft therefore proposes; recording is a separate reviewer action | C5 |
| R1-4 | `formalizes`: exactly one per constraint, target `requirements` artifact with a pinned revision; created automatically when `source.kind = 'requirement'`. `constrains` links are created from `subjects` | C2, C4 |
| R1-5 | `CalculationParameterRecord.defaultBinding = { ref: AnyRef; property: string }` with properties `quantity` (assumption), `bound` (constraint), an attribute name (concept) or a twin property name. AI-sourced models start `unvalidated` | C8 |
| R1-6 | Evidence `validationStatus: 'unreviewed' | 'accepted' | 'rejected'` derived from append-only reviews; `basis: 'evidence'` is never written directly. Evidence with `calculation` is re-verified (`verifyManifest`) and its basis may not exceed the manifest's | C6, C8 |
| R1-7 | Decision `reviewFlags: { at, by, reason, impactReportId?, cleared? }[]`, `validity` derived (`under-review` while an uncleared flag exists); `flagDecisionForReview` only on recorded decisions; superseding by a recorded decision sets the old one `invalidated` | C5 |
| R1-8 | Graph API returns **derived edges** (not stored, `derived: true`): `realizes`, `realized-as`, `selected-through`, `decides`, `member`, `decision-assumes`, `decision-constrained-by`, `binds`, `produced-by`, `subject`, `affects`, `watches`. Their impact propagation is in `linkTypes.ts` (`DERIVED_EDGE_TYPES`) | C9 |
| R1-9 | Trade-study results use Conceptualize's existing computation unchanged (qualitative 1–5 is "very poor … very good" regardless of direction); Pareto dominance is computed by the reasoning core, not required from Conceptualize | C7 |
| R1-10 | `asOf` on traversal stays in the contract; the test adapter answers `not-implemented` for it | C9 |

# E. Integration architecture

Status: Proposed. Index: [README.md](README.md). Change requests referenced as CR-xx are in
[contract-change-requests.md](contract-change-requests.md).

## 1. Data ownership

| Data | Owner | Store | Others access through |
| --- | --- | --- | --- |
| Functions, Concepts, Constraints, Assumptions, Evidence, Decisions, Alternative sets, Trade studies, Explorations, Calculation models, Implementations, design links | Conceptualize | schema `conceptualize` | Concepts API `/api/concepts/v1`; SDK `ConceptsService` (read subset, CR-S3) |
| Runs, plans, steps, tool invocations, context manifests, checkpoints, proposal drafts, justifications | Design Reasoning Engine | schema `reasoning` | Reasoning API `/api/reasoning/v1`; SDK `ReasoningService` (read subset, CR-S5) |
| Requirements, their revisions, relationships, baselines | Requirements | schema `requirements` | Requirements API; SDK `RequirementsService` |
| Components, SysML elements, CAD representations, twin artifacts and verification records | Platform twin / SysML / CAD | browser repository (today) | `ToolApi`, `ModelIndex`; client-attested snapshot for the engine (CR-P1) |
| Conversations, proposals as previewed, model access, operation registry | AI Interface | workspace (today) | Executor; ServiceProposal (SDK 1.5), declarative proposals (CR-A1) |
| Identities, membership, roles, entitlements | Platform | schema `platform` | API host |

No module reads another module's tables. The engine never writes `conceptualize` or `requirements` rows;
it drafts operations that the platform applies through those modules' APIs.

## 2. Reasoning API (phase 2)

Base path `/api/reasoning/v1`, OpenAPI 3.1 at `/api/reasoning/v1/openapi.json`, interactive reference via
`registerApiDocs`. Conventions identical to Requirements and Conceptualize (error body, ETag/If-Match on
mutable run state, `Idempotency-Key` on POST, cursor pagination, RFC 3339 UTC, development identity
`X-Dev-User`). Entitlement: see open question Q3 (proposal: `tool:conceptualize`).

| Group | Endpoints (prefix `/projects/{projectId}`) | Notes |
| --- | --- | --- |
| Runs | `POST /runs`, `GET /runs`, `GET /runs/{runId}`, `POST /runs/{runId}/cancel`, `…/resume`, `…/replay` | Create takes question, mode, captured context, budget, optional seed refs |
| Plans | `GET /runs/{runId}/plan`, `PUT /runs/{runId}/plan` (submit or revise; validated), `POST /runs/{runId}/plan/accept` | Acceptance needed for engine-driven plans with job-class steps |
| Steps and tools | `POST /runs/{runId}/steps` (execute one tool call as a step; used by assistant-driven mode), `GET /runs/{runId}/steps`, `GET /runs/{runId}/invocations/{id}` | Inputs validated against tool schemas |
| Context | `POST /context/resolve` (stateless preview), `GET /runs/{runId}/manifests` | Manifest per step |
| Tools | `GET /tools` (registered tools with schemas, versions, effect class, implementation status) | Source for the AI Interface registry (ai-tools.md) |
| Calculations | `POST /calculations/evaluate` (stateless), `POST /calculations/check-constraint` | Thin wrappers over `@ews/engineering-calc` with recorded invocations when given a `runId` |
| Impact | `POST /impact` (change → ImpactReport) | Also a run step |
| Rationale | `GET /rationale?ref=…` (assembled answer: decision, alternatives, support, assumptions, constraints, validity) | Deterministic; no model |
| Drafts | `GET /drafts`, `GET /drafts/{draftId}`, `POST /drafts/{draftId}/offered`, `…/applied` (reported by the platform with committed IDs), `…/rejected` | The engine never applies drafts |
| Events | `GET /events` (SSE, resume, reset) | `reasoning.run-*`, `reasoning.draft-*` |
| Meta | `GET /me/permissions` | |

## 3. Concepts API additions (requested, CR-C1…C13)

Summarized here; details and migrations in the CR document.

| Area | Endpoints (prefix `/api/concepts/v1/projects/{projectId}`) |
| --- | --- |
| Functions | `GET/POST /functions`, `GET/PATCH /functions/{id}`, `…/revisions`, `…/history`, `POST /concepts/{id}/convert-to-function` |
| Constraints | `GET/POST /constraints`, `GET/PATCH /constraints/{id}`, `POST /constraints/{id}/status` |
| Assumptions | `GET/POST /assumptions`, `GET/PATCH /assumptions/{id}`, `POST /assumptions/{id}/validation` |
| Links | `GET/POST /links` (design links, all types), `POST /links/{id}/remove`, `GET /link-types`, `POST /link-types` (administrator) |
| Graph | `POST /graph/traverse`, `GET /graph/neighbourhood`, `POST /graph/paths`, `GET /search` |
| Decisions | extended body (support, assumptions, constraints, affected, invalidation conditions); `POST /decisions/{id}/review-flag` (set by the platform on Apply of an impact draft; reviewer clears), `GET /decisions/{id}/rationale` |
| Evidence | extended body (subjects, applicability, manifest); `POST /evidence/{id}/reviews` |
| Explorations | extended body (objectives, design space, constraints, investigations, convergence); `PATCH /explorations/{id}`, `POST /explorations/{id}/investigations` |
| Calculation models | `GET/POST /calculation-models`, `GET/PATCH /calculation-models/{id}`, `…/revisions`, `POST /calculation-models/{id}/validate` |
| Batch | `POST /batch` (atomic, placeholders `$name`, one provenance for all items) |
| Implementations | extended: `realizedConceptRevision`, `syncState`, `POST /implementations/{id}/deviations` |

## 4. SDK contract additions (requested, CR-S1…S5)

| Addition | Where | Version |
| --- | --- | --- |
| `DesignRef`, `DesignEntityType`; `ArtifactModule` + `'conceptualize' | 'reasoning'` | `contract/concepts.ts` | 1.6 (additive) |
| Quantities and unit algebra (`parseUnit`, `convert`, `sameDimension`, `dimensionName`, `quantityProblem`, `Dims`) promoted from Conceptualize's `units.ts` | new `contract/quantities.ts` | 1.6 |
| `ConceptsService` read additions: `functions`, `function`, `decisionRationale`, `traverse` (read-only graph), `constraintsFor` | `contract/concepts.ts` | 1.6 |
| `ServiceProposalItem.basis` + `'assessment' | 'calculated'`; optional proposal metadata `evidence`, `uncertainty`, `affected`, `requiredApprovals`; declarative `operations` variant | `contract/assistant.ts` | 1.6 |
| `ReasoningService` (read runs, impact reports, rationale) in `PlatformServices.reasoning` | new `contract/reasoning.ts` | 1.7 (phase 2) |

## 5. Domain events

All events are emitted after commit through each module's transactional outbox (at-least-once; consumers
dedupe by `eventId` and reread). New types:

| Module | Events |
| --- | --- |
| Conceptualize (CR-C12) | `function.created|revised|retired`, `constraint.created|revised|status-changed`, `assumption.created|revised|validation-changed`, `evidence.recorded|reviewed`, `decision.review-flagged|invalidated`, `exploration.updated`, `calculation-model.created|revised`, `link.created|removed`, `implementation.sync-changed` |
| Reasoning | `reasoning.run-created|step-completed|completed|failed|cancelled`, `reasoning.draft-created|expired|applied` |
| Consumed by the engine | `requirement.updated` (constraint `formalizes` targets), `concept.revised`, `assumption.validation-changed`, `evidence.reviewed`, twin change notifications forwarded by the workspace |

The engine subscribes to Conceptualize and Requirements events to (a) expire drafts whose inputs changed
and (b) run **notification impact checks**: a cheap, bounded traversal (depth 2) that reports possible
impacts to the Conceptualize UI as notifications. Deeper analysis is a user-requested run. The engine
never edits a record in response to an event.

## 6. Module integrations

| Module | Integration | Status today |
| --- | --- | --- |
| Conceptualize | Primary store of design knowledge; graph API; batch writes via proposals | In progress on its branch; CRs needed |
| Requirements | Constraints `formalizes` requirements (pinned); impact uses `traceLinks`/`impact`; conceptual constraints may be proposed as draft requirements through `RequirementsService.create` | Available (SDK 1.3) |
| SysML | Formalization target: Concepts/Functions ↔ part/action usages through ConceptImplementation; read via client-attested snapshot | SysML subset only (no actions, constraints, calcs); no SysML v2 claims |
| CAD | Implementation artifacts; dimensions as calculation inputs (pinned revision); "generate CAD" = Conceptualize realization request | Mock geometry, no generation API |
| Analysis | `AnalysisPort` (`submit`, `status`, `result`) with a **labelled test adapter** returning recorded fixtures; results become Evidence with `basis: estimate` and an `analysis` ArtifactRef | No module (retired) |
| Verification | Twin verification records referenced by `verified-by` | Available (twin artifacts) |
| Help | The engine's operations and the Conceptualize reasoning views ship help topics (owned by the module that ships the UI or operation) | — |
| AI Interface | Operations contributed through a headless contribution (CR-A2); declarative proposals (CR-A1); model gateway (CR-A3, phase 3); capability inventory entries (CR-A5) | AssistantContribution and SDK 1.5 service proposals exist |

## 7. Consistency rules

- One atomic transaction per module call; a multi-module proposal is a sequence of idempotent steps with
  partial-completion reporting. No global transaction is implied.
- Every cross-module reference pins a revision when it asserts something about that revision (evidence,
  decisions, formalizations); "follow latest" references are explicit and shown as such.
- Staleness is derived (pinned vs current revision), never stored by editing records.
- Changes in implementations never rewrite design intent; they produce sync states and notifications
  ([formalization.md](formalization.md)).

# Conceptualize: module architecture

Status: implemented on branch `feature/conceptualize` (vertical slice and most of the brief), awaiting
coordinator integration. Brief: [conceptualize.md](../specifications/conceptualize.md). Contracts:
[conceptualize-contracts.md](../specifications/conceptualize-contracts.md). Decision:
[ADR-0015](../decisions/0015-conceptualize-module.md). Progress, backlog and open requests:
[conceptualize-progress.md](../specifications/conceptualize-progress.md).

## 1. Purpose and guiding principles

Conceptualize is the persistent representation of engineering ideas: what is imagined, why it matters,
which alternatives exist and how the idea evolves. Its unit is the **Concept**, an engineering idea
that exists without any CAD model, SysML element or other artifact.

1. **Intent is separate from implementation.** A Concept never takes an artifact's identity. Concrete
   artifacts are linked through **ConceptImplementations**, which can be replaced without changing the
   Concept.
2. **Other modules stay authoritative.** Conceptualize stores version-aware references, never copies
   of requirements, SysML elements, CAD or results.
3. **Knowledge has a basis.** User assertions, AI hypotheses, assumptions, preliminary estimates,
   verified evidence and approved decisions are distinct in data and UI. AI output is never promoted
   silently.
4. **History is kept.** Content revisions, evidence, scores and audit events are immutable; removals
   are recorded, nothing is deleted; decisions are superseded, not edited.
5. **No mandatory lifecycle.** Maturity can move in any direction, except at the approval gates.

## 2. Packages and boundaries

| Package | Role | May import |
| --- | --- | --- |
| `services/conceptualize` (`@ews/conceptualize-service`) | Domain rules, schema `conceptualize`, migrations, seed, Fastify plugin, OpenAPI, outbox | `@ews/platform-sdk` |
| `packages/conceptualize-client` | HTTP and demo adapters of the SDK `ConceptsService`, full module client, natural-language drafts, contract tests | `@ews/platform-sdk` |
| `packages/tool-conceptualize` | UI, assistant contribution, help, harness | SDK, design system, `@ews/conceptualize-client` |

`services/api` hosts the plugin at `/api/concepts/v1` with the platform's identity, roles and
entitlements. `packages/platform-sdk/src/boundaries.test.ts` enforces the import rules.

**Other modules must use `services.concepts` (SDK `ConceptsService`: `get`, `list`,
`conceptsForArtifact`, `implementations`, `subscribe`) or the HTTP API. They never read the
`conceptualize` schema or import these packages.** Requirements, SysML, CAD and analysis agents link to
Concepts through these public contracts rather than bypassing the domain model.

## 3. Domain model

```
Concept (UUID, CON-001) ──< ConceptRevision (immutable: name, summary, description, purpose,
   │                         abstraction, classifications, attributes, provenance)
   │                            └──< Statement (kind, text, quantity, basis, state, evidence/decision refs)
   ├── maturity, verification status (recorded events)    implementation status (derived)
   ├──< Relationship (9 types) >── Concept        Decomposition (named structure of a parent)
   ├──< AlternativeSet (ALT-001, parent + question) ──< Member (candidate/selected/rejected/deferred)
   │        └──< Decision (DEC-001, outcomes + rationale, proposed → recorded, supersedes)
   │        └──< TradeStudy (TS-001) ──< Criterion, Option, Score (append-only)
   ├──< Evidence (EVD-001, immutable: kind, basis, method, inputs/outputs with units, artifact ref)
   ├──< ConceptLink (requirement satisfies/derives/refines/proposes, references) → ArtifactRef
   └──< ConceptImplementation (IMP-001) >── many Concepts
            ├──< ImplementationArtifact → ArtifactRef (module, id, pinned revision)
            └──< RealizationRequest (cad/sysml…, pending/cancelled/fulfilled)
Exploration: atomic creation of parent + alternatives + decomposition + evidence + trade study (undoable)
```

- **Statements** form the hybrid semantic representation: structured kinds (function, behavior,
  principle, effect, input, output, constraint, interface, mechanism, problem, capability, performance,
  assumption, uncertainty, question, rationale, note), optional unit-aware quantity and free text.
  Statement IDs are stable across revisions. New kinds are a vocabulary change in `domain/rules.ts` and
  the check constraint (additive migration).
- **Abstraction** (function, component, assembly, subsystem, system, abstract) is a classification
  stored on the revision; it never restricts what a Concept becomes and can later be complemented by
  first-class entities (for example a Function entity) through an additive migration.
- **Relationship types** are defined once in `RELATIONSHIP_RULES` (acyclic, symmetric, reading,
  meaning); validation reads the rules. Adding a type = rule + check-constraint migration.

### 3.1 Design knowledge (Design Reasoning P1, R1 refinements)

Separate, revisioned records with keys and provenance, next to Concepts:

- **Function** `FN-…`: what must be accomplished (name, verb phrase, flows, `performanceObjectives` with
  direction minimize/maximize/target and basis). Never implemented directly, never an alternative.
  Concepts **perform** Functions; Functions **decompose into** sub-functions (acyclic, shared allowed,
  optional named decompositions). Function-Concepts are converted only explicitly
  (`convert-to-function`: derived-from link pinned to the Concept revision, implements → performs).
- **DesignConstraint** `CST-…`: kind, bound, strength, status, subjects (`constrains` links), source
  `requirement` (exactly one pinned `formalizes`), `derived` or `stated` (with basis). Statements can be
  promoted; suspect state (requirement revised) is derived by clients.
- **Assumption** `ASM-…`: statement, quantity, scope, dependsOn, validation status with an append-only
  history; created automatically for existing assumption statements by migration 0002.
- **Design links**: typed, registry-driven (`link_types`: endpoints, symmetric, acyclic,
  assistant-assertable, impact propagation, allowed artifact modules); administrators register
  namespaced types. Readings of stored data (realizes, realized-as, selected-through, decides, member,
  decision-assumes, decision-constrained-by, affects, watches, subject, applies-to) are graph edges with
  `derived: true`, never stored links.
- **Decision extensions**: support (evidence), pinned assumptions and constraints, affected records,
  invalidation conditions, review flags; validity is derived (invalidated, under review while a flag is
  open, valid). **Evidence extensions**: subjects, applicability, manifest, source, independent reviews.
- **Basis ladder** (ADR-0043): ai-hypothesis < assumption / user-assertion < assessment < estimate <
  calculated < evidence < decision; enforced on the server for every statement, link, score and record.

Writes from the reasoning layer go through `POST /batch` (items named by operationId, placeholders).
Graph reads: traverse (with `asOf`), neighbourhood, paths, search. See the progress file for the
contract deviations.

### 3.2 Engineering definition and visuals (visual concept exploration)

Brief: [concept-visualization.md](../specifications/concept-visualization.md); placement:
[concept-visualization-contracts.md](../specifications/concept-visualization-contracts.md).

- Every Concept revision carries a **stage** (exploration, layout, engineering) and an **engineering
  definition**: functional intent, components, relationships, interfaces and parameters (symbol, value or
  range, unit, basis), plus an optional structured 2D **layout** (view, length unit, placements as numbers or
  bound to length parameters, dimensions that point at parameters). Items have stable IDs (C1, P2, I3 …)
  that are kept across revisions and never reused (`idSeq`). The service validates references, units,
  layout bindings and bases; the assistant may carry a person's unchanged values but writes only
  ai-hypothesis, assumption or estimate. "Verified" is never a parameter basis: verification comes from
  recorded checks against constraints.
- **Visuals** (`VIS-001`): kind `layout` or `illustration` (`mechanism`, `architecture`, `envelope-3d`,
  `motion` reserved). Each immutable revision is pinned to one Concept revision. Layouts are rendered
  deterministically in the tool from the pinned definition (`src/layout/renderLayout.ts`, framework-free):
  every element carries its component ID, dimension labels come only from parameters, an extent not bound
  to its parameter makes the drawing *not to scale*. Illustrations are generated by `services/visualization`
  (jobs with idempotency, retry, cancel); Conceptualize mirrors the job state and stores asset ID and
  SHA-256 only. An image is never evidence, geometry or a verification (ADR-0070).
- **Annotations**: numbered pin or rectangle in normalized coordinates with an instruction, bound to one
  visual revision and never carried onto another; component ID `structured` (layout element), `inferred`
  (raster region) or `user`. A refined revision records the annotations it answers (`refinedFrom`).
- **Staleness** ("possibly outdated") is derived on read from the definition changes since the pinned
  revision, per purpose (layout, illustration, handoff, downstream); nothing is regenerated automatically.
- **Cards**: per Concept, the principle, components and interfaces, parameters, benefits and trade-offs
  (statement kinds `benefit`, `trade-off`), constraints and requirements as intended / checked
  (preliminary) / verified (verified evidence only), assumptions, questions, validation, visuals and
  decisions; per alternative set for comparison.
- **CAD handoff** (`HND-001`, `conceptualize.cad-handoff/1`): immutable, revision-pinned package with intent,
  components, relationships, interfaces, parameters, envelopes, constraints with coverage, requirement and
  decision links, assumptions, visual references and unresolved items (missing information is listed,
  never invented).

## 4. Concept versus implementation

A ConceptImplementation references artifacts with `ArtifactRef` (contracts §3): requirement UUIDs
(`requirements`), SysML elements `SYS-…` (`sysml`), CAD representations `CAD-…` (`cad`), components and
saved results (`twin`), analysis results through a labelled test adapter (`analysis`), anything else
(`external`). Replacing (`linkArtifact` with `replaces`), unlinking, retiring the implementation or
deleting the CAD model leaves the Concept's identity, revisions and intent unchanged. A server-side
check of existence is deliberately absent (contracts §9): clients check through the owning module.

## 5. Data ownership and database schema

Schema `conceptualize` (migration `0001_initial.sql`): `concepts`, `concept_revisions`,
`concept_statements`, `maturity_events`, `decompositions`, `relationships`, `alternative_sets`,
`alternative_members`, `decisions`, `trade_studies`, `trade_criteria`, `trade_options`, `trade_scores`,
`evidence`, `implementations`, `implementation_concepts`, `implementation_artifacts`,
`realization_requests`, `concept_links`, `explorations`, `audit_events`, `outbox`, `idempotency_keys`,
`key_counters`. Immutable tables have triggers refusing UPDATE/DELETE; foreign keys use ON DELETE
RESTRICT. Platform migration `0002_conceptualize_entitlement.sql` grants `tool:conceptualize`.
Migration `0002_design_knowledge.sql` adds functions, design_constraints, assumptions (each with
revisions), assumption_validations, link_types, design_links, evidence_subjects and evidence_reviews;
`0003_r1_link_vocabulary.sql` adds impact propagation to the link registry (both additive).
`0007_visual_concepts.sql` (additive) adds `concept_revisions.stage` and `.definition`, `visuals`,
`visual_revisions`, `visual_generations`, `visual_annotations`, `handoffs`, and the statement kinds
`benefit` and `trade-off`.

## 6. Public API

HTTP `/api/concepts/v1` (OpenAPI 3.1 at `/openapi.json`, interactive reference at `/docs`), about 50
operations: Concepts (list, create, read by revision, patch, revisions, compare, history, maturity,
verification status, branch, assessment, graph), relationships and decompositions, alternative sets,
decisions (create, record, withdraw), trade studies (create, patch, scores), evidence,
implementations (artifacts link/replace/unlink/repin, realization requests), concept links,
artifact→Concepts lookup, explorations (create, undo), permissions, unit check, project history by
proposal, events; design knowledge (functions, constraints, assumptions, link types, design links,
decision rationale, validity and review flags, evidence reviews, batch, graph traverse, neighbourhood,
paths and search, entity history); visuals (list, create, read by revision, revisions, revise, archive,
annotations, generation record), Concept dependents and revision staleness, concept cards and
alternative-set cards, CAD handoffs (create, list, read). Conventions as Requirements: error body, ETag/If-Match or `expectedRevision`,
`Idempotency-Key`, cursor pagination, RFC 3339 UTC. Provenance headers: `X-Source-Kind`,
`X-Conversation-Id`, `X-Proposal-Id`, `X-Message-Id`.

## 7. Domain events

Transactional outbox, SSE at `/projects/{projectId}/events` with resume (`after`, `Last-Event-ID`) and
`reset`: `concept.created`, `concept.revised`, `concept.relationships-changed`,
`concept.implementation-linked`, `concept.implementation-unlinked`, `concept.selected`,
`concept.superseded`, `concept.decision-recorded`. Trade-study changes use `concept.revised` with the
study ID (change request for a dedicated type).

## 8. AI interaction contracts

- Actions `conceptualize.*` in `packages/tool-conceptualize/src/assistant.ts`: search, read, create,
  develop_alternatives, decompose, compare, propose_decision, link_artifact, propose_requirement,
  request_realization, next_steps; design knowledge (assistantDesign.ts); visual exploration
  (assistantVisual.ts): define_concept, read_visuals, request_illustration, annotate_visual,
  refine_from_annotations, compare_cards, reject_alternative, create_cad_handoff. develop_alternatives records
  the alternatives the model writes (with a definition per alternative and visual requests) and refuses
  without them. Reads return data; changes are SDK 1.5 **service proposals**:
  preview (each item with its basis), user Apply, API call with idempotency key and provenance,
  compensating undo.
- Server rules for `X-Source-Kind: assistant`: only ai-hypothesis, assumption and estimate; no
  confirmation of hypotheses; no verified evidence; no recording of decisions; no approval gates; the
  proposal and conversation must be named.
- Demo planner (`AssistantContribution.demo`, demo only) maps example prompts; the scripted generator
  (`src/ai/generator.ts`) uses a small principle library and computes preliminary estimates with stated
  formulas. It runs only in the demo planner, which turns its output into the arguments a model would
  write (CR-AI-1); a real model's request never gets library content.

## 9. Cross-module traceability and synchronization

- Requirements: concept links pin requirement revisions; the assistant proposes **draft** requirements
  through `services.requirements.create` and links them with *proposes*; approval stays in Requirements.
- SysML and CAD: implementation artifacts by twin ID, pinned to the model revision.
- CAD generation: recorded realization request (no CAD API); fulfilled by linking the resulting artifact.
- Analysis: labelled test-adapter references only (no Analysis module).
- Synchronization rule: changes in implementations never modify Concepts. The Integration page shows
  stale (newer revision) and broken (missing) references as notifications; *Accept revision* repins
  after review (recorded). v1 checks run in the client; a server resolver is a later contract change.

## 10. Lifecycle semantics

Maturity: idea, exploring, defined, evaluated, selected, engineering-development, implemented,
verified, superseded, archived; any transition except: entering selected and later stages, and
superseding/archiving such Concepts, need reviewer or administrator; implemented needs an implemented
implementation; verified needs verification status verified (which needs verified evidence).
Implementation status is derived; verification status is recorded separately. The assessment endpoint
gives a deterministic checklist, suggested maturity and next steps.

## 11. UI architecture

`ConceptualizeView` (API mode) with pages Explorer (tree/graph + Concept Workspace), Alternatives,
Integration, AI collaboration; demo mode shows the SDK read subset. Data through `ModuleDataProvider`
(module client, permissions, event-driven reload). Design system components only, tokens, container
queries, keyboard-operable tree and graph. No CAD or SysML editor.

## 12. Extension mechanisms

Statement kinds, relationship types, criterion categories, evidence kinds and artifact modules are
vocabularies in `domain/rules.ts` plus check constraints (additive migrations). Attributes are open
key → quantity maps. New assistant operations are actions in the tool package. The design-reasoning
layer (separate brief) is expected to add entities (Function, DesignExploration, conceptual
constraints, decision invalidation conditions, graph queries) additively.

## 13. Testing strategy

- Unit (`npm test`): units and dimensions, cycles, maturity rules, trade-study evaluation, assessment,
  natural-language drafts, demo planner, generator, service proposals (fake fetch), demo adapter
  contract suite.
- Real PostgreSQL (`npm run concept:test:db`, also in `npm run req:test:db`): API behaviour, revisions,
  conflicts, idempotency, permissions and approval gates, assistant restrictions, explorations and
  undo, implementations and identity preservation, events, OpenAPI conformance of responses, HTTP
  adapter contract suite (also as a SysML/CAD-only user).
- Browser flows (Playwright, outside the repository): the vertical slice in the workspace and the
  harness in API and demo modes.

# ECII: architecture and Phase 1 plan

Status: **accepted by the coordinator** (16 October 2026), implementing the owner's [ECII brief](ecii-brief.md). Produced by the
ECII Architect (read-only, main 185f451) with the [practice research](../research/ecii/engineering-practice.md). The owner asked for
everything to proceed automatically; owner-level choices below are recorded defaults the owner may change.

## 1. Root cause of the drill-bit holder behaviour (from code and fixtures; no failing live transcript exists yet)

1. **Instructions.** `services/assistant/src/wire.ts:103-122` never asks whether the design object is standalone or integrates with
   an existing system, which systems are involved or what must be investigated; line 112 says to proceed with a stated assumption
   instead of asking, and there is no research tool.
2. **Schema.** Concept interfaces may only join a Concept's own components (`services/conceptualize/src/domain/definition.ts`), so a
   host can only appear as an invented component (contrary to "no second component"); `interfaces-with` is Function to Function
   only; concept relationships join Concepts only; product elements have no designed-versus-existing distinction; documents carry
   no source, retrieval date or usage terms; "interface" exists only as a free-text statement kind.
3. **Creation.** `conceptualize.create` records the caller's statements verbatim (CR-AI-1, correct), so the interpretation exists
   only in the prompt and the model; nothing structured asks what the design integrates with, and nothing can be inspected later.
4. **Alternatives.** `develop_alternatives` requires parameters and a dimensioned 2D layout, has no host interface, attachment
   principle, load path or evidence fields and no diversity check; the D1 script's alternatives are retention variants of one block.
5. **D1 itself fixes the architecture.** D1 §1 defines "a small block ... mounting holes"; the live-run guide asks for
   "mounting-hole spacing" and "layout alternatives"; the plumbing script assumes "two holes 25 mm apart". The only artifact D1
   engineers is the pocket pattern.

## 2. Architecture (domain-independent; no new database; no keyword rules)

ECII is a capability across existing modules. The context graph is a federated view over the Conceptualize design graph (ADR-0041
`traverse`) and the Projects artifact registry, product registry and links.

| Brief entity | Home |
| --- | --- |
| Engineering intent | Conceptualize, new revisioned type (`INT-`) |
| Product, host, external system, subsystem | Projects product elements with new `origin` (designed, existing, purchased) and `identification` (manufacturer, model, revision) |
| Is part of | product breakdowns |
| Function, constraint, assumption, evidence, concept | existing Conceptualize types |
| Interface | Conceptualize, new revisioned type (`IFC-`), project-level, registered in the artifact registry as kind `interface`; ends are `ArtifactRef`s (option B, ownership by the product registry, recorded in the ADR) |
| Fact (value with status) | Conceptualize, new revisioned type, per attribute |
| Reference document or image | Projects documents plus new `document_sources` (URL, publisher, retrieval date, identifiers, usage terms, view kind) |
| Unknown | a fact with status `unknown` |
| Research task, verification activity | Projects work items (`details.ecii`); Requirements verification later |

Relationships: integrates-with, mounts-to, connects-to and interferes-with are the interface's `relation` (the interface is the
edge); constrains, performs, depends-on, derived-from and supported-by are existing Conceptualize link types; requires-verification
is `verified-by` plus the readiness gate. Interface definition, candidate interface requirement and verification activity stay
separate (practice research).

- **Evidence model.** Fact statuses: verified, documented, derived, estimated, assumed, unknown, conflicting. Sources (pinned
  document version plus locator) are kept apart from the AI's interpretation. Rules: the AI never writes `verified`; `documented`
  needs a source; `derived` takes the weakest status of its inputs; `conflicting` is computed when active facts disagree beyond
  tolerance and stays until a resolution is recorded; a status change is a new revision with a reason (no silent promotion).
  Adds `documented` to the ADR-0043 basis ladder. Unknown and estimated or assumed facts are open items (TBD and TBR analogues)
  with owner, route and due date. The far side of an interface has an owner: project, external or shared.
- **Research plan.** Items with tier 1-4 (essential, concept, detail, immaterial), question, target facts, source kinds and status;
  budget reuses `RunBudget` with depth none, essential, concept or full (default essential; tier 4 never researched). Standalone
  intents produce no host research.
- **Readiness gate.** Deterministic, per downstream activity: architecture concepts need Exploratory; host-specific concepts need
  Context Established (hosts identified, candidate interfaces typed); dimensioned design and CAD handoff need Interfaces Verified
  (critical facts verified, none conflicting). Phase 1: advisory, labels proposals "provisional" and lists unmet items in previews
  and `create_cad_handoff` gaps.
- **Clarification.** Intent questions carry impact, reason and options (continue generically, identify host, upload, measure); the
  reply sets `clarification`. Instructions: interpret intent first, research before asking, never fabricate interface values.
- **Architecture-first generation.** `develop_alternatives` gains `level` (architecture or variant) and an architecture block (host
  interface, attachment principle, load path, installation and removal, advantages, disadvantages, risks, assumptions, evidence
  required); variants name a parent architecture; `assess_diversity` compares structured fields and reports parameter-only
  differences as variants.
- **Design Reasoning.** Decisions supported-by facts and evidence and depends-on interfaces and assumptions; rationale gains rejected
  alternatives and reconsider-if triggers; change impact follows interface and fact revisions to concepts, requirements, System
  Model and CAD references.

## 3. Operations (proposal-preview policy unchanged)

| Owner | Operation | Class |
| --- | --- | --- |
| Conceptualize | `interpret_intent`, `plan_research`, `define_interface`, `record_fact`, extended `develop_alternatives` | propose |
| Conceptualize | `read_context` | read |
| Conceptualize | `identify_gaps`, `evaluate_readiness`, `assess_diversity` | calculate |
| Projects | `add_reference`; `create_product_element` gains `origin` | propose |
| AI connection | `research.search_sources`, `research.retrieve_reference` | new class `research` (increment 4) |

Research results are data; storing a reference is a separate proposal. Capability entries: `conceptualize.context`, `.interfaces`,
`.readiness`, `.architectures`; `projects.references`; `research.web` and image analysis registered as **planned**. SDK additions
(additive, a later minor version after 1.14: `research` operation class, `factStatus` on proposal items, `ConceptsService`
interface reads) are needed only from increment 4. No `ARTIFACT_OWNER` or `DELEGATIONS` change in Phase 1.

## 4. Increments (one implementer each)

1. **Intent and clarification** (Tests A1-A5, D1-D2): intent type and operations, `read_context`, `identify_gaps`; about six generic
   instruction lines in `wire.ts` replacing the "proceed with an assumption" bias; fake scripts `ecii-a.json`, `ecii-d.json`;
   PostgreSQL tests for structure validation and "standalone gives no research items"; a test that ECII product code contains no
   domain words.
2. **Architecture-first and readiness** (A6-A8, D3; §19 items 7 and 9): architecture block, `assess_diversity`, `evaluate_readiness`,
   provisional labelling in `create_cad_handoff`; Test E scripts (sensor bracket on a machine; cooling fan in an enclosure).
3. **Interfaces, facts and references** (Test C; §19 items 4, 5 and 8): `define_interface`, `record_fact` with the status rules,
   product element `origin`, `document_sources`, image documents; fixture with photographs but no dimensions.
4. **Research with a controlled fixture, then E** (Tests B and E; §19 items 3 and 11): `ResearchSource` port with a `fixture` adapter
   (fictional "DX-12" drill, synthetic manual pages, self-made front, side and isometric images) and a `project` adapter; budget;
   rationale and impact links. Live web search after AI infrastructure increments A and C (gateway, metering).

Determinism: fake-provider replays prove schemas, gating, refusals and statuses, not reasoning quality; reasoning quality is a live
evaluation of Tests A-E against a rubric, with recorded transcripts becoming replay scripts.

## 5. D1 (coordinator defaults under "do everything automatically")

- **D1-a, adopted:** add intent and architecture steps to `d1-plumbing.json`, and change `d1-live-run.md` steps 2 and 5 from
  "mounting-hole spacing" and "layout alternatives" to "identify the host and mounting architectures, then layout".
- **D1-b, adopted:** keep the bolted-block CAD as the selected architecture, labelled provisional with readiness Exploratory.
- All changes are additive; `demo-d1` stays green.

## 6. Ownership, documents and ADRs

ECII implementer per increment with path grants in module files (pattern of conceptualize-contracts §2), reviewed per module;
Conceptualize (intent, interfaces, facts, plans, readiness, diversity, UI panel in the Conceptualize workspace, help), Projects
(`origin`, `document_sources`, `add_reference`), AI connection (instructions, research port and adapters, metering), Requirements
(interface requirement drafts through `propose_requirement`), System Model (`InterfaceLink` metadata, Phase 2), CAD (interfaces and
keep-outs through the SDK, Phase 2), coordinator (SDK, ADRs, merges).

Documents: `docs/modules/engineering-context.md` (architecture, context graph, readiness, UI), `docs/specifications/ecii-contracts.md`
(interface model, API contracts, test strategy), `docs/modules/ai-interface/research.md`, updates to Conceptualize, Projects and
design-reasoning docs, `docs/roadmap.md`, `ecii-progress.md`. ADRs: **0081** placement, federated graph, interface ownership,
product `origin`; **0082** fact statuses and the `documented` basis (amends 0043); **0083** research class, port, budget, metering
and licensing (open-source evaluation: provider web search, SearXNG (AGPL, needs approval), Brave or Tavily APIs; Docling, Apache
Tika, pdf.js; PROV-O as vocabulary); **0084** readiness gate and architecture-first generation.

## 7. Risks

Live research depends on AI infrastructure increments A and C. Licensing: store metadata, links and short locators by default, bytes
only for user uploads or permitted terms, never train on retrieved material, use fictional brands in fixtures. ADR-0070: no
standard-specific gates; readiness generic and per activity. Image analysis is Phase 2. Readiness is advisory in Phase 1.

## Amendment 1 (16 October 2026): refinements after the practice research

From the ECII architect's second report (after [engineering-practice.md](../research/ecii/engineering-practice.md)); adopted:
- Intent integration modes `standalone | hosted | embedded | connected | replacement | undetermined` with a rationale; rules key
  off structure (mode not standalone), never nouns.
- External systems carry an owner (project, external, shared) and an identified flag; a host appears once, as an existing product
  element; concept definition components may carry `represents: ArtifactRef` (no second component).
- Information needs replace free-text investigations: tier 1-4 and route (research, ask-user, measure, defer), open or resolved.
  Only tier-1 research needs are researched automatically; questions are asked only for tier-1 ask-user needs, ranked by impact
  (blocks, changes-architecture, refines).
- Evidence is per attribute as claims (value, unit, tolerance, datum, method, status, pinned source and locator, inputs), with the
  interpretation stored separately; `conflicting` is computed and all claims kept; evidence status, interface review state
  (candidate, proposed, confirmed, rejected, superseded), verification and evidence currency are four separate axes (ADR-0070).
- Readiness criteria are data keyed by activity and overridable per project or later assurance profile; the result lists the
  blocking items.
- Interface ownership option A (Conceptualize, own tables and route group so it can move later) recorded with options B (new
  service) and C (product registry) in ADR-0081.
- ADR numbering: 0081 placement and graph projection; 0082 interface definition, attribute claims, seven statuses, open items
  (amends 0043); 0083 readiness criteria as data and architecture-first generation; 0084 research operations, research class,
  source rights, recorded-fixture adapter.
- D1 §1 wording ("a small block with mounting holes" as one candidate architecture rather than the problem statement) is an
  **owner decision**, not adopted; D1-a (intent step and live-run wording) proceeds.

## Amendment 2 (16 October 2026): Context Engineering Layer (owner augmentation)

Implements the [context engineering brief](ecii-context-engineering-brief.md) after the §15 architecture review (architect, read-only,
main 372dea4); accepted by the coordinator.

- **Overlap.** ECII already covers intent, information needs, fact statuses, readiness, architecture-first and diversity; ECII-1 provides
  the nucleus of the Conceptualize selector and the grounding instructions. Design Reasoning core already has `ContextManifest` and
  `ContextManifestItem`, `ReasoningRun`, `RunBudget`, `ToolInvocation.manifestId`, `assessChangeImpact` and `explainSelection`; these are
  reused (ADR-0045: no provider in the engine). New: the package contract, per-operation selection with mandatory-first packing,
  server-side injection, snapshot persistence, evaluation findings, the inspector and the benchmark.
- **Ownership (one owner per interface).** SDK types: coordinator. Selectors: each module serves one read operation `selectContext`
  declared in its `ServerModuleDescriptor` (Conceptualize and Projects in P0; Requirements, System Model and CAD in P1). Assembler,
  snapshots and the `context.assemble` / `context.retrieve` read operation: AI connection (`services/assistant/src/context/`), calling
  selectors in-process through the existing `ModuleCaller` as the signed-in person (module permissions and project scope apply; §13).
  Provider translation: AI connection (increment B adapters). Evaluation policy and finding schema: Design Reasoning. Deterministic
  checks: owning modules. Refinement controller: AI orchestrator (increment C). Inspector: design system. Benchmark: ECII (absorbs
  AI-P2-6). Not a second gateway (model calls only through `gateway.call`) and not a second database (references only).
- **Package.** An execution snapshot of `ArtifactRef`s with exact revisions plus bounded projections (quantities with unit, tolerance
  and datum, or summaries up to 2,000 characters; never document bytes). Immutable `assistant.context_snapshots`;
  `proposals.context_id` and `usage_events.context_id` give the chain artifact → proposal → snapshot. Stale items are flagged, not
  rewritten. Budget: the smaller of setting `ai.context.maxTokens` (12,000) and a quarter of the model's context limit; at most 400
  items and 256 KB per snapshot. Mandatory items (safety-relevant constraints, critical interfaces, material unknowns) are never
  dropped or summarised; if they alone exceed the budget the package is marked `overBudget`; numbers are never compressed.
- **Path to the model.** Assembled on the server (the browser sends only `turn.task`: operation and target refs). A standing digest each
  turn (active intent, hosts, interfaces, readiness) gives reuse across follow-up requests; `context.assemble` / `context.retrieve` for
  targeted retrieval. Injection as a neutral `RespondInput.context` field (blocks with trust `platform-data` or `external-data`),
  translated per provider (Anthropic system block with caching, OpenAI developer message, Gemini system instruction); the fake provider
  ignores it, so D1 replays are unaffected. Ledger rows carry `workflow_id` (task run), `context_id` and operation IDs for
  summarisation and advisory evaluation.
- **Evaluation.** Deterministic checks reused from modules (`resolveArtifacts`, `assess_diversity`, `evaluate_readiness`, constraint
  bounds and `compare`, `cad-modeler.check`, units, `next_steps`, "every numeric interface value has a source or is labelled assumed or
  estimated"); AI-advisory checks by a lower-cost model, labelled advisory and never called validation. Findings in
  `assistant.evaluation_findings` keyed by context and proposal; module evidence only through applied proposals.
- **Design Reasoning reuse.** The snapshot item is the `ContextManifestItem` (shape promoted to the SDK, aliased in DR core); refinement
  budget extends `RunBudget` additively (iterations, model calls, cost); reassessment after a host change uses `assessChangeImpact`.
  Boundary change: `services/assistant` may import `@ews/design-reasoning-core` (boundaries test updated).
- **Inspector.** In the assistant panel's existing Context tab: a per-message chip ("CTX-... · Established · 14 items · 2 unknown")
  opening collapsible sections (objective, systems, interfaces, requirements and constraints, evidence, assumptions, unknowns,
  readiness, model, evaluation) with stable-ID references and status badges; "Correct interpretation" opens an intent revision
  proposal; planned controls muted (mark evidence inappropriate, re-run with fresh context, compare snapshots).
- **Measurement.** Cost per task from the ledger grouped by `workflow_id`, headline cost per acceptable outcome. Benchmark in
  `tests/benchmarks/context-engineering/` (cases A-E and the four-request reuse sequence, DX-12 fixture with ground truth, rubric of
  the brief §11 metrics, runner `scripts/bench-context.mjs`); replay mode in CI (deterministic metrics only); live mode only with
  `*_LIVE_TEST_KEY` variables, never connection records or the ChatGPT sign-in, five repetitions per arm; run records with model,
  pricing version, instruction and tool digests, snapshot IDs, outputs and scores; blinded A/B export. Baseline from a worktree pinned
  at 372dea4 (before ECII); without an owner key only the replay baseline is recorded and "live: not run". No improvement is claimed
  until a recorded live run shows it.
- **Order (at most two heavy implementers at once; D1 replays and `demo-d1` gate every merge).** (1) ECII-1 (running); (2) AI-C gateway,
  orchestrator, developer mode, `RespondInput.context`, ledger `context_id` (after AI-A merges); (3) CE-0 ADRs and SDK 1.15 types (after
  SDK 1.14 merges); (4) baseline capture; (5) ECII-2; (6) CE-1 selectors, assembler, snapshots, digest, `context.assemble`; (7) CE-2
  basic evaluation; (8) ECII-3; (9) AI-B adapters with context translation; (10) CE-3 drill regression and reuse sequence (replay);
  (11) ECII-4 research with the DX-12 fixture, then live; (12) AI-D UI with the CE-4 inspector; (13) CE-5 other selectors, automated
  refinement, impact flags, cross-provider benchmark. Injection behind setting `ai.context.mode = off | digest | full`, default `off`
  until CE-1 passes D1.
- **ADRs.** 0085 context package, module selectors and server assembly (open-source evaluation: LlamaIndex, LangChain, Haystack, DSPy;
  proposed none, since they bring embedding stores; pgvector a P2 candidate); 0086 evaluation findings, refinement budgets and the
  assistant to Design Reasoning boundary; 0087 benchmark and live-key policy (harness candidates promptfoo, Inspect AI, DeepEval).
  Licences to verify in each ADR.

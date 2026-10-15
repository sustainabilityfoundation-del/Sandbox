# Design Reasoning Layer: architecture set

Status: **Proposed** (phase A, 14 October 2026), for coordinator review. Nothing in this set is
implemented. Brief: [design-reasoning.md](../../specifications/design-reasoning.md). Governance and
review gate: [design-reasoning-governance.md](../../specifications/design-reasoning-governance.md).
Progress and the §16 report: [design-reasoning-progress.md](../../specifications/design-reasoning-progress.md).

## In one paragraph

The reasoning layer is **not a new knowledge store**. Durable design knowledge (functions, concepts,
alternatives, decisions, assumptions, evidence, constraints, explorations, calculation models and
their typed links) lives in **Conceptualize**, extended through numbered contract change requests.
A new **Design Reasoning Engine** (`services/design-reasoning`) owns only operational state: runs,
plans, tool invocations, budgets, checkpoints, the record of context used, and draft proposals before
Apply. It reads authoritative data through module APIs, runs **deterministic tools** (a calculation
engine built on mathjs and the platform's unit algebra, trade-study evaluation, impact traversal), and
turns results into **previewed service proposals** that the user applies through the AI Interface.
Language models are reached only through the AI Interface; the engine never calls a provider itself.

## Documents (brief §13 deliverables A–J)

| # | Document | Content |
| --- | --- | --- |
| A | [overview.md](overview.md) | Responsibilities, boundaries, services, data flows, the problem/solution/implementation distinction |
| B | [domain-model.md](domain-model.md) | Entities, relationships, invariants, lifecycles, ownership; mapping to today's Conceptualize model |
| C | [knowledge-representation.md](knowledge-representation.md) | Relational schema, typed links, graph traversal API, retrieval, extension strategy, derived matrices |
| D | [reasoning-orchestration.md](reasoning-orchestration.md) | Context resolver, planner, tool orchestrator, evidence evaluator, impact analyzer, proposals; runs, budgets, checkpoints |
| E | [integration.md](integration.md) | APIs, events, contracts and data ownership across modules |
| E | [formalization.md](formalization.md) | Conceptual-to-formal transition (brief §7): synchronization, conflicts, traceability |
| E | [ai-tools.md](ai-tools.md) | Typed, provider-independent tool schemas (brief §10) |
| E | [user-experience.md](user-experience.md) | UI integration (brief §11): views, explainability, the five questions and their API calls |
| F | [mathematics.md](mathematics.md) | Expression representation, units, solvers, validation, evidence; math technology recommendation |
| G | [exploration.md](exploration.md) | Branching, alternatives, trade studies, iterative evaluation, convergence; the 20 % mass scenario |
| H | [governance-security.md](governance-security.md) | Authorization, provenance, audit, approvals, model independence, untrusted content |
| I | ADRs [0039](../../decisions/0039-design-reasoning-engine-boundary.md)–[0046](../../decisions/0046-change-impact-and-invalidation.md) | Proposed decisions (list below) |
| J | [roadmap.md](roadmap.md) | Phases, milestones, dependencies, acceptance criteria, risks; the validation prototype plan |
| — | [contract-change-requests.md](contract-change-requests.md) | Numbered change requests to Conceptualize, the SDK, the AI Interface and the platform, with migrations |
| — | [research note](../../research/design-reasoning/research-note.md) | Sources read (and not read), what was adopted and what was left out |

## Proposed ADRs

| ADR | Decision |
| --- | --- |
| [0039](../../decisions/0039-design-reasoning-engine-boundary.md) | Design Reasoning Engine as a separate service owning only operational state |
| [0040](../../decisions/0040-conceptualize-design-knowledge-extension.md) | Extend Conceptualize with first-class Function, Constraint, Assumption, DesignExploration and typed design links |
| [0041](../../decisions/0041-relational-knowledge-and-graph-api.md) | Relational knowledge with a persistence-independent graph API; no graph or vector database |
| [0042](../../decisions/0042-declarative-service-proposals.md) | Declarative (serializable) service proposals applied by the platform |
| [0043](../../decisions/0043-basis-of-knowledge-and-promotion.md) | Basis-of-knowledge ladder and promotion rules |
| [0044](../../decisions/0044-calculation-models-and-math-stack.md) | Calculation models in Conceptualize, a deterministic calculation engine on mathjs and the platform unit algebra |
| [0045](../../decisions/0045-reasoning-runs-and-model-access.md) | Reasoning runs: model access through the AI Interface, budgets, checkpoints, reproducibility, no chain-of-thought |
| [0046](../../decisions/0046-change-impact-and-invalidation.md) | Change impact distinguishes possible from demonstrated; invalidation is flagged, never silent |

## Reading order

New to the layer: overview → domain-model → contract-change-requests → roadmap. Implementing the
engine: reasoning-orchestration, ai-tools, mathematics, governance-security. Implementing
Conceptualize changes: domain-model, knowledge-representation, contract-change-requests, formalization.

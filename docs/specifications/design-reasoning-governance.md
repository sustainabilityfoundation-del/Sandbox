# Design Reasoning Layer: governance, boundaries and review gate

Status: agreed by the coordinator, 14 October 2026, before delegation. Brief:
[design-reasoning.md](design-reasoning.md).

## 1. Phases and gates

| Phase | Agent may | Gate |
| --- | --- | --- |
| A. Inspection and architecture | Write architecture documents and **proposed** ADRs on its branch; no production code | Agent reports; **coordinator reviews and approves or requests changes** |
| B. Validation prototype (brief §14) | Implement only what the approved architecture specifies, in its own packages | Coordinator integration review before any merge into `main` |

The agent stops after phase A and hands over. It continues with phase B only after an explicit approval
message from the coordinator.

## 2. Relationship to the Conceptualize module (most important constraint)

Conceptualize is being implemented now by its own agent (branch `feature/conceptualize`; brief
`conceptualize.md`, contracts `conceptualize-contracts.md`, ADR-0015). It already owns Concepts,
revisions, typed relationships, alternatives, design decisions, trade studies, assumptions, evidence
records and ConceptImplementations.

- The reasoning architecture **extends** Conceptualize; it does not create a second knowledge store.
  Durable design knowledge (Function, Concept, Alternative, DesignDecision, Assumption, Evidence,
  Constraint, DesignExploration and their relationships) is Conceptualize data.
- Gaps in Conceptualize's model (for example Function as a first-class entity separate from Concept,
  DesignExploration, conceptual Constraint, invalidation conditions on decisions) are written as
  **contract change requests** in the architecture, with migration paths from Conceptualize's model.
  The coordinator decides them and routes them to the Conceptualize agent. The design reasoning agent
  never edits Conceptualize packages.
- The Reasoning Engine owns only its own operational state: reasoning runs, plans, tool invocations,
  budgets, checkpoints, the record of context used per run, and pending proposals before they are
  applied through the owning module's API.

## 3. Other boundaries

- AI interaction and model access stay in the AI Interface (apps/workspace/src/assistant, SDK
  `contract/assistant.ts`): operations are registered actions; changes are **service proposals**
  (SDK 1.5) previewed and applied by the user. No competing chat or provider layer.
- Requirements, SysML, CAD remain authoritative; reached only through their SDK contracts and APIs.
  There is no Analysis module (retired): analysis integration is a labelled test adapter until one exists.
- No new database technology without a demonstrated need (the brief forbids a graph database by
  default). PostgreSQL schemas per service, as for Requirements and Conceptualize.
- Proposed placement (to be confirmed by the architecture): `services/design-reasoning`
  (`@ews/design-reasoning-service`), hosted by `services/api`; a client package only if a browser needs it.

## 4. File ownership (phase A)

| Owner | Paths |
| --- | --- |
| Design reasoning agent | `docs/modules/design-reasoning/**` (architecture set), new ADR files `docs/decisions/0016-*.md` onward with status **Proposed**, `docs/specifications/design-reasoning-progress.md`, research notes in `docs/research/design-reasoning/**` |
| Coordinator | Everything else, including `docs/decisions/README.md`, root `AGENTS.md`, `docs/architecture.md`, `docs/roadmap.md`, all packages and services. The agent writes the exact proposed text for these updates in its progress file; the coordinator applies them on approval |
| Conceptualize agent (not this agent) | `services/conceptualize`, `packages/conceptualize-client`, `packages/tool-conceptualize`, Conceptualize docs |

Phase B ownership is set in the approval message.

## 5. Research

Use authoritative publications, textbooks and standards; record what was read in full versus summaries
or previews, never claim access that was not available, and do not reproduce substantial copyrighted text.
User-supplied PDFs, if any, go to `docs/research/design-reasoning/sources/` (git-ignored).

## Owner decisions

- 15 October 2026: the owner confirmed, for now, the coordinator's answers to phase A questions 5 and 6:
  operational autonomy only (read, calculate, draft; every durable change previewed and applied by a person) and
  2-year, configurable retention of run records. Owner's words: "That sounds like reasonable assumptions for now".

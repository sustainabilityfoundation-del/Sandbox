# UI integration (brief §11)

Status: Proposed. Part of deliverable E. Index: [README.md](README.md).

The reasoning layer adds **no tool tab, no navigation entry and no chat**. Its views live in the
Conceptualize tool (owned by the Conceptualize agent) and in the existing assistant panel (owned by the
platform/AI Interface). This document specifies what each needs and which API answers it; building the
views is the owning agents' work through change requests (CR-C, CR-A4).

## 1. Conceptualize views

| View | Content | Data source |
| --- | --- | --- |
| **Function tree** | Functions with decomposition, flows, objectives, constraints, performing Concepts per function | `/functions`, `/graph/traverse` (`decomposes-into`, `performs`, `constrains`) |
| **Function–means tree** | Alternating levels: Function → candidate Concepts (selected one marked) → sub-Functions of the selected Concept → … | graph traversal; selection from decision outcomes |
| **Alternative tree** | Per function or parent: alternative sets, members as architectures (concept + decomposition), status, decision links, rejected branches greyed but visible | `/alternative-sets`, `/decisions` |
| **Relationship graph** | Existing Concept graph extended to all design entity types; filters by link type | `/graph/neighbourhood` |
| **Design intent and assumptions** | Statements by kind and basis; Assumption records with validation status and dependents | `/assumptions`, statements |
| **Decision history** | Decisions in time order with supersession chain, validity flag, support/contradiction evidence | `/decisions`, `/decisions/{id}/rationale` |
| **Evidence ladder** | Evidence grouped by basis (hypothesis … verified); manifest drill-down for calculated results ("re-run" button calls the engine replay) | `/evidence` |
| **Trade-study comparison** | Existing side-by-side scores, plus Pareto view (two chosen criteria) with dominated options marked and ranges as whiskers | trade-study result + `reasoning.compare_alternatives` |
| **Traceability** | Requirement → constraint → function → concept → implementation → artifact → verification, both directions; sync states | graph traversal + implementations |
| **Impact view** | Result of an impact assessment: possible vs demonstrated vs checked-unaffected, with paths; actions to draft flags or proposals | `POST /api/reasoning/v1/impact` |

Common UI rules: every item shows its **basis badge** (ADR-0020); AI-originated content is labelled and
"confirm" is an explicit action; rejected alternatives and superseded decisions remain visible.

## 2. Assistant panel additions (AI Interface)

- **Proposal card** (extends today's preview, CR-A4): proposed action, rationale, affected entities (links),
  expected effects, evidence with basis, assumptions, uncertainty (ranges), required approvals, and the
  operations that Apply will perform. Applied cards show committed IDs.
- **Run panel** (collapsible under the message that started it): plan steps with status, tool invocations
  (name, inputs summary, result summary, basis), context used (manifest list with revisions), budget used,
  cancel and resume buttons. No model reasoning text is shown or stored; justifications are.
- **Suggested next steps** from the plan's open unknowns.

## 3. The five questions

| User asks | Operations (no model needed unless noted) | Answer composed from |
| --- | --- | --- |
| "Why was this design selected?" | `GET /api/reasoning/v1/rationale?ref=CON-…` (or `reasoning.retrieve_design_rationale`) → Conceptualize decision(s) with `selected-through`, trade-study result, support evidence, assumptions, constraints, validity | Recorded decision rationale verbatim, criteria and scores with bases, evidence list; model only phrases the summary if asked |
| "What alternatives were rejected?" | Alternative sets of the subject's Function(s) → members with `rejected`/`deferred` outcomes and their rationale | Decision outcomes; superseded decisions as history |
| "What would happen if this requirement changed?" | `reasoning.assess_change_impact` with `{ ref: requirement, property, newValue }` (hypothetical) | ImpactReport: formalizing constraints → constraint checks re-evaluated → decisions and implementations, possible vs demonstrated |
| "Which assumptions support this architecture?" | graph traversal from the Concept (and its decomposition) over `depends-on`, decision assumptions, evidence assumptions | Assumption records with validation status and what depends on each |
| "Find a completely different way to perform this function." | `reasoning.retrieve_design_context` (new-principles profile) → **model** generates candidates → `reasoning.propose_solution_concepts` (excludes near-duplicates of existing performers) | Draft alternative set with principles, all `ai-hypothesis`, previewed for Apply |

## 4. Sequence: "What would happen if REQ-001 changed to 15 kN?"

```mermaid
sequenceDiagram
  actor U as Engineer
  participant P as Assistant panel
  participant X as Executor
  participant R as Reasoning API
  participant C as Concepts API
  participant Q as Requirements API
  U->>P: question (REQ-001 attached)
  P->>X: model turn → reasoning.assess_change_impact
  X->>R: POST /impact { ref: REQ-001, property: load, newValue: 15 kN }
  R->>Q: get REQ-001 (revision), traceLinks
  R->>C: graph traverse from constraints that formalize REQ-001
  R->>R: evaluate CALC-001 (Euler buckling) with F = 15 kN
  R-->>X: ImpactReport (CST-001 still satisfied: margin …; DEC-001 checked-unaffected; IMP-001 possible)
  X-->>P: answer + run panel; no proposal needed
```

## 5. Accessibility and platform rules

All views follow the design-system rules in AGENTS.md (React Aria components, tokens, both themes, phone
to desktop, no hover-only actions). Graph views have an equivalent structured list. Every control gets a
help ID; every reasoning operation is mapped in the Conceptualize help manifest and in the capability
inventory (CR-A5).

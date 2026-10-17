# ECII: progress

## Status (one page; kept current by the ECII implementer)

- **State:** increment 1 (engineering intent and clarification) implemented on `feature/ecii-1-intent`, based on main 515cba8; not merged.
- **Done:** `INT-` type and migration 0008; operations `interpret_intent`, `read_context`, `identify_gaps`; artifact kind `intent`; capability entries and help; instruction lines in `wire.ts`; replay scripts `ecii-a.json`, `ecii-d.json`; D1 plumbing script intent step; browser flow `ecii`; PostgreSQL and unit tests including the domain-word isolation test; [engineering-context.md](../modules/engineering-context.md); [ADR-0081](../decisions/0081-ecii-placement-and-interface-ownership.md).
- **Next actions:** increment 2 (architecture-first generation, readiness gate; Tests A6-A8, D3); increment 3 (`IFC-` interfaces, facts, product `origin`, `document_sources`); increment 4 (research port with fixture adapter). A live evaluation of Tests A-E against the rubric is needed; the replay tests do not cover reasoning quality.
- **Blockers:** none. Open points for the coordinator: the conceptualize-service gateway-header addition (`X-Ews-Source`, `X-Ews-Proposal`) is in this branch; the model sees intent validation errors only when the person applies the proposal (no dry-run endpoint yet).
- **Archive:** none yet.

Brief: [ecii-brief.md](ecii-brief.md) (owner; do not edit). Plan (specification): [ecii-plan.md](ecii-plan.md). Architecture: [engineering-context.md](../modules/engineering-context.md). Research: [engineering-practice.md](../research/ecii/engineering-practice.md).

## Increment 1 record

Coordinator refinements adopted (16 October 2026): integration modes `standalone | hosted | embedded | connected | replacement | undetermined` with a rationale; external systems carry `owner` and `identified`; `informationNeeds` replace free-text investigations (tier 1-4, route, state); question impact `blocks | changes-architecture | refines`, state `open | answered | withdrawn`. D1: intent step only in the plumbing script and the wording of `d1-live-run.md` steps 2 and 5; D1 §1 in `demo-ai-engineering.md` is unchanged (owner decision).

Decisions made in the implementation:

- Questions may name the gap they cover with `needId`: an information need ID or a structural gap ID (`integration`, `systems`, `system-<n>`). An essential gap routed to the person with no open question naming it is reported as `unaskedEssential`.
- Gaps come only from structure and information needs; open questions do not create gaps of their own (they answer gaps).
- `interpret_intent` is a declarative proposal (platform gateway); Conceptualize accepts the gateway provenance headers like the CAD service.
- `read_context` returns the project's non-archived concepts (first 100), all constraints, the intent's assumptions and its open questions.
- The intent is not a `DesignEntityType` yet (no design links to intents in this increment).

## Verification

Recorded with the commit in the report of the implementer (commands and results).

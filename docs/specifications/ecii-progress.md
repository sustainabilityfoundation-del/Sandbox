# ECII: progress

## Status (one page; kept current by the ECII implementer)

- **State:** increment 1 is on main. Increment 2 (architecture-first and readiness) implemented on `feature/ecii-2-architecture` (from main 4764ff3); not merged.
- **Increment 2 done:** architecture block in the Concept definition (no migration); `develop_alternatives` `level`; operations `assess_diversity` and `evaluate_readiness` (calculate); provisional labelling in previews and `create_cad_handoff`; scripts `ecii-e-sensor`, `ecii-e-fan`, A6-A8 in `ecii-a`, D3 in `ecii-d`, D1-a/D1-b steps in `d1-plumbing`; [ADR-0083](../decisions/0083-architecture-first-and-readiness-criteria.md) (open-source paragraph included: none suitable found).
- **Done:** `INT-` type and migration 0008; operations `interpret_intent`, `read_context`, `identify_gaps`; artifact kind `intent`; capability entries and help; instruction lines in `wire.ts`; replay scripts `ecii-a.json`, `ecii-d.json`; D1 plumbing script intent step; browser flow `ecii`; PostgreSQL and unit tests including the domain-word isolation test; [engineering-context.md](../modules/engineering-context.md); [ADR-0081](../decisions/0081-ecii-placement-and-interface-ownership.md).
- **Next actions:** increment 3 (`IFC-` interfaces, facts, product `origin`, `document_sources`); increment 4 (research port with fixture adapter). A live evaluation of Tests A-E against the rubric is needed; the replay tests do not cover reasoning quality.
- **CE-1 (context assembly, P0):** implemented on `feature/ce-1-context-assembly`; not merged. See the CE-1 record below.
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

## Increment 2 record

Decisions: numbered ADR-0083 (plan reservation) instead of the next free 0082; `provisional` means below Interfaces Verified or gate unmet (Exploratory permits provisional concepts); a design that works alone has nothing to verify and reaches Interfaces Verified; with another system it cannot until increment 3 supplies facts; with no intent readiness is not assessed (handoff carries `assessed: false`, no unresolved entry). Open: the model sees architecture validation errors only at Apply (no dry run); readiness criteria have no per-project override yet; diversity is wording-based. Live evaluation of A-E is still needed.

## CE-1 record (context assembly; Amendment 2 order item 6)

Branch `feature/ce-1-context-assembly` (from main 20a1e56); not merged. Behind `ai.context.mode = off | digest | full`, default **off**; D1 replays and the fake provider are unchanged (the fake ignores context).

- **Selectors** (`selectContext`, POST `<basePath>/projects/{projectId}/select-context`, declared in each `ServerModuleDescriptor`): Conceptualize and Projects (`store/contextSelect.ts` in each). Items are references with exact revisions plus bounded projections (quantities with unit, tolerance and datum; summaries cut at 2,000 characters; never bytes). Mandatory: hard constraints in force (Conceptualize has no separate safety flag, so `strength = hard` and `status = active` is the proxy), interfaces whose parameters are checked by such a constraint, interface-kind hard constraints, open essential (tier 1) information needs and open blocking questions. The Conceptualize selector needs the `tool:conceptualize` entitlement (not cross-module), so a person without it gets `not-authorized`.
- **Assembler** (`services/assistant/src/context/`): `pack.ts` (dedupe by Design Reasoning `refKey` plus kind and fields; mandatory first, then rank; 400 items, 256 KB and the token budget; `overBudget` instead of dropping), `render.ts` (stable cacheable digest block; `ctx-detail`; `ctx-external` for project documents, labelled untrusted), `store.ts` (identical content reuses the stored snapshot), `assembler.ts`, `manifest.ts` (a snapshot as a Design Reasoning `ContextManifest`). Budget = min(`ai.context.max-tokens`, a quarter of the smallest context limit among the models the request can reach); default 12,000.
- **Persistence:** migration `0005_context_snapshots.sql` (insert-only table with a refuse-change trigger; FK from `proposals.context_id`). `usage_events.context_id` is stamped by the gateway call (no FK: the ledger must always record). Proposals accept `contextId` (the person's own snapshot of the same project, else 422).
- **Operations:** `context.assemble` and `context.retrieve` (HTTP `/api/assistant/v1/context/{assemble,retrieve}`; workspace platform operations; AI module `context`, class read; capability entry `platform.context-package`; help topic `ai.context`; ai-headless example arguments). They work in every context mode: the mode only governs what is added to requests automatically. `/respond` accepts `turn.task` (operation and target refs); the browser does not send it yet.
- **Gateway types:** `ContextBlock` and `ContextBundle` in `providers/types.ts` are the SDK 1.15 types. Boundaries test: `services/assistant` may import `@ews/design-reasoning-core`.
- **Decisions to confirm:** the setting is `ai.context.max-tokens` (the settings registry requires lowercase IDs, so `maxTokens` is refused and the SDK was not touched); the AI module `context` sits in the platform tail of the module order; `context.*` operations are not gated by the mode.
- **Not done (later increments):** Requirements, System Model and CAD selectors (CE-5); evaluation findings (CE-2); the browser sending `turn.task`; the inspector (CE-4); datum is in the type but no Conceptualize record stores one yet.
- **Tests:** unit `services/assistant/src/context/context.test.ts` (packing, budget, mandatory, overBudget, not-authorized, untrusted block, digest stability); DB `services/assistant/test/context.api.test.ts` (selectors, immutability, stale flags, project scoping, `context_id` chain, injection per mode).

## Verification

Recorded with the commit in the report of the implementer (commands and results).

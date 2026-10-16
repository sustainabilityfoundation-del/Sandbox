# AGENTS.md: @ews/design-reasoning-core

Framework-free core of the Design Reasoning Engine. Architecture: [docs/modules/design-reasoning/](../../docs/modules/design-reasoning/README.md)
(ADR-0039…0046). Owner: Design Reasoning agent (phase B ownership, 15 October 2026). Status: validation prototype R1.

## Rules

- Framework-free: no React, no DOM, no Node-only APIs, no database. Imports only `@ews/platform-sdk`
  (and `/testing` in tests and the demo script) and `@ews/engineering-calc` (boundaries.test.ts).
- **No design knowledge is stored here.** Run records (`runs.ts`) are operational. Durable records are
  written only by applying a `ProposalDraft` through the owning module's API, by a person (owner decision:
  operational autonomy only). Never add a code path that writes Conceptualize, Requirements or the twin
  without a draft being applied.
- `contract/conceptualize.ts` is the TypeScript form of the **proposed** Conceptualize contract
  (docs/modules/design-reasoning/contract-change-requests.md). Change the document and this file together;
  the Conceptualize agent implements from the document.
- `adapters/conceptualizeContractAdapter.ts` is a **TEST ADAPTER**: it must keep its label and `mode:
  'test-adapter'`, enforce every invariant the real API must enforce, and never be presented as the module.
- `adapters/conceptualizeHttpAdapter.ts` binds the **real** Conceptualize API (`mode: 'api'`). Its
  `capabilities` say what the service implements today; code checks `knowledge.capabilities` instead of catching
  errors, and every scenario step reports its backing (real service, engine, adapter, fixture). Switch a flag only
  when the service implements it and a probe in `test/scenarios.db.test.ts` shows it.
- Twin values come only from a client-attested snapshot (`sources.ts`), labelled `via: 'client-attested'`.
  Requirements come through the SDK `RequirementsService` subset; fixtures say `mode: 'test-fixture'`.
- Numbers are calculated only by `@ews/engineering-calc`; never compute engineering results ad hoc here.
  Keep the basis ladder (ADR-0043) on every result and draft item.
- **C11 qualifications pass through unchanged** (integration milestone 1): result kinds, bound quality, proven
  statuses with their basis, and the manifest limits go from the engine into drafts, stored evidence, trade-study
  scores and results, Pareto, rationale and impact without rounding or relabelling. A sampled range never supports
  a robust ranking or dominance; impact is `demonstrated` only by a proven violation. Never present a verified
  manifest as model validation or requirement satisfaction.
- Tool definitions (`tools.ts`) are provider-neutral data with closed input schemas; no provider-specific
  fields, no prompts.
- `applyDraftAsUser` emulates the platform executor (CR-A1) for tests and the demo only.

## Commands

```bash
npx vitest run packages/design-reasoning-core
npx tsc -p packages/design-reasoning-core/tsconfig.json
npx tsx packages/design-reasoning-core/scripts/demo.ts     # R1 walkthrough
npm run reasoning:test:db                                   # scenarios + probes on the real APIs (disposable PostgreSQL) and the adapter
```

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
Mathematics and simulation assignment (strategy §10): prefer mature numerical, symbolic, optimization and simulation engines; implement solver-neutral interfaces with explicit unit handling and result provenance.

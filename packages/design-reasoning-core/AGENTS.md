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
- Twin values come only from a client-attested snapshot (`sources.ts`), labelled `via: 'client-attested'`.
  Requirements come through the SDK `RequirementsService` subset; fixtures say `mode: 'test-fixture'`.
- Numbers are calculated only by `@ews/engineering-calc`; never compute engineering results ad hoc here.
  Keep the basis ladder (ADR-0043) on every result and draft item.
- Tool definitions (`tools.ts`) are provider-neutral data with closed input schemas; no provider-specific
  fields, no prompts.
- `applyDraftAsUser` emulates the platform executor (CR-A1) for tests and the demo only.

## Commands

```bash
npx vitest run packages/design-reasoning-core
npx tsc -p packages/design-reasoning-core/tsconfig.json
npx tsx packages/design-reasoning-core/scripts/demo.ts     # R1 walkthrough
```

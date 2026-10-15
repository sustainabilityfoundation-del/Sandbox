# @ews/design-reasoning-core

Framework-free core of the Design Reasoning Engine ([architecture](../../docs/modules/design-reasoning/README.md)).
Status: **validation prototype (R1)**: in memory, against a labelled test adapter of the proposed
Conceptualize contract. Not used by the workspace yet.

| Module | Content |
| --- | --- |
| `refs.ts` | `DesignRef`, extended `ArtifactRef` modules (CR-S1) |
| `linkTypes.ts` | Built-in design link vocabulary with endpoint rules and impact propagation (CR-C4) |
| `contract/conceptualize.ts` | Proposed Conceptualize contract as TypeScript (CR-C1…C10): records, batch operations, graph traversal |
| `adapters/conceptualizeContractAdapter.ts` | **TEST ADAPTER**: in-memory implementation enforcing the contract's invariants |
| `sources.ts` | Client-attested twin snapshot (CR-P1); Requirements reader (SDK subset) |
| `bindings.ts` | Calculation input bindings → engine inputs |
| `engine.ts`, `tools.ts`, `runs.ts` | Tool orchestration for assistant-driven runs; provider-neutral tool schemas; run, invocation and context-manifest records |
| `impact.ts` | Change impact: possible, demonstrated, checked-unaffected (ADR-0046) |
| `compare.ts` | Pareto dominance with interval scores |
| `rationale.ts` | "Why was this selected?" assembled from records |
| `proposals.ts` | Declarative proposal drafts (CR-A1, CR-S4) and the platform-apply emulation |
| `prototype/actuatorScenario.ts` | The R1 mechanical actuator scenario (brief §14) |

Run the walkthrough from the repository root:

```bash
npx tsx packages/design-reasoning-core/scripts/demo.ts
```

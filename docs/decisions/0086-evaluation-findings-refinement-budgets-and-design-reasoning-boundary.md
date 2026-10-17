# ADR-0086: Evaluation findings, refinement budgets and the assistant to Design Reasoning boundary

Status: Proposed (17 October 2026, CE-0 architect; for coordinator acceptance with [ECII plan Amendment 2](../specifications/ecii-plan.md#amendment-2-16-october-2026-context-engineering-layer-owner-augmentation))
Module: Design Reasoning (evaluation policy and finding schema); AI connection (storage); owning modules (deterministic checks); AI orchestrator (refinement controller)

## Context

The [context engineering brief](../specifications/ecii-context-engineering-brief.md) §6-7 asks for an evaluation stage after
generation that separates deterministic validation from AI-assisted assessment, and a controlled refinement loop with iteration,
latency and cost budgets. Design Reasoning core already has `ReasoningRun`, `RunBudget`, `ContextManifest`, `ToolInvocation.manifestId`
and `assessChangeImpact` ([ADR-0039](0039-design-reasoning-engine-boundary.md), ADR-0045: no provider in the engine). A parallel
evaluation engine in the assistant would duplicate it. Open-source evaluation harnesses are assessed in [ADR-0087](0087-benchmark-and-live-key-policy.md);
this ADR defines the runtime records, not the benchmark.

## Decision

1. **Finding schema (SDK 1.15, `EvaluationFinding`).** One finding per check and output: `contextId`, optional `proposalId` and
   `workflowId`, stable `check` ID, `kind` (`deterministic` or `advisory`), `source` (module and operation, or model), `outcome`
   (pass, fail, warning, not-run), `severity`, `message`, `refs`, optional `suggestedAction` (regenerate, retrieve-context,
   investigate-interface, clarify, correct-artifact, record-limitation) and `iteration`. Stored by AI connection in
   `assistant.evaluation_findings`, keyed by context and proposal. Design Reasoning owns the schema's meaning and the evaluation policy.
2. **Deterministic checks are reused from their owners**, never re-implemented in the assistant: `resolveArtifacts` (references
   exist, revisions match), `assess_diversity`, `evaluate_readiness`, constraint bounds and `compare`, `cad-modeler.check`, unit
   consistency, `next_steps`, and "every numeric interface value has a source or is labelled assumed or estimated".
3. **Advisory checks** run on a lower-cost model through `gateway.call`, are labelled advisory everywhere (records, inspector,
   reports) and are never called validation. They cannot create module evidence; module evidence arises only when a person applies a
   proposal, as today.
4. **Refinement budget.** Design Reasoning core's `RunBudget` is extended additively in CE-2 with optional `maxIterations`,
   `maxModelCalls` and `maxCostUsd` (a decimal string per [ADR-0079](0079-usage-ledger-pricing-registry-and-decimal-policy.md));
   `maxWallMs` is the latency budget. P0 allows one refinement iteration (coordinator decision, CE-0 review); exhausting any limit ends the run as
   `budget-exhausted` and records the remaining findings as limitations. Refinement is localised: a finding's `suggestedAction`
   selects a targeted retrieval or correction before any full regeneration. No recursive model calls outside the controller.
   The type stays in DR core, not the SDK, until a second consumer needs it.
5. **Reassessment after change.** When a host or critical interface changes, `assessChangeImpact` flags dependent snapshots and
   artifacts for reassessment (CE-5); stale snapshot items are flagged, not rewritten.
6. **Boundary change.** `services/assistant` may import `@ews/design-reasoning-core` (framework-free; no provider in the engine). In
   `packages/platform-sdk/src/boundaries.test.ts` the row becomes
   `'services/assistant': /^@ews\/(platform-sdk|design-reasoning-core)$/`. The edit lands with the first import in CE-1, so the test
   never allows an unused dependency. Design Reasoning core must not import the assistant (unchanged rule).

## Alternatives considered

- Evaluation inside the assistant only: duplicates DR run and budget records and puts evaluation policy with the provider owner.
- A separate evaluation service: a new deployable for records that are keyed by assistant snapshots and proposals.
- External evaluation frameworks at runtime (DeepEval, promptfoo, Inspect AI; [ADR-0087](0087-benchmark-and-live-key-policy.md)): built
  for offline test suites, not for persisted, per-proposal findings with module-owned deterministic checks; they also bring their
  own model clients.

## Consequences

- SDK 1.15.0 carries `EvaluationFinding`; storage and the controller come in CE-2 (basic evaluation) and CE-5 (automated refinement).
- The boundaries test changes in CE-1; until then `services/assistant` keeps importing only the SDK.
- Inspector (CE-4) shows deterministic and advisory findings separately, with "advisory" on every AI judgment.

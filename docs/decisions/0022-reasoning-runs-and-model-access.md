# ADR-0022: Reasoning runs: model access through the AI Interface, budgets, checkpoints, reproducibility, no chain-of-thought

Status: Proposed (2026-10-14)

## Context

The engine must plan and explain with a language model, run long investigations with budgets, cancellation,
checkpointing and reproducibility, support parallel exploration later, keep ephemeral execution traces separate
from durable knowledge, and stay provider-independent without storing private chain-of-thought. The AI
Interface owns model access and conversation (ADR-0010, ADR-0013 proposed); today the assistant is a scripted
demo and no provider backend exists.

## Decision

- **No provider in the engine.** Phase 2 runs are **assistant-driven**: the AI Interface's conversation model
  calls `reasoning.*` tools; each call is a recorded step of a run. Phase 3 **engine-driven** runs request model
  steps through an AI Interface server-side **model gateway** (CR-A3), which owns providers, credentials, token
  accounting and data routing.
- **Runs** have a plan (validated data, from templates, the model or a person), budgets (steps, tool calls,
  model tokens, wall and compute time, drafts), cancellation, a checkpoint after every step, resume from the last
  checkpoint with re-validation of changed inputs, and replay of deterministic steps with digest comparison.
- **Records kept**: plan revisions, context manifests, tool invocations with versions, model identifiers (opaque),
  explicit justifications and drafts. **Not kept**: model hidden reasoning; conversation transcripts (owned by the
  AI Interface).
- Phase 1–2 execution is in-process with worker threads for calculations; a job queue, separate workers and
  parallel branch runs come with phase 3 under their own decision.

## Consequences

- No competing AI layer; providers stay replaceable; the engine works with a fake provider in tests.
- Phase 3 depends on the AI backend (AI development plan sprint 4) and the gateway.
- Reproducibility is exact for deterministic steps and explicitly not claimed for model steps.
- Alternatives considered: engine calls providers directly (rejected: duplicate credentials, policy and
  provider adapters); storing full prompts and responses as run records (rejected: privacy, size, and they are
  not engineering justification); storing chain-of-thought (rejected by the brief).

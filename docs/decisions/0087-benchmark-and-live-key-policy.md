# ADR-0087: Context engineering benchmark and live-key policy: build, integrate or extend

Status: Proposed (17 October 2026, CE-0 architect; for coordinator acceptance with [ECII plan Amendment 2](../specifications/ecii-plan.md#amendment-2-16-october-2026-context-engineering-layer-owner-augmentation))
Module: ECII (benchmark owner; absorbs AI-P2-6); AI connection (ledger data)

## Capability and requirements

The [context engineering brief](../specifications/ecii-context-engineering-brief.md) §10-11 asks for a repeatable benchmark comparing
raw-prompt and context-enriched generation on the drill-bit holder, with the §11 metrics, reproducible records (model, prompts,
context revisions, outputs, criteria) and blinded human review. Essential requirements: a replay mode with deterministic metrics only,
runnable in CI without keys or network; a live mode with five repetitions per arm; cost per acceptable outcome from the ledger grouped
by `workflow_id`; no improvement claimed until a recorded live run shows it; and no use of the owner's account.

## Candidates considered

Licences verified on 17 October 2026 from package registry metadata (npm `license`, PyPI `license`/`license_expression`); registry
text treated as untrusted data.

| Candidate | Upstream (URL) | Version checked | Licence (verified, with source) | Maturity and activity | Fit |
| --- | --- | --- | --- | --- | --- |
| promptfoo | github.com/promptfoo/promptfoo | 0.124.1 (npm) | MIT (npm `license: MIT`) | Very active; Node CLI | Declarative test cases, assertions, side-by-side comparison, custom JS providers. Closest fit for a Node repository; would call our gateway through a custom provider. Its own provider clients and telemetry must be disabled |
| Inspect AI | github.com/UKGovernmentBEIS/inspect_ai | 0.3.281 (PyPI) | MIT (PyPI `license: MIT License` and OSI classifier) | Active, government-backed | Strong eval framework (tasks, solvers, scorers, logs, viewer). Python only; would need a bridge to our TypeScript gateway |
| DeepEval | github.com/confident-ai/deepeval | 4.3.1 (PyPI) | Apache-2.0 (PyPI `license: Apache-2.0` and classifier) | Active, company-backed (hosted platform is a separate commercial product) | Pytest-style LLM metrics, many model-judged. Python only; its judged metrics are advisory by our definition |
| Internal runner | this repository | main 47f9cda | n/a | Uses the gateway, ledger (ADR-0079), D1 replay fixtures and Vitest | `scripts/bench-context.mjs` plus fixtures: thin, deterministic replay scoring |

## Licence assessment

All candidates are preferred-category (MIT, Apache-2.0). They would be development-time tools only (never shipped). No owner
approval is required. Nothing is added now; adoption of promptfoo would add a devDependency row to `docs/dependencies.md`.

## Integration design

- **Location.** `tests/benchmarks/context-engineering/`: cases A-E, the four-request reuse sequence (brief §8), the DX-12 fixture
  with ground truth, and a rubric of the §11 metrics; runner `scripts/bench-context.mjs`.
- **Replay mode (CI).** Fake provider with recorded outputs; deterministic metrics only (intent and integration recognition against
  ground truth, interface grounding and hallucinated numbers by reference and source checks, constraint coverage, traceability,
  context reuse, tokens). Advisory metrics are skipped in replay.
- **Live mode.** Only with the environment variables `OPENAI_LIVE_TEST_KEY`, `ANTHROPIC_LIVE_TEST_KEY`, `GEMINI_LIVE_TEST_KEY`
  and `XAI_LIVE_TEST_KEY` (coordinator decision, CE-0 review; a new provider adds one name of the same form), read by the runner and passed to the gateway as an ephemeral API-key credential for the run. Never
  connection records from `services/assistant`, never stored credentials, never the ChatGPT sign-in or any OAuth token of the owner.
  The runner refuses to start live mode if no such variable is set and reports "live: not run". Five repetitions per arm.
- **Records.** Each run records model, pricing version, instruction and tool digests, snapshot IDs, outputs and scores; cost per
  task from the ledger grouped by `workflow_id`, headline cost per acceptable outcome. Blinded A/B export for human review
  (arm labels removed, order randomised, key kept separately).
- **Baseline.** From a worktree pinned at 372dea4 (before ECII). Without an owner key only the replay baseline is recorded.
- **Harness.** The internal runner owns the records and the replay mode. promptfoo is the preferred harness to evaluate for live
  comparison and side-by-side review once CE-3 has stable fixtures (custom provider calling the gateway; telemetry and remote
  sharing disabled); Inspect AI is the fallback if a Python bridge becomes acceptable.

## Decision

**Build the thin internal runner and fixtures now; defer adopting a harness to CE-3, with promptfoo as the first candidate.** The
replay mode must reuse the D1 fake provider and the ledger, which no harness provides; the Python candidates would add a second
runtime for one script. Live runs use only `*_LIVE_TEST_KEY` variables.

## Contribution opportunities

None now. Nothing is published or submitted upstream without explicit owner authorization.

## Consequences

- No dependency added in CE-0. No measured improvement may be claimed in UI, docs or reports before a recorded live run.
- Tests never touch the owner's ChatGPT account or saved connections; CI never has live keys.
- Advisory (model-judged) scores are reported as advisory, separately from deterministic metrics.

# AGENTS.md: @ews/engineering-calc

Deterministic calculation engine of the design reasoning layer. Architecture:
[mathematics.md](../../docs/modules/design-reasoning/mathematics.md), [ADR-0044](../../docs/decisions/0044-calculation-models-and-math-stack.md).
Owner: Design Reasoning agent (ownership as set for R1 and R3, 15 October 2026).

## Rules

- **Two entry points.** `.` (`src/index.ts`) is framework-free and portable: no React, no DOM, no Node-only
  APIs; it must run in Node and in the browser. `./node` (`src/node/`) is Node only (worker threads). Never
  import `src/node` from the main entry. Imports: only `@ews/platform-sdk` (framework-free entry) and `mathjs`
  (boundaries.test.ts); `node:*` modules only under `src/node/`.
- **Units come only from the platform unit algebra** (`parseUnit`, `Dims` from `@ews/platform-sdk`).
  Never use mathjs units, `createUnit` or unit strings inside expressions.
- mathjs is used **only to parse** (instance from `parseDependencies`). Evaluation, interval arithmetic and
  derivatives work on the engine's whitelisted canonical AST. Adding a function or node type is a grammar
  change: bump `GRAMMAR` (`ews-expr/2`), keep `ews-expr/1` readable, add dimension, interval and derivative
  rules and tests.
- **Honest bounds.** `bounds.quality = 'exact'` only with proven monotonicity; otherwise `enclosure` with an
  inner bound. A check is `satisfied` only when proven over the whole range. Never weaken this to make a result
  look better.
- **Deterministic and versioned.** No randomness, clock or locale in results. `evaluatedAt`, `durationMs`,
  `operations` stay outside every digest. Changing what goes into the model, input or output digests needs a
  new `manifestVersion` (and keeping the old version verifiable); `src/__fixtures__/manifest-v1.json` must keep
  verifying.
- Every error is a `CalcError` with a code from `ERROR_TAXONOMY`; add a code there (with retryability and tool
  code) before using it.
- Results never claim more than their inputs: keep `calculationBasis` (ADR-0043) in step with the docs.
- **Library entries** (`library.ts`) need validity conditions, source citations (no copied text), limitations
  and reference cases recomputed independently in `library.test.ts`. They stay `ai-hypothesis`/`unvalidated`
  until a person validates them; never mark an agent-written relation validated.
- Every numerical behaviour needs a test against an independent reference (hand formula, textbook case).
  Performance thresholds in `perf.test.ts` are guards against order-of-magnitude regressions; do not tighten
  them to the measured value.

## Commands

```bash
npx vitest run packages/engineering-calc
npx tsc -p packages/engineering-calc/tsconfig.json
npx vitest run packages/engineering-calc/src/perf.test.ts --reporter=verbose   # prints measured timings
```

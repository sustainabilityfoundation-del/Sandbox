# AGENTS.md: @ews/engineering-calc

Deterministic calculation engine of the design reasoning layer. Architecture:
[mathematics.md](../../docs/modules/design-reasoning/mathematics.md), [ADR-0044](../../docs/decisions/0044-calculation-models-and-math-stack.md).
Owner: Design Reasoning agent (phase B ownership, 15 October 2026).

## Rules

- Framework-free: no React, no DOM, no Node-only APIs (it must run in Node and in the browser). Imports
  only `@ews/platform-sdk` (framework-free entry) and `mathjs` (boundaries.test.ts).
- **Units come only from the platform unit algebra** (`parseUnit`, `Dims` from `@ews/platform-sdk`).
  Never use mathjs units, `createUnit` or unit strings inside expressions.
- mathjs is used **only to parse**. The instance is created with `parseDependencies`; never call mathjs
  `evaluate`, `compile`, `simplify` or `import` on user text. Evaluation is the interpreter in `evaluate.ts`
  over the whitelisted canonical AST (`ast.ts`). Adding a function or node type is a grammar change: bump
  `GRAMMAR` (`ews-expr/2`), keep `ews-expr/1` readable, and add dimension rules and tests.
- Deterministic: no randomness, clock or locale in results. `evaluatedAt` and `durationMs` are outside
  every digest. Changing what goes into `inputDigest`/`outputDigest` or the model digest breaks verification
  of stored evidence: treat it as a major version change of `ENGINE_VERSION`.
- Results never claim more than their inputs: keep `calculationBasis` (ADR-0043) in step with the docs.
- Every numerical behaviour needs a test against an independent reference (hand formula, textbook case).

## Commands

```bash
npx vitest run packages/engineering-calc
npx tsc -p packages/engineering-calc/tsconfig.json
```

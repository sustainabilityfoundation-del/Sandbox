# AGENTS.md: @ews/cad-core

Framework- and kernel-free core of the CAD Modeler (ADR-0020). Owner: CAD agent. Specifications:
[docs/modules/cad](../../docs/modules/cad/README.md).

## Responsibilities

- Native open model `ews-cad` (types, `schema/ews-cad.schema.json`, validation, serialization).
- Expressions and parameters; sketch constraint solver and profiles (ADR-0025).
- Typed commands (`commands/registry.ts`), transactions, history (undo/redo, operation log),
  catalogue (`commands/catalog.ts`).
- Regeneration engine with content-keyed cache, failure reporting and naming probes (ADR-0024);
  `CadEngine` facade; observability queries.
- The `GeometryKernel` interface (`kernel.ts`), implemented elsewhere.

## Rules

- No imports of React, the DOM, three.js, replicad or any `@ews/*` package (contracts test).
- Deterministic: no clock or randomness in documents or results (except `createDocument`'s UUID).
- Every command: JSON Schema input, preconditions, error codes, undo text; regenerate
  `docs/modules/cad/commands.json` (`npm run cad:commands`).
- Format changes follow ADR-0022 (minor = additive; major = migration + old-format fixture).

## Commands

```bash
npx vitest run packages/cad-core
npm run typecheck -w @ews/cad-core
npm run cad:commands
```

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
CAD assignment (strategy §10): evaluate Open CASCADE, FreeCAD, geometric constraint solvers, meshing libraries and interoperability components; avoid custom geometric kernels or solvers where established alternatives meet requirements.

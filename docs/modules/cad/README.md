# CAD module (CAD program)

Status: Phase 0 complete; Phase 1 vertical slice implemented on `feature/cad`, awaiting coordinator
integration review. Brief: [cad-program.md](../../specifications/cad-program.md). Contracts:
[cad-program-contracts.md](../../specifications/cad-program-contracts.md). Progress and handoff:
[cad-program-progress.md](../../specifications/cad-program-progress.md).

The existing [cad.md](../cad.md) still specifies the **mock** CAD tool (`cad`), which is unchanged.
This folder specifies the new **CAD** (`cad-modeler`).

## Documents (brief §14)

| Deliverable | Document |
| --- | --- |
| CAD architecture specification | [architecture.md](architecture.md) |
| CAD requirements specification | [requirements.md](requirements.md) |
| Competitive research report and feature matrix | [../../research/cad/competitive-feature-matrix.md](../../research/cad/competitive-feature-matrix.md) (sources: [sources-competitive.md](../../research/cad/sources-competitive.md)) |
| Open-source technology survey | [../../research/cad/open-source-survey.md](../../research/cad/open-source-survey.md) |
| Geometric kernel selection report | [kernel-selection.md](kernel-selection.md) |
| CAD native format specification | [native-format.md](native-format.md) and the JSON Schema `packages/cad-core/schema/ews-cad.schema.json` |
| API specification | [api.md](api.md) and the machine-readable catalogue [commands.json](commands.json) |
| AI command specification | [ai-commands.md](ai-commands.md) |
| Interoperability compatibility matrix | [interoperability-matrix.md](interoperability-matrix.md) (research: [../../research/cad/interoperability.md](../../research/cad/interoperability.md)) |
| Testing and validation strategy | [testing-strategy.md](testing-strategy.md) |
| Performance targets and benchmarks | [performance.md](performance.md) |
| Development roadmap | [roadmap.md](roadmap.md) |
| Feature backlog | [backlog.md](backlog.md) |
| Agent development instructions | [agent-instructions.md](agent-instructions.md) and the package `AGENTS.md` files |
| Integration contracts | [integration-contracts.md](integration-contracts.md) |
| User help documentation | `packages/tool-cad-modeler/help/*.md` (20 topics, in the Help Centre) |
| Decisions | ADR-0020 … ADR-0026 (`docs/decisions/00NN-cad-*.md`, Proposed, numbers provisional) |

## Packages

| Package | Role |
| --- | --- |
| `packages/cad-core` | Native model, JSON Schema, expressions, sketch solver, commands, transactions, history, regeneration, queries |
| `packages/cad-kernel` | Open CASCADE (WASM) adapter, Web Worker RPC, STEP inspection, format detection, benchmarks |
| `packages/tool-cad-modeler` | The tool: view, panels, viewport, sketcher, session, assistant, help, harness |

## Commands

```bash
npm run cad:dev        # standalone harness, http://localhost:5198
npm run cad:test       # CAD unit and kernel integration tests
npm run cad:bench      # regeneration benchmarks (Node, in-process kernel)
npm run cad:commands   # regenerate docs/modules/cad/commands.json from the registry
```

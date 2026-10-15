# ADR-0020: CAD Modeler packages, placement and relationship to the mock CAD tool

Status: Proposed (2026-10-14, CAD agent). Number provisional; the coordinator assigns the final number and index entry.

## Context

The owner asked for a professional, AI-native parametric CAD module (brief:
[cad-program.md](../specifications/cad-program.md)). The platform already ships a mock CAD tool
(`packages/tool-cad`, tool ID `cad`) that other modules link to. The agreed contracts
([cad-program-contracts.md](../specifications/cad-program-contracts.md) §1–§2) require a separate
tool `cad-modeler` during Phases 0–1, independently buildable packages, and no heavy geometry on the
UI thread.

## Decision

Three framework-separated packages in the monorepo (ADR-0001):

| Package | Depends on | Role |
| --- | --- | --- |
| `@ews/cad-core` | nothing (no React, no DOM, no kernel) | Native open model and JSON Schema, expression evaluator, sketch constraint solver, profile extraction, typed command registry, transactions, undo/redo, version checks, operation log, dependency graph and incremental regeneration, observability queries, topological naming rules. Talks to geometry only through the `GeometryKernel` interface it defines. |
| `@ews/cad-kernel` | `@ews/cad-core` (types only) | `GeometryKernel` implementation on Open CASCADE Technology (ADR-0021): solids from profiles, booleans, analysis (mass properties, topology counts, validity, face naming probes), tessellation, STEP AP242 export and import, format detection. Runs in a Web Worker in the browser (RPC client included) and in-process in Node for tests. |
| `@ews/tool-cad-modeler` | platform SDK, design system, `cad-core`, `cad-kernel`, three.js | The tool: viewport, feature tree, sketcher, dialogs, inspector; the CAD session shared by the view and the assistant; assistant contribution; help manifest; standalone harness (port 5198). |

- `services/cad` is **not** created in Phase 1. Native models are saved and reopened as open-format
  files (`.ewscad`). Server-side revisions need a platform service contract (`PlatformServices.cad`)
  and are a contract change request in the progress file.
- The mock tool `cad` stays unchanged. Replacing it (retiring `cad`, migrating `cad-representation`
  objects, re-pointing links and the ADR-0006 dimension delegation) is a later coordinator decision,
  to be proposed as its own ADR with a non-destructive migration (ADR-0009).
- A separate repository is not justified yet: the packages share the SDK and test harness and have
  no independent release cadence. Revisit when `cad-kernel` gains a native (C++/Rust) build.

## Consequences

- `cad-core` can be reused headless (scripts, server-side jobs, a future CAD service) with the same
  commands the UI and the assistant use.
- The kernel is replaceable behind one interface (another OCCT build, a native desktop build, or a
  different kernel) without touching features or commands.
- Package boundary rules for the three packages must be added to
  `packages/platform-sdk/src/boundaries.test.ts` by the coordinator; until then `cad-core` carries
  its own boundary test.

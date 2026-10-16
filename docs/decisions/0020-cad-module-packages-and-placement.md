# ADR-0020: CAD Modeler packages, placement and relationship to the mock CAD tool

Status: Accepted (16 October 2026, coordinator, after review against main 186db1c; amendments recorded below)

## Context

The owner asked for a professional, AI-native parametric CAD module (brief:
[cad-program.md](../specifications/cad-program.md)). The platform already ships a mock CAD tool
(`packages/tool-cad`, tool ID `cad`) that other modules link to. The agreed contracts
([cad-program-contracts.md](../specifications/cad-program-contracts.md) §1–§2) require a separate
tool `cad-modeler` during Phases 0–1, independently buildable packages, and no heavy geometry on the
UI thread.

## Decision

Framework-separated packages in the monorepo (ADR-0001):

| Package | Depends on | Role |
| --- | --- | --- |
| `@ews/cad-core` | nothing (no React, no DOM, no kernel) | Native open model and JSON Schema, expression evaluator, sketch constraint solver, profile extraction, typed command registry, transactions, undo/redo, version checks, operation log, dependency graph and incremental regeneration, observability queries, topological naming rules. Talks to geometry only through the `GeometryKernel` interface it defines. |
| `@ews/cad-kernel` | `@ews/cad-core` (types only) | `GeometryKernel` implementation on Open CASCADE Technology (ADR-0021): solids from profiles, booleans, analysis (mass properties, topology counts, validity, face naming probes), tessellation, STEP AP242 export and import, format detection. Runs in a Web Worker in the browser (RPC client included) and in-process in Node for tests. |
| `@ews/cad-client` | `@ews/cad-core`, platform SDK | Client of the CAD document service: `CadClient` over HTTP (`/api/cad/v1`) and an explicit in-browser local adapter, plus a contract test suite. |
| `@ews/tool-cad-modeler` | platform SDK, design system, `cad-core`, `cad-kernel`, three.js | The tool: viewport, feature tree, sketcher, dialogs, inspector; the CAD session shared by the view and the assistant; assistant contribution; help manifest; standalone harness (port 5198). |

- `services/cad` (`@ews/cad-service`, `/api/cad/v1`) and `@ews/cad-client` exist; native models are
  stored as service revisions, with `.ewscad` files as well.
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

## Amendments on acceptance

- Replaced "`services/cad` is not created in Phase 1" with the service and client that exist at 186db1c; native models are stored as service revisions, with `.ewscad` files as well.
- Added `@ews/cad-client` to the package table (and changed "Three" to "Framework-separated" packages).

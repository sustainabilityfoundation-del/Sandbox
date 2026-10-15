# CAD program: agreed contracts, ownership and governance

Status: agreed by the coordinator, 14 October 2026, before delegation. Brief: [cad-program.md](cad-program.md).
Progress: [cad-program-progress.md](cad-program-progress.md).

## 1. Relationship to the existing CAD tool (most important constraint)

The platform already has a **mock** CAD tool, `packages/tool-cad` (tool ID `cad`, entitlement `tool:cad`):
a drawing of the actuator driven by twin `cad-representation` objects, with the documented
CAD → component dimension delegation (ADR-0006), assistant actions `cad.read_representation` and
`cad.set_dimension`, regression browser flows, and links from SysML and Conceptualize (`ArtifactRef`
module `cad`, twin `CAD-…` IDs).

- During Phases 0–1 the new modeler is a **separate tool**: ID `cad-modeler`, name "CAD Modeler",
  category `Design`, entitlement **`tool:cad`** (same subscription). The mock tool keeps working unchanged.
- Replacing the mock (retiring `cad`, migrating `cad-representation` objects, re-pointing links, the
  dimension delegation and assistant actions) is a **coordinator decision at integration review**,
  proposed by the CAD agent as an ADR with a non-destructive migration (ADR-0009). Until then the agent
  does not edit `packages/tool-cad`.

## 2. Placement (modularization decision)

Monorepo, independently buildable and testable packages (ADR-0001); a separate repository later if the
agent's architecture justifies it (proposed as an ADR). Suggested names, to be confirmed in the
agent's architecture:

| Package | Role |
| --- | --- |
| `packages/cad-core` (`@ews/cad-core`) | Native open model (versioned schema), command system (typed commands, validation, transactions, undo/redo), feature dependency graph and regeneration, sketch constraint model. Framework-free; no React |
| `packages/cad-kernel` (`@ews/cad-kernel`) | Adapter to the geometric kernel (for example Open CASCADE compiled to WebAssembly, running in a Web Worker), tessellation, STEP I/O, mass properties |
| `packages/tool-cad-modeler` (`@ews/tool-cad-modeler`) | UI (viewport, feature tree, sketcher, dialogs), assistant contribution, help, standalone harness |
| `services/cad` (only if needed) | Server-side persistence of native models and revisions, hosted by `services/api` at `/api/cad/v1` |

Heavy geometry must not run on the UI thread. Rust/C++/WASM cores and WebGPU are allowed where justified.

## 3. Licensing pre-authorization

The agent may proceed without waiting for approval when every shipped dependency is MIT, BSD, Apache-2.0,
ISC, zlib, MPL-2.0, or **LGPL-2.1/3.0 used as a separately replaceable module** (for example a WASM
binary loaded at run time that users can replace), with the obligations documented in
`docs/dependencies.md`. **GPL or AGPL code in the shipped application, proprietary SDKs, vendor format
libraries with restrictive terms, or paid services require coordinator approval first.** Research of
proprietary products uses public sources only (brief §3).

## 4. Data ownership and identity

- The CAD module owns its native models (parts, assemblies, sketches, features, parameters,
  configurations, metadata) and their revisions; stable entity identifiers per the agent's topological
  naming design.
- Other modules reference CAD entities with version-aware references. For Conceptualize this is
  `ArtifactRef` (SDK 1.5): the agent proposes the `module`/`id` scheme for CAD-modeler entities (for
  example `module: 'cad'`, `id: <part or feature UUID>`) as a contract change; today `cad` means twin
  `CAD-…` objects of the mock tool.
- Requirements stay in the Requirements service; SysML elements in the twin; the CAD module never copies
  them. Associations are references owned by whichever module creates them, per the platform rules.
- Whether CAD parts appear in the shared twin (projection like requirements, ADR-0012) is an integration
  decision; propose it.

## 5. AI integration

- Every human operation is a typed command in `cad-core`; the UI and the assistant call the same
  commands (ADR-0010/0013 direction).
- Assistant actions are contributed by the tool (`cad-modeler.*` names), registered in
  `apps/workspace/src/assistant/capabilities.ts`, and mutations that need approval are previewed through
  the platform's proposal flow (twin changes or SDK 1.5 **service proposals**). Command-level preview,
  transactions and undo/redo live in `cad-core`.
- Structured observability queries (feature tree, parameters, constraints, entities, mass properties,
  failures) are read operations; viewport images are supplementary.
- No model provider is connected; demo planning via `AssistantContribution.demo` is allowed and must be
  labelled.

## 6. File ownership during the CAD program

| Owner | Paths |
| --- | --- |
| CAD agent | `packages/cad-*/**`, `packages/tool-cad-modeler/**` (incl. `help/`), `services/cad/**` if created, `docs/modules/cad/**` (new folder; the existing `docs/modules/cad.md` stays the mock tool's spec until replacement), `docs/specifications/cad-program-progress.md`, `docs/research/cad/**`, new ADRs `docs/decisions/00NN-cad-*.md` with status **Proposed** (do not edit the index) |
| CAD agent, limited (coordinator reviews; also used by other agents, so append only) | `apps/workspace/src/platform/tools.ts` (register the tool), `apps/workspace/src/assistant/capabilities.ts` (append entries), `services/api/src/server.ts` and `main.ts` (register a CAD plugin only), root `package.json` (scripts prefixed `cad:`), `docs/dependencies.md` (append rows) |
| Coordinator | Everything else: `packages/tool-cad` (mock), `packages/platform-sdk`, `packages/model-service`, `packages/design-system`, other tools and services, the rest of `apps/workspace`, root `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/decisions/README.md` |

Other agents are working in parallel: Conceptualize (`feature/conceptualize`) and the Design Reasoning
architecture (`feature/design-reasoning`). Do not edit their packages. Request changes through the
progress file.

## 7. Gates

- Proceed from Phase 0 to the Phase 1 implementation after documenting the architecture and decisions,
  unless a licensing issue outside §3 or a conflict with §1/§4 needs approval; then stop and report.
- Integration into `main` requires coordinator review (ownership, tests, licences, no regressions in
  existing flows).

## 8. Definition of done (platform rules)

Design-system components and tokens; phone, tablet and desktop; both themes; keyboard access; help
manifest and pages (`docs/modules/help.md`); entries in the AI capability inventory; `npm run check`,
`npm run build`, `npm run build:harnesses` green; the platform's existing browser flows keep passing.

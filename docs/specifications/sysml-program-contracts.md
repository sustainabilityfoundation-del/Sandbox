# SysML / MBSE program: agreed contracts, ownership and governance

Status: agreed by the coordinator, 14 October 2026, before delegation. Brief: [sysml-program.md](sysml-program.md).
Progress: [sysml-program-progress.md](sysml-program-progress.md).

## 1. Relationship to the existing SysML tool

The platform already has an **illustrative** SysML tool, `packages/tool-sysml` (tool ID `sysml`,
entitlement `tool:sysml`): a small editable diagram over twin `sysml-element` objects, `represents`,
`references`, `connects`, `satisfies` relationships, a generated, read-only text view (not SysML v2), and
Requirements integration through the SDK `RequirementsService` (sprint 003). SysML elements are linked
from Conceptualize (`ArtifactRef` module `sysml`, twin `SYS-…` IDs) and from the shared model.

- During development the new MBSE environment is a **separate tool**: ID `sysml-modeler`, name "SysML
  Modeler", category `Systems engineering`, entitlement **`tool:sysml`**. The existing tool keeps working
  unchanged; the agent does not edit `packages/tool-sysml`.
- Replacing it (migrating twin `sysml-element` data, re-pointing links and the `represents` identity
  rule, retiring the illustrative tool) is a **coordinator decision at integration review**, proposed as
  an ADR with a non-destructive migration (ADR-0009).

## 2. Technology (resolves a conflict in the brief)

The brief prefers "the platform's existing Rust backend infrastructure". **There is no Rust backend.** The
platform is TypeScript end to end: React 19 + Vite on the client, Node + Fastify + PostgreSQL (`pg`) services
hosted by `services/api`, transactional outbox + SSE events, development identities with server-side roles
and entitlements, OpenAPI 3.1 per service, the platform Help Service.

- Default: TypeScript for the semantic core, parser, services and UI; PostgreSQL schema `sysml`.
- A new **shipped** runtime (Rust/WASM core, a JVM service such as the OMG pilot implementation, Python)
  needs a documented justification as a proposed ADR and **coordinator approval** before it is adopted.
- Using reference implementations (for example the OMG SysML v2 Pilot Implementation or the API & Services
  reference implementation) as **test oracles or conformance tools outside the shipped application** is
  allowed without approval, within their licences.

## 3. Placement (to be confirmed by the agent's architecture)

| Package | Role |
| --- | --- |
| `packages/sysml-core` (`@ews/sysml-core`) | KerML/SysML v2 semantic model, parser and serializer (textual notation, standard JSON), name resolution, standard library loading, semantic validation, commands and transactions (typed, dry run, undo), queries. Framework-free |
| `services/sysml` (`@ews/sysml-service`) | Model repository and persistence (schema `sysml`), versioning (commits, branches, baselines per the Systems Modeling API), Systems Modeling API and Services endpoints, outbox and events; hosted by `services/api` at `/api/sysml/v1` |
| `packages/sysml-client` (`@ews/sysml-client`) | Browser client and adapters |
| `packages/tool-sysml-modeler` (`@ews/tool-sysml-modeler`) | Textual editor, model browser, graphical views (projections of the semantic model), property editing, matrices; assistant contribution; help; harness |

## 4. Licensing pre-authorization

Proceed without approval for dependencies under MIT, BSD, Apache-2.0, ISC, zlib, MPL-2.0, EPL-2.0 (used
unmodified as a library), and LGPL used as a separately replaceable module, documented in
`docs/dependencies.md`. **GPL or AGPL code in the shipped application, proprietary SDKs or vendor
interfaces, and paid services require approval.** Standards documents are read, not reproduced; the OMG
standard library may be bundled only under its published licence terms (check and record them).

## 5. Data ownership and integration

- The SysML module owns SysML/KerML model elements, relationships, views and their versions.
- **Requirements** stay authoritative in the Requirements service. SysML requirement definitions/usages
  that stand for managed requirements reference them by canonical UUID and revision through the SDK
  `RequirementsService`; no competing requirements store. ReqIF goes through Requirements.
- **Conceptualize** links Concepts to SysML elements with `ArtifactRef` (SDK 1.5). Today `module: 'sysml'`
  means twin `SYS-…` objects; propose the scheme for SysML-modeler elements (for example element UUID plus
  commit/revision) as a contract change. Do not embed the design reasoning layer in SysML.
- **CAD**: a separate CAD agent is building the CAD modeler in parallel. Part-to-CAD mappings, interface
  traceability and mass properties are a shared contract: propose it; the coordinator reconciles it with
  the CAD agent's proposal. Do not edit CAD packages.
- **Design reasoning**: an architecture agent is designing the reasoning layer
  (`docs/specifications/design-reasoning*.md`); SysML integrates through Conceptualize and the SDK, not by
  hosting reasoning.

## 6. AI integration

- Every human operation is a typed command in `sysml-core`/`services/sysml`; the UI and the assistant call
  the same commands. Dry run and preview, transactions, undo, version checks, provenance and semantic
  validation after modification live in the module.
- Assistant actions are contributed by the tool (`sysml-modeler.*`), listed in
  `apps/workspace/src/assistant/capabilities.ts`; mutations needing approval go through the platform's
  **service proposals** (SDK 1.5). No simulated clicks, no direct database edits.
- No model provider is connected: demo planning via `AssistantContribution.demo`, labelled. AI access to
  core model operations is part of Phase 1.

## 7. File ownership

| Owner | Paths |
| --- | --- |
| SysML agent | `packages/sysml-core/**`, `services/sysml/**`, `packages/sysml-client/**`, `packages/tool-sysml-modeler/**` (incl. `help/`), `docs/modules/sysml/**` (new folder; `docs/modules/sysml.md` stays the illustrative tool's spec until replacement), `docs/research/sysml/**`, `docs/specifications/sysml-program-progress.md`, new ADRs `docs/decisions/00NN-sysml-*.md` with status **Proposed** (do not edit the index) |
| SysML agent, limited (append only; other agents also edit these) | `apps/workspace/src/platform/tools.ts`, `apps/workspace/src/assistant/capabilities.ts`, `services/api/src/server.ts` and `main.ts` (register the plugin and `registerApiDocs` only), one additive platform migration granting `tool:sysml` to the development users that should have it if needed, root `package.json` (scripts prefixed `sysml:`), `docs/dependencies.md` |
| Coordinator | Everything else, including `packages/tool-sysml` (illustrative), `packages/platform-sdk`, `packages/model-service`, `packages/design-system`, other tools and services (Requirements, Conceptualize, CAD), the rest of `apps/workspace`, root `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/decisions/README.md` |

## 8. Gates and reporting

- After research and architecture (brief §14 items 1–10), send the coordinator the major architectural
  decisions (SendMessage), then **continue** with the Phase 1 foundation (semantic core, parser, repository,
  API, validation, AI access) as long as it stays within §2–§7. Stop and wait only for decisions that need
  approval: a new shipped runtime, licences outside §4, shared-contract changes.
- Integration into `main` requires coordinator review: ownership, tests, licences, no regressions in the
  existing flows.

## 9. Definition of done

Design-system components and tokens, phone/tablet/desktop, both themes, keyboard access; help manifest and
pages (the Help menu discovers them automatically); AI capability inventory entries; `npm run check`,
`npm run build`, `npm run build:harnesses` and the existing browser flows green; conformance tests with an
explicit list of unsupported language features.

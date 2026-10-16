# Architecture (approved, current)

Updated: 16 October 2026 (main `0bf9b0f`)

This document describes the architecture as it is implemented in this repository today, mapped to
the [architecture vision](architecture-vision.md). The vision is the long-term direction; this file
records what is approved and built. Decisions are recorded once, in [decisions/](decisions/README.md);
delivery priorities are in [roadmap.md](roadmap.md); who owns what is the Ownership table in the root
[AGENTS.md](../AGENTS.md). This file links to specifications and ADRs instead of repeating them.

Development follows [short sprints](development-workflow.md): bounded end-to-end increments,
compatible module contracts, a runnable main branch and reproducible committed candidates for
owner review. Current priority: [demonstration D1](specifications/demo-ai-engineering.md) within
[integration milestone 1](specifications/integration-milestone-1.md).

Status labels used below: **Implemented** (works and is tested), **Experimental** (works, but
deliberately limited or illustrative), **Prototype only** (stands in for a production mechanism that
does not exist yet), **Planned** (specified or decided, not built), **Not implemented**.

## 1. Packages and services

Each module is a set of packages: a framework-free core where one is needed, a browser client, a
server-side service (Fastify plugin with its own PostgreSQL schema, hosted by `services/api`) and a
tool package registered in the workspace. The browser receives only clients, cores and tools.

| Area | Packages and services | Notes |
| --- | --- | --- |
| Platform | `apps/workspace`, `packages/platform-sdk`, `packages/model-service`, `packages/design-system`, `services/api` | Shell and navigation (Focused Canvas: [shell](modules/design-system/shell.md)), tool registry, installed-module lists, entitlements, windows, assistant panel, help; the SDK; the shared twin model and repository; components, tokens and icons; the API host |
| Requirements | `packages/tool-requirements`, `packages/requirements-client`, `packages/reqif`, `services/requirements` | [contracts](specifications/requirements-contracts.md), [API](specifications/requirements-api.md), [ReqIF](specifications/requirements-reqif.md); [ADR-0011](decisions/0011-requirements-service-boundary.md) |
| System Model (SysML Modeler, IDs `sysml-modeler`) | `packages/sysml-core`, `packages/sysml-client`, `services/sysml`, `packages/tool-sysml-modeler` | [contracts](specifications/sysml-program-contracts.md), [module docs](modules/sysml/README.md). A SysML v2-aligned semantic core and API; no compliance is claimed ([conformance](modules/sysml/conformance.md)) |
| CAD (CAD Modeler, IDs `cad-modeler`) | `packages/cad-core`, `packages/cad-kernel`, `packages/cad-client`, `services/cad`, `packages/tool-cad-modeler` | [contracts](specifications/cad-program-contracts.md), [module docs](modules/cad/README.md); real geometric kernel, see §9 |
| Conceptualize | `packages/tool-conceptualize`, `packages/conceptualize-client`, `services/conceptualize` | [contracts](specifications/conceptualize-contracts.md); owns concept visualization UI; validates calculation models with `engineering-calc` |
| Project Management | `packages/projects-client`, `services/projects` | Platform module (not a tool): projects, artifact registry, product structure, blobs ([contracts](specifications/project-management-contracts.md), [ADR-0060](decisions/0060-projects-module-placement.md)) |
| AI connection | `services/assistant`, `services/settings`, `services/visualization`, `packages/visualization-client` | Provider connections, assistant service and access policy, settings, image generation ([ai-connection](specifications/ai-connection.md), [concept-visualization contracts](specifications/concept-visualization-contracts.md)) |
| Design Reasoning | `packages/engineering-calc`, `packages/design-reasoning-core` | Libraries only; the reasoning service is **Planned** (§8) |
| Illustrative tools (being retired) | `packages/tool-sysml`, `packages/tool-cad` | First-prototype tools on the browser twin (**Experimental**); hidden from the interface by the retirement branch `ui/retire-illustrative-rename-system-model` (pending merge, amends [ADR-0027](decisions/0027-cad-mock-tool-replacement.md)); data and IDs kept |
| GLB viewer | `apps/glb-viewer` | Standalone viewer, not part of the platform |

Dependency rules per package are enforced by `packages/platform-sdk/src/boundaries.test.ts`
([ADR-0001](decisions/0001-monorepo-npm-workspaces.md), [ADR-0002](decisions/0002-versioned-tool-contract.md));
the summary is in the root AGENTS.md, "Permitted dependencies".

## 2. Module registration (Implemented)

Every module exports one **client manifest** (capability inventory, AI operation classes, help manifest,
settings contribution, tool or platform-module registration, e2e flows) and, where it has a service, one
**server manifest** (plugin, base path, docs, artifact source, policy entries, proposals). The workspace
collects the client manifests from `INSTALLED_MODULES` (`apps/workspace/src/platform/installedModules.ts`)
and the API host collects the server manifests from `INSTALLED_SERVER_MODULES` / `ALL_SERVER_MODULES`
(`services/api/src/modules.ts`). The inventory, policy, help and boundary tests iterate over these lists.
Adding a module is adding its package to the list. Specification and the M1-M6 results (all six modules
moved, SDK 1.12): [module-registration.md](specifications/module-registration.md). The remaining
hard-coded entries belong to the platform and the illustrative tools (cleanup step F, **Planned**).

## 3. SDK and capability registry

- The tool contract is `@ews/platform-sdk` **1.13.0** (`src/contract/version.ts`; history in
  [CHANGELOG](../packages/platform-sdk/CHANGELOG.md)). Tools declare the range they were built for; the host
  refuses another major version. Contract changes follow the root AGENTS.md ("Contract changes").
- **Capability registry** ([ADR-0074](decisions/0074-capability-registry-and-toolbars.md),
  [specification](specifications/capability-registry.md), SDK 1.13): each module's manifest carries its full
  target inventory (implemented, partial, planned) with evidence; `implementationState` is computed from
  implementation and tests, `availability` from the runtime context; the toolbar shows the full scope with
  planned commands muted and explained, and the assistant reads the same registry (`list_capabilities`).
  The professional structure (menu bar, palettes, context sets, SDK 1.14) is amendment CT-2c: **Planned**.
- Unit algebra: SDK `quantities` (`contract/quantities.ts`), the one unit system for the platform.

## 4. Mapping to the vision

### User interfaces (vision §4)

| Vision | Here | Status |
| --- | --- | --- |
| Common shell with navigation, module discovery, cross-module links, AI | `apps/workspace`: rail, dock layout, command palette, Help Centre, assistant panel | Implemented |
| Each module has its own standalone interface | Per-tool harness on a mock `PlatformHost` (`npm run dev:requirements` etc.) | Implemented |
| Browser and desktop share domain semantics | Browser only | Not implemented (desktop) |
| Offline and synchronisation | Multi-window sync through browser storage events; services notify through outbox and SSE | Not implemented (offline) |
| Long-running jobs in workers | OCCT kernel in a Web Worker; image generation jobs server-side | Implemented (these two); no general job service |

### Module services (vision §4)

Each module owns its domain logic and integrates only through the SDK contract, its own HTTP API
and the shared twin. Modules never import each other's implementation; another module's contract
file is the interface. Requirements, Conceptualize, System Model, CAD, Project Management, settings,
assistant and visualization are separate services with their own PostgreSQL schemas, hosted by one API
process (`services/api`, embedded PostgreSQL in development). The shared twin
(`packages/model-service`) keeps **logical ownership** per artifact type
([ADR-0006](decisions/0006-module-ownership-and-delegation.md)); the browser `DemoRepository` remains
for the illustrative tools and the example project.

### Shared platform services (vision §4)

| Service | Here | Status |
| --- | --- | --- |
| Identity, authorization, entitlements | Development identities, memberships and role checks in `services/api`; plans gate tools in the client | Prototype only ([ADR-0008](decisions/0008-client-side-entitlements-prototype.md)); server checks per service |
| Product and configuration registry | Configurations, scenarios, baselines pinning exact revisions; product structure in Project Management | Implemented (minimal) |
| Traceability | Typed relationships validated by `RELATIONSHIP_RULES`; change impact; cross-module references per module contracts | Implemented (minimal) |
| Change and release workflows | Review status on artifacts; revisions and commits per service | Not implemented (workflows) |
| Engineering records and evidence | Immutable artifacts with provenance; verification records; calculated evidence with reproducibility manifests | Implemented (minimal) |
| Jobs and execution | Image generation jobs (`services/visualization`); no general job service | Partial |
| Integration and interchange | ReqIF import and export (Requirements); STEP AP242 export and re-import in the CAD kernel; GLB in the standalone viewer | Partial |
| Search and projections | `ModelIndex` is a derived, rebuildable in-memory index; read-time projections of external objects ([ADR-0012](decisions/0012-read-time-projection-of-external-objects.md)) | Implemented (minimal) |
| Settings | `services/settings` with SDK setting definitions and the Settings centre ([ADR-0048](decisions/0048-ai-settings-framework.md)) | Implemented |

### Storage and integration (vision §4)

- One atomic batch per `submitChanges` call on the twin; services require the base revision
  (`If-Match`) and an `Idempotency-Key` on writes and reject stale edits with `conflict`.
- Services publish events through an outbox and SSE; other windows reread the browser store when notified.
- No cross-module transactions beyond a single batch or request; none are implied.

## 5. Authoritative engineering definition (vision §5)

| Contract | Implementation |
| --- | --- |
| Stable identity, type, owning module | Stable IDs (`REQ-001`, `ROD-120`); `ARTIFACT_OWNER` maps type to module (`model-service/src/domain/ownership.ts`) |
| Immutable revision identity | Every object and scenario carries a revision; each change appends an `ObjectRevision` snapshot ([ADR-0004](decisions/0004-revision-history-and-exact-references.md)); services keep immutable revisions and commits |
| Baselines pinning exact revisions | `Baseline` pins `{id, revision}` for every object and scenario ([ADR-0005](decisions/0005-minimal-baselines.md)); project baselines per [ADR-0067](decisions/0067-projects-baselines.md) |
| Units and dimensions | SDK `quantities` with dimensional analysis; CAD and calculation results carry units; no tolerances, uncertainty or frames yet |
| Typed relationship semantics | `RELATIONSHIP_RULES` restricts each relationship type to permitted endpoint types |
| Parameter ownership and update direction | `DELEGATIONS`: CAD may write listed dimensions on parts and assemblies, one direction only |
| Provenance, authorship, status | Artifacts record tool, tool version, objects, configuration, input revisions, schema version, review status; history records who changed what |
| Schema versions and migration | Additive, tested migrations in the twin and in every service ([ADR-0009](decisions/0009-non-destructive-migrations.md)) |
| Exact vs latest-working references | `ArtifactReference {id, revision?, role}`: with `revision` it is exact, without it is a deliberate latest-working reference |

Released evidence does not follow later edits: artifacts are immutable, and freshness is derived by
comparing pinned input revisions with the current model.

## 6. Ownership and permissions

Every object type has one owning module (`ARTIFACT_OWNER`); a relationship belongs to the module owning
its `from` end. The repository refuses a write by any other module (`forbidden`), and exceptions exist only
in `DELEGATIONS` (adding one is an ADR). The assistant writes only on behalf of the modules whose actions
produced the proposal, so equivalent user and AI commands meet the same rules
([ADR-0010](decisions/0010-ai-through-the-same-command-boundary.md)). Verification records
([ADR-0007](decisions/0007-verification-records.md)) pin the requirement revision and the configured article;
a later change to either marks the record stale.

## 7. AI (vision §6)

Architecture: [AI Interface](modules/ai-interface.md), [features](modules/ai-interface/features.md),
[provider connection](modules/ai-interface/provider-connection.md). The assistant runs server-side
(`services/assistant`, [ADR-0047](decisions/0047-ai-provider-backend-and-account-connection.md)): provider
connections with server-held credentials, a server-enforced access policy built from the module manifests,
an audit record per call, and persisted declarative proposals applied through a server-side gateway
([ADR-0049](decisions/0049-ai-persisted-proposals-and-headless-contributions.md)). A fake provider serves
development and tests. Proposals are previewed with expected revisions, validated by application code and
applied through the same command boundary as user edits. The assistant reads the capability registry and the
help manifests (`read_help`). Model descriptions and imported documents are data, not instructions. A live
run with the owner's provider account is pending owner review ([progress](specifications/ai-connection-progress.md));
complete coverage and autonomous execution are design policy, not implemented.

## 7a. Help and documentation

The platform Help Service reads each module's help manifest from the module manifests, filters by
subscription, and serves the Help menu, Help Centre, F1, tutorials and the assistant's `read_help`
operation. Documentation is Markdown next to each module's code. Details: [modules/help.md](modules/help.md),
[ADR-0014](decisions/0014-unified-help-system.md).

## 8. Design reasoning layer (libraries built, service planned)

Architecture set: [modules/design-reasoning](modules/design-reasoning/README.md); decisions ADR-0039 to
ADR-0046 (Proposed). Built: `packages/engineering-calc` (deterministic calculation engine on mathjs,
[ADR-0044](decisions/0044-calculation-models-and-math-stack.md); used by Conceptualize to validate calculation
models and re-verify calculated evidence) and `packages/design-reasoning-core` (plan, run and tool schemas,
impact traversal, basis rules). **Planned**: the Design Reasoning Engine service (`services/design-reasoning`,
[ADR-0039](decisions/0039-design-reasoning-engine-boundary.md)), which would own only operational state,
reach models only through the AI Interface and change authoritative data only through previewed proposals.
Status: [progress](specifications/design-reasoning-progress.md).

## 9. CAD kernel

The CAD Modeler uses Open CASCADE Technology compiled to WebAssembly (replicad-opencascadejs 1.1.0,
LGPL-2.1 with the OCCT exception, loaded at run time as a separate file) with replicad 1.1.0 (MIT) as the
TypeScript API, running in a Web Worker behind the replaceable `GeometryKernel` interface of `@ews/cad-core`
([ADR-0021](decisions/0021-cad-geometric-kernel-occt-wasm.md), Proposed; the LGPL decision is not accepted
yet; [kernel selection](modules/cad/kernel-selection.md)). The OCCT version inside the WASM build is **8.0 per
C1 verification** (STEP writer stamp, `cad-kernel/src/version.test.ts`, branch `cad/c1-sketching-reliability`,
pending merge); on main the version is still listed as unverified (R-CAD-01). Kernel tests run on the real
OCCT and compare volumes and areas with analytic values. The mock CAD tool never used a kernel and is being
retired (§1). Limits: [docs/modules/cad/README.md](modules/cad/README.md).

## 10. Dependencies, licences and notices

Every dependency is recorded with its licence in [dependencies.md](dependencies.md); the machine-readable
register `docs/dependencies/register.json` and the policy `docs/dependencies/policy.json` are generated and
checked from the lockfile (`npm run deps:register`, `deps:check`, `deps:sbom`, `deps:audit`;
[ADR-0073](decisions/0073-sbom-and-licence-checks.md), Proposed). Third-party notices ship with the build
(`npm run notices`). The licence policy is in the open-source strategy (§2): MIT/BSD/Apache preferred,
LGPL/MPL/EPL after compliance review, GPL/AGPL only with explicit approval.

## 11. Owner directives

- **Open-source first** ([strategy](architecture/OPEN_SOURCE_STRATEGY.md),
  [evaluation template](architecture/open-source-evaluation-template.md)): search for established open-source
  implementations before building an engineering capability; integrate through replaceable, versioned
  interfaces; record alternatives, licences and rationale in an ADR. Assessment of the current code:
  [open-source-assessment-2026-10.md](architecture/open-source-assessment-2026-10.md).
- **Capability-complete toolbars** ([directive](architecture/CAPABILITY_TOOLBARS.md)): implemented through
  the capability registry (§3).

## 12. Development assurance (deferred)

Standards-aware assurance is the deferred epic
[E-ASSURE](roadmap.md#deferred-epic-e-assure-standards-aware-development-assurance-and-safety-engineering). Its
boundaries apply now ([ADR-0070](decisions/0070-development-assurance-boundaries.md)): industry rules are versioned
profile data layered over the platform, never terminology or gates in generic modules; classifications keep their
governing standard; evidence names the configuration, inputs and tool versions it supports; requirement validation,
implementation, verification, review and evidence currency stay separate states.

## 13. Acceptance principles (vision §11)

| Principle | Status | Evidence |
| --- | --- | --- |
| A module is usable without the complete suite | Implemented | Per-tool harnesses; subscriptions with one tool |
| A baseline identifies the exact engineering definition | Implemented | `DemoRepository.test.ts` "revision history and baselines"; project baselines |
| A test result identifies requirement revision, configured article and procedure/run | Implemented | `tool-requirements/src/domain.test.ts`; workspace e2e test |
| Changes expose affected dependencies and stale evidence | Implemented | Inspector change impact; stale records; e2e test |
| Equivalent user and AI commands enforce equivalent rules | Implemented | Ownership tests in `platform.test.ts` and `assistant.test.ts`; server-side apply gateway |
| Interchange failures are visible | Partial | ReqIF import preview reports problems; GLB viewer reports load errors |
| Numerical and geometry correctness use independent references | Partial | CAD kernel tests against analytic values; calculated evidence is re-evaluated before acceptance; no external reference engine yet |
| Implemented, experimental and planned capabilities labelled honestly | Implemented | Capability registry states; "About this platform" dialog (`apps/workspace/src/platform/capabilities.ts`) |

The end-to-end cross-module workflow required by Phase 1 is
`apps/workspace/src/platform/platform.test.ts` › "end-to-end cross-module workflow"; the current target is
[D1](specifications/demo-ai-engineering.md).

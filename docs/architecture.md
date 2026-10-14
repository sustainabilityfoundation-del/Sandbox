# Architecture (approved, current)

Updated: 13 October 2026

This document describes the architecture as it is implemented in this repository today, mapped to
the [architecture vision](architecture-vision.md). The vision is the long-term direction; this file
records what is approved and built. Decisions are recorded once, in [decisions/](decisions/README.md);
delivery priorities are in [roadmap.md](roadmap.md).

Development follows [short sprints](development-workflow.md): bounded end-to-end increments,
compatible module contracts, a runnable main branch and reproducible committed candidates for
owner review. This is the adopted development policy; it does not imply CI or branch protection
is implemented. Sprint plans and handoffs use [the sprint template](sprints/template.md).

Status labels used below: **Implemented** (works and is tested), **Experimental** (works, but
deliberately limited or illustrative), **Prototype only** (stands in for a production mechanism that
does not exist yet), **Not implemented**.

## 1. Packages

```
apps/workspace          Common shell: navigation, tool registry, subscriptions, windows, inspector,
                        baselines UI, assistant panel, capability labels
apps/glb-viewer         Standalone GLB viewer (not part of the platform)
packages/model-service  Domain model, ownership and relationship rules, revision history,
                        baselines, change impact, DemoRepository (no React)
packages/platform-sdk   Versioned tool contract (1.1.0), PlatformHost, React hooks, harness, testing
packages/design-system  React Aria + Tailwind components, tokens, semantic icons
packages/tool-requirements | tool-sysml | tool-cad   The three Phase 1 modules
```

Dependency rules are enforced by `packages/platform-sdk/src/boundaries.test.ts` (see
[ADR-0001](decisions/0001-monorepo-npm-workspaces.md) and [ADR-0002](decisions/0002-versioned-tool-contract.md)).

## 2. Mapping to the vision

### User interfaces (vision §4)

| Vision | Here | Status |
| --- | --- | --- |
| Common shell with navigation, module discovery, cross-module links, AI | `apps/workspace` | Implemented |
| Each module has its own standalone interface | Per-tool harness (`npm run dev:requirements` etc.) on a mock `PlatformHost` | Implemented |
| Browser and desktop share domain semantics | Browser only | Not implemented (desktop) |
| Offline and synchronisation | Multi-window sync through browser storage events | Not implemented (offline) |
| Long-running jobs in workers | No long-running jobs exist yet | Not implemented |

### Module services (vision §4)

Each module owns its domain logic (`packages/tool-*/src/domain.ts`) and integrates only through the
SDK contract and the shared repository. Modules never import each other. Persistence is a single
logical store (`DemoRepository`, browser `localStorage`) with **logical ownership** per artifact type
([ADR-0006](decisions/0006-module-ownership-and-delegation.md)). There are no separate module
services or databases yet; that is consistent with the vision's "shared infrastructure with clear
logical ownership".

### Shared platform services (vision §4)

| Service | Here | Status |
| --- | --- | --- |
| Identity, authorization, entitlements | Demo plans gate tools in the client | Prototype only ([ADR-0008](decisions/0008-client-side-entitlements-prototype.md)) |
| Product and configuration registry | Configurations, scenarios, baselines pinning exact revisions | Implemented (minimal) |
| Traceability | Typed relationships validated by `RELATIONSHIP_RULES`; change impact | Implemented (minimal) |
| Change and release workflows | Review status on artifacts only | Not implemented |
| Engineering records and evidence | Immutable artifacts with provenance; verification records | Implemented (minimal) |
| Jobs and execution | — | Not implemented |
| Integration and interchange | GLB import in the standalone viewer only | Not implemented (platform) |
| Search and projections | `ModelIndex` is a derived, rebuildable in-memory index | Implemented (minimal) |

### Storage and integration (vision §4)

- One atomic batch per `submitChanges` call; the repository rejects edits based on a stale revision.
- No event delivery or outbox; other windows reread the store when notified.
- No cross-module transactions beyond a single batch; none are implied.

## 3. Authoritative engineering definition (vision §5)

| Contract | Implementation |
| --- | --- |
| Stable identity, type, owning module | Stable IDs (`REQ-001`, `ROD-120`); `ARTIFACT_OWNER` maps type → module (`model-service/src/domain/ownership.ts`) |
| Immutable revision identity | Every object and scenario carries a revision; each change appends an `ObjectRevision` snapshot to history ([ADR-0004](decisions/0004-revision-history-and-exact-references.md)) |
| Baselines pinning exact revisions | `Baseline` pins `{id, revision}` for every object and scenario and copies relationships ([ADR-0005](decisions/0005-minimal-baselines.md)) |
| Units and dimensions | `{value, unit}` quantities with unit validation for CAD dimensions; no tolerances, uncertainty or frames yet |
| Typed relationship semantics | `RELATIONSHIP_RULES` restricts each relationship type to permitted endpoint types |
| Parameter ownership and update direction | `DELEGATIONS`: CAD may write `diameter`, `outerDiameter`, `length`, `effectiveLength` on parts and assemblies; the mapping is one direction, CAD → component |
| Provenance, authorship, status | Artifacts record tool, tool version, objects, configuration, input revisions, schema version, review status; history records who changed what |
| Schema versions and migration | Repository schema 3; schema 1 → 2 → 3 upgrades are additive and tested ([ADR-0009](decisions/0009-non-destructive-migrations.md)) |
| Exact vs latest-working references | `ArtifactReference {id, revision?, role}`: with `revision` it is exact, without it is a deliberate latest-working reference |

Released evidence does not follow later edits: artifacts are immutable, and freshness is derived by
comparing pinned input revisions with the current model.

## 4. Ownership and permissions

| Artifact type | Owner | Notes |
| --- | --- | --- |
| `assembly`, `part`, `scenario` | `product` (written by `platform`) | CAD has a delegation for listed dimensions |
| `requirement` | `requirements` | |
| `sysml-element` | `sysml` | |
| `cad-representation` | `cad` | |
| `procedure` | `verification` | Retired module: read-only |
| Relationship | Module owning the `from` end | Validated against `RELATIONSHIP_RULES` |

The repository refuses a write by any other module with error code `forbidden`. The assistant writes
only on behalf of the modules whose actions produced the proposal (`onBehalfOf`), so equivalent user
and AI commands meet the same rules ([ADR-0010](decisions/0010-ai-through-the-same-command-boundary.md)).

## 5. Verification records

A verification record is an artifact of kind `verification-record`, schema version 1, saved by the
Requirements module ([ADR-0007](decisions/0007-verification-records.md)). It identifies:

- the **requirement revision** (`references: {id, revision, role: 'verifies'}`),
- the **configured article** (the configuration, optionally a baseline: `role: 'baseline'`),
- the **procedure or run**, method and outcome,
- optional evidence (`role: 'evidence'`).

Its inputs are the requirement and its allocated components; a later change to any of them marks the
record stale. The Requirements table shows Verified, Stale evidence, Failed, Inconclusive or Not
verified.

## 6. AI (vision §6)

The proposed expansion is specified in [AI Interface architecture](modules/ai-interface.md),
[features](modules/ai-interface/features.md) and [development plan](modules/ai-interface/development-plan.md).
It targets complete semantic UI/backend capability coverage and evidence-backed design workflows.
These documents do not add those capabilities to the current implementation.

The assistant panel uses a scripted demo service (no model provider). Proposals are previewed with
expected revisions, validated by application code, and applied through the same repository command
boundary, with conversation provenance in the activity log. Model descriptions and imported documents
are data, not instructions. API credentials, when a provider is added, stay on the server.

## 7. Acceptance principles (vision §11)

| Principle | Status | Evidence |
| --- | --- | --- |
| A module is usable without the complete suite | Implemented | Per-tool harnesses; subscriptions with one tool |
| A baseline identifies the exact engineering definition | Implemented | `DemoRepository.test.ts` "revision history and baselines" |
| A test result identifies requirement revision, configured article and procedure/run | Implemented | `tool-requirements/src/domain.test.ts`; workspace e2e test |
| Changes expose affected dependencies and stale evidence | Implemented | Inspector change impact; stale records; e2e test |
| Equivalent user and AI commands enforce equivalent rules | Implemented | Ownership tests in `platform.test.ts` and `assistant.test.ts` |
| Interchange failures are visible | Partial | GLB viewer reports load errors; no platform interchange yet |
| Numerical and geometry correctness use independent references | Not implemented | Mock geometry only |
| Implemented, experimental and planned capabilities labelled honestly | Implemented | "About this platform" dialog (`apps/workspace/src/platform/capabilities.ts`) |

The end-to-end cross-module workflow required by Phase 1 is
`apps/workspace/src/platform/platform.test.ts` › "end-to-end cross-module workflow".

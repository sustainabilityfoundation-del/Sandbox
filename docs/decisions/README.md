# Architecture decision records

One decision per file, numbered. A decision is recorded here once; other documents link to it.
Template: Status, Context, Decision, Consequences. Supersede a decision with a new ADR rather than
editing an accepted one.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-monorepo-npm-workspaces.md) | Monorepo with npm workspaces | Accepted |
| [0002](0002-versioned-tool-contract.md) | Versioned tool contract and PlatformHost | Accepted |
| [0003](0003-component-identity-and-represents.md) | Physical component identity and `represents` | Accepted |
| [0004](0004-revision-history-and-exact-references.md) | Revision history and revision-qualified references | Accepted |
| [0005](0005-minimal-baselines.md) | Minimal baselines | Accepted |
| [0006](0006-module-ownership-and-delegation.md) | Module ownership and delegation, enforced in the repository | Accepted |
| [0007](0007-verification-records.md) | Verification records as immutable artifacts | Accepted |
| [0008](0008-client-side-entitlements-prototype.md) | Client-side entitlements are a prototype | Accepted |
| [0009](0009-non-destructive-migrations.md) | Non-destructive, additive data migrations | Accepted |
| [0010](0010-ai-through-the-same-command-boundary.md) | The assistant uses the same command boundary | Accepted |
| [0011](0011-requirements-service-boundary.md) | Requirements as a server-side service with a cross-module SDK contract | Accepted |
| [0012](0012-read-time-projection-of-external-objects.md) | Read-time projection of externally owned objects into the twin's model | Accepted |
| [0014](0014-unified-help-system.md) | Unified help system with module-owned documentation | Accepted |
| [0015](0015-conceptualize-module.md) | Conceptualize: Concepts independent of their implementations | Accepted |

## Open decisions

Proposed for review: [ADR-0013: complete AI coverage through shared semantic operations](0013-ai-semantic-capability-coverage.md) (renumbered from 0011, which was already taken by the Requirements service boundary).
This extends ADR-0010 without changing the current proposal-preview policy.

Proposed by module programs, for coordinator review before acceptance (numbers 0016–0019 and 0027–0029 are
unused; the AI connection sprint uses 0047 upwards):

| ADR | Decision | Status |
| --- | --- | --- |
| [0020](0020-cad-module-packages-and-placement.md) | CAD Modeler packages, placement and relationship to the mock CAD tool | Proposed |
| [0021](0021-cad-geometric-kernel-occt-wasm.md) | Open CASCADE Technology in WebAssembly as the geometric kernel | Proposed |
| [0022](0022-cad-native-parametric-format.md) | Open, versioned native parametric format (`ews-cad`, JSON) | Proposed |
| [0023](0023-cad-command-architecture.md) | One typed command layer for people, the assistant and scripts | Proposed |
| [0024](0024-cad-topological-naming.md) | Generative topological naming with geometric probes | Proposed |
| [0025](0025-cad-sketch-constraint-solver.md) | In-house numerical sketch constraint solver for Phase 1 | Proposed |
| [0026](0026-cad-cross-module-references.md) | References between CAD Modeler entities and other modules | Proposed |
| [0030](0030-sysml-module-placement-and-packages.md) | SysML Modeler: placement, packages and tool identity | Proposed |
| [0031](0031-sysml-typescript-semantic-core.md) | TypeScript semantic core with a hand-written parser | Proposed |
| [0032](0032-sysml-abstract-syntax-element-store.md) | SysML Modeler: the stored model is the KerML/SysML abstract syntax | Proposed |
| [0033](0033-sysml-versioned-repository.md) | SysML Modeler: versioned repository aligned with the Systems Modeling API | Proposed |
| [0034](0034-sysml-typed-commands-and-transactions.md) | SysML Modeler: typed commands and transactions are the only write path | Proposed |
| [0035](0035-sysml-views-as-model-projections.md) | SysML Modeler: views are projections; v1 diagrams are labelled compatibility presentations | Proposed |
| [0036](0036-sysml-model-library.md) | SysML Modeler: model library handling | Proposed |
| [0037](0037-sysml-cross-module-references.md) | SysML Modeler: cross-module references through metadata and ArtifactRef | Proposed |
| [0038](0038-sysml-ai-access.md) | AI access through assistant actions and service proposals | Proposed |
| [0039](0039-design-reasoning-engine-boundary.md) | Design Reasoning Engine as a separate service owning only operational state | Proposed |
| [0040](0040-conceptualize-design-knowledge-extension.md) | Extend Conceptualize with first-class Function, Constraint, Assumption, DesignExploration and typed design links | Proposed |
| [0041](0041-relational-knowledge-and-graph-api.md) | Relational knowledge with a persistence-independent graph API; no graph or vector database | Proposed |
| [0042](0042-declarative-service-proposals.md) | Declarative (serializable) service proposals applied by the platform | Proposed |
| [0043](0043-basis-of-knowledge-and-promotion.md) | Basis-of-knowledge ladder and promotion rules | Proposed |
| [0044](0044-calculation-models-and-math-stack.md) | Calculation models in Conceptualize; a deterministic calculation engine on mathjs and the platform unit algebra | Proposed |
| [0045](0045-reasoning-runs-and-model-access.md) | Reasoning runs: model access through the AI Interface, budgets, checkpoints, reproducibility, no chain-of-thought | Proposed |
| [0046](0046-change-impact-and-invalidation.md) | Change impact distinguishes possible from demonstrated; invalidation is flagged, never silent | Proposed |

CAD: [cad-program-contracts.md](../specifications/cad-program-contracts.md), [docs/modules/cad](../modules/cad/README.md).
SysML: [sysml-program-contracts.md](../specifications/sysml-program-contracts.md), [docs/modules/sysml](../modules/sysml/README.md).
Design reasoning: [architecture set](../modules/design-reasoning/README.md), phase A approved for a phase B
validation prototype (15 October 2026); the ADRs stay Proposed until the prototype validates them.
On acceptance, move each row into the main table with status Accepted.

From the [architecture vision §12](../architecture-vision.md#12-documentation-placement). Resolve
each with a focused ADR; do not infer them from the vision.

- Technology stack confirmation beyond the prototype (backend, persistence, geometry kernel).
- Repository topology (monorepo or per-module repositories).
- Server-side repository, identity, authorization and entitlement enforcement.
- Local, browser and cloud execution boundaries for long-running jobs.
- Offline support and synchronisation and conflict handling.
- Detailed shared schemas: tolerances, uncertainty, reference frames, relationship revision ranges.
- Baseline release, approval and change workflows.
- Standards applicability and tool qualification strategy.

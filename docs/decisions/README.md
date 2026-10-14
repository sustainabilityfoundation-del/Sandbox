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

## Open decisions

Proposed for review: [ADR-0013: complete AI coverage through shared semantic operations](0013-ai-semantic-capability-coverage.md) (renumbered from 0011, which was already taken by the Requirements service boundary).
This extends ADR-0010 without changing the current proposal-preview policy.

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

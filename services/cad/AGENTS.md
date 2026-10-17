# AGENTS.md: @ews/cad-service

CAD document service: PostgreSQL schema `cad` (native `ews-cad` documents with immutable
revisions), validation by `@ews/cad-core`, ETag/If-Match, Idempotency-Key, outbox and SSE, OpenAPI 3.1,
the server manifest (`src/manifest.ts`, module ID `cad-modeler`, M4). Hosted by `@ews/api` at
`/api/cad/v1`. Owner: CAD agent. Specifications: [docs/modules/cad/service.md](../../docs/modules/cad/service.md),
[api.md](../../docs/modules/cad/api.md); contracts:
[cad-program-contracts.md](../../docs/specifications/cad-program-contracts.md) §1.

## Rules

- Imports `@ews/platform-sdk`, `@ews/cad-core`, `@ews/cad-client` (contract suite) and, for headless
  checks, `@ews/cad-kernel`; never another module's implementation (its API is the interface).
- Only this package reads or writes schema `cad`. Migrations are append-only (`test/migration.test.ts`);
  revisions are immutable; never rewrite history.
- Every document write validates with `@ews/cad-core`, requires `If-Match` and accepts `Idempotency-Key`;
  rejects stale revisions with `conflict`. Declarative proposals apply through the same path.
- Authorization: `tool:cad` entitlement plus project membership; errors never expose SQL or stack traces.
- Format changes follow [ADR-0022](../../docs/decisions/0022-cad-native-parametric-format.md); the
  manifest keeps IDs, operation names and classes stable (M4).

## Commands

```bash
npm run req:test:db            # services/cad/test (real PostgreSQL; d1.real and handoff.real use the OCCT kernel)
npm run cad:test               # cad-core, cad-kernel and tool-cad-modeler unit tests
npm run typecheck -w @ews/cad-service
```

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
CAD assignment (strategy §10): evaluate Open CASCADE, FreeCAD, geometric constraint solvers, meshing libraries and interoperability components; avoid custom geometric kernels or solvers where established alternatives meet requirements.
Capability-complete toolbars (mandatory, owner directive, [directive](../../docs/architecture/CAPABILITY_TOOLBARS.md)): keep this module's full target capability inventory (implemented, partial, planned) in its manifest with evidence for each status; planned commands are shown muted and explained, never executed, and never report success.

# AGENTS.md: @ews/requirements-service

Requirements Management service: domain, PostgreSQL schema `requirements`, migrations and seed
(`src/db`, `src/seed.ts`), Fastify routes (`src/http`), outbox and events, quality checks, artifact
source, ReqIF exchange (`src/exchange`, on `@ews/reqif`), the twin directory, and the server manifest
(`src/manifest.ts`, M6). Hosted by `@ews/api`. Owner: the Requirements module. Specifications:
[requirements-management.md](../../docs/specifications/requirements-management.md),
[requirements-api.md](../../docs/specifications/requirements-api.md),
[requirements-reqif.md](../../docs/specifications/requirements-reqif.md); contracts:
[requirements-contracts.md](../../docs/specifications/requirements-contracts.md);
decision: [ADR-0011](../../docs/decisions/0011-requirements-service-boundary.md).

## Rules

- Imports only `@ews/platform-sdk` (framework-free entry) and `@ews/reqif`
  (`packages/platform-sdk/src/boundaries.test.ts`). Other modules use the HTTP API.
- Only this package reads or writes schema `requirements`. Migrations are append-only and
  non-destructive; the seed runs only outside production.
- Writes require the base revision (`If-Match`) and accept `Idempotency-Key`; stale writes fail with
  `conflict`. Proposals from the assistant apply through the same validation as user edits.
- Authorization: `tool:requirements` entitlement plus project membership; errors never expose SQL or
  stack traces.
- The manifest keeps IDs, operation names and classes stable (M6). Verification records pin the
  requirement revision and the configured article ([ADR-0007](../../docs/decisions/0007-verification-records.md)).
- OpenAPI is the authoritative API description; regenerate derived docs rather than copying.

## Commands

```bash
npm run req:test:db            # services/api/test on a disposable real PostgreSQL (requirements.api, exchange, d1)
npx vitest run services/requirements
npm run typecheck -w @ews/requirements-service
```

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
Capability-complete toolbars (mandatory, owner directive, [directive](../../docs/architecture/CAPABILITY_TOOLBARS.md)): keep this module's full target capability inventory (implemented, partial, planned) in its manifest with evidence for each status; planned commands are shown muted and explained, never executed, and never report success.

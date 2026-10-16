# AGENTS.md: @ews/conceptualize-service

Conceptualize service: schema `conceptualize`, migrations, seed, Fastify plugin (`/api/concepts/v1`),
OpenAPI, outbox. Owner: the Conceptualize module. Imports only `@ews/platform-sdk`.

## Rules

- Migrations are append-only (`src/db/migrations/NNNN_*.sql`, checksummed); never rewrite or delete
  user data (ADR-0009). Immutable tables keep their refuse-change triggers.
- Every write goes through `withTransaction`, records an audit event with provenance and emits outbox
  events for committed changes only.
- Vocabularies and rules (roles, maturity gates, relationship types, bases, statement kinds) live in
  `src/domain/rules.ts`; validation reads them. Keep the OpenAPI `x-*` extensions in step.
- Assistant-sourced writes (`X-Source-Kind: assistant`) may only record ai-hypothesis, assumption or
  estimate, never confirm, verify, record decisions or pass approval gates.
- Store references to other modules' artifacts (`ArtifactRef`), never copies of their data.

## Commands

```bash
npm run concept:test:db                     # real PostgreSQL (temporary server)
npx vitest run services/conceptualize       # unit tests (domain)
npm run typecheck -w @ews/conceptualize-service
```

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
Conceptualize and AI assignment (strategy §10): investigate reusable open-source reasoning, search, graph, visualization and orchestration infrastructure while preserving the proprietary design reasoning and cross-module intelligence.

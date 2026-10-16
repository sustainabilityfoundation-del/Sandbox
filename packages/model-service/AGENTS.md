# AGENTS.md: @ews/model-service

Shared digital-twin domain model and repository contract: entities and types, `ARTIFACT_OWNER`,
`RELATIONSHIP_RULES` and `DELEGATIONS` (`src/domain/ownership.ts`), configurations, freshness, the
derived `ModelIndex`, projections, units, and the repository (`src/repository`). Framework-free: no
React, no `@ews/*` imports. Owner: Platform (the coordinator). Decisions:
[ADR-0004](../../docs/decisions/0004-revision-history-and-exact-references.md),
[ADR-0006](../../docs/decisions/0006-module-ownership-and-delegation.md),
[ADR-0009](../../docs/decisions/0009-non-destructive-migrations.md); current architecture:
[docs/architecture.md](../../docs/architecture.md).

## Rules

- Exported types are a **shared contract** (root [AGENTS.md](../../AGENTS.md), "Contract changes").
- Every object type has one owning module; a relationship belongs to the module owning its `from`
  end. The repository refuses other writes (`forbidden`, `invalid`). Adding a `DELEGATIONS` entry is an ADR.
- Stored-data changes need a non-destructive migration (add, never rewrite or delete user data)
  with a test on a fixture of the old format. Schema upgrades are additive.
- Deterministic: no clock or randomness in domain logic.

## Commands

```bash
npx vitest run packages/model-service
npm run typecheck -w @ews/model-service
```

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
Capability-complete toolbars (mandatory, owner directive, [directive](../../docs/architecture/CAPABILITY_TOOLBARS.md)): keep this module's full target capability inventory (implemented, partial, planned) in its manifest with evidence for each status; planned commands are shown muted and explained, never executed, and never report success.

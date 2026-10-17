# AGENTS.md: @ews/requirements-client

Browser client of the Requirements API: the HTTP adapter and the explicit demo adapter of the SDK
`RequirementsService` (`src/adapters.test.ts`, `src/demo.test.ts`), plus the module's full typed client.
Owner: the Requirements module. Contracts:
[requirements-contracts.md](../../docs/specifications/requirements-contracts.md) (package table, §3 dependencies);
API: [requirements-api.md](../../docs/specifications/requirements-api.md);
decision: [ADR-0011](../../docs/decisions/0011-requirements-service-boundary.md).

## Rules

- Imports only `@ews/platform-sdk` (types and errors; runs in the browser). Consumers: `tool-requirements`
  (the richer typed client) and `apps/workspace` (constructs the adapter).
- Both adapters implement the same `RequirementsService` contract and pass the same tests; a change
  to one lands in both.
- Writes carry the revision they were based on and an idempotency key; the client never hides a
  `conflict` from the tool. Error codes are the service's; no transport details leak to the UI.
- No credentials or plan checks here: entitlements are enforced by the server.

## Commands

```bash
npx vitest run packages/requirements-client
npm run typecheck -w @ews/requirements-client
npm run req:test:db            # HTTP contract against the real service (services/api/test)
```

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
Capability-complete toolbars (mandatory, owner directive, [directive](../../docs/architecture/CAPABILITY_TOOLBARS.md)): keep this module's full target capability inventory (implemented, partial, planned) in its manifest with evidence for each status; planned commands are shown muted and explained, never executed, and never report success.

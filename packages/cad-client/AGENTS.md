# AGENTS.md: @ews/cad-client

Browser client of the CAD document service: `CadClient` over HTTP (`/api/cad/v1`, `src/http.ts`),
the explicit in-browser local adapter (`src/local.ts`), read helpers, settings, and the contract test
suite (`src/contractTests.ts`) that `services/cad` runs against the real service. Owner: CAD agent.
Contracts: [cad-program-contracts.md](../../docs/specifications/cad-program-contracts.md) §1;
service API: [docs/modules/cad/service.md](../../docs/modules/cad/service.md),
[api.md](../../docs/modules/cad/api.md).

## Rules

- Imports only `@ews/platform-sdk` (root entry) and `@ews/cad-core` (types and validation); no React,
  no DOM beyond `fetch`. The CAD tool (`tool-cad-modeler`) and the workspace are its only consumers.
- HTTP and local adapters behave the same: one contract suite, run in `src/local.test.ts` and in
  `services/cad/test/client.contract.test.ts`. A behaviour change lands in both adapters and the suite.
- Writes send the document revision (`If-Match`) and an `Idempotency-Key`; the client never retries a
  write without one. Errors keep the service's codes; never expose transport details to the tool.
- No credentials in the browser: authentication comes from the host's session.

## Commands

```bash
npx vitest run packages/cad-client
npm run typecheck -w @ews/cad-client
npm run req:test:db            # contract suite against the real service (services/cad/test)
```

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
Capability-complete toolbars (mandatory, owner directive, [directive](../../docs/architecture/CAPABILITY_TOOLBARS.md)): keep this module's full target capability inventory (implemented, partial, planned) in its manifest with evidence for each status; planned commands are shown muted and explained, never executed, and never report success.

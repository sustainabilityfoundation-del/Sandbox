# AGENTS.md: @ews/api

The API host: composes the installed server modules (`src/modules.ts`, `INSTALLED_SERVER_MODULES` and
`ALL_SERVER_MODULES`), development identities and memberships (`src/platform`), entitlement and role
checks, the event stream, API docs, database setup and the embedded PostgreSQL used in development.
Owner: Platform (the coordinator). Specifications:
[module-registration.md](../../docs/specifications/module-registration.md) (server manifests, I1-I3, M1-M6);
architecture: [docs/architecture.md](../../docs/architecture.md).

## Rules

- Imports only `@ews/platform-sdk` and the service packages (`packages/platform-sdk/src/boundaries.test.ts`).
  A module's plugin, docs, artifact source, operations and policy come from its server manifest; the host
  keeps only `register` (it needs host objects: pool, auth, options) at the module's list position.
- Registration order and the AI presentation order are fixed by tests (`src/modules.test.ts`); adding a
  module is adding its manifest to the list, nothing else in shared files.
- Authentication and entitlement checks happen here, once, for every route; services receive
  `authenticate` and `roleOf` and never read plans themselves.
- Never log or return credentials, SQL or stack traces. Production never registers the fake providers.
- Migrations are run in a fixed order by `prepareDatabase`; the twin directories stay host-composed
  until the owner decides otherwise (module-registration.md decision (c)).

## Commands

```bash
npm run dev:api                # backend alone (API :8787, embedded PostgreSQL)
npx vitest run services/api/src
npm run req:test:db            # services/api/test on a disposable real PostgreSQL (all services)
npm run typecheck -w @ews/api
```

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
Capability-complete toolbars (mandatory, owner directive, [directive](../../docs/architecture/CAPABILITY_TOOLBARS.md)): keep this module's full target capability inventory (implemented, partial, planned) in its manifest with evidence for each status; planned commands are shown muted and explained, never executed, and never report success.

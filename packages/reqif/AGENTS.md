# AGENTS.md: @ews/reqif

ReqIF 1.2 reading, writing, XHTML sanitising, `.reqifz` archives and schema validation; no React, no
database. Owner: the Requirements module (root [AGENTS.md](../../AGENTS.md) Ownership). Specification and
interoperability report: [docs/specifications/requirements-reqif.md](../../docs/specifications/requirements-reqif.md);
module contracts: [requirements-contracts.md](../../docs/specifications/requirements-contracts.md).

## Rules

- Imports no `@ews/*` package (`packages/platform-sdk/src/boundaries.test.ts`). Consumed by
  `services/requirements/src/exchange` (import preview and apply, export); the browser never loads it.
- Keep the OMG ReqIF 1.2 basis documented in the specification: namespace, `REQ-IF-VERSION`, the
  schemas used for validation. Changes to what is read or written update the report in the same change.
- Sanitise XHTML on the way in; never emit markup the sanitiser would reject.
- Deterministic output: the same document serialises to the same bytes (tests compare corpora).
- New third-party dependencies are recorded in [docs/dependencies.md](../../docs/dependencies.md) with their licence.

## Commands

```bash
npx vitest run packages/reqif
npm run typecheck -w @ews/reqif
npm run req:test:db        # exchange end to end (services/api/test/exchange.test.ts)
```

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
Capability-complete toolbars (mandatory, owner directive, [directive](../../docs/architecture/CAPABILITY_TOOLBARS.md)): keep this module's full target capability inventory (implemented, partial, planned) in its manifest with evidence for each status; planned commands are shown muted and explained, never executed, and never report success.

# AGENTS.md: @ews/visualization-client

Contract types and browser client of the visualization service (`/api/visualization/v1`): image
generation jobs with idempotent requests, batches with per-item outcomes, retry, cancel, assets and
events (`src/types.ts`, `src/client.ts`). Owner: the AI connection agent (the service owner; the
Conceptualize tool consumes it). Contracts:
[concept-visualization-contracts.md](../../docs/specifications/concept-visualization-contracts.md) §1;
feature: [docs/modules/ai-interface/image-generation.md](../../docs/modules/ai-interface/image-generation.md).

## Rules

- Framework-free and dependency-free: no `@ews/*` imports, no React, no DOM beyond `fetch`
  (`packages/platform-sdk/src/boundaries.test.ts`). `services/visualization` imports the types from
  here, so the types are the contract: a change here is a contract change for the service and the tool.
- Requests are idempotent by design (the key derives from concept revision, instruction, adapter,
  model and reference assets); never add a field that breaks that derivation without updating the service.
- One failed item never discards other results; the client preserves per-item outcomes.
- No credentials or provider details in the browser; the service holds them.

## Commands

```bash
npm run typecheck -w @ews/visualization-client
npm run req:test:db            # service and client exercised through services/api/test
```

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
Capability-complete toolbars (mandatory, owner directive, [directive](../../docs/architecture/CAPABILITY_TOOLBARS.md)): keep this module's full target capability inventory (implemented, partial, planned) in its manifest with evidence for each status; planned commands are shown muted and explained, never executed, and never report success.

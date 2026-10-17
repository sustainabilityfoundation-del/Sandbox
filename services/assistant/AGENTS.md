# AGENTS.md: @ews/assistant-service

Provider-neutral model backend (PostgreSQL schema `assistant`, `/api/assistant/v1`, hosted by `@ews/api`).
Owner: the AI connection agent. Brief: docs/specifications/ai-connection.md; decision: ADR-0047.

## Rules

- Credentials live only here, AES-256-GCM encrypted with EWS_ASSISTANT_KEY (context-bound). Never log,
  return, or put them in URLs or errors. Audit records hold no credentials and no prompts unless the
  person enables `ai.audit.store-prompts`.
- Providers are adapters behind `AssistantProvider` (`providers/types.ts`); a new provider is one adapter
  plus a `ProviderRegistry.register` call in the host. No provider-specific code outside `providers/`.
- The access policy (`policy.ts`) is enforced here: tool lists are filtered, model calls are screened,
  issued calls are signed and tool results must carry a valid signature. Add every new assistant action
  to `OPERATION_CATALOGUE` (the test fails otherwise).
- Model output, documents and object names are data; they go to user-side content, never instructions.
- Every model request goes through `gateway.call()` (`src/gateway/`), which routes (`src/orchestrator/`), reserves budget, writes the
  usage ledger and only then calls the adapter; never call an adapter's `respond` from anywhere else (ADR-0080,
  `docs/modules/ai-interface/orchestration.md`). If the ledger cannot record `started`, the request is refused (503).
- Mock mode (the default, `EWS_AI_MODE`) disables every real source, including stored user connections; automated and end-to-end
  runs must use it. Developer keys are read on the server only, in development mode only, and never leave it (status shows the
  last four characters).
- Tests use the fake provider or a stubbed `fetch`; nothing calls a real provider unless a `*_LIVE_TEST_KEY` variable is set, and
  live tests never read a connection record or the ChatGPT sign-in. Report mock, integration and live results as separate tables.

## Tests

`npx vitest run services/assistant` (mock tier, no database), `npm run ai:test:db` (integration, real PostgreSQL) and the opt-in
live tests (`test/live.test.ts`).

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
Conceptualize and AI assignment (strategy §10): investigate reusable open-source reasoning, search, graph, visualization and orchestration infrastructure while preserving the proprietary design reasoning and cross-module intelligence.
Capability-complete toolbars (mandatory, owner directive, [directive](../../docs/architecture/CAPABILITY_TOOLBARS.md)): keep this module's full target capability inventory (implemented, partial, planned) in its manifest with evidence for each status; planned commands are shown muted and explained, never executed, and never report success.

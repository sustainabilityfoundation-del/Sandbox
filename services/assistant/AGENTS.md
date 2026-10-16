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
- Tests use the fake provider; nothing calls a real provider unless OPENAI_LIVE_TEST_KEY is set.

## Tests

`npx vitest run services/assistant` (unit) and `npm run req:test:db` (API on real PostgreSQL).

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
Conceptualize and AI assignment (strategy §10): investigate reusable open-source reasoning, search, graph, visualization and orchestration infrastructure while preserving the proprietary design reasoning and cross-module intelligence.
Capability-complete toolbars (mandatory, owner directive, [directive](../../docs/architecture/CAPABILITY_TOOLBARS.md)): keep this module's full target capability inventory (implemented, partial, planned) in its manifest with evidence for each status; planned commands are shown muted and explained, never executed, and never report success.

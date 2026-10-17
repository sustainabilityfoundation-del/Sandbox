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
- Mock mode (explicit: `EWS_AI_MODE=mock` or `EWS_ASSISTANT_FAKE_PROVIDER=1`; the default is `user`) disables every real source,
  including stored user connections (they are never decrypted, called, refreshed, revoked, replaced or deleted); automated and
  end-to-end runs must set it. Developer keys are read on the server only, in development mode only, and never leave it (status shows the
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

## Platform context (CE-1, ADR-0085, ADR-0086)

- `src/context/` is the context assembler: it calls each module's `selectContext` read operation in-process through the `ModuleCaller` **as the signed-in person**
  (identity headers forwarded; module permissions and project scope apply), packs mandatory items first within the budget, stores an immutable snapshot in
  `assistant.context_snapshots` (insert-only; never update or delete) and renders neutral `ContextBlock`s. It makes no model call and keeps no copy of project data.
- Retrieved documents and other external content are untrusted: they go in an `external-data` block, labelled, and never override instructions, the access policy or
  tool permissions. A `not-authorized` omission carries no count and no references.
- Injection is `RespondInput.context` behind `ai.context.mode` (`off` default | `digest` | `full`); model calls still go only through `gateway.call` and the ledger
  row carries `context_id`. The fake provider ignores context, so D1 replays are unchanged.
- `services/assistant` may import `@ews/design-reasoning-core` (framework-free; boundaries test). It must not import a module service.

# AI infrastructure: Phase 1 plan

Status: **accepted by the coordinator** (16 October 2026). Implements Phase 1 of the owner's
[AI infrastructure brief](ai-infrastructure-brief.md). Designed by the architect agent (read-only, main cbbb67f); coordinator
decisions are marked. Everything is built **inside `services/assistant`** and the workspace; no new repository, no SDK contract
change in Phase 1.

## 1. What exists and is reused

- Provider contract `services/assistant/src/providers/types.ts` (`listModels`, `validateCredential`, `respond`, cancellation
  `signal`, typed `ProviderError`); usage holds only input and output tokens.
- `ProviderRegistry` (`registry.ts`); the host registers OpenAI and optionally the fake provider (`services/api/src/server.ts`).
- OpenAI adapter (`providers/openai.ts`): plain `fetch`, Responses API, server-sent-event streaming, ChatGPT-plan specifics.
  **Conflict:** `OPENAI_DEFAULT_MODEL = 'gpt-6.1-sol'` is hard-coded (brief: no hard-coded versions); moved to the model registry.
- Fake provider (`fake.ts`, scripted replays), switched on by `EWS_ASSISTANT_FAKE_PROVIDER=1`.
- Credential vault (AES-256-GCM, `crypto.ts`, key `EWS_ASSISTANT_KEY`). Connections allow **one per user** (`UNIQUE(user_id)`);
  developer keys are therefore handled separately from user connections in Phase 1; several connections per user is AI-P4.
- Policy and wire (`policy.ts`, `wire.ts`), every model call through `audited()` in `service.ts` (two dispatch points: `respond`,
  `complete`). The audit table records tokens but is not a ledger (no cost, no idempotency).
- Proposals and the Apply gateway (ADR-0049) unchanged. Workspace: `ModelSelector` exists (`AssistantChrome.tsx`), design-system
  `SelectOption` supports disabled options with a description; AI settings page has Connection and Audit sections. Workspace
  assistant types are local (not SDK), so no SDK change is needed.
- decimal.js 10.6.0 (MIT) is already in the lockfile (via mathjs).
- **Sign in with ChatGPT** (ADR-0047): local loopback only, per user; OpenAI offers it to personal or open-source local use, and a
  hosted paid product needs OpenAI's approval. **Safety gap found:** an end-to-end run against a developer database holding a live
  connection could reach the owner's account; Phase 1 closes it with mock mode (below).

## 2. Target design (inside `services/assistant/src`)

```ts
// providers/types.ts (additive)
export interface ProviderCapabilities { streaming: boolean; tools: boolean; structuredOutput: boolean; imageInput: boolean
  reasoningEffort: boolean; promptCaching: boolean; modelDiscovery: boolean }
export interface ProviderUsage { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; cacheWriteTokens?: number
  reasoningTokens?: number; units?: { dimension: string; quantity: number }[]; raw?: Record<string, unknown>
  reported: 'provider' | 'estimated' }
export interface RespondInput { /* existing */ responseSchema?: Record<string, unknown>; reasoningEffort?: 'low' | 'medium' | 'high'
  attachments?: { mediaType: string; data: Uint8Array }[]; onDelta?: (text: string) => void; extensions?: Record<string, unknown> }
export interface AssistantProvider { /* existing */ readonly capabilities: ProviderCapabilities }
export type ProviderErrorKind = /* existing */ | 'cancelled' | 'content-filtered' | 'context-too-long'
```

- **Adapters.** OpenAI: refactor in place, keep `fetch` (working, carries ChatGPT-plan rules); map cached and reasoning tokens;
  default model from the registry. xAI: reuse the OpenAI Responses core with its own base URL and provider ID (compatibility to
  verify). Anthropic: `@anthropic-ai/sdk`. Gemini: `@google/genai`. Licences and versions verified before adding (open-source
  first); the evaluation ADR also records the Vercel AI SDK, LiteLLM (seed source only), Portkey, models.dev, OpenMeter, Langfuse
  and Lago (AGPL-3.0: excluded).
- **Model registry:** versioned JSON `services/assistant/config/models/<provider>.json` (patterns, capabilities, limits,
  `qualityTier`, `latencyClass`, status, default flag), intersected at run time with the account's `listModels`. Unknown discovered
  models: Manual only, labelled "capabilities unknown"; disabled if unpriced.
- **Pricing registry:** `config/pricing/<provider>.json` (`pricingVersion`, `effectiveFrom`, `currency`, `sourceUrl`,
  `retrievedAt`, `verified`, rates per billing dimension), loaded idempotently into `assistant.pricing`. Ledger rows keep the
  version and rates used (reproducible). Unverified rates are shown as "unverified estimate"; an unpriced model cannot be used
  with developer keys.
- **Gateway and orchestrator:** new `gateway/` and `orchestrator/`; `service.ts` dispatch points call `gateway.call()`;
  `audited()` stays. Routing modes `balanced | quality | economy | manual`; Phase 1 filters by configured and validated account,
  registry capabilities, known price and allowed providers (`ai.routing.mode`, `ai.routing.providers` settings with project
  ceilings), then scores by mode (quality: highest tier; balanced: cheapest of tier 2 or higher; economy: cheapest with reliable
  tool calling). The model is sticky within a turn's tool loop and a conversation. **Coordinator decision:** ChatGPT-plan
  connections are offered in Manual mode only, never in Automatic.
- **Wire (assistant service and workspace only):** `WireRequest.routing`; `ResponseMeta` gains `routing`, the extended usage and
  `cost { estimated, currency, verified, billing: 'meter_only' | 'byok' | 'consumer-plan' | 'mock' }`.
- **Metering:** migration `0003_usage.sql`, insert-only ledger of usage events (`started | completed | failed | cancelled |
  correction`) extending the brief's `AIUsageRecord`, with `idempotencyKey` UNIQUE (`ON CONFLICT DO NOTHING`), `source`, `billing`,
  `usageReported`, `reservedCost`, `simulated`; corrections are compensating rows; money as `numeric(20,10)` and strings on the
  wire (decimal.js); BYOK and consumer-plan rows never carry credits; prompts and responses are never stored in the ledger.
- **Modes:** `EWS_AI_MODE=mock | development` (default `mock` when no key is configured). **Mock mode disables every real source,
  including user connections**; all integration and end-to-end runs must set it, which enforces the owner's rule that automated
  runs never reach the owner's account. `EWS_AI_BILLING_MODE=meter_only` is the only Phase 1 value. **Fail-safe:** if the `started`
  ledger row cannot be written the request is refused (503 `metering-unavailable`); if `completed` fails after retries, a degraded
  flag blocks developer-key calls until a write succeeds.
- **Unverified prices in development (coordinator decision):** in `EWS_AI_MODE=development` a price with `verified: false` is usable and
  its cost is shown as an "unverified estimate"; the development budget (`EWS_AI_MONTHLY_DEV_BUDGET_USD`) is enforced on those estimates.
  A model with no price at all (no record, or a placeholder without rates) stays unusable with developer keys. In production the
  default is 0: unverified prices are refused unless the variable is set explicitly.
- **Schema note:** `context_id` (ECII plan Amendment 2) is added in migration 0004 in increment C, not in 0003.
- **Developer configuration (server only):** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (alias `GOOGLE_AI_API_KEY`),
  `XAI_API_KEY`, read **only when `EWS_AI_MODE=development` and not in production** (so a key already in a shell is never picked
  up by accident; test environments clear them); `EWS_AI_DEFAULT_OPTIMIZATION`, `EWS_AI_MONTHLY_DEV_BUDGET_USD` (default 25),
  `EWS_AI_ALLOW_UNVERIFIED_PRICING` (default 1 in development mode, 0 in production); `EWS_ASSISTANT_FAKE_PROVIDER=1` stays as an alias for mock mode. Validation by
  each provider's model list; an invalid key marks that account invalid without stopping the server. Endpoints
  `GET /developer/status` (providers, last four key characters, validation, models, mode, budget used),
  `POST /developer/providers/:id/validate`, `GET /usage?conversationId=|period=month`.
- **UI (design-system components only):** `ModelSelector` with the three Automatic modes and "Manual · Provider · Model" (disabled
  options explain why); a compact usage badge in the assistant panel ("Balanced · Claude … · $0.0042 est.") opening a breakdown;
  a "Developer" section on the AI settings page, shown only in development; the assistant name comes from the routing decision.

## 3. Boundaries

No engineering module imports provider code; operations, the capability registry (ADR-0074), the access policy and the proposal
gateway are untouched. A boundary test asserts that nothing outside `services/assistant/src/providers` imports a provider SDK.

## 4. Phase 1 increments

| Increment | Scope | Brief §17 criteria (tier) |
| --- | --- | --- |
| **A** contract, registries, metering core (first) | `types.ts`, `config/models` and `config/pricing`, `pricing.ts`, `ledger.ts`, `0003_usage.sql`, decimal.js as a direct dependency | 8, 9, 10, 19, 20 (mock); 12 (integration, PostgreSQL) |
| **B** adapters (after A, parallel with C) | OpenAI refactor, `xai.ts`, `anthropic.ts`, `gemini.ts`, mock personas | 1 conformance suite with recorded-fixture `fetch`, 2 (mock); 4 per-provider live tests gated by `<PROVIDER>_LIVE_TEST_KEY` (live) |
| **C** gateway, orchestrator, developer mode (after A, parallel with B) | `gateway/`, `orchestrator/`, `service.ts` dispatch, `config.ts`, host registration, developer endpoints, routing settings | 3, 11, 13, 17 (integration); 5, 6, 7 (mock); 14 partial (manual fallback refused outside policy) |
| **D** UI, documentation, evidence (last) | `AssistantChrome.tsx`, `AiSettingsPage.tsx`, `connection.ts`, help, mock-mode e2e flow | 15 (mock), 16 (integration), 18 (live, owner keys only, recorded in `d1-live-run.md`) |

Later phases: criterion 14 automatic fallback (Phase 2); credit parts of 11 and 13 (Phase 3). Live tests read only
`*_LIVE_TEST_KEY` variables, never connection records or the ChatGPT sign-in; mock, integration and live results are reported as
separate tables.

## 5. Documentation and ADRs

ARCHITECTURE → `docs/modules/ai-interface/infrastructure.md`; ORCHESTRATION → `orchestration.md`; USAGE_METERING and
PRICING_ARCHITECTURE → `metering-and-pricing.md`; CREDIT_AND_SUBSCRIPTION → `credits-and-subscriptions.md` (design only);
COMMERCIAL_COMPARISON and TERMS → the commercial research files in `docs/modules/ai-interface/` (research running); adapter
contracts, model registry and adding a provider → `docs/modules/ai-interface/provider-connection.md`; development setup →
`.env.example` and `apps/workspace/README.md`; security review and status → `docs/specifications/ai-infrastructure-progress.md`;
backlog → `docs/roadmap.md`; agent rules → root `AGENTS.md` "AI capability design" and `services/assistant/AGENTS.md`.
ADRs (**coordinator: numbers shifted because 0077 is taken**): **0078** multi-provider gateway and adapter library choice (with the
open-source evaluation); **0079** usage ledger, pricing registry and decimal policy; **0080** developer, mock and meter-only modes
and the fail-safe.

## 6. Backlog (Phases 2-5)

- AI-P2-1 deterministic task classifier; AI-P2-2 capability-aware routing; AI-P2-3 provider fallback within policy (criterion 14);
  AI-P2-4 bounded escalation; AI-P2-5 sequential and review workflows; AI-P2-6 engineering benchmark suite; AI-P2-7 streaming to the
  browser; AI-P2-8 visualization image pricing into the registry; AI-P2-9 P1 adapters (DeepSeek, Mistral, Qwen, Llama hosting);
  AI-P2-10 local inference (Ollama, vLLM).
- AI-P3-1..7 credit balances, conversion, reservations and settlement, organization and project budgets, alerts, history,
  reconciliation against provider usage APIs.
- AI-P4-1..8 onboarding, plans, server-side module and AI entitlements, included and purchased credits, payment abstraction
  (Stripe candidate), billing dashboard, production BYOK with several connections per user, secrets manager.
- AI-P5-1..7 performance analytics, adaptive policies, multi-model review, parallel concepts, workflow optimization, enterprise
  provider policies, gross-margin reporting.

## 7. Owner decisions and risks

- **Owner:** confirm the $25 monthly development budget and whether it is one cap across providers (proposed) or per provider;
  provider-side caps must also be set in each provider's console (balances cannot be read). Provider terms questions from the
  commercial research (routing and resale, attribution, retention and training, Gemini free-tier data use). Whether to retire
  "Sign in with ChatGPT" before Phase 4 (hosted commercial use needs OpenAI's approval).
- Risks: SDK churn; prompt caching lost when switching models mid-conversation; unverified prices until reviewed; the
  one-connection-per-user model.

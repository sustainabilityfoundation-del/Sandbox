# AI orchestration: gateway, modes and routing

Status: increment C implemented (Phase 1). Decision: [ADR-0080](../../decisions/0080-developer-mock-and-meter-only-modes-and-the-fail-safe.md).
Plan: [ai-infrastructure-plan.md](../../specifications/ai-infrastructure-plan.md) §2. Metering: [metering-and-pricing.md](metering-and-pricing.md).
Code: `services/assistant/src/{gateway,orchestrator}/`, `services/api/src/config.ts` (`readAiConfig`).

## Where a model request goes

```
browser  POST /respond            server-side caller  complete()
            \                          /
             AssistantBackend (policy, tool screening, audited())
                          |
                     gateway.call()
   1 route -> 2 preflight budget -> 3 ledger started -> 4 adapter -> 5 ledger completed | failed | cancelled
```

Engineering modules never see a provider: they use registered operations, and the access policy, signed tool calls and the
proposal gateway are unchanged. `respond()` loops at most three gateway calls per browser step (when the model asks only for
refused operations); each call is its own ledger request, grouped by a shared `workflow_id`, and by `conversation_id` when the
request carries `turn.conversationId`.

## Modes (`EWS_AI_MODE`, server only)

| Mode | Sources | Notes |
| --- | --- | --- |
| `mock` (default) | mock personas (the scripted fake provider: `fake-small` tier 1, `fake-large` tier 2) | No credentials. **Every real source is off, including stored user connections.** Connecting a real account answers 409 `mock-mode`. Rows are `source=mock`, `billing=mock`, `simulated=true`, cost 0. All integration and end-to-end runs use it |
| `development` | developer keys from `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (alias `GOOGLE_AI_API_KEY`), `XAI_API_KEY`; plus the person's connection | Never in production; keys read only in this mode. Meter-only: nothing is charged to a person. A key for a provider with no adapter is "adapter pending" and never called |
| `user` | the person's own connection | Production, and the default for a host that passes no configuration (the behaviour before the gateway) |

`EWS_ASSISTANT_FAKE_PROVIDER=1` is an alias for mock. Development with no key falls back to mock (with a warning). See
[`.env.example`](../../../.env.example) for all variables.

## Selection

Candidates are the models the mode can reach, each with its account, source, billing, registry entry (tier, tool support), and
the pricing file of its provider. `route()` (a pure function, `orchestrator/route.ts`):

1. **Filters** (all modes): the account is valid; the provider is not switched off in `ai.routing.providers.<provider>` (person
   or project); tool support when operations are offered; for developer keys a known price, verified unless
   `EWS_AI_ALLOW_UNVERIFIED_PRICING` (unverified estimates are labelled), and a complete price for everything a request can use.
2. **Automatic modes also**: only models the registry knows (an unknown discovered model is "capabilities unknown": Manual
   only), no ChatGPT-plan connection (Manual only), and the worst case must fit the remaining development budget.
3. **Scoring**: *quality*: highest tier, then cheapest. *balanced* (default): cheapest of tier 2 or higher; when none is rated,
   the best available. *economy*: cheapest with reliable tool calling. Ties: default model, then name.
4. **Stickiness**: the model of the first call is kept for the tool loop and the conversation (key: conversation, or person and
   project for 15 minutes without one) while it is still eligible and the mode is unchanged.
5. **Manual**: exactly the chosen `routing: { provider, model }` of the request, or the person's own connection when none is
   given. A choice that is unavailable, unpriced, switched off or outside policy is refused (409 `model-unavailable`) with the
   reason; **nothing is substituted**. Fallback across providers is Phase 2 (criterion 14 in full).

If nothing qualifies, the answer is 409 `no-model-available` (or `not-connected` when nothing is configured at all, or 429
`budget-exceeded` when only the budget excludes every model), with the reason of each model in `error.details.considered`.
`GET /routing/options?projectId=` lists every model with `available` (selectable in Manual), `automatic` and `reason`, which is
what the model selector uses to disable options and explain why.

### Settings (project ceilings through `pair()`)

| Setting | Values | Default |
| --- | --- | --- |
| `ai.routing.mode` | `economy`, `balanced`, `quality`, `manual` (ordered; the project limit `ai.routing-ceiling.mode` caps it) | `balanced`, or `EWS_AI_DEFAULT_OPTIMIZATION` |
| `ai.routing.providers.openai` / `anthropic` / `google` / `xai` | on or off (a project limit can only switch off) | on |
| `ai.context.mode` | `off`, `digest`, `full` (project limit `ai.context-ceiling.mode`); recorded only: the context assembler is CE-1 | `off` |

## Wire

`POST /respond` accepts `turn.conversationId` and `routing: { provider, model }` (Manual choice). `meta` gains:

- `routing`: `{ mode, reason, provider, providerName, model, label, source, billing, simulated, sticky, alternatives[] }`;
- `usage`: `{ inputTokens, outputTokens, cachedInputTokens?, cacheWriteTokens?, reasoningTokens?, reported }`;
- `cost`: `{ estimated, currency, verified, billing }` (`estimated` is a decimal string or null; `verified: false` means an unverified
  estimate). Costs are estimates from the pricing in force, not provider invoices.

## Budget and fail-safe

The development budget (`EWS_AI_MONTHLY_DEV_BUDGET_USD`, default 25, one cap across providers, calendar month UTC) counts finished
developer-key requests (the provider's reported cost when settled, else the estimate) plus the worst case reserved by requests in
flight. The check and the reservation are one transaction under an advisory lock (`gateway/metering.ts`, `gateway/budget.ts`):
concurrent requests cannot overrun it. Provider-side caps in each provider's console are still needed (balances cannot be read).

| Failure | Behaviour |
| --- | --- |
| `started` cannot be written | 503 `metering-unavailable`; nothing is sent to a provider |
| `completed` cannot be written after 3 retries | the answer is returned; the event is kept and retried; the gateway is degraded: developer-key calls get 503 `metering-degraded` until a ledger write succeeds; own connections continue |
| worst case does not fit the budget | 429 `budget-exceeded` before anything is sent |

## Developer endpoints (development and mock modes; 404 in `user` mode)

- `GET /developer/status`: mode, billing, `budget { period, limit, used, reserved, remaining }`, `meteringDegraded`, providers with
  `configured`, `keyLast4`, `state` (`valid`, `invalid`, `unreachable`, `unchecked`, `adapter-pending`, `not-configured`), `message`,
  `checkedAt` and `models` (available, automatic, reason, priced, verified); in mock mode the `personas` (all `simulated: true`).
- `POST /developer/providers/:id/validate`: validates a key with the provider's model list.
- `GET /usage?conversationId=` or `?period=month|day`: the caller's own usage from the ledger, real and simulated apart, with the
  budget in development mode.

No response, log line or ledger row contains a key; tests assert it.

## Context hooks (ECII Amendment 2)

`RespondInput.context = { blocks: [{ id, text, trust: 'platform-data' | 'external-data', cacheable }] }` is passed to the adapter. The
OpenAI adapter adds one developer message before the current turn, saying the blocks are data and marking external data as
untrusted. The fake provider ignores it. `usage_events.context_id` and `proposals.context_id` (migration 0004, nullable) are the
chain's anchors. Nothing builds a context yet (CE-1).

## Tests

| Tier | Where | Covers |
| --- | --- | --- |
| mock (`npx vitest run services/assistant`, `services/api/src/config.test.ts`) | `orchestrator/route.test.ts`, `gateway/gateway.test.ts`, `gateway/accounts.test.ts`, `orchestrator/settings.test.ts`, `config.test.ts` | criteria 5, 6, 7, 14 (partial); sequence; fail-safe without a database; mock mode ignores connections; configuration; context hook |
| integration (`npm run ai:test:db`) | `test/gateway.api.test.ts` | criteria 3, 5, 6, 7, 11, 13, 17; atomic reservation; ledger outage gives 503; mock ignores stored connections; ChatGPT plan Manual only; migration 0004 |
| live (opt-in, `OPENAI_LIVE_TEST_KEY`) | `test/live.test.ts` | one metered request with a developer key. Reads only `*_LIVE_TEST_KEY`; never a connection record or the ChatGPT sign-in |

## Limits of Phase 1

Only OpenAI and the fake provider have adapters; no task classifier, fallback or escalation (Phase 2); no credits (Phase 3); the
sticky map is per process; a person's own connection contributes its selected model only.

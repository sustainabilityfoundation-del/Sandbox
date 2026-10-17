# ADR-0080: Developer, mock and meter-only modes, the gateway and the metering fail-safe

Status: Proposed (17 October 2026, AI connection agent; implements increment C of the
[AI infrastructure plan](../specifications/ai-infrastructure-plan.md) §2 and §4; for coordinator review)
Module: AI connection (`services/assistant`, with `services/api/src/config.ts`)

Number check: 0080 is free on main (highest 0079) and on every local branch. 0078 (gateway and adapter library choice) is reserved
for increment B.

## Capability and requirements

The system must work before customer registration, subscriptions or payment exist ([brief](../specifications/ai-infrastructure-brief.md)
§5, criteria 3, 5, 6, 7, 11, 13, 14 partial, 17), and an automated run must never reach the owner's AI account:

- a developer configures provider keys on the server and uses real models with no signup (developer mode, meter-only billing);
- a mode needs no credentials at all and simulates everything (mock mode);
- every model request goes through one dispatch point that routes, enforces a spending limit, and writes the ledger;
- when metering is unavailable the system stops spending instead of spending unmetered.

## Candidates considered

This decision is about modes, policy and a fail-safe over our own ledger (ADR-0079); no library supplies those. The gateway and
routing libraries themselves are evaluated in ADR-0078 (increment B), which also owns versions and licence verification:

| Candidate | What it would replace | Outcome here |
| --- | --- | --- |
| LiteLLM (proxy or SDK) | provider normalisation and a budget feature | Not adopted in C: Python service; its budgets live outside the platform's PostgreSQL ledger and cannot give the insert-only, reproducible record of ADR-0079. Kept as a seed source for prices (ADR-0078) |
| Portkey gateway | routing and fallback | Not adopted in C: a second gateway in front of ours; routing policy depends on platform settings, project ceilings and entitlements which live here |
| Vercel AI SDK | adapters (not routing) | Decided in ADR-0078 for adapters; nothing in C depends on it |
| OpenRouter or similar aggregators | provider access with one key | Not adopted: resale and routing terms are open owner questions (plan §7); a hosted aggregator would also see the prompts |
| Built-in gateway and rules-based orchestrator | | **Adopted.** Phase 1 selection is a few deterministic filters and three scoring rules over data already in the registries; no new dependency |

No dependency is added in this increment.

## Decision

### Modes (`EWS_AI_MODE`)

| Mode | Sources | Billing | Ledger |
| --- | --- | --- | --- |
| `mock` (explicit only: `EWS_AI_MODE=mock` or `EWS_ASSISTANT_FAKE_PROVIDER=1`) | the scripted fake provider as mock personas only. **Every real source is disabled, including a person's stored connection.** Connecting a real account is refused (409 `mock-mode`); image generation honours only a fake-provider connection | `mock` | `source=mock`, `simulated=true`, cost 0 |
| `development` (explicit, never in production) | developer keys from the server environment, plus the person's own connection | `meter_only`: usage and estimated cost recorded, no credits, no payment | `source=developer-key`, `billing=meter_only` |
| `user` (**the default**: `EWS_AI_MODE` unset and no fake flag; production) | the person's own connection only; developer keys are not read | `byok` or `consumer-plan` | `source=user-connection` |

`EWS_ASSISTANT_FAKE_PROVIDER=1` stays as an alias for mock mode. Development without any provider key falls back to user mode with a
warning. Every automated stack sets mock explicitly (`npm run ai:dev:fake`, the e2e recipes, the test environments). In production `EWS_AI_MODE` and the fake provider alias are ignored (with a warning). Developer keys are read **only** in
development mode and never in production, so a key already in a shell is not picked up by accident; the test environments clear the
variables. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (alias `GOOGLE_AI_API_KEY`), `XAI_API_KEY`;
`EWS_AI_MONTHLY_DEV_BUDGET_USD` (25, one cap across providers), `EWS_AI_DEFAULT_OPTIMIZATION` (balanced),
`EWS_AI_ALLOW_UNVERIFIED_PRICING` (1 in development, 0 elsewhere). Keys live in server memory (`DeveloperAccounts`) and are never
serialised: the status endpoint returns the last four characters only. A key is validated with the provider's model list; an invalid
key marks its account invalid and never stops the server. A configured key for a provider without a registered adapter is reported
as "adapter pending" and never called (Phase 1 has the OpenAI and fake adapters; increment B adds the rest).

### The gateway (`gateway.call()`)

The single dispatch point replaces the two dispatch points in `service.ts` (`respond`, `complete`); `audited()` stays. In order:

1. route (orchestrator); 2. preflight budget; 3. ledger `started`; 4. adapter call; 5. ledger `completed`, `failed` or `cancelled`,
priced with `priceUsage` and the applied modifiers.

**Preflight.** For developer keys, in one transaction: an advisory lock for the month (`pg_advisory_xact_lock`), the month's
used cost plus the worst-case reservations of requests in flight (`started` rows without an end event, ignored after 15 minutes),
and, if the request's worst case (input estimate at the input rate, the output limit at the output rate) fits, the `started` row
with `reserved_cost`. Concurrent requests therefore cannot overrun the budget. A request that does not fit is refused 429
`budget-exceeded` before anything is sent. Automatic modes also skip models whose worst case exceeds the remaining budget.
People's own connections and mock usage do not count against the development budget.

### Fail-safe

- If `started` cannot be written the request is **refused with 503 `metering-unavailable`** and nothing is sent to a provider.
  This applies in every mode: **in user mode too, a ledger outage now refuses the person's own connection's calls** (the owner
  accepted metering as a precondition of any model call; before the gateway such calls needed no ledger).
- If an end event cannot be written after retries (100, 400 and 1600 ms), the answer is still returned (the call happened), the
  event is kept in memory and retried, and the gateway is **degraded**: developer-key calls are refused (503 `metering-degraded`)
  until the unwritten events have been written (the state does not clear while any is pending); they are counted in budget
  checks meanwhile. A person's own connection is not blocked by the degraded state (only by an outage at `started`).
  Developer-key usage that cannot be priced is charged to the budget at its reserved worst case, never as zero.
- Mock mode is metered the same way, which is what lets the same tests prove the fail-safe.

### Orchestrator

Modes `balanced` (default), `quality`, `economy` and `manual`; Phase 1 filters (valid account, allowed provider, tool support, a
known price for developer keys, verified price unless unverified prices are allowed, budget fit) and scoring (quality: highest
tier; balanced: cheapest of tier 2 or higher, else the best available; economy: cheapest with tool calling). Models the registry does
not know are Manual only. **In development mode a ChatGPT-plan connection is offered in Manual mode only; in user mode the person's own connection is always usable in every routing mode** (unknown model and ChatGPT plan included; an unpriced model is metered with a null cost), so the owner's connection works with no settings change. Stickiness: the model of the first call
stays for the tool loop and the conversation while it remains eligible and the mode is unchanged (in memory; lost on restart, which
costs only prompt-cache reuse). Manual never substitutes another model: an unavailable, unpriced or out-of-policy choice is refused with
the reason (fallback across providers is Phase 2 and must respect the same filters).
Settings (project ceilings through `pair()`): `ai.routing.mode` (ordered economy, balanced, quality, manual), one switch per provider
`ai.routing.providers.<provider>`, and `ai.context.mode` (`off`, `digest`, `full`; default `off`). The mode comes only from the
person's settings; a request carries just the Manual choice (`routing: { provider, model }`).

### Wire and ledger

`ResponseMeta` gains `routing` (mode, reason, provider, model, source, billing, simulated, sticky, alternatives with reasons),
`usage` (tokens by kind, `reported`) and `cost { estimated, currency, verified, billing }`; the estimate is never an invoice.
`RespondInput.context` (ECII Amendment 2) is passed through; the OpenAI adapter puts it in a developer message before the turn,
labelled as data; the fake provider ignores it. Migration 0004 adds nullable `context_id` to `usage_events` and `proposals`. The
context assembler is CE-1 and is not built here.

### Endpoints

`GET /developer/status`, `POST /developer/providers/:id/validate` (404 outside development or mock mode), `GET /usage?conversationId=|period=month`
(the caller's own usage, real and simulated apart), `GET /routing/options` (every model with whether it can be chosen or is eligible
automatically, and why not).

## Licence assessment

No library is added or linked. Nothing changes the licence position of ADR-0079 (decimal.js, MIT).

## Consequences

- `npm run dev` keeps its behaviour: without configuration the mode is `user` and a stored connection (the owner's ChatGPT sign-in)
  works as before, now metered as `consumer-plan` or `byok`. Automated runs never reach it because they set mock explicitly, and
  mock ignores stored connections. Developer keys need `EWS_AI_MODE=development`.
- In development mode a ChatGPT-plan connection is used only when Model selection is Manual; in user mode it works in every mode.
- Mock mode never touches a stored real connection: the connection endpoints treat it as absent (no decrypt, no provider call, no
  refresh, no revoke, no delete), a fake connection will not replace it, and the status endpoint does not show it. `ai:dev:fake`
  shares the development database with `npm run dev`, so this is what keeps the owner's sign-in safe.
- A person's own connection contributes its selected model only; changing it is `PUT /connection/model`.
- Risks: unverified prices make budget enforcement approximate (shown as "unverified estimate"); provider-side caps in each
  provider's console remain necessary because balances cannot be read; the sticky map and the pending-event queue are per process.
- Follow-ups: increment B (adapters make "adapter pending" providers usable), D (selector, usage badge, developer panel), Phase 2
  (task classification, fallback within policy, escalation), CE-1 (context assembler), Phase 3 (credits).

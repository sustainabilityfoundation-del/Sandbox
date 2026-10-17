# AI infrastructure: progress

## Status (updated 17 October 2026)

- **State:** A merged (main 5c0537b). **Increment C ready for review (coordinator)**; B (adapters, parallel) and D (UI) not part of this branch
- **Branch / worktree (C):** `feature/ai-infra-c-gateway` / `.claude/worktrees/agent-a7f28124df8742854`; based on main 5c0537b; not merged
- **Done since last checkpoint:** gateway (`gateway.call`, preflight reservation under an advisory lock, fail-safe), orchestrator (balanced, quality, economy, manual; stickiness; ChatGPT plan Manual only), `ai.routing.*` and `ai.context.mode` settings with project ceilings, mock and development modes with `readAiConfig`, developer endpoints, `/usage`, `/routing/options`, `RespondInput.context`, migration 0004, tests in three tiers, ADR-0080, orchestration.md, `.env.example`
- **In progress:** none
- **Next actions:** 1. coordinator reviews and merges C (and B); 2. B: adapters register in the `ProviderRegistry`, which turns "adapter pending" providers usable with no gateway change, and add model-registry entries with tiers (the balanced mode falls back to "best available" while tiers are empty); 3. D: model selector over `GET /routing/options`, usage badge, Developer section over `GET /developer/status`
- **Blockers and open change requests:** none
- **Decisions needing the coordinator:** ADR-0080 acceptance; the default of `npm run dev` is now mock mode (stored connections ignored; real use needs `EWS_AI_MODE=development` and a key); a ChatGPT-plan connection works only with Model selection = Manual until D adds the selector
- **Verification:** see "Increment C" below (A's results under "Increment A")

Brief: [ai-infrastructure-brief.md](ai-infrastructure-brief.md). Plan: [ai-infrastructure-plan.md](ai-infrastructure-plan.md).
Design: [metering-and-pricing](../modules/ai-interface/metering-and-pricing.md), [ADR-0079](../decisions/0079-usage-ledger-pricing-registry-and-decimal-policy.md).

## Increment A: contract, registries, metering core

| Item | State |
| --- | --- |
| `ProviderCapabilities`, `ProviderUsage` (cached, cache-write incl. 1 h, reasoning, units, raw, providerCost, reported), `RespondInput` additions, new error kinds | done; OpenAI and fake adapters declare capabilities; OpenAI maps cached and reasoning tokens |
| Model registry, loader, validation, `intersectModels`; default model moved out of code | done (`OPENAI_DEFAULT_MODEL` deprecated re-export) |
| Pricing registry and `pricing.ts` (decimal.js) | done; seeded from `provider-pricing-seed.json`, all `verified: false` |
| Migration `0003_usage.sql`, `ledger.ts` | done |
| Tests: 8, 9, 10, 19, 20 (mock); 12 (PostgreSQL) | done |
| Docs and dependency record | done |

Brief §17 results are reported in three tiers: mock (`npx vitest run services/assistant`), integration (`npm run ai:test:db`), live
(none in this increment; no provider was called).

## Increment C: gateway, orchestrator, developer mode

Design: [orchestration.md](../modules/ai-interface/orchestration.md), [ADR-0080](../decisions/0080-developer-mock-and-meter-only-modes-and-the-fail-safe.md).

| Item | State |
| --- | --- |
| `gateway.call()` (route, reservation under an advisory lock, `started`, adapter, `completed`/`failed`/`cancelled` priced with `priceUsage`); `service.ts` `respond` and `complete` use it; `audited()` kept | done |
| Fail-safe: `started` unwritable gives 503 `metering-unavailable`; `completed` unwritable after retries degrades and blocks developer-key calls (503 `metering-degraded`) until a write succeeds | done |
| Orchestrator: balanced, quality, economy, manual; Phase 1 filters and scoring; stickiness; ChatGPT plan Manual only; Manual never falls back | done |
| Settings `ai.routing.mode`, `ai.routing.providers.<provider>`, `ai.context.mode` with project ceilings (`pair()` moved to `settingsPair.ts`) | done |
| `RouteDecision` in `ResponseMeta` (`routing`, extended `usage`, `cost`) | done |
| `EWS_AI_MODE` mock (default; every real source off, stored connections ignored, real connect refused) and development; `readAiConfig` in `services/api/src/config.ts`; budget, optimization and unverified-pricing variables; test environments clear the keys | done |
| `GET /developer/status`, `POST /developer/providers/:id/validate`, `GET /usage`, `GET /routing/options` | done |
| `RespondInput.context` (OpenAI developer message; fake ignores); migration 0004 `context_id` on `usage_events` and `proposals`; no assembler | done |
| ADR-0080, orchestration.md, `.env.example`, AGENTS.md rules | done |

Brief §17 criteria by tier (full list: orchestration.md "Tests"):

| Tier | Command | Criteria and checks |
| --- | --- | --- |
| mock | `npx vitest run services/assistant services/api/src/config.test.ts` | 5, 6, 7, 14 partial (route tests); gateway sequence, fail-safe without a database, mock mode ignores connections, configuration, context hook, settings with ceilings |
| integration | `npm run ai:test:db` (PostgreSQL) | 3, 5, 6, 7, 11, 13 (HTTP race and the lock itself), 17 (no key in status, usage, audit, routing options or logs), 14 partial (Manual refused outside policy), ledger outage gives 503, mock ignores a stored connection, ChatGPT plan Manual only, migration 0004 |
| live | `OPENAI_LIVE_TEST_KEY=… npx vitest run --config services/api/vitest.db.config.ts services/assistant/test/live.test.ts` | one metered request with a developer key; skipped without the key; not run in this increment (no key was used) |

Verification run on this branch: `npm run check` (115 files, 1577 tests passed, 3 skipped), `npm run build`, `npm run ai:test:db`
(19 files passed, 174 tests passed, live skipped), `npm run deps:check` (policy check passed), `services/api` tests on PostgreSQL
(11 files, 113 tests). End-to-end in mock mode on own ports (API 38787, workspace 35173, PostgreSQL 54599, data `.data/pg-aic`,
`.data/objects-aic`, `EWS_AI_MODE` unset = mock): `ai-fake-provider` PASS (82 s), `ai-headless` PASS (11 s), `demo-d1` PASS (68 s);
the ledger then held 51 simulated requests and no real one.

## Notes and open issues

- The model registry holds only gpt-6.1-sol and gpt-6-luna (what the adapter and tests already used). Other models in the pricing
  seed have prices but no registry entry (so they cannot be selected); adding them with sourced capabilities and limits belongs to B.
- Not done by design (later increments): UI (selector, usage badge, developer panel: D), Anthropic/Google/xAI adapters (B),
  outdated-pricing warnings, credits, task classifier and provider fallback (Phase 2), the context assembler (CE-1).
- Open issues from C (for the coordinator):
  1. The default of `npm run dev` is now mock: stored connections are ignored and real accounts cannot be connected until
     `EWS_AI_MODE=development` (with a key) is set. This is the owner's rule enforced in code; document it in the owner walkthrough.
  2. With the default `balanced` mode and no tiers in the OpenAI registry entries, balanced picks the cheapest available registry
     model ("best available"); B should add `qualityTier` values so the Phase 1 scoring is meaningful.
  3. A ChatGPT-plan connection needs Model selection = Manual (settings page) until D adds the selector.
  4. A person's own connection offers its selected model only; automatic modes do not switch it. The sticky map and the queue of
     unwritten ledger events are per process (a restart loses them; the events are lost only if the process stops while degraded).
  5. `services/api/src/config.ts` now imports `DEVELOPER_PROVIDERS` and types from `@ews/assistant-service` (value import).
  6. Live tier not run: no `*_LIVE_TEST_KEY` was used.

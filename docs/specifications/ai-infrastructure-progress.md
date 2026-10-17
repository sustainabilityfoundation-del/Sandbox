# AI infrastructure: progress

## Status (updated 16 October 2026)

- **State:** increment A ready for review (coordinator); B, C, D not started
- **Branch / worktree:** `feature/ai-infra-a-core` / `.claude/worktrees/agent-aed664aa90becf5ae`; based on main 31db8b4
- **Done since last checkpoint:** provider contract additions, model registry, pricing registry seeded from the commercial research (unverified), usage ledger and migration 0003, tests, ADR-0079, metering-and-pricing.md
- **In progress:** none
- **Next actions:** 1. coordinator reviews and merges A; 2. increment B (adapters; map Anthropic/Google/xAI usage into `ProviderUsage`, add real model IDs to the model registry); 3. increment C (gateway calls `UsageLedger`, `priceUsage`; fail-safe; developer endpoints)
- **Blockers and open change requests:** none
- **Decisions needing the coordinator:** ADR-0079 acceptance; whether `display:<name>` pricing models are acceptable until adapters map IDs
- **Verification:** see "Increment A" below

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

## Notes and open issues

- The model registry holds only gpt-6.1-sol and gpt-6-luna (what the adapter and tests already used). Other models in the pricing
  seed have prices but no registry entry (so they cannot be selected); adding them with sourced capabilities and limits belongs to B.
- `service.ts` was touched only to extend its exhaustive provider-error status map for the three new error kinds.
- Not done by design (later increments): gateway use of the ledger, fail-safe, developer endpoints, UI, Anthropic/Google/xAI adapters,
  outdated-pricing warnings, credits.

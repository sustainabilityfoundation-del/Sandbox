# AI metering and pricing

Status: increment A implemented (contract, registries, ledger core; not yet called by the gateway, which is increment C).
Decision: [ADR-0079](../../decisions/0079-usage-ledger-pricing-registry-and-decimal-policy.md). Brief:
[§8 and §9](../../specifications/ai-infrastructure-brief.md). Plan: [ai-infrastructure-plan.md](../../specifications/ai-infrastructure-plan.md).
Code: `services/assistant/src/{models,pricing,ledger}.ts`, `config/models`, `config/pricing`, migration `0003_usage.sql`.

## Model registry

`services/assistant/config/models/<provider>.json`, schema version 1, validated on load (`validateModelRegistry` lists every
problem with its path). An entry has an exact `id` (or a `*` pattern), `label`, `status` (active, preview, deprecated), optional
`qualityTier` (1-3), `latencyClass`, `capabilities` (the `ProviderCapabilities` keys), `limits` and `sourceUrl`. Exactly one entry
is `default: true`. Model IDs live only here: `OPENAI_DEFAULT_MODEL` is a deprecated re-export read from the registry, and a test
fails if a provider source file mentions a registry model ID.

`intersectModels(registry, listModels())` returns `available` (known and offered), `unknown` (offered but not in the registry:
Manual only, "capabilities unknown") and `unavailable` (in the registry, not on this account).

## Normalised usage (`ProviderUsage`)

| Field | Meaning |
| --- | --- |
| `inputTokens` | total input including cached and cache-write tokens |
| `cachedInputTokens`, `cacheWriteTokens` | subsets of input; `cacheWrite1hTokens` is the part written with the 1 hour lifetime |
| `outputTokens` | total output including reasoning |
| `reasoningTokens` | subset of output |
| `units` | non-token dimensions, e.g. `{ dimension: 'image', quantity: 2 }` |
| `raw` | the provider's usage object (numbers only reach the ledger) |
| `providerCost` | cost the provider reported (xAI `cost_in_usd_ticks`: `ticksToUsd`, 1e10 ticks = 1 USD) |
| `reported` | `provider` or `estimated` |

Provider conventions the adapters (increment B) convert: OpenAI and xAI `input_tokens` already include cached tokens
(`input_tokens_details.cached_tokens`) and `output_tokens` include `output_tokens_details.reasoning_tokens`. Anthropic
`input_tokens` excludes cache reads and writes: total input is the sum of the three fields; thinking is
`output_tokens_details.thinking_tokens`. Google reports `thoughtsTokenCount` apart from the candidates count: add it to output.

## Pricing registry

`config/pricing/<provider>.json`: records by `(pricingVersion, model, serviceTier, contextBand)` with `effectiveFrom`, `currency`,
`verified`, `sourceUrl`, `retrievedAt`, `sourceVersion` and `rates`. A rate is `{ price, per, unit? }` (decimal string price for
`per` units) or `{ per, tiers: [{ upTo, price }] }` (graduated). Dimensions: `input`, `output`, `cachedInput`, `cacheWrite`
(`cacheWrite5m`, `cacheWrite1h` where lifetimes are priced apart), `reasoning`, and any per-unit name (`image`, `second`,
`request`, `webSearchCalls`, `cacheStorage` ...). File-level `sharedRates` hold model-independent tool fees
(`withSharedRates` merges them under a record) and `modifiers` hold batch, priority, regional and residency multipliers, applied
only when the caller selects them (`snapshotOf(record, [modifier])`).

Resolution: `resolvePricing(records, model, at, { serviceTier, inputTokens })` takes records effective on the date, matching
the tier and the context band, exact model before pattern, latest `effectiveFrom`. Scheduled price changes are separate,
later-dated records. A record with no rates (or no record) is unpriced: `total` is `null` and developer-key use must be refused
(increment C).

Fallbacks when a provider has no special rate: cached, cache-write and reasoning tokens are billed at the input / output rate
(the line shows `billedAs`).

**Seed.** The files were generated from the commercial research seed with
`node services/assistant/scripts/import-pricing-seed.mjs docs/modules/ai-interface/provider-pricing-seed.json`. Every record is
`verified: false`; providers state no effective date, so `effectiveFrom` is the retrieval date (16 October 2026). Anthropic,
Google and xAI pages mostly give display names: those records use `display:<name>` as the model until adapters map API IDs. To
verify a price, a person checks it against `sourceUrl`, then publishes a new `pricingVersion` with `verified: true`
(versions are immutable once loaded into `assistant.pricing`).

## Cost calculation (`pricing.ts`)

decimal.js throughout ([decimal policy](../../decisions/0079-usage-ledger-pricing-registry-and-decimal-policy.md)).
`calculateCost(usage, record)` returns lines per dimension, `missing` dimensions, `total` (10 decimals, or `null` if anything
used is unpriced) and `pricedTotal`. Uncached input = input minus cached minus cache-write; plain output = output minus reasoning.
`costFromSnapshot(usage, ratesUsed)` is the same function over the snapshot stored with a ledger row, which is how historical
costs are reproduced after the registry changes.

## Usage ledger (`ledger.ts`, `assistant.usage_events`)

Insert-only (trigger), idempotent (`idempotency_key UNIQUE`, `ON CONFLICT DO NOTHING`), money `numeric(20,10)`.
Events: `started` (reservation, excluded from totals), `completed`, `failed`, `cancelled`, `correction`. Fields: the brief §8.2
set plus `event`, `source` (developer-key, user-connection, mock), `billing` (meter_only, byok, consumer-plan, mock),
`usage_reported`, `reserved_cost`, `simulated`, `conversation_id`, `pricing_version`, `rates_used`, `corrects_event_id`.
There is no column for prompts or responses; `raw` usage is reduced to numbers.

- BYOK and consumer-plan rows never carry `credits_charged` (checked in code and by a table constraint); mock rows are simulated.
- `UsageLedger.record`, `get`, `list`, `aggregate({ groupBy: 'conversation' | 'operation' | 'period', ... })`,
  `correct` (signed deltas) and `reverse`; `priceUsage` fills the cost fields of a completed event; `syncPricing` loads the
  pricing files idempotently.

## Tests (brief §17)

| Criterion | Tier | Where |
| --- | --- | --- |
| 8 usage normalised | mock | `src/metering.test.ts` |
| 9 provider-specific cost | mock | `src/pricing.test.ts` |
| 10 several billing structures | mock | `src/pricing.test.ts` |
| 19 historical reproducibility | mock (and a database round trip) | `src/pricing.test.ts`, `test/ledger.db.test.ts` |
| 20 BYOK carries no credits | mock; constraint in integration | `src/metering.test.ts`, `test/ledger.db.test.ts` |
| 12 duplicate events, one row | integration (PostgreSQL, `npm run ai:test:db`) | `test/ledger.db.test.ts` |

All pricing numbers in tests are labelled test fixtures, not provider prices.

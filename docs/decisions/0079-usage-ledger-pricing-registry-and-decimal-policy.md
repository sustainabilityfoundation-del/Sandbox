# ADR-0079: Usage ledger, pricing registry and decimal policy: build, integrate or extend

Status: Proposed (16 October 2026, AI connection agent; implements increment A of the
[AI infrastructure plan](../specifications/ai-infrastructure-plan.md) §4; for coordinator review)
Module: AI connection (`services/assistant`)

Number check: 0079 is free on main (highest 0074), on `cad/c1-sketching-reliability` (highest 0076) and on
`ui/retire-illustrative-rename-system-model` (0077). 0078 and 0080 are reserved by the plan for the gateway and the modes.

## Capability and requirements

Every chargeable provider request must be recorded once, priced reproducibly and aggregated by conversation, operation and period
([brief](../specifications/ai-infrastructure-brief.md) §8, §9, criteria 8, 9, 10, 12, 19, 20):

- an append-only, idempotent, concurrency-safe ledger; compensating corrections; no prompts or responses stored;
- pricing that is not limited to input and output tokens (cached input, cache writes by lifetime, reasoning, images, seconds,
  requests, tool fees, tiers, long-context bands, service tiers, batch and regional multipliers, scheduled changes), versioned,
  with sources, and reproducible after prices change;
- decimal-safe money; the provider's own reported cost kept as the actual cost (xAI `cost_in_usd_ticks`);
- BYOK and consumer-plan usage never carries platform credits.

## Candidates considered

Decimal arithmetic:

| Candidate | Upstream | Version checked | Licence (verified) | Maturity and activity | Fit |
| --- | --- | --- | --- | --- | --- |
| decimal.js | github.com/MikeMcl/decimal.js | 10.6.0 (npm modified 2025-07-06) | MIT (npm registry `license` field and repository) | Long-lived, very widely used; already in our lockfile through mathjs | Arbitrary precision, configurable rounding, string input and output, no dependencies |
| big.js | github.com/MikeMcl/big.js | 7.0.1 (npm modified 2025-06-19) | MIT (npm registry) | Same author, minimal | Smaller, but fixed `div` precision and rounding; no `min`/`neg`-style helpers we use; a second library with no gain |
| dinero.js | github.com/dinerojs/dinero.js | 2.0.2 (npm modified 2026-03-13) | MIT (npm registry) | Active | Integer minor units per currency; cannot represent fractions of a cent per token (rates like 0.0000025 USD) without a custom scale, which defeats its purpose |
| Internal (bigint scaled integers) | none | none | none | none | Possible, but re-implements division, rounding and tiers for no benefit |

Metering approach:

| Candidate | Upstream | Version checked | Licence (verified) | Maturity and activity | Fit |
| --- | --- | --- | --- | --- | --- |
| OpenMeter | github.com/openmeterio/openmeter | `main`, pushed 2026-10-16 | Apache-2.0 (LICENSE file, GitHub licence metadata) | Active; usage metering and billing platform | Needs a separate server stack (event store, aggregation); suits event metering at scale; our records must live in the platform's PostgreSQL with project, module and workflow attribution and credits later; adds deployment weight to a local-first prototype |
| Langfuse | github.com/langfuse/langfuse | `main`, pushed 2026-10-16 | MIT for the core; directories `ee/`, `web/src/ee/`, `worker/src/ee/` under a separate commercial licence (LICENSE file; GitHub reports "NOASSERTION") | Active; LLM observability (traces, cost) | Observability, not a financial ledger: no insert-only guarantee, idempotent accounting, credits or reproducible pricing contract; stores traces and prompts by design, which the brief forbids in billing records; multi-service stack (ClickHouse, Redis, object storage) |
| Lago | getlago.com | not evaluated beyond the plan | AGPL-3.0 per the plan | n/a | Excluded: AGPL needs explicit licensing approval |
| Built-in ledger (PostgreSQL) | this repository | n/a | n/a | n/a | One table in the existing `assistant` schema, one transaction, constraints that enforce the rules |

## Licence assessment

decimal.js is MIT (preferred category); it ships in the server only. No notice obligations beyond the licence text, which the
third-party notices already carry through mathjs. OpenMeter (Apache-2.0) and Langfuse (MIT core, commercial `ee/`) are not
adopted; nothing is linked. If Langfuse is used later for trace observability it must be the MIT part only, run as a separate
service, with prompt storage disabled by default.

## Integration design

- `ledger.ts` over `assistant.usage_events` (migration 0003): `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING`; a trigger
  refuses UPDATE, DELETE and TRUNCATE; corrections are `correction` rows with signed deltas pointing at the original;
  `CHECK` constraints enforce "no credits on byok or consumer-plan rows" and "mock rows are simulated"; money is `numeric(20,10)`.
- `pricing.ts` over `config/pricing/<provider>.json` (also loaded into `assistant.pricing`; a version is immutable). Each row keeps
  `pricing_version` and the `rates_used` snapshot; `costFromSnapshot(usage, snapshot)` reproduces the cost from the row alone.
- Usage normalisation is fixed in `ProviderUsage` (input includes cached and cache-write tokens; output includes reasoning). The
  adapters of increment B convert Anthropic (input excludes cache tokens) and Google (thinking reported apart) into it.
- The ledger, not the wire, carries money; the wire gets strings. Replacing the ledger later (for example by OpenMeter) means
  reimplementing `UsageLedger`; callers use its interface only.

## Decision

Integrate decimal.js (direct dependency of `@ews/assistant-service`, version already locked) and build the ledger and the
pricing registry internally in the existing PostgreSQL schema. No candidate offers an insert-only, idempotent, reproducible
ledger with credits-later semantics, attribution to platform projects and modules, and no stored prompts, without a second
server stack. Internal development is justified by "unacceptable integration constraints" (extra services, prompt storage) and
by the ledger being the product's financial source of truth.

## Decimal policy

1. Money and rates are decimal strings in files, JSON and API payloads and decimal.js values in code; never JS numbers.
2. One context (`Money`: 50 significant digits, round half up), rounded once, at `MONEY_SCALE` 10 decimals, when a total is
   produced; intermediate sums are not rounded.
3. Token and unit counts are integers; quantities are converted to decimals only at the pricing boundary.
4. The database stores `numeric(20,10)`; aggregation sums in PostgreSQL and returns text.
5. Unpriced usage is reported as unpriced (`total: null`), never as zero.

## Pricing rules decided with the review

1. A snapshot (`rates_used`) holds the record's rates merged with the file's shared rates (tool and search fees) and the selected
   modifiers as discounts with the dimensions they apply to; `costFromSnapshot` reproduces the stored cost exactly.
2. A modifier applies to token dimensions only unless it lists `appliesTo`. A modifier with a `serviceTier` (for example
   `batchDiscount` with `batch`) is refused when the matched record is already that tier, so a discount is never counted twice.
3. A negative uncached input (cached plus cache-write tokens above `inputTokens`) is an adapter double count and raises
   `PricingError`, it is not clamped. A 1 hour cache write with no 1 hour rate is billed at the 5 minute cache-write rate.
4. A replayed idempotency key with different content raises `idempotency-mismatch` (a content hash is stored); compensating rows
   also reverse `credits_charged` and `reserved_cost`; aggregation groups by currency.
5. **Unverified prices in development (coordinator decision):** in `EWS_AI_MODE=development` unverified prices are usable as
   "unverified estimate" and the development budget is enforced on those estimates. `EWS_AI_ALLOW_UNVERIFIED_PRICING` defaults
   to 1 in development and 0 in production. Models with no price at all stay unusable with developer keys.
6. `context_id` (ECII plan Amendment 2) arrives in migration 0004 (increment C), not in 0003.

## Contribution opportunities

None identified. Nothing is published or submitted upstream.

## Consequences

- New direct dependency decimal.js (recorded in [dependencies.md](../dependencies.md)); migration 0003 (additive).
- The seeded prices come from the commercial research (`provider-pricing-seed.json`, 406 records) and are all `verified: false`;
  they are shown as unverified estimates until a person checks each against its source and publishes a new `pricingVersion`.
- Risks: price drift (mitigated by effective dates and the "outdated pricing" warning in a later increment); multipliers
  (batch, priority, region) are explicit modifiers the caller selects, not inferred; Anthropic, Google and xAI records that
  list only display names use `display:<name>` models until adapters map real IDs.
- Follow-ups: increments B-D (adapters, gateway and fail-safe, UI); credits (Phase 3) will add credit rows with their own
  constraints; reconciliation against provider usage APIs.

# AI provider commercial comparison (brief §4.1 to §4.3, §4.5)

Status: research note, Phase 1 item 16, retrieved **16 October 2026**. Deliverable `AI_PROVIDER_COMMERCIAL_COMPARISON` of the
[AI infrastructure brief](../../specifications/ai-infrastructure-brief.md) §18. Companion files:
[provider-terms-and-restrictions.md](provider-terms-and-restrictions.md) (contractual terms, legal-review list) and
[provider-pricing-seed.json](provider-pricing-seed.json) (machine-readable price seed, every record `"verified": false`).
Confidence: medium. Prices and field names were read from the official pages named below by an automated fetch and summariser on
the retrieval date; a person must check the figures against the sources before they enter the pricing registry (brief §9.4).

**Rules applied.** Official provider documentation only. A fact not found there is written "not found in official sources"; no gap
is filled by assumption. Prices are "as of 16 October 2026" and model IDs are those listed on that date, not permanent facts (brief
§3: do not hard-code model versions). No consumer subscription is assumed to include API access or credits; each provider is
checked explicitly in §1.

## 1. Answer in brief

- **API billing is separate from consumer plans at all four providers**, with one qualification: Anthropic says Claude Max and Team
  plans "include monthly credits for the Claude API" (§3.2). OpenAI, Google and xAI documentation retrieved states or implies
  separate billing; see each section for the exact wording and the gaps.
- **Billing units are not uniform.** Token-based everywhere for text, but cache accounting, reasoning accounting and per-call or
  per-unit charges differ (§2). The pricing engine must model dimensions, not just input and output tokens (brief §9.1).
- **Reasoning tokens are billed as output at all four.** They are reported in a separate detail field at OpenAI, Anthropic and
  xAI; at Google the field is `thoughtsTokenCount` and the docs retrieved do not say whether `candidatesTokenCount` includes it.
- **Cache accounting differs structurally.** OpenAI's `input_tokens` includes cached tokens; Anthropic's `input_tokens` excludes
  cache reads and writes (you must add three fields). The metering adapters must not share one formula.
- **Only xAI returns the provider's own cost per request** (`cost_in_usd_ticks`). The others return tokens only; cost must be
  computed from the pricing registry and reconciled against the usage and cost APIs.
- **Usage and cost APIs** exist at OpenAI (Usage and Costs, admin key), Anthropic (Usage and Cost Admin API, admin key, not for
  individual accounts) and Google (Cloud Billing export to BigQuery; AI Studio dashboard). xAI has a Management API that the
  docs say covers prepaid balance and usage deductions; its endpoints were not found in the pages retrieved.

## 2. Compatibility matrix (brief §4.5)

"NF" means not found in official sources retrieved on 16 October 2026. Source numbers refer to §9.

| Dimension | OpenAI | Anthropic (Claude) | Google (Gemini API; Vertex noted) | xAI (Grok) |
| --- | --- | --- | --- | --- |
| Consumer subscription | ChatGPT plans. Billed separately from the API ([S-O1]). | Claude Free, Pro, Max; Team, Enterprise ([S-A1]). | Google AI plans (Pro, Ultra). Benefits apply only inside the AI Studio web interface ([S-G4]). | Grok apps and SuperGrok-type plans: NF in the docs retrieved; the API billing page covers only API billing ([S-X3]). |
| Separate API billing | Yes. "API usage is billed separately from your ChatGPT subscription" ([S-O1], via search summary of help article). | Yes. "A paid Claude subscription enhances your chat experience, and the Claude API is billed separately" ([S-A1]). Console access is set up separately. | Yes. Direct API use "billed and managed separately" ([S-G4]). | Yes, a separate team billing in the xAI Console ([S-X3]). Whether a Grok subscription includes credits: NF. |
| Subscription includes API credits | No credits found. The help article summary says subscriptions and API are separate. | **Max and Team: monthly API credits included**; Pro and Enterprise: article does not mention credits ([S-A1]). | No for API quota. Some subscribers with Cloud Billing may receive monthly Google Cloud credits via the Google Developer Program; Google One AI credits do not apply in AI Studio ([S-G4]). | NF |
| Prepaid credits | Yes in practice: tiers qualify on "total credit purchases" ([S-O2]). The prepaid-billing help page itself was not retrieved. | Yes. Credits bought on the Console Billing page ([S-A2]). Marketplace billing (AWS, Azure) is postpaid only. | Yes. Prepay is the default for new users; minimum $5 prepayment to upgrade; cannot switch Prepay to Postpay ([S-G3]). | Yes. Default path; minimum top-up $5; auto top-up; credits non-refundable except where law requires ([S-X3], [S-X4]). |
| Postpaid billing | Invoicing under an Order Form in the Services Agreement (§6.1) ([S-O8]); a self-serve postpaid option: NF. | Invoicing for Enterprise customers ([S-A2]); Marketplace consumption in arrears ([S-A2]). | Yes: Postpay, charged at month end ([S-G3]). | Yes, off by default: "monthly invoiced billing", invoiced limit default $0, requested through sales ([S-X3]). |
| Token pricing | Per 1M tokens; see §3.1 and the seed. | Per 1M tokens (MTok); see §4.1. | Per 1M tokens; see §5.1. | Per 1M tokens; see §6.1. |
| Prompt caching | Automatic by default. Cache-read discount (up to 95% per docs). GPT-5.6 and later: cache writes billed at 1.25x input, reads 0.1x (0.05x on GPT-6.1 Sol); earlier models have no write charge ([S-O3]). | Explicit or automatic `cache_control`. 5-minute write 1.25x, 1-hour write 2x, read 0.1x (0.05x Opus 5.5 and Sonnet 5.5; 0.025x Fable 5.1 and Mythos 5.1) ([S-A3]). | Implicit (default on 2.5 and newer) and explicit on Gemini 3 and 2.5 models; explicit caching also charges storage per 1M tokens per hour ([S-G1], [S-G5]). | Automatic; `cached_tokens` billed at a reduced cached rate ([S-X5]). |
| Batch discounts | 50%, 24h window ([S-O4]). | 50% on input and output; stacks with caching ([S-A3]). Not with fast mode. | Batch listed at 50% of Standard on the pricing page ([S-G1]). | 20%, only for grok-4.3 and the grok-4.20 variants; other models none ([S-X2]). |
| Usage tiers | Free, Build ($5), Launch ($100), Grow ($500) by total credit purchases ([S-O2]). | Evaluation, Start, Build, Scale, Custom; automatic ([S-A4]). Deposit thresholds: NF in the retrieved page. | Free, Tier 1 (billing linked), Tier 2 ($100 paid + 3 days), Tier 3 ($1,000 + 30 days) ([S-G2]). | Tier 0 to 4 by cumulative spend since 1 Jan 2026 ($0, 50, 250, 1,000, 5,000), Enterprise on request ([S-X1]). |
| Rate limits | RPM and TPM per model and tier; headers `x-ratelimit-*` ([S-O2]). | RPM, ITPM, OTPM per model class and tier; headers `anthropic-ratelimit-*` ([S-A4]). | RPM, TPM, RPD per project; numbers shown in AI Studio, not in the docs ([S-G2]). | Requests per second and TPM per team and model; numbers in the Console; headers NF ([S-X1]). |
| Usage reporting | Usage API and Costs API (admin key) ([S-O9]). | Usage and Cost Admin API; per-response `usage` ([S-A5]). | `usageMetadata` per response; Cloud Billing export ([S-G6]). | `usage.cost_in_usd_ticks` per response; Management API ([S-X6]). |
| Enterprise agreements | Order Form under the OpenAI Services Agreement; ZDR and data-residency by approval ([S-O8], [S-O5]). | Enterprise pricing, custom limits, ZDR through sales ([S-A2], [S-A6]). | Enterprise plan tier; Vertex AI under Google Cloud terms ([S-G7]). | Enterprise tier and Enterprise Customer Agreement through sales@x.ai ([S-X1], [S-X7]). |
| BYOK compatibility | No explicit BYOK rule found. Buying, selling or transferring API keys is prohibited, and account credentials must not be shared between users (Services Agreement §3.1, §3.3(g)) ([S-O8]). Legal-review item (terms file, flag L-3). | Resale or proxying "through unauthorized means" prohibited; a customer's own Console key: NF as an explicit rule ([S-A7]). | NF as an explicit rule. API Clients may be offered to end users with Paid Services ([S-G8]). | NF as an explicit rule (Enterprise terms page returned 403, [S-X7]). |
| SaaS restrictions | Customer Applications are allowed (§2.2); no resale or lease of the Account; End Users single-person (§3.1, 3.2) ([S-O8]). | Customer may power its own products for its Users; no resale without approval; AI-disclosure rules for deployers ([S-A7], [S-A8]). | API Clients allowed under Paid Services; 18+ only; no competing models; grounding display rules ([S-G8]). | Enterprise terms: not retrieved (403). Earlier versions seen in a search snippet only; do not rely ([S-X7]). |

## 3. OpenAI

### 3.1 Account structures (§4.1)
- **Consumer and business plans:** ChatGPT plans are billed separately from the API. The help-centre article on moving a
  subscription to the API could not be fetched directly (HTTP 403); the statement above comes from a search summary of
  help.openai.com article 9039756 and 8156019 titles and text. Confidence: medium.
- **API account and billing:** pay-as-you-go on a platform organisation with projects. Usage tiers (Free, Build, Launch, Grow) are
  set by "total credit purchases", with monthly usage limits of $100, $500, $5,000 and $200,000 ([S-O2]). Tiers rise automatically.
- **Spend controls:** a spend alert (notification only) and a hard spend limit (requests return 429) are separate from the
  approved monthly usage limit ([S-O2]).
- **Free tier and promotions:** the usage-tier table has a "Free" tier "located in an allowed geography" with a $100 monthly
  limit. Free or promotional credit amounts: NF.
- **Committed use, reserved capacity, volume discounts:** not described on the pricing page; the Usage API field description mentions "scale-tier" tokens (search summary), but no
  Scale Tier price or commitment terms were found. Treat as NF.
- **Fine-tuning:** being wound down, closed to new users ([S-O1p]).

### 3.2 Pricing dimensions (§4.2)
Prices as of 16 October 2026, USD per 1M tokens, from [S-O1p]. The page shows no version or date. Short context is up to 272K
input tokens; long is above ([S-O1p]). Examples of the current lines (full set in the seed):

| Model (standard) | Input | Cached input | Cache write | Output | Long input / output |
| --- | --- | --- | --- | --- | --- |
| gpt-6-astra | 10.00 | 1.00 | 12.50 | 50.00 | 20.00 / 75.00 |
| gpt-6.1-sol | 2.00 | 0.10 | 2.50 | 10.00 | 4.00 / 15.00 |
| gpt-6-luna | 0.10 | 0.01 | 0.125 | 0.50 | 0.20 / 0.75 |
| gpt-5.6-sol | 4.00 | 0.40 | 5.00 | 20.00 | 8.00 / 30.00 |
| gpt-5.5 | 5.00 | 0.50 | none listed | 30.00 | 10.00 / 45.00 |

- **Cached tokens and cache writes:** GPT-5.6 and later bill a cache write at 1.25 times the uncached input rate and a read at 0.1
  times (0.05 times for GPT-6.1 Sol). "The write charge isn't an additional fee on top of the input rate. Input tokens bill at one
  rate: uncached, cached, or cache-write." Earlier models have no write charge ([S-O3]). Retention: GPT-5.6 and later
  `prompt_cache_options.ttl` `"30m"` (only value); earlier models `prompt_cache_retention` `in_memory` or `24h`. Minimum prompt
  1,024 visible input tokens for GPT-5.6 and later.
- **Reasoning tokens:** "billed as output tokens", not visible; counted in `max_output_tokens`; reported at
  `usage.output_tokens_details.reasoning_tokens`. Truncation can bill reasoning with no visible output ([S-O6]).
- **Long context:** separate long-input, long-cached and long-output rates above 272K input tokens ([S-O1p]).
- **Batch:** 50% lower; 24h only; 50,000 requests and 200 MB per batch; batch limits are separate from standard quota ([S-O4]).
- **Other service tiers on the pricing page:** Flex (batch-level rates), Fast (formerly Priority, about 2x), Ultrafast (for
  gpt-6-astra and gpt-6.1-sol only) ([S-O1p]).
- **Images:** token-priced. Example gpt-image-2: image input 8.00, cached 2.00, output 30.00, text input 5.00 per 1M. Cached rates
  apply only to the Responses API. Per-image figures are not listed; the page points to a calculator.
- **Audio and speech:** realtime and audio models are per-token by modality (e.g. gpt-realtime-2.1 audio input 32.00, output
  64.00 per 1M); gpt-live-1 $0.05 per minute billed per second; transcription per minute (gpt-transcribe 0.0045 per minute
  estimated); tts-1 $15 per 1M characters.
- **Embeddings:** text-embedding-3-small $0.02, text-embedding-3-large $0.13 per 1M tokens.
- **Search and tools:** web search $10 per 1,000 calls plus search content tokens (preview on non-reasoning models $25 per 1,000
  with content tokens free); file search $2.50 per 1,000 calls, storage $0.10 per GB per day after 1 GB free; containers $0.03
  (1 GB) to $1.92 (64 GB) per 20-minute session, with a note elsewhere on the same page of per-minute billing and a 5-minute
  minimum (the page states both).
- **Regional processing:** +10% on regional processing and FedRAMP endpoints for models released on or after 5 March 2026.
- **Currency:** USD only on the page. Other currencies and tax: NF.
- **Cloud platforms:** OpenAI models via Amazon Bedrock and Microsoft Azure are billed by those services; their prices were not
  researched (out of scope; Vertex and Bedrock are not P0 routes).

### 3.3 Rate limits and caps (§4.3)
- Scope: organisation and project, not user. Models in a "shared limit" group draw on one limit. Long-context models have a
  separate long-context limit.
- Tier limits (standard, Astra/Sol/Terra): Build 5,000 RPM and 1,000,000 TPM; Launch 10,000 RPM and 4,000,000 TPM; Grow 15,000 RPM
  and 40,000,000 TPM. Luna has higher TPM (2M, 10M, 180M). RPD, TPD and IPM are named but have no values on the page ([S-O2]).
- Batch: queue limit is total queued input tokens per model; up to 2,000 batch creations per hour ([S-O4]).
- Headers: `x-ratelimit-limit-requests`, `-limit-tokens`, `-remaining-requests`, `-remaining-tokens`, `-reset-requests`,
  `-reset-tokens`, plus `-project-tokens` variants and `Retry-After` ([S-O2]).
- Ramp guidance: after 1M TPM, raise traffic by at most 50% every 15 minutes.
- Usage APIs: GET `/v1/organization/usage/completions` and a Costs endpoint with an admin key; `input_tokens` includes cached
  tokens, so uncached input is `input_tokens` minus `input_cached_tokens`; newer SDK references add `input_cache_write_tokens` and
  `input_uncached_tokens`. The older and newer references do not match ([S-O9]; confidence low until the live schema is checked).
  The API-reference URL for the costs method returned 404 on direct fetch; the search results are the evidence.

### 3.4 Billing units and usage fields
- Unit: tokens (text, image tokens, audio tokens), characters (tts-1), minutes or seconds (live, transcription), calls (tools),
  GB-days (storage), container sessions.
- **Responses API:** `usage.input_tokens` (includes cached), `usage.input_tokens_details.cached_tokens`,
  `usage.input_tokens_details.cache_write_tokens` (GPT-5.6 and later), `usage.output_tokens` (includes reasoning),
  `usage.output_tokens_details.reasoning_tokens` ([S-O3], [S-O6]).
- **Chat Completions and batch result bodies:** `prompt_tokens`, `completion_tokens`, `total_tokens` shown in batch output
  ([S-O4]). The cached and reasoning detail field names under Chat Completions
  (`prompt_tokens_details.cached_tokens`, `completion_tokens_details.reasoning_tokens`) were not confirmed on the pages retrieved
  for OpenAI (they were for xAI). Treat as NF until checked.

## 4. Anthropic (Claude)

### 4.1 Account structures (§4.1) and pricing (§4.2)
- **Plans:** Free, Pro, Max, Team, Enterprise (claude.ai) are separate from the Claude Console API account ([S-A1]). Max and Team
  include monthly API credits; Pro and Enterprise: not mentioned in the article.
- **API account:** Claude Console organisation, workspaces, admin keys. New users receive "a small amount of free credits"
  ([S-A2]); the amount is NF. Payment: major credit cards; Enterprise can arrange invoicing ([S-A2]).
- **Other channels:** Claude Platform on AWS and Claude in Microsoft Foundry bill in Claude Consumption Units (CCU, $0.01 each),
  arrears only, no prepaid credits ([S-A2]). Bedrock and Google Cloud bill through the cloud provider; regional and multi-region
  endpoints carry a 10% premium ([S-A2]).
- **Committed use, volume discounts:** negotiated case by case; Enterprise custom rates, limits and terms through sales
  ([S-A2]). Priority Tier exists (rate-limit headers `anthropic-priority-*`); its price: NF on the pricing page.

Prices as of 16 October 2026, USD per MTok (1M tokens) from [S-A2]. The page shows no version or date.

| Model (display name) | Base input | 5m cache write | 1h cache write | Cache read | Output | Batch in / out |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Fable 5.1 | 10 | 12.50 | 20 | 0.25 | 50 | 5 / 25 |
| Claude Opus 5.5 | 4 | 5 | 8 | 0.20 | 20 | 2 / 10 |
| Claude Opus 5 | 5 | 6.25 | 10 | 0.50 | 25 | 2.50 / 12.50 |
| Claude Sonnet 5.5 | 2 | 2.50 | 4 | 0.10 | 10 | 1 / 5 |
| Claude Sonnet 5 | 2 | 2.50 | 4 | 0.20 | 10 | 1 / 5 |
| Claude Haiku 5.5, prompt up to 100,000 tokens | 0.10 | 0.125 | 0.20 | 0.01 | 0.50 | 0.05 / 0.25 |
| Claude Haiku 5.5, prompt over 100,000 tokens | 0.50 | 0.625 | 1 | 0.05 | 2.50 | 0.25 / 1.25 |

Claude Mythos 5.1 and 5 are priced like Fable but have limited availability (verified organisations). The pricing page lists
display names, not API model ID strings; one ID (`claude-opus-5-5`) appears in a usage-API example elsewhere.

- **Cached tokens, cache creation, retention:** writes 1.25x (5 minutes) or 2x (1 hour); reads 0.1x. Break-even after one read
  (5 minutes) or two (1 hour). Multipliers stack with batch and data-residency multipliers ([S-A2]).
- **Reasoning tokens:** thinking is billed as output. `usage.output_tokens_details.thinking_tokens` reports "how many of the
  billed output tokens were internal reasoning"; in streaming it appears on the final `message_delta` event ([S-A9]). Claude 4.7
  and later reject manual `budget_tokens`; adaptive thinking is used with `output_config.effort`. Thinking blocks from earlier
  turns are billed as input on Opus 4.5 and 4.6-and-later models ([S-A9]).
- **Tokenizer:** Claude 4.7 and later produce about 30% more tokens for the same text than earlier models ([S-A2]). Cost per
  document is not comparable across model generations by token price alone.
- **Long context:** 1M context at standard price for Claude 4.6 and later except Haiku 5.5, which has the two prompt-length bands
  above (the band is chosen per request, counting cache reads and writes) ([S-A2]).
- **Fast mode:** Opus 5.5 $8 / $40; Opus 5 and 4.8 $10 / $50 (research preview); not with Batch ([S-A2]).
- **Data residency:** `inference_geo: "us"` is 1.1x on all token categories for Claude 4.6 and later ([S-A2]).
- **Tools:** web search $10 per 1,000 searches plus tokens; web fetch no extra charge; code execution $0.05 per container-hour
  after 1,550 free hours per month per organisation (free alongside web search or fetch); bash, text editor and computer-use tools
  add fixed input tokens (for example bash 325 tokens on Claude 4.7 and later); Managed Agents add $0.08 per session-hour ([S-A2]).
- **Images, audio, embeddings:** images are billed as input tokens (vision page referenced; per-image price: NF). Image
  generation and audio models: not found in official sources. Embeddings: not found on the pricing page.

### 4.2 Rate limits and caps (§4.3)
- **Spend caps (monthly):** Start $500, Build $1,000, Scale $200,000, Custom none ([S-A4]). At the cap requests return 429 with
  `error.details.error_code` `enforced_spend_limit_reached` and no `retry-after`. A self-set limit returns HTTP 400
  `invalid_request_error`.
- **Limits by tier (Opus 5.5, Sonnet 5.5, Haiku 5.5 rows):** Start 1,000 RPM, 2,000,000 ITPM, 400,000 OTPM; Build 5,000 RPM,
  5,000,000 ITPM, 1,000,000 OTPM; Scale 10,000 RPM, 10,000,000 ITPM, 2,000,000 OTPM. Fable 5.x is lower (Start 1,000 / 500,000 /
  100,000). New organisations may start in an Evaluation tier below these.
- **Cache-aware ITPM:** only `input_tokens` and `cache_creation_input_tokens` count; `cache_read_input_tokens` does not (except
  for Haiku 3.5). Limits are organisation-wide, with optional per-workspace limits ([S-A4]).
- **Batch:** queue of 200,000 (Start), 300,000 (Build) or 500,000 (Scale) requests; 100,000 requests per batch.
- **Headers:** `anthropic-ratelimit-{requests,tokens,input-tokens,output-tokens}-{limit,remaining,reset}`, `retry-after`,
  `anthropic-priority-*`, `anthropic-workspace-id` (response header).
- **Programmatic:** Rate Limits API (read configured limits); Usage and Cost Admin API (below).

### 4.3 Billing units and usage fields
- Unit: tokens (MTok). Response `usage`: `input_tokens` (uncached, after the last cache breakpoint), `output_tokens`,
  `cache_creation_input_tokens`, `cache_read_input_tokens`, `cache_creation.ephemeral_5m_input_tokens`,
  `cache_creation.ephemeral_1h_input_tokens`, `output_tokens_details.thinking_tokens`, `server_tool_use.web_search_requests`,
  `server_tool_use.web_fetch_requests`, `server_tool_use.code_execution_requests` ([S-A2], [S-A3], [S-A9]).
- **Total input** = `input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens` ([S-A3]).
- Fields `service_tier`, `inference_geo` and `speed` appear as request parameters and usage-report dimensions; their presence in
  the response `usage` object: not confirmed (the Messages reference page was too large to read in full).
- **Usage and Cost Admin API:** `GET /v1/organizations/usage_report/messages` (buckets 1m, 1h, 1d; group by model, workspace, API
  key, service tier, context window, `inference_geo`, `speed`) and `GET /v1/organizations/cost_report` (USD, daily only).
  Needs an Admin API key (`sk-ant-admin01-...`) or equivalent; unavailable for individual accounts; Priority Tier costs are not in
  the cost endpoint; code execution appears only in the cost endpoint; data typically appears within 5 minutes ([S-A5]).
  Claude Enterprise uses a different Analytics API.

## 5. Google (Gemini API; Vertex AI noted)

### 5.1 Account structures (§4.1) and pricing (§4.2)
- **Plans:** Google AI plans (Pro, Ultra, and others) give "baseline daily quota allowances higher than the free tier" in the AI
  Studio web interface only. Direct API use "billed and managed separately". Cloud credits from the Google Developer Program may
  be available to subscribers with Cloud Billing; Google One AI credits do not overlap with Cloud credits ([S-G4], dated
  2026-10-16).
- **API account:** a Google Cloud project with a linked Cloud Billing account. Free tier available on many models. Upgrading needs
  a minimum $5 prepayment; new users default to Prepay; Prepay cannot be switched to Postpay; Postpay charges at month end
  ([S-G3]). Accounts opened after 2 March 2026 cannot apply the $300 welcome credit to Gemini API or AI Studio usage (via search
  summary of Cloud docs).
- **Plan tiers named on the pricing page:** Free, Paid, Enterprise, and an invite-only Contributor tier in private preview that
  "shares data for product improvement" ([S-G1]).
- **Vertex AI:** a separate Google Cloud product with its own pricing page, quotas (dynamic shared quota and Provisioned
  Throughput are named in the navigation), and data governance. The Vertex pricing page and quota page could not be read as text
  (the pricing page returned only its title). Vertex prices: not found in official sources retrieved. Data governance page was
  read (terms file §5).

Prices as of 16 October 2026, Gemini Developer API, standard tier, USD per 1M tokens, from [S-G1] ("last updated 2026-10-16 UTC").
Where the page shows "a → b", **a is recorded as current and b as the later price** (the page states dates: 1 December 2026 for
Gemini 4 Argon, 1 January 2027 for 3.x models). This is an interpretation of the page's arrow notation; check the source.

| Model ID | Input | Output (incl. thinking) | Cached input | Cache storage per 1M per hour | Free tier |
| --- | --- | --- | --- | --- | --- |
| gemini-4-argon | 2.00 → 4.00 | 10 → 20 | 0.10 → 0.20 (implicit only) | not listed | No |
| gemini-3.8-flash | 0.75 → 1.50 | 3.75 → 7.50 | 0.075 → 0.15 | 0.50 → 1.00 | Yes |
| gemini-3.6-flash | 0.75 → 1.50 | 3.75 → 7.50 | 0.075 → 0.15 | 0.50 → 1.00 | Yes |
| gemini-3.5-flash-lite | 0.30 | 2.50 | 0.03 | 1.00 | Yes |
| gemini-3.1-pro-preview | 2.00 (to 200k); 4.00 (over 200k) | 12 / 18 | 0.20 / 0.40 | 4.50 | No |
| gemini-2.5-pro | 1.25 / 2.50 | 10 / 15 | 0.125 / 0.25 | 4.50 | Yes |
| gemini-2.5-flash | 0.30 | 2.50 | 0.03 | 1.00 | Yes |

- **Cached tokens:** implicit caching is on by default for Gemini 2.5 and newer ("we automatically pass on cost savings");
  minimum 4,096 input tokens for Gemini 4 Argon, 3.8, 3.6 and 3.1 Pro; 2,048 for 2.5 Flash and Pro. Explicit caching is not
  supported for Gemini 4 Argon and later or in the Interactions API ([S-G5]). Default TTL and discount rate: not found on the
  caching page (the pricing page shows the cached rates).
- **Reasoning tokens:** "response pricing is the sum of output tokens and thinking tokens" at the full thinking token count, even
  though only a summary is returned ([S-G9]).
- **Long context:** only Gemini 3.1 Pro and 2.5 Pro have a >200k tier; Flash models and Gemini 4 Argon list none.
- **Batch, Flex and Priority:** Batch and Flex share the batch price (about half of standard); Priority about 1.8x (e.g. 3.1 Pro
  $3.60 in / $21.60 out). Batch limits: 100 concurrent batch requests, 2 GB input file ([S-G2]).
- **Images:** output images by token or per image (e.g. gemini-3.1-flash-image $60 per 1M image tokens, about $0.067 per 1K image;
  gemini-3-pro-image about $0.134 per 1K/2K image); gemini-2.5-flash-image is deprecated with shutdown listed 2 October 2026.
- **Audio, speech, live:** audio input is priced higher on some models (2.5 Flash audio input $1.00); Live models priced per
  token with per-minute estimates (gemini-3.8-live audio input $3.00 per 1M, about $0.005 per minute); TTS and transcription
  models have their own rates.
- **Embeddings:** gemini-embedding-2 text $0.20 per 1M; image, audio and video units priced separately; batch half.
- **Search and grounding:** Gemini 3 and newer: 5,000 free Search requests per month shared, then $14 per 1,000; Maps the same.
  Gemini 2.5 Pro: 1,500 per day free then $35 per 1,000 grounded prompts. A prompt may trigger several billed searches.
- **Other tools:** code execution and URL context free as tools (tokens billed); File Search embeddings $0.15 per 1M; computer use
  at normal token rates.
- **Video and music:** Veo 3.1 $0.40 per second (720p, 1080p, with audio); Lyria 3.5 $0.08 per song.
- **Gemma 4:** free on the free tier; paid pricing not available.
- **Currency and regions:** USD on the page; regional differences: NF for the Developer API.

### 5.2 Rate limits and caps (§4.3)
- Measured as RPM, TPM (input tokens) and RPD; some models add IPM or TPD. Applied **per project**, not per API key; RPD resets
  at midnight Pacific time. A spend limit is also evaluated on a rolling 10-minute window; exceeding it returns 429
  RESOURCE_EXHAUSTED ([S-G2], page last updated 2026-10-15 UTC).
- Billing-account monthly caps by tier: Tier 1 $250, Tier 2 $2,000, Tier 3 $20,000 to $100,000+; when reached, "service is paused
  for all projects linked to that billing account" ([S-G3]). Per-10-minute spend limits $10 / $50 / $200.
- **Numeric per-model RPM, TPM and RPD are not published in the docs**; they are shown in AI Studio, and "Specified rate limits are
  not guaranteed" ([S-G2]). The platform must read them from the account, not from a table.
- Batch enqueued tokens by tier are listed (e.g. Gemini 2.5 Pro 5,000,000 at Tier 1). Priority inference default limits are 0.3x.
- Project-level spend caps can be set in AI Studio (experimental). Tier increases are automatic; a form requests more.
- Rate-limit response headers: not found in official sources.
- **Vertex AI quotas:** not read (page body too long for the fetch); see the gap list.

### 5.3 Billing units and usage fields
- Unit: tokens; characters not used; per image, per second (video, audio), per minute estimates, per 1,000 grounded requests.
- `generateContent` `usageMetadata`: `promptTokenCount` (full effective prompt including cached when `cachedContent` is set),
  `cachedContentTokenCount`, `candidatesTokenCount`, `toolUsePromptTokenCount`, `thoughtsTokenCount`, `totalTokenCount`
  ([S-G6]). Also named in the schema but not read: `promptTokensDetails`, `candidatesTokensDetails`, `cacheTokensDetails`,
  `trafficType`, `serviceTier`. Whether `candidatesTokenCount` includes thinking: not stated on the page read; the pricing page
  says output pricing includes thinking, so the adapter must reconcile with `totalTokenCount` in tests.
- Interactions API / SDK names differ: `total_cached_tokens`, `total_thought_tokens`, `total_output_tokens` ([S-G5], [S-G9]).
  Metering must map both shapes.
- Reporting beyond the response: AI Studio Dashboard > Usage; Cloud Billing cost-management pages and BigQuery export (standard
  and detailed tables). A usage API for the Developer API (analogous to OpenAI's): not found in official sources. Remaining
  prepaid balance can be managed only in AI Studio.

## 6. xAI (Grok)

### 6.1 Account structures (§4.1) and pricing (§4.2)
- **Plans:** Grok consumer or business subscriptions and the API are separate; the API billing documentation covers only API
  billing and does not discuss subscriptions ([S-X3]). Whether a subscription includes API credits: not found in official sources.
- **API account:** an xAI Console team. Billing applies to the whole team. Credits are consumed in the order free or promotional
  credits, then prepaid credits, then monthly invoiced billing (via search summary of the billing page). Free or data-sharing
  credit amounts: not found in the page read directly.
- **Prepaid credits:** minimum top-up $5, auto top-up with a monthly maximum, bank transfers take 2 to 3 business days; refunds:
  non-refundable unless law requires (search summary; the page read directly omits refunds).
- **Postpaid:** monthly invoiced billing disabled by default, limit $0, requested via sales@x.ai.

Prices as of 16 October 2026, USD per 1M tokens, from [S-X2] (no date on page). Long-context rates apply to the **whole request**
once the prompt reaches 200k tokens.

| Model ID | Context | Input | Cached input | Output | Long (>=200k) in / cached / out |
| --- | --- | --- | --- | --- | --- |
| grok-4.7 | 500k | 2.00 | 0.50 | 6.00 | 4.00 / 1.00 / 12.00 |
| grok-4.5 | 500k | 2.00 | 0.30 | 6.00 | 4.00 / 0.60 / 12.00 |
| grok-4.3 | 1M | 1.25 | 0.20 | 2.50 | 2.50 / 0.40 / 5.00 |
| grok-4.20-0309-reasoning | 1M | 1.25 | 0.20 | 2.50 | 2.50 / 0.40 / 5.00 |
| grok-build-0.1 | 256k | 1.00 | 0.20 | 2.00 | 2.00 / 0.40 / 4.00 |

- **Cached tokens, writes:** cached input is billed at a lower rate; no cache-write charge, no minimum length, and no retention
  setting were found ([S-X5]). To raise hits, set `x-grok-conv-id` or `prompt_cache_key`.
- **Reasoning tokens:** "billed as part of your total consumption"; reported as `reasoning_tokens` under
  `output_tokens_details` (Responses) or `completion_tokens_details` (Chat Completions) ([S-X5]). grok-4.7 exposes summarised
  reasoning and returns encrypted reasoning content that must be passed back unchanged.
- **Batch:** 20% off input, output, cached and reasoning tokens for grok-4.3 and the grok-4.20 variants only; typically within 24
  hours, best effort; the batch API itself has creation limits (2 per second per team, 200 MB JSONL, 50,000 requests) ([S-X2],
  [S-X8]).
- **Priority processing:** 2x standard rates. **US regional endpoint** (`us.api.x.ai`): 1.1x global rates ([S-X2]).
- **Images and video:** grok-imagine-image $0.02, -2.0 $0.04, -quality $0.05 per image; video $0.02 to $0.08 per second.
- **Voice and speech:** voice $0.08 per minute; speech-to-text $0.10 per hour (REST), $0.20 streaming; text-to-speech $15 per 1M
  characters.
- **Search and tools:** web search, code execution and file attachments $5 per 1,000 calls; X search $5 per 1,000 posts returned
  ($10 per 1,000 profiles); collections search $2.50 per 1,000; remote MCP no invocation charge ([S-X2]).
- **Embeddings:** not found in official sources.
- **Currency:** USD.

### 6.2 Rate limits and caps (§4.3)
- Per team and per model, as **requests per second and tokens per minute** (RPS derived from an RPM budget: RPM/48, minimum 2).
  No RPD cap is documented. Tiers 0 to 4 by cumulative API spend since 1 January 2026 ($0, 50, 250, 1,000, 5,000), automatic,
  never downgraded; Enterprise on request. Prompt, completion, reasoning and cached tokens all count toward TPM ([S-X1]).
- Limits are viewed on the Models page of the Console; the docs list no numeric values. HTTP 429 on excess. Rate-limit response
  headers: not found in official sources.
- Spending caps: the invoiced limit (default $0); a "monthly maximum" for auto top-ups. A hard prepaid-balance stop is implied
  ("requests rejected once prepaid credits are depleted").

### 6.3 Billing units and usage fields
- Unit: tokens, images, seconds, minutes, characters, calls (and per item returned for X search).
- Chat Completions: `usage.prompt_tokens`, `usage.completion_tokens`, `usage.total_tokens`,
  `usage.prompt_tokens_details.cached_tokens`, `usage.completion_tokens_details.reasoning_tokens`.
- Responses: `usage.input_tokens`, `usage.output_tokens`, `usage.total_tokens`, `usage.input_tokens_details.cached_tokens`,
  `usage.output_tokens_details.reasoning_tokens`; also `num_sources_used` and `num_server_side_tools_used` (search summary of the
  docs; the second name appears on the Cost Tracking page) ([S-X5], [S-X6]).
- **`usage.cost_in_usd_ticks`:** the exact charge for that request, including token and server-side tool charges and after
  caching discounts; 1 USD = 10,000,000,000 ticks; not cumulative across turns; in streaming set
  `stream_options: { include_usage: true }` and read it from the final chunk ([S-X6]). The metering adapter should store it as a
  provider-reported cost for reconciliation.
- Management API (`https://management-api.x.ai`, management key with Management Keys Read + Write): documented as covering
  prepaid credit balance and usage deductions and API-key management; endpoints and fields not found in the pages retrieved
  ([S-X9]).

## 7. Architecture implications

1. **Dimensions, not tokens.** Pricing records need a dimension and a unit per row (seed schema). Dimensions seen: input,
   cached input, cache write (5m, 1h), output, reasoning (inside output), tool calls, storage hours, session hours, minutes,
   characters, images, seconds, multipliers (batch, regional, priority).
2. **Normalisation formulas differ.** Anthropic: uncached = `input_tokens`; total = three fields. OpenAI and xAI: `input_tokens`
   includes cached; uncached = input minus cached. Google: `promptTokenCount` includes cached when explicit caching is used;
   treat the same as OpenAI after a test with real responses.
3. **Cache writes only matter at some providers.** Anthropic (always), OpenAI (GPT-5.6 and later), Google (storage by the hour for
   explicit caching). xAI: none found.
4. **Provider-reported cost.** xAI gives it per request; for others, compute and reconcile against Usage and Cost APIs or the
   Cloud Billing export. Do not assume a remaining-balance API exists at any provider (brief §9.3); none was found at P0
   providers except xAI's management API description.
5. **Price changes are scheduled.** Google lists later prices with dates; OpenAI lists a promotional end date; Anthropic ended an
   introductory price. The registry needs effective dates and `scheduledChange` (the seed has the field).
6. **Rate limits are account facts.** Google and xAI publish no numeric limits in docs; Anthropic and OpenAI publish tier tables
   but note that limits are per organisation and can be raised. The provider account layer should hold read-in limits and headers.
7. **Spend caps behave differently:** OpenAI hard limit returns 429; Anthropic returns 429 (tier cap) or 400 (self-set limit);
   Google pauses all projects on the billing account; xAI rejects when prepaid credits (and invoiced limit) are exhausted. Error
   mapping must distinguish "cap reached" from "rate limited".

## 8. P1 and P2 providers (note, brief §3)

Not researched in depth. API style and where each publishes pricing, from the pages retrieved on 16 October 2026.

| Provider | API style | Where pricing is published | Notes |
| --- | --- | --- | --- |
| DeepSeek (P1) | OpenAI-format at `https://api.deepseek.com`; Anthropic-format at `https://api.deepseek.com/anthropic`; also a Responses API ([S-P1]) | https://api-docs.deepseek.com/quick_start/pricing. Models `deepseek-flash`, `deepseek-v4-pro`; cache hit and miss rates with peak and off-peak prices (peak 01:00-04:00 and 06:00-10:00 UTC weekdays, off-peak half) | Time-of-day pricing: another pricing dimension. No date on the page. |
| Mistral AI (P1) | Chat API; whether it is OpenAI-compatible: not stated on the model page read ([S-P2]) | Mistral docs, Inference > Pricing (relative link `/inference/pricing`; full URL not shown in the extract) | Open-weight licences vary by model (Apache 2.0, modified MIT, CC BY-NC 4.0 for Voxtral TTS); read per model. |
| Alibaba Qwen (P1) | Model Studio; OpenAI-compatible base URL not shown on the model list page ([S-P3]) | Model Plaza at modelstudio.console.alibabacloud.com (ap-southeast-1) and per-model pages; no prices on the docs page | Regional consoles (Singapore, Beijing); list last updated 2026-10-11. Current names include qwen3.8-max, qwen3.7-plus, qwen3.8-flash. |
| Llama hosting (P1) | Depends on the host (OpenAI-compatible at most hosts; not verified) | Per host. Meta's developer page retrieved shows a Meta Model API for "Muse models", not Llama; licence terms and a hosted Llama price list: not found in official sources | Llama licence conditions must be read from the Llama licence text (not retrieved). |
| Ollama (P2) | OpenAI-compatible: `http://localhost:11434/v1/` (any key) and cloud `https://ollama.com/v1`; chat completions, completions, responses (stateless), models, embeddings ([S-P4]) | Cloud plans pricing: not found on the compatibility page | Caveats: no `tool_choice`, no logprobs; context size set in a Modelfile. |
| vLLM (P2) | OpenAI-compatible `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, `/v1/responses`; Anthropic-style `/v1/messages` and `/v1/messages/count_tokens` ([S-P5]) | Self-hosted; no price list. Cost = own hardware | Licence: not stated on the page read; check the repository. |

Self-hosted inference has no per-token provider price; the registry needs a "self-hosted" arrangement type with cost per
GPU-hour or per token amortised (brief §9.1).

## 9. Sources (all retrieved 16 October 2026)

Pricing version or date shown on the page is given where one exists. Pages that returned HTTP 403 or 404 are listed in §10.

**OpenAI**
- [S-O1p] https://developers.openai.com/api/docs/pricing (redirected from platform.openai.com/docs/pricing). No version or date;
  notes on Fast mode rename (30 July 2026) and gpt-5.6-sol promotion (through at least 21 November 2026).
- [S-O1] https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform and
  https://help.openai.com/en/articles/8156019-i-want-to-move-my-chatgpt-subscription-to-the-api (direct fetch 403; content from
  search summary only).
- [S-O2] https://developers.openai.com/api/docs/guides/rate-limits (no date; notes a model shutdown on 28 September 2026).
- [S-O3] https://developers.openai.com/api/docs/guides/prompt-caching
- [S-O4] https://developers.openai.com/api/docs/guides/batch
- [S-O5] https://developers.openai.com/api/docs/guides/your-data
- [S-O6] https://developers.openai.com/api/docs/guides/reasoning
- [S-O8] https://cdn.openai.com/osa/openai-services-agreement.pdf, "OpenAI Services Agreement ONLINE v.010126" (effective 1 January
  2026 per search result).
- [S-O9] Usage API: search results for https://developers.openai.com/api/reference/typescript/resources/admin/subresources/organization/subresources/usage/methods/completions
  and https://developers.openai.com/cookbook/examples/completions_usage_api (not fetched directly).
- Sign in with ChatGPT: https://developers.openai.com/siwc, .../siwc/request-client-id, and search summary of
  .../siwc/token-sharing-open-source/preview-limitations, https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites
  (terms file §3).

**Anthropic**
- [S-A1] https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console
- [S-A2] https://platform.claude.com/docs/en/about-claude/pricing (no version or date).
- [S-A3] https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- [S-A4] https://platform.claude.com/docs/en/api/rate-limits (example error message dated 2026-09-01).
- [S-A5] https://platform.claude.com/docs/en/build-with-claude/usage-cost-api (redirects to /manage-claude/usage-cost-api).
- [S-A6] https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- [S-A7] https://www.anthropic.com/legal/commercial-terms (header date 17 June 2025).
- [S-A8] https://www.anthropic.com/legal/aup (effective 12 November 2026, a future date relative to retrieval).
- [S-A9] https://platform.claude.com/docs/en/build-with-claude/extended-thinking

**Google**
- [S-G1] https://ai.google.dev/gemini-api/docs/pricing (last updated 2026-10-16 UTC).
- [S-G2] https://ai.google.dev/gemini-api/docs/rate-limits (last updated 2026-10-15 UTC).
- [S-G3] https://ai.google.dev/gemini-api/docs/billing (no date).
- [S-G4] https://ai.google.dev/gemini-api/docs/google-ai-plans (last updated 2026-10-16 UTC).
- [S-G5] https://ai.google.dev/gemini-api/docs/caching
- [S-G6] https://ai.google.dev/api/generate-content (first 100,000 of 174,589 characters read).
- [S-G7] https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance
- [S-G8] https://ai.google.dev/gemini-api/terms (effective 23 March 2026, last updated 28 April 2026).
- [S-G9] https://ai.google.dev/gemini-api/docs/thinking

**xAI**
- [S-X1] https://docs.x.ai/developers/rate-limits (no date).
- [S-X2] https://docs.x.ai/developers/models and https://docs.x.ai/developers/pricing (no date).
- [S-X3] https://docs.x.ai/console/billing (also .md variant returned 404).
- [S-X4] search summary of https://docs.x.ai/docs/key-information/billing.
- [S-X5] https://docs.x.ai/developers/advanced-api-usage/prompt-caching/usage-and-pricing and
  https://docs.x.ai/developers/model-capabilities/text/reasoning
- [S-X6] https://docs.x.ai/developers/cost-tracking
- [S-X7] https://x.ai/legal/terms-of-service-enterprise (403; see terms file).
- [S-X8] https://docs.x.ai/developers/advanced-api-usage/batch-api
- [S-X9] https://docs.x.ai/developers/rest-api-reference/management
- Security FAQ: https://docs.x.ai/docs/resources/faq-api/security

**P1/P2**
- [S-P1] https://api-docs.deepseek.com/quick_start/pricing
- [S-P2] https://docs.mistral.ai/getting-started/models/
- [S-P3] https://www.alibabacloud.com/help/en/model-studio/models (list last updated 11 October 2026 per page)
- [S-P4] https://docs.ollama.com/api/openai-compatibility
- [S-P5] https://docs.vllm.ai/en/latest/serving/online_serving/
- Meta: https://dev.meta.ai/llama/llama-downloads/ (redirect chain from llama.com).

## 10. Not found, not retrievable, or low confidence

- Not retrievable (HTTP 403): openai.com policy pages (service terms, business terms, usage policies, Sign in with ChatGPT
  Terms), help.openai.com articles, x.ai legal pages (enterprise terms, acceptable use). 404: OpenAI audit-logs and costs
  reference URLs tried, docs.x.ai billing paths tried. These are listed so a person can fetch them in a browser.
- Not read: Google Vertex AI pricing and quota pages (content did not render as text); Anthropic Messages API `usage` response
  schema in full; OpenAI Setting-up-prepaid-billing help page; Google `usageMetadata` detail fields after the first 100,000
  characters.
- Not found in official sources: a postpaid self-serve option and committed-use discounts at OpenAI; Anthropic embeddings, image
  or audio generation prices and Priority Tier prices; Google rate-limit headers and a Developer API usage endpoint; xAI embeddings,
  rate-limit headers, Management API endpoints, free-credit amounts, and any statement on subscriptions including API credits;
  currency or regional price differences at all four beyond the data-residency multipliers noted.
- Low confidence: figures drawn from search summaries rather than a direct fetch (marked above); the arrow notation at Google;
  every price (a person must verify each seed record).

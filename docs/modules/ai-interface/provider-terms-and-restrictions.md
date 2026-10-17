# AI provider terms and restrictions (brief §4.4)

Status: research note, Phase 1 item 16, retrieved **16 October 2026**. Deliverable `AI_PROVIDER_TERMS_AND_RESTRICTIONS` of the
[AI infrastructure brief](../../specifications/ai-infrastructure-brief.md) §18. Companion: [provider-commercial-comparison.md](provider-commercial-comparison.md)
(source list S-numbers are defined there, §9). **This is a research summary, not legal advice and not a conclusion that any use
is permitted.** Each entry in §9 is a flag for legal review. Confidence: medium; several policy pages could not be fetched
(§10), and contract text was read through a fetch summariser except where a document text was extracted directly (marked).

Rules applied: official sources only; "not found in official sources" (NF) where a point is absent; no assumption fills a gap.
Terms change; every version or effective date seen is recorded. Governing documents differ by route (consumer, business, API,
cloud marketplace); only API and business routes matter for a hosted product, and the consumer routes are covered in §8.

## 1. Documents read

| Provider | Document | Version or date shown | How read |
| --- | --- | --- | --- |
| OpenAI | OpenAI Services Agreement, https://cdn.openai.com/osa/openai-services-agreement.pdf | "ONLINE v.010126" (effective 1 January 2026 per a search result) | PDF text extracted directly; clauses 2.2, 3.1 to 3.4, 4, 6, 8, 16 read |
| OpenAI | Data controls, https://developers.openai.com/api/docs/guides/your-data | no date | fetch summary |
| OpenAI | Safety best practices and safety identifiers | no date | search summary only |
| OpenAI | Sign in with ChatGPT pages (developers.openai.com/siwc) | no date | fetch summary and search summary |
| OpenAI | Service terms, usage policies, business terms, Sign in with ChatGPT Terms (openai.com/policies) | not read | HTTP 403 on fetch |
| Anthropic | Commercial Terms of Service, https://www.anthropic.com/legal/commercial-terms | header date 17 June 2025 | fetch summary; sections A.1, B, D.2 to D.4, E, K.2, M.4 |
| Anthropic | Usage Policy (AUP), https://www.anthropic.com/legal/aup | effective 12 November 2026 (after the retrieval date; the page may describe an upcoming version) | fetch summary |
| Anthropic | API and data retention, platform.claude.com | no date | fetch (partial) |
| Google | Gemini API Additional Terms of Service, https://ai.google.dev/gemini-api/terms | effective 23 March 2026, last updated 28 April 2026 | fetch summary |
| Google | Vertex AI data governance (docs.cloud.google.com) | no date | fetch summary |
| Google | Google Cloud Platform Terms / Service Specific Terms, Prohibited Use Policy | not read | out of reach of the pages fetched |
| xAI | Enterprise Terms of Service, https://x.ai/legal/terms-of-service-enterprise (current version said to be 12 May 2026 in a search result) | not read | HTTP 403 on fetch |
| xAI | API security FAQ, https://docs.x.ai/docs/resources/faq-api/security | no date | fetch summary |

## 2. Commercial use of the API

- **OpenAI.** The Services Agreement grants "a non-exclusive right to access and use the Services" including "the right to use
  OpenAI's API to integrate the Services into Customer Applications and to make Customer Applications available to End Users"
  (§2.2). A Customer Application is "Customer's applications, products, or services that integrate with an OpenAI API". Customer owns
  Output and retains Input rights (§4.1). Restrictions in §3.3 include reverse engineering, extracting data other than as
  permitted, circumventing rate limits or Usage Limits, and buying, selling or transferring API keys.
- **Anthropic.** Customer may use the Services "to power its own products and services for its own customers and end users
  ('Users')" (A.1). Customer owns Outputs subject to compliance (B). Customer must not build a competing product or train
  competing models or resell the Services without approval, and must not reverse engineer (D.4).
- **Google.** The Services are "for professional or business development, not consumer use". Google claims no ownership of
  generated content. Competing models and reverse engineering are prohibited. Making API Clients available in the EEA,
  Switzerland or the UK requires Paid Services ([S-G8]).
- **xAI.** NF: the Enterprise Terms could not be fetched. A search snippet of a December 2024 version shows a clause that lets the
  customer offer the API inside its own products to end users and a restriction list covering selling, renting, leasing and
  time-sharing; the current text was not read. Do not rely on the snippet.

## 3. SaaS embedding, resale and multi-tenant use

- **OpenAI.** Embedding in a Customer Application is expressly permitted (§2.2). §3.1: "Customer will not share Account access
  credentials or individual login credentials between multiple users. Customer may not resell or lease access to its Account or
  any End User Account." §3.2: End User Accounts "may only be provisioned to, registered for, and used by, a single End User";
  Customer is responsible for all End User activity and must obtain End User consents. §3.3(g): no buying, selling or
  transferring API keys. §3.3(i): do not violate or circumvent Usage Limits "or otherwise configure the Services to avoid Usage
  Limits". Usage Limits are defined to include End User, messaging, token and throughput limits. Whether pooling many tenants
  behind one platform key is "resale or lease" of the Account is not answered by the text read: **flag L-1**.
- **Anthropic.** The AUP (retrieved) bars "Resell, proxy, or otherwise provide access to Claude through unauthorized means",
  and gives routing requests through consumer subscriptions as an example. The Commercial Terms permit powering the customer's own
  products for its Users but forbid reselling "without Anthropic's approval". Where a product that exposes raw model access to
  tenants crosses into resale: **flag L-1**. Customer must notify Users that "factual assertions in Outputs should not be relied
  upon without independently checking their accuracy" (D.3) and indemnifies Anthropic for claims tied to its or its Users' Inputs
  or policy-violating use (K.2).
- **Google.** Paid Services allow API Clients; the terms summary found no resale clause and no restriction on multiple projects
  to avoid limits ("not found on this page"), but the Google Cloud terms and Prohibited Use Policy were not read: **flag L-1**.
  Grounding with Google Search is limited to applications "you own and operate".
- **xAI.** NF (not fetched).
- **Multi-tenant.** No provider read states a multi-tenant rule by name. OpenAI's per-End-User account rule (§3.2) and the
  safety-identifier mechanism (§4) are the closest. Separation of tenant data, per-tenant keys and per-tenant cache keys are
  platform design matters, not provider permissions: **flag L-2** (confirm that one platform account serving many tenants is
  within each provider's terms, or whether tenants should bring their own provider accounts).

## 4. End-user identification

- **OpenAI.** A per-user `safety_identifier` (supersedes the `user` parameter) is **recommended, not required**; stable unique
  string per user, hashed, up to 128 characters (search summary of help.openai.com and developers.openai.com safety pages). Without
  it, "access may be temporarily revoked for the entire organization"; with it, enforcement can target the individual identifier.
  Safety webhooks `safety.warning_issued` and `safety.deactivation_issued` exist. A flagged identifier cannot currently be
  unblocked by OpenAI (same source). The Realtime API uses the `OpenAI-Safety-Identifier` header. For prompt caching, GPT-5.6 and
  later suggest separate `prompt_cache_key` values per customer to keep cache accounting separate and prevent cache-hit probing
  across users ([S-O3]).
- **Anthropic.** Consumer-facing chatbots must tell users they are talking to AI; minors rules; high-risk uses need human review
  (AUP summary). An end-user identifier requirement: NF in the pages read.
- **Google.** Users must be 18 or older, and API Clients may not be directed at or likely accessed by anyone under 18. End-user
  identifier requirement: NF.
- **xAI.** NF.
- **Consequence for the platform:** send a hashed per-user identifier to OpenAI from the first live test; use per-tenant cache
  keys; log the mapping on the platform side only.

## 5. Data retention, training and zero retention

| | OpenAI | Anthropic | Google | xAI |
| --- | --- | --- | --- | --- |
| Training on API data | Not used unless the customer opts in: "data sent to the OpenAI API is not used to train or improve OpenAI models" ([S-O5]); Services Agreement §4: no use "to develop or improve the Services" without agreement (search summary of the agreement, confirm in the extracted text). | "Anthropic may not train models on Customer Content from Services" (Commercial Terms B); retained data never used for training without express permission ([S-A6]). | Paid Services: prompts and responses not used to improve products, processed under the Data Processing Addendum. Unpaid services (AI Studio free, unpaid API quota): used to improve products; human reviewers may read; "Do not submit sensitive, confidential, or personal information to the Unpaid Services" ([S-G8]). EEA, Switzerland, UK get paid-service data terms even when unpaid. Vertex: not used without prior permission ([S-G7]). | "SpaceXSI never trains on your API inputs or outputs without your explicit permission" ([security FAQ]). Note the company name in the FAQ differs from "xAI". |
| Default retention | Abuse-monitoring logs up to 30 days; Responses application state 30 days if stored; several endpoints retain until deleted ([S-O5]). | Conversation content not retained by default, except the Covered Models Fable 5.1, Mythos 5.1, Fable 5 and Mythos 5 which require 30-day retention and are not under ZDR ([S-A6]). | Gemini API paid: prompts and responses logged "for a limited period of time" for abuse and legal reasons; period NF. Search grounding: 30 days; Maps: 30 days ([S-G8]). Vertex: abuse-monitoring logging may occur; caches up to 24 hours; request-response logging off by default ([S-G7]). | 30 days encrypted for auditing, then deleted (security FAQ). |
| Zero retention | Approved customers only ("subject to prior approval"), via sales; some endpoints not eligible; image and file inputs are scanned for CSAM and flagged content retained ([S-O5]). | ZDR per organisation on request through sales; not covered: Console, Managed Agents, consumer plans, the four Covered Models; CORS unsupported under ZDR ([S-A6]). | Vertex: request an exception to abuse logging; Google Search grounding logs kept up to 3 days with no way to disable; Maps 30 days ([S-G7]). Gemini API: NF. | Team-level ZDR setting; response header `x-zero-data-retention`; "For most customers, we do not recommend enabling ZDR"; Enterprise agreements govern retention separately. |
| Regional processing | Data residency (storage) in US, EU/EEA/Switzerland, AU, CA, JP, IN, SG, KR, UK, AE; in-region processing only in US, Europe and UAE; non-US regions need approval for abuse-monitoring controls and a Modified Retention amendment; +10% price ([S-O5], [S-O1p]). | `inference_geo` `us` or `global` (default) on the first-party API, 1.1x for `us`; Bedrock and Google Cloud have own regional endpoints at +10% ([S-A2]). | Gemini API: NF for region choice; access limited to supported regions. Vertex: regional and multi-region endpoints; global endpoint can serve from any region ([S-G7]). | Default `api.x.ai` "does not guarantee a processing region"; `us.api.x.ai` for US handling (1.1x) (security FAQ, [S-X2]). EU: not mentioned. |

Other points: Anthropic and OpenAI both state that flagged content may be retained regardless of arrangement. Google's Gemini
API Contributor tier (invite-only) "shares data for product improvement" ([S-G1]). Anthropic's HIPAA readiness and OpenAI's
and Google's compliance programmes were not researched.

## 6. Enterprise privacy arrangements

- **OpenAI:** Data Processing Addendum referenced from the Services Agreement (https://openai.com/policies/data-processing-addendum/,
  not read). Modified Abuse Monitoring and ZDR need approval; residency regions as above.
- **Anthropic:** DPA incorporated by reference in the Commercial Terms (C); ZDR and HIPAA-readiness (BAA through the Console)
  documented ([S-A6]); compliance and activity-feed APIs exist for Enterprise.
- **Google:** Data Processing Addendum for Paid Services; Vertex AI offers CMEK (not for durable caching), residency endpoints,
  disable-cache settings ([S-G7]).
- **xAI:** SOC 2 Type 2 stated in the security FAQ; the FAQ page does not mention a DPA; an Enterprise Customer Agreement
  "governs retention separately".

## 7. Attribution, branding and output rules

- **OpenAI:** no attribution requirement found in the agreement text read. Sign in with ChatGPT button branding rules exist
  (ADR-0047 recorded the required label "Continue with ChatGPT"); the logo is not included.
- **Anthropic:** no brand-attribution rule found in the pages read. Deployer duties: AI disclosure for consumer-facing chat,
  user notice about accuracy, human review for high-risk recommendations and physical actions (AUP summary; effective date
  12 November 2026).
- **Google:** "Attribution may be required" for generated content (summary wording; the rule itself was not quoted). Grounding with
  Google Search: results must be shown with Search Suggestions; no caching, framing, training or indexing of results beyond narrow
  exceptions; no modification; Maps: show Maps Links, caching limits (90 days or six months in end-user chat history) ([S-G8]).
  These bind the UI design: **flag L-6**.
- **xAI:** NF.

## 8. Restrictions on routing, aggregation and model use

- **Competing-model clauses.** OpenAI §3.3(e): no use of Output "to develop artificial intelligence models that compete with
  OpenAI's products and services", except a "Permitted Exception" (embeddings or classifiers not distributed to third parties;
  fine-tuning OpenAI models). Anthropic D.4 and AUP: no building competing products, no distillation without authorisation. Google:
  no developing competing models. xAI: NF. **Flag L-4:** the platform stores AI outputs, benchmarks models, and may use outputs
  to evaluate or tune routing; confirm none of this counts as developing a competing model, and that an orchestrator that picks
  between providers is not itself a competing service.
- **Routing and aggregation.** No P0 provider text read prohibits sending the same request to several providers, or choosing a
  provider automatically. The explicit prohibitions concern resale of access, proxying "through unauthorized means" (Anthropic),
  key trading (OpenAI) and circumventing limits (OpenAI §3.3(h), (i)). **Flag L-5:** automatic fallback to another provider on
  rate-limit errors is not circumvention of one provider's limits, but multiple accounts or projects used to multiply a provider's
  limits could be (OpenAI: "configure the Services to avoid Usage Limits"; Anthropic AUP: multiple accounts to evade detection).
- **Geography.** OpenAI §16.12: Customer and End Users "may not access or offer access to the Services outside of the Supported
  Countries and Territories" and must comply with export controls and sanctions (§16.11). Google: available regions only.
  Anthropic: AUP bars access in violation of the Supported Regions Policy. Platform tenants outside supported regions are a
  compliance issue: **flag L-7**.
- **Safety-critical engineering.** Anthropic's AUP requires qualified human review for high-risk physical actions and independent
  limits not set by model output; Google bars medical-device uses and says robotics models are not for safety-critical
  applications; OpenAI usage policies were not read. This platform produces engineering concepts; certification claims need care
  (see AGENTS.md, development assurance): **flag L-8**.
- **Open-weight models.** The licence of any open-weight model hosted by the platform (Llama, Mistral variants, Qwen) must be read
  per model. Mistral's page shows Apache 2.0, modified MIT and CC BY-NC 4.0 on different models; the Llama licence text and
  Qwen/Alibaba terms were not retrieved (NF). **Flag L-9** (P1, not blocking P0).

## 9. Consumer-subscription restrictions and consumer sign-in in a hosted product (OSS-14)

### 9.1 What each provider says

- **OpenAI.** ChatGPT plans are billed separately from the API. "Sign in with ChatGPT" has two documented uses:
  1. **Identity sign-in on websites.** The "Request a client ID" page (retrieved) says: "Sign in with ChatGPT is currently offered
     to a select group of commercial partners", and directs others to an interest form (waitlist).
  2. **Using the user's ChatGPT plan for AI requests in an app.** The open-source integration (developers.openai.com/siwc,
     token-sharing-open-source pages) is described in search summaries of the official pages as "available for open-source tools
     and personal projects that run locally. If you're building a paid or remotely hosted app, join the waitlist to request access
     before offering it to users." Plan usage through apps can carry its own weekly cap set by the user. The preview limits include
     `store: false`, `stream: true` and no file search, Code Interpreter, image generation or hosted MCP.
  The fetched overview page itself did not state eligibility or waitlist terms; those sentences come from the search summaries of
  the other official pages and from ADR-0047 (checked 15 October 2026), which recorded the same position. The Sign in with ChatGPT
  Terms page (openai.com/policies/sign-in-with-chatgpt-terms/) returned 403 and was not read.
- **Anthropic.** The AUP lists routing requests through consumer subscriptions as an example of prohibited reselling or proxying.
  The Commercial Terms govern API use; consumer plans are governed by separate consumer terms (not read). No OAuth "sign in with
  Claude for plan usage" programme for third-party hosted apps was found in the pages read.
- **Google.** Plan benefits apply "only in the AI Studio web interface, not to direct API use"; direct API use needs a Cloud
  Billing-enabled key ([S-G4]). A consumer-account sign-in that lets a third-party app spend subscription quota: NF.
- **xAI.** NF: no consumer-account sign-in programme and no statement on subscriptions and API access found in the pages read.

### 9.2 Conclusion for OSS-14 (a recommendation to the owner, subject to legal review)

On the evidence retrieved, **"Sign in with ChatGPT" for plan usage must not be used in the hosted multi-user product unless
OpenAI approves the product through its waitlist**: the official wording ties plan usage to open-source and local personal
projects, and requires paid or remotely hosted apps to be approved first. Identity-only sign-in is likewise limited to "a select
group of commercial partners". Nothing retrieved says OpenAI has granted such approval to this project. No other P0 provider offers
a documented consumer-account sign-in for hosted apps (OpenAI aside, NF), and Anthropic's AUP names consumer-subscription routing
as prohibited. The compliant hosted routes are therefore: (a) the platform's own provider API account, metered and resold only as
a feature, subject to flag L-1; and (b) each customer's own provider API key (BYOK), subject to flag L-3. The local-installation
D1 use remains within the documented open-source and personal-project eligibility, which is the position of ADR-0047. This does
not authorise any change to the existing connection code; it informs the owner's decision recorded in OSS-14.

## 10. Requires legal review (flags, not conclusions)

| Flag | Question | Evidence and gap |
| --- | --- | --- |
| L-1 | Does serving many tenants through one platform API account, with metering and credits charged to tenants, amount to resale or lease of access or "reselling or proxying" at OpenAI, Anthropic, Google, xAI? | OpenAI §3.1 (no resale or lease of Account), Anthropic AUP and D.4, Google terms silent in the summary, xAI terms unread. |
| L-2 | Is one platform account for many tenants permitted, versus requiring tenants to hold their own provider accounts (for OpenAI "End User" definitions and per-End-User account rule §3.2)? | No provider text read names multi-tenant SaaS. |
| L-3 | Is BYOK (the customer's own provider key stored and used by the platform) permitted, and who is "Customer" under each agreement? Key custody by the platform may conflict with "transfer API keys" (OpenAI §3.3(g)). | No explicit BYOK statements found at any provider. |
| L-4 | Do storing outputs, benchmarking and any routing-quality learning count as developing competing models (OpenAI §3.3(e), Anthropic D.4, Google)? | Permitted Exceptions are narrow; xAI unread. |
| L-5 | Do automatic multi-provider fallback, and any use of several accounts or projects to raise limits, breach "avoid Usage Limits" (OpenAI §3.3(i)) or multiple-account rules (Anthropic AUP)? | Fallback is not addressed; multiple-account use is. |
| L-6 | Display and storage rules for grounded results (Google Search Suggestions, Maps Links, caching limits) and any attribution duty. | Google terms summary only. |
| L-7 | Can tenants in all intended countries use each provider through the platform, given Supported Countries lists, sanctions and "KYC" duties (OpenAI §16.11, 16.12)? | Lists not read. |
| L-8 | Obligations when outputs inform safety-critical engineering decisions (human review, no certification reliance, product liability), including indemnities and warranty disclaimers. | Anthropic AUP, Google terms; OpenAI usage policies and xAI unread. |
| L-9 | Licence terms of open-weight models (Llama, Qwen, Mistral variants) before hosting for customers. | Not retrieved for Llama and Qwen. |
| L-10 | Data processing: EU/UK transfer terms, DPAs with each provider, sub-processor lists, and whether an unpaid or free-tier route is ever used with customer content (Google unpaid services use content to improve products). | DPAs not read; Google unpaid rules read. |
| L-11 | Whether "Sign in with ChatGPT" (identity or plan usage) can be used in a hosted product at all, and under what approval. | Official wording requires waitlist approval for paid or remote apps; Terms page unread (403). Owner decision OSS-14. |
| L-12 | Provider terms effective dates and change control: OpenAI price changes 14 days after posting (§6.6), updates bind by continued use (§16 amendments); Anthropic AUP effective 12 November 2026; Google terms updated 28 April 2026. Who monitors changes? | Process question for the owner. |
| L-13 | Customer indemnities (OpenAI and Anthropic K.2) for customer content and policy violations by tenants. | Flows down to tenants only if the platform's own terms say so. |

## 11. Not found, not retrievable, or low confidence

- HTTP 403: all openai.com/policies pages (service terms, business terms, usage policies, DPA, Sign in with ChatGPT Terms), all
  x.ai/legal pages, help.openai.com articles. A person with a browser should read these before the legal review.
- Not read: Google Cloud Platform Terms, Service Specific Terms, Prohibited Use Policy, Vertex AI terms; Anthropic consumer terms
  and Supported Regions Policy; OpenAI Supported Countries list; xAI Enterprise Terms and Acceptable Use Policy; the Llama licence;
  Alibaba/Qwen terms.
- Search-summary-only statements (lower confidence): OpenAI safety identifier details, OpenAI help articles, the xAI
  billing-page details beyond the directly fetched billing page.
- NF: any explicit BYOK rule; any multi-tenant rule; xAI SaaS and resale terms; Anthropic and OpenAI branding or attribution
  duties; Google rate-limit headers and abuse-log retention period for the Gemini API.

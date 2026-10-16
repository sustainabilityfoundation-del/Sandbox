# Claude Code Master Implementation Brief: Unified AI Infrastructure, Multi-Provider Orchestration, Usage Metering and Commercialization

Status: **owner brief, 16 October 2026; authoritative input for the AI infrastructure work.** The text below is the owner's brief
as issued (formatting normalised). Coordinator notes at the end map it onto the repository; they do not change it.

- Project: Modular AI-Native Engineering Platform (Faber)
- Priority: High; core architectural infrastructure
- Immediate objective: operational multi-provider AI integration with automatic model optimization and API-based developer testing
- Long-term objective: commercially scalable, provider-independent AI services with subscriptions, credits, enterprise controls,
  and intelligent orchestration

## 1. Executive objective

Architect and implement a unified AI infrastructure that enables the engineering platform to use multiple commercial and
open-source AI models through a common interface. The infrastructure shall support:

1. Multiple AI providers, including OpenAI, Anthropic Claude, Google Gemini, and xAI Grok.
2. Automatic selection and optimization of AI models based on engineering task requirements, quality, cost, and latency.
3. Manual provider and model selection.
4. Multi-model collaboration within engineering workflows.
5. Centralized API usage metering and provider cost calculation.
6. A provider-independent customer credit system.
7. Modular software subscriptions and future commercial billing.
8. Bring Your Own Key (BYOK) operation.
9. Provider-specific subscription, pricing, quota, and commercial arrangements.
10. Simple developer activation and testing without requiring customer signup or payment processing.

The immediate implementation must allow a developer to configure API credentials, select a model, and execute real engineering
workflows through the existing application without first implementing the commercial subscription system. The platform must be
designed for commercialization from the outset, but the commercial infrastructure must not delay the current engineering prototype.

### 1.1 Architectural principles

- Provider independence: engineering modules shall not directly depend on individual AI providers.
- Centralized orchestration: AI requests shall pass through a common orchestration and provider gateway.
- Engineering-first optimization: model selection shall prioritize task suitability and validated engineering performance.
- Deterministic verification: mathematical, geometric, and engineering validation shall use deterministic tools wherever practical.
- Commercial flexibility: customer credits shall remain independent of provider billing arrangements.
- Prototype accessibility: developer testing shall not require customer registration or subscription activation.
- Modularity: providers, orchestration, metering, pricing, and billing shall be separately maintainable components.
- Traceability: AI operations, model decisions, usage, cost, and verification outcomes shall be auditable.
- Security: credentials and confidential engineering information must remain protected.
- Extensibility: adding a provider or model shall not require changes to engineering module implementations.

## 2. Agent assignment and coordination

Spawn a dedicated AI Infrastructure & Commercialization Agent responsible for this capability. The agent shall coordinate with the
existing main architecture agent and AI integration agent. Where useful, delegate bounded tasks to specialist subagents covering:
AI provider gateway and adapters; provider commercial research; intelligent model orchestration; usage metering and credit
accounting; subscription and entitlement architecture; developer configuration and user interface; testing and documentation.

### 2.1 Initial investigation

Before implementation:

1. Read `AGENTS.md`, existing architecture documentation, and relevant agent instructions.
2. Inspect the AI interface and existing provider integrations.
3. Identify the current backend, authentication, database, and API architecture.
4. Inspect the engineering module contracts and AI tool interfaces.
5. Identify existing usage tracking or billing infrastructure.
6. Research official provider API and commercial documentation.
7. Identify reusable functionality and architectural conflicts.
8. Produce a concise implementation plan.

Do not duplicate existing services or create unnecessary repositories. Use the project's established branching, worktree,
pull-request, and documentation conventions. Never push directly to `main`.

## 3. Supported AI providers

Implement a provider-independent architecture supporting the following ecosystems.

| Provider | Model families | Priority |
| --- | --- | --- |
| OpenAI | GPT, reasoning, multimodal | P0 |
| Anthropic | Claude | P0 |
| Google | Gemini | P0 |
| xAI | Grok | P0 |
| DeepSeek | General and reasoning | P1 |
| Mistral AI | Mistral, Codestral | P1 |
| Alibaba | Qwen | P1 |
| Meta ecosystem | Llama through compatible hosting | P1 |
| Local inference | Ollama, vLLM and compatible endpoints | P2 |

P0 providers must have functional adapters in the initial implementation, with mocked integration tests where live credentials are
unavailable. P1 and P2 providers shall be supported architecturally and scheduled in the development backlog. Do not hard-code
model versions.

### 3.1 Standardized provider interface

Create a common provider interface supporting: text generation; reasoning; streaming responses; tool and function calling;
structured outputs; multimodal inputs; image generation where supported; audio and voice where supported; embeddings;
context-window constraints; token usage reporting; provider-specific billing units; cancellation and timeouts; error handling;
rate limits; model availability. Preserve provider-specific capabilities through optional extensions rather than forcing all
providers into a restrictive common denominator.

### 3.2 Model registry

Maintain a centralized registry containing: provider and model identifiers; display names; supported capabilities and modalities;
context and output limits; tool-calling support; structured output reliability; pricing configuration; typical latency; engineering
benchmark results; availability and deprecation status; authentication requirements; model-specific restrictions. Where supported,
use provider model-discovery APIs. Otherwise, maintain versioned configuration.

## 4. Mandatory provider commercial research

Before finalizing the pricing engine and billing architecture, research the actual commercial models of each supported AI provider.
Use current official provider documentation as the primary source. Research must distinguish consumer subscriptions, business
subscriptions, enterprise agreements, and API billing arrangements. A customer's ChatGPT, Claude, Gemini, or Grok consumer
subscription must not be assumed to provide API credits or commercial API access.

### 4.1 Subscription and account structures

For each provider, research: consumer subscriptions; business and enterprise subscriptions; API account requirements; whether API
access is included in subscriptions; separate API billing activation; prepaid versus postpaid billing; free tiers and promotional
credits; usage tiers; enterprise contracts; committed-use agreements; BYOK compatibility.

### 4.2 API pricing structures

Research: input-token pricing; output-token pricing; cached-token pricing; cache creation and retention charges; reasoning token
accounting; long-context pricing; batch-processing discounts; image generation; audio and speech; embeddings; search and grounding
charges; tool-use charges; per-request or per-operation charges; hosted inference; self-hosted inference; reserved-capacity pricing;
volume discounts; currency and regional differences. Do not assume all providers use identical token definitions or billing units.

### 4.3 Rate limits and usage restrictions

Research: requests per minute; tokens per minute; requests per day; concurrent request limits; model-specific quotas; account-tier
restrictions; context limits; batch-processing limits; spending caps; provider-reported quota availability; usage and billing APIs.
Distinguish provider account limits from customer credit allowances.

### 4.4 Commercial licensing and contractual requirements

Review: commercial API usage rights; SaaS embedding and resale restrictions; multi-tenant application permissions; end-user
identification requirements; data retention and training policies; regional data processing; enterprise privacy arrangements;
branding and attribution requirements; restrictions on model aggregation or routing; consumer subscription restrictions; open-weight
model licensing. Flag issues requiring legal review rather than assuming commercial use is permitted.

### 4.5 Commercial compatibility matrix

Produce a maintained matrix comparing the providers (OpenAI, Claude, Gemini, Grok) for: consumer subscription; separate API billing;
prepaid credits; postpaid billing; token pricing; prompt caching; batch discounts; usage tiers; rate limits; usage reporting;
enterprise agreements; BYOK; SaaS restrictions. Populate the matrix from official sources. Record source URLs, retrieval dates, and
applicable pricing versions. Do not substitute assumptions for missing information.

## 5. Prototype-first API activation

This is a critical immediate requirement. The system must work before production customer registration, subscription management,
or payment processing exists.

### 5.1 Developer mode

Implement a dedicated development mode. Allow provider credentials to be configured through environment variables or an equivalent
secure developer configuration. Illustrative configuration:

```
AI_MODE=development
AI_BILLING_MODE=meter_only
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=
XAI_API_KEY=
AI_DEFAULT_ROUTING=automatic
AI_DEFAULT_OPTIMIZATION=balanced
AI_MONTHLY_DEV_BUDGET_USD=25
```

Reconcile configuration names with existing conventions. The application shall: (1) detect configured providers; (2) validate
credentials using an appropriate low-cost request; (3) load available models; (4) display configured providers and models; (5) allow
manual model selection; (6) execute real AI requests; (7) display responses; (8) record usage and estimated cost; (9) support
automatic model selection; (10) allow switching between providers. No customer account registration, software subscription, or
payment integration shall be required.

### 5.2 Meter-only billing mode

Implement a `meter_only` mode. In this mode: real provider APIs may be used; actual usage is recorded; provider cost is estimated; no
customer credits are deducted; no payment provider is required; no customer subscription is required; no customer credit card
information is collected. The developer remains responsible for charges incurred through provider API accounts. Support configurable
development spending limits. Clearly distinguish estimated costs from final provider invoices.

### 5.3 Mock mode

Implement a separate mock mode requiring no external credentials. Support: deterministic mock responses; simulated token usage;
simulated costs; simulated streaming; simulated provider failures; model-routing tests; workflow-level usage aggregation tests. Never
present simulated engineering results as real validated AI outputs.

### 5.4 Future customer activation

Architect, but defer implementation of: customer registration; subscription selection; module entitlement activation; monthly credit
allocation; additional credit purchases; production BYOK configuration. Developer mode and production BYOK must remain distinct.

**Acceptance criterion:** a developer can configure a valid provider API key, launch the application, and execute an AI-assisted
engineering operation without completing customer signup or payment processing.

## 6. Intelligent model orchestration and optimization

Implement a centralized AI orchestration engine between engineering modules and provider adapters. The platform must support both
user-selected models and automatic model optimization.

### 6.1 Operating modes

| Mode | Behavior |
| --- | --- |
| Automatic: Balanced | Default; optimize reliability, capability, cost and latency |
| Maximum Quality | Prioritize engineering performance and verification |
| Economy | Minimize cost subject to minimum capability and quality requirements |
| Manual | User selects provider and model |

Automatic mode shall be the default when suitable models are available. The orchestrator must respect user preferences,
confidentiality requirements, project policies, and spending limits.

### 6.2 Engineering task classification

Classify requests according to task requirements, for example: conversational assistance; conceptual engineering; requirements
generation; requirements verification; SysML modeling; CAD feature creation; geometry interpretation; mathematical analysis;
engineering code generation; technical document research; concept visualization; independent engineering review; documentation.
Use deterministic classification where possible. Avoid spending more on task classification than the underlying task warrants.

### 6.3 Dynamic model selection

Select models based on: required capabilities; engineering benchmark performance; cost; latency; context size; tool-calling
reliability; structured output reliability; provider availability; customer policies; confidentiality restrictions; available
budget; applicable provider commercial pricing. Do not assume that the newest, largest, or most expensive model is always the best
choice.

### 6.4 Multi-model collaboration

Support workflows where different models contribute to the same engineering operation: sequential collaboration (one model develops
a concept, another evaluates it, and another addresses deficiencies); parallel exploration (multiple models independently develop
alternatives); independent review (a separate model reviews engineering artifacts against requirements and assumptions);
disagreement analysis (compare model outputs and identify inconsistencies requiring further investigation). Models may belong to the
same provider or different providers. Do not assume model consensus establishes engineering correctness.

### 6.5 Adaptive escalation

When a model fails a task, the orchestrator may: (1) correct and retry the request; (2) increase reasoning effort where supported;
(3) select a more suitable model; (4) invoke deterministic verification; (5) request independent model review; (6) escalate to the
user. Enforce bounded retries and spending limits.

### 6.6 Engineering performance benchmarks

Develop an internal benchmark suite covering representative tasks from each engineering module. Measure: task completion; schema
validity; tool-call correctness; requirement compliance; deterministic verification success; user correction frequency; cost;
latency. Use validated benchmark evidence to improve routing decisions. Do not automatically train external models using customer
engineering data.

## 7. Provider commercial optimization

The model orchestration engine shall account for provider-specific commercial arrangements, for example: prefer lower-cost models
when engineering performance is equivalent; use batch discounts for non-interactive tasks where suitable; avoid providers approaching
known rate limits; consider long-context pricing; exploit prompt caching where supported; consider reserved-capacity availability;
account for enterprise negotiated pricing; respect provider data-handling restrictions; avoid unnecessary repeated inference.
Optimization must use the pricing configuration applicable to the actual provider account, not simply publicly advertised rates.
Engineering correctness, authorization, and confidentiality take precedence over cost optimization.

## 8. Centralized AI usage metering

All chargeable provider requests shall pass through centralized usage accounting.

### 8.1 Usage hierarchy

Organization → Project → Engineering Operation → Agent Workflow → Model Request. Every request shall record its relevant identifiers.

### 8.2 Normalized usage record

```ts
interface AIUsageRecord {
  requestId: string;
  operationId: string;
  workflowId?: string;
  organizationId?: string;
  userId?: string;
  projectId?: string;
  moduleId?: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  providerUsageDetails?: Record<string, unknown>;
  estimatedProviderCost?: string;
  actualProviderCost?: string;
  currency: string;
  creditsCharged?: string;
  pricingVersion?: string;
  accountingStatus: "estimated" | "provisional" | "settled" | "reconciled";
  timestamp: string;
}
```

Extend the schema for image, audio, embedding, and other non-token billing units. Distinguish provider-reported usage from estimated
usage. Use decimal-safe financial calculations.

### 8.3 Usage ledger

Implement an append-only, auditable usage and financial transaction ledger. Requirements: idempotent accounting; concurrent request
safety; workflow aggregation; provider attribution; project and module attribution; historical pricing reproducibility; failure
handling; cancellation handling; compensating corrections. Do not duplicate charges during retries or repeated callbacks. Avoid
storing confidential engineering prompts or responses in billing records unless separately authorized.

## 9. Provider pricing engine

Implement a generalized pricing engine capable of accommodating different provider commercial structures.

### 9.1 Supported pricing arrangements

Pay-as-you-go token billing; prepaid provider credits; postpaid invoicing; tiered or volume-based pricing; batch-processing
discounts; reserved-capacity agreements; enterprise negotiated pricing; hosted open-weight inference; self-hosted inference;
per-request, per-image, per-minute, or other unit-based billing. Do not assume all costs can be calculated using only input and
output tokens.

### 9.2 Pricing registry

Maintain versioned pricing records containing: provider; model; metered billing dimension; unit rate; currency; effective date;
pricing version; applicable discounts; account-specific overrides; official source reference. Historical usage must remain
reproducible after pricing changes.

### 9.3 Provider account configuration

Design a provider account layer recording: provider; credential reference; account or organization identifier; billing arrangement;
usage tier; account-specific pricing; rate-limit configuration; spending caps; reported or estimated remaining quota; credential
validation status; reconciliation status. Do not assume providers expose actual remaining monetary balances or complete quota
information through their APIs. Label estimates appropriately.

### 9.4 Pricing maintenance

Implement: versioned pricing configuration; effective dates; official documentation references; administrative review of changes;
automated pricing calculation tests; historical transaction reproducibility; warnings for outdated pricing records. Do not silently
apply unverified scraped pricing changes.

## 10. Provider-independent customer credits

Implement a customer credit currency independent of provider token counts and invoices. For illustration: provider API cost $0.10;
customer markup 50%; customer usage value $0.15; credit value $0.001; credits charged 150. These values are illustrative and
configurable.

### 10.1 Credit management

Design for: monthly included credits; purchased credits; trial credits; promotional credits; organization-level pools; project
budgets; user budgets; credit expiration; reservations; settlement; refunds; spending alerts. Ensure concurrent operations cannot
overspend prepaid credit balances.

### 10.2 Workflow cost control

Before expensive operations: (1) estimate consumption; (2) establish an authorized budget; (3) reserve an allowance; (4) execute the
workflow; (5) track actual usage; (6) stop or request approval at spending thresholds; (7) settle actual consumption. Never silently
execute unlimited expensive multi-agent workflows.

## 11. Subscription and commercialization architecture

Separate software module entitlements from AI usage allowances. A customer may subscribe to any combination of: Requirements
Management; SysML Modeling; CAD; Conceptualize; Engineering Analysis; Project Management; future modules. Module subscriptions
determine access to software capabilities. AI credits determine the included AI consumption allowance.

### 11.1 Commercial models

- A. Subscription with included credits: monthly software subscription with an included AI allowance.
- B. Prepaid credits: customers purchase additional AI credits.
- C. Usage-based billing: eligible customers pay for measured consumption.
- D. Bring Your Own Key: customers supply their own provider credentials and pay the provider directly. The platform still records
  usage but must not charge provider-consumption credits unless explicitly defined by the commercial agreement.
- E. Enterprise subscription: organization-wide entitlements, pooled credits, administrative budgets, and negotiated pricing.

### 11.2 Payment integration

Design a payment-provider abstraction, with Stripe as a candidate future integration. Do not implement production payment processing
during the initial prototype. Subscription payment infrastructure must not become a dependency of the engineering modules or provider
gateway.

## 12. AI interface requirements

Integrate the functionality into the existing compact AI assistant interface.

### 12.1 Model selector

AI Model: Automatic: Balanced (default); Automatic: Maximum Quality; Automatic: Economy; Manual Selection (OpenAI, Anthropic Claude,
Google Gemini, xAI Grok, Other Providers). Manual selection shall expose available models. Unavailable models shall be disabled with
explanatory tooltips.

### 12.2 Developer configuration panel

Provide a developer-only panel showing: configured providers; credential status; credential validation; available models; operating
mode; usage; estimated provider cost; development spending budget; mock mode. Credentials must remain server-side and must not be
persisted in browser storage.

### 12.3 Usage display

Display a compact usage indicator in the AI assistant (for example "AI: Automatic: Balanced; current model: Claude; operation usage:
24 credits"). In meter-only mode, show provider cost instead of implying customer credits were charged. Provide an expandable
breakdown of: provider and model; operation; token usage; cost; routing decision; verification actions; workflow totals.

### 12.4 Future customer interface

Architect but defer: subscription management; credit purchases; monthly allowances; billing history; organization budgets;
project-level usage reports; enterprise administration.

## 13. Integration with engineering modules

All engineering modules shall access AI through stable orchestration interfaces. No module shall directly implement provider
authentication, model pricing, credit balances, or provider-specific billing logic. The orchestration architecture shall support:
reading engineering artifacts; creating and modifying artifacts through authorized module APIs; mathematical calculations; CAD
feature generation; requirements creation and verification; SysML model generation; engineering analysis; verification evidence
generation; project traceability; concept visualization. Use structured tool contracts rather than uncontrolled direct database
mutations. Existing authorization, validation, transaction, and audit requirements must remain enforced.

## 14. Reference architecture

User → Engineering Application → AI Assistant (model selector, usage display) → AI Orchestration Engine (task classifier, workflow
planner, model optimizer, agent coordinator, verification logic) → engineering module APIs and the AI Gateway (OpenAI, Claude,
Gemini, Grok, other providers) → Usage Metering → Pricing Engine → Credit / Cost Ledger → Subscription & Billing (future phase).
Adapt this to the existing codebase. The gateway shall enforce request authorization and budget policies before dispatch. Provider
usage accounting shall capture every relevant request, including those initiated internally by the orchestrator. Avoid circular
service dependencies.

## 15. Security and reliability

Implement appropriate controls for: server-side credential storage; tenant isolation; credential rotation; provider data-transfer
policies; tool authorization; prompt-injection resistance; rate limiting; spending limits; request retries; provider outages;
streaming interruptions; partial completions; duplicate accounting events; model deprecation; provider pricing changes;
cancellation; audit logging. Environment-variable configuration is acceptable for local development. Use an appropriate
secrets-management system for production. Never expose provider credentials to browser clients or commit them to source control.
When metering is unavailable, apply an explicit fail-safe policy rather than permitting unrestricted unmetered API usage.

## 16. Implementation roadmap

**Phase 1: working developer prototype (implement immediately).** Deliver: (1) provider abstraction and gateway; (2) OpenAI adapter;
(3) Anthropic Claude adapter; (4) Google Gemini adapter; (5) xAI Grok adapter; (6) model registry; (7) manual model selection;
(8) basic automatic routing; (9) developer API-key configuration; (10) mock mode; (11) meter-only mode; (12) usage recording;
(13) provider cost estimation; (14) basic usage interface; (15) automated integration tests; (16) commercial pricing research for P0
providers. No customer registration, subscription, credit purchasing, or payment integration is required.

**Phase 1 demonstration**, using the existing engineering prototype: configure at least two provider API keys; submit a real
engineering request; execute through the orchestration layer; change providers manually; execute an equivalent request; switch to
Automatic mode; observe model selection; display usage and cost; confirm engineering artifacts are created through the existing
module interfaces. Use mocked providers to verify all four P0 adapters when live credentials are unavailable. Do not claim live
testing without a successful real provider request.

**Phase 2: intelligent orchestration.** Task classification; capability-based routing; cost-aware optimization; provider fallback;
bounded escalation; multi-model workflows; engineering benchmarking; verification-informed routing.

**Phase 3: credit accounting.** Customer credit balances; credit conversion; reservations and settlement; organization budgets;
project budgets; spending alerts; credit transaction history.

**Phase 4: commercial subscriptions.** Customer onboarding; subscription plans; module entitlements; included credits; purchased
credits; payment integration; customer billing dashboard; production BYOK.

**Phase 5: advanced optimization.** Model performance analytics; adaptive routing policies; independent multi-model review; parallel
concept generation; workflow-level optimization; enterprise provider policies; advanced usage analytics; gross-margin reporting.

## 17. Testing and acceptance criteria

Create automated tests verifying:

1. Every P0 provider conforms to the common adapter interface.
2. Mock mode works without credentials.
3. Development mode works without customer signup.
4. Live credentials can be validated.
5. Manual model selection works.
6. Automatic model selection works.
7. Unavailable models are correctly disabled.
8. Provider usage is normalized.
9. Cost calculations respect provider-specific pricing.
10. Different billing structures can be represented.
11. Multi-agent requests aggregate usage.
12. Duplicate events do not produce duplicate charges.
13. Spending limits are enforced.
14. Provider fallback respects security and budget policies.
15. Engineering modules remain provider-independent.
16. Existing prototype functionality remains operational.
17. Credentials are not exposed to frontend clients.
18. A real engineering workflow can execute through at least two live providers when credentials are available.
19. Historical pricing calculations remain reproducible.
20. BYOK usage does not incorrectly incur platform provider-consumption charges.

Separate mock, integration, and live-provider test results.

## 18. Required documentation and deliverables

Produce or update: `AI_INFRASTRUCTURE_ARCHITECTURE.md`; `AI_PROVIDER_COMMERCIAL_COMPARISON.md`; `AI_PROVIDER_PRICING_ARCHITECTURE.md`;
`AI_PROVIDER_TERMS_AND_RESTRICTIONS.md`; `AI_MODEL_ORCHESTRATION.md`; `AI_USAGE_METERING.md`;
`AI_CREDIT_AND_SUBSCRIPTION_ARCHITECTURE.md`; provider adapter contracts; model registry specification; API documentation;
development setup instructions; security review; automated test suite; phased implementation backlog. Use existing documentation
conventions and directories rather than creating redundant structures. Update `AGENTS.md` and relevant module architecture
documentation so future agents use the centralized AI infrastructure. Document the procedure for adding new providers and models.

## 19. Execution instructions for Claude

1. Inspect the existing repository and architecture.
2. Spawn and coordinate the dedicated AI Infrastructure & Commercialization Agent.
3. Research official provider commercial and API documentation.
4. Identify existing components that can be reused.
5. Produce a concise architecture and implementation plan.
6. Implement Phase 1 using existing project conventions.
7. Use a dedicated feature branch and pull request.
8. Run automated tests.
9. Test real provider calls where credentials are available.
10. Document implemented, mocked, and deferred functionality.
11. Add Phases 2-5 to the project backlog.
12. Coordinate any cross-module interface changes with the main architecture agent.

Do not interrupt the primary end-to-end engineering prototype development. Do not build production payment infrastructure before
the core AI integration is functional.

**Final directive.** The immediate success criterion is a working engineering prototype capable of using OpenAI, Claude, Gemini, and
Grok through a common interface, with manual or automatic model selection, accurate usage metering, provider-specific cost
estimation, and simple developer API activation without customer signup or payment infrastructure. The architecture must accommodate
the actual subscription, API pricing, rate-limit, and commercial licensing arrangements of the supported providers. Design for
commercial subscriptions and intelligent multi-model optimization now, but prioritize working integrations and demonstrable
engineering functionality. The ultimate objective is an AI-native engineering platform that automatically selects and coordinates
the most appropriate AI capabilities while optimizing engineering quality, customer value, operating cost, and commercial
sustainability.

---

## Coordinator notes (16 October 2026)

- **Reuse, do not duplicate.** `services/assistant` already provides a provider-neutral backend (provider registry, OpenAI adapter,
  fake provider), account connections with encrypted credentials, a server-enforced AI access policy, audit, and persisted proposals
  with a server-side Apply gateway ([ADR-0047](../decisions/), ADR-0048, ADR-0049; [ai-connection.md](ai-connection.md)). This brief
  extends that service into the gateway, orchestrator, metering and pricing engine; engineering modules keep using registered
  operations (module manifests, capability registry ADR-0074).
- **Owner rules kept.** Automated runs never reach the owner's connected AI account; live provider tests run only with API keys the
  owner configures for developer mode, within the development budget. Open-source first applies to libraries used for adapters,
  decimal arithmetic and metering ([OPEN_SOURCE_STRATEGY.md](../architecture/OPEN_SOURCE_STRATEGY.md)).
- **Branching.** This work uses a feature branch and a pull request; the GitHub CLI is not installed, so the coordinator provides the
  branch for the owner to open the pull request. Whether "never push directly to main" applies to all work is an open owner question.
- **Documents.** The deliverable names in §18 are mapped to existing directories by the implementation plan (likely
  `docs/modules/ai-interface/` and `docs/specifications/`) rather than new top-level files.

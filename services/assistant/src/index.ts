/**
 * @ews/assistant-service: provider-neutral model backend for the workspace assistant (docs/specifications/
 * ai-connection.md). Provider registry and adapters (OpenAI first), account connections with encrypted
 * credentials, the server-enforced AI access policy, audit; a Fastify plugin hosted by @ews/api at
 * /api/assistant/v1. Server-side callers (for example the design reasoning model gateway) use
 * `AssistantBackend.complete`.
 */
export { assistantPlugin, assistantOpenApi, registerOAuthCallback, ASSISTANT_BASE_PATH, ASSISTANT_API_VERSION, type AssistantPluginOptions } from './plugin'
export { AssistantBackend, AssistantError, safeReturnTo, type Principal, type SettingsAccess, type AssistantBackendOptions } from './service'
export { CredentialVault } from './crypto'
export { ProviderRegistry } from './providers/registry'
export { createOpenAIProvider, OPENAI_DEFAULT_MODEL, OPENAI_CAPABILITIES, normaliseOpenAIUsage, toFunctionName, type OpenAIProviderOptions } from './providers/openai'
export { createFakeProvider, FAKE_PROVIDER_ID } from './providers/fake'
export { ProviderError, type ProviderCapabilities, type ProviderUsage, type ProviderErrorKind, type AssistantProvider, type AuthMethod, type ProviderCredential, type ProviderMessage, type ProviderModel, type ProviderTool, type RespondInput, type RespondOutput } from './providers/types'
export { AI_MODULES, AI_SETTINGS_PAGE, AI_SETTING_DEFINITIONS, DEFAULT_POLICY, OPERATION_CATALOGUE, OPERATION_CLASSES, classify, createPolicy, decide, policyFromSettings, type AiPolicy, type AiModule, type AccessLevel, type OperationClass, type Policy } from './policy'
export { migrateAssistant, ASSISTANT_MIGRATIONS } from './db/migrate'
export type { WireRequest, WireResponse } from './wire'
export { loadAssistantKey } from './keyfile'
export { ProposalService, PROPOSAL_SCHEMA_VERSION, publicProposal, type ModuleApi, type ModuleCaller, type ProposalInput, type ProposalKind, type ProposalStatus, type OperationResult } from './proposals'
export { loadModelRegistry, validateModelRegistry, defaultModelId, intersectModels, findRegistryModel, matchesModel, type ModelRegistryFile, type RegistryModel, type ModelIntersection } from './models'
export { loadPricing, validatePricingFile, resolvePricing, selectModifiers, PricingError, calculateCost, costFromSnapshot, usageQuantities, isPriced, snapshotOf, addMoney, Money, type PricingRecord, type PricingFile, type PriceModifier, type RatesSnapshot, type CostResult } from './pricing'
export { Gateway, estimateInputTokens, routingView, usageView, type GatewayCall, type GatewayResult, type GatewayOptions, type UserConnectionHandle } from './gateway/gateway'
export { DeveloperAccounts, type DeveloperAccountView, type DeveloperAccountState } from './gateway/accounts'
export { PgMetering, type Metering } from './gateway/metering'
export { budgetState, monthOf, type BudgetState } from './gateway/budget'
export { DEFAULT_AI_RUNTIME, DEVELOPER_PROVIDERS, DEVELOPER_KEY_VARIABLES, type AiMode, type AiRuntimeConfig } from './gateway/runtime'
export type { CostView, RoutingView, UsageView } from './gateway/types'
export { route, evaluate, RoutingError, type Candidate, type Evaluation, type RouteDecision, type RouteRequest } from './orchestrator/route'
export { ROUTING_MODES, ROUTING_PROVIDERS, CONTEXT_MODES, routingFromSettings, type RoutingMode, type RoutingDefault, type ContextMode, type RoutingSettings } from './orchestrator/settings'
export type { ContextBlock, ContextBundle } from './providers/types'
export { UsageLedger, LedgerError, priceUsage, syncPricing, sanitizeRaw, type UsageEventInput, type UsageEventRow, type AggregateQuery, type AggregateRow } from './ledger'

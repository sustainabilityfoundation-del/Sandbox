import type { RoutingDefault } from '../orchestrator/settings'

/**
 * How the assistant backend sources models (ADR-0080):
 * - `mock`: no external credentials. Every real source, including the person's own connections, is disabled; the scripted
 *   mock personas answer, and every usage row is simulated.
 * - `development`: provider keys from the server environment (developer keys), plus the person's own connections. Meter-only
 *   billing: usage and estimated cost are recorded, no credits are charged, a monthly development budget is enforced.
 * - `user`: the person's own connection only (the behaviour before this increment; the production path, BYOK later).
 */
export type AiMode = 'mock' | 'development' | 'user'

export interface AiRuntimeConfig {
  mode: AiMode
  /** The only Phase 1 billing mode. */
  billing: 'meter_only'
  /** One monthly cap across providers, as a decimal string in USD (default 25). */
  monthlyBudgetUsd: string
  defaultOptimization: RoutingDefault
  allowUnverifiedPricing: boolean
  /** Developer keys by provider ID (development mode only). Server memory only: never serialised, logged or returned. */
  developerKeys: Record<string, string>
}

export const DEFAULT_AI_RUNTIME: AiRuntimeConfig = {
  mode: 'user',
  billing: 'meter_only',
  monthlyBudgetUsd: '25',
  defaultOptimization: 'balanced',
  allowUnverifiedPricing: false,
  developerKeys: {},
}

/** Commercial providers developer keys can be configured for, and the environment variables that carry them (first one set wins). */
export const DEVELOPER_PROVIDERS: { id: string; name: string; env: string[] }[] = [
  { id: 'openai', name: 'OpenAI', env: ['OPENAI_API_KEY'] },
  { id: 'anthropic', name: 'Anthropic', env: ['ANTHROPIC_API_KEY'] },
  { id: 'google', name: 'Google Gemini', env: ['GEMINI_API_KEY', 'GOOGLE_AI_API_KEY'] },
  { id: 'xai', name: 'xAI', env: ['XAI_API_KEY'] },
]

/** Environment variables a test environment must clear so a key in a developer's shell is never picked up by accident. */
export const DEVELOPER_KEY_VARIABLES: string[] = DEVELOPER_PROVIDERS.flatMap((p) => p.env)


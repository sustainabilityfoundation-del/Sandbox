import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEVELOPER_PROVIDERS, type AiMode, type AiRuntimeConfig, type RoutingDefault } from '@ews/assistant-service'

/** Repository root (services/api/src → ../../..). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

export interface ApiConfig {
  production: boolean
  host: string
  port: number
  /** 'embedded': start a real PostgreSQL from npm (embedded-postgres); 'external': connect to DATABASE_URL (Docker Compose or a server). */
  pgMode: 'embedded' | 'external'
  databaseUrl: string
  databaseName: string
  embedded: { port: number; dataDir: string; user: string; password: string }
  storageDir: string
  seedOnStart: boolean
  reqifSchemaDir: string
  outboxRetentionHours: number
}

/** Loads `.env` from the repository root if present (Node ≥ 20.12). Existing variables win. */
export function loadEnvFile() {
  const file = join(REPO_ROOT, '.env')
  if (existsSync(file)) process.loadEnvFile(file)
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const production = env.NODE_ENV === 'production'
  const pgMode = (env.EWS_PG ?? 'embedded') === 'external' ? 'external' : 'embedded'
  const embedded = {
    port: Number(env.EMBEDDED_PG_PORT ?? 54329),
    dataDir: resolve(REPO_ROOT, env.EMBEDDED_PG_DIR ?? '.data/pg'),
    user: env.EMBEDDED_PG_USER ?? 'postgres',
    password: env.EMBEDDED_PG_PASSWORD ?? 'local-dev-only',
  }
  const databaseName = env.EWS_DB_NAME ?? 'ews_dev'
  const databaseUrl =
    pgMode === 'external'
      ? (env.DATABASE_URL ?? `postgres://ews:local-dev-only@127.0.0.1:5432/${databaseName}`)
      : `postgres://${encodeURIComponent(embedded.user)}:${encodeURIComponent(embedded.password)}@127.0.0.1:${embedded.port}/${databaseName}`
  return {
    production,
    host: env.API_HOST ?? '127.0.0.1',
    port: Number(env.API_PORT ?? 8787),
    pgMode,
    databaseUrl,
    databaseName: new URL(databaseUrl).pathname.replace(/^\//, '') || databaseName,
    embedded,
    storageDir: resolve(REPO_ROOT, env.STORAGE_DIR ?? '.data/objects'),
    outboxRetentionHours: Number(env.OUTBOX_RETENTION_HOURS ?? 168),
    reqifSchemaDir: resolve(REPO_ROOT, env.REQIF_SCHEMA_DIR ?? '.data/reqif-schemas'),
    seedOnStart: (env.SEED_ON_START ?? (production ? 'false' : 'true')) === 'true',
  }
}

/**
 * AI runtime configuration, read on the server only (ADR-0080; `.env.example`):
 * - `EWS_AI_MODE=mock|development`; default mock. `EWS_ASSISTANT_FAKE_PROVIDER=1` is an alias for mock. Development without a
 *   provider key falls back to mock. Production ignores both and uses people's own connections only.
 * - Developer keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY`, `XAI_API_KEY`) are read only
 *   in development mode and never in production, so a key in a developer's shell is not picked up by accident.
 * - `EWS_AI_MONTHLY_DEV_BUDGET_USD` (default 25; one cap across providers), `EWS_AI_DEFAULT_OPTIMIZATION` (balanced),
 *   `EWS_AI_ALLOW_UNVERIFIED_PRICING` (default 1 in development, 0 in production).
 * Keys are returned inside the config and must never be logged or serialised; `warnings` never contain a key.
 */
export function readAiConfig(env: NodeJS.ProcessEnv = process.env, production = env.NODE_ENV === 'production'): { config: AiRuntimeConfig; warnings: string[] } {
  const warnings: string[] = []
  const requested = (env.EWS_AI_MODE ?? '').trim().toLowerCase()
  const fakeAlias = env.EWS_ASSISTANT_FAKE_PROVIDER === '1'
  const keys: Record<string, string> = {}
  let mode: AiMode
  if (production) {
    mode = 'user'
    if (requested || fakeAlias) warnings.push('EWS_AI_MODE and EWS_ASSISTANT_FAKE_PROVIDER are ignored in production: the assistant uses people’s own connections only.')
  } else {
    if (requested && requested !== 'mock' && requested !== 'development') warnings.push(`EWS_AI_MODE=${requested} is not recognised (use mock or development); using mock.`)
    mode = requested === 'development' ? 'development' : 'mock'
    if (fakeAlias && mode === 'development') warnings.push('EWS_ASSISTANT_FAKE_PROVIDER=1 is an alias for mock mode and conflicts with EWS_AI_MODE=development; development mode wins.')
    else if (fakeAlias) mode = 'mock'
    if (mode === 'development') {
      for (const p of DEVELOPER_PROVIDERS) {
        const name = p.env.find((n) => (env[n] ?? '').trim())
        if (name) keys[p.id] = (env[name] as string).trim()
      }
      if (!Object.keys(keys).length) {
        warnings.push('EWS_AI_MODE=development but no provider key is set (OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, XAI_API_KEY): using mock mode.')
        mode = 'mock'
      }
    }
  }
  const budget = (env.EWS_AI_MONTHLY_DEV_BUDGET_USD ?? '').trim()
  const monthlyBudgetUsd = /^\d+(\.\d+)?$/.test(budget) ? budget : '25'
  if (budget && monthlyBudgetUsd !== budget) warnings.push('EWS_AI_MONTHLY_DEV_BUDGET_USD is not a number; using 25.')
  const optimization = (env.EWS_AI_DEFAULT_OPTIMIZATION ?? '').trim().toLowerCase()
  const defaultOptimization: RoutingDefault = optimization === 'economy' || optimization === 'quality' || optimization === 'balanced' ? optimization : 'balanced'
  if (optimization && optimization !== defaultOptimization) warnings.push('EWS_AI_DEFAULT_OPTIMIZATION is not recognised (economy, balanced or quality); using balanced.')
  const unverified = (env.EWS_AI_ALLOW_UNVERIFIED_PRICING ?? '').trim().toLowerCase()
  const allowUnverifiedPricing = unverified ? unverified === '1' || unverified === 'true' : mode === 'development'
  return { config: { mode, billing: 'meter_only', monthlyBudgetUsd, defaultOptimization, allowUnverifiedPricing, developerKeys: keys }, warnings }
}

/** Only the development database and disposable test databases may be reset. */
export function isResettable(databaseName: string): boolean {
  return databaseName === 'ews_dev' || /^ews_test(_[a-z0-9]+)?$/.test(databaseName)
}

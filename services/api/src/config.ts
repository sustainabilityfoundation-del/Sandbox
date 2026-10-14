import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
    seedOnStart: (env.SEED_ON_START ?? (production ? 'false' : 'true')) === 'true',
  }
}

/** Only the development database and disposable test databases may be reset. */
export function isResettable(databaseName: string): boolean {
  return databaseName === 'ews_dev' || /^ews_test(_[a-z0-9]+)?$/.test(databaseName)
}

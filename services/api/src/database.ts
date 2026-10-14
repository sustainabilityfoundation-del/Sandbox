import { existsSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import type { ApiConfig } from './config'
import { isResettable } from './config'

/**
 * PostgreSQL for development and tests. Docker Compose (`docker compose up -d db`, EWS_PG=external)
 * is the documented primary setup. On machines without Docker, EWS_PG=embedded (the default)
 * starts official PostgreSQL binaries from the `embedded-postgres` npm package — a real server,
 * not an in-memory imitation.
 */

export interface EmbeddedHandle {
  stop: () => Promise<void>
  /** Admin connection string (database "postgres"). */
  adminUrl: string
}

/** Starts embedded PostgreSQL unless something already listens on its port. */
export async function startEmbedded(cfg: { port: number; dataDir: string; user: string; password: string; persistent?: boolean }, log: (m: string) => void = console.log): Promise<EmbeddedHandle> {
  const adminUrl = `postgres://${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.password)}@127.0.0.1:${cfg.port}/postgres`
  if (await canConnect(adminUrl)) {
    log(`PostgreSQL already running on port ${cfg.port}; using it.`)
    return { adminUrl, stop: async () => undefined }
  }
  const { default: EmbeddedPostgres } = await import('embedded-postgres')
  const server = new EmbeddedPostgres({
    databaseDir: cfg.dataDir,
    user: cfg.user,
    password: cfg.password,
    port: cfg.port,
    persistent: cfg.persistent ?? true,
    // UTF-8 regardless of the OS code page (Windows would default to WIN1252).
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => undefined,
    onError: (e: unknown) => log(`[postgres] ${String(e)}`),
  })
  if (!existsSync(join(cfg.dataDir, 'PG_VERSION'))) {
    log(`Initialising PostgreSQL data directory ${cfg.dataDir}`)
    await server.initialise()
  }
  await server.start()
  log(`Embedded PostgreSQL started on port ${cfg.port} (data: ${cfg.dataDir}).`)
  return { adminUrl, stop: () => server.stop() }
}

export async function canConnect(url: string): Promise<boolean> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1500 })
  try {
    await client.connect()
    await client.end()
    return true
  } catch {
    await client.end().catch(() => undefined)
    return false
  }
}

const ident = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Invalid database name ${name}`)
  return `"${name}"`
}

export async function ensureDatabase(adminUrl: string, name: string) {
  const client = new pg.Client({ connectionString: adminUrl })
  await client.connect()
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (!rowCount) await client.query(`CREATE DATABASE ${ident(name)}`)
  } finally {
    await client.end()
  }
}

/** Drops and recreates a database. Refuses anything but ews_dev and ews_test databases. */
export async function resetDatabase(adminUrl: string, name: string) {
  if (!isResettable(name)) throw new Error(`Refusing to reset database “${name}”: only ews_dev and ews_test* databases may be reset.`)
  const client = new pg.Client({ connectionString: adminUrl })
  await client.connect()
  try {
    await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [name])
    await client.query(`DROP DATABASE IF EXISTS ${ident(name)}`)
    await client.query(`CREATE DATABASE ${ident(name)}`)
  } finally {
    await client.end()
  }
}

export async function dropDatabase(adminUrl: string, name: string) {
  if (!isResettable(name)) throw new Error(`Refusing to drop database “${name}”.`)
  const client = new pg.Client({ connectionString: adminUrl })
  await client.connect()
  try {
    await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [name])
    await client.query(`DROP DATABASE IF EXISTS ${ident(name)}`)
  } finally {
    await client.end()
  }
}

/** Admin URL (database "postgres") for the configured server. */
export function adminUrlOf(cfg: ApiConfig): string {
  const u = new URL(cfg.databaseUrl)
  u.pathname = '/postgres'
  return u.toString()
}

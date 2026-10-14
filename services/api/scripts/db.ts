// Database commands: npm run db:up | db:migrate | db:seed | db:reset | db:status (from the repository root).
import { spawnSync } from 'node:child_process'
import pg from 'pg'
import { loadEnvFile, readConfig, isResettable, REPO_ROOT } from '../src/config'
import { adminUrlOf, canConnect, ensureDatabase, resetDatabase, startEmbedded } from '../src/database'
import { prepareDatabase } from '../src/server'

loadEnvFile()
const cfg = readConfig()
const command = process.argv[2]

async function withServer<T>(fn: (adminUrl: string) => Promise<T>): Promise<T> {
  if (cfg.pgMode === 'embedded') {
    const handle = await startEmbedded(cfg.embedded)
    try {
      return await fn(handle.adminUrl)
    } finally {
      await handle.stop()
    }
  }
  const adminUrl = adminUrlOf(cfg)
  if (!(await canConnect(adminUrl))) throw new Error(`Cannot reach PostgreSQL at ${new URL(adminUrl).host}. Run "npm run db:up" first (Docker Compose).`)
  return fn(adminUrl)
}

async function withPool<T>(fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
  const pool = new pg.Pool({ connectionString: cfg.databaseUrl })
  try {
    return await fn(pool)
  } finally {
    await pool.end()
  }
}

async function main() {
  switch (command) {
    case 'up': {
      if (cfg.pgMode === 'external') {
        const r = spawnSync('docker', ['compose', 'up', '-d', 'db'], { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
        if (r.status !== 0) throw new Error('docker compose failed. Without Docker, set EWS_PG=embedded (the default) and run "npm run db:up" again.')
        return
      }
      const handle = await startEmbedded(cfg.embedded)
      await ensureDatabase(handle.adminUrl, cfg.databaseName)
      console.log(`PostgreSQL is running (embedded, port ${cfg.embedded.port}, database ${cfg.databaseName}). Press Ctrl+C to stop.`)
      const stop = async () => {
        await handle.stop()
        process.exit(0)
      }
      process.on('SIGINT', stop)
      process.on('SIGTERM', stop)
      await new Promise(() => undefined)
      return
    }
    case 'migrate':
      await withServer(async (adminUrl) => {
        await ensureDatabase(adminUrl, cfg.databaseName)
        const r = await withPool((pool) => prepareDatabase(pool, { seed: false }))
        console.log(`platform: applied ${r.platform.applied.join(', ') || 'nothing'}; requirements: applied ${r.requirements.applied.join(', ') || 'nothing'}`)
      })
      return
    case 'seed':
      await withServer(async (adminUrl) => {
        await ensureDatabase(adminUrl, cfg.databaseName)
        const r = await withPool((pool) => prepareDatabase(pool, { seed: true }))
        console.log(r.seed?.message)
      })
      return
    case 'reset': {
      if (!isResettable(cfg.databaseName)) throw new Error(`Refusing to reset “${cfg.databaseName}”: only ews_dev and ews_test* databases may be reset.`)
      if (cfg.production) throw new Error('Refusing to reset with NODE_ENV=production.')
      await withServer(async (adminUrl) => {
        await resetDatabase(adminUrl, cfg.databaseName)
        const r = await withPool((pool) => prepareDatabase(pool, { seed: true }))
        console.log(`Reset ${cfg.databaseName}: migrated and seeded. ${r.seed?.message ?? ''}`)
      })
      return
    }
    case 'status':
      await withServer(async () => {
        const rows = await withPool(async (pool) => {
          const m = await pool.query("SELECT 'requirements' AS schema, version, name, applied_at FROM requirements.schema_migrations UNION ALL SELECT 'platform', version, name, applied_at FROM platform.schema_migrations ORDER BY 1, 2").catch(() => ({ rows: [] }))
          const n = await pool.query('SELECT count(*)::int AS n FROM requirements.requirements').catch(() => ({ rows: [{ n: 0 }] }))
          return { migrations: m.rows, requirements: n.rows[0].n }
        })
        console.log(JSON.stringify({ database: cfg.databaseName, mode: cfg.pgMode, ...rows }, null, 2))
      })
      return
    default:
      console.log('Usage: db.ts up | migrate | seed | reset | status')
      process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

// `npm run dev:api`: starts PostgreSQL (embedded mode), migrates, seeds an empty database, serves on API_PORT.
import pg from 'pg'
import { localObjectStorage } from '@ews/requirements-service'
import { loadEnvFile, readConfig } from './config'
import { adminUrlOf, canConnect, ensureDatabase, startEmbedded } from './database'
import { buildServer, prepareDatabase } from './server'

loadEnvFile()
const cfg = readConfig()
let stopDb: () => Promise<void> = async () => undefined
if (cfg.pgMode === 'embedded') {
  const handle = await startEmbedded(cfg.embedded)
  stopDb = handle.stop
  await ensureDatabase(handle.adminUrl, cfg.databaseName)
} else {
  if (!(await canConnect(adminUrlOf(cfg)))) {
    console.error(`Cannot reach PostgreSQL at ${new URL(cfg.databaseUrl).host}. Start it with "npm run db:up" (Docker Compose) or set EWS_PG=embedded.`)
    process.exit(1)
  }
  await ensureDatabase(adminUrlOf(cfg), cfg.databaseName)
}
const pool = new pg.Pool({ connectionString: cfg.databaseUrl, max: 20 })
const prepared = await prepareDatabase(pool, { seed: cfg.seedOnStart })
console.log(`Migrations: platform ${prepared.platform.applied.length} new, requirements ${prepared.requirements.applied.length} new.${prepared.seed ? ` ${prepared.seed.message}` : ''}`)
const server = await buildServer({ pool, storage: localObjectStorage(cfg.storageDir), production: cfg.production, logger: true, reqifSchemaDir: cfg.reqifSchemaDir })
await server.app.listen({ host: cfg.host, port: cfg.port })
console.log(`Requirements API on http://${cfg.host}:${cfg.port}/api/requirements/v1 (OpenAPI: /api/requirements/v1/openapi.json), database ${cfg.databaseName} (${cfg.pgMode}).`)

let stopping = false
async function shutdown() {
  if (stopping) return
  stopping = true
  await server.close().catch(() => undefined)
  await pool.end().catch(() => undefined)
  await stopDb().catch(() => undefined)
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

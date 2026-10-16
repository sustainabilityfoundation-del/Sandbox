// `npm run dev:api`: starts PostgreSQL (embedded mode), migrates, seeds an empty database, serves on API_PORT.
import pg from 'pg'
import { localObjectStorage } from '@ews/requirements-service'
import { localBlobStore } from '@ews/projects-service'
import { REPO_ROOT, loadEnvFile, readConfig } from './config'
import { adminUrlOf, canConnect, ensureDatabase, startEmbedded } from './database'
import { buildServer, prepareDatabase } from './server'
import { loadAssistantKey } from '@ews/assistant-service'

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
console.log(`Migrations: platform ${prepared.platform.applied.length} new, requirements ${prepared.requirements.applied.length} new, conceptualize ${prepared.concepts.applied.length} new, projects ${prepared.projects.applied.length} new.${prepared.seed ? ` ${prepared.seed.message}` : ''}`)
const server = await buildServer({
  pool,
  storage: localObjectStorage(cfg.storageDir),
  production: cfg.production,
  logger: true,
  reqifSchemaDir: cfg.reqifSchemaDir,
  outboxRetentionHours: cfg.outboxRetentionHours,
  // Project Management documents and attachments (content-addressed, STORAGE_DIR).
  blobs: localBlobStore(cfg.storageDir),
  // AI connection: credential key from EWS_ASSISTANT_KEY (development: generated once in .data/), loopback origin for provider sign-in.
  assistant: { key: loadAssistantKey({ production: cfg.production, repoRoot: REPO_ROOT }), publicOrigin: `http://${cfg.host}:${cfg.port}`, fakeProvider: process.env.EWS_ASSISTANT_FAKE_PROVIDER === '1' },
})
await server.app.listen({ host: cfg.host, port: cfg.port })
console.log(`Requirements API on http://${cfg.host}:${cfg.port}/api/requirements/v1 (OpenAPI: /api/requirements/v1/openapi.json), database ${cfg.databaseName} (${cfg.pgMode}).`)
console.log(`Settings API on http://${cfg.host}:${cfg.port}/api/settings/v1, Assistant API on http://${cfg.host}:${cfg.port}/api/assistant/v1 (references: …/docs).${process.env.EWS_ASSISTANT_FAKE_PROVIDER === '1' && !cfg.production ? ' Fake AI provider registered (development).' : ''}`)
console.log(`Project Management API on http://${cfg.host}:${cfg.port}/api/projects/v1 (OpenAPI: /api/projects/v1/openapi.json, reference: /api/projects/v1/docs).`)
console.log(`Conceptualize API on http://${cfg.host}:${cfg.port}/api/concepts/v1 (OpenAPI: /api/concepts/v1/openapi.json, reference: /api/concepts/v1/docs).`)

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

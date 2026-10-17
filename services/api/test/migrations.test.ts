import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listMigrations } from '@ews/requirements-service'
import { dropDatabase, ensureDatabase } from '../src/database'
import { SCHEMA_MIGRATIONS, checkMigrations, migrateAll } from '../src/migrations'
import { createTestEnv, testDbUrl, type TestEnv } from './helpers'
import { inject } from 'vitest'

/** The all-schema migration command (DEPLOYMENT_AUDIT.md change C4) on a fresh, disposable database. */
const name = `ews_test_${randomBytes(5).toString('hex')}`
let pool: pg.Pool

beforeAll(async () => {
  await ensureDatabase(inject('pgAdminUrl'), name)
  pool = new pg.Pool({ connectionString: testDbUrl(name), max: 4 })
})
afterAll(async () => {
  await pool?.end()
  await dropDatabase(inject('pgAdminUrl'), name)
})

const rowCount = async (schema: string) => (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${schema}.schema_migrations`)).rows[0].n

describe('migrate all schemas', () => {
  it('reports every schema pending on an empty database, without creating anything', async () => {
    const status = await checkMigrations(pool)
    expect(status.current).toBe(false)
    expect(status.schemas).toHaveLength(9)
    expect(status.pending).toBeGreaterThanOrEqual(27)
    expect((await pool.query("SELECT 1 FROM information_schema.schemata WHERE schema_name = 'platform'")).rowCount).toBe(0)
  })

  it('applies all nine schemas on a fresh database, and a second run changes nothing', async () => {
    const first = await migrateAll(pool)
    expect(first.map((r) => r.schema)).toEqual(SCHEMA_MIGRATIONS.map((s) => s.schema))
    expect(first.every((r) => r.applied.length > 0)).toBe(true)
    const before = await Promise.all(SCHEMA_MIGRATIONS.map((s) => rowCount(s.schema)))
    expect(before.reduce((a, b) => a + b, 0)).toBe(first.reduce((n, r) => n + r.applied.length, 0))

    const second = await migrateAll(pool)
    expect(second.every((r) => r.applied.length === 0)).toBe(true)
    expect(second.map((r) => r.alreadyApplied.length)).toEqual(first.map((r) => r.applied.length))
    expect(await Promise.all(SCHEMA_MIGRATIONS.map((s) => rowCount(s.schema)))).toEqual(before)
  })

  it('--check reports clean after migration and changes nothing', async () => {
    const before = await Promise.all(SCHEMA_MIGRATIONS.map((s) => rowCount(s.schema)))
    const status = await checkMigrations(pool)
    expect(status).toMatchObject({ current: true, pending: 0, drift: 0 })
    expect(status.schemas.every((s) => s.applied === s.expected && s.unknown.length === 0)).toBe(true)
    expect(await Promise.all(SCHEMA_MIGRATIONS.map((s) => rowCount(s.schema)))).toEqual(before)
  })

  it('--check reports pending and checksum drift without applying anything', async () => {
    const cadFirst = (await pool.query<{ version: string; checksum: string }>('SELECT version, checksum FROM cad.schema_migrations ORDER BY version DESC LIMIT 1')).rows[0]
    await pool.query("UPDATE sysml.schema_migrations SET checksum = 'tampered' WHERE version = (SELECT min(version) FROM sysml.schema_migrations)")
    await pool.query('DELETE FROM cad.schema_migrations WHERE version = $1', [cadFirst.version])
    const status = await checkMigrations(pool)
    expect(status).toMatchObject({ current: false, pending: 1, drift: 1 })
    expect(status.schemas.find((s) => s.schema === 'cad')?.pending).toHaveLength(1)
    expect(status.schemas.find((s) => s.schema === 'sysml')?.drift).toHaveLength(1)
    // Nothing was applied by the check.
    expect(await rowCount('cad')).toBe(SCHEMA_MIGRATIONS.length ? status.schemas.find((s) => s.schema === 'cad')!.expected - 1 : 0)
    // Applying refuses a changed file (exit non-zero in the command) and does not touch the drifted row.
    await expect(migrateAll(pool)).rejects.toThrow(/checksum mismatch/)
  })

  it('the command exits 0 when current and non-zero on drift or an unreachable database', async () => {
    const url = testDbUrl(name)
    const run = (args: string[], databaseUrl = url) =>
      spawnSync(process.execPath, [resolve(__dirname, '../../../node_modules/tsx/dist/cli.mjs'), resolve(__dirname, '../scripts/db.ts'), ...args], {
        env: { ...process.env, EWS_PG: 'external', DATABASE_URL: databaseUrl, NODE_ENV: 'test', EWS_DEPLOYED: '' },
        encoding: 'utf8',
      })
    // State left by the previous test: drift in sysml, one cad migration pending.
    const check = run(['migrate', '--check'])
    expect(check.status).toBe(1)
    expect(check.stdout).toMatch(/CHECKSUM DRIFT/)
    expect(check.stdout).toMatch(/pending/)
    expect(run(['migrate']).status).toBe(1)
    // Repair the test state: restore the checksum, then the command applies the missing cad migration and is clean.
    const real = (await checkMigrations(pool)).schemas.find((s) => s.schema === 'sysml')!.drift[0]
    expect(real).toBeTruthy()
    const dir = SCHEMA_MIGRATIONS.find((s) => s.schema === 'sysml')!.directory
    const file = listMigrations(dir).find((m) => m.name === real)!
    await pool.query('UPDATE sysml.schema_migrations SET checksum = $1 WHERE version = $2', [file.checksum, file.version])
    expect(run(['migrate', '--check']).status).toBe(1)
    // The deleted cad row stands for a migration that was never recorded; re-running its SQL would fail (objects exist), so record it again.
    const missing = (await checkMigrations(pool)).schemas.find((s) => s.schema === 'cad')!.pending[0]
    const cadFile = listMigrations(SCHEMA_MIGRATIONS.find((s) => s.schema === 'cad')!.directory).find((m) => m.name === missing)!
    await pool.query('INSERT INTO cad.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [cadFile.version, cadFile.name, cadFile.checksum])
    const applied = run(['migrate'])
    expect(applied.stderr).toBe('')
    expect(applied.status).toBe(0)
    const clean = run(['migrate', '--check'])
    expect(clean.status).toBe(0)
    expect(clean.stdout).toMatch(/Migrations are current/)
    expect(run(['migrate']).status).toBe(0)
    expect(run(['migrate', '--check'], 'postgres://nobody:none@127.0.0.1:1/none').status).not.toBe(0)
  }, 300_000)
})

describe('health and readiness', () => {
  let env: TestEnv
  beforeAll(async () => {
    env = await createTestEnv({ seed: false })
  })
  afterAll(async () => env?.close())

  it('/health is liveness (no database) and /ready is ready on a migrated database', async () => {
    const health = await env.server.app.inject({ method: 'GET', url: '/health' })
    expect(health.statusCode).toBe(200)
    expect(health.json()).toEqual({ status: 'ok' })
    for (const url of ['/ready', '/api/ready']) {
      const ready = await env.server.app.inject({ method: 'GET', url })
      expect(ready.statusCode).toBe(200)
      expect(ready.json()).toMatchObject({ status: 'ready', migrations: 'current' })
    }
    expect((await env.server.app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200)
  })

  it('/ready is 503 when a migration is pending, without leaking file names', async () => {
    await env.pool.query('DELETE FROM cad.schema_migrations WHERE version = (SELECT max(version) FROM cad.schema_migrations)')
    const ready = await env.server.app.inject({ method: 'GET', url: '/ready' })
    expect(ready.statusCode).toBe(503)
    expect(ready.json()).toMatchObject({ status: 'not ready', pending: 1, drift: 0 })
    expect(ready.body).not.toMatch(/\.sql/)
    // Liveness is unaffected.
    expect((await env.server.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200)
  })

  it('X-Dev-User is refused on a deployed server unless explicitly allowed', async () => {
    const deployed = await createTestEnv({ seed: true, production: true })
    try {
      expect((await deployed.call('ada', 'GET', '/api/platform/v1/me')).status).toBe(401)
      expect((await deployed.call('ada', 'GET', '/api/platform/v1/dev-users')).status).toBe(404)
    } finally {
      await deployed.close()
    }
  })
})

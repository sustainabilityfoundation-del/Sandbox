import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { ensureDatabase, startEmbedded, type EmbeddedHandle } from '../../api/src/database'
import { buildServer, prepareDatabase, type ApiServer } from '../../api/src/server'
import { memoryObjectStorage } from '@ews/requirements-service'
import { localBlobStore } from '../src/blob/blobStore'
import { API, newKey } from './helpers'

/**
 * Durability across a full restart (brief §4, §9 steps 10–11): a PostgreSQL server with a persistent data directory
 * and a filesystem blob store are stopped and started again; everything committed before the stop is read back.
 */
const dir = mkdtempSync(join(tmpdir(), 'ews-projects-restart-'))
const port = 59000 + Math.floor(Math.random() * 900)
const cfg = { port, dataDir: join(dir, 'pg'), user: 'postgres', password: 'test-only', persistent: true }
const blobDir = join(dir, 'objects')
const dbUrl = `postgres://postgres:test-only@127.0.0.1:${port}/ews_test_restart`

let handle: EmbeddedHandle | undefined
let pool: pg.Pool | undefined
let server: ApiServer | undefined

async function up() {
  handle = await startEmbedded(cfg, () => undefined)
  await ensureDatabase(handle.adminUrl, 'ews_test_restart')
  pool = new pg.Pool({ connectionString: dbUrl, max: 10 })
  await prepareDatabase(pool, { seed: true })
  server = await buildServer({ pool, storage: memoryObjectStorage(), production: false, eventPollMs: 200, blobs: localBlobStore(blobDir) })
}

async function down() {
  await server?.close()
  await pool?.end()
  await handle?.stop()
  server = undefined
  pool = undefined
  handle = undefined
}

async function call(user: string, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const raw = body instanceof Uint8Array
  const res = await server!.app.inject({ method: method as 'GET', url, headers: { 'x-dev-user': user, ...(body !== undefined && !raw ? { 'content-type': 'application/json' } : {}), ...headers }, payload: body === undefined ? undefined : raw ? Buffer.from(body) : JSON.stringify(body) })
  return { status: res.statusCode, body: res.headers['content-type']?.toString().includes('json') ? JSON.parse(res.body) : res.rawPayload }
}

afterAll(async () => {
  await down().catch(() => undefined)
  rmSync(dir, { recursive: true, force: true })
})

describe('persistence across a restart of the API and PostgreSQL', () => {
  it('keeps projects, members, work items, links, documents and audit intact', { timeout: 240_000 }, async () => {
    await up()
    const key = newKey()
    const created = await call('eli', 'POST', `${API}/projects`, { key, name: 'Example Engineering Product', templateId: 'mechanical-product' }, { 'idempotency-key': 'restart-1' })
    expect(created.status).toBe(201)
    const id = created.body.id as string
    await call('eli', 'PUT', `${API}/projects/${id}/members/rui`, { role: 'reviewer' })
    const ms = (await call('eli', 'GET', `${API}/projects/${id}/milestones`)).body
    const task = await call('eli', 'POST', `${API}/projects/${id}/work-items`, { kind: 'task', title: 'Check bracket stiffness', subjects: [ms[0].artifactId] }, { 'idempotency-key': 'restart-2' })
    expect(task.status).toBe(201)
    const doc = await call('eli', 'POST', `${API}/projects/${id}/documents`, { title: 'Sketch', documentKind: 'drawing' }, { 'idempotency-key': 'restart-3' })
    const bytes = new TextEncoder().encode('binary drawing content ✓')
    expect((await call('eli', 'POST', `${API}/projects/${id}/documents/${doc.body.id}/versions`, bytes, { 'content-type': 'image/png', 'x-file-name': 'sketch.png', 'if-match': '"1"' })).status).toBe(201)
    const before = {
      project: (await call('eli', 'GET', `${API}/projects/${id}`)).body,
      artifacts: (await call('eli', 'GET', `${API}/projects/${id}/artifacts?sort=key`)).body,
      links: (await call('eli', 'GET', `${API}/projects/${id}/links`)).body,
      activity: (await call('eli', 'GET', `${API}/projects/${id}/activity?limit=200`)).body,
      members: (await call('eli', 'GET', `${API}/projects/${id}/members`)).body,
    }

    await down()
    await up()

    const after = {
      project: (await call('eli', 'GET', `${API}/projects/${id}`)).body,
      artifacts: (await call('eli', 'GET', `${API}/projects/${id}/artifacts?sort=key`)).body,
      links: (await call('eli', 'GET', `${API}/projects/${id}/links`)).body,
      activity: (await call('eli', 'GET', `${API}/projects/${id}/activity?limit=200`)).body,
      members: (await call('eli', 'GET', `${API}/projects/${id}/members`)).body,
    }
    expect(after).toEqual(before)
    expect(after.artifacts.items.map((a: { key: string }) => a.key)).toEqual(['DOC-001', 'MS-001', 'MS-002', 'MS-003', 'TSK-001', 'TSK-002', 'TSK-003'])
    const content = await call('rui', 'GET', `${API}/projects/${id}/documents/${doc.body.id}/versions/1/content`)
    expect(content.status).toBe(200)
    expect(new Uint8Array(content.body as Buffer)).toEqual(bytes)
    // An idempotent retry after the restart replays the first outcome instead of creating a second project.
    const retry = await call('eli', 'POST', `${API}/projects`, { key, name: 'Example Engineering Product', templateId: 'mechanical-product' }, { 'idempotency-key': 'restart-1' })
    expect(retry.body.id).toBe(id)
  })
})

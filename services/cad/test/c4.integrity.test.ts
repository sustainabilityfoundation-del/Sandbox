import '../../api/test/providedContext'
import { randomBytes } from 'node:crypto'
import { CadEngine, applyTransaction, createDocument, type CadDocument } from '@ews/cad-core'
import { sharedNodeKernel } from '@ews/cad-kernel/node'
import { memoryObjectStorage } from '@ews/requirements-service'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { dropDatabase, ensureDatabase } from '../../api/src/database'
import { buildServer, prepareDatabase, type ApiServer } from '../../api/src/server'
import { REQIF_SCHEMAS, testDbUrl } from '../../api/test/helpers'

/**
 * Integration milestone 1, contract C4 (CAD persistence) and C13 (project scoping) on a real
 * database and the real API host:
 * - a stale If-Match is refused;
 * - a retry after a lost response replays the outcome without a second write;
 * - reusing a key with a different input is 422;
 * - cross-project writes are rejected;
 * - a stored revision regenerates to the same mass properties after the service restarts. The
 *   service stores no derived geometry.
 */

const name = `ews_test_${randomBytes(5).toString('hex')}`
let pool: pg.Pool
let server: ApiServer
const A = 'PRJ-ACT100'
const B = 'PRJ-C13-SECOND'
const docs = (p: string) => `/api/cad/v1/projects/${p}/documents`
const idem = () => randomBytes(8).toString('hex')

async function start() {
  server = await buildServer({ pool, storage: memoryObjectStorage(), production: false, eventPollMs: 200, reqifSchemaDir: REQIF_SCHEMAS })
}
async function call(user: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await server.app.inject({ method: method as 'GET', url: path, headers: { 'x-dev-user': user, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, payload: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined, headers: res.headers }
}
const count = async (sql: string, args: unknown[] = []) => Number((await pool.query(sql, args)).rows[0].n)

function bracket(width = 80): CadDocument {
  const r = applyTransaction(createDocument({ title: 'C4 bracket' }), {
    commands: [
      { command: 'create_part', input: { name: 'Bracket', ref: '$p' } },
      { command: 'set_material', input: { partId: '$p', name: 'Aluminium 6061', density: 2700 } },
      { command: 'create_parameter', input: { partId: '$p', name: 'width', expression: String(width) } },
      { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
      { command: 'add_rectangle', input: { sketchId: '$s', width: 'width', height: 40 } },
      { command: 'extrude_profile', input: { sketchId: '$s', distance: 10 } },
      { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$h' } },
      { command: 'add_circle', input: { sketchId: '$h', center: [20, 20], radius: 6 } },
      { command: 'extrude_profile', input: { sketchId: '$h', distance: 10, operation: 'cut' } },
    ],
  })
  if (!r.ok) throw new Error(r.error.message)
  return r.doc
}
const withWidth = (doc: CadDocument, w: number) => {
  const r = applyTransaction(doc, { commands: [{ command: 'set_parameter', input: { partId: doc.parts[0].id, name: 'width', expression: String(w) } }] })
  if (!r.ok) throw new Error(r.error.message)
  return r.doc
}

async function massOf(doc: CadDocument) {
  // A fresh engine has a fresh regeneration cache: nothing is reused from earlier computations.
  const engine = new CadEngine({ kernel: await sharedNodeKernel(), document: doc })
  const regen = await engine.regenerate({ full: true })
  expect(regen?.parts[0].features.every((f) => f.status === 'ok')).toBe(true)
  return (await engine.query('get_mass_properties', { partId: doc.parts[0].id })) as { volume: number; mass: number | null }[]
}

beforeAll(async () => {
  await ensureDatabase(inject('pgAdminUrl'), name)
  pool = new pg.Pool({ connectionString: testDbUrl(name), max: 10 })
  await prepareDatabase(pool, { seed: true })
  // eli edits in two projects (C13); nia only in A.
  await pool.query(`INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ($1, 'eli', 'editor') ON CONFLICT DO NOTHING`, [B])
  await start()
}, 180_000)
afterAll(async () => {
  await server?.close()
  await pool?.end()
  await dropDatabase(inject('pgAdminUrl'), name)
})

describe('C4: concurrency and idempotency', () => {
  it('refuses a save with a stale If-Match (409, current revision reported) and writes nothing', async () => {
    const doc = bracket()
    expect((await call('eli', 'POST', docs(A), { document: doc }, { 'idempotency-key': idem() })).status).toBe(201)
    const r2 = await call('nia', 'PUT', `${docs(A)}/${doc.documentId}`, { document: withWidth(doc, 90) }, { 'if-match': '"1"' })
    expect(r2.status).toBe(200)
    expect(r2.headers.etag).toBe('"2"')
    const stale = await call('eli', 'PUT', `${docs(A)}/${doc.documentId}`, { document: withWidth(doc, 70) }, { 'if-match': '"1"' })
    expect(stale.status).toBe(409)
    expect(stale.body.error).toMatchObject({ code: 'conflict', details: { currentRevision: 2, expectedRevision: 1 } })
    expect(await count('SELECT count(*) AS n FROM cad.document_revisions WHERE document_id = $1', [doc.documentId])).toBe(2)
  })

  it('a retry after a lost response replays the original outcome and does not write twice', async () => {
    const doc = bracket()
    const key = idem()
    const first = await call('eli', 'POST', docs(A), { document: doc, message: 'first' }, { 'idempotency-key': key })
    expect(first.status).toBe(201)
    // The client never saw `first` (lost response) and retries the identical request.
    const retry = await call('eli', 'POST', docs(A), { document: doc, message: 'first' }, { 'idempotency-key': key })
    expect(retry.status).toBe(201)
    expect(retry.headers['idempotency-replayed']).toBe('true')
    expect(retry.body).toEqual(first.body)
    expect(await count('SELECT count(*) AS n FROM cad.documents WHERE id = $1', [doc.documentId])).toBe(1)

    const saveKey = idem()
    const put = () => call('eli', 'PUT', `${docs(A)}/${doc.documentId}`, { document: withWidth(doc, 95) }, { 'if-match': '"1"', 'idempotency-key': saveKey })
    const saved = await put()
    const again = await put()
    expect([saved.status, again.status]).toEqual([200, 200])
    expect(again.body).toEqual(saved.body)
    expect(again.body.revision.revision).toBe(2)
    expect(await count('SELECT count(*) AS n FROM cad.document_revisions WHERE document_id = $1', [doc.documentId])).toBe(2)
    expect(await count("SELECT count(*) AS n FROM cad.outbox WHERE document_id = $1 AND type = 'cad.revision-created'", [doc.documentId])).toBe(1)
  })

  it('reusing an Idempotency-Key with a different input is refused with 422 and changes nothing', async () => {
    const doc = bracket()
    const key = idem()
    expect((await call('eli', 'POST', docs(A), { document: doc }, { 'idempotency-key': key })).status).toBe(201)
    const other = bracket(60)
    const reused = await call('eli', 'POST', docs(A), { document: other }, { 'idempotency-key': key })
    expect(reused.status).toBe(422)
    expect(reused.body.error).toMatchObject({ code: 'invalid', details: { fields: { 'Idempotency-Key': expect.stringMatching(/different request/) } } })
    expect(await count('SELECT count(*) AS n FROM cad.documents WHERE id = $1', [other.documentId])).toBe(0)
  })
})

describe('C13: project scoping', () => {
  it('rejects writes whose target document belongs to another project than the path', async () => {
    const doc = bracket()
    expect((await call('eli', 'POST', docs(A), { document: doc }, { 'idempotency-key': idem() })).status).toBe(201)
    // eli may edit in B, but the document belongs to A.
    const save = await call('eli', 'PUT', `${docs(B)}/${doc.documentId}`, { document: withWidth(doc, 85) }, { 'if-match': '"1"' })
    expect(save.status).toBe(404)
    const archive = await call('eli', 'POST', `${docs(B)}/${doc.documentId}/archive`, { archived: true, expectedRevision: 1 })
    expect(archive.status).toBe(404)
    // Creating a copy with the same document UUID in B is refused (one document, one project).
    const dup = await call('eli', 'POST', docs(B), { document: doc }, { 'idempotency-key': idem() })
    expect(dup.status).toBe(409)
    expect(dup.body.error.message).toMatch(/another project/)
    // Reads are scoped the same way.
    expect((await call('eli', 'GET', `${docs(B)}/${doc.documentId}`)).status).toBe(404)
    expect((await call('eli', 'GET', docs(B))).body.some((d: { id: string }) => d.id === doc.documentId)).toBe(false)
    // A member of A only cannot write in B at all.
    expect((await call('nia', 'POST', docs(B), { document: bracket() }, { 'idempotency-key': idem() })).status).toBe(403)
    expect(await count('SELECT count(*) AS n FROM cad.document_revisions WHERE document_id = $1', [doc.documentId])).toBe(1)
    expect((await pool.query('SELECT project_id FROM cad.documents WHERE id = $1', [doc.documentId])).rows[0].project_id).toBe(A)
  })
})

describe('C4: deterministic regeneration from the stored native model', () => {
  it('a stored revision regenerates to the same mass properties after the service restarts', async () => {
    const doc = bracket()
    const before = await massOf(doc)
    expect(before[0].volume).toBeCloseTo(80 * 40 * 10 - Math.PI * 36 * 10, 6)
    expect(before[0].mass).toBeCloseTo(((80 * 40 * 10 - Math.PI * 36 * 10) * 1e-9) * 2700, 9)
    expect((await call('eli', 'POST', docs(A), { document: doc }, { 'idempotency-key': idem() })).status).toBe(201)
    expect((await call('eli', 'PUT', `${docs(A)}/${doc.documentId}`, { document: withWidth(doc, 100) }, { 'if-match': '"1"' })).status).toBe(200)

    // Restart: a new server process on the same database.
    await server.close()
    await start()

    const stored = await call('nia', 'GET', `${docs(A)}/${doc.documentId}?revision=1`)
    expect(stored.status).toBe(200)
    expect(stored.body.document).toEqual(doc)
    expect(await massOf(stored.body.document)).toEqual(before)
    const r2 = await call('nia', 'GET', `${docs(A)}/${doc.documentId}?revision=2`)
    expect((await massOf(r2.body.document))[0].volume).toBeCloseTo(100 * 40 * 10 - Math.PI * 36 * 10, 6)

    // Nothing derived is stored as authoritative: revisions hold the native model only.
    const { rows } = await pool.query<{ keys: string[] }>('SELECT array(SELECT jsonb_object_keys(content)) AS keys FROM cad.document_revisions WHERE document_id = $1 AND revision = 1', [doc.documentId])
    expect(rows[0].keys.sort()).toEqual(Object.keys(doc).sort())
    const cols = (await pool.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema = 'cad' AND table_name = 'document_revisions'")).rows.map((r) => r.column_name)
    expect(cols.filter((c) => /mesh|brep|geometry|volume|mass|step/.test(c))).toEqual([])
  })
})


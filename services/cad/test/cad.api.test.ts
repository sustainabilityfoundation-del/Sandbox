import { randomBytes } from 'node:crypto'
import { applyTransaction, createDocument, type CadDocument } from '@ews/cad-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEnv, type TestEnv } from '../../api/test/helpers'

/**
 * CAD document API against the real API host and a disposable PostgreSQL (npm run cad:test:db or
 * npm run req:test:db): access control (tool:cad on the server, project roles), validation with the
 * cad-core schema and rules, revisions with ETag/If-Match, idempotency recorded in the commit
 * transaction, provenance, immutability, events and OpenAPI.
 */

let env: TestEnv
const P = '/api/cad/v1/projects/PRJ-ACT100/documents'
const idem = () => ({ 'idempotency-key': randomBytes(8).toString('hex') })

function plate(width = '80', title = 'Plate'): CadDocument {
  const r = applyTransaction(createDocument({ title }), {
    commands: [
      { command: 'create_part', input: { name: 'Plate', ref: '$p' } },
      { command: 'create_parameter', input: { partId: '$p', name: 'width', expression: width } },
      { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
      { command: 'add_rectangle', input: { sketchId: '$s', width: 'width', height: 40 } },
      { command: 'extrude_profile', input: { sketchId: '$s', distance: 10 } },
    ],
  })
  if (!r.ok) throw new Error(r.error.message)
  return r.doc
}
const withWidth = (doc: CadDocument, w: string) => {
  const r = applyTransaction(doc, { commands: [{ command: 'set_parameter', input: { partId: doc.parts[0].id, name: 'width', expression: w } }] })
  if (!r.ok) throw new Error(r.error.message)
  return r.doc
}

beforeAll(async () => {
  env = await createTestEnv()
  await env.pool.query(`INSERT INTO platform.users (id, name) VALUES ('cara', 'Cara (CAD reader)')`)
  await env.pool.query(`INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ('PRJ-ACT100', 'cara', 'reader')`)
  await env.pool.query(`INSERT INTO platform.entitlements (user_id, entitlement) VALUES ('cara', 'tool:cad')`)
})
afterAll(async () => env?.close())

describe('access', () => {
  it('enforces tool:cad on the server, project membership and roles', async () => {
    expect((await env.call('eli', 'GET', P)).status).toBe(200)
    expect((await env.call('rui', 'GET', P)).body.error).toMatchObject({ code: 'forbidden', message: expect.stringMatching(/tool:cad/) })
    expect((await env.call('', 'GET', P)).status).toBe(401)
    expect((await env.call('eli', 'GET', '/api/cad/v1/projects/PRJ-OTHER/documents')).status).toBe(403)
    expect((await env.call('cara', 'GET', P)).status).toBe(200)
    const refused = await env.call('cara', 'POST', P, { document: plate() }, idem())
    expect(refused.status).toBe(403)
    expect(refused.body.error.message).toMatch(/reader/)
  })
})

describe('documents and revisions', () => {
  it('creates, reads with ETag, saves with If-Match, and refuses stale or unchecked saves', async () => {
    const v1 = plate()
    const created = await env.call('eli', 'POST', P, { document: v1, message: 'first' }, idem())
    expect(created.status).toBe(201)
    expect(created.headers.etag).toBe('"1"')
    expect(created.headers.location).toBe(`${P}/${v1.documentId}`)
    expect(created.body.summary).toMatchObject({ id: v1.documentId, revision: 1, partCount: 1, featureCount: 2, createdBy: 'eli' })

    const got = await env.call('nia', 'GET', `${P}/${v1.documentId}`)
    expect(got.headers.etag).toBe('"1"')
    expect(got.body.document).toEqual(JSON.parse(JSON.stringify(v1)))

    const v2 = withWidth(v1, '100')
    const saved = await env.call('eli', 'PUT', `${P}/${v1.documentId}`, { document: v2, message: 'wider' }, { 'if-match': '"1"', ...idem() })
    expect(saved.status).toBe(200)
    expect(saved.headers.etag).toBe('"2"')
    expect(saved.body).toMatchObject({ unchanged: false, summary: { revision: 2, updatedBy: 'eli' } })

    const stale = await env.call('nia', 'PUT', `${P}/${v1.documentId}`, { document: withWidth(v1, '120'), expectedRevision: 1 }, idem())
    expect(stale.status).toBe(409)
    expect(stale.body.error.details).toMatchObject({ currentRevision: 2, expectedRevision: 1 })

    const unchecked = await env.call('eli', 'PUT', `${P}/${v1.documentId}`, { document: v2 })
    expect(unchecked.status).toBe(428)

    const disagree = await env.call('eli', 'PUT', `${P}/${v1.documentId}`, { document: v2, expectedRevision: 2 }, { 'if-match': '"1"' })
    expect(disagree.status).toBe(400)

    const same = await env.call('eli', 'PUT', `${P}/${v1.documentId}`, { document: v2, expectedRevision: 2 })
    expect(same.body).toMatchObject({ unchanged: true, summary: { revision: 2 } })

    const revs = await env.call('eli', 'GET', `${P}/${v1.documentId}/revisions`)
    expect(revs.body.map((r: { revision: number; message: string }) => [r.revision, r.message])).toEqual([
      [2, 'wider'],
      [1, 'first'],
    ])
    const old = await env.call('eli', 'GET', `${P}/${v1.documentId}?revision=1`)
    expect(old.body.document.parts[0].parameters[0].expression).toBe('80')
    expect(old.headers.etag).toBe('"2"')
  })

  it('validates documents with the published schema and cad-core rules; refuses duplicates and mismatched IDs', async () => {
    const doc = plate()
    const broken = JSON.parse(JSON.stringify(doc))
    broken.parts[0].features.reverse()
    const bad = await env.call('eli', 'POST', P, { document: broken }, idem())
    expect(bad.status).toBe(422)
    expect(bad.body.error.details.problems.join(' ')).toMatch(/does not exist earlier/)
    const schemaBad = await env.call('eli', 'POST', P, { document: { ...doc, format: 'other' } }, idem())
    expect(schemaBad.status).toBe(422)
    expect(schemaBad.body.error.message).toMatch(/JSON Schema/)
    expect((await env.call('eli', 'POST', P, { document: doc }, idem())).status).toBe(201)
    const dup = await env.call('eli', 'POST', P, { document: doc }, idem())
    expect(dup.status).toBe(409)
    const other = plate()
    const mismatch = await env.call('eli', 'PUT', `${P}/${doc.documentId}`, { document: other, expectedRevision: 1 })
    expect(mismatch.status).toBe(422)
    expect((await env.call('eli', 'POST', P, { document: doc })).status).toBe(400) // Idempotency-Key required
    expect((await env.call('eli', 'GET', `${P}/00000000-0000-4000-8000-00000000dead`)).status).toBe(404)
  })

  it('records idempotency in the commit transaction: replays successes, forgets failures', async () => {
    const doc = plate()
    const key = { 'idempotency-key': `k-${randomBytes(6).toString('hex')}` }
    // A failing request with a key leaves no record (rolled back with the change)…
    const broken = JSON.parse(JSON.stringify(doc))
    broken.parts[0].features.reverse()
    expect((await env.call('eli', 'POST', P, { document: broken }, key)).status).toBe(422)
    const { rows } = await env.pool.query('SELECT 1 FROM cad.idempotency_keys WHERE key = $1', [key['idempotency-key']])
    expect(rows).toHaveLength(0)
    // …so the same key can carry the corrected request, and a retry replays it.
    const first = await env.call('eli', 'POST', P, { document: doc }, key)
    const retry = await env.call('eli', 'POST', P, { document: doc }, key)
    expect(first.status).toBe(201)
    expect(retry.status).toBe(201)
    expect(retry.headers['idempotency-replayed']).toBe('true')
    expect(retry.headers.etag).toBe('"1"')
    const reused = await env.call('eli', 'POST', P, { document: plate() }, key)
    expect(reused.status).toBe(422)
    expect(reused.body.error.message).toMatch(/different request/)
  })

  it('records provenance and requires the proposal for assistant writes', async () => {
    const doc = plate()
    const noProposal = await env.call('eli', 'POST', P, { document: doc }, { 'x-source-kind': 'assistant', ...idem() })
    expect(noProposal.status).toBe(400)
    const ok = await env.call('eli', 'POST', P, { document: doc }, { 'x-source-kind': 'assistant', 'x-conversation-id': 'conv-1', 'x-proposal-id': 'CP-7', ...idem() })
    expect(ok.status).toBe(201)
    expect(ok.body.revision.source).toEqual({ sourceKind: 'assistant', conversationId: 'conv-1', proposalId: 'CP-7' })
  })

  it('keeps revisions immutable in the database and archives without deleting', async () => {
    const doc = plate()
    await env.call('eli', 'POST', P, { document: doc }, idem())
    await expect(env.pool.query(`UPDATE cad.document_revisions SET message = 'x' WHERE document_id = $1`, [doc.documentId])).rejects.toThrow(/append-only/)
    await expect(env.pool.query(`DELETE FROM cad.document_revisions WHERE document_id = $1`, [doc.documentId])).rejects.toThrow(/append-only/)
    const archived = await env.call('eli', 'POST', `${P}/${doc.documentId}/archive`, { archived: true }, { 'if-match': '"1"' })
    expect(archived.body.archived).toBe(true)
    expect((await env.call('eli', 'GET', P)).body.map((d: { id: string }) => d.id)).not.toContain(doc.documentId)
    expect((await env.call('eli', 'GET', `${P}?includeArchived=true`)).body.map((d: { id: string }) => d.id)).toContain(doc.documentId)
    const blocked = await env.call('eli', 'PUT', `${P}/${doc.documentId}`, { document: withWidth(doc, '90'), expectedRevision: 1 })
    expect(blocked.status).toBe(409)
  })

  it('resolves entity references (CR-CAD-1)', async () => {
    const doc = plate()
    await env.call('eli', 'POST', P, { document: doc }, idem())
    const ext = doc.parts[0].features[1].id
    const r = await env.call('nia', 'GET', `${P}/${doc.documentId}/entities/${encodeURIComponent(`${ext}/side:ln-9`)}`)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ref: { module: 'cad', kind: 'cad-modeler-entity', id: `${doc.documentId}/${ext}/side:ln-9`, revision: 1 }, entityType: 'face', verifiedInGeometry: false })
    const part = await env.call('nia', 'GET', `${P}/${doc.documentId}/entities/part-1`)
    expect(part.body).toMatchObject({ entityType: 'part', label: 'Plate', verifiedInGeometry: true })
    expect((await env.call('nia', 'GET', `${P}/${doc.documentId}/entities/nope-9`)).status).toBe(404)
  })
})

describe('events and OpenAPI', () => {
  it('writes outbox events in the save transaction and streams them', async () => {
    const before = Number((await env.pool.query('SELECT count(*) FROM cad.outbox')).rows[0].count)
    const doc = plate()
    await env.call('eli', 'POST', P, { document: doc }, idem())
    await env.call('eli', 'PUT', `${P}/${doc.documentId}`, { document: withWidth(doc, '95'), expectedRevision: 1 })
    const { rows } = await env.pool.query<{ type: string; revision: number; actor: string }>('SELECT type, revision, actor FROM cad.outbox WHERE document_id = $1 ORDER BY seq', [doc.documentId])
    expect(rows.map((r) => [r.type, r.revision, r.actor])).toEqual([
      ['cad.document-created', 1, 'eli'],
      ['cad.revision-created', 2, 'eli'],
    ])
    expect(Number((await env.pool.query('SELECT count(*) FROM cad.outbox')).rows[0].count)).toBe(before + 2)
  })

  it('serves an OpenAPI 3.1 document covering every operation, and its reference page', async () => {
    const doc = (await env.call('', 'GET', '/api/cad/v1/openapi.json')).body
    expect(doc.openapi).toBe('3.1.0')
    const ops = Object.values(doc.paths).flatMap((m) => Object.values(m as Record<string, { operationId: string }>).map((o) => o.operationId))
    expect(ops.sort()).toEqual(['archiveDocument', 'cadEvents', 'createDocument', 'getDocument', 'listDocuments', 'listRevisions', 'resolveEntity', 'saveRevision'])
    expect((await env.call('', 'GET', '/api/cad/v1/docs')).status).toBe(200)
  })
})

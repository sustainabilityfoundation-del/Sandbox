import { randomBytes } from 'node:crypto'
import { applyTransaction, createDocument, localRegenerator, type CadDocument, type Regenerator } from '@ews/cad-core'
import { sharedNodeKernel } from '@ews/cad-kernel/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEnv, type TestEnv } from '../../api/test/helpers'
import { createCadReadService, createHttpCadClient, type CadReadService } from '../../../packages/cad-client/src'

/**
 * C5 read client (proposed SDK 1.8 PlatformServices.cad), over the real API: entity summaries and
 * mass properties at a document revision. Mass properties are recomputed by regenerating the
 * stored native model (OCCT in-process here, the kernel worker in the browser).
 */

let env: TestEnv
let read: CadReadService
let regenerations = 0
let origin = ''
const P = '/api/cad/v1/projects/PRJ-ACT100/documents'

function plate(width: number): CadDocument {
  const r = applyTransaction(createDocument({ title: 'C5 plate' }), {
    commands: [
      { command: 'create_part', input: { name: 'Plate', ref: '$p' } },
      { command: 'set_material', input: { partId: '$p', name: 'Steel', density: 7850 } },
      { command: 'create_parameter', input: { partId: '$p', name: 'width', expression: String(width) } },
      { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
      { command: 'add_rectangle', input: { sketchId: '$s', width: 'width', height: 20 } },
      { command: 'extrude_profile', input: { sketchId: '$s', distance: 5 } },
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

beforeAll(async () => {
  env = await createTestEnv()
  origin = await env.listen()
  const kernel = await sharedNodeKernel()
  const base = localRegenerator(kernel)
  const counting: Regenerator = { ...base, location: base.location, regenerate: (d, o) => (regenerations++, base.regenerate(d, o)) }
  read = createCadReadService({ client: createHttpCadClient({ baseUrl: `${origin}/api/cad/v1`, devUser: 'nia' }), regenerator: () => counting })
})
afterAll(async () => env?.close())

describe('C5: CAD read client (PlatformServices.cad, SDK 1.8 proposal)', () => {
  it('summarises an entity at a pinned revision and reports the latest; follows the latest without a revision', async () => {
    const doc = plate(50)
    await env.call('eli', 'POST', P, { document: doc }, { 'idempotency-key': randomBytes(6).toString('hex') })
    await env.call('eli', 'PUT', `${P}/${doc.documentId}`, { document: withWidth(doc, 60) }, { 'if-match': '"1"' })
    const id = `${doc.documentId}/${doc.parts[0].id}`
    const pinned = await read.summary('PRJ-ACT100', { module: 'cad', kind: 'cad-modeler-entity', id, revision: 1 })
    expect(pinned).toEqual({
      status: 'resolved',
      value: { ref: { module: 'cad', kind: 'cad-modeler-entity', id, revision: 1 }, documentId: doc.documentId, entityId: doc.parts[0].id, entityType: 'part', label: 'Plate', documentTitle: 'C5 plate', pinned: true, latestRevision: 2, archived: false, verifiedInGeometry: true },
    })
    const latest = await read.summary('PRJ-ACT100', { module: 'cad', kind: 'cad-modeler-entity', id })
    expect(latest.status === 'resolved' && [latest.value.ref.revision, latest.value.pinned]).toEqual([2, false])
  })

  it('computes mass properties of a part at a revision by regeneration, cached per immutable revision', async () => {
    const doc = plate(50)
    await env.call('eli', 'POST', P, { document: doc }, { 'idempotency-key': randomBytes(6).toString('hex') })
    await env.call('eli', 'PUT', `${P}/${doc.documentId}`, { document: withWidth(doc, 60) }, { 'if-match': '"1"' })
    const ref = (revision: number) => ({ module: 'cad', kind: 'cad-modeler-entity', id: `${doc.documentId}/${doc.parts[0].id}`, revision })
    const r1 = await read.massProperties('PRJ-ACT100', ref(1))
    const r2 = await read.massProperties('PRJ-ACT100', ref(2))
    if (r1.status !== 'resolved' || r2.status !== 'resolved') throw new Error(JSON.stringify([r1, r2]))
    expect(r1.value.parts[0].bodies[0].volume).toBeCloseTo(50 * 20 * 5, 6)
    expect(r2.value.parts[0].bodies[0].volume).toBeCloseTo(60 * 20 * 5, 6)
    expect(r1.value.parts[0].bodies[0].mass).toBeCloseTo(50 * 20 * 5 * 1e-9 * 7850, 9)
    expect(r1.value).toMatchObject({ derivedFrom: 'regeneration', regeneration: { ok: true, failures: [], location: 'in-process' } })
    const before = regenerations
    expect(await read.massProperties('PRJ-ACT100', ref(1))).toEqual(r1)
    expect(regenerations).toBe(before)
    // A document reference measures every part.
    const whole = await read.massProperties('PRJ-ACT100', { module: 'cad', kind: 'cad-modeler-entity', id: `${doc.documentId}/${doc.documentId}`, revision: 2 })
    expect(whole.status === 'resolved' && whole.value.parts.map((p) => p.name)).toEqual(['Plate'])
  })

  it('reports unresolvable references as missing or unavailable, never throws', async () => {
    const doc = plate(40)
    await env.call('eli', 'POST', P, { document: doc }, { 'idempotency-key': randomBytes(6).toString('hex') })
    const S = (id: string, revision?: number, kind = 'cad-modeler-entity', module = 'cad') => read.summary('PRJ-ACT100', { module, kind, id, revision })
    expect(await S('CAD-120', undefined, 'cad-representation')).toMatchObject({ status: 'missing', reason: 'not-a-cad-reference' })
    expect(await S(`00000000-0000-4000-8000-00000000beef/part-1`)).toMatchObject({ status: 'missing', reason: 'document-not-found' })
    expect(await S(`${doc.documentId}/${doc.parts[0].id}`, 9)).toMatchObject({ status: 'missing', reason: 'revision-not-found' })
    expect(await S(`${doc.documentId}/part-404`)).toMatchObject({ status: 'missing', reason: 'entity-not-found' })
    const sketch = doc.parts[0].features[0].id
    expect(await read.massProperties('PRJ-ACT100', { module: 'cad', kind: 'cad-modeler-entity', id: `${doc.documentId}/${sketch}` })).toMatchObject({ status: 'missing', reason: 'no-geometry' })
    // Another project: not visible to this caller.
    const other = await read.summary('PRJ-OTHER', { module: 'cad', kind: 'cad-modeler-entity', id: `${doc.documentId}/${doc.parts[0].id}` })
    expect(other).toMatchObject({ status: 'unavailable', reason: 'forbidden' })
    // No kernel in the host: summaries work, mass properties are unavailable.
    const noKernel = createCadReadService({ client: createHttpCadClient({ baseUrl: `${origin}/api/cad/v1`, devUser: 'nia' }) })
    const part = { module: 'cad', kind: 'cad-modeler-entity', id: `${doc.documentId}/${doc.parts[0].id}` }
    expect((await noKernel.summary('PRJ-ACT100', part)).status).toBe('resolved')
    expect(await noKernel.massProperties('PRJ-ACT100', part)).toMatchObject({ status: 'unavailable', reason: 'kernel-unavailable' })
  })
})

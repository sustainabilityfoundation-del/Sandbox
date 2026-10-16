import { randomBytes } from 'node:crypto'
import { applyTransaction, createDocument, type CadDocument } from '@ews/cad-core'
import { ARTIFACT_CATEGORIES, ARTIFACT_LIFECYCLES, type ArtifactChange, type ArtifactSource } from '@ews/platform-sdk'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEnv, type TestEnv } from '../../api/test/helpers'
import { createCadArtifactSource, createCadEventHub, type CadEventHub } from '../src/index'

/**
 * CR-PM-REG-4: the CAD artifact source for Project Management (SDK 1.7 ArtifactSource), on a real
 * database. Writes go through the CAD API; the adapter only reads.
 */

let env: TestEnv
let hub: CadEventHub
let source: ArtifactSource
const PROJECT = 'PRJ-ACT100'
const P = `/api/cad/v1/projects/${PROJECT}/documents`
const idem = () => ({ 'idempotency-key': randomBytes(8).toString('hex') })

function twoParts(title: string): CadDocument {
  const r = applyTransaction(createDocument({ title }), {
    commands: [
      { command: 'create_part', input: { name: 'Bracket', ref: '$a' } },
      { command: 'create_sketch', input: { partId: '$a', plane: 'XY', ref: '$s' } },
      { command: 'add_rectangle', input: { sketchId: '$s', width: 40, height: 20 } },
      { command: 'extrude_profile', input: { sketchId: '$s', distance: 5 } },
      { command: 'create_part', input: { name: 'Pin' } },
    ],
  })
  if (!r.ok) throw new Error(r.error.message)
  return r.doc
}
const edit = (doc: CadDocument, commands: { command: string; input: Record<string, unknown> }[]) => {
  const r = applyTransaction(doc, { commands })
  if (!r.ok) throw new Error(r.error.message)
  return r.doc
}

beforeAll(async () => {
  env = await createTestEnv()
  hub = await createCadEventHub(env.pool, { pollMs: 50 })
  source = createCadArtifactSource(env.pool, hub)
})
afterAll(async () => {
  await hub?.close()
  await env?.close()
})

async function collect(during: () => Promise<void>, until: (c: ArtifactChange[]) => boolean): Promise<ArtifactChange[]> {
  const got: ArtifactChange[] = []
  const stop = source.subscribe((c) => got.push(c))
  await during()
  for (let i = 0; i < 100 && !until(got); i++) {
    await hub.flush()
    await new Promise((r) => setTimeout(r, 30))
  }
  stop()
  return got
}

describe('CAD artifact source (CR-PM-REG-4)', () => {
  it('describes the module with registered kinds and valid categories', () => {
    expect(source.module).toBe('cad')
    expect(source.contractVersion).toBe('1.0.0')
    const { name, kinds } = source.describeModule()
    expect(name).toBe('CAD Modeler')
    expect(kinds.map((k) => k.kind)).toEqual(['cad-document', 'cad-modeler-entity'])
    for (const k of kinds) expect(ARTIFACT_CATEGORIES).toContain(k.category)
    expect(kinds.every((k) => k.navigable)).toBe(true)
  })

  it('a new project starts empty; provisioning a blank template creates nothing', async () => {
    expect(await source.list('PRJ-NEW-BLANK')).toEqual({ items: [] })
    expect(await source.provision!({ projectId: 'PRJ-NEW-BLANK', template: { id: 'blank', content: 'blank' }, actor: 'ada', idempotencyKey: 'k1' })).toEqual({ status: 'not-needed' })
    expect(await source.list('PRJ-NEW-BLANK')).toEqual({ items: [] })
    expect((await env.pool.query("SELECT count(*)::int AS n FROM cad.documents WHERE project_id = 'PRJ-NEW-BLANK'")).rows[0].n).toBe(0)
  })

  it('lists documents and their parts in a stable order, pages with a cursor, filters kinds, describes refs', async () => {
    const docs = [twoParts('Alpha'), twoParts('Beta'), twoParts('Gamma')]
    docs[1] = edit(docs[1], [{ command: 'add_reference', input: { subject: docs[1].parts[0].id, role: 'represents', target: { module: 'product', kind: 'product-element', id: 'PE-42' } } }])
    for (const d of docs) expect((await env.call('eli', 'POST', P, { document: d }, idem())).status).toBe(201)
    const all = (await source.list(PROJECT)).items
    const ours = all.filter((a) => docs.some((d) => a.ref.id.startsWith(d.documentId)))
    expect(ours).toHaveLength(9)
    // Stable order: by document UUID; the document, then its parts in file order.
    const sorted = [...docs].sort((a, b) => a.documentId.localeCompare(b.documentId))
    expect(ours.filter((a) => a.ref.kind === 'cad-document').map((a) => a.ref.id)).toEqual(sorted.map((d) => d.documentId))
    const beta = docs[1]
    const betaItems = all.filter((a) => a.ref.id.startsWith(beta.documentId))
    expect(betaItems.map((a) => [a.ref.kind, a.ref.id, a.title])).toEqual([
      ['cad-document', beta.documentId, 'Beta'],
      ['cad-modeler-entity', `${beta.documentId}/${beta.parts[0].id}`, 'Bracket'],
      ['cad-modeler-entity', `${beta.documentId}/${beta.parts[1].id}`, 'Pin'],
    ])
    expect(betaItems[1]).toMatchObject({
      container: { module: 'cad', kind: 'cad-document', id: beta.documentId },
      lifecycle: 'working',
      open: { toolId: 'cad-modeler', params: { document: beta.documentId } },
      version: { value: 1, label: 'Revision 1' },
      createdBy: 'eli',
      modifiedBy: 'eli',
      relations: [{ type: 'represents', to: { module: 'product', kind: 'product-element', id: 'PE-42' } }],
    })
    for (const a of all) expect(ARTIFACT_LIFECYCLES).toContain(a.lifecycle)

    // Paging: limit 2 → the same sequence as one page, no duplicates, cursor ends.
    const paged = []
    let cursor: string | undefined
    for (let i = 0; i < 50; i++) {
      const page = await source.list(PROJECT, { limit: 2, cursor })
      expect(page.items.length).toBeLessThanOrEqual(2)
      paged.push(...page.items)
      cursor = page.nextCursor
      if (!cursor) break
    }
    expect(paged.map((a) => a.ref.id)).toEqual(all.map((a) => a.ref.id))
    await expect(source.list(PROJECT, { cursor: 'not-a-cursor' })).rejects.toThrow(/cursor/i)

    expect((await source.list(PROJECT, { kinds: ['cad-document'] })).items.every((a) => a.ref.kind === 'cad-document')).toBe(true)

    const described = await source.describe(PROJECT, [
      { module: 'cad', kind: 'cad-modeler-entity', id: `${beta.documentId}/${beta.parts[1].id}` },
      { module: 'cad', kind: 'cad-modeler-entity', id: `${beta.documentId}/part-999` },
      { module: 'cad', kind: 'cad-document', id: '00000000-0000-4000-8000-00000000dead' },
      { module: 'requirements', kind: 'requirement', id: 'x' },
    ])
    expect(described.map((a) => a.title)).toEqual(['Pin'])
    // Another project's documents are not described.
    expect(await source.describe('PRJ-OTHER', [{ module: 'cad', kind: 'cad-document', id: beta.documentId }])).toEqual([])
  })

  it('maps committed events to changes: created/revised → upserted, removed part and archive → retired, restore → upserted', async () => {
    const doc = twoParts('Evented')
    const dref = { module: 'cad', kind: 'cad-document', id: doc.documentId }
    const pin = { module: 'cad', kind: 'cad-modeler-entity', id: `${doc.documentId}/${doc.parts[1].id}` }
    const bracket = { module: 'cad', kind: 'cad-modeler-entity', id: `${doc.documentId}/${doc.parts[0].id}` }
    const mine = (c: ArtifactChange) => c.kind !== 'reconcile' && c.refs.some((r) => r.id.startsWith(doc.documentId))
    const changes = await collect(
      async () => {
        await env.call('eli', 'POST', P, { document: doc }, idem())
        // A revision without the pin: the pin is retired.
        const withoutPin = { ...doc, parts: [doc.parts[0]] }
        expect((await env.call('nia', 'PUT', `${P}/${doc.documentId}`, { document: withoutPin, expectedRevision: 1 })).status).toBe(200)
        await env.call('eli', 'POST', `${P}/${doc.documentId}/archive`, { archived: true, expectedRevision: 2 })
        await env.call('eli', 'POST', `${P}/${doc.documentId}/archive`, { archived: false, expectedRevision: 2 })
      },
      (got) => got.filter(mine).length >= 5,
    )
    const ours = changes.filter(mine).map((c) => (c.kind === 'reconcile' ? c : { kind: c.kind, refs: c.refs, actor: c.actor, projectId: c.projectId }))
    expect(ours).toEqual([
      { kind: 'upserted', refs: [dref, bracket, pin], actor: 'eli', projectId: PROJECT },
      { kind: 'upserted', refs: [dref, bracket], actor: 'nia', projectId: PROJECT },
      { kind: 'retired', refs: [pin], actor: 'nia', projectId: PROJECT },
      { kind: 'retired', refs: [dref, bracket], actor: 'eli', projectId: PROJECT },
      { kind: 'upserted', refs: [dref, bracket], actor: 'eli', projectId: PROJECT },
    ])
    const ids = changes.filter(mine).map((c) => c.eventId)
    expect(new Set(ids).size).toBe(ids.length)
    // Reconciliation agrees: the pin is gone, the document is working again.
    const listed = (await source.list(PROJECT)).items.filter((a) => a.ref.id.startsWith(doc.documentId))
    expect(listed.map((a) => [a.ref.id, a.lifecycle])).toEqual([
      [doc.documentId, 'working'],
      [bracket.id, 'working'],
    ])
  })

  it('reports the source concept of a document as a revision-pinned derived-from relation', async () => {
    const doc = edit(twoParts('From a concept'), [{ command: 'set_document_source', input: { conceptId: 'c-src-1', revision: 3, label: 'CON-003' } }])
    await env.call('eli', 'POST', P, { document: doc }, idem())
    const [d] = await source.describe(PROJECT, [{ module: 'cad', kind: 'cad-document', id: doc.documentId }])
    expect(d.relations).toContainEqual({ type: 'derived-from', to: { module: 'conceptualize', kind: 'concept', id: 'c-src-1' }, toRevision: 3 })
  })

  it('reports archived documents as retired when listing', async () => {
    const doc = twoParts('Archived one')
    await env.call('eli', 'POST', P, { document: doc }, idem())
    await env.call('eli', 'POST', `${P}/${doc.documentId}/archive`, { archived: true, expectedRevision: 1 })
    const listed = (await source.list(PROJECT)).items.filter((a) => a.ref.id.startsWith(doc.documentId))
    expect(listed.map((a) => [a.lifecycle, a.moduleState])).toEqual([
      ['retired', 'archived'],
      ['retired', 'archived'],
      ['retired', 'archived'],
    ])
  })

  it('never writes', async () => {
    const counts = async () => (await env.pool.query('SELECT (SELECT count(*) FROM cad.documents) + (SELECT count(*) FROM cad.document_revisions) + (SELECT count(*) FROM cad.outbox) AS n')).rows[0].n
    const before = await counts()
    await source.list(PROJECT)
    await source.describe(PROJECT, [{ module: 'cad', kind: 'cad-document', id: '00000000-0000-4000-8000-000000000001' }])
    await source.provision!({ projectId: 'PRJ-X', template: { id: 'blank', content: 'blank' }, actor: 'ada', idempotencyKey: 'k' })
    expect(await counts()).toBe(before)
  })
})

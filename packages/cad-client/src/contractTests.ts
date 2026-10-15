import { applyTransaction, createDocument, type CadDocument } from '@ews/cad-core'
import { describe, expect, it } from 'vitest'
import { CadClientError, newIdempotencyKey, type CadClient, type CadEvent } from './types'

/**
 * Contract test suite for CadClient adapters: the HTTP client against the real service and the
 * local adapter must behave alike. `setup` returns a client and a project its user may edit.
 */
export function defineCadClientContract(name: string, setup: () => Promise<{ client: CadClient; projectId: string }>) {
  const plate = (title = 'Plate'): CadDocument => {
    const r = applyTransaction(createDocument({ title }), {
      commands: [
        { command: 'create_part', input: { name: 'Plate', ref: '$p' } },
        { command: 'create_parameter', input: { partId: '$p', name: 'width', expression: '80' } },
        { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
        { command: 'add_rectangle', input: { sketchId: '$s', width: 'width', height: 40 } },
        { command: 'extrude_profile', input: { sketchId: '$s', distance: 10 } },
      ],
    })
    if (!r.ok) throw new Error(r.error.message)
    return r.doc
  }
  const edit = (doc: CadDocument, width: string): CadDocument => {
    const r = applyTransaction(doc, { commands: [{ command: 'set_parameter', input: { partId: doc.parts[0].id, name: 'width', expression: width } }] })
    if (!r.ok) throw new Error(r.error.message)
    return r.doc
  }

  describe(`CadClient contract: ${name}`, () => {
    it('creates a document as revision 1 and reads it back unchanged', async () => {
      const { client, projectId } = await setup()
      const doc = plate()
      const created = await client.create(projectId, doc, { idempotencyKey: newIdempotencyKey(), message: 'first' })
      expect(created.summary).toMatchObject({ id: doc.documentId, projectId, title: 'Plate', revision: 1, partCount: 1, featureCount: 2, archived: false })
      const got = await client.get(projectId, doc.documentId)
      expect(got.document).toEqual(JSON.parse(JSON.stringify(doc)))
      expect(got.revision).toMatchObject({ revision: 1, message: 'first' })
      expect((await client.list(projectId)).map((d) => d.id)).toContain(doc.documentId)
    })

    it('saves revisions with optimistic concurrency, keeps history, reports unchanged saves', async () => {
      const { client, projectId } = await setup()
      const v1 = plate()
      await client.create(projectId, v1, { idempotencyKey: newIdempotencyKey() })
      const v2 = edit(v1, '100')
      const saved = await client.save(projectId, v1.documentId, v2, { expectedRevision: 1, idempotencyKey: newIdempotencyKey(), message: 'wider' })
      expect(saved).toMatchObject({ unchanged: false, summary: { revision: 2 } })
      const same = await client.save(projectId, v1.documentId, v2, { expectedRevision: 2, idempotencyKey: newIdempotencyKey() })
      expect(same.unchanged).toBe(true)
      const stale = await client.save(projectId, v1.documentId, edit(v1, '120'), { expectedRevision: 1, idempotencyKey: newIdempotencyKey() }).catch((e) => e)
      expect(stale).toBeInstanceOf(CadClientError)
      expect(stale.code).toBe('conflict')
      expect(stale.details.currentRevision).toBe(2)
      expect((await client.revisions(projectId, v1.documentId)).map((r) => r.revision)).toEqual([2, 1])
      expect((await client.get(projectId, v1.documentId, 1)).document.parts[0].parameters[0].expression).toBe('80')
      expect((await client.get(projectId, v1.documentId)).document.parts[0].parameters[0].expression).toBe('100')
    })

    it('replays a retried write with the same idempotency key instead of applying it twice', async () => {
      const { client, projectId } = await setup()
      const v1 = plate()
      const key = newIdempotencyKey()
      const a = await client.create(projectId, v1, { idempotencyKey: key })
      const b = await client.create(projectId, v1, { idempotencyKey: key })
      expect(b.summary.revision).toBe(a.summary.revision)
      const k2 = newIdempotencyKey()
      const s1 = await client.save(projectId, v1.documentId, edit(v1, '90'), { expectedRevision: 1, idempotencyKey: k2 })
      const s2 = await client.save(projectId, v1.documentId, edit(v1, '90'), { expectedRevision: 1, idempotencyKey: k2 })
      expect(s2.summary.revision).toBe(s1.summary.revision)
      expect((await client.revisions(projectId, v1.documentId)).length).toBe(2)
    })

    it('refuses invalid documents, duplicate IDs and unknown documents with structured errors', async () => {
      const { client, projectId } = await setup()
      const doc = plate()
      await client.create(projectId, doc, { idempotencyKey: newIdempotencyKey() })
      const dup = await client.create(projectId, doc, { idempotencyKey: newIdempotencyKey() }).catch((e) => e)
      expect(dup.code).toBe('conflict')
      const broken = JSON.parse(JSON.stringify(plate()))
      broken.parts[0].features.reverse()
      const bad = await client.create(projectId, broken, { idempotencyKey: newIdempotencyKey() }).catch((e) => e)
      expect(bad.code).toBe('invalid')
      const missing = await client.get(projectId, '00000000-0000-4000-8000-00000000dead').catch((e) => e)
      expect(missing.code).toBe('not-found')
    })

    it('resolves entities to platform references (CR-CAD-1) and archives without deleting', async () => {
      const { client, projectId } = await setup()
      const doc = plate()
      await client.create(projectId, doc, { idempotencyKey: newIdempotencyKey() })
      const ext = doc.parts[0].features[1].id
      const r = await client.resolveEntity(projectId, doc.documentId, ext)
      expect(r.ref).toEqual({ module: 'cad', kind: 'cad-modeler-entity', id: `${doc.documentId}/${ext}`, revision: 1 })
      expect(r.entityType).toBe('extrude')
      const face = await client.resolveEntity(projectId, doc.documentId, `${ext}/cap-end`)
      expect(face).toMatchObject({ entityType: 'face', verifiedInGeometry: false })
      expect((await client.resolveEntity(projectId, doc.documentId, doc.documentId)).ref.id).toBe(`${doc.documentId}/${doc.documentId}`)
      const archived = await client.archive(projectId, doc.documentId, true, { expectedRevision: 1 })
      expect(archived.archived).toBe(true)
      expect((await client.list(projectId)).map((d) => d.id)).not.toContain(doc.documentId)
      expect((await client.list(projectId, { includeArchived: true })).map((d) => d.id)).toContain(doc.documentId)
      expect((await client.get(projectId, doc.documentId)).document.documentId).toBe(doc.documentId)
    })

    it('notifies subscribers of committed changes', async () => {
      const { client, projectId } = await setup()
      const events: CadEvent[] = []
      const stop = client.subscribe(projectId, (e) => events.push(e))
      await new Promise((r) => setTimeout(r, 300))
      const doc = plate('Evented')
      await client.create(projectId, doc, { idempotencyKey: newIdempotencyKey() })
      await client.save(projectId, doc.documentId, edit(doc, '70'), { expectedRevision: 1, idempotencyKey: newIdempotencyKey() })
      for (let i = 0; i < 60 && events.filter((e) => e.documentId === doc.documentId).length < 2; i++) await new Promise((r) => setTimeout(r, 100))
      stop()
      expect(events.filter((e) => e.documentId === doc.documentId).map((e) => [e.type, e.revision])).toEqual([
        ['cad.document-created', 1],
        ['cad.revision-created', 2],
      ])
    })
  })
}

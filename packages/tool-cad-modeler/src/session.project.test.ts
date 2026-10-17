import { sharedNodeKernel } from '@ews/cad-kernel/node'
import { createLocalCadClient } from '@ews/cad-client'
import { applyTransaction, createDocument } from '@ews/cad-core'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cadSession } from './session'

/** C13 in the view: the session lists and activates only the current project's documents. */

beforeAll(async () => {
  const kernel = await sharedNodeKernel()
  cadSession.configureKernel(() => kernel)
}, 30_000)
beforeEach(async () => {
  await cadSession.reset()
})
afterEach(() => cadSession.configureStore(null))

describe('project scoping of the CAD session (C13)', () => {
  it('switching projects never shows another project’s open document', async () => {
    const store = createLocalCadClient({ actor: 'eli' })
    cadSession.configureStore(store)
    cadSession.setProject('PRJ-A')
    const a = await cadSession.newDocument({ title: 'A part' })
    expect(cadSession.getSnapshot()).toMatchObject({ projectId: 'PRJ-A', activeId: a.id, documents: [{ id: a.id, projectId: 'PRJ-A' }] })

    cadSession.setProject('PRJ-B')
    expect(cadSession.getSnapshot().documents).toEqual([])
    expect(cadSession.active).toBeUndefined()
    expect(cadSession.getSnapshot().activeId).toBeNull()

    // A document stored in B opens in B.
    const r = applyTransaction(createDocument({ title: 'B part' }), { commands: [{ command: 'create_part', input: { name: 'Pin' } }] })
    if (!r.ok) throw new Error(r.error.message)
    await store.create('PRJ-B', r.doc, { idempotencyKey: 'b1' })
    const b = await cadSession.openFromStore('PRJ-B', r.doc.documentId)
    expect(cadSession.getSnapshot().documents.map((d) => d.id)).toEqual([b.id])

    // Back to A: A's document is active again, B's is not listed.
    cadSession.setProject('PRJ-A')
    expect(cadSession.active?.id).toBe(a.id)
    expect(cadSession.getSnapshot().documents.map((d) => d.id)).toEqual([a.id])

    // A's unsaved document cannot be stored into B.
    await expect(cadSession.saveToStore('PRJ-B', a.id)).rejects.toThrow(/belongs to project PRJ-A/)
    expect(await store.list('PRJ-B')).toHaveLength(1)
    // Closing A's only document leaves A empty instead of falling back to B's.
    cadSession.close(a.id)
    expect(cadSession.active).toBeUndefined()
  })

  it('documents opened before a project is set belong to the first project the view sets', async () => {
    const d = await cadSession.newDocument({ title: 'Early' })
    expect(cadSession.getSnapshot().documents).toHaveLength(1)
    cadSession.setProject('PRJ-FIRST')
    expect(cadSession.getSnapshot().documents).toEqual([expect.objectContaining({ id: d.id, projectId: 'PRJ-FIRST' })])
    cadSession.setProject('PRJ-OTHER')
    expect(cadSession.getSnapshot().documents).toEqual([])
  })
})

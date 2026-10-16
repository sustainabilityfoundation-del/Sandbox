import { applyTransaction, createDocument, type CadDocument } from '@ews/cad-core'
import { sharedNodeKernel } from '@ews/cad-kernel/node'
import { createLocalCadClient, type CadClient } from '@ews/cad-client'
import { ActionError, type AssistantActionContext, type ServiceProposal } from '@ews/platform-sdk'
import { sampleModel } from '@ews/platform-sdk/testing'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cadModelerTool } from './index'
import { cadSession, type DownloadFile } from './session'

/**
 * Contract C9 (headless AI boundary): every cad-modeler.* operation works with no CAD Modeler view
 * mounted and no document open, loading from the project's CAD document service. Changes are saved
 * as revisions with the proposal's provenance. The same invalid command is refused identically by
 * the UI path and the assistant path.
 */

const A = 'PRJ-HEADLESS-A'
const B = 'PRJ-HEADLESS-B'
const ctx = (projectId = A): AssistantActionContext => ({ model: sampleModel(), artifacts: [], captured: { projectId, configurationId: 'CFG-BASE', scenarioId: 'SCN-NOM', modelRevision: 1, selectionIds: [] } })
const action = (name: string) => cadModelerTool.assistant!.actions.find((a) => a.name === name)!
const provenance = { conversationId: 'conv-h', proposalId: 'prop-h', messageId: 'msg-h' }
const downloads: DownloadFile[] = []
let store: CadClient

function plate(title: string): CadDocument {
  const r = applyTransaction(createDocument({ title }), {
    commands: [
      { command: 'create_part', input: { name: 'Plate', ref: '$p' } },
      { command: 'create_parameter', input: { partId: '$p', name: 'thickness', expression: '5' } },
      { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
      { command: 'add_rectangle', input: { sketchId: '$s', width: 40, height: 20 } },
      { command: 'extrude_profile', input: { sketchId: '$s', distance: 'thickness' } },
    ],
  })
  if (!r.ok) throw new Error(r.error.message)
  return r.doc
}
async function stored(projectId: string, title: string) {
  const doc = plate(title)
  await store.create(projectId, doc, { idempotencyKey: `seed-${doc.documentId}` })
  return doc
}
async function propose(name: string, args: Record<string, unknown>, projectId = A) {
  const r = await action(name).run(args, ctx(projectId))
  expect(r.kind).toBe('service-proposal')
  return r as ServiceProposal
}
const data = async (name: string, args: Record<string, unknown>, projectId = A) => (await action(name).run(args, ctx(projectId))) as { kind: 'data'; data: any }
const refused = async (p: unknown) => {
  try {
    await p
  } catch (e) {
    return e as ActionError
  }
  throw new Error('expected a refusal')
}

beforeAll(async () => {
  const kernel = await sharedNodeKernel()
  cadSession.configureKernel(() => kernel)
  cadSession.configureDownloads((f) => downloads.push(f))
}, 30_000)
beforeEach(async () => {
  await cadSession.reset()
  downloads.length = 0
  store = createLocalCadClient({ actor: 'eli' })
  cadSession.configureStore(store)
  expect(cadSession.viewMounted).toBe(false)
})
afterEach(() => cadSession.configureStore(null))

describe('C9: every cad-modeler operation with no view mounted', () => {
  it('reads: describe_model, query and list_documents load the stored document headlessly', async () => {
    const doc = await stored(A, 'Stored plate')
    expect(cadSession.getSnapshot().documents).toHaveLength(0)
    const described = await data('cad-modeler.describe_model', {})
    expect(described.data.document).toMatchObject({ id: doc.documentId, title: 'Stored plate', stored: { projectId: A, revision: 1 } })
    expect(described.data.bodies[doc.parts[0].id][0].volume).toBeCloseTo(40 * 20 * 5, 6)
    const tree = await data('cad-modeler.query', { query: 'get_feature_tree', documentId: doc.documentId })
    expect(JSON.stringify(tree.data)).toContain('ok')
    expect((await data('cad-modeler.list_documents', {})).data.documents.map((d: { id: string }) => d.id)).toEqual([doc.documentId])
  })

  it('run_commands previews in the kernel and, applied, saves a revision with provenance; undo too', async () => {
    const doc = await stored(A, 'Stored plate')
    const p = await propose('cad-modeler.run_commands', { commands: [{ command: 'set_parameter', input: { partId: doc.parts[0].id, name: 'thickness', expression: '8' } }], label: 'Thicker' })
    expect(p.preview.find((i) => i.label.startsWith('Predicted body'))?.proposed).toMatch(/^6400\.00 mm³/)
    expect(p.preview.find((i) => i.label === 'Saved to the project')?.proposed).toBe(`revision 2 of ${doc.documentId} in ${A}`)
    // Preview only: nothing stored yet.
    expect((await store.revisions(A, doc.documentId)).map((r) => r.revision)).toEqual([1])
    expect((await p.apply(provenance)).summary).toMatch(/saved as revision 2 of document .* in PRJ-HEADLESS-A \(no separate save needed\)$/)
    const revs = await store.revisions(A, doc.documentId)
    expect(revs[0]).toMatchObject({ revision: 2, message: 'Assistant: Thicker', source: { sourceKind: 'assistant' } })
    expect((await store.get(A, doc.documentId)).document.parts[0].parameters[0].expression).toBe('8')

    const undo = await propose('cad-modeler.undo', { documentId: doc.documentId })
    expect((await undo.apply(provenance)).summary).toMatch(/saved revision 3$/)
    expect((await store.get(A, doc.documentId)).document.parts[0].parameters[0].expression).toBe('5')
  })

  it('run_commands with no document creates and stores one; new_document stores one', async () => {
    const p = await propose('cad-modeler.run_commands', { commands: [{ command: 'create_part', input: { name: 'Bracket' } }], label: 'New bracket', title: 'Mounting bracket' })
    expect(p.preview.find((i) => i.label === 'New document')?.proposed).toBe('Mounting bracket')
    expect((await p.apply(provenance)).summary).toMatch(/saved as revision 1 .*no separate save needed/)
    expect((await store.list(A)).map((d) => [d.title, d.parts.map((x) => x.name)])).toEqual([['Mounting bracket', ['Bracket']]])
    const n = await propose('cad-modeler.new_document', { title: 'Second', partName: 'Pin' }, B)
    expect((await n.apply(provenance)).summary).toMatch(/stored as revision 1$/)
    expect((await store.list(B)).map((d) => d.title)).toEqual(['Second'])
  })

  it('open_document, save_document and export work without a view', async () => {
    const doc = await stored(A, 'Stored plate')
    const open = await propose('cad-modeler.open_document', { documentId: doc.documentId })
    await open.apply(provenance)
    expect(cadSession.document(doc.documentId)).toBeDefined()
    const save = await propose('cad-modeler.save_document', { documentId: doc.documentId, message: 'checkpoint' })
    expect((await save.apply(provenance)).summary).toBe('Already saved: revision 1 in PRJ-HEADLESS-A is current (nothing to save)')
    const ewscad = await propose('cad-modeler.export', { format: 'ewscad', documentId: doc.documentId })
    await ewscad.apply(provenance)
    const step = await propose('cad-modeler.export', { format: 'step', documentId: doc.documentId })
    expect((await step.apply(provenance)).summary).toMatch(/AP242|AUTOMOTIVE_DESIGN|ap242/i)
    expect(downloads.map((d) => d.name.split('.').pop())).toEqual(['ewscad', 'step'])
  })

  it('needs documentId when the project has several documents; refuses another project’s document (C13)', async () => {
    await stored(A, 'One')
    await stored(A, 'Two')
    const many = await refused(action('cad-modeler.describe_model').run({}, ctx()))
    expect(many).toMatchObject({ code: 'invalid-arguments', message: expect.stringMatching(/has 2 CAD documents; pass documentId/) })
    const inB = await stored(B, 'Belongs to B')
    expect(await refused(action('cad-modeler.describe_model').run({ documentId: inB.documentId }, ctx(A)))).toMatchObject({ code: 'not-found' })
    // Open in this window from B, then addressed from A: refused, not silently used.
    await cadSession.openFromStore(B, inB.documentId)
    expect(await refused(action('cad-modeler.run_commands').run({ documentId: inB.documentId, commands: [{ command: 'create_part', input: { name: 'X' } }] }, ctx(A)))).toMatchObject({ code: 'not-allowed', message: expect.stringMatching(/stored in project PRJ-HEADLESS-B/) })
    // The active document belongs to B, so A does not act on it by default: it asks which of its own.
    expect(cadSession.active?.id).toBe(inB.documentId)
    expect(await refused(action('cad-modeler.describe_model').run({}, ctx(A)))).toMatchObject({ code: 'invalid-arguments' })
  })

  it('a transaction starting with create_part makes a new document even when the project has several', async () => {
    await stored(A, 'One')
    await stored(A, 'Two')
    const p = await propose('cad-modeler.run_commands', { commands: [{ command: 'create_part', input: { name: 'Fresh' } }] })
    expect(p.title).toMatch(/new CAD document/)
    await p.apply(provenance)
    expect((await store.list(A)).length).toBe(3)
    // With nothing open (the new document is open and active now, so close it), editing without documentId is ambiguous.
    for (const d of cadSession.openDocuments()) cadSession.close(d.id)
    expect(await refused(action('cad-modeler.run_commands').run({ commands: [{ command: 'set_document_metadata', input: { title: 'x' } }] }, ctx()))).toMatchObject({ code: 'invalid-arguments' })
  })

  it('with a view mounted and nothing open, run_commands creates a new document (not a stored one)', async () => {
    await stored(A, 'Stored')
    const detach = cadSession.attachView()
    try {
      const p = await propose('cad-modeler.run_commands', { commands: [{ command: 'create_part', input: { name: 'Plate' } }] })
      expect(p.title).toMatch(/new CAD document/)
      await p.apply(provenance)
      // The view's explicit Save stores it; nothing was saved automatically.
      expect((await store.list(A)).map((d) => d.title)).toEqual(['Stored'])
    } finally {
      detach()
    }
  })

  it('defines the same operations as the tool registers (all covered here)', () => {
    expect(cadModelerTool.assistant!.actions.map((a) => a.name).sort()).toEqual(
      ['cad-modeler.check', 'cad-modeler.check_bindings', 'cad-modeler.describe_model', 'cad-modeler.export', 'cad-modeler.list_documents', 'cad-modeler.new_document', 'cad-modeler.open_document', 'cad-modeler.query', 'cad-modeler.run_commands', 'cad-modeler.save_document', 'cad-modeler.undo'].sort(),
    )
  })
})

describe('C9: the same invalid command is refused identically by the UI and the assistant', () => {
  const cases: { label: string; command: (doc: CadDocument) => { command: string; input: Record<string, unknown> } }[] = [
    { label: 'unknown parameter', command: (d) => ({ command: 'set_parameter', input: { partId: d.parts[0].id, name: 'nope', expression: '3' } }) },
    { label: 'schema violation', command: (d) => ({ command: 'extrude_profile', input: { sketchId: d.parts[0].features[0].id, distance: 5, operation: 'merge' } }) },
    { label: 'cycle', command: (d) => ({ command: 'set_parameter', input: { partId: d.parts[0].id, name: 'thickness', expression: 'thickness * 2' } }) },
    { label: 'unknown command', command: () => ({ command: 'loft_profiles', input: {} }) },
  ]
  for (const c of cases) {
    it(c.label, async () => {
      const doc = await stored(A, 'Parity')
      const open = await cadSession.openFromStore(A, doc.documentId)
      // UI path: the executor behind the toolbar and dialogs (ui/common.tsx makeRun).
      const ui = await open.engine.execute({ commands: [c.command(doc)], label: 'UI', source: 'user' })
      expect(ui.ok).toBe(false)
      if (ui.ok) return
      // Assistant path.
      const err = await refused(action('cad-modeler.run_commands').run({ documentId: doc.documentId, commands: [c.command(doc)] }, ctx()))
      expect(err).toBeInstanceOf(ActionError)
      expect(err.message).toBe(`${ui.error.message} (command 1, ${c.command(doc).command})`)
      expect(err.code).toBe(ui.error.code === 'not-found' ? 'not-found' : ui.error.code === 'version-conflict' ? 'conflict' : 'invalid-arguments')
      // Neither path changed the document.
      expect(open.engine.document.version).toBe(doc.version)
    })
  }
})

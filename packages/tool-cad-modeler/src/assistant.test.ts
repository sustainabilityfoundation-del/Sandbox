import { sharedNodeKernel } from '@ews/cad-kernel/node'
import { inspectStep } from '@ews/cad-kernel'
import { ActionError, validateHelpManifest, type AssistantActionContext, type ServiceProposal } from '@ews/platform-sdk'
import { sampleModel } from '@ews/platform-sdk/testing'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cadModelerTool } from './index'
import { cadSession, type DownloadFile } from './session'
import { createLocalCadClient } from '@ews/cad-client'

/**
 * The AI workflow end to end on the real kernel: demo planning, typed command proposals with a
 * dry-run preview, Apply through the same executor as the UI, version checks, undo and export.
 */

const downloads: DownloadFile[] = []
const ctx = (): AssistantActionContext => ({ model: sampleModel(), artifacts: [], captured: { projectId: 'PRJ-ACT100', configurationId: 'CFG-BASE', scenarioId: 'SCN-NOM', modelRevision: 1, selectionIds: [] } })
const action = (name: string) => cadModelerTool.assistant!.actions.find((a) => a.name === name)!
const provenance = { conversationId: 'c', proposalId: 'p', messageId: 'm' }

async function call(name: string, args: Record<string, unknown>) {
  return action(name).run(args, ctx())
}
async function propose(name: string, args: Record<string, unknown>) {
  const r = await call(name, args)
  expect(r.kind).toBe('service-proposal')
  return r as ServiceProposal
}

beforeAll(async () => {
  const kernel = await sharedNodeKernel()
  cadSession.configureKernel(() => kernel)
  cadSession.configureDownloads((f) => downloads.push(f))
}, 30_000)

beforeEach(async () => {
  await cadSession.reset()
  downloads.length = 0
})

describe('CAD Modeler assistant (AI path through the shared commands)', () => {
  it('plans a plate with the demo planner, previews the kernel result and applies it', async () => {
    const plan = cadModelerTool.assistant!.demo!('Create a plate 80 x 40 x 10 with a 12 mm hole in the CAD modeler', { selectionIds: [] })
    expect(plan?.reply).toMatch(/Demo planner/)
    expect(plan?.calls).toHaveLength(1)
    const p = await propose(plan!.calls[0].name, plan!.calls[0].arguments)
    expect(p.module).toBe('cad-modeler')
    // Preview only: nothing exists yet.
    expect(cadSession.getSnapshot().documents).toHaveLength(0)
    const predicted = p.preview.find((i) => i.label.startsWith('Predicted body'))
    expect(predicted?.proposed).toMatch(/^30869\.03 mm³, 7 faces, 80\.0 × 40\.0 × 10\.0 mm$/)

    const applied = await p.apply(provenance)
    expect(applied.summary).toMatch(/Applied \d+ CAD commands: version 1$/)
    const d = cadSession.active!
    const body = d.engine.regeneration!.parts[0].bodies[0]
    expect(body.analysis.volume).toBeCloseTo(80 * 40 * 10 - Math.PI * 36 * 10, 6)
    expect(d.engine.operations().at(-1)).toMatchObject({ kind: 'transaction', source: 'assistant' })
  })

  it('reads the model as structured data and through named queries', async () => {
    await (await propose('cad-modeler.run_commands', { commands: cadModelerTool.assistant!.demo!('create a plate 50 x 20 x 5 in cad', { selectionIds: [] })!.calls[0].arguments.commands as never })).apply(provenance)
    const described = await call('cad-modeler.describe_model', {})
    expect(described.kind).toBe('data')
    const data = (described as { data: { bodies: Record<string, { volume: number }[]>; failures: unknown[]; tree: { parts: { features: { status: string }[] }[] } } }).data
    expect(Object.values(data.bodies)[0][0].volume).toBeCloseTo(5000, 6)
    expect(data.failures).toEqual([])
    expect(data.tree.parts[0].features.every((f) => f.status === 'ok')).toBe(true)
    const entities = (await call('cad-modeler.query', { query: 'get_entities', input: { kind: 'faces' } })) as { data: { faces: { name: string }[] }[] }
    expect(entities.data[0].faces.map((f) => f.name).filter((n) => n.endsWith('/cap-end'))).toHaveLength(1)
    const catalogue = (await call('cad-modeler.query', { query: 'list_commands' })) as { data: { name: string }[] }
    expect(catalogue.data.map((c) => c.name)).toContain('extrude_profile')
    await expect(call('cad-modeler.query', { query: 'get_sketch', input: { sketchId: 'nope' } })).rejects.toBeInstanceOf(ActionError)
  })

  it('changes a parameter, refuses stale proposals and undoes an applied proposal', async () => {
    await (await propose('cad-modeler.run_commands', { commands: cadModelerTool.assistant!.demo!('model a plate 80 x 40 x 10 in cad', { selectionIds: [] })!.calls[0].arguments.commands as never })).apply(provenance)
    const d = cadSession.active!
    const plan = cadModelerTool.assistant!.demo!('set thickness to 15', { selectionIds: [] })!
    const p = await propose(plan.calls[0].name, plan.calls[0].arguments)
    expect(p.preview.find((i) => i.label.startsWith('Predicted body'))).toMatchObject({ current: '32000.00 mm³, 6 faces', proposed: expect.stringMatching(/^48000\.00 mm³/) })
    await p.apply(provenance)
    expect(d.engine.regeneration!.parts[0].bodies[0].analysis.volume).toBeCloseTo(48000, 6)

    // A proposal prepared before the user changed the model is refused on Apply.
    const stale = await propose('cad-modeler.run_commands', { commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'width', expression: '100' } }] })
    await d.engine.execute({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'depth', expression: '50' } }], source: 'user' })
    await expect(stale.apply(provenance)).rejects.toThrow(/expected version/)
    expect(d.engine.document.parts[0].parameters.find((x) => x.name === 'width')?.expression).toBe('80')

    // Undo of an applied proposal restores the state before it (a compensating version).
    const q = await propose('cad-modeler.run_commands', { commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'width', expression: '100' } }] })
    const applied = await q.apply(provenance)
    expect(applied.summary).toMatch(/version/)
    await q.undo!({})
    expect(d.engine.document.parts[0].parameters.find((x) => x.name === 'width')?.expression).toBe('80')
    expect(d.engine.regeneration!.parts[0].bodies[0].analysis.volume).toBeCloseTo(80 * 50 * 15, 6)
  })

  it('reports invalid commands as errors to the assistant instead of preparing a proposal', async () => {
    await expect(call('cad-modeler.run_commands', { commands: [{ command: 'extrude_profile', input: { sketchId: 'sk-1', distance: -3 } }] })).rejects.toThrow(/command 1, extrude_profile/)
    await expect(call('cad-modeler.run_commands', { commands: [] })).rejects.toBeInstanceOf(ActionError)
    await expect(call('cad-modeler.undo', {})).rejects.toThrow(/No CAD Modeler document/)
  })

  it('exports STEP AP242 and the native file after approval, and reopens the native file', async () => {
    await (await propose('cad-modeler.run_commands', { commands: cadModelerTool.assistant!.demo!('create a plate 30 x 30 x 3 in cad', { selectionIds: [] })!.calls[0].arguments.commands as never })).apply(provenance)
    const step = await propose('cad-modeler.export', { format: 'step' })
    expect(downloads).toHaveLength(0)
    const r = await step.apply(provenance)
    expect(r.summary).toMatch(/AP242, 1 solid\(s\), 6 faces, unit mm/)
    expect(inspectStep(downloads[0].content).valid).toBe(true)

    await (await propose('cad-modeler.export', { format: 'ewscad' })).apply(provenance)
    const native = downloads[1]
    expect(native.name).toMatch(/\.ewscad$/)
    await cadSession.reset()
    const reopened = await cadSession.openText(native.content, native.name)
    expect(reopened.engine.regeneration!.parts[0].bodies[0].analysis.volume).toBeCloseTo(2700, 6)
    await expect(cadSession.openText(downloads[0].content, 'plate.step')).rejects.toThrow(/STEP/)
  })
})

describe('CAD Modeler tool definition', () => {
  it('ships a valid help manifest that maps every toolbar item and assistant operation', () => {
    const help = cadModelerTool.help!
    expect(validateHelpManifest(help)).toEqual([])
    const items = cadModelerTool.toolbar({ api: {} as never, viewState: cadModelerTool.initialViewState, context: {} as never, model: sampleModel(), selection: [] })
    const mapped = new Set(help.contextMappings.map((c) => c.toolbarItem))
    expect(items.filter((i) => i.type !== 'separator' && !mapped.has(i.id)).map((i) => i.id)).toEqual([])
    const ops = new Set(help.contextMappings.map((c) => c.operation))
    expect(cadModelerTool.assistant!.actions.filter((a) => !ops.has(a.name)).map((a) => a.name)).toEqual([])
    expect(cadModelerTool.entitlement).toBe('tool:cad')
  })
})

describe('CAD document service from the tool (local adapter, same contract as the API)', () => {
  it('saves revisions, refuses stale saves, records assistant provenance, lists and opens revisions', async () => {
    const store = createLocalCadClient({ actor: 'eli' })
    cadSession.configureStore(store)
    try {
      await (await propose('cad-modeler.run_commands', { commands: cadModelerTool.assistant!.demo!('create a plate 40 x 20 x 5 in cad', { selectionIds: [] })!.calls[0].arguments.commands as never })).apply(provenance)
      const d = cadSession.active!
      expect(await cadSession.saveToStore('PRJ-ACT100')).toEqual({ revision: 1, unchanged: false })
      expect(cadSession.getSnapshot().documents[0]).toMatchObject({ stored: { projectId: 'PRJ-ACT100', revision: 1 }, dirty: false })

      // Someone else saves revision 2 of the same document (another window).
      const other = await store.get('PRJ-ACT100', d.id)
      const otherDoc = { ...other.document, metadata: { ...other.document.metadata, title: 'Edited elsewhere' } }
      await store.save('PRJ-ACT100', d.id, otherDoc, { expectedRevision: 1, idempotencyKey: 'k-other' })
      await d.engine.execute({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'thickness', expression: '6' } }] })
      await expect(cadSession.saveToStore('PRJ-ACT100')).rejects.toMatchObject({ code: 'version-conflict' })
      expect((await store.revisions('PRJ-ACT100', d.id)).map((r) => r.revision)).toEqual([2, 1])

      // Keep the local changes in a file (as the UI notice asks), then open the latest revision.
      await expect(cadSession.openFromStore('PRJ-ACT100', d.id)).rejects.toThrow(/unsaved changes/)
      cadSession.save(d.id)
      // Open the latest, change, save through an assistant proposal: provenance is recorded.
      const reopened = await cadSession.openFromStore('PRJ-ACT100', d.id)
      expect(reopened.engine.document.metadata.title).toBe('Edited elsewhere')
      await reopened.engine.execute({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'thickness', expression: '7' } }] })
      const listed = (await call('cad-modeler.list_documents', {})) as { data: { documents: { id: string; revision: number }[] } }
      expect(listed.data.documents).toEqual([expect.objectContaining({ id: d.id, revision: 2 })])
      const save = await propose('cad-modeler.save_document', { message: 'thicker' })
      expect(save.preview[0]).toMatchObject({ current: 'revision 2', proposed: expect.stringMatching(/^revision 3: thicker/) })
      expect((await save.apply(provenance)).summary).toBe('Saved revision 3 in PRJ-ACT100')
      const revs = await store.revisions('PRJ-ACT100', d.id)
      expect(revs[0]).toMatchObject({ revision: 3, message: 'thicker', source: { sourceKind: 'assistant' } })

      // Open revision 1 through the assistant.
      const open = await propose('cad-modeler.open_document', { documentId: d.id, revision: 1 })
      await open.apply(provenance)
      expect(cadSession.active!.engine.document.parts[0].parameters.find((p) => p.name === 'thickness')?.expression).toBe('5')
      expect(cadSession.active!.engine.regeneration!.parts[0].bodies[0].analysis.volume).toBeCloseTo(40 * 20 * 5, 6)
    } finally {
      cadSession.configureStore(null)
    }
  })
})

describe('fillet and chamfer through the assistant', () => {
  it('plans a fillet on the vertical edges by stable names, previews and applies it', async () => {
    await (await propose('cad-modeler.run_commands', { commands: cadModelerTool.assistant!.demo!('create a plate 80 x 40 x 10 in cad', { selectionIds: [] })!.calls[0].arguments.commands as never })).apply(provenance)
    const plan = cadModelerTool.assistant!.demo!('Fillet the vertical edges of the CAD part with 5 mm', { selectionIds: [] })!
    expect(plan.calls[0].arguments).toMatchObject({ commands: [{ command: 'fillet_edges', input: { radius: 5 } }] })
    const p = await propose(plan.calls[0].name, plan.calls[0].arguments)
    const removed = 4 * (25 - (Math.PI * 25) / 4) * 10
    expect(p.preview.find((i) => i.label.startsWith('Predicted body'))?.proposed).toMatch(new RegExp(`^${(32000 - removed).toFixed(2)} mm³, 10 faces`))
    await p.apply(provenance)
    expect(cadSession.active!.engine.regeneration!.parts[0].bodies[0].analysis.volume).toBeCloseTo(32000 - removed, 6)
    const chamfer = cadModelerTool.assistant!.demo!('chamfer the top edges of the cad plate 1 mm', { selectionIds: [] })!
    expect((chamfer.calls[0].arguments.commands as { input: { edges: string[] } }[])[0].input.edges).toHaveLength(4)
  })
})

import { sharedNodeKernel } from '@ews/cad-kernel/node'
import { createLocalCadClient } from '@ews/cad-client'
import type { AssistantActionContext, ConstraintSummary, PlatformServices, ServiceProposal } from '@ews/platform-sdk'
import { sampleModel } from '@ews/platform-sdk/testing'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { CheckReport } from './checks'
import { cadModelerTool } from './index'
import { cadSession } from './session'

/**
 * D1-CAD through the assistant path with the real kernel: polygon + pattern modelled with run_commands,
 * parameters bound to design constraints, cad-modeler.check against bounds read from a (fake)
 * Conceptualize, cad-modeler.check_bindings for superseded revisions. Fixture values are a generic
 * block with hexagonal pockets.
 */

const PROJECT = 'PRJ-D1-TEST'
const provenance = { conversationId: 'c-d1', proposalId: 'p-d1', messageId: 'm-d1' }
const action = (name: string) => cadModelerTool.assistant!.actions.find((a) => a.name === name)!

type Revs = Record<string, ConstraintSummary[]>
const constraint = (id: string, key: string, revision: number, latest: number, bound: ConstraintSummary['bound'], extra: Partial<ConstraintSummary> = {}): ConstraintSummary => ({
  id,
  key,
  projectId: PROJECT,
  revision,
  latestRevision: latest,
  kind: bound ? 'dimensional' : 'qualitative',
  statement: `${key} statement r${revision}`,
  bound,
  strength: 'hard',
  status: 'active',
  basis: 'user-assertion',
  formalizes: null,
  ...extra,
})
const mm = (operator: NonNullable<ConstraintSummary['bound']>['operator'], q: { value?: number; min?: number; max?: number }, unit = 'mm') => ({ operator, quantity: { ...q, unit } })
const CONSTRAINTS: Revs = {
  'c-af': [constraint('c-af', 'CST-1', 1, 2, mm('in-range', { min: 6.4, max: 6.8 })), constraint('c-af', 'CST-1', 2, 2, mm('in-range', { min: 6.9, max: 7.3 }))],
  'c-wall': [constraint('c-wall', 'CST-2', 1, 1, mm('>=', { value: 2 }))],
  'c-wall-strict': [constraint('c-wall-strict', 'CST-3', 1, 1, mm('>=', { value: 6 }), { basis: 'assumption' })],
  'c-length': [constraint('c-length', 'CST-4', 1, 1, mm('<=', { value: 2.5 }, 'in'))],
  'c-mass': [constraint('c-mass', 'CST-5', 1, 1, mm('<=', { value: 100 }, 'g'))],
  'c-qual': [constraint('c-qual', 'CST-6', 1, 1, null)],
  'c-count': [constraint('c-count', 'CST-7', 1, 1, mm('=', { value: 4 }, ''))],
}
const concepts: Pick<NonNullable<PlatformServices['concepts']>, 'getConstraint'> = {
  getConstraint: async (id, scope) => {
    if (scope.projectId !== PROJECT) return undefined
    const revs = CONSTRAINTS[id]
    if (!revs) return undefined
    return scope.revision ? revs.find((r) => r.revision === scope.revision) : revs.at(-1)
  },
}
const ctx = (services: Partial<PlatformServices> | undefined = { concepts: concepts as PlatformServices['concepts'] }): AssistantActionContext => ({
  model: sampleModel(),
  artifacts: [],
  captured: { projectId: PROJECT, configurationId: 'CFG', scenarioId: 'SCN', modelRevision: 1, selectionIds: [] },
  ...(services ? { services: services as PlatformServices } : {}),
})
async function apply(name: string, args: Record<string, unknown>) {
  const p = (await action(name).run(args, ctx())) as ServiceProposal
  expect(p.kind).toBe('service-proposal')
  return p.apply(provenance)
}
const check = async (args: Record<string, unknown> = {}, services?: Partial<PlatformServices>) => ((await action('cad-modeler.check').run(args, ctx(services ?? { concepts: concepts as PlatformServices['concepts'] }))) as { data: CheckReport }).data

const MODEL = [
  { command: 'create_part', input: { name: 'Block', ref: '$p' } },
  { command: 'create_parameter', input: { partId: '$p', name: 'af', expression: '7' } },
  { command: 'create_parameter', input: { partId: '$p', name: 'pitch', expression: '12' } },
  { command: 'create_parameter', input: { partId: '$p', name: 'n', expression: '4', unit: 'none' } },
  { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
  { command: 'add_rectangle', input: { sketchId: '$s', width: 60, height: 20 } },
  { command: 'extrude_profile', input: { sketchId: '$s', distance: 20 } },
  { command: 'create_sketch', input: { partId: '$p', plane: 'XY', offset: 20, ref: '$h' } },
  { command: 'add_regular_polygon', input: { sketchId: '$h', center: [12, 10], sides: 6, size: { acrossFlats: 'af' }, rotation: 30 } },
  { command: 'extrude_profile', input: { sketchId: '$h', distance: 12, direction: 'reverse', operation: 'cut', ref: '$pocket' } },
  { command: 'pattern_linear', input: { features: ['$pocket'], direction: 'x', count: 'n', spacing: 'pitch', ref: '$pat' } },
  { command: 'bind_parameter', input: { partId: '$p', name: 'af', ref: { module: 'conceptualize', kind: 'constraint', id: 'c-af', revision: 1 }, quantity: 'pocket across flats' } },
]

beforeAll(async () => {
  const kernel = await sharedNodeKernel()
  cadSession.configureKernel(() => kernel)
}, 30_000)
beforeEach(async () => {
  await cadSession.reset()
})
afterEach(() => cadSession.configureStore(null))

async function model() {
  await apply('cad-modeler.run_commands', { commands: MODEL, label: 'Block with pockets' })
  const d = cadSession.openDocuments()[0]
  const pat = d.engine.document.parts[0].features.find((f) => f.type === 'pattern-linear')!.id
  return { d, pat }
}

describe('D1-CAD: check against bound constraints', () => {
  it('measures bound parameters and requested quantities against Conceptualize bounds, with provenance', async () => {
    const { d, pat } = await model()
    const report = await check({
      checks: [
        { measure: { kind: 'pattern-gap', featureId: pat }, constraint: { id: 'c-wall' } },
        { measure: { kind: 'pattern-gap', featureId: pat }, constraint: { id: 'c-wall-strict' } },
        { measure: { kind: 'bounding-size', axis: 'x' }, constraint: { id: 'c-length' } },
        { measure: { kind: 'mass' }, constraint: { id: 'c-mass' } },
        { measure: { kind: 'pattern-count', featureId: pat }, constraint: { id: 'c-count' } },
        { measure: { kind: 'parameter', name: 'pitch' }, constraint: { id: 'c-qual' } },
        { measure: { kind: 'volume' }, constraint: { id: 'nope' } },
      ],
    })
    expect(report).toMatchObject({ documentId: d.id, documentRevision: null, kernel: { name: expect.stringMatching(/OCCT|Open CASCADE|replicad/i), version: expect.any(String) } })
    const by = (q: string, key?: string) => report.results.find((r) => r.quantity.startsWith(q) && (!key || r.bound?.key === key))!
    // Bound parameter: af = 7 against CST-1 latest revision (6.9–7.3): satisfied; the binding pins revision 1.
    const af = by('parameter af')
    expect(af).toMatchObject({ status: 'satisfied', measured: { value: 7, unit: 'mm' }, bound: { key: 'CST-1', constraint: { module: 'conceptualize', kind: 'constraint', id: 'c-af', revision: 2 }, min: 6.9, max: 7.3 }, binding: { parameter: 'af', pinnedRevision: 1 } })
    expect(report.assumptions.some((a) => /bound to CST-1 revision 1/.test(a))).toBe(true)
    // Gap between pockets: pitch − across flats = 5 mm.
    expect(by('pattern', 'CST-2')).toMatchObject({ status: 'satisfied', measured: { unit: 'mm' } })
    expect(by('pattern', 'CST-2').measured!.value).toBeCloseTo(5, 6)
    expect(by('pattern', 'CST-3').status).toBe('violated')
    expect(report.assumptions.some((a) => /CST-3.*assumption/.test(a))).toBe(true)
    // Unit conversion: 60 mm = 2.362 in ≤ 2.5 in.
    expect(by('bounding size x')).toMatchObject({ status: 'satisfied', measured: { unit: 'in' }, measuredModel: { value: 60, unit: 'mm' } })
    expect(by('bounding size x').measured!.value).toBeCloseTo(60 / 25.4, 9)
    expect(by('mass')).toMatchObject({ status: 'not-checkable', reason: expect.stringMatching(/material/) })
    expect(report.assumptions.some((a) => /no material/.test(a))).toBe(true)
    expect(by('pattern', 'CST-7')).toMatchObject({ status: 'satisfied', measured: { value: 4 } })
    expect(by('parameter pitch')).toMatchObject({ status: 'not-checkable', reason: expect.stringMatching(/no quantitative bound/) })
    expect(by('volume')).toMatchObject({ status: 'not-checkable', reason: expect.stringMatching(/does not exist/) })
    expect(report.results.find((r) => r.quantity.startsWith('solid validity'))).toMatchObject({ status: 'satisfied' })
    for (const r of report.results) expect(r).toMatchObject({ documentId: d.id, modelVersion: d.engine.document.version, kernel: report.kernel && { name: report.kernel.name, version: report.kernel.version } })
    expect(report.assumptions.some((a) => /not stored in the project/.test(a))).toBe(true)
  })

  it('a change regenerates and the rerun check reflects it; mass is checked once a material is set', async () => {
    await model()
    await apply('cad-modeler.run_commands', { commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'af', expression: '6.5' } }, { command: 'set_material', input: { partId: 'part-1', name: 'Aluminium', density: 2700 } }] })
    const report = await check({ checks: [{ measure: { kind: 'mass' }, constraint: { id: 'c-mass' } }] })
    expect(report.results.find((r) => r.quantity === 'parameter af')).toMatchObject({ status: 'violated', measured: { value: 6.5 } })
    const mass = report.results.find((r) => r.quantity === 'mass')!
    expect(mass.status).toBe('satisfied')
    const volume = 60 * 20 * 20 - 4 * (Math.sqrt(3) / 2) * 6.5 ** 2 * 12
    expect(mass.measured!.value).toBeCloseTo(volume * 1e-9 * 2700 * 1000, 6) // grams
  })

  it('never accepts bounds from the caller, and reports when constraints cannot be read', async () => {
    await model()
    await expect(action('cad-modeler.check').run({ checks: [{ measure: { kind: 'volume' }, constraint: { id: 'c-wall' }, bound: { value: 3 } }] }, ctx())).rejects.toThrow()
    await expect(action('cad-modeler.check').run({ checks: [{ measure: { kind: 'volume' } }] }, ctx())).rejects.toThrow(/constraint\.id/)
    const without = await check({}, {})
    expect(without.results.find((r) => r.quantity === 'parameter af')).toMatchObject({ status: 'not-checkable', reason: expect.stringMatching(/cannot be read/) })
  })

  it('reports the stored document revision when the document is in the project', async () => {
    const store = createLocalCadClient({ actor: 'eli' })
    cadSession.configureStore(store)
    await model()
    const report = await check()
    expect(report.documentRevision).toBe(1)
    expect(report.results.every((r) => r.documentRevision === 1)).toBe(true)
    expect(report.unsavedChanges).toBe(false)
  })
})

describe('D1-CAD: check_bindings', () => {
  it('lists bindings pinned to superseded revisions with old and new bounds', async () => {
    await model()
    const r = (await action('cad-modeler.check_bindings').run({}, ctx())) as { data: { outdated: Record<string, unknown>[]; current: unknown[]; unknown: unknown[] } }
    expect(r.data.outdated).toEqual([
      expect.objectContaining({
        parameter: 'af',
        value: 7,
        key: 'CST-1',
        pinnedRevision: 1,
        latestRevision: 2,
        old: expect.objectContaining({ bound: expect.objectContaining({ quantity: expect.objectContaining({ min: 6.4, max: 6.8 }) }) }),
        new: expect.objectContaining({ bound: expect.objectContaining({ quantity: expect.objectContaining({ min: 6.9, max: 7.3 }) }) }),
      }),
    ])
    // Re-binding to the latest revision clears it.
    await apply('cad-modeler.run_commands', { commands: [{ command: 'bind_parameter', input: { partId: 'part-1', name: 'af', ref: { module: 'conceptualize', kind: 'constraint', id: 'c-af', revision: 2 } } }] })
    const again = (await action('cad-modeler.check_bindings').run({}, ctx())) as { data: { outdated: unknown[]; current: unknown[] } }
    expect(again.data.outdated).toEqual([])
    expect(again.data.current).toHaveLength(1)
  })
})

describe('D1-CAD: headless STEP export with read-back', () => {
  it('returns the STEP file and a read-back that matches the native model; nothing is downloaded', async () => {
    const downloads: string[] = []
    cadSession.configureDownloads((f) => downloads.push(f.name))
    const { d } = await model()
    const r = (await action('cad-modeler.export').run({ format: 'step', return: true }, ctx())) as { kind: string; data: any }
    expect(r.kind).toBe('data')
    const { file, readBack, inspection } = r.data
    expect(file).toMatchObject({ name: 'Block.step', mediaType: 'model/step', encoding: 'utf-8', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) })
    expect(file.content.startsWith('ISO-10303-21;')).toBe(true)
    expect(file.size).toBe(new TextEncoder().encode(file.content).length)
    expect(inspection).toMatchObject({ valid: true, applicationProtocol: 'AP242', solids: 1 })
    expect(readBack).toMatchObject({ ok: true, differences: [], native: { solids: 1 }, imported: { solids: 1, valid: true } })
    const native = d.engine.regeneration!.parts[0].bodies[0].analysis.volume
    expect(readBack.imported.volume).toBeCloseTo(native, 3)
    expect(readBack.imported.boundingBox.size[0]).toBeCloseTo(60, 3)
    expect(r.data).toMatchObject({ documentId: d.id, modelVersion: d.engine.document.version })
    expect(downloads).toEqual([])
    // The native file can be returned the same way.
    const native2 = (await action('cad-modeler.export').run({ format: 'ewscad', return: true }, ctx())) as { data: any }
    expect(JSON.parse(native2.data.file.content).documentId).toBe(d.id)
  })
})

describe('D1-CAD: workspace PlatformServices.cad helper', () => {
  it('summarises and measures a stored revision with the shared kernel', async () => {
    const { createWorkspaceCadService } = await import('./index')
    const store = createLocalCadClient({ actor: 'eli' })
    cadSession.configureStore(store)
    const { d } = await model()
    const cad = createWorkspaceCadService({ client: store })
    const ref = { module: 'cad', kind: 'cad-modeler-entity', id: `${d.id}/${d.engine.document.parts[0].id}`, revision: 1 }
    const summary = await cad.summary(PROJECT, ref)
    expect(summary).toMatchObject({ status: 'resolved', value: { entityType: 'part', label: 'Block', ref: { revision: 1 } } })
    const mass = await cad.massProperties(PROJECT, ref)
    if (mass.status !== 'resolved') throw new Error(JSON.stringify(mass))
    expect(mass.value.parts[0].bodies[0].volume).toBeCloseTo(60 * 20 * 20 - 4 * (Math.sqrt(3) / 2) * 49 * 12, 4)
    expect(mass.value.derivedFrom).toBe('regeneration')
  })
})

describe('document source concept', () => {
  it('set_document_source through run_commands; describe_model shows it', async () => {
    await model()
    await apply('cad-modeler.run_commands', { commands: [{ command: 'set_document_source', input: { conceptId: 'c-holder', revision: 2, label: 'CON-002 Holder' } }] })
    const d = (await action('cad-modeler.describe_model').run({}, ctx())) as { data: { document: { source: unknown } } }
    expect(d.data.document.source).toMatchObject({ concept: { module: 'conceptualize', kind: 'concept', id: 'c-holder', revision: 2 } })
  })
})

describe('D1-CAD: changing a bound parameter whose constraint has a newer revision', () => {
  it('flags it in the preview and re-binds it in the same proposal (or only flags it with rebind: false)', async () => {
    await model() // af bound to CST-1 revision 1; CST-1 is at revision 2
    const p = (await action('cad-modeler.run_commands').run({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'af', expression: '7.1' } }] }, ctx())) as ServiceProposal
    const item = p.preview.find((i) => i.label === 'Outdated binding: af')!
    expect(item).toMatchObject({ current: expect.stringMatching(/bound to CST-1 revision 1 \(6\.4–6\.8 mm\)/), proposed: expect.stringMatching(/re-bound to CST-1 revision 2 \(6\.9–7\.3 mm\)/) })
    expect(p.preview.some((i) => i.label.endsWith('bind_parameter'))).toBe(true)
    expect(p.assumptions?.some((a) => /run cad-modeler\.check/.test(a))).toBe(true)
    await p.apply(provenance)
    const doc = cadSession.openDocuments()[0].engine.document
    expect(doc.parts[0].parameters.find((x) => x.name === 'af')!.binding!.ref.revision).toBe(2)
    const b = (await action('cad-modeler.check_bindings').run({}, ctx())) as { data: { outdated: unknown[] } }
    expect(b.data.outdated).toEqual([])
  })

  it('rebind: false only flags; unrelated parameter changes are not flagged', async () => {
    await model()
    const flagged = (await action('cad-modeler.run_commands').run({ rebind: false, commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'af', expression: '7.1' } }] }, ctx())) as ServiceProposal
    expect(flagged.preview.find((i) => i.label === 'Outdated binding: af')?.proposed).toMatch(/still bound to revision 1; CST-1 is at revision 2/)
    expect(flagged.preview.some((i) => i.label.endsWith('bind_parameter'))).toBe(false)
    await flagged.apply(provenance)
    expect(cadSession.openDocuments()[0].engine.document.parts[0].parameters.find((x) => x.name === 'af')!.binding!.ref.revision).toBe(1)
    const other = (await action('cad-modeler.run_commands').run({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'pitch', expression: '13' } }] }, ctx())) as ServiceProposal
    expect(other.preview.some((i) => i.label.startsWith('Outdated binding'))).toBe(false)
  })
})

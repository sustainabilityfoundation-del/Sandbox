import { afterEach, describe, expect, it } from 'vitest'
import type { AssistantActionContext, ServiceProposal } from '@ews/platform-sdk'
import { sampleModel } from '@ews/platform-sdk/testing'
import { createHttpConceptsService, type EngineeringDefinition } from '@ews/conceptualize-client'
import { conceptsAssistant } from './assistant'
import { applyDefinitionChanges } from './layout/definitionChanges'
import { registerVisualizationPort, type GenerationJob, type VisualizationPort } from './visualization'

/** Visual concept exploration operations: the same API calls as the UI, prepared as service proposals. */

const P = 'PRJ-ACT100'
const BASE = `http://api.test/api/concepts/v1/projects/${P}`
const CID = '0c0a0001-0000-4000-8000-0000000000a1'
const VID = '0c0a0001-0000-4000-8000-0000000000b1'
const ANN = '0c0a0001-0000-4000-8000-0000000000c1'

const DEF: EngineeringDefinition = {
  intent: 'Hold a shelf',
  components: [
    { id: 'C1', name: 'Wall plate', kind: 'part', description: '', basis: 'user-assertion' },
    { id: 'C2', name: 'Arm', kind: 'part', description: '', basis: 'user-assertion' },
  ],
  relationships: [],
  interfaces: [{ id: 'I3', name: 'Bolted joint', kind: 'mechanical', between: ['C1', 'C2'], description: '', parameterIds: [] }],
  parameters: [
    { id: 'P4', symbol: 'arm_l', name: 'Arm length', value: 120, min: null, max: null, unit: 'mm', basis: 'user-assertion', componentId: 'C2', constraintId: null, note: '' },
    { id: 'P5', symbol: 'plate_h', name: 'Plate height', value: 80, min: null, max: null, unit: 'mm', basis: 'user-assertion', componentId: 'C1', constraintId: null, note: '' },
  ],
  layout: {
    view: 'side',
    unit: 'mm',
    items: [
      { componentId: 'C1', x: 0, y: 0, width: 4, height: { parameter: 'P5' }, shape: 'rect' },
      { componentId: 'C2', x: 4, y: 0, width: { parameter: 'P4' }, height: 10, shape: 'rect' },
    ],
    dimensions: [{ id: 'D6', parameterId: 'P4', componentId: 'C2', axis: 'x' }],
  },
  idSeq: 6,
}
const concept = (revision = 3, definition: EngineeringDefinition | null = DEF) => ({ id: CID, key: 'CON-010', projectId: P, revision, name: 'Wall bracket', summary: '', description: '', purpose: '', abstraction: 'component', classifications: [], attributes: {}, statements: [], stage: 'layout', definition, maturity: 'exploring', verificationStatus: 'not-verified', implementationStatus: 'none', changeReason: '', provenance: { sourceKind: 'user', conversationId: null, proposalId: null }, revisionCreatedAt: '', revisionCreatedBy: '', createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' })
const visual = (kind: 'layout' | 'illustration' = 'layout', revision = 1) => ({ id: VID, key: 'VIS-001', projectId: P, conceptId: CID, kind, status: 'active', revision, currentRevision: revision, conceptRevision: 3, title: 'Layout', view: 'side', notToScale: false, instruction: '', referenceAssets: [], refinedFrom: [], changeReason: '', generation: null, annotations: [{ id: ANN, visualId: VID, revision, number: 1, shape: 'pin', x: 0.6, y: 0.3, width: null, height: null, instruction: 'Make the arm shorter', componentId: 'C2', componentBasis: 'structured', createdAt: '', createdBy: '', provenance: { sourceKind: 'user', conversationId: null, proposalId: null, messageId: null } }], staleness: { outdated: false, currentConceptRevision: 3, changes: [] }, provenance: { sourceKind: 'user', conversationId: null, proposalId: null, messageId: null }, revisionCreatedAt: '', revisionCreatedBy: '', createdAt: '', createdBy: '' })
const card = () => ({ concept: { id: CID, key: 'CON-010', name: 'Wall bracket', summary: '', revision: 3, stage: 'layout', maturity: 'exploring', verificationStatus: 'not-verified' }, intent: 'Hold a shelf', principle: ['Cantilever arm'], components: DEF.components, interfaces: [{ ...DEF.interfaces[0], betweenNames: ['Wall plate', 'Arm'] }], parameters: DEF.parameters, benefits: [], tradeOffs: [], constraints: [], requirements: [], assumptions: [], questions: [], validation: { verificationStatus: 'not-verified', openQuestions: 0, unconfirmedHypotheses: 0, constraintsVerified: 0, constraintsChecked: 0, constraintsTotal: 0 }, visuals: [], primaryVisualId: null, decisions: [], membership: [] })

type Call = { method: string; url: string; headers: Record<string, string>; body: any }
function server(routes: (c: Call) => unknown) {
  const calls: Call[] = []
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const c: Call = { method: init.method ?? 'GET', url: String(input), headers: (init.headers ?? {}) as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(c)
    const out = routes(c)
    if (out === undefined) return new Response(JSON.stringify({ error: { code: 'not-found', message: `no route ${c.method} ${c.url}` } }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify(out), { status: c.method === 'POST' && /\/visuals$|\/handoffs$|\/explorations$/.test(c.url.split('?')[0]) ? 201 : 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof globalThis.fetch
  return { calls, concepts: createHttpConceptsService({ baseUrl: 'http://api.test/api/concepts/v1', fetch }) }
}
const ctx = (services: AssistantActionContext['services']): AssistantActionContext => {
  const model = sampleModel()
  return { model, artifacts: [], captured: { projectId: P, configurationId: 'CFG-BASE', scenarioId: 'SCN-NOM', modelRevision: model.revision, selectionIds: [] }, services }
}
const action = (name: string) => conceptsAssistant.actions.find((a) => a.name === name)!
const applied = { conversationId: 'C-1', proposalId: 'CP-1', messageId: 'M-1' }
const writes = (calls: Call[]) => calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.url.replace(BASE, '')}`)

afterEach(() => registerVisualizationPort(null))

describe('definition changes (refinement)', () => {
  it('keeps IDs, gives new items the next IDs after idSeq and removes a component with what depends on it', () => {
    const { input, lines } = applyDefinitionChanges(DEF, { setParameters: [{ parameter: 'arm_l', value: 100 }], addComponents: [{ name: 'Gusset', placement: { x: 4, y: 10, width: 20, height: 20 } }], addInterfaces: [{ name: 'Weld', between: ['C2', 'C7'] }] })
    expect(input.components!.map((c) => c.id)).toEqual(['C1', 'C2', 'C7'])
    expect(input.interfaces!.map((f) => f.id)).toEqual(['I3', 'I8'])
    expect(input.parameters!.find((p) => p.id === 'P4')).toMatchObject({ value: 100, basis: 'ai-hypothesis' })
    expect(input.parameters!.find((p) => p.id === 'P5')!.basis).toBe('user-assertion')
    expect(lines[0]).toEqual({ label: 'Parameter P4', before: 'arm_l = 120 mm', after: 'arm_l = 100 mm' })
    const removed = applyDefinitionChanges(DEF, { removeComponents: ['C2'] }).input
    expect(removed.components!.map((c) => c.id)).toEqual(['C1'])
    expect(removed.interfaces).toEqual([])
    expect(removed.layout!.items.map((i) => i.componentId)).toEqual(['C1'])
    expect(removed.layout!.dimensions).toEqual([])
    expect(() => applyDefinitionChanges(DEF, { removeParameters: ['plate_h'] })).toThrow(/positions a component/)
    expect(() => applyDefinitionChanges(DEF, { setParameters: [{ parameter: 'nope', value: 1 }] })).toThrow(/no parameter nope/)
  })
})

describe('visual operations', () => {
  it('define_concept previews the definition and applies one revision, then draws the layout', async () => {
    const { calls, concepts } = server((c) => {
      if (c.method === 'GET' && c.url.includes('/concepts?')) return { items: [{ id: CID, key: 'CON-010' }], total: 1 }
      if (c.method === 'GET' && c.url.startsWith(`${BASE}/concepts/${CID}`)) return concept(3, null)
      if (c.method === 'PATCH') return concept(4)
      if (c.method === 'GET' && c.url.startsWith(`${BASE}/visuals`)) return []
      if (c.method === 'POST' && c.url === `${BASE}/visuals`) return { ...visual(), key: 'VIS-002' }
    })
    const r = (await action('conceptualize.define_concept').run({ conceptId: CID, stage: 'layout', definition: { intent: DEF.intent, components: DEF.components.map(({ id, name }) => ({ id, name })), parameters: DEF.parameters.map(({ id, symbol, value, unit }) => ({ id, symbol, value, unit })), layout: DEF.layout } }, ctx({ concepts }))) as ServiceProposal
    expect(writes(calls)).toEqual([])
    expect(r.preview.map((x) => x.proposed)).toEqual(expect.arrayContaining(['Wall plate (part)', 'arm_l = 120 mm', 'Drawn from the definition (labels from parameters)']))
    const out = await r.apply(applied)
    expect(writes(calls)).toEqual([`PATCH /concepts/${CID}`, 'POST /visuals'])
    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.body).toMatchObject({ expectedRevision: 3, stage: 'layout', definition: { intent: 'Hold a shelf', layout: { view: 'side' } } })
    expect(patch.headers).toMatchObject({ 'X-Source-Kind': 'assistant', 'X-Proposal-Id': 'CP-1' })
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ conceptId: CID, kind: 'layout', conceptRevision: 4 })
    expect(out.summary).toMatch(/revision 4\. Layout VIS-002 rev 1 drawn/)
  })

  it('refine_from_annotations shows before and after, answers the annotation and draws a new layout revision', async () => {
    const { calls, concepts } = server((c) => {
      if (c.method === 'GET' && c.url.startsWith(`${BASE}/visuals?`)) return [visual()]
      if (c.method === 'GET' && c.url.startsWith(`${BASE}/concepts/${CID}`)) return concept(3)
      if (c.method === 'PATCH') return concept(4)
      if (c.method === 'POST' && c.url === `${BASE}/visuals/${VID}/revisions`) return { ...visual('layout', 2), conceptRevision: 4, annotations: [] }
    })
    await expect(action('conceptualize.refine_from_annotations').run({ visualId: 'VIS-001', annotations: [2], changes: { setParameters: [{ parameter: 'arm_l', value: 100 }] } }, ctx({ concepts }))).rejects.toThrow(/no annotation 2/)
    const r = (await action('conceptualize.refine_from_annotations').run({ visualId: 'VIS-001', annotations: [1], changes: { setParameters: [{ parameter: 'arm_l', value: 100 }] } }, ctx({ concepts }))) as ServiceProposal
    expect(r.preview).toEqual(expect.arrayContaining([{ label: 'Annotation 1 (C2)', proposed: 'Make the arm shorter' }, { label: 'Parameter P4', current: 'arm_l = 120 mm', proposed: 'arm_l = 100 mm', basis: 'ai-hypothesis' }]))
    await r.apply(applied)
    expect(writes(calls)).toEqual([`PATCH /concepts/${CID}`, `POST /visuals/${VID}/revisions`])
    const patch = calls.find((c) => c.method === 'PATCH')!.body
    expect(patch.expectedRevision).toBe(3)
    expect(patch.definition.parameters.find((p: { id: string }) => p.id === 'P4')).toMatchObject({ value: 100, basis: 'ai-hypothesis' })
    expect(patch.definition.parameters.find((p: { id: string }) => p.id === 'P5').basis).toBe('user-assertion')
    expect(calls.at(-1)!.body).toMatchObject({ expectedRevision: 1, conceptRevision: 4, refinedFrom: [ANN] })
  })

  it('refuses an illustration with the reason when no visualization service is connected; never a placeholder', async () => {
    const { calls, concepts } = server((c) => (c.method === 'GET' && c.url.startsWith(`${BASE}/concepts/${CID}`) ? concept() : undefined))
    await expect(action('conceptualize.request_illustration').run({ conceptId: CID }, ctx({ concepts }))).rejects.toThrow(/not connected.*Structured layouts are available.*no image was made/)
    registerVisualizationPort(port({ available: false }))
    await expect(action('conceptualize.request_illustration').run({ conceptId: CID }, ctx({ concepts }))).rejects.toThrow(/Sign in with ChatGPT cannot generate images \(method-unsupported\)/)
    expect(writes(calls)).toEqual([])
  })

  it('requests an illustration through the port and records the job against the visual revision (fake test adapter)', async () => {
    const jobs: unknown[] = []
    registerVisualizationPort(port({ available: true, jobs }))
    const { calls, concepts } = server((c) => {
      if (c.method === 'GET' && c.url.startsWith(`${BASE}/concepts/${CID}/card`)) return card()
      if (c.method === 'GET' && c.url.startsWith(`${BASE}/concepts/${CID}`)) return concept()
      if (c.method === 'POST' && c.url === `${BASE}/visuals`) return visual('illustration')
      if (c.method === 'PUT') return { ...visual('illustration'), generation: c.body }
    })
    const r = (await action('conceptualize.request_illustration').run({ conceptId: CID, style: 'side view sketch' }, ctx({ concepts }))) as ServiceProposal
    expect(r.preview[0].proposed).toBe('Concept: Wall bracket. Purpose: Hold a shelf. Operating principle: Cantilever arm Visible components: Wall plate, Arm. Connections: Bolted joint between Wall plate and Arm. View: side view sketch.')
    expect(r.assumptions).toEqual(expect.arrayContaining([expect.stringMatching(/TEST ASSET/)]))
    await r.apply(applied)
    expect(jobs).toEqual([expect.objectContaining({ kind: 'illustration', subject: { module: 'conceptualize', type: 'concept', id: CID, revision: 3 }, clientRef: VID, adapter: 'fake-test' })])
    expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ url: `${BASE}/visuals/${VID}/revisions/1/generation`, body: { jobId: 'job-1', state: 'pending', adapter: 'fake-test', testAsset: true } })
  })

  it('develop_alternatives draws a layout per alternative and notes unavailable illustrations without failing', async () => {
    const created: string[] = []
    const { calls, concepts } = server((c) => {
      if (c.method === 'POST' && c.url === `${BASE}/explorations`) return { id: 'e1', created: { concepts: [{ id: 'p', key: 'CON-100', name: 'Shelf support', role: 'parent' }, { id: 'a', key: 'CON-101', name: 'Cantilever', role: 'alternative' }, { id: 'b', key: 'CON-102', name: 'Strut', role: 'alternative' }], relationships: [], evidence: [] } }
      if (c.method === 'POST' && c.url === `${BASE}/visuals`) {
        created.push(c.body.conceptId)
        return { ...visual(), id: `v-${c.body.conceptId}`, key: `VIS-00${created.length}` }
      }
    })
    const alt = (name: string, extra: Record<string, unknown> = {}) => ({ name, summary: `${name} support`, definition: { components: [{ id: 'C1', name: 'Plate' }], parameters: [{ id: 'P2', symbol: 'w', value: 40, unit: 'mm' }], layout: { items: [{ componentId: 'C1', x: 0, y: 0, width: { parameter: 'P2' }, height: 10 }] } }, ...extra })
    const r = (await action('conceptualize.develop_alternatives').run({ text: 'Support a shelf', alternatives: [alt('Cantilever'), alt('Strut')], visuals: { illustration: true } }, ctx({ concepts }))) as ServiceProposal
    expect(r.assumptions).toEqual(expect.arrayContaining([expect.stringMatching(/Illustrations are not available: Image generation is not connected/)]))
    expect(r.preview.map((x) => x.label)).toEqual(expect.arrayContaining(['Cantilever: components', 'Cantilever: parameters', 'Cantilever: layout']))
    const out = await r.apply(applied)
    const exploration = calls.find((c) => c.url.endsWith('/explorations'))!.body
    expect(exploration.alternatives[0]).toMatchObject({ name: 'Cantilever', stage: 'layout', definition: { components: [{ id: 'C1', name: 'Plate' }] } })
    expect(created).toEqual(['a', 'b'])
    expect(out.summary).toMatch(/Visuals: CON-101: layout VIS-001; CON-102: layout VIS-002/)
  })
})

function port(o: { available: boolean; jobs?: unknown[] }): VisualizationPort {
  const job: GenerationJob = { id: 'job-1', state: 'pending', adapter: 'fake-test', provider: { id: 'fake', name: 'Fake test adapter', model: 'fake-1', method: null }, attempt: 1, clientRef: VID, error: null, output: null, testAsset: true }
  return {
    adapters: async () => ({ adapters: [{ id: 'fake-test', name: 'Fake', available: o.available, testOnly: true, costNote: 'free', limitations: [], ...(o.available ? {} : { unavailableReason: 'Sign in with ChatGPT cannot generate images', unavailableCode: 'method-unsupported' }) }], defaultAdapter: o.available ? 'fake-test' : null }),
    createJob: async (_p, request) => {
      o.jobs?.push(request)
      return { job, created: true }
    },
    getJob: async () => job,
    cancel: async () => ({ ...job, state: 'cancelled' }),
    retry: async () => job,
    contentUrl: () => '',
  }
}

import { describe, expect, it } from 'vitest'
import type { AssistantActionContext, ServiceProposal } from '@ews/platform-sdk'
import { sampleModel } from '@ews/platform-sdk/testing'
import { createDemoConceptsService, createHttpConceptsService } from '@ews/conceptualize-client'
import { generateExploration } from './ai/generator'
import { conceptsAssistant, conceptsDemo } from './assistant'
import { registerReferencePort } from './references'

const OWNER = 'Develop three alternative concepts for a compact mechanical actuator capable of delivering 500 N of linear force within a 100 mm envelope.'
const ASSISTANT_BASES = ['ai-hypothesis', 'assumption', 'estimate']

describe('demo planner (scripted, demo only)', () => {
  it('maps the owner’s example and similar prompts to conceptualize.* actions', () => {
    // The demo planner (not the action) runs the scripted library and passes the result as model-style arguments.
    const demoCall = conceptsDemo(OWNER, { selectionIds: [] })!.calls[0]
    expect(demoCall.name).toBe('conceptualize.develop_alternatives')
    expect((demoCall.arguments.alternatives as { name: string }[]).length).toBe(3)
    const createCall = conceptsDemo('Create a concept: a bracket that holds a camera', { selectionIds: [] })!.calls[0]
    expect(createCall).toMatchObject({ name: 'conceptualize.create', arguments: { text: 'a bracket that holds a camera' } })
    expect(typeof createCall.arguments.name).toBe('string')
    expect(conceptsDemo('What are the next steps for CON-001?', { selectionIds: [] })?.calls[0].name).toBe('conceptualize.next_steps')
    expect(conceptsDemo('Link CON-019 to CAD-120', { selectionIds: [] })?.calls[0]).toEqual({ name: 'conceptualize.link_artifact', arguments: { conceptId: 'CON-019', artifactId: 'CAD-120' } })
    expect(conceptsDemo('Decompose CON-018 into drive, guide and housing', { selectionIds: [] })?.calls[0].arguments).toEqual({ conceptId: 'CON-018', children: ['drive', 'guide', 'housing'] })
    expect(conceptsDemo('Propose requirements for CON-018', { selectionIds: [] })?.calls[0].name).toBe('conceptualize.propose_requirement')
    expect(conceptsDemo('Change the rod diameter to 28 mm.', { selectionIds: [] })).toBeNull()
    expect(conceptsDemo(OWNER, { selectionIds: [] })?.reply).toMatch(/Scripted demo assistant/)
  })

  it('plans only registered actions', () => {
    const names = new Set(conceptsAssistant.actions.map((a) => a.name))
    for (const p of [OWNER, 'Create a concept: x y z', 'Compare the alternatives of CON-005', 'Pursue CON-019', 'Request CAD generation for CON-019', 'Show CON-001', 'Find concepts for gripper']) {
      for (const c of conceptsDemo(p, { selectionIds: [] })?.calls ?? []) expect(names.has(c.name)).toBe(true)
    }
    expect([...names].every((n) => n.startsWith('conceptualize.'))).toBe(true)
  })
})

describe('scripted generator', () => {
  it('builds labelled alternatives with computed (not invented) estimates', () => {
    const { exploration, draft, family } = generateExploration(OWNER)
    expect(family).toBe('linear actuation')
    expect(draft.quantities.map((q) => q.quantity)).toEqual([{ value: 500, unit: 'N' }, { max: 100, unit: 'mm' }])
    expect(exploration.alternatives).toHaveLength(3)
    const all = [...(exploration.parent?.statements ?? []), ...exploration.alternatives.flatMap((a) => [...(a.statements ?? []), ...(a.children ?? []).flatMap((c) => c.statements ?? [])])]
    expect(all.every((s) => ASSISTANT_BASES.includes(s.basis!))).toBe(true)
    const torque = exploration.alternatives[0].evidence![0]
    expect(torque).toMatchObject({ basis: 'estimate', method: 'T = F·l / (2π·η)' })
    expect(torque.outputs![0].value).toBeCloseTo((500 * 0.005) / (2 * Math.PI * 0.9), 3)
    const bore = exploration.alternatives[1].evidence![0].outputs!.find((o) => o.name === 'd')!
    expect(bore.value).toBeCloseTo(Math.sqrt((4 * (500 / 0.6)) / Math.PI), 1)
    expect(exploration.tradeStudy!.scores!.every((s) => s.basis !== 'user-assertion' && s.basis !== 'evidence')).toBe(true)
  })

  it('gives honest placeholders for unknown kinds of request', () => {
    const { exploration, family, assumptions } = generateExploration('Develop two alternative concepts for a birthday greeting.')
    expect(family).toBeNull()
    expect(exploration.alternatives).toHaveLength(2)
    expect(exploration.tradeStudy).toBeUndefined()
    expect(assumptions.join(' ')).toMatch(/placeholders/)
  })
})

function context(services: AssistantActionContext['services']): AssistantActionContext {
  const model = sampleModel()
  return { model, artifacts: [], captured: { projectId: 'PRJ-ACT100', configurationId: 'CFG-BASE', scenarioId: 'SCN-NOM', modelRevision: model.revision, selectionIds: [] }, services }
}
const action = (name: string) => conceptsAssistant.actions.find((a) => a.name === name)!

describe('service proposals', () => {
  it('previews without writing, then applies through the API with idempotency and assistant provenance', async () => {
    const calls: { method: string; url: string; headers: Record<string, string>; body: unknown }[] = []
    const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      calls.push({ method: init.method ?? 'GET', url: String(input), headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined })
      const body = { id: 'e1', created: { concepts: [{ id: 'p', key: 'CON-100', name: 'x', role: 'parent' }, { id: 'a', key: 'CON-101', name: 'y', role: 'alternative' }], relationships: [], evidence: [] } }
      return new Response(JSON.stringify(body), { status: 201, headers: { 'Content-Type': 'application/json' } })
    }) as typeof globalThis.fetch
    const concepts = createHttpConceptsService({ baseUrl: 'http://api.test/api/concepts/v1', fetch })
    const result = (await action('conceptualize.develop_alternatives').run(conceptsDemo(OWNER, { selectionIds: [] })!.calls[0].arguments, context({ concepts }))) as ServiceProposal
    expect(result.kind).toBe('service-proposal')
    expect(result.module).toBe('conceptualize')
    expect(calls).toEqual([])
    expect(result.preview.find((p) => p.label === 'Objective (your words)')?.basis).toBe('user-statement')
    expect(result.preview.filter((p) => p.label.startsWith('Alternative')).every((p) => p.basis === 'ai-hypothesis')).toBe(true)
    expect(result.preview.some((p) => p.basis === 'estimate')).toBe(true)
    const applied = await result.apply({ conversationId: 'C-1', proposalId: 'CP-1', messageId: 'M2' })
    expect(applied.createdIds).toEqual(['p', 'a'])
    expect(calls[0]).toMatchObject({ method: 'POST', url: 'http://api.test/api/concepts/v1/projects/PRJ-ACT100/explorations' })
    expect(calls[0].headers).toMatchObject({ 'X-Source-Kind': 'assistant', 'X-Conversation-Id': 'C-1', 'X-Proposal-Id': 'CP-1', 'Idempotency-Key': 'C-1:CP-1:explore' })
    await result.undo!({})
    expect(calls[1]).toMatchObject({ method: 'POST', url: 'http://api.test/api/concepts/v1/projects/PRJ-ACT100/explorations/e1/undo' })
  })

  it('refuses to propose changes in demo mode instead of pretending', async () => {
    await expect(action('conceptualize.create').run({ text: 'A gripper', name: 'Gripper' }, context({ concepts: createDemoConceptsService() }))).rejects.toThrow(/API mode/)
    await expect(action('conceptualize.create').run({ text: 'A gripper', name: 'Gripper' }, context({}))).rejects.toThrow(/not available/)
  })
})

describe('model-supplied content (CR-AI-1)', () => {
  const S24 = 'develop a concept of a protective cover for a Samsung Galaxy S24+'
  const recording = () => {
    const calls: { method: string; url: string; body: Record<string, unknown> }[] = []
    const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      calls.push({ method: init.method ?? 'GET', url: String(input), body: init.body ? JSON.parse(String(init.body)) : undefined })
      const body = { id: 'e1', created: { concepts: [{ id: 'p', key: 'CON-200', name: 'Protective cover', role: 'parent' }, { id: 'a1', key: 'CON-201', name: 'TPU bumper', role: 'alternative' }, { id: 'a2', key: 'CON-202', name: 'Rugged two-layer case', role: 'alternative' }, { id: 'a3', key: 'CON-203', name: 'Folio case', role: 'alternative' }], relationships: [], evidence: [] } }
      return new Response(JSON.stringify(body), { status: 201, headers: { 'Content-Type': 'application/json' } })
    }) as typeof globalThis.fetch
    return { calls, concepts: createHttpConceptsService({ baseUrl: 'http://api.test/api/concepts/v1', fetch }) }
  }
  const modelArgs = {
    text: S24,
    name: 'Protective cover for Samsung Galaxy S24+',
    parentId: '',
    statements: [{ kind: 'constraint', text: 'Adds at most 2 mm to each side', quantity: { max: 2, unit: 'mm' } }],
    alternatives: [
      { name: 'TPU bumper', summary: 'Slim one-piece thermoplastic polyurethane shell absorbing impact at the corners.', statements: [{ kind: 'principle', text: 'Elastic deformation absorbs drop energy' }, { kind: 'performance', text: 'Mass', quantity: { value: 0.03, unit: 'kg' }, basis: 'estimate' }] },
      { name: 'Rugged two-layer case', summary: 'Polycarbonate outer shell over a silicone inner sleeve.', description: 'Raised lip around screen and camera.', parts: ['Outer shell', 'Inner sleeve'] },
      { name: 'Folio case', summary: 'Book-style cover protecting the screen when closed.' },
    ],
    tradeStudy: {
      criteria: [{ name: 'Drop protection', weight: 3 }, { name: 'Added mass', weight: 1, direction: 'minimize', unit: 'g' }],
      scores: [
        { alternative: 'TPU bumper', criterion: 'Drop protection', qualitative: 3, rationale: 'Corner cushioning only' },
        { alternative: 'Rugged two-layer case', criterion: 'Drop protection', qualitative: 5, rationale: 'Two layers and raised lips' },
        { alternative: 'Folio case', criterion: 'Drop protection', qualitative: 2, rationale: 'Thin shell' },
        { alternative: 'TPU bumper', criterion: 'Added mass', value: 30, rationale: 'Typical TPU case', basis: 'estimate' },
        { alternative: 2, criterion: 1, low: 50, high: 70, rationale: 'Cover adds mass' },
      ],
    },
  }

  it('records the model’s alternatives and trade study exactly as written, with no library content', async () => {
    const { calls, concepts } = recording()
    const result = (await action('conceptualize.develop_alternatives').run(modelArgs, context({ concepts }))) as ServiceProposal
    expect(calls).toEqual([])
    const text = JSON.stringify(result.preview)
    for (const n of ['TPU bumper', 'Rugged two-layer case', 'Folio case', 'Corner cushioning only', 'Drop protection (weight 3']) expect(text).toContain(n)
    // Nothing from the scripted principle library or its actuator questions.
    expect(text).not.toMatch(/lead screw|ball screw|gear|belt|pneumatic|stroke|duty cycle|scripted/i)
    expect(result.preview.filter((p) => p.label.startsWith('Alternative')).map((p) => p.basis)).toEqual(['ai-hypothesis', 'ai-hypothesis', 'ai-hypothesis'])
    expect(result.preview.find((p) => p.label === 'Objective (your words)')).toMatchObject({ proposed: S24, basis: 'user-statement' })
    expect(result.preview.find((p) => p.label === 'Score: TPU bumper / Added mass')).toMatchObject({ proposed: '30 g: Typical TPU case', basis: 'estimate' })
    await result.apply({ conversationId: 'C-9', proposalId: 'CP-9', messageId: 'M9' })
    const body = calls[0].body as Record<string, any>
    expect(calls[0]).toMatchObject({ method: 'POST', url: 'http://api.test/api/concepts/v1/projects/PRJ-ACT100/explorations' })
    expect(body.parentId).toBeUndefined()
    expect(body.parent).toEqual({ name: 'Protective cover for Samsung Galaxy S24+', description: S24, statements: [{ kind: 'constraint', text: 'Adds at most 2 mm to each side', quantity: { max: 2, unit: 'mm' }, basis: 'ai-hypothesis' }] })
    expect(body.alternatives.map((a: { name: string }) => a.name)).toEqual(['TPU bumper', 'Rugged two-layer case', 'Folio case'])
    expect(body.alternatives[0].statements).toEqual([{ kind: 'principle', text: 'Elastic deformation absorbs drop energy', basis: 'ai-hypothesis' }, { kind: 'performance', text: 'Mass', quantity: { value: 0.03, unit: 'kg' }, basis: 'estimate' }])
    expect(body.alternatives[1]).toMatchObject({ description: 'Raised lip around screen and camera.', children: [{ name: 'Outer shell' }, { name: 'Inner sleeve' }] })
    expect(body.alternatives[0].evidence).toBeUndefined()
    expect(body.tradeStudy.criteria).toEqual([
      { name: 'Drop protection', category: 'custom', weight: 3, direction: 'maximize', scale: 'qualitative' },
      { name: 'Added mass', category: 'custom', weight: 1, direction: 'minimize', scale: 'quantity', unit: 'g' },
    ])
    expect(body.tradeStudy.scores).toContainEqual({ alternative: 2, criterion: 1, low: 50, high: 70, unit: 'g', rationale: 'Cover adds mass', basis: 'ai-hypothesis' })
    expect(body.tradeStudy.scores).toContainEqual({ alternative: 1, criterion: 0, qualitative: 5, rationale: 'Two layers and raised lips', basis: 'ai-hypothesis' })
    expect(body.generator).not.toMatch(/scripted/)
  })

  it('refuses without alternatives instead of inventing any', async () => {
    const { calls, concepts } = recording()
    await expect(action('conceptualize.develop_alternatives').run({ text: S24 }, context({ concepts }))).rejects.toThrow(/give the alternatives you propose: name and summary each/i)
    await expect(action('conceptualize.develop_alternatives').run({ text: S24, alternatives: [] }, context({ concepts }))).rejects.toThrow(/name and summary each/i)
    await expect(action('conceptualize.develop_alternatives').run({ text: S24, alternatives: [{ name: 'TPU bumper' }] }, context({ concepts }))).rejects.toThrow(/summary/)
    await expect(action('conceptualize.develop_alternatives').run({ ...modelArgs, alternatives: [{ name: 'A', summary: 'a', statements: [{ kind: 'principle', text: 'x', basis: 'user-assertion' }] }], tradeStudy: undefined }, context({ concepts }))).rejects.toThrow(/basis/)
    await expect(action('conceptualize.develop_alternatives').run({ ...modelArgs, tradeStudy: { criteria: [{ name: 'Drop protection', weight: 1 }], scores: [{ alternative: 'Unknown', criterion: 0, qualitative: 3, rationale: 'x' }] } }, context({ concepts }))).rejects.toThrow(/must name one of/)
    expect(calls).toEqual([])
    expect(action('conceptualize.develop_alternatives').description).toMatch(/You must supply `alternatives`/)
  })

  it('create records the caller’s name and statements, and refuses without a name; blank optional strings mean absent', async () => {
    const { calls, concepts } = recording()
    await expect(action('conceptualize.create').run({ text: S24 }, context({ concepts }))).rejects.toThrow(/name/)
    const result = (await action('conceptualize.create').run({ text: S24, name: 'S24+ cover', summary: '', parentId: '', statements: [{ kind: 'function', text: 'Protect the phone from drops' }] }, context({ concepts }))) as ServiceProposal
    await result.apply({ conversationId: 'C-9', proposalId: 'CP-10', messageId: 'M10' })
    expect(calls[0].body).toEqual({ name: 'S24+ cover', description: S24, statements: [{ kind: 'function', text: 'Protect the phone from drops', basis: 'ai-hypothesis' }], maturity: 'idea', reason: 'Assistant proposal CP-10' })
  })
})

describe('design-knowledge operations (Design Reasoning P1)', () => {
  const plan = (t: string) => conceptsDemo(t, { selectionIds: [] })?.calls[0]
  it('maps example prompts to registered design operations', () => {
    expect(plan('Convert CON-005 to a function')).toEqual({ name: 'conceptualize.convert_to_function', arguments: { conceptId: 'CON-005' } })
    expect(plan('Create a function "Reject heat" performed by CON-006 and CON-007')).toEqual({ name: 'conceptualize.create_function', arguments: { name: 'Reject heat', performedBy: ['CON-006', 'CON-007'] } })
    expect(plan('Promote the constraints of CON-001')?.name).toBe('conceptualize.promote_constraint')
    expect(plan('Record an assumption for CON-001: rod ends are pinned')).toEqual({ name: 'conceptualize.record_assumption', arguments: { statement: 'rod ends are pinned', subjectId: 'CON-001' } })
    expect(plan('CON-006 performs FN-001')).toEqual({ name: 'conceptualize.create_link', arguments: { type: 'performs', from: 'CON-006', to: 'FN-001' } })
    expect(plan('Why was DEC-001 made?')).toEqual({ name: 'conceptualize.rationale', arguments: { decisionId: 'DEC-001' } })
    expect(plan('Which concepts perform FN-001?')?.name).toBe('conceptualize.traverse')
    expect(plan('Search functions for linear force')).toEqual({ name: 'conceptualize.search_design', arguments: { text: 'linear force', types: ['function'] } })
    const names = new Set(conceptsAssistant.actions.map((a) => a.name))
    for (const p of ['Convert CON-005 to a function', 'Create a function Reject heat', 'Promote constraints of CON-001', 'Record an assumption: dry air', 'CON-006 performs FN-001', 'Why DEC-001', 'What depends on ASM-001', 'Search design for envelope']) {
      for (const c of conceptsDemo(p, { selectionIds: [] })?.calls ?? []) expect(names.has(c.name), p).toBe(true)
    }
  })

  it('applies a Function as one atomic batch with placeholders and assistant provenance', async () => {
    const calls: { method: string; url: string; headers: Record<string, string>; body: any }[] = []
    const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      calls.push({ method: init.method ?? 'GET', url, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined })
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
      if (url.includes('/concepts?')) return json({ items: [{ id: 'c6', key: 'CON-006', name: 'Ball screw' }], total: 1, limit: 20, offset: 0 })
      if (url.endsWith('/concepts/c6')) return json({ id: 'c6', key: 'CON-006', name: 'Ball screw', revision: 1, statements: [] })
      if (url.endsWith('/batch')) return json({ results: [{ index: 0, op: 'createFunction', as: '$fn', id: 'f1', key: 'FN-009', revision: 1 }, { index: 1, op: 'createLink', as: '$l1', id: 'l1', key: null, revision: 1 }], ids: { $fn: 'f1', $l1: 'l1' } })
      return json({})
    }) as typeof globalThis.fetch
    const concepts = createHttpConceptsService({ baseUrl: 'http://api.test/api/concepts/v1', fetch })
    const result = (await action('conceptualize.create_function').run({ name: 'Reject heat', performedBy: ['CON-006'] }, context({ concepts }))) as ServiceProposal
    expect(result.kind).toBe('service-proposal')
    expect(result.preview.every((p) => p.basis === 'ai-hypothesis')).toBe(true)
    const before = calls.length
    const applied = await result.apply({ conversationId: 'C-2', proposalId: 'CP-9', messageId: 'M1' })
    expect(applied.createdIds).toEqual(['f1', 'l1'])
    const batch = calls.slice(before).find((c) => c.url.endsWith('/batch'))!
    expect(batch.headers).toMatchObject({ 'X-Source-Kind': 'assistant', 'X-Proposal-Id': 'CP-9', 'Idempotency-Key': 'C-2:CP-9:function' })
    expect(batch.body.items).toEqual([
      { op: 'createFunction', as: '$fn', body: { name: 'Reject heat', reason: 'Assistant proposal CP-9' } },
      { op: 'createLink', as: '$l1', body: { type: 'performs', from: { module: 'conceptualize', type: 'concept', id: 'c6' }, to: { module: 'conceptualize', type: 'function', id: '$fn' } } },
    ])
  })
})

describe('implementation links to the real modules (C3, C5)', () => {
  const fetchFor = (calls: { url: string; body: any }[]) =>
    (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : undefined })
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
      if (url.includes('/concepts?')) return json({ items: [{ id: 'c1', key: 'CON-001', name: 'Drive' }], total: 1, limit: 20, offset: 0 })
      if (url.endsWith('/concepts/c1')) return json({ id: 'c1', key: 'CON-001', name: 'Drive', revision: 1, statements: [] })
      if (url.endsWith('/implementations')) return json({ id: 'i1', key: 'IMP-009' }, 201)
      return json({})
    }) as typeof globalThis.fetch
  const ctxFor = (projectId: string, concepts: ReturnType<typeof createHttpConceptsService>) => {
    const c = context({ concepts })
    return { ...c, captured: { ...c.captured, projectId } }
  }

  it('checks a System Model element through an injected port and pins its revision', async () => {
    const off = registerReferencePort({ name: 'Fake SysML adapter', adapter: true, supports: (r) => r.module === 'sysml' && r.id.includes('/'), resolve: async () => ({ state: 'found', label: 'Spindle (Drill rig)', latest: 7 }) })
    try {
      const calls: { url: string; body: any }[] = []
      const concepts = createHttpConceptsService({ baseUrl: 'http://api.test/api/concepts/v1', fetch: fetchFor(calls) })
      const p = (await action('conceptualize.link_artifact').run({ conceptId: 'CON-001', artifactId: 'p1/e1' }, ctxFor('PRJ-NEW', concepts))) as ServiceProposal
      expect(p.preview[1].proposed).toBe('sysml (sysml-model-element):p1/e1 pinned at revision 7')
      expect(p.assumptions?.join(' ')).toMatch(/Fake SysML adapter/)
      await p.apply({ conversationId: 'C-3', proposalId: 'CP-1', messageId: 'M1' })
      const body = calls.find((c) => c.url.endsWith('/implementations'))!.body
      expect(body.artifacts).toEqual([{ module: 'sysml', id: 'p1/e1', revision: 7, kind: 'sysml-model-element', label: 'Spindle (Drill rig)' }])
    } finally {
      off()
    }
  })

  it('keeps legacy twin objects to the PRJ-ACT100 demo', async () => {
    const concepts = createHttpConceptsService({ baseUrl: 'http://api.test/api/concepts/v1', fetch: fetchFor([]) })
    await expect(action('conceptualize.link_artifact').run({ conceptId: 'CON-001', artifactId: 'CAD-120' }, ctxFor('PRJ-NEW', concepts))).rejects.toThrow(/PRJ-ACT100 demo/)
    expect(conceptsDemo('Link CON-001 to p1/e1', { selectionIds: [] })?.calls[0]).toEqual({ name: 'conceptualize.link_artifact', arguments: { conceptId: 'CON-001', artifactId: 'p1/e1' } })
  })
})

describe('D1-CON operations (headless, service proposals)', () => {
  const CST = '7e57c0de-0000-4000-8000-0000000c5701'
  const constraint = { id: CST, key: 'CST-004', projectId: 'PRJ-ACT100', revision: 2, kind: 'dimensional', statement: 'Wall at least 2 mm', bound: { symbol: 't', operator: '>=', quantity: { value: 2, unit: 'mm' } }, strength: 'hard', source: { kind: 'stated', basis: 'user-assertion' }, basis: 'user-assertion', status: 'active', subjects: [] }
  const make = () => {
    const calls: { method: string; url: string; headers: Record<string, string>; body: any }[] = []
    const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      calls.push({ method: init.method ?? 'GET', url, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined })
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
      if (url.includes('/search?')) return json({ items: [{ ref: { module: 'conceptualize', type: url.includes('CON-') ? 'concept' : 'constraint', id: url.includes('CON-') ? 'c1' : CST }, key: url.includes('CON-') ? 'CON-001' : 'CST-004', label: 'x', status: 'active', rank: 1, snippet: '' }], total: 1 })
      if (url.endsWith(`/constraints/${CST}`) && (init.method ?? 'GET') === 'GET') return json(constraint)
      if (url.endsWith(`/constraints/${CST}`)) return json({ ...constraint, revision: 3, bound: init.body ? JSON.parse(String(init.body)).bound : constraint.bound })
      if (url.endsWith('/evidence')) return json({ id: 'e1', key: 'EVD-031', results: [{ name: 'Minimum wall', status: 'violated' }] }, 201)
      if (url.includes('/decisions?') || url.endsWith('/decisions')) return json([{ id: 'd1', key: 'DEC-002', title: 'Pocket layout', status: 'recorded', validity: 'under-review', reviewFlags: [{ at: '2026-10-15T00:00:00Z', by: 'eli', reason: 'Wall changed', impactReportId: 'IR-3' }], recordVersion: 2 }, { id: 'd2', key: 'DEC-003', title: 'Material', status: 'recorded', validity: 'valid', reviewFlags: [], recordVersion: 1 }])
      if (url.endsWith('/decisions/d1/rationale')) return json({ stale: ['CST-004 pinned at revision 1, now 2'] })
      return json({})
    }) as typeof globalThis.fetch
    return { calls, concepts: createHttpConceptsService({ baseUrl: 'http://api.test/api/concepts/v1', fetch }) }
  }

  it('revise_constraint proposes a new revision with the reason and applies it with expectedRevision', async () => {
    const { calls, concepts } = make()
    const p = (await action('conceptualize.revise_constraint').run({ constraintId: 'CST-004', value: 2.5, reason: 'Thin walls cracked in the print' }, context({ concepts }))) as ServiceProposal
    expect(p.preview.find((i) => i.label === 'Bound')).toMatchObject({ current: 't >= 2 mm', proposed: 't >= 2.5 mm', basis: 'ai-hypothesis' })
    const before = calls.length
    await p.apply({ conversationId: 'C-9', proposalId: 'CP-2', messageId: 'M1' })
    const patch = calls.slice(before).find((c) => c.method === 'PATCH')!
    expect(patch.body).toMatchObject({ expectedRevision: 2, reason: 'Thin walls cracked in the print', bound: { operator: '>=', quantity: { value: 2.5, unit: 'mm' }, symbol: 't' } })
    expect(patch.headers).toMatchObject({ 'X-Source-Kind': 'assistant', 'X-Proposal-Id': 'CP-2' })
    expect(conceptsDemo('Revise CST-004 to 2.5 mm because thin walls cracked', { selectionIds: [] })?.calls[0]).toEqual({ name: 'conceptualize.revise_constraint', arguments: { constraintId: 'CST-004', value: 2.5, unit: 'mm', reason: 'thin walls cracked' } })
  })

  it('record_evidence carries the pinned source, tool, point results and pinned constraints; basis estimate', async () => {
    const { calls, concepts } = make()
    const p = (await action('conceptualize.record_evidence').run(
      { title: 'CAD check', subjects: ['CON-001'], source: { module: 'cad', kind: 'cad-modeler-entity', id: 'doc/doc', revision: 4 }, tool: { name: 'CAD Modeler check', version: '1.2.0' }, results: [{ name: 'Minimum wall', value: 1.8, unit: 'mm', constraintId: 'CST-004' }] },
      context({ concepts }),
    )) as ServiceProposal
    expect(p.preview.map((i) => i.proposed).join(' | ')).toContain('1.8 mm (point) vs CST-004 t >= 2 mm (rev 2)')
    expect(p.preview.every((i) => i.basis !== 'evidence')).toBe(true)
    const before = calls.length
    const applied = await p.apply({ conversationId: 'C-9', proposalId: 'CP-3', messageId: 'M1' })
    expect(applied.summary).toContain('Minimum wall: violated')
    const body = calls.slice(before).find((c) => c.url.endsWith('/evidence'))!.body
    expect(body).toMatchObject({ basis: 'estimate', source: { module: 'cad', revision: 4 }, tool: { name: 'CAD Modeler check', version: '1.2.0' }, results: [{ name: 'Minimum wall', value: 1.8, unit: 'mm', qualification: { kind: 'point' }, constraint: { type: 'constraint', id: CST, revision: 2 } }] })
    expect(body.subjects).toEqual([{ module: 'conceptualize', type: 'concept', id: 'c1' }, { module: 'conceptualize', type: 'constraint', id: CST }])
    expect(action('conceptualize.record_evidence').parameters).toMatchObject({ properties: { basis: { enum: ['estimate', 'assessment', 'assumption', 'ai-hypothesis'] } } })
  })

  it('review_flags reads decisions under review with open flags and stale pins', async () => {
    const { concepts } = make()
    const r = (await action('conceptualize.review_flags').run({}, context({ concepts }))) as { kind: string; data: { decisions: unknown[] } }
    expect(r.data.decisions).toEqual([{ key: 'DEC-002', title: 'Pocket layout', validity: 'under-review', openFlags: [{ reason: 'Wall changed', by: 'eli', at: '2026-10-15T00:00:00Z', impactReportId: 'IR-3' }], stale: ['CST-004 pinned at revision 1, now 2'] }])
    expect(conceptsDemo('Which decisions need review?', { selectionIds: [] })?.calls[0].name).toBe('conceptualize.review_flags')
  })
})

describe('calculation operations (CR-C8, headless)', () => {
  it('record_calculation evaluates, previews qualifications and limits, and records with the calculation', async () => {
    const calls: { method: string; url: string; body: any }[] = []
    const M = '7e57c0de-0000-4000-8000-0000000ca1c0'
    const manifest = { model: { id: M, revision: 2 } }
    const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      calls.push({ method: init.method ?? 'GET', url, body: init.body ? JSON.parse(String(init.body)) : undefined })
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
      if (url.includes('/calculation-models?')) return json([{ id: M, key: 'CALC-001', name: 'Rod buckling', revision: 2, validationStatus: 'unvalidated' }])
      if (url.endsWith(`/calculation-models/${M}/evaluate`))
        return json({ model: { id: M, key: 'CALC-001', revision: 2 }, inputs: {}, manifest, basis: 'estimate', warnings: [], qualifications: { outputs: [{ symbol: 'P_cr', unit: 'kN', value: 110.4, range: { kind: 'point' } }], checks: [{ relationId: 'c1', text: 'P_cr >= n * F', unit: 'kN', margin: 86.4, nominalSatisfied: true, status: 'satisfied', statusBasis: 'point', marginRange: { kind: 'point' } }], validity: { satisfied: true, violated: [], uncertain: [], over: 'point' }, limits: { establishesModelValidity: false, establishesRequirementSatisfaction: false, modelValidationStatus: 'unvalidated', modelBasis: 'ai-hypothesis' } } })
      if (url.includes('/search?')) return json({ items: [{ ref: { module: 'conceptualize', type: 'concept', id: 'c1' }, key: 'CON-001', label: 'x', status: 'idea', rank: 1, snippet: '' }], total: 1 })
      if (url.endsWith('/evidence')) return json({ id: 'e9', key: 'EVD-040', basis: 'estimate' }, 201)
      return json({})
    }) as typeof globalThis.fetch
    const concepts = createHttpConceptsService({ baseUrl: 'http://api.test/api/concepts/v1', fetch })
    const p = (await action('conceptualize.record_calculation').run({ modelId: 'CALC-001', subjects: ['CON-001'] }, context({ concepts }))) as ServiceProposal
    const text = p.preview.map((i) => `${i.label}: ${i.proposed}`).join(' | ')
    expect(text).toContain('110.4 kN (point value)')
    expect(text).toContain('P_cr >= n * F: satisfied at the nominal point')
    expect(p.explanation).toContain('does not establish that the model is valid')
    const before = calls.length
    await p.apply({ conversationId: 'C-5', proposalId: 'CP-7', messageId: 'M1' })
    const body = calls.slice(before).find((c) => c.url.endsWith('/evidence'))!.body
    expect(body).toMatchObject({ basis: 'estimate', kind: 'calculation', calculation: { modelId: M, modelRevision: 2, manifest }, subjects: [{ type: 'concept', id: 'c1' }] })
  })
})

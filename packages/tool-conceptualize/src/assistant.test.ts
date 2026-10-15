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
    expect(conceptsDemo(OWNER, { selectionIds: [] })?.calls).toEqual([{ name: 'conceptualize.develop_alternatives', arguments: { text: OWNER } }])
    expect(conceptsDemo('Create a concept: a bracket that holds a camera', { selectionIds: [] })?.calls[0]).toEqual({ name: 'conceptualize.create', arguments: { text: 'a bracket that holds a camera' } })
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
    const result = (await action('conceptualize.develop_alternatives').run({ text: OWNER }, context({ concepts }))) as ServiceProposal
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
    await expect(action('conceptualize.create').run({ text: 'A gripper' }, context({ concepts: createDemoConceptsService() }))).rejects.toThrow(/API mode/)
    await expect(action('conceptualize.create').run({ text: 'A gripper' }, context({}))).rejects.toThrow(/not available/)
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

  it('checks a SysML Modeler element through an injected port and pins its revision', async () => {
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

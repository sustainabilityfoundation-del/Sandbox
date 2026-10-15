import { afterEach, describe, expect, it, vi } from 'vitest'
import { clientDecision, usePolicyView, type PolicyView } from './aiPolicy'
import { RemoteAssistantService } from './RemoteAssistantService'
import { DRILL_ALTERNATIVES, DRILL_BIT_HOLDER_NEED, drillBitHolderDemo } from './demos/drillBitHolder'
import type { AssistantRequest, ToolCallResult } from './types'

afterEach(() => {
  vi.unstubAllGlobals()
  usePolicyView.setState({ view: null })
})

const view = (modules: Record<string, 'off' | 'read' | 'propose'>, operations: Record<string, boolean> = {}): PolicyView => ({
  policy: { modules, operations: { read: true, search: true, calculate: true, propose: true, export: true, 'external-generation': false, ...operations }, sharing: { selection: true, openTools: true, requirementText: true, elementDetails: true, historyLength: 6 }, limits: { toolCalls: 6, outputTokens: 2000, timeoutSeconds: 45 }, storePrompts: false },
  modules: [
    { id: 'workspace', label: 'Shared model and navigation', description: '', prefixes: [], names: ['read_object', 'propose_changes'], entitlement: null, entitled: true },
    { id: 'conceptualize', label: 'Conceptualize', description: '', prefixes: ['conceptualize.'], names: [], entitlement: 'tool:conceptualize', entitled: true },
  ],
  operationClasses: [{ id: 'propose', label: 'Propose changes', description: '' }],
  catalogue: { read_object: 'read', propose_changes: 'propose', 'conceptualize.read': 'read', 'conceptualize.create': 'propose', 'conceptualize.request_realization': 'external-generation' },
})

describe('AI access policy in the browser (UX mirror of the server)', () => {
  it('allows everything until the server policy is known, then mirrors it', () => {
    expect(clientDecision('conceptualize.create').ok).toBe(true)
    usePolicyView.setState({ view: view({ workspace: 'propose', conceptualize: 'read' }) })
    expect(clientDecision('conceptualize.read').ok).toBe(true)
    expect(clientDecision('conceptualize.create')).toMatchObject({ ok: false, reason: expect.stringMatching(/read only/) })
    expect(clientDecision('conceptualize.request_realization').ok).toBe(false)
    expect(clientDecision('shell.exec').ok).toBe(false)
    usePolicyView.setState({ view: view({ workspace: 'off', conceptualize: 'propose' }) })
    expect(clientDecision('read_object')).toMatchObject({ ok: false, reason: expect.stringMatching(/off/) })
  })
})

describe('connected assistant service', () => {
  it('posts to the backend with the development identity and explains backend errors', async () => {
    const seen: RequestInit[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seen.push(init)
      return new Response(JSON.stringify({ error: { code: 'provider-rate-limit', message: 'OpenAI is rate-limiting requests. Wait a moment and try again.' } }), { status: 429 })
    })
    const service = new RemoteAssistantService('/api/assistant/v1/respond', { headers: () => ({ 'X-Dev-User': 'eli' }), info: { name: 'ChatGPT', kind: 'remote', description: '', model: 'gpt-6.1-sol' } })
    await expect(service.respond({ history: [], turn: { text: 'hi', context: {} as never, toolResults: [] }, tools: [] }, new AbortController().signal)).rejects.toMatchObject({ code: 'provider-rate-limit', message: expect.stringMatching(/rate-limiting/) })
    expect((seen[0].headers as Record<string, string>)['X-Dev-User']).toBe('eli')
    expect(JSON.stringify(seen[0])).not.toMatch(/sk-|Bearer/)
  })
})

describe('drill bit holder demo plan (optional demonstration)', () => {
  const tools = ['conceptualize.create', 'conceptualize.search', 'conceptualize.decompose', 'conceptualize.propose_requirement'].map((name) => ({ name, description: '', parameters: { type: 'object' as const, properties: {} } }))
  const req = (text: string, toolResults: ToolCallResult[] = [], offered = tools): AssistantRequest => ({ history: [], turn: { text, context: {} as never, toolResults }, tools: offered })
  const ok = (name: string, data: unknown): ToolCallResult => ({ callId: 'c', name, ok: true, data })

  it('creates the Concept from the verbatim need, labelled as a demo, with Milwaukee only as compatibility', () => {
    const first = drillBitHolderDemo(req('Start the drill bit holder example'))!
    expect(first).toMatchObject({ type: 'tool_calls', calls: [{ name: 'conceptualize.create', arguments: { text: DRILL_BIT_HOLDER_NEED } }] })
    expect(DRILL_BIT_HOLDER_NEED).toMatch(/Milwaukee-compatible/)
    expect(DRILL_BIT_HOLDER_NEED).toMatch(/Assume the drill body dimensions are not measured/)
    const done = drillBitHolderDemo(req('Start the drill bit holder example', [ok('conceptualize.create', { proposalId: 'CP-1' })]))!
    expect(done.type === 'final' && done.text).toMatch(/Scripted demo plan.*not affiliated with or endorsed by Milwaukee Tool/is)
    expect(done.type === 'final' && done.text).toMatch(/Apply/)
  })

  it('finds the applied Concept, then decomposes, adds three alternatives with a trade study, and drafts requirements', () => {
    const found = ok('conceptualize.search', { concepts: [{ key: 'CON-007', name: 'Drill bit holder for a Milwaukee-compatible cordless drill/driver' }] })
    expect(drillBitHolderDemo(req('Decompose the drill bit holder'))).toMatchObject({ calls: [{ name: 'conceptualize.search' }] })
    expect(drillBitHolderDemo(req('Decompose the drill bit holder', [found]))).toMatchObject({ calls: [{ name: 'conceptualize.decompose', arguments: { conceptId: 'CON-007' } }] })
    let results = [found]
    for (let i = 0; i < 3; i++) {
      const next = drillBitHolderDemo(req('Propose alternatives for the drill bit holder', results))!
      expect(next).toMatchObject({ calls: [{ name: 'conceptualize.create', arguments: { text: DRILL_ALTERNATIVES[i], parentId: 'CON-007' } }] })
      results = [...results, ok('conceptualize.create', { proposalId: `CP-${i + 2}` })]
    }
    const study = drillBitHolderDemo(req('Propose alternatives for the drill bit holder', results))!
    expect(study.type === 'final' && study.text).toMatch(/Weighted total\*\* \| \*\*31\*\* \| \*\*27\*\* \| \*\*31\*\*/)
    expect(drillBitHolderDemo(req('Draft requirements for the drill bit holder', [found]))).toMatchObject({ calls: [{ name: 'conceptualize.propose_requirement', arguments: { conceptId: 'CON-007' } }] })
  })

  it('explains instead of acting when the operations are not offered, and ignores unrelated prompts', () => {
    const r = drillBitHolderDemo(req('Start the drill bit holder example', [], []))!
    expect(r.type === 'final' && r.text).toMatch(/do not offer/)
    expect(drillBitHolderDemo(req('Change the rod diameter to 28 mm'))).toBeNull()
  })
})

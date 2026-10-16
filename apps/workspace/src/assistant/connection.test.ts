import { afterEach, describe, expect, it, vi } from 'vitest'
import { clientDecision, usePolicyView, type PolicyView } from './aiPolicy'
import { RemoteAssistantService } from './RemoteAssistantService'

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

describe('refusal wording', () => {
  it('names the AI access settings, not the subscription, when the policy removed an operation', async () => {
    await import('../platform/tools')
    const { DemoAssistantService } = await import('./DemoAssistantService')
    usePolicyView.setState({ view: view({ workspace: 'propose', conceptualize: 'off' }) })
    const service = new DemoAssistantService({ thinkingMs: 0 })
    const r = await service.respond({ history: [], turn: { text: 'Create a concept for a compact gripper that holds 2 kg', context: { selection: [] } as never, toolResults: [] }, tools: [] }, new AbortController().signal)
    expect(r.type === 'final' && r.text).toMatch(/AI access to Conceptualize is off/)
    expect(r.type === 'final' && r.text).not.toMatch(/subscription/)
  })
})

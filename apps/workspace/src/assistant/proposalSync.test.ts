import { DemoRepository, PROJECT_ID, type StorageLike } from '@ews/model-service'
import type { DeclarativeProposal } from '@ews/platform-sdk'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { getTools } from '../platform/registry'
import { registerPlatformModule, resetPlatformModules } from '../platform/platformModules'
import { useWorkspaceStore } from '../platform/store'
import '../platform/tools'
import { useConversation } from './conversation'
import type { AssistantRequest, AssistantResponse, AssistantService } from './types'

/**
 * Browser side of persisted declarative proposals (C9): a headless module's action returns a DeclarativeProposal;
 * the conversation stores it in the assistant service and Apply asks the service to apply it (mocked here; the
 * service itself is tested on a real database in services/assistant/test/proposals.api.test.ts).
 */

function memoryStorage(): StorageLike {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

const declarative: DeclarativeProposal = {
  kind: 'declarative-proposal',
  module: 'conceptualize',
  title: 'Create a Concept',
  explanation: 'test',
  preview: [{ label: 'New Concept', proposed: 'Bit holder', basis: 'ai-hypothesis' }],
  operations: [{ module: 'conceptualize', operationId: 'createConcept', method: 'POST', path: `/projects/${PROJECT_ID}/concepts`, body: { name: 'Bit holder' } }],
}

/** A scripted model: one call to the module action, then a final answer. */
class Scripted implements AssistantService {
  readonly info = { name: 'Scripted', kind: 'remote' as const, description: 'test' }
  constructor(private readonly refused = false) {}
  async respond(request: AssistantRequest): Promise<AssistantResponse> {
    if (this.refused) return { type: 'final', text: 'ok', meta: { refused: [{ name: 'requirements.update', reason: 'AI access to Requirements is off.' }] } }
    if (!request.turn.toolResults.length) return { type: 'tool_calls', calls: [{ id: 'c1', name: 'sync-test.create', arguments: {} }] }
    return { type: 'final', text: 'Prepared.' }
  }
}

const calls: { url: string; method: string; body: unknown }[] = []
let applyResponse: { status: number; body: unknown } = { status: 200, body: {} }

beforeAll(async () => {
  await useWorkspaceStore.getState().initialize({
    repository: new DemoRepository({ storage: memoryStorage(), latencyMs: [0, 0] }),
    projectId: PROJECT_ID,
    tools: getTools().map((t) => ({ id: t.id, initialViewState: t.initialViewState })),
    defaultOpenToolIds: [],
  })
  registerPlatformModule({ id: 'sync-test', name: 'Sync test', assistant: { actions: [{ name: 'sync-test.create', label: 'Create', effect: 'propose', description: 'd', parameters: { type: 'object', properties: {} }, run: () => declarative }] } })
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method: init.method ?? 'GET', body })
    if (url.endsWith('/proposals') && init.method === 'POST') return new Response(JSON.stringify({ proposal: { id: '00000000-0000-4000-8000-000000000001', version: 1, kind: body.kind, key: body.key } }), { status: 201 })
    if (url.includes('/apply')) return new Response(JSON.stringify(applyResponse.body), { status: applyResponse.status })
    return new Response('{}', { status: 200 })
  })
})
afterAll(() => {
  resetPlatformModules()
  vi.unstubAllGlobals()
})
afterEach(() => {
  calls.length = 0
})

async function prepare() {
  const chat = useConversation.getState()
  chat.clear()
  chat.configure(new Scripted())
  await chat.send('make a concept')
  await new Promise((r) => setTimeout(r, 20)) // let the store request finish
  const id = Object.keys(useConversation.getState().proposals).at(-1)!
  return id
}

describe('declarative proposals in the conversation', () => {
  it('stores the proposal as data with its operations and project, then applies it through the assistant service', async () => {
    const id = await prepare()
    const stored = calls.find((c) => c.url.endsWith('/api/assistant/v1/proposals'))!
    expect(stored.body).toMatchObject({ kind: 'declarative', module: 'conceptualize', projectId: PROJECT_ID, key: id, operations: declarative.operations })
    expect(useConversation.getState().proposals[id]).toMatchObject({ status: 'pending', projectId: PROJECT_ID, server: { kind: 'declarative', version: 1 } })
    applyResponse = { status: 200, body: { proposal: { createdIds: ['c-1'], results: [] }, alreadyApplied: false } }
    await useConversation.getState().applyProposal(id)
    expect(calls.find((c) => c.url.includes('/apply'))!.url).toContain(`apply?projectId=${PROJECT_ID}`)
    expect(useConversation.getState().proposals[id]).toMatchObject({ status: 'applied', createdIds: ['c-1'] })
  })

  it('shows a stale proposal as a conflict with the explanation and offers no re-apply', async () => {
    const id = await prepare()
    applyResponse = { status: 409, body: { error: { code: 'stale', message: 'Not applied: CON-001 Bit holder changed since the preview: revision 1 → 2. Nothing was changed.' } } }
    await useConversation.getState().applyProposal(id)
    expect(useConversation.getState().proposals[id]).toMatchObject({ status: 'conflict', message: expect.stringContaining('revision 1 → 2') })
  })

  it('C13: refuses to apply a proposal of another project in the browser too', async () => {
    const id = await prepare()
    useConversation.setState((s) => ({ proposals: { ...s.proposals, [id]: { ...s.proposals[id], projectId: 'PRJ-OTHER' } } }))
    await useConversation.getState().applyProposal(id)
    expect(calls.some((c) => c.url.includes('/apply'))).toBe(false)
    expect(useConversation.getState().proposals[id].message).toMatch(/belongs to project PRJ-OTHER/)
  })

  it('shows refused operations and sends them to the model on the next turn', async () => {
    const chat = useConversation.getState()
    chat.clear()
    chat.configure(new Scripted(true))
    await chat.send('change a requirement')
    const event = useConversation.getState().messages.find((m) => m.role === 'event' && m.event === 'refused')
    expect(event && event.role === 'event' && event.text).toMatch(/refused requirements.update/)
    let seen: AssistantRequest | undefined
    chat.configure({ info: { name: 'x', kind: 'remote', description: '' }, respond: async (r) => ((seen = r), { type: 'final', text: 'ok' }) })
    await chat.send('next')
    expect(seen!.history.some((h) => h.role === 'event' && h.event === 'refused')).toBe(true)
  })
})

describe('leftover proposals from earlier sessions', () => {
  it('reopens open proposals of the project and dismisses them all (rejected in the assistant service)', async () => {
    const outcomes: string[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      if (url.includes('/proposals?') && (init.method ?? 'GET') === 'GET')
        return new Response(JSON.stringify({ proposals: [1, 2].map((n) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, version: 1, key: `CP-${n}`, projectId: PROJECT_ID, conversationId: 'C-OLD1', messageId: 'M1', kind: 'declarative', module: 'conceptualize', title: `Old ${n}`, explanation: '', preview: [], assumptions: [], status: 'pending', message: null, createdIds: [], createdAt: '', updatedAt: '' })) }), { status: 200 })
      if (url.endsWith('/outcome')) outcomes.push(`${url.split('/').at(-2)}:${JSON.parse(String(init.body)).status}`)
      return new Response('{}', { status: 200 })
    })
    const chat = useConversation.getState()
    chat.clear()
    await chat.reopen()
    expect(useConversation.getState().reopenedIds).toHaveLength(2)
    useConversation.getState().dismissReopened()
    await new Promise((r) => setTimeout(r, 10))
    expect(useConversation.getState().reopenedIds).toEqual([])
    expect(outcomes.sort()).toEqual(['00000000-0000-4000-8000-000000000001:rejected', '00000000-0000-4000-8000-000000000002:rejected'])
  })
})

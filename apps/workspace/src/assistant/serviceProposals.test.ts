import { DemoRepository, PROJECT_ID, type StorageLike } from '@ews/model-service'
import type { ServiceProposal } from '@ews/platform-sdk'
import { defineTool } from '@ews/platform-sdk/react'
import { lazy } from 'react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useEntitlements } from '../platform/entitlements'
import { getTools, registerTool } from '../platform/registry'
import { useWorkspaceStore } from '../platform/store'
import '../platform/tools'
import { DemoAssistantService } from './DemoAssistantService'
import { useConversation } from './conversation'

/**
 * Service proposals (SDK 1.5): a service-backed tool's action prepares a change; the platform shows
 * the preview and calls the module API only on Apply. The demo planner hook drives it.
 */

function memoryStorage(): StorageLike {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

const store: { records: string[]; fail: boolean; provenance?: unknown } = { records: [], fail: false }

registerTool(
  defineTool({
    id: 'svc-demo',
    name: 'Service demo',
    description: 'Test tool backed by a service.',
    category: 'Design',
    icon: 'tools',
    version: '1.0.0',
    sdkVersion: '^1.5.0',
    entitlement: 'tool:requirements',
    supportedObjectTypes: [],
    view: lazy(async () => ({ default: () => null })),
    initialViewState: {},
    toolbar: () => [],
    assistant: {
      actions: [
        {
          name: 'svc-demo.create',
          label: 'Prepare record',
          description: 'Prepare a new record.',
          parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false },
          run: (args, ctx): ServiceProposal => ({
            kind: 'service-proposal',
            module: 'svc-demo',
            title: `Create ${String(args.name)}`,
            explanation: 'Requested in the conversation.',
            preview: [{ label: 'New record', proposed: String(args.name), basis: 'ai-hypothesis' }],
            assumptions: [`Context has services: ${ctx.services ? 'yes' : 'no'}`],
            apply: async (provenance) => {
              if (store.fail) throw new Error('Service unavailable.')
              store.provenance = provenance
              store.records.push(String(args.name))
              return { summary: `Created ${String(args.name)}`, createdIds: [`R-${store.records.length}`] }
            },
            undo: async () => {
              store.records.pop()
              return { summary: 'Removed the record (compensating change).' }
            },
          }),
        },
      ],
      demo: (text) => (/^make a record called (\w+)/i.test(text) ? { reply: 'I prepared the record.', calls: [{ name: 'svc-demo.create', arguments: { name: /called (\w+)/i.exec(text)![1] } }] } : null),
    },
  }),
)

const chat = () => useConversation.getState()

beforeAll(async () => {
  useEntitlements.getState().setPlan('all')
  await useWorkspaceStore.getState().initialize({
    repository: new DemoRepository({ storage: memoryStorage(), latencyMs: [0, 0] }),
    projectId: PROJECT_ID,
    tools: getTools().map((t) => ({ id: t.id, initialViewState: t.initialViewState })),
    defaultOpenToolIds: [],
  })
  chat().configure(new DemoAssistantService({ thinkingMs: 0 }))
})

beforeEach(() => {
  useEntitlements.getState().setPlan('all')
  store.records = []
  store.fail = false
})

async function prepare(name: string) {
  await chat().send(`Make a record called ${name}`)
  const proposal = Object.values(chat().proposals).find((p) => p.title === `Create ${name}`)
  expect(proposal).toBeDefined()
  return proposal!
}

describe('service proposals (SDK 1.5)', () => {
  it('previews without writing, then applies through the module with provenance and logs it', async () => {
    const proposal = await prepare('alpha')
    expect(proposal).toMatchObject({ status: 'pending', changes: [], service: { module: 'svc-demo', items: [{ label: 'New record', proposed: 'alpha', basis: 'ai-hypothesis' }], assumptions: ['Context has services: yes'] } })
    expect(store.records).toEqual([])
    await chat().applyProposal(proposal.id)
    expect(store.records).toEqual(['alpha'])
    expect(store.provenance).toMatchObject({ proposalId: proposal.id, conversationId: chat().conversationId })
    expect(chat().proposals[proposal.id]).toMatchObject({ status: 'applied', createdIds: ['R-1'] })
    await new Promise((r) => setTimeout(r, 20))
    expect(useWorkspaceStore.getState().activity.some((a) => a.message.includes(proposal.id) && a.source?.kind === 'conversation')).toBe(true)
  })

  it('keeps the preview when the module refuses, and undoes with a compensating change', async () => {
    store.fail = true
    const failing = await prepare('beta')
    await chat().applyProposal(failing.id)
    expect(chat().proposals[failing.id]).toMatchObject({ status: 'failed', message: expect.stringContaining('Service unavailable') })
    expect(store.records).toEqual([])
    store.fail = false
    await chat().applyProposal(failing.id)
    expect(store.records).toEqual(['beta'])
    await chat().undoProposal(failing.id)
    expect(store.records).toEqual([])
    expect(chat().proposals[failing.id].service?.undone).toBe(true)
  })

  it('rechecks the subscription before Apply', async () => {
    const proposal = await prepare('gamma')
    // Every demo plan includes the test tool's entitlement, so revoke it directly.
    const original = useEntitlements.getState().has
    useEntitlements.setState({ has: () => false })
    try {
      await chat().applyProposal(proposal.id)
      expect(chat().proposals[proposal.id].status).toBe('failed')
      expect(store.records).toEqual([])
    } finally {
      useEntitlements.setState({ has: original })
    }
  })
})

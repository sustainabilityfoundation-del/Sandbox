import { describe, expect, it } from 'vitest'
import { createFakeProvider } from './providers/fake'
import type { ProviderMessage, ProviderTool } from './providers/types'

const credential = { kind: 'api-key' as const, apiKey: 'fake-0123456789' }
const tool: ProviderTool = { name: 'requirements.update', description: 'Update a requirement', parameters: {} }
const user = (text: string): ProviderMessage => ({ type: 'message', role: 'user', text })
const respond = (messages: ProviderMessage[], tools: ProviderTool[]) =>
  createFakeProvider({ scriptsDir: '/nonexistent' }).respond({ credential, method: 'api-key', model: 'fake-small', instructions: '', messages, tools, signal: new AbortController().signal })

describe('fake provider: revise REQ-nnn rationale', () => {
  const text = 'Please revise req-003 rationale to "Needed for safety"'

  it('calls requirements.update with the requirement id and rationale', async () => {
    expect(await respond([user(text)], [tool])).toMatchObject({
      type: 'tool_calls',
      calls: [{ name: 'requirements.update', arguments: { requirementId: 'REQ-003', rationale: 'Needed for safety' } }],
    })
  })

  it('refuses when the operation is not offered', async () => {
    expect(await respond([user(text)], [])).toMatchObject({ type: 'final', text: expect.stringContaining('may not propose') })
  })

  it('reports the prepared proposal after the tool result', async () => {
    const out = await respond([user(text), { type: 'tool_result', callId: 'c', name: 'requirements.update', output: JSON.stringify({ ok: true, data: { proposalId: 'P-1' } }) }], [tool])
    expect(out).toMatchObject({ type: 'final', text: expect.stringContaining('P-1') })
  })
})

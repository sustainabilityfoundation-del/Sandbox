import { describe, expect, it } from 'vitest'
import { useConversation, type ChatMessage } from './conversation'
import { TRANSCRIPT_FORMAT, buildTranscript } from './transcript'

describe('transcript export (evidence of an assistant run)', () => {
  it('keeps every operation with its arguments and round, the proposals, and a replayable script; never a credential', () => {
    const context = { projectId: 'P-1', configurationId: 'C', configurationName: '', scenarioId: 'S', scenarioName: '', scenarios: [], modelRevision: 1, selection: [], attachedSelection: false, capturedAt: '' }
    const messages: ChatMessage[] = [
      { id: 'M1', role: 'user', at: '1', text: 'Create a thing (v1.2)', context },
      {
        id: 'M2', role: 'assistant', at: '2', replyTo: 'M1', status: 'done', text: 'Prepared CP-1.', proposalIds: ['CP-1'], suggestions: [], model: 'openai gpt-x',
        steps: [
          { id: 'a', name: 'catalog.search', label: '', status: 'done', summary: 'found', inspected: [], arguments: { text: 'thing' }, round: 0 },
          { id: 'b', name: 'catalog.create', label: '', status: 'done', summary: 'prepared', inspected: [], arguments: { name: 'Thing' }, round: 1 },
          { id: 'c', name: 'catalog.note', label: '', status: 'done', summary: 'noted', inspected: [], arguments: {}, round: 1 },
        ],
      },
    ]
    useConversation.setState({ messages, proposals: {}, conversationId: 'C-T', projectId: 'P-1' })
    const t = buildTranscript()
    expect(t.format).toBe(TRANSCRIPT_FORMAT)
    expect(t.messages[1]).toMatchObject({ role: 'assistant', model: 'openai gpt-x', operations: [{ round: 0, name: 'catalog.search', arguments: { text: 'thing' } }, { round: 1, name: 'catalog.create' }, { round: 1, name: 'catalog.note' }] })
    expect(t.replayScript.turns).toEqual([
      { user: '^Create a thing \\(v1\\.2\\)$', steps: [{ calls: [{ name: 'catalog.search', arguments: { text: 'thing' } }] }, { calls: [{ name: 'catalog.create', arguments: { name: 'Thing' } }, { name: 'catalog.note', arguments: {} }] }, { final: 'Prepared CP-1.' }] },
    ])
    expect(new RegExp(t.replayScript.turns[0].user).test('Create a thing (v1.2)')).toBe(true)
    expect(JSON.stringify(t)).not.toMatch(/apiKey|sk-|accessToken|refresh/i)
  })
})

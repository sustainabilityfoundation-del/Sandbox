import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createFakeProvider } from './providers/fake'
import { loadReplayScripts, replay, type ReplayScript } from './providers/replay'
import type { ProviderMessage } from './providers/types'

const script: ReplayScript = {
  id: 'generic',
  turns: [
    {
      user: '^make a widget',
      steps: [
        { calls: [{ name: 'catalog.search', arguments: { text: 'widget' } }] },
        { calls: [{ name: 'catalog.create', arguments: { parentId: '${catalog.search.data.items.0.key}', label: 'Child of ${catalog.search.data.items.0.key}' } }, { name: 'catalog.note', arguments: {} }] },
        { final: 'Prepared ${catalog.create.data.proposalId}.' },
      ],
    },
  ],
}
const user = (text: string): ProviderMessage => ({ type: 'message', role: 'user', text })
const result = (name: string, output: unknown, id: string): ProviderMessage[] => [
  { type: 'tool_call', callId: id, name, arguments: {} },
  { type: 'tool_result', callId: id, name, output: JSON.stringify(output) },
]

describe('fake provider: replay of recorded tool-call scripts', () => {
  it('replays steps in order, substituting earlier results of the same turn', () => {
    const first = replay([script], 'make a widget please', [user('make a widget please')], 'fake')
    expect(first).toMatchObject({ type: 'tool_calls', calls: [{ name: 'catalog.search', arguments: { text: 'widget' } }] })
    const afterSearch = [user('make a widget please'), ...result('catalog.search', { ok: true, data: { items: [{ key: 'W-7' }] } }, 'a')]
    const second = replay([script], 'make a widget please', afterSearch, 'fake')
    expect(second).toMatchObject({ type: 'tool_calls', calls: [{ name: 'catalog.create', arguments: { parentId: 'W-7', label: 'Child of W-7' } }, { name: 'catalog.note' }] })
    const done = [...afterSearch, ...result('catalog.create', { ok: true, data: { proposalId: 'CP-4' } }, 'b'), ...result('catalog.note', { ok: true }, 'c')]
    expect(replay([script], 'make a widget please', done, 'fake')).toMatchObject({ type: 'final', text: 'Prepared CP-4.' })
    expect(replay([script], 'something else', [user('something else')], 'fake')).toBeNull()
  })

  it('loads scripts from a directory and the fake provider uses them before its built-in script', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'replay-'))
    writeFileSync(join(dir, 'generic.json'), JSON.stringify(script))
    expect(loadReplayScripts(dir).map((s) => s.id)).toEqual(['generic'])
    expect(loadReplayScripts(join(dir, 'missing'))).toEqual([])
    const fake = createFakeProvider({ scriptsDir: dir })
    const out = await fake.respond({ credential: { kind: 'api-key', apiKey: 'fake-0123456789' }, method: 'api-key', model: 'fake-small', instructions: '', messages: [user('make a widget')], tools: [], signal: new AbortController().signal })
    expect(out).toMatchObject({ type: 'tool_calls', calls: [{ name: 'catalog.search' }] })
  })
})

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadReplayScripts, replay } from './providers/replay'
import type { ProviderMessage } from './providers/types'

/** The ECII regression scripts (increment 1) load and start with the intent step; they prove structure, not reasoning. */
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../tests/e2e/fixtures/fake-scripts')
const scripts = loadReplayScripts(dir)
const user = (text: string): ProviderMessage => ({ type: 'message', role: 'user', text })

describe('ECII replay scripts', () => {
  it.each([
    ['Design a drill-bit holder that attaches to my cordless drill.', 'ecii-a'],
    ['Design a freestanding drill-bit organizer for my workbench.', 'ecii-d'],
    ['D1 intent', 'd1-plumbing'],
  ])('%s starts with conceptualize.interpret_intent (%s)', (text, id) => {
    expect(scripts.map((s) => s.id)).toContain(id)
    expect(replay(scripts, text, [user(text)], 'fake')).toMatchObject({ type: 'tool_calls', calls: [{ name: 'conceptualize.interpret_intent' }] })
  })
  it('each user pattern matches only its own turn', () => {
    const owners = (text: string) => scripts.flatMap((s) => s.turns.filter((t) => new RegExp(t.user, 'i').test(text)).map(() => s.id))
    expect(owners('Design a drill-bit holder that attaches to my cordless drill.')).toEqual(['ecii-a'])
    expect(owners('Design a freestanding drill-bit organizer for my workbench.')).toEqual(['ecii-d'])
    expect(owners('ECII A gaps')).toEqual(['ecii-a'])
    expect(owners('ECII D gaps')).toEqual(['ecii-d'])
  })
})

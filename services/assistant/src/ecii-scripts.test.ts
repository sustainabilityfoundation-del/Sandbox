import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadReplayScripts, replay } from './providers/replay'
import type { ProviderMessage } from './providers/types'

/** The ECII regression scripts (increments 1 and 2) load and start with the intent step; they prove structure, not reasoning. */
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../tests/e2e/fixtures/fake-scripts')
const scripts = loadReplayScripts(dir)
const user = (text: string): ProviderMessage => ({ type: 'message', role: 'user', text })

describe('ECII replay scripts', () => {
  it.each([
    ['Design a drill-bit holder that attaches to my cordless drill.', 'ecii-a'],
    ['Design a freestanding drill-bit organizer for my workbench.', 'ecii-d'],
    ['D1 intent', 'd1-plumbing'],
    ['Design a bracket that mounts a vibration sensor to an existing industrial machine.', 'ecii-e-sensor'],
    ['Design a cooling fan module that integrates into my electronic enclosure.', 'ecii-e-fan'],
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
    for (const [text, id] of [
      ['ECII A architectures', 'ecii-a'],
      ['ECII A readiness', 'ecii-a'],
      ['ECII A variants', 'ecii-a'],
      ['ECII A variant check', 'ecii-a'],
      ['ECII D architectures', 'ecii-d'],
      ['ECII D readiness', 'ecii-d'],
      ['ECII E sensor architectures', 'ecii-e-sensor'],
      ['ECII E sensor readiness', 'ecii-e-sensor'],
      ['ECII E fan architectures', 'ecii-e-fan'],
      ['ECII E fan readiness', 'ecii-e-fan'],
      ['D1 mounting architectures', 'd1-plumbing'],
      ['D1 diversity', 'd1-plumbing'],
      ['D1 readiness', 'd1-plumbing'],
    ]) expect(owners(text)).toEqual([id])
  })
  it('architecture steps use level architecture, a block per alternative and no invented dimensions of a host', () => {
    for (const [text, id] of [['ECII A architectures', 'ecii-a'], ['ECII E sensor architectures', 'ecii-e-sensor'], ['ECII E fan architectures', 'ecii-e-fan'], ['D1 mounting architectures', 'd1-plumbing']]) {
      const turn = scripts.find((s) => s.id === id)!.turns.find((t) => new RegExp(t.user, 'i').test(text))!
      const call = turn.steps.flatMap((s) => ('calls' in s ? s.calls : [])).find((c) => c.name === 'conceptualize.develop_alternatives')!
      const args = call.arguments as { level: string; alternatives: { architecture: { evidenceRequired: string[]; disadvantages: string[] } }[] }
      expect(args.level).toBe('architecture')
      expect(args.alternatives.length).toBe(3)
      for (const a of args.alternatives) expect(a.architecture.evidenceRequired.length && a.architecture.disadvantages.length).toBeTruthy()
    }
  })
})

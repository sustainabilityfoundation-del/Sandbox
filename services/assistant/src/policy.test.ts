import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateSettingDefinitions } from '@ews/platform-sdk'
import { AI_MODULES, AI_SETTING_DEFINITIONS, OPERATION_CATALOGUE, classify, decide, policyFromSettings } from './policy'
import { INSTRUCTIONS } from './wire'

const repo = resolve(__dirname, '../../..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (n === 'node_modules' || n.startsWith('dist')) return []
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []
  })
}

describe('AI access policy', () => {
  it('lists every assistant action the tool packages register in the operation catalogue', () => {
    const tools = readdirSync(join(repo, 'packages')).filter((d) => d.startsWith('tool-'))
    const names = new Set<string>()
    for (const t of tools) for (const f of sources(join(repo, 'packages', t, 'src'))) for (const m of readFileSync(f, 'utf8').matchAll(/name: '([a-z-]+\.[a-z_]+)'/g)) names.add(m[1])
    expect(names.size).toBeGreaterThan(20)
    expect([...names].filter((n) => !(n in OPERATION_CATALOGUE))).toEqual([])
    expect([...names].filter((n) => !classify(n))).toEqual([])
  })

  it('has valid, namespaced settings definitions with project ceilings, and leaves ai.reasoning.* free', () => {
    expect(validateSettingDefinitions(AI_SETTING_DEFINITIONS)).toEqual([])
    expect(AI_SETTING_DEFINITIONS.some((d) => d.id.startsWith('ai.reasoning.'))).toBe(false)
    for (const m of AI_MODULES) expect(AI_SETTING_DEFINITIONS.find((d) => d.id === `ai.access.${m.id}`)?.ceiling).toBe(`ai.ceiling.${m.id}`)
  })

  it('defaults to read and propose for every module, with a budget for multi-step work inside the policy ranges', () => {
    const p = policyFromSettings({})
    expect(Object.values(p.modules).every((l) => l === 'propose')).toBe(true)
    expect(p.operations['external-generation']).toBe(false)
    // A multi-step engineering session (several operations per answer, some conversation memory).
    expect(p.limits.toolCalls).toBeGreaterThanOrEqual(20)
    expect(p.sharing.historyLength).toBeGreaterThanOrEqual(10)
    expect(p.limits.timeoutSeconds).toBeGreaterThanOrEqual(60)
    // Bounded: an administrator can lower all of them with project limits.
    for (const id of ['ai.limits.tool-calls', 'ai.sharing.history-length', 'ai.limits.timeout', 'ai.limits.output-tokens']) {
      const d = AI_SETTING_DEFINITIONS.find((x) => x.id === id)!
      expect(d.ceiling).toBeDefined()
      expect(d.type === 'number' && d.default <= d.max).toBe(true)
    }
  })

  it('gives the model generic engineering-workflow instructions without example content', () => {
    for (const rule of ['materially change the design', 'State every assumption explicitly', '"user constraint"', '"AI-proposed"', '"derived"', 'Read before you propose', 'previewed proposal', 'Never state or imply compliance']) expect(INSTRUCTIONS).toContain(rule)
    expect(INSTRUCTIONS).not.toMatch(/drill|bit holder|milwaukee|hex|actuator|ROD-|REQ-\d/i)
  })

  it('refuses unknown operations, missing entitlements, modules that are off and changes in read-only modules', () => {
    const all = ['tool:requirements', 'tool:conceptualize', 'tool:sysml', 'tool:cad']
    const p = policyFromSettings({ 'ai.access.requirements': 'off', 'ai.access.conceptualize': 'read' })
    expect(decide('shell.exec', p, all)).toMatchObject({ ok: false, code: 'unknown-operation' })
    expect(decide('cad-modeler.query', p, ['tool:requirements'])).toMatchObject({ ok: false, code: 'not-entitled' })
    expect(decide('requirements.search', p, all)).toMatchObject({ ok: false, code: 'module-off' })
    expect(decide('conceptualize.read', p, all).ok).toBe(true)
    expect(decide('conceptualize.create', p, all)).toMatchObject({ ok: false, code: 'read-only' })
    expect(decide('conceptualize.request_realization', policyFromSettings({}), all)).toMatchObject({ ok: false, code: 'class-off' })
    // An action a tool adds later is treated as a change (strictest useful class) until catalogued.
    expect(classify('conceptualize.new_thing')?.operationClass).toBe('propose')
    expect(classify('read_help')?.module.id).toBe('help')
  })
})

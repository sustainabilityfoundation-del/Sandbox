import { describe, expect, it } from 'vitest'
import { validateSettingDefinitions } from '@ews/platform-sdk'
import { AI_MODULES, AI_SETTING_DEFINITIONS, classify, createPolicy, decide, policyFromSettings } from './policy'
import { INSTRUCTIONS } from './wire'

describe('AI access policy', () => {
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

  it('merges module contributions with createPolicy: new module, settings, entitlement and class; duplicates fail', () => {
    const demo = { id: 'demo', label: 'Demo', description: 'Demo module.', entitlement: 'tool:demo', prefixes: ['demo.'] }
    const p = createPolicy([demo], { 'demo.read': 'read', 'demo.change': 'propose' })
    expect(validateSettingDefinitions(p.settingDefinitions)).toEqual([])
    expect(p.settingDefinitions.find((d) => d.id === 'ai.access.demo')?.ceiling).toBe('ai.ceiling.demo')
    const values = p.policyFromSettings({ 'ai.access.demo': 'read' })
    expect(values.modules.demo).toBe('read')
    expect(p.decide('demo.read', values, ['tool:demo']).ok).toBe(true)
    expect(p.decide('demo.change', values, ['tool:demo'])).toMatchObject({ ok: false, code: 'read-only' })
    expect(p.decide('demo.read', values, [])).toMatchObject({ ok: false, code: 'not-entitled' })
    // The default policy does not know the module.
    expect(classify('demo.read')).toBeNull()
    expect(() => createPolicy([{ ...demo, id: 'requirements' }])).toThrow(/defined twice/)
    expect(() => createPolicy([], { 'requirements.search': 'search' })).toThrow(/defined twice/)
  })
})

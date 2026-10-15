import { describe, expect, it } from 'vitest'
import { checkSettingValue, clampToCeiling, createMemorySettingsService, validateSettingDefinitions, withinCeiling, type SettingDefinition } from './settings'

const access: SettingDefinition = {
  id: 'ai.access.requirements',
  label: 'Requirements',
  description: 'AI access to Requirements',
  scope: 'user',
  type: 'enum',
  options: [
    { value: 'off', label: 'Off' },
    { value: 'read', label: 'Read only' },
    { value: 'propose', label: 'Read and propose' },
  ],
  default: 'propose',
  ceiling: 'ai.ceiling.requirements',
}
const ceiling: SettingDefinition = { ...access, id: 'ai.ceiling.requirements', scope: 'project', requiresPermission: 'administrator', ceiling: undefined }
const timeout: SettingDefinition = { id: 'ai.limits.timeout', label: 'Timeout', description: 'Request timeout', scope: 'user', type: 'number', unit: 's', min: 10, max: 120, integer: true, default: 60 }

describe('settings contract (SDK 1.6)', () => {
  it('accepts valid definitions', () => {
    expect(validateSettingDefinitions([access, ceiling, timeout])).toEqual([])
  })

  it('rejects unnamespaced or duplicate IDs, out-of-range defaults, bad ceilings and reserved namespaces', () => {
    const problems = validateSettingDefinitions([
      { ...timeout, id: 'timeout' },
      timeout,
      { ...timeout, default: 500 },
      { ...access, ceiling: 'ai.ceiling.missing' },
      { ...timeout, id: 'ai.reasoning.depth.max' },
    ])
    expect(problems.some((p) => p.startsWith('timeout:'))).toBe(true)
    expect(problems.some((p) => p.includes('duplicate'))).toBe(true)
    expect(problems.some((p) => p.includes('default is invalid'))).toBe(true)
    expect(problems.some((p) => p.includes('ai.ceiling.missing'))).toBe(true)
    expect(problems.some((p) => p.includes('reserved'))).toBe(true)
  })

  it('checks values by type and range', () => {
    expect(checkSettingValue(timeout, 30)).toBeNull()
    expect(checkSettingValue(timeout, 5)).toMatch(/between 10 and 120 s/)
    expect(checkSettingValue(timeout, 30.5)).toMatch(/whole/)
    expect(checkSettingValue(access, 'everything')).toMatch(/one of/)
    expect(checkSettingValue({ id: 'ai.connection.active', label: 'Connection', description: 'd', scope: 'user', type: 'secret-reference', owner: 'assistant', default: null }, 'sk-live-secret value')).toMatch(/never a secret/)
  })

  it('orders enum options for ceilings and clamps', () => {
    expect(withinCeiling(access, 'read', 'propose')).toBe(true)
    expect(withinCeiling(access, 'propose', 'read')).toBe(false)
    expect(clampToCeiling(access, 'propose', 'off')).toBe('off')
    const service = createMemorySettingsService([access, ceiling], { 'ai.ceiling.requirements': 'read' })
    expect(service.get('ai.access.requirements')).toBe('read')
    expect(() => service.set('ai.access.requirements', 'all')).toThrow()
  })
})

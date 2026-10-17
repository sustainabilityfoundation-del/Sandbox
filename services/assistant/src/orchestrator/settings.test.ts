import { clampToCeiling, validateSettingDefinitions } from '@ews/platform-sdk'
import { describe, expect, it } from 'vitest'
import { createPolicy } from '../policy'
import { routingFromSettings } from './settings'

describe('routing and context settings', () => {
  const defs = createPolicy(undefined, undefined, { routingDefault: 'economy' }).settingDefinitions
  const byId = new Map(defs.map((d) => [d.id, d]))

  it('are valid definitions with project ceilings (the existing pair helper)', () => {
    expect(validateSettingDefinitions(defs)).toEqual([])
    for (const id of ['ai.routing.mode', 'ai.routing.providers.openai', 'ai.routing.providers.anthropic', 'ai.routing.providers.google', 'ai.routing.providers.xai', 'ai.context.mode']) {
      expect(byId.get(id)?.scope, id).toBe('user')
      expect(byId.get(id)?.ceiling, id).toBeTruthy()
    }
  })

  it('default routing mode follows EWS_AI_DEFAULT_OPTIMIZATION; context mode is off', () => {
    expect(byId.get('ai.routing.mode')!.default).toBe('economy')
    expect(createPolicy().settingDefinitions.find((d) => d.id === 'ai.routing.mode')!.default).toBe('balanced')
    expect(byId.get('ai.context.mode')!.default).toBe('off')
  })

  it('a project ceiling narrows the mode and a provider switch', () => {
    const mode = byId.get('ai.routing.mode')!
    expect(clampToCeiling(mode, 'manual', 'balanced')).toBe('balanced')
    expect(clampToCeiling(mode, 'economy', 'balanced')).toBe('economy')
    const provider = byId.get('ai.routing.providers.xai')!
    expect(clampToCeiling(provider, true, false)).toBe(false)
  })

  it('routingFromSettings reads the effective values and falls back safely', () => {
    expect(routingFromSettings({ 'ai.routing.mode': 'quality', 'ai.routing.providers.xai': false, 'ai.context.mode': 'digest' })).toMatchObject({ mode: 'quality', contextMode: 'digest' })
    expect([...routingFromSettings({ 'ai.routing.providers.xai': false }).disallowedProviders]).toEqual(['xai'])
    expect(routingFromSettings({ 'ai.routing.mode': 'nonsense' }, 'economy').mode).toBe('economy')
  })
})

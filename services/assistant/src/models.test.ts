import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultModelId, findRegistryModel, intersectModels, listRegistryProviders, loadModelRegistry, matchesModel, RegistryValidationError, validateModelRegistry } from './models'
import { OPENAI_DEFAULT_MODEL } from './providers/openai'

/** Mock tier (no network, no database): the model registry. */

const fixture = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  provider: 'test',
  registryVersion: 'test.1',
  verified: false,
  models: [
    { id: 'm-main', label: 'Main', default: true, status: 'active', capabilities: { tools: true } },
    { id: 'm-fam-*', label: 'Family', status: 'preview', capabilities: {} },
  ],
  ...over,
})

describe('model registry', () => {
  it('loads and validates every shipped registry file', () => {
    for (const p of listRegistryProviders()) {
      const reg = loadModelRegistry(p)
      expect(reg.provider).toBe(p)
      expect(reg.models.filter((m) => m.default)).toHaveLength(1)
    }
  })

  it('reports every validation problem with its path', () => {
    const bad = fixture({ models: [{ id: 'a', label: '', status: 'x', capabilities: { telepathy: true }, qualityTier: 9 }, { id: 'a', label: 'dup', status: 'active', capabilities: {}, default: true }] })
    try {
      validateModelRegistry(bad, 'bad.json')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(RegistryValidationError)
      const p = (e as RegistryValidationError).problems.join('\n')
      for (const part of ['models[0].label', 'models[0].status', 'telepathy', 'qualityTier', 'duplicated']) expect(p).toContain(part)
    }
  })

  it('needs exactly one default and refuses a pattern as the default', () => {
    expect(() => validateModelRegistry(fixture({ models: [{ id: 'a', label: 'A', status: 'active', capabilities: {} }] }))).toThrow(/exactly one model/)
    expect(() => validateModelRegistry(fixture({ models: [{ id: 'a-*', label: 'A', status: 'active', capabilities: {}, default: true }] }))).toThrow(/pattern cannot be the default/)
  })

  it('matches exact IDs before patterns', () => {
    const reg = validateModelRegistry(fixture({ models: [{ id: 'm-fam-*', label: 'Family', status: 'active', capabilities: {} }, { id: 'm-fam-x', label: 'X', default: true, status: 'active', capabilities: {} }] }))
    expect(findRegistryModel(reg, 'm-fam-x')?.label).toBe('X')
    expect(findRegistryModel(reg, 'm-fam-y')?.label).toBe('Family')
    expect(matchesModel('a.b*', 'a.bcd')).toBe(true)
    expect(matchesModel('a.b*', 'aXbcd')).toBe(false)
  })

  it('intersects the registry with the account model list', () => {
    const reg = validateModelRegistry(fixture())
    const r = intersectModels(reg, [{ id: 'm-main', label: 'm-main' }, { id: 'm-fam-7', label: 'Seven' }, { id: 'mystery', label: 'Mystery' }])
    expect(r.available.map((m) => m.id)).toEqual(['m-main', 'm-fam-7'])
    expect(r.available[0].label).toBe('Main')
    expect(r.available[1].label).toBe('Seven')
    expect(r.unknown.map((m) => m.id)).toEqual(['mystery'])
    expect(r.unavailable).toEqual([])
    const none = intersectModels(reg, [{ id: 'mystery', label: 'Mystery' }])
    expect(none.unavailable.map((m) => m.id)).toEqual(['m-main', 'm-fam-*'])
    expect(intersectModels(reg, undefined).available.map((m) => m.id)).toEqual(['m-main'])
  })

  it('serves the deprecated OPENAI_DEFAULT_MODEL from the registry', () => {
    expect(OPENAI_DEFAULT_MODEL).toBe(defaultModelId('openai'))
    expect(OPENAI_DEFAULT_MODEL).toBe(loadModelRegistry('openai').models.find((m) => m.default)!.id)
  })

  it('keeps model IDs out of code: no provider source file mentions a registry model ID', () => {
    const ids = ['openai', 'fake'].flatMap((p) => loadModelRegistry(p).models.map((m) => m.id)).filter((id) => !id.includes('*'))
    const dir = join(__dirname, 'providers')
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts') && statSync(join(dir, n)).isFile())) {
      const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      for (const id of ids) expect(src, `${f} must not hard-code ${id}`).not.toContain(`'${id}'`)
    }
  })
})

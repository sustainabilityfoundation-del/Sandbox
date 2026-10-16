import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createPolicy } from '@ews/assistant-service'
import type { ServerModuleManifest } from '@ews/platform-sdk'
import { INSTALLED_SERVER_MODULES, assertUniqueManifests, collectPolicyContributions } from './modules'

const repo = resolve(__dirname, '../../..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (n === 'node_modules' || n.startsWith('dist')) return []
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []
  })
}

const fixture = (over: Partial<ServerModuleManifest> & { id: string }): ServerModuleManifest => ({ name: over.id, basePath: `/api/${over.id}/v1`, register: () => undefined, ...over })

describe('installed server modules', () => {
  it('have unique IDs and base paths, and keep the plugin registration order', () => {
    expect(() => assertUniqueManifests(INSTALLED_SERVER_MODULES)).not.toThrow()
    expect(INSTALLED_SERVER_MODULES.map((m) => m.id)).toEqual(['requirements', 'conceptualize', 'sysml-modeler', 'cad-modeler', 'visualization'])
  })

  it('registers visualization after the host services and gives it no settings or provisioning', () => {
    const viz = INSTALLED_SERVER_MODULES.find((m) => m.id === 'visualization')!
    expect(viz.phase).toBe('after-host')
    expect(viz.settings ?? viz.provisioning).toBeUndefined()
  })

  it('keep the module IDs, names and lazy-provisioning reasons the host used before', () => {
    const provisioning = INSTALLED_SERVER_MODULES.flatMap((m) => (m.provisioning ? [{ module: m.provisioning.module ?? m.id, name: m.name }] : []))
    expect(provisioning).toEqual([
      { module: 'requirements', name: 'Requirements' },
      { module: 'conceptualize', name: 'Conceptualize' },
      { module: 'sysml', name: 'SysML Modeler' },
      { module: 'cad', name: 'CAD Modeler' },
    ])
  })

  it('refuses two modules with the same ID or base path', () => {
    expect(() => assertUniqueManifests([fixture({ id: 'a' }), fixture({ id: 'a', basePath: '/other' })])).toThrow(/installed twice/)
    expect(() => assertUniqueManifests([fixture({ id: 'a' }), fixture({ id: 'b', basePath: '/api/a/v1' })])).toThrow(/two server modules/)
  })
})

describe('AI policy from the installed manifests', () => {
  const { aiModules, operations } = collectPolicyContributions(INSTALLED_SERVER_MODULES)
  const policy = createPolicy(aiModules, operations)

  it('lists every assistant action the tool packages register in the merged operation catalogue', () => {
    const tools = readdirSync(join(repo, 'packages')).filter((d) => d.startsWith('tool-'))
    const names = new Set<string>()
    for (const t of tools) for (const f of sources(join(repo, 'packages', t, 'src'))) for (const m of readFileSync(f, 'utf8').matchAll(/name: '([a-z-]+\.[a-z_]+)'/g)) names.add(m[1])
    expect(names.size).toBeGreaterThan(20)
    expect([...names].filter((n) => !(n in policy.catalogue))).toEqual([])
    expect([...names].filter((n) => !policy.classify(n))).toEqual([])
  })

  it('merges a manifest contribution, and fails when a legacy entry and a manifest define the same ID or operation', () => {
    const demo = fixture({ id: 'demo', aiModule: { id: 'demo', label: 'Demo', description: 'Demo.', prefixes: ['demo.'] }, operations: { 'demo.read': 'read' } })
    const merged = collectPolicyContributions([demo])
    const withDemo = createPolicy(merged.aiModules, merged.operations)
    expect(withDemo.classify('demo.read')).toMatchObject({ operationClass: 'read', module: { id: 'demo' } })
    expect(withDemo.settingDefinitions.some((d) => d.id === 'ai.access.demo')).toBe(true)
    // The legacy platform entries are still in force.
    expect(withDemo.classify('requirements.search')?.module.id).toBe('requirements')

    // A manifest that defines an ID the legacy list already has (requirements is still a legacy entry until its M-step).
    const dupModule = collectPolicyContributions([fixture({ id: 'requirements', aiModule: { id: 'requirements', label: 'R', description: 'R.', prefixes: ['requirements.'] } })])
    expect(() => createPolicy(dupModule.aiModules, dupModule.operations)).toThrow(/defined twice/)
    const dupOperation = collectPolicyContributions([fixture({ id: 'x', operations: { 'requirements.search': 'search' } })])
    expect(() => createPolicy(dupOperation.aiModules, dupOperation.operations)).toThrow(/defined twice/)
    // Two manifests defining the same operation.
    expect(() => collectPolicyContributions([fixture({ id: 'a', operations: { 'demo.x': 'read' } }), fixture({ id: 'b', operations: { 'demo.x': 'read' } })])).toThrow(/both/)
  })
})

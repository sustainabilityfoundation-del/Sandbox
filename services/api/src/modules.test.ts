import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createPolicy } from '@ews/assistant-service'
import type { ServerModuleManifest } from '@ews/platform-sdk'
import { projectsServerManifest } from '@ews/projects-service'
import { ALL_SERVER_MODULES, INSTALLED_SERVER_MODULES, assertUniqueManifests, collectPolicyContributions } from './modules'

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
    expect(() => assertUniqueManifests(ALL_SERVER_MODULES)).not.toThrow()
    expect(INSTALLED_SERVER_MODULES.map((m) => m.id)).toEqual(['requirements', 'conceptualize', 'sysml-modeler', 'cad-modeler', 'visualization'])
  })

  it('registers visualization after the host services and gives it no settings or provisioning', () => {
    const viz = INSTALLED_SERVER_MODULES.find((m) => m.id === 'visualization')!
    expect(viz.phase).toBe('after-host')
    expect(viz.settings ?? viz.provisioning).toBeUndefined()
  })

  it('takes the visualization identity from its package manifest and declares no AI entries', () => {
    const viz = ALL_SERVER_MODULES.find((m) => m.id === 'visualization')!
    expect(viz).toMatchObject({ name: 'Visualization', basePath: '/api/visualization/v1', docs: 'Visualization API', phase: 'after-host' })
    expect(viz.aiModule ?? viz.operations ?? viz.proposals).toBeUndefined()
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
  const { aiModules, operations } = collectPolicyContributions(ALL_SERVER_MODULES)
  const policy = createPolicy(aiModules, operations)

  it('lists every assistant action the tool packages register in the merged operation catalogue', () => {
    const tools = readdirSync(join(repo, 'packages')).filter((d) => d.startsWith('tool-'))
    const names = new Set<string>()
    for (const t of tools) for (const f of sources(join(repo, 'packages', t, 'src'))) for (const m of readFileSync(f, 'utf8').matchAll(/name: '([a-z-]+\.[a-z_]+)'/g)) names.add(m[1])
    expect(names.size).toBeGreaterThan(20)
    expect([...names].filter((n) => !(n in policy.catalogue))).toEqual([])
    expect([...names].filter((n) => !policy.classify(n))).toEqual([])
  })

  it('keeps the AI module order and the order of the AI settings rows exactly as before the manifests (b845b0d)', () => {
    const base = ['workspace', 'requirements', 'conceptualize', 'sysml-modeler', 'cad-modeler', 'illustrative', 'projects', 'reasoning', 'help']
    expect(policy.modules.map((m) => m.id)).toEqual(base)
    const rows = (defs: { id: string }[], prefix: string) => defs.filter((d) => d.id.startsWith(prefix)).map((d) => d.id.slice(prefix.length))
    expect(rows(policy.settingDefinitions, 'ai.access.')).toEqual(base)
    expect(rows(policy.settingDefinitions, 'ai.ceiling.')).toEqual(base)
    // A new installed module follows the known ones and precedes the platform tail, in installed-list order.
    const extra = collectPolicyContributions([...ALL_SERVER_MODULES, fixture({ id: 'x1', aiModule: { id: 'x1', label: 'X1', description: 'X.', prefixes: ['x1.'] } }), fixture({ id: 'x2', aiModule: { id: 'x2', label: 'X2', description: 'X.', prefixes: ['x2.'] } })])
    expect(createPolicy(extra.aiModules, extra.operations).modules.map((m) => m.id)).toEqual([...base.slice(0, 7), 'x1', 'x2', 'reasoning', 'help'])
  })

  it('takes the SysML Modeler from its manifest (no legacy entry): same module, classes and proposal API as before', () => {
    expect(aiModules.filter((m) => m.id === 'sysml-modeler')).toHaveLength(1)
    expect(policy.classify('sysml-modeler.read_element')).toMatchObject({ operationClass: 'read', module: { id: 'sysml-modeler', entitlement: 'tool:sysml', prefixes: ['sysml-modeler.'] } })
    expect(policy.classify('sysml-modeler.impact')?.operationClass).toBe('calculate')
    expect(policy.classify('sysml-modeler.find_elements')?.operationClass).toBe('search')
    expect(policy.classify('sysml-modeler.propose_commands')?.operationClass).toBe('propose')
    expect(Object.keys(policy.catalogue).filter((n) => n.startsWith('sysml-modeler.'))).toHaveLength(15)
    expect(ALL_SERVER_MODULES.find((m) => m.id === 'sysml-modeler')?.proposals).toEqual({ entitlement: 'tool:sysml' })
  })

  it('takes the CAD Modeler from its manifest (no legacy entry): same module, classes, settings and proposal API as before', () => {
    expect(aiModules.filter((m) => m.id === 'cad-modeler')).toEqual([{ id: 'cad-modeler', label: 'CAD Modeler', description: 'Parametric CAD documents and exports.', entitlement: 'tool:cad', prefixes: ['cad-modeler.'] }])
    expect(Object.keys(policy.catalogue).filter((n) => n.startsWith('cad-modeler.'))).toHaveLength(13)
    expect(policy.classify('cad-modeler.describe_model')).toMatchObject({ operationClass: 'read', module: { id: 'cad-modeler' } })
    expect(policy.classify('cad-modeler.run_commands')?.operationClass).toBe('propose')
    expect(policy.classify('cad-modeler.export')?.operationClass).toBe('export')
    expect(policy.classify('cad-modeler.not_yet_catalogued')?.operationClass).toBe('propose')
    const cad = INSTALLED_SERVER_MODULES.find((m) => m.id === 'cad-modeler')
    expect(cad?.proposals).toEqual({ entitlement: 'tool:cad', projectParam: 'projectId' })
    expect(cad?.provisioning?.module).toBe('cad')
    expect(cad?.settings?.definitions.length).toBeGreaterThan(0)
  })

  it('takes Conceptualize from its manifest (no legacy entry): same module, prefix, entitlement and operation classes as before', () => {
    expect(aiModules.filter((m) => m.id === 'conceptualize')).toEqual([{ id: 'conceptualize', label: 'Conceptualize', description: 'Concepts, alternatives, trade studies and decisions.', entitlement: 'tool:conceptualize', prefixes: ['conceptualize.'] }])
    expect(Object.keys(policy.catalogue).filter((n) => n.startsWith('conceptualize.'))).toHaveLength(34)
    expect(policy.classify('conceptualize.compare')).toMatchObject({ operationClass: 'calculate', module: { id: 'conceptualize' } })
    expect(policy.classify('conceptualize.request_illustration')?.operationClass).toBe('external-generation')
    expect(policy.classify('conceptualize.read_visuals')?.operationClass).toBe('read')
    expect(policy.classify('conceptualize.not_yet_catalogued')?.operationClass).toBe('propose')
    expect(INSTALLED_SERVER_MODULES.find((m) => m.id === 'conceptualize')?.proposals).toEqual({ entitlement: 'tool:conceptualize', projectParam: 'projectId' })
  })

  it('takes Project Management from its manifest (no legacy entry): same module, prefix and default class as before', () => {
    expect(aiModules.filter((m) => m.id === 'projects')).toHaveLength(1)
    expect(policy.classify('projects.create')).toMatchObject({ operationClass: 'propose', module: { id: 'projects', label: 'Project Management', prefixes: ['projects.'] } })
    expect(policy.settingDefinitions.some((d) => d.id === 'ai.access.projects')).toBe(true)
    // A second definition of the same module (legacy or manifest) is refused.
    const again = collectPolicyContributions([...ALL_SERVER_MODULES, fixture({ id: 'projects-again', aiModule: projectsServerManifest.aiModule })])
    expect(() => createPolicy(again.aiModules, again.operations)).toThrow(/defined twice/)
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

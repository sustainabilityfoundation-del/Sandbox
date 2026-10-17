import { describe, expect, expectTypeOf, it } from 'vitest'
import type { ClientModule, ModuleHostEnv } from '../react'
import {
  SDK_VERSION,
  isSdkCompatible,
  type AiModuleDescriptor,
  type ArtifactSource,
  type CapabilityEntry,
  type ModuleManifest,
  type OperationClass,
  type ServerModuleHost,
  type ServerModuleManifest,
} from '../index'

// Representative fixtures: one entry per shape used in apps/workspace/src/assistant/capabilities.ts and
// services/assistant/src/policy.ts (the SDK cannot import either; see boundaries.test.ts).
const entries: CapabilityEntry[] = [
  { id: 'platform.select', module: 'platform', surface: 'tree', label: 'Select objects', effect: 'view', status: 'implemented', coverage: 'shared', aiOperations: ['select_objects'] },
  { id: 'demo.run', module: 'demo', surface: 'toolbar', label: 'Run', effect: 'job', status: 'experimental', coverage: 'none', toolbarItem: 'run', apiOperations: ['runDemo'], note: 'x' },
]

const aiModule: AiModuleDescriptor = { id: 'demo', label: 'Demo', description: 'Demo module.', entitlement: 'tool:demo', prefixes: ['demo.'], names: ['demo_open'] }

const manifest: ModuleManifest = {
  schemaVersion: 1,
  id: 'demo',
  name: 'Demo',
  entitlement: 'tool:demo',
  capabilities: entries,
  operations: { 'demo.read': 'read', 'demo.propose': 'propose' },
  aiModule,
  defaultOpen: false,
}

describe('SDK 1.12 module manifests', () => {
  it('is an additive minor version', () => {
    expect(SDK_VERSION).toBe('1.14.0')
    expect(isSdkCompatible('^1.9.0')).toBe(true)
  })

  it('accepts a manifest fixture and a minimal manifest', () => {
    const minimal: ModuleManifest = { schemaVersion: 1, id: 'min', name: 'Minimal' }
    expect(manifest.capabilities?.every((c) => c.module === manifest.id || c.module === 'platform')).toBe(true)
    expect(minimal.capabilities).toBeUndefined()
  })

  it('types the capability and operation unions', () => {
    expectTypeOf<CapabilityEntry['surface']>().toEqualTypeOf<'toolbar' | 'panel' | 'field' | 'header' | 'palette' | 'tree' | 'inspector' | 'dialog' | 'api'>()
    expectTypeOf<CapabilityEntry['effect']>().toEqualTypeOf<'query' | 'view' | 'mutation' | 'job' | 'export' | 'import' | 'external'>()
    expectTypeOf<CapabilityEntry['status']>().toEqualTypeOf<'implemented' | 'mock' | 'experimental' | 'restricted'>()
    expectTypeOf<CapabilityEntry['coverage']>().toEqualTypeOf<'shared' | 'equivalent' | 'partial' | 'none' | 'restricted'>()
    expectTypeOf<CapabilityEntry['module']>().toEqualTypeOf<string>()
    expectTypeOf<OperationClass>().toEqualTypeOf<'read' | 'search' | 'calculate' | 'propose' | 'export' | 'external-generation'>()
    expectTypeOf<ModuleManifest['schemaVersion']>().toEqualTypeOf<1>()
    expectTypeOf<ModuleManifest['operations']>().toEqualTypeOf<Record<string, OperationClass> | undefined>()
  })

  it('types the server manifest with a structural host', async () => {
    const calls: string[] = []
    const source = { module: 'demo' } as ArtifactSource
    const server: ServerModuleManifest = {
      id: 'demo',
      name: 'Demo',
      basePath: '/api/demo/v1',
      operations: { 'demo.read': 'read' },
      aiModule,
      register: (host: ServerModuleHost) => {
        calls.push(String(host.app))
        return { artifactSource: source }
      },
    }
    const host: ServerModuleHost = { app: 'app' }
    expect(await server.register(host)).toEqual({ artifactSource: source })
    expect(calls).toEqual(['app'])
    expectTypeOf(server.register).parameter(0).toEqualTypeOf<ServerModuleHost>()
  })

  it('lets a host extend ServerModuleHost and type its manifests with it', async () => {
    interface TestHost extends ServerModuleHost {
      app: { name: string }
      pool: string
    }
    const server: ServerModuleManifest<TestHost> = {
      id: 'typed',
      name: 'Typed',
      basePath: '/api/typed/v1',
      docs: 'Typed API',
      proposals: { entitlement: 'tool:typed', projectParam: 'projectId' },
      settings: { page: { id: 'typed', title: 'Typed' }, definitions: [] },
      provisioning: { module: 'typed-legacy', lazyReason: 'Created on first write.' },
      register: (host) => ({ artifactSource: { module: `${host.app.name}:${host.pool}` } as ArtifactSource }),
    }
    const result = await server.register({ app: { name: 'a' }, pool: 'p', production: false })
    expect(result?.artifactSource?.module).toBe('a:p')
    expectTypeOf(server.register).parameter(0).toEqualTypeOf<TestHost>()
    expectTypeOf<ServerModuleManifest['proposals']>().toEqualTypeOf<{ entitlement: string; projectParam?: string } | undefined>()
    expect(server.proposals).toEqual({ entitlement: 'tool:typed', projectParam: 'projectId' })
  })

  it('types the client module', () => {
    expectTypeOf<ClientModule['manifest']>().toEqualTypeOf<ModuleManifest>()
    expectTypeOf<ClientModule['tool']>().parameter(0).toEqualTypeOf<ModuleHostEnv>()
    const platformOnly: ClientModule = { manifest, platformModule: () => ({ id: 'demo', name: 'Demo' }) }
    expect(platformOnly.platformModule?.().id).toBe('demo')
  })
})

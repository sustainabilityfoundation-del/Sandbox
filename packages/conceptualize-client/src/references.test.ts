import { describe, expect, it } from 'vitest'
import type { ArtifactSummary, NativeRef, ProjectsService } from '@ews/platform-sdk'
import { createRegistryReferencePort, createSysmlModelerReferenceAdapter, isLegacyTwinReference, isRealModuleReference, referenceKind } from './references'

const PE = '7e57c0de-0000-4000-8000-00000000a001'
const DOC = '7e57c0de-0000-4000-8000-0000000000d0'

function projects(entries: Record<string, Partial<ArtifactSummary>>): ProjectsService & { calls: NativeRef[][] } {
  const calls: NativeRef[][] = []
  return {
    contractVersion: '1.0.0',
    mode: 'api',
    calls,
    list: async () => ({ items: [] }),
    get: async () => undefined,
    artifacts: async () => ({ items: [] }),
    subscribe: () => () => undefined,
    async resolve(_projectId, refs) {
      calls.push(refs)
      return refs.flatMap((r) => (entries[r.id] ? [{ artifactId: 'a1', ref: r, key: 'PE-001', title: 'Housing', category: 'product-element', lifecycle: 'working', version: { value: 3 }, availability: 'available', ...entries[r.id] } as ArtifactSummary] : []))
    },
  }
}

describe('reference kinds (C3)', () => {
  it('tells real-module references from the legacy demo twin', () => {
    expect(referenceKind({ module: 'sysml', id: 'p1/e1' })).toBe('sysml-model-element')
    expect(referenceKind({ module: 'cad', id: `${PE}/face-3` })).toBe('cad-modeler-entity')
    expect(referenceKind({ module: 'product', id: PE })).toBe('product-element')
    expect(isRealModuleReference({ module: 'sysml', id: 'p1/e1' })).toBe(true)
    expect(isRealModuleReference({ module: 'projects', kind: 'document', id: DOC })).toBe(true)
    expect(isLegacyTwinReference({ module: 'sysml', id: 'SYS-003' })).toBe(true)
    expect(isLegacyTwinReference({ module: 'cad', id: 'CAD-120', kind: 'cad-representation' })).toBe(true)
    expect(isLegacyTwinReference({ module: 'twin', id: 'ROD-120' })).toBe(true)
    expect(isLegacyTwinReference({ module: 'product', id: PE })).toBe(false)
  })
})

describe('Project Management registry port (SDK 1.7)', () => {
  it('resolves product elements, SysML and CAD Modeler references through the registry', async () => {
    const svc = projects({ [PE]: {}, 'p1/e1': { key: 'SYS:e1', title: 'Drive', version: { value: 12 } }, gone: { availability: 'missing-in-module' }, off: { availability: 'module-unavailable' } })
    const port = createRegistryReferencePort(svc)
    expect(port.adapter).toBe(false)
    expect(port.supports({ module: 'twin', id: 'ROD-120' })).toBe(false)
    expect(await port.resolve('PRJ-1', { module: 'product', id: PE })).toEqual({ state: 'found', label: 'PE-001 Housing', latest: 3 })
    expect(svc.calls[0]).toEqual([{ module: 'product', kind: 'product-element', id: PE }])
    expect(await port.resolve('PRJ-1', { module: 'sysml', id: 'p1/e1' })).toMatchObject({ state: 'found', latest: 12 })
    expect(svc.calls[1]).toEqual([{ module: 'sysml', kind: 'sysml-model-element', id: 'p1/e1' }])
    expect((await port.resolve('PRJ-1', { module: 'sysml', kind: 'sysml-model-element', id: 'gone' })).state).toBe('missing')
    expect((await port.resolve('PRJ-1', { module: 'sysml', kind: 'sysml-model-element', id: 'off' })).state).toBe('unavailable')
    expect((await port.resolve('PRJ-1', { module: 'cad', id: `${PE}/unknown` })).state).toBe('unavailable')
  })
  it('does not claim demo-mode registries', () => {
    expect(createRegistryReferencePort({ ...projects({}), mode: 'demo' }).supports({ module: 'product', id: PE })).toBe(false)
  })
})

describe('SysML Modeler adapter (labelled, until SDK 1.8)', () => {
  const routes: Record<string, unknown> = {
    '/api/sysml/v1/projects/p1': { name: 'Drill rig', defaultBranch: { '@id': 'b1' } },
    '/api/sysml/v1/projects/p1/branches/b1': { head: { '@id': 'c9' } },
    '/api/sysml/v1/projects/p1/commits/c9': { number: 7 },
    '/api/sysml/v1/projects/p1/commits/c9/elements/e1?derived=true': { name: 'Spindle' },
  }
  const fetch = (async (url: string, init?: RequestInit) => {
    expect((init?.headers as Record<string, string>)['X-Dev-User']).toBe('eli')
    const body = routes[url]
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response('{}', { status: 404 })
  }) as unknown as typeof globalThis.fetch
  const port = createSysmlModelerReferenceAdapter({ baseUrl: '/api/sysml/v1', devUser: 'eli', fetch })
  it('resolves an element at the default branch head and is labelled as an adapter', async () => {
    expect(port.adapter).toBe(true)
    expect(port.supports({ module: 'sysml', id: 'p1/e1' })).toBe(true)
    expect(port.supports({ module: 'sysml', id: 'SYS-003' })).toBe(false)
    expect(await port.resolve('PRJ-1', { module: 'sysml', id: 'p1/e1', revision: 5 })).toMatchObject({ state: 'found', label: 'Spindle (Drill rig)', latest: 7 })
    expect((await port.resolve('PRJ-1', { module: 'sysml', id: 'p1/e2' })).state).toBe('missing')
    expect((await port.resolve('PRJ-1', { module: 'sysml', id: 'p2/e1' })).state).toBe('missing')
  })
})

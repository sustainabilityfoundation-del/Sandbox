import { describe, expect, it } from 'vitest'
import {
  ARTIFACT_CATEGORIES,
  ARTIFACT_LIFECYCLES,
  ARTIFACT_SOURCE_CONTRACT_VERSION,
  PLATFORM_ARTIFACT_MODULES,
  PROJECTS_CONTRACT_VERSION,
  ProjectsServiceError,
  SDK_VERSION,
  isSdkCompatible,
  type ArtifactSource,
  type ProvisionResult,
} from '../index'

describe('SDK 1.7 projects and artifact source contracts', () => {
  it('is an additive minor version that tools built for 1.x still accept', () => {
    expect(isSdkCompatible('^1.7.0', SDK_VERSION)).toBe(true)
    expect(isSdkCompatible('^1.0.0')).toBe(true)
    expect(isSdkCompatible('^1.6.0')).toBe(true)
    expect(PROJECTS_CONTRACT_VERSION).toBe('1.0.0')
    expect(ARTIFACT_SOURCE_CONTRACT_VERSION).toBe('1.0.0')
    expect(PLATFORM_ARTIFACT_MODULES).toEqual(expect.arrayContaining(['requirements', 'projects', 'product', 'conceptualize']))
  })

  it('lists the normalised lifecycles and categories', () => {
    expect(ARTIFACT_LIFECYCLES).toEqual(['working', 'in-review', 'released', 'superseded', 'retired'])
    expect(ARTIFACT_CATEGORIES).toContain('product-element')
    expect(new Set(ARTIFACT_CATEGORIES).size).toBe(ARTIFACT_CATEGORIES.length)
  })

  it('carries error codes and details', () => {
    const e = new ProjectsServiceError('conflict', 'stale', { currentRevision: 3 })
    expect(e).toBeInstanceOf(Error)
    expect([e.name, e.code, e.details]).toEqual(['ProjectsServiceError', 'conflict', { currentRevision: 3 }])
  })

  it('lets a module implement an ArtifactSource whose blank provisioning creates nothing', async () => {
    const source: ArtifactSource = {
      module: 'example',
      contractVersion: ARTIFACT_SOURCE_CONTRACT_VERSION,
      describeModule: () => ({ name: 'Example', kinds: [{ kind: 'thing', label: 'Thing', category: 'model', navigable: false }] }),
      list: async () => ({ items: [] }),
      describe: async () => [],
      subscribe: () => () => undefined,
      provision: async (): Promise<ProvisionResult> => ({ status: 'not-needed' }),
    }
    expect(await source.list('any')).toEqual({ items: [] })
    expect(await source.provision!({ projectId: 'p', template: { id: 'blank', content: 'blank' }, actor: 'ada', idempotencyKey: 'k' })).toEqual({ status: 'not-needed' })
  })
})

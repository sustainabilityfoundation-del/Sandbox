import type { ArtifactSummary, NativeRef, ProjectsService } from '@ews/platform-sdk'
import { describe, expect, it } from 'vitest'
import { checkProductReference } from './productRefs'

/** Product references are checked through the SDK ProjectsService contract (fake service here). */

function fakeProjects(items: ArtifactSummary[], fail?: string): ProjectsService {
  return {
    contractVersion: '1.0.0',
    mode: 'api',
    list: async () => ({ items: [] }),
    get: async () => undefined,
    resolve: async (projectId: string, refs: NativeRef[]) => {
      if (fail) throw new Error(fail)
      return projectId === 'PRJ-NEW' ? items.filter((a) => refs.some((r) => r.module === a.ref.module && r.id === a.ref.id)) : []
    },
    artifacts: async () => ({ items: [] }),
    subscribe: () => () => undefined,
  }
}
const element = (id: string, availability: ArtifactSummary['availability'] = 'available', category: ArtifactSummary['category'] = 'product-element'): ArtifactSummary => ({
  artifactId: `a-${id}`,
  ref: { module: 'product', kind: 'product-element', id },
  key: 'PE-7',
  title: 'Housing',
  category,
  lifecycle: 'working',
  version: { value: 4 },
  availability,
})

describe('product references (C3/C5)', () => {
  it('stores a verified element with its revision and label', async () => {
    expect(await checkProductReference({ projects: fakeProjects([element('pe-7')]) }, 'PRJ-NEW', ' pe-7 ')).toEqual({
      status: 'verified',
      target: { module: 'product', kind: 'product-element', id: 'pe-7', revision: 4, label: 'PE-7 Housing' },
    })
  })

  it('refuses unknown, unavailable, wrong-category or other-project elements', async () => {
    const svc = { projects: fakeProjects([element('pe-1', 'missing-in-module'), element('pe-2', 'available', 'requirement'), element('pe-3')]) }
    expect(await checkProductReference(svc, 'PRJ-NEW', 'nope')).toMatchObject({ status: 'refused', message: expect.stringMatching(/not a product element of project PRJ-NEW/) })
    expect(await checkProductReference(svc, 'PRJ-NEW', 'pe-1')).toMatchObject({ status: 'refused', message: expect.stringMatching(/missing in module/) })
    expect(await checkProductReference(svc, 'PRJ-NEW', 'pe-2')).toMatchObject({ status: 'refused', message: expect.stringMatching(/requirement, not a product element/) })
    expect(await checkProductReference(svc, 'PRJ-OTHER', 'pe-3')).toMatchObject({ status: 'refused' })
    expect(await checkProductReference(svc, 'PRJ-NEW', '  ')).toMatchObject({ status: 'refused' })
    expect(await checkProductReference({ projects: fakeProjects([], 'service down') }, 'PRJ-NEW', 'pe-3')).toMatchObject({ status: 'refused', message: expect.stringMatching(/service down/) })
  })

  it('without Project Management stores the ID unverified (never silently claims a check)', async () => {
    expect(await checkProductReference({}, 'PRJ-NEW', 'pe-9')).toMatchObject({ status: 'unverified', target: { module: 'product', kind: 'product-element', id: 'pe-9' } })
    expect(await checkProductReference(undefined, 'PRJ-NEW', 'pe-9')).toMatchObject({ status: 'unverified' })
  })
})

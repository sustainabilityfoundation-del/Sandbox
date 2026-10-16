import { describe, expect, it } from 'vitest'
import { seedModel } from '@ews/model-service'
import { LEGACY_COMPONENTS } from '../src/store/legacyProduct'

/**
 * The product registry imports the example components from a fixture (services may not import model-service).
 * This test fails if the fixture and the browser twin's seed diverge (ADR-0063 §4).
 */
describe('legacy product fixture', () => {
  it('matches the model-service seed (names, parents, properties, revisions)', () => {
    const model = seedModel()
    const components = model.objects.filter((o) => o.type === 'assembly' || o.type === 'part')
    expect(components.map((c) => c.id).sort()).toEqual(LEGACY_COMPONENTS.map((c) => c.alias).sort())
    for (const c of LEGACY_COMPONENTS) {
      const twin = components.find((o) => o.id === c.alias)!
      expect({ name: twin.name, type: twin.type, parent: twin.parentId ?? null, properties: twin.properties, revision: twin.revision }).toEqual({
        name: c.name,
        type: c.elementKind,
        parent: c.parent,
        properties: c.properties,
        revision: c.twinRevision,
      })
    }
  })
})

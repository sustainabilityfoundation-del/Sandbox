import { describe, expect, it } from 'vitest'
import { seedModel } from '../repository/seed'
import { resolveRepresentation } from './entities'
import { buildModelIndex } from './modelIndex'
import { composeSnapshot, mergeProjections, type ExternalProjection } from './projection'

const UUID = '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001'

describe('external projection (requirements owned by the Requirements service)', () => {
  const twin = seedModel()
  const projection: ExternalProjection = {
    objects: [{ id: UUID, type: 'requirement', name: 'Operating load (service)', properties: { key: 'REQ-001', statement: 'From the API.' }, revision: 3 }],
    aliases: new Map([['REQ-001', UUID]]),
    relationships: [{ id: 'svc-alloc-1', type: 'allocated-to', from: UUID, to: 'MTR-130', revision: 1 }],
    ownedRelationshipTypes: ['allocated-to'],
  }
  const composed = composeSnapshot(twin, projection)
  const model = buildModelIndex(composed, projection.aliases)

  it('replaces the legacy twin object with the canonical one and resolves the legacy ID', () => {
    expect(composed.objects.filter((o) => o.type === 'requirement').map((o) => o.id).sort()).toEqual([UUID, 'REQ-002', 'REQ-003'].sort())
    expect(model.get('REQ-001')?.id).toBe(UUID)
    expect(model.canonical('REQ-001')).toBe(UUID)
    expect(model.revisionOf('REQ-001')).toBe(3)
  })

  it('remaps twin links to the canonical ID and takes allocation only from the service', () => {
    expect(model.linked('SYS-005', 'references', 'out')).toEqual([UUID])
    expect(model.linked(UUID, 'allocated-to', 'out')).toEqual(['MTR-130'])
    expect(model.linked('REQ-001', 'allocated-to', 'out')).toEqual(['MTR-130'])
    // Unprojected twin requirements keep their twin allocation.
    expect(model.linked('REQ-002', 'allocated-to', 'out').length).toBeGreaterThan(0)
  })

  it('leaves the stored twin snapshot unchanged', () => {
    expect(twin.objects.some((o) => o.id === 'REQ-001')).toBe(true)
    expect(twin.relationships.some((r) => r.to === 'REQ-001')).toBe(true)
    expect(composeSnapshot(twin, null)).toBe(twin)
  })
})

describe('representation reasons name requirements by key', () => {
  it('uses the key, not the canonical UUID', () => {
    const twin = seedModel()
    const uuid = '5b1c7e2a-0003-4e6a-9c1d-6f0a3d2b1003'
    const projection: ExternalProjection = {
      objects: [{ id: uuid, type: 'requirement', name: 'Ingress protection', properties: { key: 'REQ-003', statement: 'IP65.' }, revision: 1 }],
      aliases: new Map([['REQ-003', uuid]]),
      relationships: [],
      ownedRelationshipTypes: ['allocated-to'],
    }
    const model = buildModelIndex(composeSnapshot(twin, projection), projection.aliases)
    const resolution = resolveRepresentation(model, uuid, 'sysml')
    expect(resolution).toMatchObject({ status: 'none', reason: 'REQ-003 is not referenced in the SysML model.' })
  })
})

describe('merging projections (requirements and product elements, CR-PM-MS-2)', () => {
  it('combines objects, aliases, relationships and owned types without changing the inputs', () => {
    const a: ExternalProjection = { objects: [{ id: 'r1', type: 'requirement', name: 'R', properties: {}, revision: 1 }], aliases: new Map([['REQ-001', 'r1']]), relationships: [{ id: 'svc:1', type: 'allocated-to', from: 'r1', to: 'p1', revision: 1 }], ownedRelationshipTypes: ['allocated-to'] }
    const b: ExternalProjection = { objects: [{ id: 'p1', type: 'part', name: 'Bracket', properties: {}, revision: 2 }], aliases: new Map(), relationships: [], ownedRelationshipTypes: [] }
    const merged = mergeProjections(a, null, b)!
    expect(merged.objects.map((o) => o.id)).toEqual(['r1', 'p1'])
    expect([...merged.aliases]).toEqual([['REQ-001', 'r1']])
    expect(merged.relationships).toHaveLength(1)
    expect(merged.ownedRelationshipTypes).toEqual(['allocated-to'])
    expect(mergeProjections(null, undefined)).toBeNull()
    expect(mergeProjections(a)).toBe(a)
    const empty = { project: { id: 'P', name: 'P' }, configurations: [{ id: 'CFG-BASE', name: 'B', description: '' }], scenarios: [], objects: [], relationships: [], modelRevision: 0 }
    const model = buildModelIndex(composeSnapshot(empty, merged), merged.aliases)
    expect(model.get('p1')?.name).toBe('Bracket')
    expect(model.linked('r1', 'allocated-to', 'out')).toEqual(['p1'])
  })
})

import { describe, expect, it } from 'vitest'
import { seedModel } from '../repository/seed'
import { buildModelIndex } from './modelIndex'
import { composeSnapshot, type ExternalProjection } from './projection'

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

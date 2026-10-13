import { describe, expect, it } from 'vitest'
import { seedModel } from '../repository/seed'
import { componentOf, readRequirement, representationsOf, requirementsFor, resolveRepresentation } from './entities'
import { buildModelIndex } from './modelIndex'

const model = buildModelIndex(seedModel())

describe('one physical identity, several representations', () => {
  it('links SysML and CAD representations to the same component instead of duplicating it', () => {
    expect(representationsOf(model, 'ROD-120', 'sysml').map((o) => o.id)).toEqual(['SYS-003'])
    expect(representationsOf(model, 'ROD-120', 'cad').map((o) => o.id)).toEqual(['CAD-120'])
    expect(componentOf(model, 'SYS-003')?.id).toBe('ROD-120')
    expect(componentOf(model, 'CAD-120')?.id).toBe('ROD-120')
    expect(model.objects.filter((o) => o.type === 'part' && o.name === 'Rod')).toHaveLength(1)
  })
})

describe('resolving a selection to a representation', () => {
  it('resolves a component, or another representation of it, through explicit relationships', () => {
    expect(resolveRepresentation(model, 'ROD-120', 'sysml')).toMatchObject({ status: 'resolved', ids: ['SYS-003'] })
    expect(resolveRepresentation(model, 'CAD-120', 'sysml')).toMatchObject({ status: 'resolved', ids: ['SYS-003'] })
    expect(resolveRepresentation(model, 'SYS-003', 'cad')).toMatchObject({ status: 'resolved', ids: ['CAD-120'] })
  })

  it('resolves requirements to their SysML reference, or to the CAD representations of allocated components', () => {
    expect(resolveRepresentation(model, 'REQ-001', 'sysml')).toMatchObject({ status: 'resolved', ids: ['SYS-005'] })
    expect(resolveRepresentation(model, 'REQ-001', 'cad')).toMatchObject({ status: 'resolved', ids: ['CAD-120', 'CAD-110'] })
  })

  it('explains, without guessing, when nothing is linked', () => {
    const none = resolveRepresentation(model, 'REQ-003', 'sysml')
    expect(none).toMatchObject({ status: 'none' })
    if (none.status === 'none') expect(none.reason).toContain('not referenced')
    expect(resolveRepresentation(model, 'ACT-100', 'cad')).toMatchObject({ status: 'none' })
    expect(resolveRepresentation(model, 'NOPE-1', 'cad')).toMatchObject({ status: 'none' })
  })
})

describe('typed entity readers', () => {
  it('reads requirements with defaults for data saved before status and rationale existed', () => {
    const legacy = readRequirement({ id: 'REQ-9', type: 'requirement', name: 'Old', properties: { statement: 'S' }, revision: 1 })
    expect(legacy).toMatchObject({ status: 'draft', statusSet: false, rationale: '' })
    expect(readRequirement(model.get('REQ-001')!)).toMatchObject({ status: 'approved', statusSet: true })
  })

  it('collects requirements allocated directly or via a parent assembly', () => {
    expect(requirementsFor(model, 'ROD-120').map((r) => [r.requirement.id, r.via])).toEqual([
      ['REQ-001', 'direct'],
      ['REQ-002', 'ACT-100'],
    ])
  })
})

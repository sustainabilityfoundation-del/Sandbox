import { describe, expect, it } from 'vitest'
import { allocationRequest, allocationTargetLabel } from './allocations'

describe('allocation requests (shared by the UI and the assistant)', () => {
  const r = { id: 'R', revision: 3 }
  it('targets the right field and carries the revision', () => {
    expect(allocationRequest(r, { kind: 'component', id: ' ROD-120 ' })).toEqual({ type: 'allocated-to', fromId: 'R', toTwinId: 'ROD-120', expectedFromRevision: 3 })
    expect(allocationRequest(r, { kind: 'product-element', id: 'E' }, { reason: 'x' })).toEqual({ type: 'allocated-to', fromId: 'R', toTwinId: 'E', expectedFromRevision: 3, reason: 'x' })
    expect(allocationRequest(r, { kind: 'sysml-model-element', id: 'P/E' })).toEqual({ type: 'allocated-to', fromId: 'R', toSysmlElement: 'P/E', expectedFromRevision: 3 })
  })
  it('labels SysML targets with their commit', () => {
    expect(allocationTargetLabel({ toTwinId: 'P/E', targetKind: 'sysml-model-element', toTargetRevision: 4 })).toBe('SysML P/E (commit #4)')
    expect(allocationTargetLabel({ toTwinId: 'ROD-120', targetKind: 'twin' })).toBe('ROD-120')
  })
})

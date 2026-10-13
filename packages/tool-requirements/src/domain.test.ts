import { sampleModel } from '@ews/platform-sdk/testing'
import { describe, expect, it } from 'vitest'
import { INITIAL_VIEW_STATE, filterRequirements, selectedComponent, selectedRequirementIds, sysmlTrace } from './domain'

const model = sampleModel()
const ids = (r: { visible: { id: string }[] }) => r.visible.map((o) => o.id)

describe('requirements filtering', () => {
  it('filters to the requirements allocated to the selected component', () => {
    expect(ids(filterRequirements(model, INITIAL_VIEW_STATE, ['ROD-120']))).toEqual(['REQ-001'])
    expect(ids(filterRequirements(model, INITIAL_VIEW_STATE, ['HSG-110']))).toEqual(['REQ-001', 'REQ-003'])
  })

  it('resolves SysML and CAD representations to their component', () => {
    expect(selectedComponent(model, ['SYS-003'])?.id).toBe('ROD-120')
    expect(selectedComponent(model, ['CAD-110'])?.id).toBe('HSG-110')
    expect(ids(filterRequirements(model, INITIAL_VIEW_STATE, ['CAD-120']))).toEqual(['REQ-001'])
  })

  it('highlights the requirement a SysML requirement usage references', () => {
    expect(selectedRequirementIds(model, ['SYS-005'])).toEqual(['REQ-001'])
  })

  it('searches IDs, titles, statements and rationale, and filters by status', () => {
    const all = { ...INITIAL_VIEW_STATE, filterMode: 'all' as const }
    expect(ids(filterRequirements(model, { ...all, search: 'wash-down' }, []))).toEqual(['REQ-003'])
    expect(ids(filterRequirements(model, { ...all, statusFilter: 'approved' }, []))).toEqual(['REQ-001', 'REQ-002'])
  })

  it('traces a requirement to its SysML usage and the parts that satisfy it', () => {
    const trace = sysmlTrace(model, 'REQ-001')
    expect(trace.references.map((o) => o.id)).toEqual(['SYS-005'])
    expect(trace.satisfiedBy.map((o) => o.id)).toEqual(['SYS-003'])
  })
})

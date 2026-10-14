import { sampleModel } from '@ews/platform-sdk/testing'
import { describe, expect, it } from 'vitest'
import {
  INITIAL_VIEW_STATE,
  eligibleBaselines,
  filterRequirements,
  readVerificationRecord,
  selectedComponent,
  selectedRequirementIds,
  sysmlTrace,
  verificationArtifact,
  verificationState,
} from './domain'

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

describe('verification records', () => {
  const req = model.get('REQ-001')!
  const components = model.linkedObjects('REQ-001', 'allocated-to', 'out')
  const draft = { requirement: req, components, method: 'Test', outcome: 'pass' as const, procedure: ' TP-12 run 3 ', baselineId: 'BL-001' }
  const record = (over: Partial<{ stale: boolean; createdAt: string; outcome: string }> = {}) => {
    const a = verificationArtifact(draft)
    return readVerificationRecord(
      {
        ...a,
        id: 'OUT-0001',
        toolId: 'requirements',
        projectId: 'P',
        configurationId: 'CFG-BASE',
        scenarioId: null,
        inputRevision: 1,
        createdAt: over.createdAt ?? '2026-10-13T10:00:00Z',
        reviewStatus: 'draft',
        schemaVersion: 1,
        result: a.result.map((r) => (r.key === 'outcome' && over.outcome ? { ...r, value: over.outcome } : r)),
        freshness: { stale: over.stale ?? false, reasons: over.stale ? ['REQ-001 changed'] : [] },
      },
      'REQ-001',
    )
  }

  it('pins the requirement revision, configured article, procedure and inputs', () => {
    const a = verificationArtifact(draft)
    expect(a.kind).toBe('verification-record')
    expect(a.references).toEqual([
      { id: 'REQ-001', revision: req.revision, role: 'verifies' },
      { id: 'BL-001', role: 'baseline' },
    ])
    expect(a.inputs.map((i) => i.id)).toEqual(['REQ-001', ...components.map((c) => c.id)])
    const view = record()
    expect(view).toMatchObject({ method: 'Test', outcome: 'pass', procedure: 'TP-12 run 3', requirementRevision: req.revision, baselineId: 'BL-001' })
  })

  it('derives status from the newest record, treating stale passes as stale', () => {
    expect(verificationState([])).toBe('not-verified')
    expect(verificationState([record()])).toBe('verified')
    expect(verificationState([record({ stale: true })])).toBe('stale')
    expect(verificationState([record({ createdAt: '2026-10-13T09:00:00Z' }), record({ outcome: 'fail', createdAt: '2026-10-13T11:00:00Z' })])).toBe('failed')
  })

  it('offers only baselines of the same configuration pinning the current revision', () => {
    const base = { name: 'x', description: '', projectId: 'P', modelRevision: 1, createdAt: '', createdBy: 'platform', scenarios: [], relationships: [] }
    const result = eligibleBaselines(
      [
        { ...base, id: 'BL-001', configurationId: 'CFG-BASE', objects: [{ id: 'REQ-001', revision: req.revision }] },
        { ...base, id: 'BL-002', configurationId: 'CFG-BASE', objects: [{ id: 'REQ-001', revision: req.revision - 1 }] },
        { ...base, id: 'BL-003', configurationId: 'CFG-OTHER', objects: [] },
      ],
      req,
      'CFG-BASE',
    )
    expect(result.map((r) => r.reason)).toEqual([undefined, `pins REQ-001 rev ${req.revision - 1}`, 'for CFG-OTHER'])
  })
})

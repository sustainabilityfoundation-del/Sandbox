import { sampleModel } from '@ews/platform-sdk/testing'
import type { RequirementsModuleClient } from '@ews/requirements-client'
import { afterEach, describe, expect, it } from 'vitest'
import { requirementsAssistant } from './assistant'
import { resetProposals, setAssistantConnection } from './proposals'

const REQ = { id: '5b1c7e2a-0003-4e6a-9c1d-6f0a3d2b1003', key: 'REQ-003', revision: 2, statement: 'The housing shall provide ingress protection to IP65.', rationale: 'Wash-down.', title: 'Ingress protection', status: 'in-review', legacyIds: ['REQ-003'] }
const fakeClient = {
  resolve: async (key: string) => (key === 'REQ-003' ? REQ : Promise.reject(new Error('not found'))),
  getRequirement: async () => REQ,
  list: async (q: { allocatedTo?: string }) => ({ items: q.allocatedTo?.includes('HSG-110') ? [REQ] : [], total: 1 }),
  quality: async () => ({ revision: 2, findings: [{ class: 'heuristic', message: 'x', explanation: 'y', suggestion: 'z', dismissal: undefined }], disclaimer: 'judgement' }),
} as unknown as RequirementsModuleClient

const action = (name: string) => requirementsAssistant.actions.find((a) => a.name === name)!
const ctx = { model: sampleModel(), artifacts: [], captured: { projectId: 'PRJ-ACT100', configurationId: 'CFG-BASE', scenarioId: 'SCN-NOM', modelRevision: 1, selectionIds: [] } }
afterEach(() => resetProposals())

describe('assistant actions in API mode', () => {
  it('without a connected service, keeps the twin behaviour', async () => {
    const r = await action('requirements.update').run({ requirementId: 'REQ-003', statement: 'New' }, ctx)
    expect(r.kind).toBe('proposal')
  })
  it('records a proposal with the expected revision instead of a twin change; nothing is applied', async () => {
    setAssistantConnection({ client: fakeClient, projectId: 'PRJ-ACT100' })
    const r = await action('requirements.update').run({ requirementId: 'REQ-003', statement: 'The housing shall provide IP66.' }, ctx)
    expect(r).toMatchObject({ kind: 'data', data: { key: 'REQ-003', basedOnRevision: 2 } })
    const p = (r as { data: { proposalId: string } }).data.proposalId
    expect(p).toMatch(/^RQP-/)
  })
  it('refuses status changes: they are reviews and transitions, not edits', async () => {
    setAssistantConnection({ client: fakeClient, projectId: 'PRJ-ACT100' })
    await expect(action('requirements.update').run({ requirementId: 'REQ-003', status: 'approved' }, ctx)).rejects.toThrow(/review decisions/)
  })
  it('reads allocated requirements and quality explanations from the service', async () => {
    setAssistantConnection({ client: fakeClient, projectId: 'PRJ-ACT100' })
    const read = await action('requirements.read_for_component').run({ objectId: 'CAD-110' }, ctx)
    expect((read as { data: { requirements: { key: string }[] } }).data.requirements.map((x) => x.key)).toEqual(['REQ-003'])
    const q = await action('requirements.explain_quality').run({ requirementId: 'REQ-003' }, ctx)
    expect(q).toMatchObject({ kind: 'data', data: { key: 'REQ-003', disclaimer: 'judgement' } })
  })
})

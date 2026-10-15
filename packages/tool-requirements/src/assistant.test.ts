import type { AssistantActionContext, ServiceProposal } from '@ews/platform-sdk'
import { sampleModel } from '@ews/platform-sdk/testing'
import { createDemoRequirementsService } from '@ews/requirements-client'
import { describe, expect, it } from 'vitest'
import { requirementsAssistant } from './assistant'

/**
 * Headless operations (integration milestone 1, C9): no Requirements view is mounted in these tests.
 * The service comes from the action context only. API mode with the module client is tested against
 * the real API in services/api/test/assistant.test.ts.
 */
const action = (name: string) => requirementsAssistant.actions.find((a) => a.name === name)!
const captured = { projectId: 'PRJ-ACT100', configurationId: 'CFG-BASE', scenarioId: 'SCN-NOM', modelRevision: 1, selectionIds: [] }
const twinOnly: AssistantActionContext = { model: sampleModel(), artifacts: [], captured }
const withDemo = (): AssistantActionContext & { services: { requirements: ReturnType<typeof createDemoRequirementsService> } } => ({ ...twinOnly, services: { requirements: createDemoRequirementsService() } })
const provenance = { conversationId: 'c1', proposalId: 'p1', messageId: 'm1' }

describe('assistant actions without a service', () => {
  it('keep the twin behaviour', async () => {
    const r = await action('requirements.update').run({ requirementId: 'REQ-003', statement: 'New' }, twinOnly)
    expect(r.kind).toBe('proposal')
    expect((await action('requirements.read_for_component').run({ objectId: 'HSG-110' }, twinOnly)).kind).toBe('data')
  })
  it('explain that service operations need the service', async () => {
    await expect(action('requirements.search').run({ text: 'load' }, twinOnly)).rejects.toThrow(/not available/)
  })
})

describe('assistant actions headless with the demo service (no view mounted)', () => {
  it('search reads the service for the captured project', async () => {
    const r = await action('requirements.search').run({ text: 'motor' }, withDemo())
    expect(r).toMatchObject({ kind: 'data' })
    expect((r as { data: { requirements: { key: string }[] } }).data.requirements.map((x) => x.key)).toContain('REQ-005')
  })

  it('update prepares a service proposal; nothing changes until Apply; Apply writes revision 2; Undo writes revision 3', async () => {
    const ctx = withDemo()
    const p = (await action('requirements.update').run({ requirementId: 'REQ-005', statement: 'The motor shall deliver at least 400 W.' }, ctx)) as ServiceProposal
    expect(p).toMatchObject({ kind: 'service-proposal', module: 'requirements', preview: [{ label: 'REQ-005 Statement', proposed: 'The motor shall deliver at least 400 W.', basis: 'user-statement' }] })
    const before = await ctx.services.requirements.resolve('REQ-005', { projectId: 'PRJ-ACT100' })
    expect(before?.revision).toBe(1)
    expect(await p.apply(provenance)).toMatchObject({ summary: expect.stringMatching(/revision 2/) })
    expect((await ctx.services.requirements.resolve('REQ-005', { projectId: 'PRJ-ACT100' }))?.statement).toBe('The motor shall deliver at least 400 W.')
    await p.undo!({})
    const after = await ctx.services.requirements.resolve('REQ-005', { projectId: 'PRJ-ACT100' })
    expect(after).toMatchObject({ revision: 3, statement: before!.statement })
  })

  it('a stale proposal is refused at Apply with the conflict, not applied with a changed intention', async () => {
    const ctx = withDemo()
    const p = (await action('requirements.update').run({ requirementId: 'REQ-005', statement: 'From the assistant.' }, ctx)) as ServiceProposal
    const r = (await ctx.services.requirements.resolve('REQ-005', { projectId: 'PRJ-ACT100' }))!
    await ctx.services.requirements.update(r.id, { statement: 'Changed meanwhile by a person.' }, { expectedRevision: 1, projectId: 'PRJ-ACT100' })
    await expect(p.apply(provenance)).rejects.toMatchObject({ code: 'conflict' })
    expect((await ctx.services.requirements.resolve('REQ-005', { projectId: 'PRJ-ACT100' }))?.statement).toBe('Changed meanwhile by a person.')
  })

  it('refuses status changes, unchanged text and unknown requirements', async () => {
    await expect(action('requirements.update').run({ requirementId: 'REQ-003', status: 'approved' }, withDemo())).rejects.toThrow(/review decisions/)
    const r = (await withDemo().services.requirements.resolve('REQ-005', { projectId: 'PRJ-ACT100' }))!
    await expect(action('requirements.update').run({ requirementId: 'REQ-005', statement: r.statement }, withDemo())).rejects.toMatchObject({ code: 'no-op' })
    await expect(action('requirements.update').run({ requirementId: 'REQ-999', statement: 'x' }, withDemo())).rejects.toMatchObject({ code: 'not-found' })
  })

  it('read_for_component uses the twin and quality explains that it needs the API', async () => {
    expect((await action('requirements.read_for_component').run({ objectId: 'CAD-110' }, withDemo())).kind).toBe('data')
    await expect(action('requirements.explain_quality').run({ requirementId: 'REQ-005' }, withDemo())).rejects.toMatchObject({ code: 'not-available' })
  })
})

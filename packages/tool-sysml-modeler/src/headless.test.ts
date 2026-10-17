import type { AssistantActionContext, PlatformServices, RequirementSummary, ServiceProposal } from '@ews/platform-sdk'
import { createLocalSysmlClient, SysmlClientError } from '@ews/sysml-client'
import { describe, expect, it } from 'vitest'
import { createSysmlModelerTool } from '.'
import { sysmlModelerDemo } from './assistant'
import { representations, requirementCoverage, serialize } from '@ews/sysml-core'
import { ModelerSession, sessionCount } from './session'

/**
 * C9 (integration-milestone-1.md §4): every `sysml-modeler.*` assistant operation works with no SysML
 * Modeler view mounted (all tabs closed). The model is loaded headlessly from the repository; no view
 * session is created. The UI path and the assistant path refuse the same invalid command identically.
 */

const REQ: RequirementSummary = { id: '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001', key: 'REQ-001', title: 'Operating load', statement: 'The actuator shall push 500 N.', status: 'approved', revision: 4 } as RequirementSummary

function headless() {
  const client = createLocalSysmlClient({ seed: true })
  const tool = createSysmlModelerTool({ client })
  const services = { requirements: { get: async (id: string) => (id === REQ.id ? REQ : undefined), resolve: async (key: string) => (key === REQ.key ? REQ : undefined) } } as unknown as PlatformServices
  const ctx = { model: undefined as never, artifacts: [], captured: { projectId: 'PRJ-ACT100', configurationId: 'CFG', scenarioId: 'SCN', modelRevision: 1, selectionIds: [] }, services } satisfies AssistantActionContext
  const run = (name: string, args: Record<string, unknown>) => tool.assistant!.actions.find((a) => a.name === `sysml-modeler.${name}`)!.run(args, ctx)
  return { client, tool, ctx, run }
}

const CALLS: Record<string, Record<string, unknown>> = {
  describe_commands: {},
  find_elements: { text: 'Motor' },
  read_element: { element: 'ActuatorSystem::Mechanical::Rod' },
  validate: {},
  impact: { element: 'ActuatorSystem::Electrical::BrushlessMotor' },
  explain_commit: { commit: 'latest' },
  matrix: { kind: 'satisfy' },
  coverage: {},
  behavior: { view: 'state-transition' },
  propose_commands: { title: 'Add a brake', explanation: 'Hold the load.', commands: [{ op: 'createElement', ownerId: 'ActuatorSystem::Mechanical', kind: 'PartDefinition', name: 'Brake' }] },
  propose_text: { namespace: 'ActuatorSystem', mode: 'append', title: 'Add a package', explanation: 'Thermal', text: 'package Thermal { part def Fan; }' },
  link_requirement: { element: 'ActuatorSystem::Requirements::load', requirement: 'REQ-001' },
  link_product_element: { element: 'ActuatorSystem::Mechanical::Rod', productElement: '7d1f3c2e-8b1a-4c55-9e0f-1a2b3c4d5e6f' },
  create_project: { name: 'Second model', initialText: 'package Second;' },
  import_requirement: { requirement: 'REQ-001', satisfiedBy: ['ActuatorSystem::Mechanical::Rod'] },
  satisfy_requirement: { requirements: [{ requirement: 'REQ-001', satisfiedBy: ['ActuatorSystem::Mechanical::Rod'] }] },
}

describe('assistant operations without a mounted view (headless, C9)', () => {
  it('every operation succeeds with no view open and opens no view session', async () => {
    const { tool, run } = headless()
    const sessionsBefore = sessionCount()
    expect(Object.keys(CALLS).sort()).toEqual(tool.assistant!.actions.map((a) => a.name.replace('sysml-modeler.', '')).sort())
    for (const [name, args] of Object.entries(CALLS)) {
      const out = await run(name, args)
      expect(out, name).toBeTruthy()
      if ((out as ServiceProposal).kind === 'service-proposal') {
        const p = out as ServiceProposal
        expect(p.preview.length, name).toBeGreaterThan(0)
        const applied = await p.apply({ conversationId: 'c', proposalId: `p-${name}`, messageId: 'm' })
        expect(applied.summary, name).toMatch(/^(Commit #\d+|Created SysML project)/)
      } else expect((out as { kind: string }).kind, name).toBe('data')
    }
    expect(sessionCount()).toBe(sessionsBefore)
  })

  it('the UI path and the assistant path refuse the same invalid command identically', async () => {
    const { client, run } = headless()
    const ui = new ModelerSession(client)
    await ui.open('PRJ-ACT100')
    for (const command of [
      { op: 'createElement', ownerId: 'ActuatorSystem::NoSuchPackage', kind: 'PartDefinition', name: 'X' },
      { op: 'rename', elementId: 'ActuatorSystem::Mechanical::Rod', name: '' },
    ]) {
      const uiError = await ui.run([command as never]).then(
        () => undefined,
        (e: unknown) => e,
      )
      expect(uiError, JSON.stringify(command)).toBeInstanceOf(SysmlClientError)
      const aiError = await Promise.resolve().then(() => run('propose_commands', { title: 't', explanation: 'e', commands: [command] })).then(
        () => undefined,
        (e: unknown) => e as Error,
      )
      expect(aiError, JSON.stringify(command)).toBeInstanceOf(Error)
      // Same refusal text (the assistant adds diagnostics and "Nothing was proposed").
      expect(aiError!.message.startsWith((uiError as SysmlClientError).message)).toBe(true)
    }
    ui.dispose()
  })

  it('the demo planner links requirements by key', () => {
    expect(sysmlModelerDemo!('Link the requirement ActuatorSystem::Requirements::load to REQ-001', { selectionIds: [] })?.calls[0]).toMatchObject({ name: 'sysml-modeler.link_requirement', arguments: { element: 'ActuatorSystem::Requirements::load', requirement: 'REQ-001' } })
  })

  it('validation errors: the assistant refuses (reject-new-errors); the UI commits and reports them (documented policy difference)', async () => {
    const { client, run } = headless()
    const command = { op: 'setValue', elementId: 'ActuatorSystem::Mechanical::Rod::mass', expression: '3 [m]' }
    await expect(Promise.resolve().then(() => run('propose_commands', { title: 't', explanation: 'e', commands: [command] }))).rejects.toThrow(/SYSML-UNIT-DIMENSION/)
    const ui = new ModelerSession(client)
    await ui.open('PRJ-ACT100')
    // With the assistant's policy, the UI path refuses it in the same way.
    await expect(ui.run([command as never], { validationPolicy: 'reject-new-errors' })).rejects.toBeInstanceOf(SysmlClientError)
    const out = await ui.run([command as never])
    expect(out.diagnostics.introduced.map((d) => d.ruleId)).toContain('SYSML-UNIT-DIMENSION')
    ui.dispose()
  })
})

describe('import_requirement (AUD-5)', () => {
  const REQ2 = { id: '5b1c7e2a-0002-4e6a-9c1d-6f0a3d2b1002', key: 'REQ-002', title: 'Stroke', statement: 'x', status: 'approved', revision: 2 }
  const withTwo = () => {
    const h = headless()
    const base = h.ctx.services as unknown as { requirements: { get: (id: string) => Promise<unknown>; resolve: (k: string) => Promise<unknown> } }
    const all = [REQ, REQ2]
    base.requirements.get = async (id) => all.find((r) => r.id === id)
    base.requirements.resolve = async (k) => all.find((r) => r.key === k)
    return h
  }
  const modelOf = async (client: ReturnType<typeof createLocalSysmlClient>) => {
    const [p] = await client.listProjects('PRJ-ACT100')
    const branch = await client.getBranch(p.id, p.defaultBranchId)
    return client.loadModel(p.id, branch.headCommitId!)
  }

  it('is previewed, pins id/revision/key/title, adds satisfy, and a second import changes nothing (one element)', async () => {
    const { client, run } = withTwo()
    const first = (await run('import_requirement', { requirement: 'REQ-002', satisfiedBy: ['ActuatorSystem::Mechanical::Rod'] })) as ServiceProposal
    expect(first.kind).toBe('service-proposal')
    expect(first.preview.length).toBeGreaterThan(0)
    expect((await modelOf(client)).elements()).toBeTruthy()
    expect(requirementCoverage(await modelOf(client)).requirements.filter((r) => r.managed?.requirementId === REQ2.id)).toHaveLength(0) // nothing written before Apply
    await first.apply({ conversationId: 'c', proposalId: 'p1', messageId: 'm' })
    const cov = requirementCoverage(await modelOf(client)).requirements.filter((r) => r.managed?.requirementId === REQ2.id)
    expect(cov).toHaveLength(1)
    expect(cov[0]).toMatchObject({ managed: { requirementId: REQ2.id, revision: 2, requirementKey: 'REQ-002', title: 'Stroke' }, status: 'satisfied' })
    const again = (await run('import_requirement', { requirement: 'REQ-002', satisfiedBy: ['ActuatorSystem::Mechanical::Rod'] })) as { kind: string; summary: string }
    expect(again.kind).toBe('data')
    expect(again.summary).toMatch(/already contains this; nothing to change/)
    // A different satisfying part adds only the missing link, on the same element.
    const more = (await run('import_requirement', { requirement: 'REQ-002', satisfiedBy: ['ActuatorSystem::Mechanical::Rod', 'ActuatorSystem::Mechanical::Gearbox'] })) as ServiceProposal
    await more.apply({ conversationId: 'c', proposalId: 'p2', messageId: 'm' })
    const final = requirementCoverage(await modelOf(client)).requirements.filter((r) => r.managed?.requirementId === REQ2.id)
    expect(final).toHaveLength(1)
    expect(final[0].satisfiedBy).toHaveLength(2)
  })

  it('refuses without the Requirements service and for an unknown requirement', async () => {
    const { ctx, tool } = headless()
    const action = tool.assistant!.actions.find((a) => a.name === 'sysml-modeler.import_requirement')!
    await expect(action.run({ requirement: 'REQ-001' }, { ...ctx, services: {} as PlatformServices })).rejects.toThrow(/Requirements service is not available/)
    await expect(action.run({ requirement: 'REQ-404' }, ctx)).rejects.toThrow(/No managed requirement REQ-404/)
  })
})

describe('project scoping in the client and assistant (C13)', () => {
  it('sessions are per platform project, and the assistant refuses SysML projects of another platform project', async () => {
    const { client, run } = headless()
    const other = await client.createProject({ name: 'Other', platformProjectId: 'PRJ-OTHER', initialText: 'package Other { part def Secret; }' })
    const a = new ModelerSession(client)
    const b = new ModelerSession(client)
    await a.open('PRJ-ACT100')
    await b.open('PRJ-OTHER')
    expect(a.getState().project!.id).not.toBe(b.getState().project!.id)
    expect(serialize(a.getState().model!)).not.toContain('Secret')
    await expect(Promise.resolve().then(() => run('read_element', { element: 'Other::Secret', projectId: other.id }))).rejects.toThrow(/belongs to platform project PRJ-OTHER/)
    await expect(Promise.resolve().then(() => run('propose_commands', { projectId: other.id, title: 't', explanation: 'e', commands: [{ op: 'createElement', ownerId: 'Other', kind: 'PartDefinition', name: 'X' }] }))).rejects.toThrow(/belongs to platform project PRJ-OTHER/)
    a.dispose()
    b.dispose()
  })
})

describe('D1-SYS: architecture step through the assistant in a new, empty platform project', () => {
  it('creates the project, decomposes, links requirements and product elements, validates without errors', async () => {
    const { runD1Sequence, D1_PRODUCT, D1_REQUIREMENT } = await import('../test/d1-sequence')
    const client = createLocalSysmlClient({ seed: true })
    const tool = createSysmlModelerTool({ client })
    const before = sessionCount()
    const out = await runD1Sequence(tool as never, 'PRJ-D1-NEW')
    expect(out.validationErrors).toBe(0)
    expect(out.coverage).toEqual([expect.objectContaining({ requirement: expect.stringContaining('gripForce'), status: 'satisfied' })])
    expect(out.steps).toHaveLength(5)
    expect(sessionCount()).toBe(before)
    const [p] = await client.listProjects('PRJ-D1-NEW')
    const branch = await client.getBranch(p.id, p.defaultBranchId)
    const model = await client.loadModel(p.id, branch.headCommitId!)
    const text = serialize(model)
    expect(representations(model).map((r) => r.ref)).toEqual([
      { module: 'product', kind: 'product-element', id: D1_PRODUCT.finger, revision: 3 },
      { module: 'product', kind: 'product-element', id: D1_PRODUCT.gripper, revision: 3 },
    ].sort((a, b) => (representations(model).findIndex((r) => r.ref.id === a.id) - representations(model).findIndex((r) => r.ref.id === b.id))))
    expect(requirementCoverage(model).requirements[0].managed).toEqual({ requirementId: D1_REQUIREMENT.id, revision: 2 })
    expect(text).toContain('action def GraspPart')
  })
})

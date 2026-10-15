import type { AssistantActionContext, PlatformServices, RequirementSummary, ServiceProposal } from '@ews/platform-sdk'
import { createLocalSysmlClient, SysmlClientError } from '@ews/sysml-client'
import { describe, expect, it } from 'vitest'
import { createSysmlModelerTool } from '.'
import { sysmlModelerDemo } from './assistant'
import { serialize } from '@ews/sysml-core'
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
        expect(applied.summary, name).toMatch(/^Commit #\d+/)
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

import { validateHelpManifest, type AssistantActionContext, type ServiceProposal } from '@ews/platform-sdk'
import { createLocalSysmlClient, LOCAL_SEED_PROJECT_ID } from '@ews/sysml-client'
import { ACTUATOR_EXAMPLE, applyTransaction, loadText, resolveRef, serialize } from '@ews/sysml-core'
import { describe, expect, it } from 'vitest'
import { createSysmlModelerTool } from '.'
import { sysmlModelerDemo } from './assistant'
import { connectableEnds, generalView, interconnectionView } from './projection/graph'
import { getClient } from './session'

const model = () => loadText(ACTUATOR_EXAMPLE).model
const id = (m: ReturnType<typeof model>, qn: string) => resolveRef(m, qn)['@id']

describe('view projections (diagrams are computed from the model)', () => {
  it('General View: definitions with compartments and specialization / composition / satisfy edges', () => {
    const m = model()
    const g = generalView(m, id(m, 'ActuatorSystem'))
    const la = g.nodes.find((n) => n.name === 'LinearActuator')!
    expect(la.keyword).toBe('part def')
    expect(la.compartments.find((c) => c.title === 'attributes')!.items.map((i) => i.text)).toContain('totalMass : MassValue = 1.85 [kg]')
    const comp = g.edges.filter((e) => e.kind === 'composition' && e.source === la.id)
    expect(comp.map((e) => e.label).sort()).toContain('motor')
    expect(g.edges.filter((e) => e.kind === 'satisfy')).toHaveLength(3)
    expect(g.edges.some((e) => e.kind === 'allocate')).toBe(true)
  })

  it('Interconnection View: parts with their ports, connections and flows between ports', () => {
    const m = model()
    const g = interconnectionView(m, id(m, 'ActuatorSystem::Architecture::LinearActuator'))
    const root = g.nodes[0]
    expect(root.children.map((c) => c.elementId)).toHaveLength(9)
    const driver = root.children.find((c) => c.name.startsWith('driver'))!
    expect(driver.ports.map((p) => p.name).sort()).toEqual(['command', 'phaseOut', 'powerIn'])
    expect(driver.ports.find((p) => p.name === 'powerIn')!.conjugated).toBe(true)
    expect(g.edges.map((e) => e.kind).sort()).toEqual(['connection', 'connection', 'connection', 'flow', 'flow', 'interface'])
    const flow = g.edges.find((e) => e.kind === 'flow' && e.label?.includes('PositionMeasurement'))!
    expect(flow.source).toContain('/')
    expect(g.notes).toEqual([])
  })

  it('projections follow model changes (no separate diagram data)', () => {
    const m = model()
    const r = applyTransaction(m, { commands: [{ op: 'createElement', ownerId: 'ActuatorSystem::Architecture::LinearActuator', kind: 'PartUsage', name: 'brake', typeIds: ['ActuatorSystem::Mechanical::Housing'] }] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const g = interconnectionView(r.model, id(r.model, 'ActuatorSystem::Architecture::LinearActuator'))
    expect(g.nodes[0].children.some((c) => c.name.startsWith('brake'))).toBe(true)
    expect(connectableEnds(r.model, id(r.model, 'ActuatorSystem::Architecture::LinearActuator')).map((e) => e.chain)).toContain('driver.powerIn')
  })
})

describe('tool definition', () => {
  it('has the agreed identity and a valid help manifest that maps every toolbar item and action', () => {
    const tool = createSysmlModelerTool({ client: createLocalSysmlClient({ seed: true }) })
    expect(tool).toMatchObject({ id: 'sysml-modeler', name: 'SysML Modeler', category: 'Systems engineering', entitlement: 'tool:sysml' })
    expect(validateHelpManifest(tool.help!)).toEqual([])
    const items = tool.toolbar({ api: { updateViewState: () => undefined } as never, viewState: tool.initialViewState, context: { projectId: 'PRJ-ACT100' } as never, model: undefined as never, selection: [] })
    const mapped = new Set(tool.help!.contextMappings.map((c) => c.toolbarItem).filter(Boolean))
    expect(items.filter((i) => i.type !== 'separator').map((i) => i.id).filter((x) => !mapped.has(x))).toEqual([])
    const ops = new Set(tool.help!.contextMappings.map((c) => c.operation).filter(Boolean))
    expect(tool.assistant!.actions.map((a) => a.name).filter((n) => !ops.has(n))).toEqual([])
  })
})

describe('assistant operations (same commands, previewed proposals, provenance, undo)', () => {
  const setup = () => {
    const tool = createSysmlModelerTool({ client: createLocalSysmlClient({ seed: true }) })
    const ctx = { model: undefined as never, artifacts: [], captured: { projectId: 'PRJ-ACT100', configurationId: 'CFG', scenarioId: 'SCN', modelRevision: 1, selectionIds: [] } } satisfies AssistantActionContext
    const action = (name: string) => tool.assistant!.actions.find((a) => a.name === `sysml-modeler.${name}`)!
    return { tool, ctx, action, client: getClient()! }
  }

  it('reads: schema discovery, find, read, validate, impact', async () => {
    const { ctx, action } = setup()
    const schema = await action('describe_commands').run({}, ctx)
    expect(schema.kind === 'data' && (schema.data as { commands: unknown[] }).commands.length).toBeGreaterThan(10)
    const found = await action('find_elements').run({ text: 'Motor', metaclass: 'PartDefinition' }, ctx)
    expect(found.kind === 'data' && (found.data as { elements: { qualifiedName: string }[] }).elements.map((e) => e.qualifiedName)).toContain('ActuatorSystem::Electrical::BrushlessMotor')
    const read = await action('read_element').run({ element: 'ActuatorSystem::Mechanical::Rod' }, ctx)
    expect(read.kind === 'data' && (read.data as { text: string }).text).toContain('part def Rod {')
    const v = await action('validate').run({}, ctx)
    expect(v.kind === 'data' && (v.data as { counts: { error: number } }).counts.error).toBe(0)
    const imp = await action('impact').run({ element: 'ActuatorSystem::Electrical::BrushlessMotor' }, ctx)
    expect(imp.kind === 'data' && JSON.stringify(imp.data)).toContain('LinearActuator::motor')
  })

  it('proposes a change without writing, applies it with provenance, explains it, and undoes it', async () => {
    const { ctx, action, client } = setup()
    const before = await client.getBranch(LOCAL_SEED_PROJECT_ID, (await client.getProject(LOCAL_SEED_PROJECT_ID)).defaultBranchId)
    const proposal = (await action('propose_commands').run(
      { title: 'Add a brake', explanation: 'The load must be held when unpowered.', commands: [{ op: 'createElement', ownerId: 'ActuatorSystem::Mechanical', kind: 'PartDefinition', name: 'Brake', ref: '$b' }, { op: 'createElement', ownerId: '$b', kind: 'AttributeUsage', name: 'holdingTorque', typeIds: ['ISQ::TorqueValue'], value: '1.5 [Nm]' }] },
      ctx,
    )) as ServiceProposal
    expect(proposal.kind).toBe('service-proposal')
    expect(proposal.preview.map((p) => p.proposed)).toEqual(['ActuatorSystem::Mechanical::Brake'])
    expect((await client.getBranch(LOCAL_SEED_PROJECT_ID, before.id)).headCommitId).toBe(before.headCommitId)
    const applied = await proposal.apply({ conversationId: 'conv-1', proposalId: 'P-7', messageId: 'm-3' })
    expect(applied.summary).toMatch(/Commit #2: Created ActuatorSystem::Mechanical::Brake/)
    const explained = await action('explain_commit').run({ commit: 'latest' }, ctx)
    expect(explained.kind === 'data' && explained.data).toMatchObject({ number: 2, why: 'The load must be held when unpowered.', source: { kind: 'assistant', conversationId: 'conv-1', proposalId: 'P-7' } })
    const undone = await proposal.undo!({ createdIds: applied.createdIds })
    expect(undone.summary).toMatch(/Undo commit 2/)
    const head = (await client.getBranch(LOCAL_SEED_PROJECT_ID, before.id)).headCommitId!
    expect(serialize(await client.loadModel(LOCAL_SEED_PROJECT_ID, head))).not.toContain('Brake')
  })

  it('refuses to propose changes that would introduce validation errors, and checks command shapes', async () => {
    const { ctx, action } = setup()
    await expect(action('propose_commands').run({ title: 't', explanation: 'e', commands: [{ op: 'setValue', elementId: 'ActuatorSystem::Mechanical::Rod::mass', expression: '3 [m]' }] }, ctx)).rejects.toThrow(/validation error/)
    await expect(action('propose_commands').run({ title: 't', explanation: 'e', commands: [{ op: 'explode' }] }, ctx)).rejects.toThrow(/Unknown command/)
  })

  it('elaborates with textual notation (demo planner) through the same proposal path', async () => {
    const { ctx, action } = setup()
    const plan = sysmlModelerDemo!('Add a cooling subsystem to the actuator', { selectionIds: [] })!
    expect(plan.calls[0].name).toBe('sysml-modeler.propose_text')
    const p = (await action('propose_text').run(plan.calls[0].arguments, ctx)) as ServiceProposal
    expect(p.preview.map((i) => i.proposed)).toContain('ActuatorSystem::Thermal')
    expect(p.assumptions?.join(' ')).toMatch(/assumed placeholder values/)
    const applied = await p.apply({ conversationId: 'c', proposalId: 'p', messageId: 'm' })
    expect(applied.summary).toMatch(/Created ActuatorSystem::Thermal/)
  })

  it('demo planner covers the documented example prompts', () => {
    const plan = (t: string) => sysmlModelerDemo!(t, { selectionIds: [] })?.calls[0]?.name
    expect(plan('What SysML commands can you use?')).toBe('sysml-modeler.describe_commands')
    expect(plan('Validate the SysML model')).toBe('sysml-modeler.validate')
    expect(plan('What uses BrushlessMotor?')).toBe('sysml-modeler.impact')
    expect(plan('Add a part definition named Brake to ActuatorSystem::Mechanical')).toBe('sysml-modeler.propose_commands')
    expect(plan('Explain the last SysML change')).toBe('sysml-modeler.explain_commit')
    expect(plan('Hello there')).toBeUndefined()
  })
})

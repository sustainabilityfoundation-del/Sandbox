import { validateHelpManifest, type AssistantActionContext, type ServiceProposal } from '@ews/platform-sdk'
import { createLocalSysmlClient, LOCAL_SEED_PROJECT_ID } from '@ews/sysml-client'
import { ACTUATOR_EXAMPLE, applyTransaction, loadText, resolveRef, serialize } from '@ews/sysml-core'
import { describe, expect, it } from 'vitest'
import { createSysmlModelerTool } from '.'
import { sysmlModelerDemo } from './assistant'
import { actionFlowContext, actionFlowView, stateTransitionContext, stateTransitionView } from './projection/behavior'
import { connectableEnds, generalView, interconnectionView } from './projection/graph'
import { getClient } from './session'

const model = () => loadText(ACTUATOR_EXAMPLE).model
const id = (m: ReturnType<typeof model>, qn: string) => resolveRef(m, qn)['@id']

describe('view projections (diagrams are computed from the model)', () => {
  it('General View: definitions with compartments and specialization / composition / satisfy edges', () => {
    const m = model()
    const top = generalView(m, id(m, 'ActuatorSystem'))
    expect(top.nodes.map((n) => n.keyword)).toEqual(Array(8).fill('package'))
    expect(top.nodes.find((n) => n.name === 'Mechanical')!.compartments[0].items.map((i) => i.text)).toEqual(['part def Housing', 'part def Gearbox', 'part def BallScrew', 'part def Rod'])
    const g = generalView(m, id(m, 'ActuatorSystem::Architecture'))
    const la = g.nodes.find((n) => n.name === 'LinearActuator')!
    expect(la.keyword).toBe('part def')
    expect(la.compartments.find((c) => c.title === 'attributes')!.items.map((i) => i.text)).toContain('totalMass : MassValue = 1.85 [kg]')
    const comp = g.edges.filter((e) => e.kind === 'composition' && e.source === la.id)
    expect(comp.map((e) => e.label).sort()).toContain('motor')
    // Types from other packages appear as external nodes with qualified names.
    expect(g.nodes.find((n) => n.name === 'Electrical::BrushlessMotor')?.isExternal).toBe(true)
    const product = generalView(m, id(m, 'ActuatorSystem::Product'))
    expect(product.edges.filter((e) => e.kind === 'satisfy')).toHaveLength(3)
    expect(product.edges.some((e) => e.kind === 'allocate')).toBe(true)
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

describe('behaviour views (projections of actions and states)', () => {
  it('State Transition View: states, initial state from entry, transitions labelled with their triggers', () => {
    const m = model()
    const ctx = stateTransitionContext(m, id(m, 'ActuatorSystem::Software::ActuatorModes::idle'))!
    expect(ctx).toBe(id(m, 'ActuatorSystem::Software::ActuatorModes'))
    const g = stateTransitionView(m, ctx)
    const kids = g.nodes[0].children
    expect(kids.filter((k) => k.shape !== 'initial').map((k) => k.name)).toEqual(['idle', 'positioning', 'fault'])
    const name = (nid: string) => kids.find((k) => k.id === nid)!.name || '(initial)'
    expect(g.edges.map((e) => `${name(e.source)}->${name(e.target)} ${e.label ?? ''}`.trim()).sort()).toEqual([
      '(initial)->idle',
      'idle->positioning StartCommand (startPositioning)',
      'positioning->fault FaultDetected (onFault)',
      'positioning->idle StopCommand (finishPositioning)',
    ])
  })

  it('State Transition View: entry/do/exit actions and guards from text', () => {
    const r = loadText('package P { item def Go; state def S { entry; then a; state a { entry action init; do action run; } state b; transition t first a accept Go if 1 > 0 then b; } }')
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    const g = stateTransitionView(r.model, id(r.model, 'P::S'))
    expect(g.nodes[0].children.find((k) => k.name === 'a')!.compartments[0].items.map((i) => i.text)).toEqual(['entry action init', 'do action run'])
    expect(g.edges.find((e) => e.kind === 'transition')!.label).toBe('Go [1 > 0] (t)')
  })

  it('Action Flow View: actions, parameters as ports, start node, successions and flows', () => {
    const m = model()
    expect(actionFlowContext(m, id(m, 'ActuatorSystem::Software::ControlLoop::computeError'))).toBe(id(m, 'ActuatorSystem::Software::ControlLoop'))
    const g = actionFlowView(m, id(m, 'ActuatorSystem::Software::ControlLoop'))
    expect(g.nodes[0].ports.map((p) => p.name)).toEqual(['in setpoint', 'in measurement', 'out demand'])
    expect(g.nodes[0].children.map((c) => c.name)).toEqual(['computeError', 'computeDemand'])
    expect(g.edges.map((e) => e.kind)).toEqual(['succession'])
    const r = loadText('package P { item def Data; action def A { action a { out x : Data; } action b { in y : Data; } flow of Data from a.x to b.y; first a; then b; } }')
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    const f = actionFlowView(r.model, id(r.model, 'P::A'))
    const flow = f.edges.find((e) => e.kind === 'flow')!
    expect(flow.label).toBe('«flow» Data')
    expect(flow.source.endsWith(id(r.model, 'P::A::a::x'))).toBe(true)
    expect(f.nodes[0].children[0].shape).toBe('initial')
    const sd = loadText('package P { action def A { first start; then a; action a; then done; } }')
    expect(sd.diagnostics).toEqual([])
    const v = actionFlowView(sd.model, id(sd.model, 'P::A'))
    expect(v.nodes[0].children.map((c) => c.shape ?? c.name)).toEqual(['initial', 'a', 'final'])
    expect(v.edges.map((e) => `${e.source.split(':')[0]}->${e.target.split(':')[0]}`)).toEqual([`initial->${id(sd.model, 'P::A::a')}`, `${id(sd.model, 'P::A::a')}->final`])
    expect(f.edges.filter((e) => e.kind === 'succession').map((e) => e.target)).toEqual([id(r.model, 'P::A::a'), id(r.model, 'P::A::b')])
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

  it('reads matrices, coverage and behaviour', async () => {
    const { ctx, action } = setup()
    const sat = await action('matrix').run({ kind: 'satisfy' }, ctx)
    expect(sat.kind === 'data' && (sat.data as { rows: string[] }).rows.length).toBeGreaterThan(0)
    const cov = await action('coverage').run({ gapsOnly: true }, ctx)
    const data = cov.kind === 'data' ? (cov.data as { counts: { total: number }; requirements: { requirement: string; status: string }[] }) : undefined
    expect(data!.counts.total).toBe(3)
    expect(data!.requirements.every((r) => r.status !== 'satisfied-and-verified')).toBe(true)
    const st = await action('behavior').run({ view: 'state-transition' }, ctx)
    expect(st.kind === 'data' && JSON.stringify(st.data)).toContain('StartCommand')
    const af = await action('behavior').run({ view: 'action-flow', element: 'ActuatorSystem::Software::ControlLoop' }, ctx)
    expect(af.kind === 'data' && (af.data as { edges: { from: string; to: string }[] }).edges.map((e) => `${e.from}->${e.to}`)).toContain('computeError->computeDemand')
  })

  it('demo planner covers the documented example prompts', () => {
    const plan = (t: string) => sysmlModelerDemo!(t, { selectionIds: [] })?.calls[0]?.name
    expect(plan('What SysML commands can you use?')).toBe('sysml-modeler.describe_commands')
    expect(plan('Validate the SysML model')).toBe('sysml-modeler.validate')
    expect(plan('What uses BrushlessMotor?')).toBe('sysml-modeler.impact')
    expect(plan('Add a part definition named Brake to ActuatorSystem::Mechanical')).toBe('sysml-modeler.propose_commands')
    expect(plan('Explain the last SysML change')).toBe('sysml-modeler.explain_commit')
    expect(plan('Which requirements are not satisfied?')).toBe('sysml-modeler.coverage')
    expect(plan('Show the allocation matrix')).toBe('sysml-modeler.matrix')
    expect(plan('Describe the state machine')).toBe('sysml-modeler.behavior')
    expect(plan('Show the action flow of the control loop')).toBe('sysml-modeler.behavior')
    expect(plan('Hello there')).toBeUndefined()
  })
})

describe('managed requirement link (Requirements stays authoritative)', () => {
  it('link_requirement resolves the key through the Requirements service and proposes setMetadata with UUID and revision', async () => {
    const tool = createSysmlModelerTool({ client: createLocalSysmlClient({ seed: true }) })
    const req = { id: '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001', key: 'REQ-001', revision: 3, title: 'Operating load', statement: 'The actuator shall deliver 500 N.', projectId: 'PRJ-ACT100', type: 'functional', status: 'approved', archived: false, applicability: [], verificationMethods: [], updatedAt: '' }
    const services = { requirements: { resolve: async (k: string) => (k === 'REQ-001' ? req : undefined), get: async () => req } } as never
    const ctx = { model: undefined as never, artifacts: [], services, captured: { projectId: 'PRJ-ACT100', configurationId: 'CFG', scenarioId: 'SCN', modelRevision: 1, selectionIds: [] } } satisfies AssistantActionContext
    const action = tool.assistant!.actions.find((a) => a.name === 'sysml-modeler.link_requirement')!
    const p = (await action.run({ element: 'ActuatorSystem::Requirements::load', requirement: 'REQ-001' }, ctx)) as ServiceProposal
    expect(p.title).toBe('Link ActuatorSystem::Requirements::load to REQ-001')
    await p.apply({ conversationId: 'c', proposalId: 'p', messageId: 'm' })
    const client = getClient()!
    const project = await client.getProject(LOCAL_SEED_PROJECT_ID)
    const head = (await client.getBranch(project.id, project.defaultBranchId)).headCommitId!
    const text = serialize(await client.loadModel(project.id, head))
    expect(text).toContain('requirementId = "5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001";')
    expect(text).toContain('revision = 3;')
    await expect(action.run({ element: 'ActuatorSystem::Product::act100', requirement: 'REQ-001' }, ctx)).rejects.toThrow(/not a requirement/)
  })
})

describe('text editor completion (CodeMirror source)', () => {
  it('completes keywords, model names and qualified members after ::', async () => {
    const { CompletionContext } = await import('@codemirror/autocomplete')
    const { EditorState } = await import('@codemirror/state')
    const { sysmlCompletions } = await import('./view/CodeEditor')
    const m = model()
    const at = (doc: string, explicit = false) => {
      const state = EditorState.create({ doc })
      return sysmlCompletions(m)(new CompletionContext(state, doc.length, explicit))
    }
    const kw = at('part def X { attri')!
    expect(kw.options.map((o) => o.label)).toContain('attribute')
    expect(kw.from).toBe('part def X { '.length)
    expect(at('part m : Brushl')!.options.find((o) => o.label === 'BrushlessMotor')?.type).toBe('class')
    const q = at('attribute m : ISQ::Mas')!
    expect(q.from).toBe('attribute m : ISQ::'.length)
    expect(q.options.map((o) => o.label)).toContain('MassValue')
    expect(at('part def X { ')).toBeNull()
    expect(at('part def X { ', true)!.options.length).toBeGreaterThan(50)
  })
})

describe('a new platform project starts empty; the model is created lazily', () => {
  it('lists nothing for a new platform project; ensureProject creates one empty model once', async () => {
    const { ModelerSession } = await import('./session')
    const client = createLocalSysmlClient({ seed: true })
    expect(await client.listProjects('PRJ-NEW-1')).toEqual([])
    const session = new ModelerSession(client)
    await session.open('PRJ-NEW-1')
    expect(session.getState().status).toBe('empty')
    await session.ensureProject()
    await session.ensureProject()
    const projects = await client.listProjects('PRJ-NEW-1')
    expect(projects).toHaveLength(1)
    expect(session.getState().status).toBe('ready')
    expect(serialize(session.getState().model!)).toBe('package SystemModel;\n')
    // The example stays in PRJ-ACT100 only.
    expect((await client.listProjects('PRJ-ACT100')).length).toBe(1)
  })
})

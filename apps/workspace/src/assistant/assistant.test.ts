import { DemoRepository, PROJECT_ID, outputFreshness, readRequirement, type StorageLike } from '@ews/model-service'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useEntitlements } from '../platform/entitlements'
import { getTools } from '../platform/registry'
import { useWorkspaceStore } from '../platform/store'
import '../platform/tools'
import { DemoAssistantService } from './DemoAssistantService'
import { useConversation, type ChatMessage } from './conversation'
import { createWorkspaceEnvironment } from './environment'
import { executeToolCall } from './executor'
import { availableOperations } from './toolSpecs'

function memoryStorage(): StorageLike {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

const ws = () => useWorkspaceStore.getState()
const chat = () => useConversation.getState()
const setPlan = (id: string) => useEntitlements.getState().setPlan(id)

function lastReply(): Extract<ChatMessage, { role: 'assistant' }> {
  const reply = [...chat().messages].reverse().find((m) => m.role === 'assistant')
  if (!reply || reply.role !== 'assistant') throw new Error('no reply')
  return reply
}

async function ask(text: string) {
  await chat().send(text)
  return lastReply()
}

function latestProposal() {
  const ids = lastReply().proposalIds
  return chat().proposals[ids[ids.length - 1]]
}

beforeAll(async () => {
  setPlan('all')
  const repository = new DemoRepository({ storage: memoryStorage(), latencyMs: [0, 0] })
  await ws().initialize({
    repository,
    projectId: PROJECT_ID,
    tools: getTools().map((t) => ({ id: t.id, initialViewState: t.initialViewState })),
    defaultOpenToolIds: ['requirements'],
  })
  chat().configure(new DemoAssistantService({ thinkingMs: 0 }))
})

beforeEach(() => setPlan('all'))

describe('assistant demo flow across the three tools', () => {
  it('reads the requirements that apply to the selected component through the Requirements action', async () => {
    ws().select(['ROD-120'])
    const reply = await ask('What requirements apply to the selected component?')
    expect(reply.status).toBe('done')
    expect(reply.steps.map((s) => s.name)).toEqual(['requirements.read_for_component'])
    expect(reply.text).toContain('[[REQ-001]]')
    expect(reply.text).toContain('[[REQ-002]]') // via the parent assembly
    expect(reply.text).toContain('[[SYS-005]]') // its SysML reference
  })

  it('previews and applies a requirement edit with an expected revision and conversation provenance', async () => {
    const reply = await ask('Set REQ-003 status to approved.')
    expect(reply.steps.map((s) => s.name)).toEqual(['requirements.update'])
    const proposal = latestProposal()
    expect(proposal.changes[0]).toMatchObject({ targetId: 'REQ-003', property: 'status', current: 'in-review', proposed: 'approved', expectedRevision: 4 })
    expect(proposal.requiredEntitlements).toEqual(['tool:requirements'])
    expect(readRequirement(ws().model!.get('REQ-003')!).status).toBe('in-review') // not applied yet

    await chat().applyProposal(proposal.id)
    expect(chat().proposals[proposal.id]).toMatchObject({ status: 'applied', committedRevision: 7 })
    expect(readRequirement(ws().model!.get('REQ-003')!).status).toBe('approved')
    await new Promise((r) => setTimeout(r, 20))
    const entry = ws().activity.find((a) => a.kind === 'change' && a.message.includes(proposal.id))!
    expect(entry.source).toMatchObject({ kind: 'conversation', conversationId: chat().conversationId })
  })

  it('changes a CAD dimension and the explicitly mapped component property in one transaction', async () => {
    const reply = await ask('Change the rod diameter to 28 mm.')
    expect(reply.steps.map((s) => s.name)).toEqual(['search_objects', 'cad.set_dimension'])
    const proposal = latestProposal()
    expect(proposal.changes.map((c) => (c.kind === 'set-property' ? `${c.targetId}.${c.property}` : c.kind))).toEqual(['CAD-120.diameter', 'ROD-120.diameter'])
    expect(proposal.affectedOutputIds).toContain('OUT-0001')
    await chat().applyProposal(proposal.id)
    const model = ws().model!
    expect(model.get('CAD-120')!.properties.diameter).toEqual({ value: 28, unit: 'mm' })
    expect(model.get('ROD-120')!.properties.diameter).toEqual({ value: 28, unit: 'mm' })
    expect(model.get('CAD-120')!.revision).toBe(model.revision) // one revision for both
    expect(outputFreshness(ws().outputs.find((o) => o.id === 'OUT-0001')!, model).stale).toBe(true)
  })

  it('creates a SysML requirement usage that references an existing requirement', async () => {
    await ask('Add a SysML requirement reference for REQ-003.')
    const proposal = latestProposal()
    expect(proposal.changes.map((c) => c.kind)).toEqual(['create-object', 'add-relationship'])
    await chat().applyProposal(proposal.id)
    const applied = chat().proposals[proposal.id]
    expect(applied.createdIds).toHaveLength(1)
    const id = applied.createdIds![0]
    expect(ws().model!.linked(id, 'references', 'out')).toEqual(['REQ-003'])
  })

  it('connects SysML parts by resolving the named components to their SysML representations', async () => {
    await ask('Connect the housing to the motor in SysML.')
    const proposal = latestProposal()
    expect(proposal.changes[0]).toMatchObject({ kind: 'add-relationship', type: 'connects', from: 'SYS-002', to: 'SYS-004' })
    await chat().applyProposal(proposal.id)
    expect(ws().model!.findRelationship('connects', 'SYS-002', 'SYS-004')).toBeTruthy()
  })

  it('undoes the last change with a compensating revision', async () => {
    const before = ws().model!.revision
    await ask('Undo the last model change.')
    const proposal = latestProposal()
    expect(proposal.undoOf).toBeTruthy()
    await chat().applyProposal(proposal.id)
    expect(ws().model!.revision).toBe(before + 1)
    expect(ws().model!.findRelationship('connects', 'SYS-002', 'SYS-004')).toBeUndefined()
  })

  it('navigates between tools and selects the object', async () => {
    const reply = await ask('Open SysML and show the rod.')
    expect(reply.status).toBe('done')
    expect(ws().activeToolId).toBe('sysml')
    expect(ws().context.selectedIds).toEqual(['ROD-120'])
  })

  it('keeps the configuration captured at send time when the workspace context changes before apply', async () => {
    await ask('Set REQ-001 rationale to "Customer line peak force plus allowance."')
    const proposal = latestProposal()
    ws().setConfiguration('CFG-HD')
    await chat().applyProposal(proposal.id)
    await new Promise((r) => setTimeout(r, 20))
    const entry = ws().activity.find((a) => a.message.includes(proposal.id))!
    expect(entry.configurationId).toBe('CFG-BASE')
    ws().setConfiguration('CFG-BASE')
  })
})

describe('assistant and subscriptions', () => {
  it('offers only the actions of tools in the subscription', () => {
    setPlan('requirements')
    const names = availableOperations().map((t) => t.name)
    expect(names).toContain('requirements.update')
    expect(names.some((n) => n.startsWith('cad.') || n.startsWith('sysml.'))).toBe(false)
  })

  it('explains instead of acting when a request needs a tool outside the subscription', async () => {
    setPlan('requirements')
    const before = ws().model!.revision
    const reply = await ask('Change the rod diameter to 30 mm.')
    expect(reply.text).toContain('CAD')
    expect(reply.proposalIds).toHaveLength(0)
    expect(ws().model!.revision).toBe(before)
  })

  it('refuses tool actions and tool opening for tools outside the subscription, even if requested directly', async () => {
    setPlan('requirements')
    const ctx = validationContext()
    expect(await executeToolCall({ id: 'x', name: 'cad.set_dimension', arguments: { objectId: 'ROD-120', parameter: 'diameter', value: 30, unit: 'mm' } }, ctx)).toMatchObject({
      ok: false,
      errorCode: 'not-entitled',
    })
    expect(await executeToolCall({ id: 'x', name: 'open_tool', arguments: { toolId: 'sysml' } }, ctx)).toMatchObject({ ok: false, errorCode: 'not-entitled' })
    // Generic proposals can't reach CAD fields either.
    expect(
      await executeToolCall(
        { id: 'x', name: 'propose_changes', arguments: { title: 't', explanation: 'e', changes: [{ kind: 'set-property', targetId: 'CAD-120', property: 'length', value: 500, unit: 'mm' }] } },
        ctx,
      ),
    ).toMatchObject({ ok: false, errorCode: 'not-allowed' })
  })

  it('does not apply a prepared change after the subscription loses the tool', async () => {
    setPlan('all')
    await ask('Change the rod diameter to 30 mm.')
    const proposal = latestProposal()
    const before = ws().model!.revision
    setPlan('requirements')
    await chat().applyProposal(proposal.id)
    expect(chat().proposals[proposal.id].status).toBe('failed')
    expect(chat().proposals[proposal.id].message).toContain('no longer included')
    expect(ws().model!.revision).toBe(before)
  })
})

function validationContext() {
  const env = createWorkspaceEnvironment({
    createProposal: () => {
      throw new Error('should not be reached')
    },
    getProposal: () => undefined,
  })
  return {
    env,
    source: { kind: 'conversation' as const, conversationId: 'C-T', messageId: 'M0', label: 'test' },
    captured: {
      projectId: PROJECT_ID,
      configurationId: 'CFG-BASE',
      configurationName: 'Baseline',
      scenarioId: 'SCN-MAX',
      scenarioName: 'Maximum load',
      scenarios: [],
      modelRevision: 0,
      selection: [],
      attachedSelection: false,
      capturedAt: '',
    },
  }
}

describe('assistant validation', () => {
  const propose = (changes: unknown[]) =>
    executeToolCall({ id: 't', name: 'propose_changes', arguments: { title: 't', explanation: 'e', changes } }, validationContext())

  it('rejects operations that are neither platform operations nor registered tool actions', async () => {
    expect(await executeToolCall({ id: 't', name: 'delete_object', arguments: { id: 'ROD-120' } }, validationContext())).toMatchObject({ ok: false, errorCode: 'not-allowed' })
  })

  it('rejects unknown arguments to tool actions', async () => {
    expect(await executeToolCall({ id: 't', name: 'requirements.update', arguments: { requirementId: 'REQ-001', owner: 'me' } }, validationContext())).toMatchObject({
      ok: false,
      errorCode: 'invalid-arguments',
    })
  })

  it('rejects fields, relationships and new objects that no included tool allows', async () => {
    expect(await propose([{ kind: 'set-property', targetId: 'ROD-120', property: 'material', value: 'Ti' }])).toMatchObject({ ok: false, errorCode: 'not-allowed' })
    expect(await propose([{ kind: 'add-relationship', type: 'tests', from: 'REQ-001', to: 'MTR-130' }])).toMatchObject({ ok: false, errorCode: 'not-allowed' })
    expect(await propose([{ kind: 'create-object', ref: '$r', type: 'requirement', name: 'x', properties: {} }])).toMatchObject({ ok: false, errorCode: 'not-allowed' })
  })

  it('validates units and ranges for CAD dimensions', async () => {
    expect(await propose([{ kind: 'set-property', targetId: 'CAD-120', property: 'length', value: 12, unit: 'lb' }])).toMatchObject({ ok: false, errorCode: 'unit' })
    expect(await propose([{ kind: 'set-property', targetId: 'CAD-120', property: 'length', value: 9, unit: 'm' }])).toMatchObject({ ok: false, errorCode: 'range' })
  })
})

describe('assistant writes go through the same ownership rules as user commands', () => {
  it('acts only on behalf of the modules a proposal was validated for', async () => {
    const rod = ws().model!.get('ROD-120')!
    const change = [{ kind: 'update-properties' as const, targetId: 'ROD-120', baseRevision: rod.revision, properties: { diameter: { value: 27, unit: 'mm' } } }]
    await expect(ws().submitChanges('assistant', change, 'x', { onBehalfOf: ['requirements'] })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(ws().submitChanges('assistant', change, 'x', { onBehalfOf: [] })).rejects.toMatchObject({ code: 'forbidden' })
    await ws().submitChanges('assistant', change, 'x', { onBehalfOf: ['cad'] })
    expect(ws().model!.get('ROD-120')!.properties.diameter).toEqual({ value: 27, unit: 'mm' })
  })
})

describe('assistant reads the same documentation as people (read_help)', () => {
  it('retrieves a topic by ID, searches with provenance, and finds help for an object', async () => {
    const ctx = validationContext()
    const topic = await executeToolCall({ id: 'h1', name: 'read_help', arguments: { topicId: 'requirements.requirement.edit' } }, ctx)
    expect(topic).toMatchObject({ ok: true, data: { topic: { id: 'requirements.requirement.edit', module: 'requirements', source: expect.stringMatching(/\.md$/) } } })
    const search = await executeToolCall({ id: 'h2', name: 'read_help', arguments: { query: 'reqif import' } }, ctx)
    expect((search as { data: { results: { id: string }[] } }).data.results[0].id).toBe('requirements.exchange.reqif')
    const forObject = await executeToolCall({ id: 'h3', name: 'read_help', arguments: { objectId: 'REQ-001' } }, ctx)
    expect((forObject as { data: { topics: { id: string }[] } }).data.topics[0].id).toBe('requirements.overview')
  })

  it('only returns documentation of modules the user may use, and never grants operations', async () => {
    setPlan('requirements')
    const ctx = validationContext()
    expect(await executeToolCall({ id: 'h4', name: 'read_help', arguments: { topicId: 'sysml.block.create' } }, ctx)).toMatchObject({ ok: false, errorCode: 'not-found' })
    const hits = await executeToolCall({ id: 'h5', name: 'read_help', arguments: { query: 'cad dimension' } }, ctx)
    expect((hits as { data: { results: { module: string }[]; note: string } }).data.results.every((r) => r.module !== 'cad')).toBe(true)
    expect((hits as { data: { note: string } }).data.note).toContain('only registered operations')
    expect(await executeToolCall({ id: 'h6', name: 'read_help', arguments: {} }, ctx)).toMatchObject({ ok: false, errorCode: 'invalid-arguments' })
  })
})

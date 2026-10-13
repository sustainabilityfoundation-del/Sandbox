import { beforeAll, describe, expect, it } from 'vitest'
import { outputFreshness } from '../domain/freshness'
import { DemoRepository, type StorageLike } from '../repository/DemoRepository'
import { PROJECT_ID } from '../repository/seed'
import { useWorkspaceStore } from '../sdk/store'
import '../tools'
import { getTools } from '../tools/registry'
import { DemoAssistantService } from './DemoAssistantService'
import { useConversation, type ChatMessage } from './conversation'
import { createWorkspaceEnvironment } from './environment'
import { executeToolCall } from './executor'

function memoryStorage(): StorageLike {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

const ws = () => useWorkspaceStore.getState()
const chat = () => useConversation.getState()

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
  const repository = new DemoRepository({ storage: memoryStorage(), latencyMs: [0, 0] })
  await ws().initialize({
    repository,
    projectId: PROJECT_ID,
    tools: getTools().map((t) => ({ id: t.id, initialViewState: t.initialViewState })),
    defaultOpenToolIds: ['geometry'],
  })
  chat().configure(new DemoAssistantService({ thinkingMs: 0 }))
})

describe('assistant demo flow', () => {
  it('answers which requirements apply to the attached selection', async () => {
    ws().select(['ROD-120'])
    const reply = await ask('What requirements apply to the selected component?')
    expect(reply.status).toBe('done')
    expect(reply.text).toContain('[[REQ-001]]')
    expect(reply.text).toContain('[[REQ-002]]') // via the parent assembly
    expect(reply.steps.map((s) => s.name)).toEqual(['read_requirements'])
    expect(reply.steps[0].inspected.map((i) => i.id)).toContain('REQ-001')
  })

  it('asks for clarification when the load case or unit is ambiguous', async () => {
    const noScenario = await ask('Change the operating load to 12 kN.')
    expect(noScenario.clarification).toBe(true)
    expect(noScenario.suggestions).toContain('Change the maximum operating load to 12 kN.')
    expect(noScenario.proposalIds).toHaveLength(0)

    const noUnit = await ask('Change the maximum operating load to 12')
    expect(noUnit.clarification).toBe(true)
    expect(noUnit.proposalIds).toHaveLength(0)
  })

  it('previews a change, applies it with an expected revision, and marks dependent outputs stale', async () => {
    const reply = await ask('Change the maximum operating load to 12 kN.')
    expect(reply.steps.map((s) => s.name)).toEqual(['read_object', 'propose_changes'])
    const proposal = latestProposal()
    expect(proposal.status).toBe('pending')
    expect(proposal.changes[0]).toMatchObject({
      targetId: 'SCN-MAX',
      property: 'operatingLoad',
      current: { value: 11, unit: 'kN' },
      proposed: { value: 12, unit: 'kN' },
      expectedRevision: 3,
    })
    expect(proposal.affectedOutputIds).toContain('OUT-0003')
    expect(ws().model!.scenario('SCN-MAX')!.properties.operatingLoad).toEqual({ value: 11, unit: 'kN' }) // not yet applied

    await chat().applyProposal(proposal.id)
    const applied = chat().proposals[proposal.id]
    expect(applied.status).toBe('applied')
    expect(applied.committedRevision).toBe(7)
    expect(ws().model!.revision).toBe(7)
    expect(ws().model!.scenario('SCN-MAX')!.properties.operatingLoad).toEqual({ value: 12, unit: 'kN' })
    const old = ws().outputs.find((o) => o.id === 'OUT-0003')!
    expect(outputFreshness(old, ws().model!).stale).toBe(true)

    await new Promise((r) => setTimeout(r, 20)) // activity refresh
    const entry = ws().activity.find((a) => a.kind === 'change' && a.message.includes(proposal.id))!
    expect(entry.source).toMatchObject({ kind: 'conversation', conversationId: chat().conversationId })
  })

  it('runs the analysis with the context captured at send time, even if it changes meanwhile', async () => {
    const pending = chat().send('Run the maximum-load analysis for this component.')
    await new Promise((r) => setTimeout(r, 50))
    // The user changes selection, scenario and configuration while the run is in progress.
    ws().select(['HSG-110'])
    ws().setScenario('SCN-NOM')
    ws().setConfiguration('CFG-HD')
    ws().activateTool('geometry')
    await pending

    const reply = lastReply()
    expect(reply.status).toBe('done')
    const outputId = /\[\[(OUT-\d+)\]\]/.exec(reply.text)![1]
    const output = ws().outputs.find((o) => o.id === outputId)!
    expect(output).toMatchObject({
      toolId: 'analysis',
      objectIds: ['ROD-120'],
      scenarioId: 'SCN-MAX',
      configurationId: 'CFG-BASE',
      inputRevision: 7,
    })
    expect(output.inputs).toEqual([
      { id: 'ROD-120', revision: 2 },
      { id: 'SCN-MAX', revision: 7 },
    ])
    expect(outputFreshness(output, ws().model!).stale).toBe(false)

    ws().setConfiguration('CFG-BASE')
    ws().select(['ROD-120'])
  })

  it('lists stale results with reasons', async () => {
    const reply = await ask('Which results became stale after that change?')
    expect(reply.text).toContain('[[OUT-0003]]')
    expect(reply.text).toContain('SCN-MAX')
  })

  it('opens the requirements tool and selects the load requirement', async () => {
    const reply = await ask('Open the requirements tool and show the load requirement.')
    expect(reply.steps.map((s) => s.name)).toEqual(['search_objects', 'open_tool', 'select_objects'])
    expect(ws().activeToolId).toBe('requirements')
    expect(ws().context.selectedIds).toEqual(['REQ-001'])
    ws().select(['ROD-120'])
  })

  it('refreshes the preview instead of overwriting newer data', async () => {
    await ask('Change the rod design factor to 2.5')
    const proposal = latestProposal()
    expect(proposal.changes[0]).toMatchObject({ targetId: 'ROD-120', expectedRevision: 2 })

    // Someone else edits the rod after the preview was created.
    await ws().submitChanges(
      'analysis',
      [{ kind: 'update-properties', targetId: 'ROD-120', baseRevision: 2, properties: { designFactor: { value: 2.2, unit: '-' } } }],
      'Edit from another tool',
    )
    const revisionBefore = ws().model!.revision
    await chat().applyProposal(proposal.id)
    const refreshed = chat().proposals[proposal.id]
    expect(refreshed.status).toBe('conflict')
    expect(refreshed.message).toContain('changed from rev 2')
    expect(refreshed.changes[0]).toMatchObject({ current: { value: 2.2, unit: '-' }, expectedRevision: revisionBefore })
    expect(ws().model!.revision).toBe(revisionBefore) // nothing written

    await chat().applyProposal(proposal.id) // apply the refreshed preview
    expect(chat().proposals[proposal.id].status).toBe('applied')
    expect(ws().model!.get('ROD-120')!.properties.designFactor).toEqual({ value: 2.5, unit: '-' })
  })

  it('undoes the last change with a compensating revision', async () => {
    const reply = await ask('Undo the last model change.')
    const undo = latestProposal()
    expect(reply.text).toContain(undo.id)
    expect(undo.undoOf).toBeDefined()
    expect(undo.changes[0]).toMatchObject({ targetId: 'ROD-120', proposed: { value: 2.2, unit: '-' } })
    const before = ws().model!.revision
    await chat().applyProposal(undo.id)
    expect(ws().model!.revision).toBe(before + 1)
    expect(ws().model!.get('ROD-120')!.properties.designFactor).toEqual({ value: 2.2, unit: '-' })
    expect(chat().proposals[undo.undoOf!].undoneBy).toBe(undo.id)
  })

  it('refuses to undo when the target changed again afterwards', async () => {
    const operatingLoadChange = Object.values(chat().proposals).find(
      (p) => p.status === 'applied' && p.changes[0].kind === 'set-property' && p.changes[0].targetId === 'SCN-MAX',
    )!
    // The run above didn't change SCN-MAX, but an edit in a tool now does.
    const scenario = ws().model!.scenario('SCN-MAX')!
    await ws().submitChanges(
      'analysis',
      [{ kind: 'update-properties', targetId: 'SCN-MAX', baseRevision: scenario.revision, properties: { operatingLoad: { value: 13, unit: 'kN' } } }],
      'Edit from Analysis',
    )
    const before = ws().model!.revision
    await chat().undoProposal(operatingLoadChange.id)
    const event = chat().messages[chat().messages.length - 1]
    expect(event.role === 'event' && event.text).toContain('changed again')
    expect(ws().model!.revision).toBe(before)
  })
})

describe('assistant tool validation', () => {
  const ctx = () => {
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

  const propose = (changes: unknown[]) =>
    executeToolCall({ id: 't', name: 'propose_changes', arguments: { title: 't', explanation: 'e', changes } }, ctx())

  it('rejects operations outside the allowlist', async () => {
    const result = await executeToolCall({ id: 't', name: 'delete_object', arguments: { id: 'ROD-120' } }, ctx())
    expect(result).toMatchObject({ ok: false, errorCode: 'not-allowed' })
  })

  it('rejects fields and relationship types that are not editable', async () => {
    expect(await propose([{ kind: 'set-property', targetId: 'ROD-120', property: 'material', value: 'Ti' }])).toMatchObject({
      ok: false,
      errorCode: 'not-allowed',
    })
    expect(await propose([{ kind: 'add-relationship', type: 'tests', from: 'VP-001', to: 'MTR-130' }])).toMatchObject({
      ok: false,
      errorCode: 'not-allowed',
    })
  })

  it('validates units and ranges, converting compatible units', async () => {
    expect(
      await propose([{ kind: 'set-property', targetId: 'SCN-NOM', property: 'operatingLoad', value: 12, unit: 'lb' }]),
    ).toMatchObject({ ok: false, errorCode: 'unit' })
    expect(
      await propose([{ kind: 'set-property', targetId: 'SCN-NOM', property: 'operatingLoad', value: 9000, unit: 'kN' }]),
    ).toMatchObject({ ok: false, errorCode: 'range' })
  })
})

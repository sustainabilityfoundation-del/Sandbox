import { sharedNodeKernel } from '@ews/cad-kernel/node'
import type { AssistantActionContext, PlatformServices, ServiceProposal } from '@ews/platform-sdk'
import { sampleModel } from '@ews/platform-sdk/testing'
import { createHttpConceptsService } from '@ews/conceptualize-client'
import { conceptualizeTool } from '@ews/tool-conceptualize'
import { cadModelerTool, cadSession } from '@ews/tool-cad-modeler'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEnv, type TestEnv } from './helpers'

/**
 * CR-AI-9 (D1 blocker): a model must be able to bind CAD parameters to design constraints on its own. The
 * applied result of conceptualize.create_constraint / revise_constraint carries the constraint's id, key,
 * revision and the binding reference; conceptualize.list_constraints and conceptualize.read list them; the CAD
 * Modeler accepts that reference in bind_parameter and checks against the bound read from the real
 * Conceptualize API (SDK 1.8 getConstraint).
 */
let env: TestEnv
let concepts: NonNullable<PlatformServices['concepts']>
const PROJECT = 'PRJ-ACT100'
const provenance = { conversationId: 'c-ai9', proposalId: 'p-ai9', messageId: 'm-ai9' }

const ctx = (): AssistantActionContext => {
  const model = sampleModel()
  return { model, artifacts: [], captured: { projectId: PROJECT, configurationId: 'CFG-BASE', scenarioId: 'SCN-NOM', modelRevision: model.revision, selectionIds: [] }, services: { concepts } }
}
const con = (name: string) => conceptualizeTool.assistant!.actions.find((a) => a.name === name)!
const cad = (name: string) => cadModelerTool.assistant!.actions.find((a) => a.name === name)!
const refIn = (summary: string) => JSON.parse(summary.slice(summary.indexOf('{'), summary.indexOf('}', summary.indexOf('{')) + 1)) as { module: string; kind: string; id: string; revision: number }

beforeAll(async () => {
  env = await createTestEnv()
  const origin = await env.listen()
  concepts = createHttpConceptsService({ baseUrl: `${origin}/api/concepts/v1`, devUser: 'eli', retryMs: 200 })
  const kernel = await sharedNodeKernel()
  cadSession.configureKernel(() => kernel)
  await cadSession.reset()
}, 60_000)
afterAll(async () => {
  cadSession.configureStore(null)
  await env?.close()
})

describe('constraint references for CAD (CR-AI-9)', () => {
  it('create → the model-visible result carries the reference → CAD binds it and checks against the real bound', async () => {
    // 1. The assistant proposes a constraint; the applied result names id, key, revision and the reference.
    const proposal = (await con('conceptualize.create_constraint').run({ subjectId: 'CON-001', statement: 'Wall at least 2 mm', kind: 'dimensional', operator: '>=', value: 2, unit: 'mm', symbol: 't' }, ctx())) as ServiceProposal
    const applied = await proposal.apply(provenance)
    const ref = refIn(applied.summary)
    expect(ref).toEqual({ module: 'conceptualize', kind: 'constraint', id: applied.createdIds![0], revision: 1 })
    expect(applied.summary).toMatch(/^Proposed CST-\d{3} \(id [0-9a-f-]{36}, revision 1\)/)

    // 2. Later in the conversation the model can find it again.
    const listed = (await con('conceptualize.list_constraints').run({ subjectId: 'CON-001' }, ctx())) as { data: { constraints: { id: string; bindingRef: unknown; bound: unknown }[] } }
    expect(listed.data.constraints.find((c) => c.id === ref.id)).toMatchObject({ bindingRef: ref, bound: { operator: '>=', quantity: { value: 2, unit: 'mm' } } })
    const read = (await con('conceptualize.read').run({ conceptId: 'CON-001' }, ctx())) as { data: { constraints: { id: string; bindingRef: unknown }[] } }
    expect(read.data.constraints.find((c) => c.id === ref.id)?.bindingRef).toEqual(ref)

    // 3. CAD accepts the reference in bind_parameter and checks against the bound read from Conceptualize.
    const model = [
      { command: 'create_part', input: { name: 'Block', ref: '$p' } },
      { command: 'create_parameter', input: { partId: '$p', name: 'wall', expression: '3' } },
      { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
      { command: 'add_rectangle', input: { sketchId: '$s', width: 20, height: 10 } },
      { command: 'extrude_profile', input: { sketchId: '$s', distance: 'wall' } },
      { command: 'bind_parameter', input: { partId: '$p', name: 'wall', ref, quantity: 'wall thickness' } },
    ]
    const run = (await cad('cad-modeler.run_commands').run({ commands: model, label: 'Bound block' }, ctx())) as ServiceProposal
    await run.apply(provenance)
    const report = ((await cad('cad-modeler.check').run({}, ctx())) as { data: { results: { quantity: string; status: string; bound?: { key: string; constraint: unknown }; binding?: unknown }[] } }).data
    const wall = report.results.find((r) => r.quantity === 'parameter wall')
    expect(wall).toMatchObject({ status: 'satisfied', bound: { constraint: { module: 'conceptualize', kind: 'constraint', id: ref.id, revision: 1 } }, binding: { parameter: 'wall', pinnedRevision: 1 } })

    // 4. A revision through the assistant gives a new reference; the pinned binding is now outdated.
    const rev = (await con('conceptualize.revise_constraint').run({ constraintId: ref.id, value: 4, reason: 'Stiffer walls' }, ctx())) as ServiceProposal
    const revised = refIn((await rev.apply(provenance)).summary)
    expect(revised).toEqual({ ...ref, revision: 2 })
    const outdated = ((await cad('cad-modeler.check_bindings').run({}, ctx())) as { data: { outdated: { parameter: string; latestRevision: number }[] } }).data.outdated
    expect(outdated).toEqual([expect.objectContaining({ parameter: 'wall', pinnedRevision: 1, latestRevision: 2 })])
    const rerun = ((await cad('cad-modeler.check').run({}, ctx())) as { data: { results: { quantity: string; status: string }[] } }).data
    expect(rerun.results.find((r) => r.quantity === 'parameter wall')?.status).toBe('violated')
  }, 60_000)

  it('record_evidence accepts a whole CAD document as source', async () => {
    const DOC = '7e57c0de-0000-4000-8000-00000000d0c1'
    const p = (await con('conceptualize.record_evidence').run(
      { title: 'CAD check of the block', subjects: ['CON-001'], source: { module: 'cad', kind: 'cad-document', id: DOC, revision: 3 }, tool: { name: 'CAD Modeler check', version: '1.0.0' }, results: [{ name: 'Volume', value: 600, unit: 'mm^3' }] },
      ctx(),
    )) as ServiceProposal
    const applied = await p.apply(provenance)
    expect(applied.createdIds).toHaveLength(1)
    const ev = await env.call('rho', 'GET', `/api/concepts/v1/projects/${PROJECT}/evidence/${applied.createdIds![0]}`)
    expect(ev.body.source).toMatchObject({ module: 'cad', kind: 'cad-document', id: DOC, revision: 3 })
    // A malformed document reference is refused.
    const bad = (await con('conceptualize.record_evidence').run({ title: 'x', subjects: ['CON-001'], source: { module: 'cad', kind: 'cad-document', id: 'not-a-uuid', revision: 1 }, tool: { name: 't', version: '1' }, results: [{ name: 'V', value: 1, unit: 'mm^3' }] }, ctx())) as ServiceProposal
    await expect(bad.apply({ ...provenance, proposalId: 'p-ai9-bad' })).rejects.toThrow()
  })
})

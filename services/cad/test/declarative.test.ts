import { randomBytes } from 'node:crypto'
import { sharedNodeKernel } from '@ews/cad-kernel/node'
import type { AssistantActionContext, DeclarativeProposal } from '@ews/platform-sdk'
import { sampleModel } from '@ews/platform-sdk/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEnv, type TestEnv } from '../../api/test/helpers'
import { createHttpCadClient } from '../../../packages/cad-client/src'
import { cadModelerTool } from '../../../packages/tool-cad-modeler/src/index'
import { cadSession } from '../../../packages/tool-cad-modeler/src/session'

/**
 * CAD Modeler declarative proposals (SDK 1.8, CR-AI-8) through the real assistant gateway and CAD API:
 * the action computes the resulting document; the platform stores the proposal and, on Apply,
 * revalidates the expected revision and calls the CAD API (If-Match, idempotency, assistant provenance).
 */

let env: TestEnv
const P = 'PRJ-ACT100'
const A = '/api/assistant/v1'
const conversation = `C-CAD-${randomBytes(3).toString('hex')}`
let seq = 0
const action = (name: string) => cadModelerTool.assistant!.actions.find((a) => a.name === name)!
const ctx = (): AssistantActionContext => ({ model: sampleModel(), artifacts: [], captured: { projectId: P, configurationId: 'CFG', scenarioId: 'SCN', modelRevision: 1, selectionIds: [] } })

beforeAll(async () => {
  env = await createTestEnv()
  const origin = await env.listen()
  const kernel = await sharedNodeKernel()
  cadSession.configureKernel(() => kernel)
  await cadSession.reset()
  cadSession.configureStore(createHttpCadClient({ baseUrl: `${origin}/api/cad/v1`, devUser: 'eli' }))
}, 180_000)
afterAll(async () => {
  cadSession.configureStore(null)
  await env?.close()
})

/** What the workspace does with a declarative result: store it in the assistant service, then Apply. */
async function storeAndApply(p: DeclarativeProposal) {
  const { kind: _kind, ...rest } = p
  const stored = await env.call('eli', 'POST', `${A}/proposals`, { ...rest, kind: 'declarative', conversationId: conversation, messageId: 'M1', key: `CP-${++seq}`, projectId: p.projectId ?? P })
  expect(stored.status, JSON.stringify(stored.body)).toBe(201)
  return env.call('eli', 'POST', `${A}/proposals/${stored.body.proposal.id}/apply?projectId=${P}`, {})
}
const docs = async () => (await env.call('eli', 'GET', `/api/cad/v1/projects/${P}/documents`)).body as { id: string; title: string; revision: number }[]

describe('CAD Modeler declarative proposals through the platform gateway', () => {
  it('run_commands creates, then revises a stored document; Apply goes through the CAD API with provenance', async () => {
    const before = new Set((await docs()).map((d) => d.id))
    const p1 = (await action('cad-modeler.run_commands').run(
      { title: 'Declarative block', label: 'Block', commands: [{ command: 'create_part', input: { name: 'Block', ref: '$p' } }, { command: 'create_parameter', input: { partId: '$p', name: 'w', expression: '40' } }, { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } }, { command: 'add_rectangle', input: { sketchId: '$s', width: 'w', height: 20 } }, { command: 'extrude_profile', input: { sketchId: '$s', distance: 10 } }] },
      ctx(),
    )) as DeclarativeProposal
    expect(p1.kind).toBe('declarative-proposal')
    expect(p1.operations).toMatchObject([{ module: 'cad-modeler', operationId: 'createDocument', method: 'POST', path: `/projects/${P}/documents` }])
    expect(p1.preview.find((i) => i.label.startsWith('Predicted body'))?.proposed).toMatch(/^8000\.00 mm³/)
    expect((await docs()).filter((d) => !before.has(d.id))).toHaveLength(0) // nothing before Apply
    const a1 = await storeAndApply(p1)
    expect(a1.status, JSON.stringify(a1.body)).toBe(200)
    const created = (await docs()).find((d) => !before.has(d.id))!
    expect(created).toMatchObject({ title: 'Declarative block', revision: 1 })
    const revs = (await env.call('eli', 'GET', `/api/cad/v1/projects/${P}/documents/${created.id}/revisions`)).body
    expect(revs[0].source).toMatchObject({ sourceKind: 'assistant', conversationId: conversation })

    // Revise it: the action loads the stored document headlessly and proposes revision 2 with If-Match.
    const p2 = (await action('cad-modeler.run_commands').run({ documentId: created.id, commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'w', expression: '50' } }] }, ctx())) as DeclarativeProposal
    expect(p2.operations).toMatchObject([{ operationId: 'saveRevision', method: 'PUT', ifMatch: '"1"' }])
    expect(p2.expected).toMatchObject([{ module: 'cad-modeler', id: created.id, revision: 1, read: { operationId: 'getDocument', field: 'summary.revision' } }])
    expect((await storeAndApply(p2)).status).toBe(200)
    const r2 = (await env.call('eli', 'GET', `/api/cad/v1/projects/${P}/documents/${created.id}`)).body
    expect(r2.summary.revision).toBe(2)
    expect(r2.document.parts[0].parameters[0].expression).toBe('50')

    // Stale: someone saves revision 3 first; Apply refuses and changes nothing.
    const p3 = (await action('cad-modeler.run_commands').run({ documentId: created.id, commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'w', expression: '60' } }] }, ctx())) as DeclarativeProposal
    const other = { ...r2.document, metadata: { ...r2.document.metadata, title: 'Changed elsewhere' } }
    expect((await env.call('nia', 'PUT', `/api/cad/v1/projects/${P}/documents/${created.id}`, { document: other }, { 'if-match': '"2"' })).status).toBe(200)
    const stale = await storeAndApply(p3)
    expect(stale.status).toBe(409)
    expect((await env.call('eli', 'GET', `/api/cad/v1/projects/${P}/documents/${created.id}`)).body.summary.revision).toBe(3)
  })

  it('save_document is declarative too, and refuses when nothing changed', async () => {
    const d = cadSession.openDocuments().find((x) => x.stored)!
    await cadSession.openFromStore(P, d.id)
    const open = cadSession.document(d.id)!
    await expect(action('cad-modeler.save_document').run({ documentId: d.id }, ctx())).rejects.toMatchObject({ code: 'no-op' })
    await open.engine.execute({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'w', expression: '45' } }] })
    const p = (await action('cad-modeler.save_document').run({ documentId: d.id, message: 'narrower' }, ctx())) as DeclarativeProposal
    expect(p).toMatchObject({ kind: 'declarative-proposal', operations: [{ operationId: 'saveRevision', ifMatch: `"${open.stored!.revision}"` }] })
    expect((await storeAndApply(p)).status).toBe(200)
    const latest = (await env.call('eli', 'GET', `/api/cad/v1/projects/${P}/documents/${d.id}`)).body
    expect(latest.summary.revision).toBe(open.stored!.revision + 1)
    expect(latest.revision.message).toBe('narrower')
  })
})

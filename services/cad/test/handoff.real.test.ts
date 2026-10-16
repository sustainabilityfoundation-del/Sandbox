import { randomBytes } from 'node:crypto'
import { sharedNodeKernel } from '@ews/cad-kernel/node'
import type { AssistantActionContext, DeclarativeProposal, PlatformServices } from '@ews/platform-sdk'
import { sampleModel } from '@ews/platform-sdk/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEnv, type TestEnv } from '../../api/test/helpers'
import { createHttpCadClient } from '../../../packages/cad-client/src'
import { createHttpConceptsService, getConceptsModuleClient } from '../../../packages/conceptualize-client/src'
import { cadModelerTool } from '../../../packages/tool-cad-modeler/src/index'
import { cadSession } from '../../../packages/tool-cad-modeler/src/session'

/**
 * Concept → CAD handoff on the real stack: a Concept with an engineering definition and a constraint in
 * Conceptualize, its CAD handoff package built through the API, cad-modeler.start_from_handoff applied
 * through the declarative gateway into the CAD service (parameters bound to the constraint revision,
 * source concept and handoff recorded, gaps listed), then a concept revision makes the document possibly
 * outdated (staleness endpoint), with no change to the model.
 */

let env: TestEnv
const P = 'PRJ-ACT100'
const C = `/api/concepts/v1/projects/${P}`
const A = '/api/assistant/v1'
let concepts: PlatformServices['concepts']
const idem = () => ({ 'idempotency-key': randomBytes(8).toString('hex') })
const action = (name: string) => cadModelerTool.assistant!.actions.find((a) => a.name === name)!
const ctx = (): AssistantActionContext => ({ model: sampleModel(), artifacts: [], captured: { projectId: P, configurationId: 'CFG', scenarioId: 'SCN', modelRevision: 1, selectionIds: [] }, services: { concepts } as PlatformServices })

/** The SDK 1.9 members the workspace host attaches (same delegation as apps/workspace services.ts). */
function withSdk19Members(service: NonNullable<PlatformServices['concepts']>): NonNullable<PlatformServices['concepts']> {
  const client = (projectId: string) => getConceptsModuleClient(service, projectId)!
  const notFound = (e: unknown) => ((e as { status?: number }).status === 404 ? undefined : Promise.reject(e))
  return Object.assign(service, {
    getHandoff: (id: string, { projectId }: { projectId: string }) => client(projectId).handoff(id).then((h) => h as never, notFound),
    revisionStaleness: (conceptId: string, revision: number, { projectId, purpose }: { projectId: string; purpose?: 'downstream' | 'handoff' | 'layout' | 'illustration' }) => client(projectId).revisionStaleness(conceptId, revision, purpose ?? 'downstream').then((s) => s as never, notFound),
  })
}

beforeAll(async () => {
  env = await createTestEnv()
  const origin = await env.listen()
  concepts = withSdk19Members(createHttpConceptsService({ baseUrl: `${origin}/api/concepts/v1`, devUser: 'eli' }))
  const kernel = await sharedNodeKernel()
  cadSession.configureKernel(() => kernel)
  await cadSession.reset()
  cadSession.configureStore(createHttpCadClient({ baseUrl: `${origin}/api/cad/v1`, devUser: 'eli' }))
}, 180_000)
afterAll(async () => {
  cadSession.configureStore(null)
  await env?.close()
})

async function storeAndApply(p: DeclarativeProposal) {
  const { kind: _kind, ...rest } = p
  const stored = await env.call('eli', 'POST', `${A}/proposals`, { ...rest, kind: 'declarative', conversationId: 'C-HANDOFF', messageId: 'M1', key: `CP-${randomBytes(3).toString('hex')}`, projectId: P })
  expect(stored.status, JSON.stringify(stored.body)).toBe(201)
  return env.call('eli', 'POST', `${A}/proposals/${stored.body.proposal.id}/apply?projectId=${P}`, {})
}

describe('concept handoff → CAD document (real Conceptualize, CAD service and gateway)', () => {
  it('starts a part from the handoff: bound parameters, provenance, gaps; then shows the document as possibly outdated', async () => {
    const created = await env.call('eli', 'POST', `${C}/concepts`, { name: `Holder ${randomBytes(2).toString('hex')}`, definition: { intent: 'Hold hex bits', components: [{ name: 'Holder block', kind: 'part' }], parameters: [{ symbol: 'af', name: 'Pocket across flats', value: 6.6, unit: 'mm' }, { symbol: 'wall', name: 'Wall', min: 2, max: 4, unit: 'mm' }, { symbol: 'n', name: 'Pockets', value: 6, unit: '' }] } }, idem())
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    let concept = created.body
    const cst = (await env.call('eli', 'POST', `${C}/constraints`, { kind: 'dimensional', statement: 'Across flats 6.4–6.8 mm', bound: { symbol: 'af', operator: 'in-range', quantity: { min: 6.4, max: 6.8, unit: 'mm' } }, subjects: [{ module: 'conceptualize', type: 'concept', id: concept.id }], status: 'active' }, idem())).body
    const params = concept.definition.parameters.map((p: { symbol: string }) => (p.symbol === 'af' ? { ...p, constraintId: cst.id } : p))
    const revised = await env.call('eli', 'PATCH', `${C}/concepts/${concept.id}`, { expectedRevision: concept.revision, definition: { ...concept.definition, idSeq: undefined, parameters: params } }, idem())
    expect(revised.status, JSON.stringify(revised.body)).toBe(200)
    concept = revised.body
    const handoff = await env.call('eli', 'POST', `${C}/concepts/${concept.id}/handoffs`, {}, idem())
    expect(handoff.status, JSON.stringify(handoff.body)).toBe(201)
    const h = handoff.body

    const p = (await action('cad-modeler.start_from_handoff').run({ handoffId: h.id }, ctx())) as DeclarativeProposal
    expect(p.kind).toBe('declarative-proposal')
    expect(p.title).toMatch(new RegExp(`from ${h.key} \\(concept revision ${concept.revision}\\)`))
    const labels = p.preview.map((i) => `${i.label}: ${i.proposed}`)
    expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/^Parameter af: 6\.6 mm .*bound to CST-\d+ revision 1$/), expect.stringMatching(/^Gap \(parameter-range\): wall/)]))
    expect(p.preview.some((i) => i.label === 'Parameter wall')).toBe(false)
    expect((await storeAndApply(p)).status).toBe(200)

    const list = (await env.call('eli', 'GET', `/api/cad/v1/projects/${P}/documents`)).body as { id: string; title: string }[]
    const doc = list.find((d) => d.title === `${concept.key} ${concept.name}`)!
    expect(doc).toBeDefined()
    const stored = (await env.call('eli', 'GET', `/api/cad/v1/projects/${P}/documents/${doc.id}`)).body.document
    expect(stored.metadata.source).toEqual({ concept: { module: 'conceptualize', kind: 'concept', id: concept.id, revision: concept.revision, label: `${concept.key} ${concept.name}` }, handoff: { id: h.id, revision: 1 } })
    const af = stored.parts[0].parameters.find((x: { name: string }) => x.name === 'af')
    expect(af).toMatchObject({ expression: '6.6', unit: 'mm', binding: { ref: { module: 'conceptualize', kind: 'constraint', id: cst.id, revision: 1 } } })
    expect(stored.parts[0].parameters.map((x: { name: string }) => x.name).sort()).toEqual(['af', 'n'])

    // Not outdated yet; then the concept is revised and the document shows it (no regeneration).
    const before = (await action('cad-modeler.describe_model').run({ documentId: doc.id }, ctx())) as { data: { document: { source: { staleness: { possiblyOutdated: boolean } } } } }
    expect(before.data.document.source.staleness).toMatchObject({ possiblyOutdated: false, recordedRevision: concept.revision })
    const now = (await env.call('eli', 'GET', `${C}/concepts/${concept.id}`)).body
    const changed = now.definition.parameters.map((x: { symbol: string }) => (x.symbol === 'af' ? { ...x, value: 6.7 } : x))
    expect((await env.call('eli', 'PATCH', `${C}/concepts/${concept.id}`, { expectedRevision: now.revision, definition: { ...now.definition, idSeq: undefined, parameters: changed } }, idem())).status).toBe(200)
    const after = (await action('cad-modeler.check_bindings').run({ documentId: doc.id }, ctx())) as { data: { source: { staleness: { possiblyOutdated: boolean; currentConceptRevision: number; changes: { label: string }[] } } } }
    expect(after.data.source.staleness).toMatchObject({ possiblyOutdated: true, currentConceptRevision: now.revision + 1 })
    expect(after.data.source.staleness.changes.map((c) => c.label).join(' ')).toMatch(/af/)
    const unchanged = (await env.call('eli', 'GET', `/api/cad/v1/projects/${P}/documents/${doc.id}`)).body
    expect(unchanged.summary.revision).toBe(1)
  })

  it('reports a missing handoff and a host without handoff reads', async () => {
    await expect(action('cad-modeler.start_from_handoff').run({ handoffId: '00000000-0000-4000-8000-000000000000' }, ctx())).rejects.toMatchObject({ code: 'not-found' })
    await expect(action('cad-modeler.start_from_handoff').run({ handoffId: 'x' }, { ...ctx(), services: {} as PlatformServices })).rejects.toMatchObject({ code: 'unavailable' })
  })
})

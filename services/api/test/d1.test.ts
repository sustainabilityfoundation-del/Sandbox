import { randomUUID } from 'node:crypto'
import type { AssistantActionContext, ServiceProposal } from '@ews/platform-sdk'
import { sampleModel } from '@ews/platform-sdk/testing'
import { SysmlRepository, createSysmlArtifactSource, type SysmlEventHub } from '@ews/sysml-service'
import { composeTwinDirectory, createRequirementsArtifactSource, staticTwinDirectory } from '@ews/requirements-service'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHttpRequirementsService, getModuleClient } from '../../../packages/requirements-client/src'
import { allocationRequest, type AllocationTarget } from '../../../packages/tool-requirements/src/allocations'
import { requirementsAssistant } from '../../../packages/tool-requirements/src/assistant'
import { SAMPLE_TWIN } from '../src/server'
import { BASE, PROJECT, REQ1, createTestEnv, type TestEnv } from './helpers'

/**
 * Demonstration D1 (requirements.create, requirements.allocate) on the real API and PostgreSQL, with the
 * real in-process SysML directory and a product directory. No view and no React: the operations are headless.
 */
const PRODUCT_ELEMENT = '9e4f0b5d-0101-4d9c-8f40-9c3d6e5f4101'
const TWIN = composeTwinDirectory(staticTwinDirectory({ [PROJECT]: [{ id: PRODUCT_ELEMENT, type: 'product-element', name: 'Holder block' }] }, 'test product registry'), SAMPLE_TWIN)
let env: TestEnv
let origin: string
let sysmlElement: string
beforeAll(async () => {
  env = await createTestEnv({ twin: TWIN })
  origin = await env.listen()
  const sysml = createSysmlArtifactSource(new SysmlRepository(env.pool), { subscribeAll: () => () => undefined } as unknown as SysmlEventHub)
  const elements = (await sysml.list(PROJECT, { kinds: ['sysml-model-element'], limit: 5 })).items
  expect(elements.length).toBeGreaterThan(0) // the development seed has a SysML project in PRJ-ACT100
  sysmlElement = elements[0].ref.id
})
afterAll(async () => env?.close())

const service = (user: string) => createHttpRequirementsService({ baseUrl: `${origin}/api/requirements/v1`, devUser: user })
const ctxFor = (user: string): AssistantActionContext => ({
  model: sampleModel(),
  artifacts: [],
  captured: { projectId: PROJECT, configurationId: 'CFG-BASE', scenarioId: 'SCN-NOM', modelRevision: 1, selectionIds: [] },
  services: { requirements: service(user) },
})
const ui = (user: string) => getModuleClient(service(user), PROJECT)!
const action = (name: string) => requirementsAssistant.actions.find((a) => a.name === name)!
const provenance = () => ({ conversationId: `conv-${randomUUID().slice(0, 8)}`, proposalId: `p-${randomUUID().slice(0, 8)}`, messageId: 'm-1' })
const propose = async (name: string, user: string, args: Record<string, unknown>) => (await action(name).run(args, ctxFor(user))) as ServiceProposal
const refusal = (e: unknown) => {
  const x = e as { name: string; code: string; status?: number; message: string }
  return { name: x.name, code: x.code, status: x.status, message: x.message.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>').replace(/\bREQ-\d+/g, '<key>') }
}
const outcome = (p: Promise<unknown>) => p.then(() => undefined, refusal)
const get = async (id: string) => (await env.call('eli', 'GET', `${BASE}/requirements/${id}`)).body

describe('requirements.create (headless service proposal)', () => {
  it('creates with origin and provenance; nothing before Apply; applying twice creates one; Undo archives', async () => {
    const title = `Bit count ${randomUUID().slice(0, 6)}`
    const p = await propose('requirements.create', 'eli', {
      title,
      statement: 'The holder shall hold at least 6 bits.',
      rationale: 'Stated by the user.',
      type: 'functional',
      verificationMethods: ['inspection'],
      acceptanceCriteria: 'Count the pockets.',
      origin: 'stakeholder',
    })
    expect(p).toMatchObject({ kind: 'service-proposal', module: 'requirements' })
    expect(p.preview.find((i) => i.label === 'Origin')).toMatchObject({ proposed: 'User constraint', basis: 'user-statement' })
    const count = async () => (await env.call('eli', 'GET', `${BASE}/requirements?text=${encodeURIComponent(title)}`)).body.items.length
    expect(await count()).toBe(0)
    const pv = provenance()
    const applied = await p.apply(pv)
    await p.apply(pv) // a repeated Apply (or a retry after a lost response) does not duplicate
    expect(await count()).toBe(1)
    const r = await get(applied.createdIds![0])
    expect(r).toMatchObject({ title, origin: 'stakeholder', rationale: 'Stated by the user.', verificationMethods: ['inspection'], acceptanceCriteria: 'Count the pockets.', revision: 1, createdBy: 'eli' })
    const history = (await env.call('eli', 'GET', `${BASE}/requirements/${r.id}/history`)).body
    expect(history.find((h: { action: string }) => h.action === 'created')).toMatchObject({ actor: 'eli', reason: `Assistant proposal ${pv.proposalId} (conversation ${pv.conversationId})` })
    await p.undo!({})
    expect((await get(r.id)).archived).toBe(true)
  })

  it('ai-proposed content is labelled as a hypothesis; derived creates the derives-from link in the same write', async () => {
    const ai = await propose('requirements.create', 'eli', { title: 'Wall thickness', statement: 'The wall between pockets shall be at least 2 mm.', origin: 'ai-proposed' })
    expect(ai.preview.every((i) => i.basis === 'ai-hypothesis')).toBe(true)
    expect(ai.assumptions?.length).toBeGreaterThan(0)
    const parent = (await ai.apply(provenance())).createdIds![0]
    const parentKey = (await get(parent)).key
    const derived = await propose('requirements.create', 'eli', { title: 'Pocket pitch', statement: 'Pocket pitch shall be at least 13.4 mm.', origin: 'derived', derivesFrom: parentKey })
    expect(derived.preview.find((i) => i.label === 'Derives from')).toMatchObject({ targetId: parent })
    const child = (await derived.apply(provenance())).createdIds![0]
    expect((await get(child)).origin).toBe('derived')
    const rels = (await env.call('eli', 'GET', `${BASE}/requirements/${child}/relationships`)).body
    expect(rels.map((x: { type: string; toRequirementId: string }) => [x.type, x.toRequirementId])).toEqual([['derives-from', parent]])
  })

  it('UI path and assistant path refuse the same input identically', async () => {
    const base = { statement: 'x', type: 'functional' }
    const cases: [string, string, Record<string, unknown>][] = [
      ['title over 300 characters', 'eli', { ...base, title: 'x'.repeat(301), origin: 'stakeholder' }],
      ['derived without a parent', 'eli', { ...base, title: 'Orphan', origin: 'derived' }],
      ['unknown type', 'eli', { ...base, title: 'Bad type', type: 'nonsense', origin: 'stakeholder' }],
      ['reader', 'rho', { ...base, title: 'Reader', origin: 'stakeholder' }],
    ]
    for (const [name, user, input] of cases) {
      const viaUi = await outcome(ui(user).create(input as never))
      const viaAi = await outcome(propose('requirements.create', user, input).then((p) => p.apply(provenance())))
      expect({ name, refused: !!viaUi }).toEqual({ name, refused: true })
      expect({ name, ...viaAi }).toEqual({ name, ...viaUi })
    }
  })
})

describe('requirements.allocate (headless service proposal)', () => {
  const newReq = async (title: string) => (await ui('eli').create({ title, statement: 'The holder shall mount to the tool.', type: 'functional', origin: 'stakeholder' })) as { id: string; key: string; revision: number }

  it('allocates to a product element, a component and a SysML element; removes; Undo restores; relations reported with C3 refs', async () => {
    const r = await newReq('Mounting')
    const p = await propose('requirements.allocate', 'eli', {
      requirementId: r.key,
      add: [
        { kind: 'product-element', id: PRODUCT_ELEMENT },
        { kind: 'component', id: 'HSG-110' },
        { kind: 'sysml-model-element', id: sysmlElement },
      ],
    })
    expect(p.preview).toHaveLength(3)
    expect((await env.call('eli', 'GET', `${BASE}/requirements/${r.id}/relationships`)).body).toEqual([])
    await p.apply(provenance())
    const rels = (await env.call('eli', 'GET', `${BASE}/requirements/${r.id}/relationships`)).body as { toTwinId: string; targetKind: string; toTargetRevision: number | null }[]
    expect(rels.map((x) => [x.toTwinId, x.targetKind]).sort()).toEqual([[PRODUCT_ELEMENT, 'twin'], ['HSG-110', 'twin'], [sysmlElement, 'sysml-model-element']].sort())
    expect(rels.find((x) => x.targetKind === 'sysml-model-element')!.toTargetRevision).toBeGreaterThanOrEqual(1)

    const source = createRequirementsArtifactSource(env.pool, env.server.events, { twin: TWIN })
    const [d] = await source.describe(PROJECT, [{ module: 'requirements', kind: 'requirement', id: r.id }])
    expect(d.relations).toEqual(
      expect.arrayContaining([
        { type: 'allocated-to', to: { module: 'product', kind: 'product-element', id: PRODUCT_ELEMENT } },
        { type: 'allocated-to', to: { module: 'sysml', kind: 'sysml-model-element', id: sysmlElement }, toRevision: expect.any(Number) },
      ]),
    )
    expect(d.relations).toHaveLength(2) // the sample-twin component has no native module

    const removal = await propose('requirements.allocate', 'eli', { requirementId: r.id, remove: ['HSG-110'] })
    await removal.apply(provenance())
    expect(((await env.call('eli', 'GET', `${BASE}/requirements/${r.id}/relationships`)).body as unknown[]).length).toBe(2)
    await removal.undo!({})
    expect(((await env.call('eli', 'GET', `${BASE}/requirements/${r.id}/relationships`)).body as unknown[]).length).toBe(3)
    await expect(propose('requirements.allocate', 'eli', { requirementId: r.id, remove: ['ROD-120'] })).rejects.toMatchObject({ code: 'not-found' })
  })

  it('UI path and assistant path refuse the same allocation identically (unknown targets, wrong type, stale revision, reader)', async () => {
    const cases: [string, string, AllocationTarget, boolean][] = [
      ['unknown product element', 'eli', { kind: 'product-element', id: randomUUID() }, false],
      ['a SysML element of the twin is not a component', 'eli', { kind: 'component', id: 'SYS-003' }, false],
      ['unknown SysML element', 'eli', { kind: 'sysml-model-element', id: `${randomUUID()}/${randomUUID()}` }, false],
      ['stale requirement revision', 'eli', { kind: 'product-element', id: PRODUCT_ELEMENT }, true],
      ['reader', 'rho', { kind: 'product-element', id: PRODUCT_ELEMENT }, false],
    ]
    for (const [name, user, target, stale] of cases) {
      const a = await newReq(`Alloc UI ${name}`)
      const b = await newReq(`Alloc AI ${name}`)
      const p = await propose('requirements.allocate', user, { requirementId: b.id, add: [target] })
      if (stale) {
        await env.call('eli', 'PATCH', `${BASE}/requirements/${a.id}`, { expectedRevision: 1, statement: 'Changed meanwhile.' })
        await env.call('eli', 'PATCH', `${BASE}/requirements/${b.id}`, { expectedRevision: 1, statement: 'Changed meanwhile.' })
      }
      const viaUi = await outcome(ui(user).createRelationship(allocationRequest(a, target)))
      const viaAi = await outcome(p.apply(provenance()))
      expect({ name, refused: !!viaUi }).toEqual({ name, refused: true })
      expect({ name, ...viaAi }).toEqual({ name, ...viaUi })
    }
    // REQ1 is unchanged by any of this.
    expect((await get(REQ1)).revision).toBeGreaterThanOrEqual(1)
  })
})

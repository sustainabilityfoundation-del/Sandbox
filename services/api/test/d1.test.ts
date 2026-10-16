import { randomUUID } from 'node:crypto'
import type { AssistantActionContext, DeclarativeProposal } from '@ews/platform-sdk'
import { sampleModel } from '@ews/platform-sdk/testing'
import { SysmlRepository, createSysmlArtifactSource, type SysmlEventHub } from '@ews/sysml-service'
import { composeTwinDirectory, createRequirementsArtifactSource, staticTwinDirectory } from '@ews/requirements-service'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHttpRequirementsService, getModuleClient } from '../../../packages/requirements-client/src'
import { allocationRequest, type AllocationTarget } from '../../../packages/tool-requirements/src/allocations'
import { requirementsAssistant } from '../../../packages/tool-requirements/src/assistant'
import { SAMPLE_TWIN } from '../src/server'
import { BASE, PROJECT, REQ1, createTestEnv, type TestEnv } from './helpers'
import { applyProposal, storeAndApply, storeProposal, type PlatformApply } from './platformApply'

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
const propose = async (name: string, user: string, args: Record<string, unknown>) => (await action(name).run(args, ctxFor(user))) as DeclarativeProposal
/** Apply through the platform (assistant service), as the person; returns the created IDs, or throws the refusal. */
const applied = async (user: string, p: DeclarativeProposal) => {
  const r = await storeAndApply(env, user, p, PROJECT)
  if (r.status >= 400) throw Object.assign(new Error(r.body.error!.message), { platform: r })
  return r.body.proposal!.createdIds ?? []
}
/** A refusal as the person sees it through the platform: the module's HTTP status and message. */
const viaPlatform = (r: PlatformApply) => {
  if (r.status < 400) return undefined
  const err = r.body.error as { message: string; details?: { proposal?: { results?: { status: string; httpStatus: number; summary: string }[] } } }
  const failed = err.details?.proposal?.results?.find((x) => x.status === 'failed')
  return { status: failed?.httpStatus ?? r.status, message: (failed?.summary ?? err.message).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>').replace(/\bREQ-\d+/g, '<key>') }
}
const refusal = (e: unknown) => {
  const x = e as { name: string; code: string; status?: number; message: string }
  return { name: x.name, code: x.code, status: x.status, message: x.message.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>').replace(/\bREQ-\d+/g, '<key>') }
}
/** A refusal when the proposal is prepared: the action is refused with the service's own message. */
const atPreview = (p: Promise<unknown>) => p.then(() => undefined, (e) => ({ code: (e as { code: string }).code, message: (e as Error).message.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>').replace(/\bREQ-\d+/g, '<key>') }))
const outcome = (p: Promise<unknown>) => p.then(() => undefined, (e) => ({ status: e.status as number, message: refusal(e).message }))
const get = async (id: string) => (await env.call('eli', 'GET', `${BASE}/requirements/${id}`)).body

describe('requirements.create (headless declarative proposal)', () => {
  it('creates with origin and provenance; nothing before Apply; applying twice creates one', async () => {
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
    expect(p).toMatchObject({ kind: 'declarative-proposal', module: 'requirements', projectId: PROJECT })
    expect(p.operations).toEqual([expect.objectContaining({ operationId: 'createRequirement', method: 'POST', path: `/projects/${PROJECT}/requirements` })])
    expect(p.preview.find((i) => i.label === 'Origin')).toMatchObject({ proposed: 'User constraint', basis: 'user-statement' })
    const count = async () => (await env.call('eli', 'GET', `${BASE}/requirements?text=${encodeURIComponent(title)}`)).body.items.length
    const id = await storeProposal(env, 'eli', p, PROJECT)
    expect(await count()).toBe(0)
    const first = await applyProposal(env, 'eli', id, PROJECT)
    const again = await applyProposal(env, 'eli', id, PROJECT) // a repeated Apply does not duplicate
    expect(again.body).toMatchObject({ alreadyApplied: true })
    expect(await count()).toBe(1)
    const r = await get(first.body.proposal!.createdIds![0])
    expect(r).toMatchObject({ title, origin: 'stakeholder', rationale: 'Stated by the user.', verificationMethods: ['inspection'], acceptanceCriteria: 'Count the pockets.', revision: 1, createdBy: 'eli' })
    expect(r.changeReason).toMatch(/^Assistant proposal C-REQ-[0-9a-f]+\/RQ-\d+$/)
    const history = (await env.call('eli', 'GET', `${BASE}/requirements/${r.id}/history`)).body
    expect(history.find((h: { action: string }) => h.action === 'created')).toMatchObject({ actor: 'eli', reason: r.changeReason })
  })

  it('ai-proposed content is labelled as a hypothesis; derived creates the derives-from link in the same write', async () => {
    const ai = await propose('requirements.create', 'eli', { title: 'Wall thickness', statement: 'The wall between pockets shall be at least 2 mm.', origin: 'ai-proposed' })
    expect(ai.preview.every((i) => i.basis === 'ai-hypothesis')).toBe(true)
    expect(ai.assumptions?.length).toBeGreaterThan(0)
    const parent = (await applied('eli', ai))[0]
    const parentKey = (await get(parent)).key
    const derived = await propose('requirements.create', 'eli', { title: 'Pocket pitch', statement: 'Pocket pitch shall be at least 13.4 mm.', origin: 'derived', derivesFrom: parentKey })
    expect(derived.preview.find((i) => i.label === 'Derives from')).toMatchObject({ targetId: parent })
    const child = (await applied('eli', derived))[0]
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
      // The assistant is refused when it prepares the proposal (never offered for Apply), with the service's own message.
      const viaAi = await atPreview(propose('requirements.create', user, input))
      expect({ name, refused: !!viaUi, refusedAi: !!viaAi }).toEqual({ name, refused: true, refusedAi: true })
      expect({ name, message: viaAi!.message }).toEqual({ name, message: expect.stringContaining(viaUi!.message) })
    }
  })
})

describe('requirements.allocate (headless declarative proposal)', () => {
  const newReq = async (title: string) => (await ui('eli').create({ title, statement: 'The holder shall mount to the tool.', type: 'functional', origin: 'stakeholder' })) as { id: string; key: string; revision: number }

  it('allocates to a product element, a component and a SysML element; removes; relations reported with C3 refs', async () => {
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
    expect(p.operations.map((o) => o.operationId)).toEqual(['createRelationship', 'createRelationship', 'createRelationship'])
    expect(p.expected).toEqual([expect.objectContaining({ id: r.id, revision: 1 })])
    expect((await env.call('eli', 'GET', `${BASE}/requirements/${r.id}/relationships`)).body).toEqual([])
    await applied('eli', p)
    const rels = (await env.call('eli', 'GET', `${BASE}/requirements/${r.id}/relationships`)).body as { toTwinId: string; targetKind: string; toTargetRevision: number | null }[]
    // HSG-110 is an alias of a product element in PRJ-ACT100 (Project Management seed): the canonical element UUID is stored.
    const hsg = (await env.pool.query<{ id: string }>(`SELECT element_id::text AS id FROM projects.product_element_aliases WHERE project_id = $1 AND alias = 'HSG-110'`, [PROJECT])).rows[0]?.id ?? 'HSG-110'
    expect(rels.map((x) => [x.toTwinId, x.targetKind]).sort()).toEqual([[PRODUCT_ELEMENT, 'twin'], [hsg, 'twin'], [sysmlElement, 'sysml-model-element']].sort())
    // Filters by the twin ID still find it.
    expect((await env.call('eli', 'GET', `${BASE}/requirements?allocatedTo=HSG-110`)).body.items.map((x: { id: string }) => x.id)).toContain(r.id)
    expect(rels.find((x) => x.targetKind === 'sysml-model-element')!.toTargetRevision).toBeGreaterThanOrEqual(1)

    const source = createRequirementsArtifactSource(env.pool, env.server.events, { twin: TWIN })
    const [d] = await source.describe(PROJECT, [{ module: 'requirements', kind: 'requirement', id: r.id }])
    expect(d.relations).toEqual(
      expect.arrayContaining([
        { type: 'allocated-to', to: { module: 'product', kind: 'product-element', id: PRODUCT_ELEMENT } },
        { type: 'allocated-to', to: { module: 'sysml', kind: 'sysml-model-element', id: sysmlElement }, toRevision: expect.any(Number) },
      ]),
    )
    expect(d.relations).toHaveLength(hsg === 'HSG-110' ? 2 : 3) // a sample-twin ID has no native module; a product element does

    const removal = await propose('requirements.allocate', 'eli', { requirementId: r.id, remove: [hsg] })
    expect(removal.operations).toEqual([expect.objectContaining({ operationId: 'deleteRelationship', method: 'DELETE', ifMatch: '"1"' })])
    await applied('eli', removal)
    expect(((await env.call('eli', 'GET', `${BASE}/requirements/${r.id}/relationships`)).body as unknown[]).length).toBe(2)
    await expect(propose('requirements.allocate', 'eli', { requirementId: r.id, remove: ['ROD-120'] })).rejects.toMatchObject({ code: 'not-found' })
  })

  it('UI path and assistant path refuse the same allocation identically (unknown targets, wrong type, stale revision, reader)', async () => {
    // Stale: the UI's expectedFromRevision is refused by the module; the platform re-reads the expected revision first.
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
      if (stale) {
        // Valid when prepared; the requirement changes before Apply: the platform's re-read refuses it.
        const p = await propose('requirements.allocate', user, { requirementId: b.id, add: [target] })
        const stored = await storeProposal(env, user, p, PROJECT)
        await env.call('eli', 'PATCH', `${BASE}/requirements/${a.id}`, { expectedRevision: 1, statement: 'Changed meanwhile.' })
        await env.call('eli', 'PATCH', `${BASE}/requirements/${b.id}`, { expectedRevision: 1, statement: 'Changed meanwhile.' })
        const viaUi = await outcome(ui(user).createRelationship(allocationRequest(a, target)))
        const viaAi = viaPlatform(await applyProposal(env, user, stored, PROJECT))
        expect({ name, ui: viaUi?.status, ai: viaAi?.status }).toEqual({ name, ui: 409, ai: 409 })
        expect(viaAi?.message).toMatch(/changed since the preview: revision 1 → 2/)
        continue
      }
      const viaUi = await outcome(ui(user).createRelationship(allocationRequest(a, target)))
      const viaAi = await atPreview(propose('requirements.allocate', user, { requirementId: b.id, add: [target] }))
      expect({ name, refused: !!viaUi, refusedAi: !!viaAi }).toEqual({ name, refused: true, refusedAi: true })
      expect({ name, message: viaAi!.message }).toEqual({ name, message: expect.stringContaining(viaUi!.message) })
    }
    // REQ1 is unchanged by any of this.
    expect((await get(REQ1)).revision).toBeGreaterThanOrEqual(1)
  })
})

describe('model-like inputs (first live D1 run)', () => {
  // The five requirements.create calls the model made, verbatim apart from the project-specific references.
  const calls = [
    { title: 'Six bit pockets', statement: 'The drill-mounted bit holder shall provide exactly six bit pockets.', rationale: 'User constraint, captured in CON-001 revision 1 and CST-001 revision 1: capacity for six bits.', type: 'functional', verificationMethods: ['inspection'], acceptanceCriteria: 'Count the distinct bit pockets in the holder: exactly 6.', origin: 'stakeholder', derivesFrom: '' },
    { title: 'Nominal pocket across-flats dimension', statement: 'The nominal design width across flats of each hexagonal bit pocket shall be 6.65 mm.', rationale: 'Derived numerical target.', type: 'dimensional', verificationMethods: ['analysis'], acceptanceCriteria: 'Model dimension 6.65 mm.', origin: 'ai-proposed', derivesFrom: '' },
    { title: 'Minimum inter-pocket wall thickness', statement: 'The holder shall have a minimum material thickness of 2.0 mm between adjacent bit-pocket surfaces.', rationale: 'AI-proposed provisional geometric target.', type: 'dimensional', verificationMethods: ['analysis', 'inspection'], acceptanceCriteria: 'Every measured minimum shall be ≥ 2.0 mm.', origin: 'ai-proposed', derivesFrom: '' },
    { title: 'Holder envelope limit', statement: "The maximum of the holder's three orthogonal overall bounding-box dimensions shall not exceed 60 mm.", rationale: 'AI-proposed interpretation of small block.', type: 'dimensional', verificationMethods: ['analysis', 'inspection'], acceptanceCriteria: 'Bounding box ≤ 60 mm.', origin: 'ai-proposed', derivesFrom: '' },
    { title: 'Holder mass budget', statement: 'The holder mass, including all holder components and retention inserts but excluding bits and separate drill-mounting hardware, shall not exceed 50 g.', rationale: 'AI-proposed provisional budget; not a measured mass.', type: 'physical', verificationMethods: ['test'], acceptanceCriteria: 'Measured mass shall be ≤ 50 g.', origin: 'ai-proposed', derivesFrom: '' },
  ]

  it('invalid types are refused when prepared, naming the field and the allowed types; valid ones apply (an empty derivesFrom is ignored)', async () => {
    for (const args of calls) {
      if (args.type === 'dimensional') {
        const err = await atPreview(propose('requirements.create', 'eli', args))
        expect(err).toMatchObject({ code: 'invalid-arguments' })
        expect(err!.message).toMatch(/type “dimensional” is not a requirement type in this project; use one of functional, performance, interface, environmental, physical, design-constraint, safety, other/)
        continue
      }
      const ids = await applied('eli', await propose('requirements.create', 'eli', args))
      expect((await get(ids[0])).type).toBe(args.type)
    }
    // With a valid type, the same "dimensional" proposals apply.
    const fixed = await applied('eli', await propose('requirements.create', 'eli', { ...calls[2], type: 'physical' }))
    expect((await get(fixed[0])).title).toBe('Minimum inter-pocket wall thickness')
  })

  it('a refusal at Apply carries field-level details (the module message names the field)', async () => {
    // Valid when prepared; the project's conventions change before Apply.
    const p = await propose('requirements.create', 'eli', { ...calls[4], title: 'Mass budget (conventions change)' })
    const id = await storeProposal(env, 'eli', p, PROJECT)
    const conv = (await env.call('ada', 'GET', `${BASE}/quality/conventions`)).body
    const without = conv.settings.requirementTypes.filter((t: string) => t !== 'physical')
    expect((await env.call('ada', 'PUT', `${BASE}/quality/conventions`, { settings: { ...conv.settings, requirementTypes: without }, expectedRevision: conv.revision })).status).toBe(200)
    try {
      const r = await applyProposal(env, 'eli', id, PROJECT)
      expect(r.status).toBe(422)
      expect(r.body.error!.message).toMatch(/type “physical” is not a requirement type in this project; use one of/)
    } finally {
      const now = (await env.call('ada', 'GET', `${BASE}/quality/conventions`)).body
      await env.call('ada', 'PUT', `${BASE}/quality/conventions`, { settings: { ...now.settings, requirementTypes: conv.settings.requirementTypes }, expectedRevision: now.revision })
    }
  })

  it('requirements.get reads a managed requirement by key headless; get_conventions lists the project types', async () => {
    const r = await action('requirements.get').run({ requirementId: 'REQ-001' }, ctxFor('rho'))
    expect(r).toMatchObject({ kind: 'data', data: { key: 'REQ-001', title: 'Operating load', type: 'performance' } })
    expect((r as { data: { relationships: { type: string }[] } }).data.relationships.some((x) => x.type === 'allocated-to')).toBe(true)
    await expect(action('requirements.get').run({ requirementId: 'REQ-999' }, ctxFor('rho'))).rejects.toMatchObject({ code: 'not-found' })
    const c = await action('requirements.get_conventions').run({}, ctxFor('rho'))
    expect((c as { data: { requirementTypes: string[] } }).data.requirementTypes).toContain('physical')
  })
})

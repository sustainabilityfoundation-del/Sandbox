import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE, assistant, createTestEnv, expectConforms, idem, type TestEnv } from './helpers'

/**
 * Architecture-first generation, the diversity assessment and the readiness gate (ECII increment 2) on a real
 * PostgreSQL database. They prove structure and computation, not the quality of a model's architectures. Domain words
 * appear as fixture values only.
 */
let env: TestEnv
beforeAll(async () => {
  env = await createTestEnv()
})
afterAll(async () => {
  await env?.close()
})

const post = (path: string, body: unknown, user = 'eli', headers: Record<string, string> = {}) => env.call(user, 'POST', `${BASE}${path}`, body, idem(headers))
const patch = (path: string, body: unknown, user = 'eli', headers: Record<string, string> = {}) => env.call(user, 'PATCH', `${BASE}${path}`, body, idem(headers))
const get = (path: string, user = 'rho') => env.call(user, 'GET', `${BASE}${path}`)

const block = (extra: Record<string, unknown> = {}) => ({
  level: 'architecture',
  hostInterface: 'Existing threaded boss on the apparatus housing',
  attachmentPrinciple: 'Fastened through the boss with a captive screw',
  interfaceGeometry: 'Boss diameter and thread unknown',
  loadPath: 'Weight into the boss in shear',
  installationRemoval: 'One tool, no disassembly',
  advantages: ['Simple'],
  disadvantages: ['Depends on one feature'],
  risks: ['The boss may not carry the load'],
  assumptions: ['A boss exists'],
  evidenceRequired: ['Boss dimensions'],
  ...extra,
})
const CLAMP = block({ hostInterface: 'Outer surface of the housing', attachmentPrinciple: 'Friction clamp tightened around the housing', interfaceGeometry: 'Cylindrical section of unknown diameter', loadPath: 'Clamping friction carries the weight', installationRemoval: 'Slide on from the end and tighten' })
const RAIL = block({ hostInterface: 'Existing guide rail', attachmentPrinciple: 'Sliding dovetail engaging the rail', interfaceGeometry: 'Rail profile unknown', loadPath: 'Weight into the rail through the dovetail flanks', installationRemoval: 'Slides along the rail and locks with a detent' })
const hostedIntent = {
  designObject: 'Accessory for an existing apparatus',
  role: 'accessory',
  integration: 'hosted',
  externalSystems: [{ name: 'Existing apparatus (model not stated)', role: 'host', description: 'Owned by the person', identified: false, owner: 'external', relation: 'mounts-to' }],
}
const concept = async (name: string, architecture: unknown, headers: Record<string, string> = {}) => {
  const r = await post('/concepts', { name, definition: { intent: name, ...(architecture ? { architecture } : {}) } }, 'eli', headers)
  return r
}

describe('the architecture block on a Concept definition', () => {
  it('stores a complete architecture and returns it, conforming to the API contract', async () => {
    const r = await concept('Boss mount', block())
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    await expectConforms(env, 'createConcept', 201, r.body)
    expect(r.body.definition.architecture).toMatchObject({ level: 'architecture', parent: '', hostInterface: 'Existing threaded boss on the apparatus housing', evidenceRequired: ['Boss dimensions'] })
    const one = await get(`/concepts/${r.body.id}`)
    expect(one.body.definition.architecture.attachmentPrinciple).toBe('Fastened through the boss with a captive screw')
  })

  it('refuses an incomplete architecture, naming each field, for the user and the assistant alike', async () => {
    const incomplete = { level: 'architecture', hostInterface: 'x' }
    for (const headers of [{}, assistant()]) {
      const r = await concept('Incomplete', incomplete, headers)
      expect(r.status).toBe(422)
      const text = JSON.stringify(r.body)
      for (const f of ['attachmentPrinciple', 'loadPath', 'installationRemoval', 'disadvantages', 'evidenceRequired']) expect(text).toContain(f)
    }
    expect((await concept('Variant without parent', { level: 'variant' })).status).toBe(422)
    expect((await concept('Bad level', { level: 'nonsense' })).status).toBe(400)
  })

  it('keeps the block when the definition is revised without it, and revises it with a change record', async () => {
    const c = (await concept('Kept', block())).body
    const kept = await patch(`/concepts/${c.id}`, { expectedRevision: 1, definition: { intent: 'Kept, revised' }, reason: 'Intent wording' })
    expect(kept.status, JSON.stringify(kept.body)).toBe(200)
    expect(kept.body.definition.architecture.hostInterface).toBe('Existing threaded boss on the apparatus housing')
    const changed = await patch(`/concepts/${c.id}`, { expectedRevision: kept.body.revision, definition: { architecture: block({ loadPath: 'Weight into the boss in tension' }) }, reason: 'Different load path' })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect(changed.body.definition.architecture.loadPath).toBe('Weight into the boss in tension')
    const removed = await patch(`/concepts/${c.id}`, { expectedRevision: changed.body.revision, definition: { architecture: null }, reason: 'Remove' })
    expect(removed.body.definition.architecture).toBeNull()
  })
})

describe('diversity assessment', () => {
  it('counts three different architectures as distinct, and conforms to the API contract', async () => {
    const ids = [(await concept('Boss mount', block())).body.id, (await concept('Clamp', CLAMP)).body.id, (await concept('Rail slide', RAIL)).body.id]
    const r = await get(`/diversity?conceptIds=${ids.join(',')}&minimum=3`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    await expectConforms(env, 'assessDiversity', 200, r.body)
    expect(r.body).toMatchObject({ distinctCount: 3, verdict: 'diverse', minimum: 3 })
    expect(r.body.pairs.every((p: { verdict: string }) => p.verdict === 'distinct')).toBe(true)
  })

  it('reports alternatives that differ only in parameters as variants of one architecture', async () => {
    const p = (n: number) => ({ intent: 'Pattern', architecture: block(), parameters: [{ symbol: 'count', value: n, unit: '1' }] })
    const a = (await post('/concepts', { name: 'Pattern of four', definition: p(4) })).body
    const b = (await post('/concepts', { name: 'Pattern of six', definition: p(6) })).body
    const r = await get(`/diversity?conceptIds=${a.id},${b.id}`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body).toMatchObject({ distinctCount: 1, verdict: 'insufficient' })
    expect(r.body.pairs[0]).toMatchObject({ verdict: 'same', differsOnlyIn: 'parameters' })
  })

  it('treats variants and Concepts without a block as not distinct architectures', async () => {
    const a = (await concept('Boss mount again', block())).body
    const v = (await concept('Boss mount, six holes', { level: 'variant', parent: a.key })).body
    const plain = (await post('/concepts', { name: 'No block' })).body
    const r = await get(`/diversity?conceptIds=${a.id},${v.id},${plain.id}`)
    expect(r.body.variants).toEqual([expect.objectContaining({ id: v.id, parentId: a.id })])
    expect(r.body.unclassified.map((u: { id: string }) => u.id)).toEqual([plain.id])
    expect(r.body.distinctCount).toBe(1)
  })

  it('compares the members of an exploration set and of a parent, and refuses an unnamed or single comparison', async () => {
    const e = await post('/explorations', { objective: 'Ways to mount', parent: { name: 'Mount objective' }, alternatives: [{ name: 'E boss', definition: { architecture: block() } }, { name: 'E clamp', definition: { architecture: CLAMP } }, { name: 'E rail', definition: { architecture: RAIL } }] })
    expect(e.status, JSON.stringify(e.body)).toBe(201)
    const parent = e.body.created.concepts.find((c: { role: string }) => c.role === 'parent')
    const bySet = await get(`/diversity?setId=${e.body.setId}`)
    expect(bySet.status, JSON.stringify(bySet.body)).toBe(200)
    expect(bySet.body.distinctCount).toBe(3)
    const byParent = await get(`/diversity?parentId=${parent.id}`)
    expect(byParent.status, JSON.stringify(byParent.body)).toBe(200)
    expect(byParent.body).toMatchObject({ distinctCount: 3, verdict: 'diverse' })
    expect((await get('/diversity')).status).toBe(400)
    expect((await get(`/diversity?conceptIds=${parent.id}`)).status).toBe(422)
  })
})

describe('readiness gate', () => {
  it('is advisory and says no intent is recorded when there is none', async () => {
    const r = await get('/readiness')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    await expectConforms(env, 'evaluateReadiness', 200, r.body)
    expect(r.body).toMatchObject({ intent: null, level: 'not-established', advisory: true, provisional: true })
  })

  it('is Exploratory for an unidentified system and lists the unmet items per activity', async () => {
    const i = (await post('/intents', hostedIntent)).body
    const boss = (await concept('Readiness boss', block())).body
    const r = await get(`/readiness?conceptId=${boss.id}`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    await expectConforms(env, 'evaluateReadiness', 200, r.body)
    expect(r.body).toMatchObject({ intent: { id: i.id }, concept: { id: boss.id }, level: 'exploratory', contextReadiness: { state: 'exploratory' }, provisional: true })
    const byActivity = Object.fromEntries(r.body.activities.map((a: { activity: string; met: boolean }) => [a.activity, a.met]))
    expect(byActivity).toEqual({ 'architecture-concepts': true, 'host-specific-concepts': false, 'dimensioned-design': false, 'cad-handoff': false })
    expect(JSON.stringify(r.body.activities[1].unmet)).toMatch(/identify host model/)
    const one = await get(`/readiness?activity=cad-handoff&conceptId=${boss.id}`)
    expect(one.body.activities).toHaveLength(1)
    expect(one.body.label).toMatch(/^Provisional: readiness is Exploratory/)
    expect((await get('/readiness?activity=nonsense')).status).toBe(400)
  })

  it('reaches Context Established when the system is identified and an architecture states its host interface', async () => {
    const i = (await get('/intents')).body.at(-1)
    const identified = await patch(`/intents/${i.id}`, { expectedRevision: i.revision, externalSystems: [{ ...i.externalSystems[0], name: 'Apparatus model 7', identified: true }], reason: 'The person named the model' })
    expect(identified.status, JSON.stringify(identified.body)).toBe(200)
    const boss = (await concept('Established boss', block())).body
    const r = await get(`/readiness?conceptId=${boss.id}`)
    expect(r.body).toMatchObject({ level: 'context-established', contextReadiness: { state: 'established' } })
    expect(r.body.activities.find((a: { activity: string }) => a.activity === 'host-specific-concepts').met).toBe(true)
    // Interface facts cannot be verified yet, so a design that works with another system stays provisional for the CAD handoff.
    expect(r.body.activities.find((a: { activity: string }) => a.activity === 'cad-handoff')).toMatchObject({ met: false })
  })
})

describe('provisional labelling of the CAD handoff', () => {
  it('lists the unmet readiness items and carries the architecture and the readiness in the package, without refusing', async () => {
    const boss = (await concept('Handoff boss', block())).body
    const h = await post(`/concepts/${boss.id}/handoffs`, {})
    expect(h.status, JSON.stringify(h.body)).toBe(201)
    await expectConforms(env, 'createCadHandoff', 201, h.body)
    const pkg = h.body.package
    expect(pkg.architecture).toMatchObject({ level: 'architecture', hostInterface: expect.stringContaining('boss') })
    expect(pkg.readiness).toMatchObject({ assessed: true, activity: 'cad-handoff', provisional: true, advisory: true })
    const provisional = pkg.unresolved.filter((u: { kind: string }) => u.kind === 'provisional-readiness')
    expect(provisional.length).toBeGreaterThan(1)
    expect(provisional[0].text).toMatch(/^Provisional \(readiness [A-Za-z ]+\): /)
    expect(new Set(provisional.map((u: { text: string }) => u.text)).size).toBe(provisional.length)
  })
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ConceptsEvent } from '@ews/platform-sdk'
import { CONCEPT_SEED_IDS as SEED, CONCEPT_SEED_REQUIREMENTS as REQ, FUNCTION_SEED_IDS as FN } from '@ews/conceptualize-service'
import { BASE, assistant, createTestEnv, expectConforms, idem, type TestEnv } from './helpers'

/**
 * Design knowledge (Design Reasoning P1 change requests CR-C1…C6, C9, C10) on a real PostgreSQL database:
 * Functions, Constraints, Assumptions, typed design links, decision and evidence extensions, the atomic
 * batch and the graph queries.
 */
let env: TestEnv
beforeAll(async () => {
  env = await createTestEnv()
})
afterAll(async () => {
  await env?.close()
})

const ref = (type: string, id: string, revision?: number) => ({ module: 'conceptualize', type, id, ...(revision ? { revision } : {}) })
const post = (path: string, body: unknown, user = 'eli', headers: Record<string, string> = {}) => env.call(user, 'POST', `${BASE}${path}`, body, idem(headers))
const get = (path: string, user = 'rho') => env.call(user, 'GET', `${BASE}${path}`)
const concept = async (name: string, extra: Record<string, unknown> = {}) => (await post('/concepts', { name, ...extra })).body

describe('Functions and function decomposition (CR-C1)', () => {
  it('reads the seeded function with its sub-functions and the alternatives that perform it', async () => {
    const fn = await get(`/functions/${FN.linearForce}`)
    expect(fn.status).toBe(200)
    await expectConforms(env, 'getFunction', 200, fn.body)
    expect(fn.body).toMatchObject({ key: expect.stringMatching(/^FN-\d{3}$/), name: 'Deliver controlled linear force', status: 'active' })
    expect(fn.headers.etag).toBe(`"${fn.body.revision}"`)
    const list = await get('/functions')
    await expectConforms(env, 'listFunctions', 200, list.body)
    const links = (await get(`/design-links?id=${FN.linearForce}`)).body
    const items = Array.isArray(links) ? links : links.items
    expect(items.filter((l: { type: string }) => l.type === 'decomposes-into')).toHaveLength(3)
    expect(items.filter((l: { type: string }) => l.type === 'performs').length).toBeGreaterThanOrEqual(2)
  })

  it('creates, revises and decomposes Functions; refuses cycles and stale edits', async () => {
    const parent = await post('/functions', { name: 'Store energy', performanceObjectives: [{ name: 'Capacity', quantity: { min: 2, unit: 'kW*h' }, direction: 'maximize' }] })
    expect(parent.status).toBe(201)
    await expectConforms(env, 'createFunction', 201, parent.body)
    expect(parent.body).toMatchObject({ revision: 1, status: 'active', provenance: { sourceKind: 'user' }, performanceObjectives: [{ name: 'Capacity', direction: 'maximize', basis: 'user-assertion' }] })
    const child = await post('/functions', { name: 'Hold charge', parentFunctionId: parent.body.id })
    expect(child.status).toBe(201)
    // child decomposes-into parent would be a cycle.
    const cycle = await post('/design-links', { type: 'decomposes-into', from: ref('function', child.body.id), to: ref('function', parent.body.id) })
    expect(cycle.status).toBe(422)
    const self = await post('/design-links', { type: 'decomposes-into', from: ref('function', child.body.id), to: ref('function', child.body.id) })
    expect(self.status).toBe(422)
    const edit = await env.call('eli', 'PATCH', `${BASE}/functions/${parent.body.id}`, { expectedRevision: 1, purpose: 'Bridge supply gaps', reason: 'Elaborated' })
    expect(edit.status).toBe(200)
    expect(edit.body.revision).toBe(2)
    expect((await env.call('eli', 'PATCH', `${BASE}/functions/${parent.body.id}`, { expectedRevision: 1, name: 'Stale' })).status).toBe(409)
    expect((await env.call('eli', 'PATCH', `${BASE}/functions/${parent.body.id}`, { name: 'x' }, { 'if-match': '"1"' })).status).toBe(409)
    const revs = await get(`/functions/${parent.body.id}/revisions`)
    expect(revs.body.map((r: { revision: number }) => r.revision)).toEqual([2, 1])
    expect((await get(`/functions/${parent.body.id}?revision=1`)).body.purpose).not.toBe('Bridge supply gaps')
    const alt = await env.call('eli', 'POST', `${BASE}/functions/${parent.body.id}/decompositions`, { name: 'Chemical storage' }, idem())
    expect(alt.status).toBe(201)
    // Readers may read but not write; nia has no Conceptualize entitlement.
    expect((await post('/functions', { name: 'Nope' }, 'rho')).status).toBe(403)
    expect((await post('/functions', { name: 'Nope' }, 'nia')).status).toBe(403)
  })

  it('converts a function-Concept explicitly: implements becomes performs, the Concept stays as history', async () => {
    const before = (await get(`/concepts/${SEED.transmission}`)).body
    const res = await post(`/concepts/${SEED.transmission}/convert-to-function`, { expectedRevision: before.revision, reason: 'It names a function' })
    expect(res.status).toBe(201)
    await expectConforms(env, 'convertToFunction', 201, res.body)
    expect(res.body.function).toMatchObject({ name: before.name })
    expect(res.body.performsLinkIds).toHaveLength(4)
    const derived = (await get(`/design-links/${res.body.derivedLinkId}`)).body
    expect(derived).toMatchObject({ type: 'derived-from', from: { type: 'function', id: res.body.function.id }, to: { type: 'concept', id: SEED.transmission, revision: before.revision } })
    // The Concept and its implements relationships are unchanged.
    const after = (await get(`/concepts/${SEED.transmission}`)).body
    expect(after.revision).toBe(before.revision)
    const rels = (await get(`/relationships?conceptId=${SEED.transmission}`)).body.filter((r: { type: string }) => r.type === 'implements')
    expect(rels).toHaveLength(4)
    expect((await post(`/concepts/${SEED.transmission}/convert-to-function`, { expectedRevision: before.revision })).status).toBe(409)
    const history = await get(`/entity-history?entityId=${SEED.transmission}`)
    expect(history.body.some((h: { action: string }) => h.action === 'converted-to-function')).toBe(true)
  })
})

describe('Assumptions (CR-C3)', () => {
  it('derives Assumptions from assumption statements once and enforces the validation rules', async () => {
    const c = await concept('Pump with assumptions', { statements: [{ kind: 'assumption', text: 'Water at 20 °C', quantity: { value: 20, unit: 'degC' } }] })
    const made = await post(`/concepts/${c.id}/assumptions-from-statements`, {})
    expect(made.status).toBe(200)
    const again = await post(`/concepts/${c.id}/assumptions-from-statements`, {})
    expect(again.body).toEqual([])
    const asm = made.body[0]
    await expectConforms(env, 'getAssumption', 200, asm)
    expect(asm).toMatchObject({ key: expect.stringMatching(/^ASM-\d{3}$/), statement: 'Water at 20 °C', basis: 'user-assertion', origin: { conceptId: c.id, statementId: c.statements[0].id }, validationStatus: 'unvalidated' })
    expect((await get(`/assumptions?statementId=${c.statements[0].id}`)).body).toHaveLength(1)
    // The assistant may only put it under review; validated needs evidence.
    const byAi = await post(`/assumptions/${asm.id}/validation`, { expectedRevision: 1, status: 'validated', reason: 'Looks right' }, 'eli', assistant())
    expect(byAi.status).toBe(403)
    const review = await post(`/assumptions/${asm.id}/validation`, { expectedRevision: 1, status: 'under-review', reason: 'Check the inlet temperature' }, 'eli', assistant())
    expect(review.status).toBe(200)
    expect(review.body.validationStatus).toBe('under-review')
    expect((await post(`/assumptions/${asm.id}/validation`, { expectedRevision: 1, status: 'validated', reason: 'No evidence' })).status).toBe(422)
    const ev = (await post('/evidence', { conceptId: c.id, kind: 'test', title: 'Inlet measurement', basis: 'evidence', artifact: { module: 'twin', id: 'OUT-002' } })).body
    const ok = await post(`/assumptions/${asm.id}/validation`, { expectedRevision: 1, status: 'validated', evidenceIds: [ev.id], reason: 'Measured' })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ validationStatus: 'validated', validatedBy: [ev.id] })
    expect(ok.body.validations.map((v: { toStatus: string }) => v.toStatus)).toEqual(['under-review', 'validated'])
    expect(ok.body.validations[1]).toMatchObject({ status: 'validated', by: 'eli', reason: 'Measured', evidence: { type: 'evidence', id: ev.id } })
  })

  it('records a free assumption and refuses an assistant assertion basis', async () => {
    const res = await post('/assumptions', { statement: 'Rod ends are pinned (K = 1)', quantity: { value: 1, unit: '-' }, basis: 'assumption', scope: { subjects: [ref('concept', SEED.actuator)] } })
    expect(res.status).toBe(201)
    const edit = await env.call('eli', 'PATCH', `${BASE}/assumptions/${res.body.id}`, { expectedRevision: 1, statement: 'Rod ends are pinned-pinned (K = 1)' })
    expect(edit.body.revision).toBe(2)
    expect((await post('/assumptions', { statement: 'AI asserts', basis: 'user-assertion' }, 'eli', assistant())).status).toBe(422)
    const ai = await post('/assumptions', { statement: 'AI guess' }, 'eli', assistant())
    expect(ai.status).toBe(201)
    expect(ai.body.basis).toBe('ai-hypothesis')
  })
})

describe('Design constraints (CR-C2)', () => {
  it('formalizes one pinned requirement revision; a second formalizes is refused', async () => {
    const list = (await get(`/constraints?subjectId=${SEED.actuator}`)).body
    const formal = list.find((c: { source: { kind: string } }) => c.source.kind === 'requirement')
    expect(formal).toMatchObject({ kind: 'mathematical', bound: { operator: '>=', quantity: { value: 12, unit: 'kN' } }, source: { ref: { id: REQ['REQ-001'], revision: 1 } } })
    await expectConforms(env, 'getConstraint', 200, formal)
    const unpinned = await post('/constraints', { kind: 'qualitative', statement: 'Unpinned', source: { kind: 'requirement', ref: { module: 'requirements', id: REQ['REQ-002'] } } })
    expect(unpinned.status).toBe(422)
    const second = await post('/design-links', { type: 'formalizes', from: ref('constraint', formal.id), to: { module: 'requirements', id: REQ['REQ-002'], revision: 1 } })
    expect(second.status).toBe(409)
  })

  it('promotes a constraint statement with a quantity; relaxing a hard formalizing constraint needs a reviewer', async () => {
    const c = await concept('Promotable', { statements: [{ kind: 'constraint', text: 'Mass', quantity: { max: 3, unit: 'kg' } }, { kind: 'behavior', text: 'Not a constraint' }] })
    const promoted = await post(`/concepts/${c.id}/promote-statement`, { statementId: c.statements[0].id, strength: 'hard' })
    expect(promoted.status).toBe(201)
    expect(promoted.body).toMatchObject({ bound: { operator: '<=', quantity: { max: 3, unit: 'kg' } }, origin: { conceptId: c.id, statementId: c.statements[0].id }, strength: 'hard' })
    expect((await post(`/concepts/${c.id}/promote-statement`, { statementId: c.statements[0].id })).status).toBe(409)
    expect((await post(`/concepts/${c.id}/promote-statement`, { statementId: c.statements[1].id })).status).toBe(422)
    expect((await get(`/concepts/${c.id}`)).body.revision).toBe(1)

    const formal = (await get(`/constraints?subjectId=${SEED.actuator}`)).body.find((x: { source: { kind: string } }) => x.source.kind === 'requirement')
    expect((await post(`/constraints/${formal.id}/status`, { expectedRevision: formal.revision, status: 'relaxed', reason: 'Too strict' })).status).toBe(403)
    expect((await post(`/constraints/${formal.id}/status`, { expectedRevision: formal.revision, status: 'relaxed', reason: 'Too strict' }, 'rui', assistant())).status).toBe(403)
    const relaxed = await post(`/constraints/${formal.id}/status`, { expectedRevision: formal.revision, status: 'relaxed', reason: 'Agreed with the requirement owner' }, 'rui')
    expect(relaxed.status).toBe(200)
    expect(relaxed.body.status).toBe('relaxed')
  })
})

describe('link registry and typed design links (CR-C4)', () => {
  it('lists the vocabulary with rules; only an administrator registers namespaced types', async () => {
    const types = await get('/link-types')
    await expectConforms(env, 'listLinkTypes', 200, types.body)
    const byName = Object.fromEntries(types.body.map((t: { name: string }) => [t.name, t]))
    expect(byName.performs).toMatchObject({ stored: 'design-links', fromTypes: ['concept'], toTypes: ['function'] })
    expect(byName.implements.stored).toBe('relationships')
    expect(byName['selected-through'].stored).toBe('derived')
    const body = { name: 'thermal:rejects-heat-to', label: 'rejects heat to', inverse: 'receives heat from', fromTypes: ['concept'], toTypes: ['concept'] }
    expect((await post('/link-types', body, 'eli')).status).toBe(403)
    const made = await post('/link-types', body, 'ada')
    expect(made.status).toBe(201)
    expect((await post('/link-types', { ...body, name: 'unspaced' }, 'ada')).status).toBe(400)
    const a = await concept('Hot part')
    const b = await concept('Heat sink')
    const link = await post('/design-links', { type: 'thermal:rejects-heat-to', from: ref('concept', a.id), to: ref('concept', b.id) })
    expect(link.status).toBe(201)
    await expectConforms(env, 'createDesignLink', 201, link.body)
    expect((await post('/design-links', { type: 'thermal:rejects-heat-to', from: ref('concept', a.id), to: ref('concept', b.id) })).status).toBe(409)
    // Endpoint types are checked; unknown types are refused.
    expect((await post('/design-links', { type: 'performs', from: ref('concept', a.id), to: ref('concept', b.id) })).status).toBe(422)
    expect((await post('/design-links', { type: 'no-such-type', from: ref('concept', a.id), to: ref('concept', b.id) })).status).toBe(422)
    const removed = await post(`/design-links/${link.body.id}/remove`, { expectedRevision: 1, reason: 'Wrong part' })
    expect(removed.status).toBe(200)
    expect((await get(`/design-links/${link.body.id}`)).body).toMatchObject({ removed: true, removedBy: 'eli' })
  })

  it('applies basis rules to evidence links and the assistant flag', async () => {
    const c = await concept('Linked with evidence')
    const estimate = (await post('/evidence', { conceptId: c.id, kind: 'calculation', title: 'Hand estimate', basis: 'estimate' })).body
    const tooStrong = await post('/design-links', { type: 'supported-by', from: ref('concept', c.id), to: ref('evidence', estimate.id), basis: 'evidence' })
    expect(tooStrong.status).toBe(422)
    expect((await post('/design-links', { type: 'supported-by', from: ref('concept', c.id), to: ref('evidence', estimate.id), basis: 'estimate' })).status).toBe(201)
    expect((await post('/design-links', { type: 'verified-by', from: ref('concept', c.id), to: ref('evidence', estimate.id) })).status).toBe(422)
    const asm = (await post('/assumptions', { statement: 'Dry air' })).body
    const byAi = await post('/design-links', { type: 'depends-on', from: ref('concept', c.id), to: ref('assumption', asm.id), basis: 'evidence' }, 'eli', assistant())
    expect(byAi.status).toBe(422)
    const hyp = await post('/design-links', { type: 'depends-on', from: ref('concept', c.id), to: ref('assumption', asm.id) }, 'eli', assistant())
    expect(hyp.status).toBe(201)
    expect(hyp.body).toMatchObject({ basis: 'ai-hypothesis', provenance: { sourceKind: 'assistant' } })
  })
})

describe('decision and evidence extensions (CR-C5, CR-C6)', () => {
  it('records what a decision rests on, flags it for review and assembles the rationale with stale pins', async () => {
    const a = await concept('Option A')
    const b = await concept('Option B')
    const ev = (await post('/evidence', { subjects: [ref('concept', a.id), ref('concept', b.id)], kind: 'analysis', title: 'Comparison', basis: 'estimate' })).body
    expect(ev.subjects).toHaveLength(2)
    const asm = (await post('/assumptions', { statement: 'Duty cycle 20 %', basis: 'assumption' })).body
    const cst = (await post('/constraints', { kind: 'dimensional', statement: 'Envelope', bound: { operator: '<=', quantity: { value: 100, unit: 'mm' } } })).body
    const dec = await post(
      '/decisions',
      {
        title: 'Choose A',
        subjectId: a.id,
        rationale: 'A is lighter.',
        outcomes: [{ conceptId: a.id, outcome: 'accepted' }, { conceptId: b.id, outcome: 'rejected' }],
        record: true,
        support: [{ ref: ref('evidence', ev.id), role: 'supports' }],
        assumptionIds: [ref('assumption', asm.id)],
        constraintIds: [ref('constraint', cst.id)],
        invalidationConditions: [{ kind: 'assumption-invalidated', subject: ref('assumption', asm.id), description: 'If the duty cycle rises' }],
      },
      'ada',
    )
    expect(dec.status, JSON.stringify(dec.body)).toBe(201)
    await expectConforms(env, 'createDecision', 201, dec.body)
    expect(dec.body).toMatchObject({ validity: 'valid', assumptionIds: [{ id: asm.id, revision: 1 }], constraintIds: [{ id: cst.id, revision: 1 }], invalidationConditions: [{ id: 'IC-1' }] })
    expect((await post('/decisions', { title: 'Bad support', rationale: 'x', subjectId: a.id, outcomes: [{ conceptId: a.id, outcome: 'deferred' }], support: [{ ref: ref('concept', b.id), role: 'supports' }] })).status).toBe(422)

    // Revise the assumption: the pin is now stale.
    await env.call('eli', 'PATCH', `${BASE}/assumptions/${asm.id}`, { expectedRevision: 1, statement: 'Duty cycle 35 %' })
    const flagged = await post(`/decisions/${dec.body.id}/review-flag`, { reason: 'Assumption revised', conditionId: 'IC-1' }, 'eli', assistant())
    expect(flagged.status).toBe(200)
    expect(flagged.body).toMatchObject({ validity: 'under-review', reviewFlags: [{ reason: 'Assumption revised', by: 'eli', at: expect.any(String) }] })
    const rationale = await get(`/decisions/${dec.body.id}/rationale`)
    expect(rationale.status).toBe(200)
    await expectConforms(env, 'decisionRationale', 200, rationale.body)
    expect(rationale.body.assumptions[0]).toMatchObject({ pinnedRevision: 1, currentRevision: 2 })
    expect(rationale.body.stale).toHaveLength(1)
    expect(rationale.body.support[0]).toMatchObject({ key: ev.key, basis: 'estimate', role: 'supports' })
    expect(rationale.body.alternatives.map((x: { outcome: string }) => x.outcome).sort()).toEqual(['accepted', 'rejected'])
    expect((await post(`/decisions/${dec.body.id}/validity`, { expectedRevision: flagged.body.recordVersion, validity: 'valid', reason: 'Still fine' })).status).toBe(403)
    const cleared = await post(`/decisions/${dec.body.id}/validity`, { expectedRevision: flagged.body.recordVersion, validity: 'valid', reason: 'Still within the margin' }, 'rui')
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200)
    expect(cleared.body).toMatchObject({ validity: 'valid', reviewFlags: [{ reason: 'Assumption revised', cleared: expect.objectContaining({ by: 'rui', note: 'Still within the margin' }) }] })
  })

  it('refuses calculated evidence it cannot re-verify (D6) and reviews evidence independently', async () => {
    const c = await concept('Calculated subject')
    const manifest = { solver: 'hand', inputs: { F: '500 N' }, version: '1' }
    const forged = await post('/evidence', { conceptId: c.id, kind: 'calculation', title: 'Forged calc', basis: 'calculated', manifest })
    expect(forged.status).toBe(422)
    expect(forged.body.error.details.fields.basis).toMatch(/re-verify/)
    expect((await post('/evidence', { conceptId: c.id, kind: 'calculation', title: 'AI calc', basis: 'calculated', manifest }, 'eli', assistant())).status).toBe(422)
    const est = await post('/evidence', { conceptId: c.id, kind: 'calculation', title: 'Buckling estimate', basis: 'estimate', manifest })
    expect(est.status).toBe(201)
    expect(est.body).toMatchObject({ basis: 'estimate', validationStatus: 'unreviewed', results: [], tool: null })
    await expectConforms(env, 'getEvidence', 200, (await get(`/evidence/${est.body.id}`)).body)
    // The author cannot review their own evidence; a reviewer can; the assistant cannot.
    expect((await post(`/evidence/${est.body.id}/reviews`, { outcome: 'accepted' }, 'eli')).status).toBe(403)
    expect((await post(`/evidence/${est.body.id}/reviews`, { outcome: 'accepted' }, 'rui', assistant())).status).toBe(403)
    const rev = await post(`/evidence/${est.body.id}/reviews`, { outcome: 'accepted', method: 'Independent hand check' }, 'rui')
    expect(rev.status).toBe(200)
    expect((await get(`/evidence/${est.body.id}`)).body).toMatchObject({ validationStatus: 'accepted', reviews: [{ reviewer: 'rui', outcome: 'accepted' }] })
    // A statement with basis calculated must cite calculated or verified evidence; an estimate is not enough.
    expect((await env.call('eli', 'PATCH', `${BASE}/concepts/${c.id}`, { expectedRevision: 1, statements: [{ kind: 'performance', text: 'Margin', basis: 'calculated', evidenceId: est.body.id }] })).status).toBe(422)
  })

  it('records check results with C11 qualifications and computes their status from the pinned constraint bound (D1)', async () => {
    const c = await concept('Checked part')
    const envelope = (await post('/constraints', { kind: 'dimensional', statement: 'Length within 100 mm', bound: { symbol: 'L', operator: '<=', quantity: { value: 100, unit: 'mm' } }, subjects: [ref('concept', c.id)], status: 'active' })).body
    const wall = (await post('/constraints', { kind: 'dimensional', statement: 'Wall at least 2 mm', bound: { symbol: 't', operator: '>=', quantity: { value: 2, unit: 'mm' } }, subjects: [ref('concept', c.id)], status: 'active' })).body
    const source = { module: 'cad', kind: 'cad-modeler-entity', id: '7e57c0de-0000-4000-8000-00000000cad1/7e57c0de-0000-4000-8000-00000000cad1', revision: 3, label: 'Holder document rev 3' }
    const tool = { name: 'CAD Modeler check (Open CASCADE)', version: '7.8.1' }
    const results = [
      { name: 'Bounding length', value: 9.4, unit: 'cm', qualification: { kind: 'point' }, constraint: ref('constraint', envelope.id) },
      { name: 'Minimum wall', value: 1.5, unit: 'mm', qualification: { kind: 'point' }, constraint: { id: wall.id } },
      { name: 'Wall over pockets (sampled)', min: 2.1, max: 3, unit: 'mm', qualification: { kind: 'sampled-range' }, constraint: ref('constraint', wall.id) },
      { name: 'Wall over pockets (proven)', min: 2.1, max: 3, unit: 'mm', qualification: { kind: 'bounds', quality: 'enclosure' }, constraint: ref('constraint', wall.id) },
      { name: 'Volume', value: 41200, unit: 'mm^3', qualification: { kind: 'point' } },
    ]
    const ev = await post('/evidence', { subjects: [ref('concept', c.id), ref('constraint', envelope.id), ref('constraint', wall.id)], kind: 'analysis', title: 'CAD check of the holder', basis: 'estimate', source, tool, results }, 'eli', assistant())
    expect(ev.status, JSON.stringify(ev.body)).toBe(201)
    await expectConforms(env, 'getEvidence', 200, (await get(`/evidence/${ev.body.id}`)).body)
    expect(ev.body.tool).toEqual(tool)
    expect(ev.body.source).toMatchObject({ module: 'cad', revision: 3 })
    expect(ev.body.results.map((r: { status: string | null }) => r.status)).toEqual(['satisfied', 'violated', 'uncertain', 'satisfied', null])
    expect(ev.body.results[0]).toMatchObject({ qualification: { kind: 'point' }, constraint: { type: 'constraint', id: envelope.id, revision: 1 }, marginUnit: 'mm' })
    expect(ev.body.results[0].margin).toBeCloseTo(6, 9)
    expect(ev.body.results[1].margin).toBeCloseTo(-0.5, 9)
    expect(ev.body.provenance.sourceKind).toBe('assistant')
    // A status that contradicts the bound is refused; results need a pinned source and the tool.
    expect((await post('/evidence', { subjects: [ref('concept', c.id)], kind: 'analysis', title: 'x', basis: 'estimate', source, tool, results: [{ ...results[1], status: 'satisfied' }] })).status).toBe(422)
    expect((await post('/evidence', { subjects: [ref('concept', c.id)], kind: 'analysis', title: 'x', basis: 'estimate', source: { ...source, revision: undefined }, tool, results })).status).toBe(422)
    expect((await post('/evidence', { subjects: [ref('concept', c.id)], kind: 'analysis', title: 'x', basis: 'estimate', source, results })).status).toBe(422)
    expect((await post('/evidence', { subjects: [ref('concept', c.id)], kind: 'analysis', title: 'x', basis: 'estimate', source, tool, results: [{ ...results[0], unit: 'kg' }] })).status).toBe(422)
    // The assistant never records verified evidence.
    expect((await post('/evidence', { subjects: [ref('concept', c.id)], kind: 'analysis', title: 'x', basis: 'evidence', source, tool, results, artifact: { module: 'twin', id: 'OUT-001' } }, 'eli', assistant())).status).toBe(422)
  })
})

describe('atomic batch with placeholders (CR-C10, R1-1)', () => {
  const fnRef = (id: string) => ({ module: 'conceptualize', type: 'function', id })
  const cRef = (id: string) => ({ module: 'conceptualize', type: 'concept', id })
  it('creates related records in one transaction and resolves placeholders anywhere in later bodies', async () => {
    const res = await post('/batch', {
      reason: 'Explore a cooling function',
      items: [
        { op: 'createFunction', as: '$fn', body: { name: 'Reject heat', performanceObjectives: [{ name: 'Heat rejected', direction: 'maximize', quantity: { min: 40, unit: 'W' } }] } },
        { op: 'createConcept', as: '$fins', body: { name: 'Finned housing', performs: ['$fn'] } },
        { op: 'createConcept', as: '$fan', body: { name: 'Forced air' } },
        { op: 'createLink', body: { type: 'performs', from: cRef('$fan'), to: fnRef('$fn') } },
        { op: 'createConstraint', as: '$cst', body: { kind: 'qualitative', statement: 'No external power for cooling', subjects: [fnRef('$fn')], source: { kind: 'stated', basis: 'assumption' } } },
        { op: 'reviseConstraint', body: { id: '$cst', expectedRevision: 1, strength: 'soft', reason: 'Fan power is acceptable if small' } },
        { op: 'createAssumption', as: '$asm', body: { statement: 'Ambient 25 °C', basis: 'assumption', scope: { subjects: [fnRef('$fn')] } } },
        { op: 'updateFunction', body: { id: '$fn', expectedRevision: 1, purpose: 'Keep the motor below 80 °C' } },
      ],
    })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    await expectConforms(env, 'batch', 200, res.body)
    expect(Object.keys(res.body.ids).sort()).toEqual(['$asm', '$cst', '$fan', '$fins', '$fn'])
    expect(res.body.results.map((r: { op: string }) => r.op)).toEqual(['createFunction', 'createConcept', 'createConcept', 'createLink', 'createConstraint', 'reviseConstraint', 'createAssumption', 'updateFunction'])
    expect((await get(`/functions/${res.body.ids.$fn}`)).body).toMatchObject({ revision: 2, purpose: 'Keep the motor below 80 °C' })
    const performs = (await get(`/design-links?id=${res.body.ids.$fn}&type=performs`)).body
    expect(performs).toHaveLength(2)
    const cst = (await get(`/constraints/${res.body.ids.$cst}`)).body
    expect(cst).toMatchObject({ revision: 2, strength: 'soft', basis: 'assumption', source: { kind: 'stated', basis: 'assumption' } })
  })

  it('rolls everything back when one item fails, naming the item and field', async () => {
    const count = (await get('/functions')).body.length
    const res = await post('/batch', {
      items: [
        { op: 'createFunction', as: '$ok', body: { name: 'Would be created' } },
        { op: 'createLink', body: { type: 'performs', from: cRef('$missing'), to: fnRef('$ok') } },
      ],
    })
    expect(res.status).toBe(422)
    expect(res.body.error.message).toContain('$missing')
    const bad = await post('/batch', { items: [{ op: 'createFunction', body: { name: '' } }] })
    expect(bad.status).toBe(422)
    expect(bad.body.error.message).toMatch(/^Item 0 \(createFunction\)/)
    const rule = await post('/batch', { items: [{ op: 'createFunction', as: '$f', body: { name: 'Fine' } }, { op: 'createLink', body: { type: 'decomposes-into', from: fnRef('$f'), to: fnRef('$f') } }] })
    expect(rule.status).toBe(422)
    expect(rule.body.error.message).toMatch(/^Item 1 \(createLink\)/)
    expect((await get('/functions')).body.length).toBe(count)
    // Idempotency-Key is required; replay returns the same result.
    expect((await env.call('eli', 'POST', `${BASE}/batch`, { items: [{ op: 'createFunction', body: { name: 'x' } }] })).status).toBe(400)
    const key = { 'idempotency-key': `batch-${Date.now()}` }
    const once = await env.call('eli', 'POST', `${BASE}/batch`, { items: [{ op: 'createFunction', as: '$x', body: { name: 'Replayed' } }] }, key)
    const twice = await env.call('eli', 'POST', `${BASE}/batch`, { items: [{ op: 'createFunction', as: '$x', body: { name: 'Replayed' } }] }, key)
    expect(twice.body.ids).toEqual(once.body.ids)
    // Operations of later change requests answer 501.
  })

  it('separates proposing and recording decisions (R1-3) and invalidates a superseded decision (R1-7)', async () => {
    const a = await concept('Batch option A')
    const b = await concept('Batch option B')
    const asm = (await post('/assumptions', { statement: 'Batch duty cycle 10 %', basis: 'assumption' })).body
    const propose = { op: 'proposeDecision', as: '$d', body: { title: 'Take A', rationale: 'Lighter', subjectId: a.id, outcomes: [{ conceptId: a.id, outcome: 'accepted' }, { conceptId: b.id, outcome: 'rejected' }], assumptionIds: [{ id: asm.id, revision: 1 }] } }
    const byReviewer = await post('/batch', { items: [propose] }, 'rui')
    expect(byReviewer.status).toBe(403)
    const both = await post('/batch', { items: [propose, { op: 'recordDecision', body: { id: '$d', reason: 'x' } }] })
    expect(both.status).toBe(403)
    expect(both.body.error.message).toMatch(/^Item 1 \(recordDecision\)/)
    const proposed = await post('/batch', { items: [propose] })
    expect(proposed.status).toBe(200)
    const id = proposed.body.ids.$d
    expect((await get(`/decisions/${id}`)).body).toMatchObject({ status: 'proposed', assumptionIds: [{ id: asm.id, revision: 1 }] })
    expect((await post('/batch', { items: [{ op: 'flagDecisionForReview', body: { id, reason: 'Too early' } }] })).status).toBe(409)
    expect((await post('/batch', { items: [{ op: 'recordDecision', body: { id, reason: 'Reviewed' } }] }, 'rui')).status).toBe(200)
    const flagged = await post('/batch', { items: [{ op: 'flagDecisionForReview', body: { id, reason: 'Impact report IR-1', impactReportId: 'IR-1' } }] })
    expect(flagged.status).toBe(200)
    expect((await get(`/decisions/${id}`)).body).toMatchObject({ validity: 'under-review', reviewFlags: [{ reason: 'Impact report IR-1', impactReportId: 'IR-1', by: 'eli' }] })
    // Pins must name an existing revision.
    expect((await post('/batch', { items: [{ ...propose, body: { ...propose.body, assumptionIds: [{ id: asm.id, revision: 9 }] } }] })).status).toBe(422)
    // Superseding by a recorded decision invalidates the old one.
    const revisit = await post('/batch', { items: [{ op: 'proposeDecision', as: '$n', body: { title: 'Take B after all', rationale: 'Load changed', subjectId: a.id, supersedesId: id, outcomes: [{ conceptId: b.id, outcome: 'accepted' }, { conceptId: a.id, outcome: 'rejected' }] } }] })
    await post('/batch', { items: [{ op: 'recordDecision', body: { id: revisit.body.ids.$n, reason: 'Reviewed' } }] }, 'rui')
    expect((await get(`/decisions/${id}`)).body.validity).toBe('invalidated')
  })

  it('maps R1 bodies of alternative sets, trade studies, scores and implementations', async () => {
    const parent = await concept('Batch parent')
    const x = await concept('Batch X')
    const y = await concept('Batch Y')
    const res = await post('/batch', {
      items: [
        { op: 'createAlternativeSet', as: '$set', body: { name: 'Drives', question: 'Which drive?', parentConceptId: parent.id, memberIds: [x.id, y.id] } },
        { op: 'createTradeStudy', as: '$ts', body: { title: 'Drive study', setId: '$set', criteria: [{ name: 'Mass', category: 'mass', weight: 1, direction: 'minimize', scale: 'quantity', unit: 'kg' }] } },
        { op: 'createImplementation', as: '$impl', body: { name: 'X in CAD', concepts: [{ conceptId: x.id }], artifacts: [{ module: 'cad', id: 'CAD-120', revision: 1 }] } },
      ],
    })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const study = (await get(`/trade-studies/${res.body.ids.$ts}`)).body
    const scored = await post('/batch', { items: [{ op: 'putScores', body: { studyId: study.id, expectedRevision: study.revision, scores: [{ criterionId: study.criteria[0].id, conceptId: x.id, value: 2, basis: 'estimate', rationale: 'Hand estimate' }] } }] })
    expect(scored.status, JSON.stringify(scored.body)).toBe(200)
    expect(scored.body.results[0].revision).toBe(study.revision + 1)
    expect((await post('/batch', { items: [{ op: 'createAlternativeSet', body: { name: 'For a function', question: 'q', parentConceptId: parent.id, functionId: FN.linearForce, memberIds: [] } }] })).status).toBe(501)
  })
})

describe('Project Management references (CR-PM-CON-1)', () => {
  const PRODUCT = '7e57c0de-0000-4000-8000-00000000a001'
  const DOC = '7e57c0de-0000-4000-8000-00000000d001'
  it('accepts product elements in implementations and project documents as evidence', async () => {
    const c = await concept('Housing for the product element')
    const impl = await post('/implementations', { name: 'Housing as product element', conceptIds: [c.id], artifacts: [{ module: 'product', kind: 'product-element', id: PRODUCT, revision: 2, label: 'PE housing' }] })
    expect(impl.status, JSON.stringify(impl.body)).toBe(201)
    expect(impl.body.artifacts[0]).toMatchObject({ module: 'product', artifactId: PRODUCT, revision: 2 })
    const ev = await post('/evidence', { subjects: [ref('concept', c.id)], kind: 'review', title: 'Design review minutes', basis: 'evidence', artifact: { module: 'projects', kind: 'document', id: DOC, revision: 1, label: 'DOC-004 Review minutes' } })
    expect(ev.status, JSON.stringify(ev.body)).toBe(201)
    expect(ev.body.artifact).toMatchObject({ module: 'projects', id: DOC })
    const link = await post(`/concepts/${c.id}/links`, { relation: 'references', artifact: { module: 'projects', kind: 'document', id: DOC } })
    expect(link.status).toBe(201)
    // C3: System Model elements and CAD Modeler entities (scoped IDs, pinned revisions).
    const real = await post('/implementations', {
      name: 'Housing in the modelers',
      conceptIds: [c.id],
      artifacts: [
        { module: 'sysml', kind: 'sysml-model-element', id: '5f1c2e9a-0000-4000-8000-0000000000aa/3f1c2e9a-0000-4000-8000-000000000001', revision: 12 },
        { module: 'cad', kind: 'cad-modeler-entity', id: `${DOC}/body-1`, revision: 4 },
      ],
    })
    expect(real.status, JSON.stringify(real.body)).toBe(201)
    expect(real.body.artifacts.map((a: { kind: string; revision: number }) => [a.kind, a.revision]).sort()).toEqual([['cad-modeler-entity', 4], ['sysml-model-element', 12]])
    expect((await post('/implementations', { name: 'Bad', conceptIds: [c.id], artifacts: [{ module: 'sysml', kind: 'sysml-model-element', id: 'SYS-003' }] })).status).toBe(422)
    expect((await post('/implementations', { name: 'Bad', conceptIds: [c.id], artifacts: [{ module: 'cad', kind: 'cad-modeler-entity', id: 'not-a-uuid/body-1' }] })).status).toBe(422)
    // Shape checks: UUIDs and known kinds only.
    expect((await post('/implementations', { name: 'Bad', conceptIds: [c.id], artifacts: [{ module: 'product', id: 'PE-1' }] })).status).toBe(422)
    expect((await post('/implementations', { name: 'Bad', conceptIds: [c.id], artifacts: [{ module: 'product', kind: 'part', id: PRODUCT }] })).status).toBe(422)
    expect((await post('/evidence', { subjects: [ref('concept', c.id)], kind: 'review', title: 'x', basis: 'estimate', artifact: { module: 'conceptualize', id: c.id } })).status).toBe(400)
  })
})

describe('R1 refinements', () => {
  it('needs a reviewer to validate or invalidate an assumption a recorded decision rests on (R1-2)', async () => {
    const a = await concept('Pinned option')
    const asm = (await post('/assumptions', { statement: 'Pinned assumption', basis: 'assumption' })).body
    const ev = (await post('/evidence', { subjects: [ref('assumption', asm.id)], kind: 'test', title: 'Check', basis: 'estimate' })).body
    await post('/decisions', { title: 'Rest on it', rationale: 'r', subjectId: a.id, record: true, outcomes: [{ conceptId: a.id, outcome: 'accepted' }], assumptionIds: [{ id: asm.id }] }, 'ada')
    const byEditor = await post(`/assumptions/${asm.id}/validation`, { status: 'validated', evidence: ref('evidence', ev.id), reason: 'Checked' })
    expect(byEditor.status).toBe(403)
    expect((await post(`/assumptions/${asm.id}/validation`, { status: 'validated', reason: 'No evidence' }, 'rui')).status).toBe(422)
    const ok = await post(`/assumptions/${asm.id}/validation`, { status: 'validated', evidence: ref('evidence', ev.id), reason: 'Checked' }, 'rui')
    expect(ok.status).toBe(200)
    await expectConforms(env, 'setAssumptionValidation', 200, ok.body)
    // Invalidating needs no evidence (R1-2) but still a reviewer here.
    expect((await post(`/assumptions/${asm.id}/validation`, { status: 'invalidated', reason: 'Measured higher' }, 'rui')).status).toBe(200)
  })

  it('returns R1 derived edges marked derived, with the project revision', async () => {
    const t = await post('/graph/traverse', { start: [ref('concept', SEED.actuator)], maxDepth: 1 }, 'rho')
    expect(t.status).toBe(200)
    await expectConforms(env, 'traverseGraph', 200, t.body)
    expect(t.body.builtFrom.revision).toBeGreaterThan(0)
    const derived = t.body.edges.filter((e: { derived: boolean }) => e.derived)
    expect(derived.length).toBeGreaterThan(0)
    expect(t.body.edges.filter((e: { derived: boolean }) => !e.derived).every((e: { stored: string }) => e.stored !== 'derived')).toBe(true)
    const names = new Set((await get('/link-types')).body.filter((l: { stored: string }) => l.stored === 'derived').map((l: { name: string }) => l.name))
    for (const n of ['realizes', 'realized-as', 'selected-through', 'decides', 'member', 'decision-assumes', 'decision-constrained-by', 'subject', 'affects', 'watches']) expect(names.has(n), n).toBe(true)
    for (const e of derived) expect(names.has(e.type), e.type).toBe(true)
    const types = (await get('/link-types')).body
    expect(types.find((l: { name: string }) => l.name === 'formalizes')).toMatchObject({ propagation: 'both', artifactModules: ['requirements'] })
    expect(types.find((l: { name: string }) => l.name === 'depends-on').fromTypes).toContain('alternative-set')
  })
})

describe('graph queries and search (CR-C9)', () => {
  it('traverses from a function, lists the neighbourhood, finds paths and honours asOf', async () => {
    const t = await post('/graph/traverse', { start: [ref('function', FN.linearForce)], follow: [{ type: 'performs', direction: 'in' }, { type: 'decomposes-into', direction: 'out' }], maxDepth: 2 }, 'rho')
    expect(t.status).toBe(200)
    await expectConforms(env, 'traverseGraph', 200, t.body)
    const types = new Set(t.body.nodes.map((n: { type: string }) => n.type))
    expect(types.has('function')).toBe(true)
    expect(types.has('concept')).toBe(true)
    expect(t.body.edges.every((e: { type: string }) => ['performs', 'decomposes-into'].includes(e.type))).toBe(true)
    const onlyFunctions = await post('/graph/traverse', { start: [ref('function', FN.linearForce)], nodeTypes: ['function'], maxDepth: 1 }, 'rho')
    expect(onlyFunctions.body.nodes.every((n: { type: string }) => n.type === 'function')).toBe(true)
    const nb = await get(`/graph/neighbourhood?type=function&id=${FN.linearForce}&depth=1`)
    expect(nb.status).toBe(200)
    expect(nb.body.nodes.length).toBeGreaterThan(3)
    const past = await post('/graph/traverse', { start: [ref('function', FN.linearForce)], maxDepth: 1, asOf: '2000-01-01T00:00:00Z' }, 'rho')
    expect(past.body.edges).toEqual([])
    const sub = FN.effort
    const paths = await post('/graph/paths', { from: ref('function', sub), to: ref('constraint', (await get(`/constraints?subjectId=${FN.linearForce}`)).body[0].id), maxDepth: 3 }, 'rho')
    expect(paths.status).toBe(200)
    await expectConforms(env, 'graphPaths', 200, paths.body)
    expect(paths.body.paths.length).toBeGreaterThan(0)
  })

  it('searches across record types', async () => {
    const res = await get('/search?q=linear%20force')
    expect(res.status).toBe(200)
    await expectConforms(env, 'searchDesign', 200, res.body)
    expect(res.body.items.some((i: { ref: { type: string; id: string } }) => i.ref.type === 'function' && i.ref.id === FN.linearForce)).toBe(true)
    const onlyConstraints = await get('/search?q=envelope&types=constraint')
    expect(onlyConstraints.body.items.length).toBeGreaterThan(0)
    expect(onlyConstraints.body.items.every((i: { ref: { type: string } }) => i.ref.type === 'constraint')).toBe(true)
    const key = await get('/search?q=FN-00')
    expect(key.body.items.length).toBeGreaterThan(0)
  })
})

describe('events and OpenAPI for design knowledge', () => {
  it('emits events for the new entities after commit', async () => {
    const events: ConceptsEvent[] = []
    const off = env.server.conceptEvents.subscribe('PRJ-ACT100', (e) => events.push(e))
    try {
      const fn = (await post('/functions', { name: 'Evented function' })).body
      const asm = (await post('/assumptions', { statement: 'Evented assumption' })).body
      await env.server.conceptEvents.flush()
      await expect.poll(() => events.find((e) => e.entityId === fn.id)?.type, { timeout: 5000 }).toBe('function.created')
      await expect.poll(() => events.find((e) => e.entityId === asm.id)?.type, { timeout: 5000 }).toBe('assumption.created')
    } finally {
      off()
    }
  })

  it('documents every design route with permissions', async () => {
    const doc = (await env.call('', 'GET', '/api/concepts/v1/openapi.json')).body
    const ops = Object.values(doc.paths).flatMap((m) => Object.values(m as Record<string, { operationId: string; 'x-permissions': unknown }>))
    const ids = new Set(ops.map((o) => o.operationId))
    for (const id of ['createFunction', 'convertToFunction', 'createConstraint', 'promoteStatement', 'createAssumption', 'setAssumptionValidation', 'registerLinkType', 'createDesignLink', 'flagDecisionForReview', 'reviseConstraint', 'decisionRationale', 'reviewEvidence', 'batch', 'traverseGraph', 'graphPaths', 'searchDesign']) expect(ids.has(id), id).toBe(true)
    for (const op of ops) expect(op['x-permissions'], op.operationId).toBeTruthy()
    const byId = Object.fromEntries(ops.map((o) => [o.operationId, o as Record<string, unknown>]))
    expect(byId.createDecision['x-r1-operation']).toBe('proposeDecision')
    expect(byId.putTradeScores['x-r1-operation']).toBe('putScores')
    expect(byId.createDesignLink['x-r1-operation']).toBe('createLink')
    expect(byId.createLink['x-r1-note']).toMatch(/createConceptLink/)
    expect(doc.components.schemas.Decision.properties.validity).toBeTruthy()
    expect(doc.components.schemas.Evidence.properties.subjects).toBeTruthy()
  })
})

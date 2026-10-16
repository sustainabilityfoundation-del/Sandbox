import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CONCEPT_SEED_IDS as SEED } from '@ews/conceptualize-service'
import { BASE, assistant, createTestEnv, expectConforms, idem, type TestEnv } from './helpers'

/**
 * CR-C8 calculation models and the C11 storage contract (contract-change-requests.md, "CR-C8 and C11: storage
 * contract", rules Q1–Q8) on real PostgreSQL.
 */
let env: TestEnv
beforeAll(async () => {
  env = await createTestEnv()
})
afterAll(async () => {
  await env?.close()
})

const post = (path: string, body: unknown, user = 'eli', headers: Record<string, string> = {}) => env.call(user, 'POST', `${BASE}${path}`, body, idem(headers))
const get = (path: string, user = 'rho') => env.call(user, 'GET', `${BASE}${path}`)
const ref = (type: string, id: string, revision?: number) => ({ module: 'conceptualize', type, id, ...(revision ? { revision } : {}) })
const ROD = { F: { value: 12, unit: 'kN' }, E: { value: 210, unit: 'GPa' }, Sy: { value: 600, unit: 'MPa' }, d: { value: 25, unit: 'mm' }, L: { value: 600, unit: 'mm' }, K: { value: 1, unit: '-' }, n: { value: 2, unit: '-' } }

/** A small person-authored model y = a·x with a check y ≤ limit; x bound to an assumption. */
const lineModel = (assumptionId: string) => ({
  name: 'Line',
  grammar: 'ews-expr/1',
  basis: 'user-assertion',
  parameters: [
    { symbol: 'x', name: 'x', role: 'input', unit: 'mm', defaultBinding: { ref: ref('assumption', assumptionId), property: 'quantity' } },
    { symbol: 'a', name: 'slope', role: 'constant', unit: '-', value: 2 },
    { symbol: 'limit', name: 'limit', role: 'constant', unit: 'mm', value: 30 },
    { symbol: 'y', name: 'y', role: 'output', unit: 'mm' },
  ],
  relations: [
    { id: 'r1', kind: 'assignment', expression: 'y = a * x' },
    { id: 'c1', kind: 'constraint', expression: 'y <= limit' },
  ],
})

describe('calculation models (CR-C8)', () => {
  it('creates a model from the engine library (unvalidated) and refuses invalid models and AI validation claims', async () => {
    const lib = await get('/calculation-library')
    expect(lib.body.map((e: { id: string }) => e.id)).toContain('lib.column.euler-round')
    const m = await post('/calculation-models', { fromLibrary: 'lib.column.euler-round', name: 'Rod buckling' })
    expect(m.status, JSON.stringify(m.body)).toBe(201)
    await expectConforms(env, 'createCalculationModel', 201, m.body)
    expect(m.body).toMatchObject({ key: expect.stringMatching(/^CALC-\d{3}$/), revision: 1, validationStatus: 'unvalidated', libraryId: 'lib.column.euler-round', basis: 'ai-hypothesis', digest: expect.any(String) })
    const bad = await post('/calculation-models', { name: 'Bad', parameters: [{ symbol: 'x', name: 'x', role: 'input', unit: 'mm' }, { symbol: 'y', name: 'y', role: 'output', unit: 'kg' }], relations: [{ id: 'r1', kind: 'assignment', expression: 'y = x' }] })
    expect(bad.status).toBe(422)
    expect(Object.keys(bad.body.error.details.fields).some((k) => k.startsWith('model.'))).toBe(true)
    expect((await post('/calculation-models', { ...lineModel(SEED.actuator), validationStatus: 'validated' }, 'eli', assistant())).status).toBe(422)
    expect((await post('/calculation-models', { name: 'x', parameters: [], relations: [] }, 'rho')).status).toBe(403)
  })

  it('validation is a reviewer’s record; a new revision resets it', async () => {
    const asm = (await post('/assumptions', { statement: 'x is 10 mm', quantity: { value: 10, unit: 'mm' }, basis: 'assumption', scope: { subjects: [ref('concept', SEED.actuator)] } })).body
    const m = (await post('/calculation-models', lineModel(asm.id))).body
    expect((await post(`/calculation-models/${m.id}/validate`, { status: 'validated', reason: 'Checked by hand' })).status).toBe(403)
    expect((await post(`/calculation-models/${m.id}/validate`, { status: 'validated', reason: 'Checked by hand' }, 'rui', assistant())).status).toBe(403)
    const v = await post(`/calculation-models/${m.id}/validate`, { status: 'validated', reason: 'Checked by hand' }, 'rui')
    expect(v.body.validationStatus).toBe('validated')
    const r2 = await env.call('eli', 'PATCH', `${BASE}/calculation-models/${m.id}`, { expectedRevision: 1, description: 'Line with a limit' })
    expect(r2.body).toMatchObject({ revision: 2, validationStatus: 'unvalidated' })
    expect((await get(`/calculation-models/${m.id}?revision=1`)).body.revision).toBe(1)
  })

  it('evaluates read-only with default bindings and engine qualifications', async () => {
    const m = (await post('/calculation-models', { fromLibrary: 'lib.column.euler-round', name: 'Rod buckling (eval)' })).body
    const r = await post(`/calculation-models/${m.id}/evaluate`, { inputs: ROD })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    await expectConforms(env, 'evaluateCalculationModel', 200, r.body)
    const pcr = r.body.qualifications.outputs.find((o: { symbol: string }) => o.symbol === 'P_cr')
    expect(pcr.value).toBeCloseTo(110.39425494491515, 6)
    expect(pcr.range).toEqual({ kind: 'point' })
    expect(r.body.basis).toBe('estimate') // unvalidated AI-hypothesis library model
    expect(r.body.qualifications.limits).toMatchObject({ establishesModelValidity: false, establishesRequirementSatisfaction: false })
    const ranged = await post(`/calculation-models/${m.id}/evaluate`, { inputs: { ...ROD, d: { value: 25, min: 24, max: 26, unit: 'mm' } }, uncertainty: 'interval' })
    const out = ranged.body.qualifications.outputs.find((o: { symbol: string }) => o.symbol === 'P_cr')
    expect(out.range.kind).toBe('bounds')
    expect(['exact', 'enclosure']).toContain(out.range.quality)
    const c1 = ranged.body.qualifications.checks.find((c: { relationId: string }) => c.relationId === 'c1')
    expect(['satisfied', 'violated', 'uncertain']).toContain(c1.status)
    expect(c1.statusBasis).not.toBe('point')
    // Missing inputs are named.
    const missing = await post(`/calculation-models/${m.id}/evaluate`, { inputs: { F: ROD.F } })
    expect(missing.status).toBe(422)
    expect(missing.body.error.message).toMatch(/Inputs missing/)
  })
})

describe('calculated evidence (C11 storage contract)', () => {
  it('Q1/Q2: accepts a verified calculation, derives the qualifications, refuses tampered manifests and excess basis', async () => {
    const asm = (await post('/assumptions', { statement: 'x is 10 mm', quantity: { value: 10, unit: 'mm' }, basis: 'assumption', scope: { subjects: [ref('concept', SEED.actuator)] } })).body
    const m = (await post('/calculation-models', lineModel(asm.id))).body
    await post(`/calculation-models/${m.id}/validate`, { status: 'validated', reason: 'Checked' }, 'rui')
    const r = (await post(`/calculation-models/${m.id}/evaluate`, {})).body
    expect(r.basis, JSON.stringify(r).slice(0, 600)).toBe('calculated')
    expect(r.inputs.x).toMatchObject({ value: 10, unit: 'mm', source: { kind: 'binding', property: 'quantity', ref: { type: 'assumption', id: asm.id } } })
    const calculation = { modelId: m.id, modelRevision: 1, manifest: r.manifest }
    const forgedClaims = { checks: [{ status: 'satisfied' }] }
    const ev = await post('/evidence', { subjects: [ref('concept', SEED.actuator)], kind: 'calculation', title: 'Line check', basis: 'calculated', calculation, qualifications: forgedClaims })
    expect(ev.status, JSON.stringify(ev.body)).toBe(201)
    await expectConforms(env, 'getEvidence', 200, (await get(`/evidence/${ev.body.id}`)).body)
    expect(ev.body).toMatchObject({ basis: 'calculated', qualificationsSource: 'stored', calculation: { modelId: m.id, modelRevision: 1, verification: { ok: true, engineVersion: expect.any(String) } } })
    expect(ev.body.qualifications.outputs[0]).toMatchObject({ symbol: 'y', value: 20, range: { kind: 'point' } })
    expect(ev.body.qualifications.checks[0]).toMatchObject({ relationId: 'c1', status: 'satisfied', statusBasis: 'point' })
    // A tampered manifest does not reproduce.
    const tampered = structuredClone(r.manifest)
    tampered.outputs[0].value = 12
    const bad = await post('/evidence', { subjects: [ref('concept', SEED.actuator)], kind: 'calculation', title: 'Forged', basis: 'calculated', calculation: { ...calculation, manifest: tampered } })
    expect(bad.status).toBe(422)
    expect(bad.body.error.details.reasons.length).toBeGreaterThan(0)
    // Another model revision does not match the manifest.
    await env.call('eli', 'PATCH', `${BASE}/calculation-models/${m.id}`, { expectedRevision: 1, relations: [{ id: 'r1', kind: 'assignment', expression: 'y = a * x + 1 mm' }, { id: 'c1', kind: 'constraint', expression: 'y <= limit' }] })
    expect((await post('/evidence', { subjects: [ref('concept', SEED.actuator)], kind: 'calculation', title: 'Wrong revision', basis: 'calculated', calculation: { ...calculation, modelRevision: 2 } })).status).toBe(422)
    // An unvalidated AI-hypothesis model yields an estimate; calculated would exceed it.
    const lib = (await post('/calculation-models', { fromLibrary: 'lib.column.euler-round', name: 'Rod buckling (evidence)' })).body
    const lr = (await post(`/calculation-models/${lib.id}/evaluate`, { inputs: ROD })).body
    const libCalc = { modelId: lib.id, modelRevision: 1, manifest: lr.manifest }
    expect((await post('/evidence', { subjects: [ref('concept', SEED.actuator)], kind: 'calculation', title: 'Too strong', basis: 'calculated', calculation: libCalc })).status).toBe(422)
    const est = await post('/evidence', { subjects: [ref('concept', SEED.actuator)], kind: 'calculation', title: 'Rod buckling estimate', basis: 'estimate', calculation: libCalc }, 'eli', assistant())
    expect(est.status, JSON.stringify(est.body)).toBe(201)
    expect(est.body.qualifications.limits).toMatchObject({ establishesModelValidity: false, establishesRequirementSatisfaction: false, modelValidationStatus: 'unvalidated' })
    // Q7: evidence never changes a verification status.
    expect((await get(`/concepts/${SEED.actuator}`)).body.verificationStatus).toBe('not-verified')
    // Graph: produced-by and binds are derived edges.
    const t = (await post('/graph/traverse', { start: [ref('evidence', ev.body.id)], maxDepth: 2 }, 'rho')).body
    expect(t.edges.some((e: { type: string; derived: boolean }) => e.type === 'produced-by' && e.derived)).toBe(true)
    expect(t.edges.some((e: { type: string; to: { id: string } }) => e.type === 'binds' && e.to.id === asm.id)).toBe(true)
  })

  it('Q5/Q6: scores taken from calculated evidence match it and carry its qualification; Q8 rationale shows checks and limits', async () => {
    const asm = (await post('/assumptions', { statement: 'x is 10 mm', quantity: { value: 10, unit: 'mm' }, basis: 'assumption', scope: { subjects: [ref('concept', SEED.actuator)] } })).body
    const m = (await post('/calculation-models', lineModel(asm.id))).body
    await post(`/calculation-models/${m.id}/validate`, { status: 'validated', reason: 'Checked' }, 'rui')
    const r = (await post(`/calculation-models/${m.id}/evaluate`, {})).body
    const a = (await post('/concepts', { name: 'Option A (calc)' })).body
    const b = (await post('/concepts', { name: 'Option B (calc)' })).body
    const parent = (await post('/concepts', { name: 'Choose (calc)' })).body
    const ev = (await post('/evidence', { subjects: [ref('concept', a.id)], kind: 'calculation', title: 'Line for A', basis: 'calculated', calculation: { modelId: m.id, modelRevision: 1, manifest: r.manifest } })).body
    const set = (await post('/alternative-sets', { parentId: parent.id, name: 'Calc set', memberIds: [a.id, b.id] })).body
    const study = (await post('/trade-studies', { title: 'Calc study', setId: set.id, criteria: [{ name: 'y', category: 'performance', weight: 1, direction: 'minimize', scale: 'quantity', unit: 'mm' }] })).body
    const crit = study.criteria[0].id
    const put = (scores: unknown[], rev: number) => env.call('eli', 'PUT', `${BASE}/trade-studies/${study.id}/scores`, { expectedRevision: rev, scores })
    expect((await put([{ criterionId: crit, conceptId: a.id, value: 21, basis: 'calculated', evidenceId: ev.id, evidenceOutput: 'y' }], study.revision)).status).toBe(422)
    expect((await put([{ criterionId: crit, conceptId: a.id, value: 20, low: 19, high: 21, basis: 'calculated', evidenceId: ev.id, evidenceOutput: 'y' }], study.revision)).status).toBe(422)
    const ok = await put([{ criterionId: crit, conceptId: a.id, value: 2, unit: 'cm', basis: 'calculated', evidenceId: ev.id, evidenceOutput: 'y', qualification: { kind: 'bounds', quality: 'exact' } }, { criterionId: crit, conceptId: b.id, value: 40, basis: 'estimate' }], study.revision)
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    const score = ok.body.scores.find((s: { conceptId: string }) => s.conceptId === a.id)
    expect(score).toMatchObject({ evidenceOutput: 'y', qualification: { source: 'calculation', evidenceId: ev.id, symbol: 'y', kind: 'point' } })
    expect(score.qualification.quality).toBeUndefined()
    expect(ok.body.result.qualifications).toMatchObject({ points: 2, exactBounds: 0, enclosures: 0, sampledRanges: 0 })
    // Q8: the decision rationale lists the checks with their basis and the manifest limits.
    const dec = (await post('/decisions', { title: 'Take A (calc)', rationale: 'Lower y', subjectId: parent.id, outcomes: [{ conceptId: a.id, outcome: 'accepted' }], support: [{ ref: ref('evidence', ev.id), role: 'supports' }] })).body
    const rat = (await get(`/decisions/${dec.id}/rationale`)).body
    expect(rat.support[0]).toMatchObject({ basis: 'calculated', checks: [{ relationId: 'c1', status: 'satisfied', statusBasis: 'point' }], limits: { establishesModelValidity: false, establishesRequirementSatisfaction: false } })
  })

  it('creates calculation models in a batch', async () => {
    const asm = (await post('/assumptions', { statement: 'x is 5 mm', quantity: { value: 5, unit: 'mm' }, basis: 'assumption', scope: { subjects: [ref('concept', SEED.actuator)] } })).body
    const res = await post('/batch', { items: [{ op: 'createCalculationModel', as: '$m', body: lineModel(asm.id) }, { op: 'createLink', body: { type: 'depends-on', from: ref('concept', SEED.actuator), to: { module: 'conceptualize', type: 'calculation-model', id: '$m' } } }] })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.results[0]).toMatchObject({ op: 'createCalculationModel', key: expect.stringMatching(/^CALC-/), revision: 1 })
  })
})

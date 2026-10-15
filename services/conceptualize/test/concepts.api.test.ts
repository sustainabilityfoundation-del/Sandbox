import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ConceptsEvent } from '@ews/platform-sdk'
import { CONCEPT_SEED_IDS as SEED, CONCEPT_SEED_REQUIREMENTS as REQ } from '@ews/conceptualize-service'
import { BASE, assistant, createTestEnv, expectConforms, idem, type TestEnv } from './helpers'

let env: TestEnv
beforeAll(async () => {
  env = await createTestEnv()
})
afterAll(async () => {
  await env?.close()
})

const create = async (body: Record<string, unknown>, user = 'eli', headers: Record<string, string> = {}) => env.call(user, 'POST', `${BASE}/concepts`, { name: 'Test concept', ...body }, idem(headers))
const get = (id: string, user = 'rho') => env.call(user, 'GET', `${BASE}/concepts/${id}`)

describe('seed, identity and access (contracts §3, §6)', () => {
  it('seeds the example Concepts with stable UUIDs and keys', async () => {
    const res = await env.call('rho', 'GET', `${BASE}/concepts?limit=200`)
    expect(res.status).toBe(200)
    await expectConforms(env, 'listConcepts', 200, res.body)
    const keys = res.body.items.map((c: { key: string }) => c.key)
    expect(keys.slice(0, 3)).toEqual(['CON-001', 'CON-002', 'CON-003'])
    const act = await get(SEED.actuator)
    expect(act.body).toMatchObject({ key: 'CON-001', name: 'Linear actuator ACT-100', maturity: 'engineering-development', implementationStatus: 'in-development', verificationStatus: 'not-verified' })
    expect(act.headers.etag).toBe(`"${act.body.revision}"`)
    await expectConforms(env, 'getConcept', 200, act.body)
  })

  it('refuses missing identities, non-members and unentitled users; other tools may read the SDK subset', async () => {
    expect((await env.call('', 'GET', `${BASE}/concepts`)).status).toBe(401)
    // nia has SysML and CAD but not Conceptualize: SDK reads are allowed, authoring is not.
    expect((await env.call('nia', 'GET', `${BASE}/concepts`)).status).toBe(200)
    expect((await env.call('nia', 'GET', `${BASE}/graph`)).status).toBe(403)
    const write = await create({}, 'nia')
    expect(write.status).toBe(403)
    expect(write.body.error.code).toBe('forbidden')
    expect((await create({}, 'rho')).status).toBe(403)
    expect((await env.call('eli', 'GET', `/api/concepts/v1/projects/PRJ-OTHER/concepts`)).status).toBe(403)
    expect((await get('00000000-0000-4000-8000-000000000000')).status).toBe(404)
  })

  it('reports the caller’s permissions', async () => {
    const res = await env.call('rui', 'GET', `${BASE}/me/permissions`)
    expect(res.body).toEqual({ userId: 'rui', projectId: 'PRJ-ACT100', role: 'reviewer', permissions: ['read', 'decide'] })
  })
})

describe('Concepts from natural language, revisions and concurrency (vertical slice 1, 2)', () => {
  it('creates a Concept with typed statements and unit-aware quantities, persists it and keeps revisions immutable', async () => {
    const text = 'A compact gripper that holds parts of up to 2 kg and opens within 0.5 s.'
    const created = await create({
      name: 'Compact gripper',
      description: text,
      abstraction: 'component',
      statements: [
        { kind: 'constraint', text: 'Payload', quantity: { max: 2, unit: 'kg' } },
        { kind: 'performance', text: 'Opening time', quantity: { max: 0.5, unit: 's' } },
        { kind: 'question', text: 'Pneumatic or electric?' },
      ],
    })
    expect(created.status).toBe(201)
    await expectConforms(env, 'createConcept', 201, created.body)
    const c = created.body
    expect(c.key).toMatch(/^CON-\d{3}$/)
    expect(c).toMatchObject({ revision: 1, maturity: 'idea', description: text, provenance: { sourceKind: 'user' } })
    expect(c.statements.map((s: { basis: string }) => s.basis)).toEqual(['user-assertion', 'user-assertion', 'user-assertion'])
    expect(c.statements[2]).toMatchObject({ kind: 'question', state: 'open' })

    const read = await get(c.id)
    expect(read.body).toEqual(c)

    const statements = [...c.statements.map((s: { id: string; kind: string; text: string }) => ({ id: s.id, kind: s.kind, text: s.text })), { kind: 'function', text: 'Grip and release parts.' }]
    statements[2] = { ...statements[2], state: 'resolved' } as never
    const a = await env.call('eli', 'PATCH', `${BASE}/concepts/${c.id}`, { expectedRevision: 1, purpose: 'Hold parts during assembly', statements, reason: 'Elaborated' })
    expect(a.status).toBe(200)
    expect(a.body.revision).toBe(2)
    expect(a.body.statements.map((s: { id: string }) => s.id).slice(0, 3)).toEqual(c.statements.map((s: { id: string }) => s.id))
    const stale = await env.call('ada', 'PATCH', `${BASE}/concepts/${c.id}`, { expectedRevision: 1, name: 'Overwrite attempt' })
    expect(stale.status).toBe(409)
    expect(stale.body.error.details.currentRevision).toBe(2)
    const viaEtag = await env.call('eli', 'PATCH', `${BASE}/concepts/${c.id}`, { summary: 'Gripper' }, { 'if-match': '"2"' })
    expect(viaEtag.headers.etag).toBe('"3"')
    expect((await env.call('eli', 'PATCH', `${BASE}/concepts/${c.id}`, { summary: 'No revision check' })).status).toBe(400)
    const r1 = await env.call('rho', 'GET', `${BASE}/concepts/${c.id}?revision=1`)
    expect(r1.body.purpose).toBe('')
    const cmp = await env.call('rho', 'GET', `${BASE}/concepts/${c.id}/compare?from=1&to=3`)
    expect(cmp.body.changes.map((x: { field: string }) => x.field).sort()).toEqual(['purpose', 'statements', 'summary'])
    const revisions = await env.call('rho', 'GET', `${BASE}/concepts/${c.id}/revisions`)
    expect(revisions.body.map((r: { revision: number }) => r.revision)).toEqual([3, 2, 1])
    await expectConforms(env, 'listConceptRevisions', 200, revisions.body)
  })

  it('replays an idempotent create and refuses a reused key for a different request', async () => {
    const headers = idem()
    const a = await env.call('eli', 'POST', `${BASE}/concepts`, { name: 'Idempotent' }, headers)
    const b = await env.call('eli', 'POST', `${BASE}/concepts`, { name: 'Idempotent' }, headers)
    expect(b.body.id).toBe(a.body.id)
    expect(b.headers['idempotency-replayed']).toBe('true')
    const c = await env.call('eli', 'POST', `${BASE}/concepts`, { name: 'Different' }, headers)
    expect(c.status).toBe(422)
    expect((await env.call('eli', 'POST', `${BASE}/concepts`, { name: 'No key' })).status).toBe(400)
  })

  it('checks units and dimensions', async () => {
    const bad = await create({ statements: [{ kind: 'constraint', text: 'Force', quantity: { value: 5, unit: 'Nx' } }] })
    expect(bad.status).toBe(422)
    expect(bad.body.error.details.fields['statements.0.quantity']).toMatch(/Unknown unit/)
    const range = await create({ attributes: { mass: { min: 2, max: 1, unit: 'kg' } } })
    expect(range.status).toBe(422)
    const units = await env.call('rho', 'GET', `${BASE}/units?unit=N*m`)
    expect(units.body).toMatchObject({ valid: true, dimension: 'energy or torque' })
  })
})

describe('decomposition and relationship semantics (vertical slice 3)', () => {
  it('decomposes into children, shares children, and refuses cycles, self links and duplicates', async () => {
    const parent = (await create({ name: 'Parent system', abstraction: 'system' })).body
    const child = (await create({ name: 'Child function', abstraction: 'function', parentId: parent.id })).body
    const grandchild = (await create({ name: 'Grandchild', parentId: child.id })).body
    const other = (await create({ name: 'Second parent' })).body
    const rels = await env.call('rho', 'GET', `${BASE}/relationships?conceptId=${child.id}`)
    expect(rels.body.filter((r: { type: string }) => r.type === 'contains')).toHaveLength(2)
    // Shared child: a second parent may contain the same Concept.
    const shared = await env.call('eli', 'POST', `${BASE}/relationships`, { type: 'contains', fromId: other.id, toId: child.id }, idem())
    expect(shared.status).toBe(201)
    await expectConforms(env, 'createRelationship', 201, shared.body)
    const cycle = await env.call('eli', 'POST', `${BASE}/relationships`, { type: 'contains', fromId: grandchild.id, toId: parent.id }, idem())
    expect(cycle.status).toBe(422)
    expect(cycle.body.error.message).toMatch(/cycle/)
    expect((await env.call('eli', 'POST', `${BASE}/relationships`, { type: 'depends-on', fromId: child.id, toId: child.id }, idem())).status).toBe(422)
    expect((await env.call('eli', 'POST', `${BASE}/relationships`, { type: 'contains', fromId: parent.id, toId: child.id }, idem())).status).toBe(409)
    const itf = await env.call('eli', 'POST', `${BASE}/relationships`, { type: 'interfaces-with', fromId: child.id, toId: grandchild.id, interface: { name: 'Shaft', kind: 'mechanical' } }, idem())
    expect(itf.status).toBe(201)
    expect((await env.call('eli', 'POST', `${BASE}/relationships`, { type: 'interfaces-with', fromId: grandchild.id, toId: child.id }, idem())).status).toBe(409)
    expect((await env.call('eli', 'POST', `${BASE}/relationships`, { type: 'depends-on', fromId: child.id, toId: grandchild.id, interface: { name: 'x', kind: 'data' } }, idem())).status).toBe(422)
    // Removing is recorded, not deleted; the cycle check then allows the former reverse link.
    const removed = await env.call('eli', 'POST', `${BASE}/relationships/${shared.body.id}/remove`, { expectedRevision: 1, reason: 'test' })
    expect(removed.body).toMatchObject({ removed: true, revision: 2, removedBy: 'eli' })
    const types = await env.call('rho', 'GET', `${BASE}/relationship-types`)
    expect(types.body.map((t: { type: string }) => t.type)).toEqual(['contains', 'depends-on', 'interfaces-with', 'alternative-to', 'derived-from', 'refines', 'implements', 'conflicts-with', 'replaces'])
  })

  it('keeps alternative decompositions apart and refuses cycles across them', async () => {
    const graph = await env.call('rho', 'GET', `${BASE}/graph`)
    await expectConforms(env, 'conceptGraph', 200, graph.body)
    const decs = graph.body.decompositions.filter((d: { parentId: string }) => d.parentId === SEED.propulsion)
    expect(decs.map((d: { name: string }) => d.name)).toEqual(['Battery-electric', 'Hybrid-electric'])
    const thrustParents = graph.body.edges.filter((e: { type: string; toId: string }) => e.type === 'contains' && e.toId === SEED.thrust)
    expect(new Set(thrustParents.map((e: { decompositionId: string }) => e.decompositionId)).size).toBe(2)
    const cycle = await env.call('eli', 'POST', `${BASE}/relationships`, { type: 'contains', fromId: SEED.thrust, toId: SEED.propulsion }, idem())
    expect(cycle.status).toBe(422)
  })
})

// The owner's example, as the scripted demo assistant proposes it (see packages/tool-conceptualize).
const EXPLORATION = {
  objective: 'Develop three alternative concepts for a compact mechanical actuator capable of delivering 500 N of linear force within a 100 mm envelope.',
  parent: {
    name: 'Compact mechanical actuator',
    description: 'Develop three alternative concepts for a compact mechanical actuator capable of delivering 500 N of linear force within a 100 mm envelope.',
    abstraction: 'system',
    statements: [
      { kind: 'constraint', text: 'Linear force', quantity: { value: 500, unit: 'N' }, basis: 'ai-hypothesis' },
      { kind: 'constraint', text: 'Envelope', quantity: { max: 100, unit: 'mm' }, basis: 'ai-hypothesis' },
    ],
  },
  alternatives: ['Ball screw', 'Pneumatic cylinder', 'Rack and pinion'].map((name) => ({
    name,
    statements: [{ kind: 'principle', text: `${name} principle` }],
    children: [{ name: `${name}: drive` }, { name: `${name}: guide` }],
    interfaces: [{ from: 0, to: 1, definition: { name: 'Load path', kind: 'mechanical' } }],
    evidence: [{ kind: 'calculation', title: `${name} force estimate`, basis: 'estimate', inputs: [{ name: 'F', value: 500, unit: 'N' }], outputs: [{ name: 'margin', value: 1.2, unit: '-' }], assumptions: ['Efficiency 0.9'] }],
  })),
  tradeStudy: {
    title: 'Actuator principles',
    criteria: [
      { name: 'Force capability', category: 'performance', weight: 2, direction: 'maximize', scale: 'quantity', unit: 'N' },
      { name: 'Cost', category: 'cost', weight: 1, direction: 'maximize', scale: 'qualitative' },
    ],
    scores: [
      { criterion: 0, alternative: 0, low: 0.5, high: 0.9, unit: 'kN', basis: 'estimate' },
      { criterion: 0, alternative: 1, value: 600, basis: 'estimate' },
      { criterion: 0, alternative: 2, low: 400, high: 700, basis: 'estimate' },
      { criterion: 1, alternative: 0, qualitative: 3, basis: 'ai-hypothesis' },
      { criterion: 1, alternative: 1, qualitative: 4, basis: 'ai-hypothesis' },
      { criterion: 1, alternative: 2, qualitative: 4, basis: 'ai-hypothesis' },
    ],
  },
  generator: 'test',
}

describe('alternatives, AI provenance, comparison and selection (vertical slice 4, 5, 8)', () => {
  let exploration: { id: string; setId: string; tradeStudyId: string; parentId: string; created: { concepts: { id: string; role: string }[] } }
  const proposal = 'PRP-actuator-1'

  it('creates an exploration atomically with assistant provenance, labelled as hypotheses and estimates', async () => {
    const res = await env.call('eli', 'POST', `${BASE}/explorations`, EXPLORATION, idem(assistant(proposal, 'CONV-1')))
    expect(res.status).toBe(201)
    await expectConforms(env, 'createExploration', 201, res.body)
    exploration = res.body
    expect(exploration.created.concepts.filter((c) => c.role === 'alternative')).toHaveLength(3)
    expect(exploration.created.concepts.filter((c) => c.role === 'child')).toHaveLength(6)
    const alt = (await get(exploration.created.concepts.find((c) => c.role === 'alternative')!.id)).body
    expect(alt).toMatchObject({ maturity: 'exploring', provenance: { sourceKind: 'assistant', conversationId: 'CONV-1', proposalId: proposal } })
    expect(alt.statements[0].basis).toBe('ai-hypothesis')
    const evidence = await env.call('rho', 'GET', `${BASE}/evidence?conceptId=${alt.id}`)
    expect(evidence.body[0]).toMatchObject({ basis: 'estimate', provenance: { sourceKind: 'assistant', proposalId: proposal } })
    // Every record the proposal created is traceable to it.
    const history = await env.call('rho', 'GET', `${BASE}/history?proposalId=${proposal}&limit=1000`)
    expect(history.body.length).toBeGreaterThan(20)
    expect(history.body.every((h: { provenance: { proposalId: string; sourceKind: string } }) => h.provenance.proposalId === proposal && h.provenance.sourceKind === 'assistant')).toBe(true)
    await expectConforms(env, 'projectHistory', 200, history.body)
  })

  it('refuses assistant writes that would present AI output as verified or confirmed', async () => {
    const asserted = await create({ statements: [{ kind: 'constraint', text: 'x', basis: 'user-assertion' }] }, 'eli', assistant())
    expect(asserted.status).toBe(422)
    const noProposal = await env.call('eli', 'POST', `${BASE}/concepts`, { name: 'x' }, idem({ 'x-source-kind': 'assistant' }))
    expect(noProposal.status).toBe(400)
    const parentId = exploration.parentId
    const verified = await env.call('eli', 'POST', `${BASE}/evidence`, { conceptId: parentId, kind: 'analysis', title: 'Verified?', basis: 'evidence', artifact: { module: 'analysis', id: 'TA-1' } }, idem(assistant()))
    expect(verified.status).toBe(422)
    const parent = (await get(parentId)).body
    const confirm = await env.call('eli', 'PATCH', `${BASE}/concepts/${parentId}`, { expectedRevision: parent.revision, statements: parent.statements.map((s: { id: string; kind: string; text: string }) => ({ id: s.id, kind: s.kind, text: s.text, confirm: true })) }, assistant())
    expect(confirm.status).toBe(422)
    // An AI hypothesis cannot become a user assertion without explicit confirmation …
    const silent = await env.call('eli', 'PATCH', `${BASE}/concepts/${parentId}`, { expectedRevision: parent.revision, statements: parent.statements.map((s: { id: string; kind: string; text: string }) => ({ id: s.id, kind: s.kind, text: s.text, basis: 'user-assertion' })) })
    expect(silent.status).toBe(422)
    // … which a person gives, and which is recorded.
    const confirmed = await env.call('eli', 'PATCH', `${BASE}/concepts/${parentId}`, { expectedRevision: parent.revision, statements: parent.statements.map((s: { id: string; kind: string; text: string }, i: number) => ({ id: s.id, kind: s.kind, text: s.text, confirm: i === 0 })) })
    expect(confirmed.status).toBe(200)
    expect(confirmed.body.statements[0]).toMatchObject({ basis: 'user-assertion', confirmedBy: 'eli' })
    expect(confirmed.body.statements[1].basis).toBe('ai-hypothesis')
  })

  it('compares alternatives in a trade study with unit conversion and uncertainty ranges', async () => {
    const res = await env.call('rho', 'GET', `${BASE}/trade-studies/${exploration.tradeStudyId}`)
    await expectConforms(env, 'getTradeStudy', 200, res.body)
    const s = res.body
    const ball = s.scores.find((x: { conceptId: string; criterionId: string }) => x.conceptId === s.options[0] && x.criterionId === s.criteria[0].id)
    expect(ball).toMatchObject({ low: 500, high: 900, enteredUnit: 'kN' })
    expect(s.result.preliminary).toBe(true)
    expect(s.result.options.every((o: { coverage: number }) => o.coverage === 1)).toBe(true)
    expect(s.result.ranking).toBe('uncertain')
    const wrongUnit = await env.call('eli', 'PUT', `${BASE}/trade-studies/${s.id}/scores`, { expectedRevision: s.revision, scores: [{ criterionId: s.criteria[0].id, conceptId: s.options[0], value: 3, unit: 'mm', basis: 'estimate' }] })
    expect(wrongUnit.status).toBe(422)
    expect(wrongUnit.body.error.details.fields['scores.0.value']).toMatch(/length, expected force/)
    const stale = await env.call('eli', 'PUT', `${BASE}/trade-studies/${s.id}/scores`, { expectedRevision: s.revision - 1, scores: [{ criterionId: s.criteria[1].id, conceptId: s.options[0], qualitative: 5, basis: 'user-assertion' }] })
    expect(stale.status).toBe(409)
  })

  it('selects an alternative through a decision: editors propose, reviewers record; rejected alternatives are kept', async () => {
    const set = (await env.call('rho', 'GET', `${BASE}/alternative-sets/${exploration.setId}`)).body
    const [a, b, c] = set.members.map((m: { conceptId: string }) => m.conceptId)
    const proposed = await env.call('eli', 'POST', `${BASE}/decisions`, { title: 'Pursue the ball screw', rationale: 'Best force margin within the envelope.', setId: set.id, tradeStudyId: exploration.tradeStudyId, outcomes: [{ conceptId: a, outcome: 'accepted' }, { conceptId: b, outcome: 'rejected', rationale: 'Needs compressed air' }, { conceptId: c, outcome: 'deferred' }] }, idem())
    expect(proposed.status).toBe(201)
    await expectConforms(env, 'createDecision', 201, proposed.body)
    expect(proposed.body).toMatchObject({ key: expect.stringMatching(/^DEC-\d{3}$/), status: 'proposed' })
    const byEditor = await env.call('eli', 'POST', `${BASE}/decisions/${proposed.body.id}/record`, { expectedRevision: 1 })
    expect(byEditor.status).toBe(403)
    const byAssistant = await env.call('rui', 'POST', `${BASE}/decisions/${proposed.body.id}/record`, { expectedRevision: 1 }, assistant())
    expect(byAssistant.status).toBe(403)
    const recorded = await env.call('rui', 'POST', `${BASE}/decisions/${proposed.body.id}/record`, { expectedRevision: 1, reason: 'Reviewed' })
    expect(recorded.status).toBe(200)
    expect(recorded.body).toMatchObject({ status: 'recorded', recordedBy: 'rui' })
    expect((await get(a)).body.maturity).toBe('selected')
    const rejected = await get(b)
    expect(rejected.status).toBe(200)
    expect(rejected.body.maturity).toBe('exploring')
    const after = (await env.call('rho', 'GET', `${BASE}/alternative-sets/${set.id}`)).body
    expect(after.members.map((m: { status: string }) => m.status)).toEqual(['selected', 'rejected', 'deferred'])
    // Revisiting: a superseding decision keeps the old record.
    const revisit = await env.call('rui', 'POST', `${BASE}/decisions`, { title: 'Constraints changed: rack and pinion', rationale: 'Envelope relaxed to 150 mm.', setId: set.id, supersedesId: proposed.body.id, record: true, outcomes: [{ conceptId: c, outcome: 'accepted' }, { conceptId: a, outcome: 'deferred' }] }, idem())
    expect(revisit.status).toBe(201)
    expect((await get(a)).body.maturity).toBe('evaluated')
    expect((await get(c)).body.maturity).toBe('selected')
    const old = (await env.call('rho', 'GET', `${BASE}/decisions/${proposed.body.id}`)).body
    expect(old).toMatchObject({ status: 'recorded', supersededById: revisit.body.id })
    // Undo is refused once a decision is recorded on the alternatives.
    expect((await env.call('eli', 'POST', `${BASE}/explorations/${exploration.id}/undo`, {})).status).toBe(409)
  })

  it('undoes an exploration with a compensating change (archived, never deleted)', async () => {
    const res = await env.call('eli', 'POST', `${BASE}/explorations`, { ...EXPLORATION, tradeStudy: undefined }, idem(assistant('PRP-undo')))
    const undone = await env.call('eli', 'POST', `${BASE}/explorations/${res.body.id}/undo`, { reason: 'Undo of PRP-undo' }, assistant('PRP-undo'))
    expect(undone.status).toBe(200)
    expect(undone.body.undone).toBe(true)
    for (const c of res.body.created.concepts) expect((await get(c.id)).body.maturity).toBe('archived')
    const list = await env.call('rho', 'GET', `${BASE}/concepts?ids=${res.body.created.concepts.map((c: { id: string }) => c.id).join(',')}`)
    expect(list.body.total).toBe(0)
    expect((await env.call('eli', 'POST', `${BASE}/explorations/${res.body.id}/undo`, {})).status).toBe(409)
  })
})

describe('implementations and identity preservation (vertical slice 6, 7)', () => {
  it('links a Concept to artifacts and keeps its identity when the implementation is redesigned or removed', async () => {
    const concept = (await create({ name: 'Rod guidance', abstraction: 'function' })).body
    const impl = await env.call('eli', 'POST', `${BASE}/implementations`, { name: 'Rod v1', conceptIds: [concept.id], artifacts: [{ module: 'cad', id: 'CAD-120', revision: 1, kind: 'cad-representation' }, { module: 'sysml', id: 'SYS-003' }] }, idem())
    expect(impl.status).toBe(201)
    await expectConforms(env, 'createImplementation', 201, impl.body)
    expect((await get(concept.id)).body.implementationStatus).toBe('candidate')
    const lookup = await env.call('nia', 'GET', `${BASE}/artifact-concepts?module=cad&id=CAD-120`)
    expect(lookup.status).toBe(200)
    expect(lookup.body.implementations.map((x: { concept: { id: string } }) => x.concept.id)).toContain(concept.id)
    await expectConforms(env, 'conceptsForArtifact', 200, lookup.body)
    const cadLink = impl.body.artifacts.find((a: { module: string }) => a.module === 'cad')
    const redesigned = await env.call('eli', 'POST', `${BASE}/implementations/${impl.body.id}/artifacts`, { expectedRevision: impl.body.revision, artifact: { module: 'cad', id: 'CAD-130', revision: 2 }, replaces: cadLink.id, reason: 'Redesigned' })
    expect(redesigned.status).toBe(200)
    const active = redesigned.body.artifacts.filter((a: { removed: boolean }) => !a.removed).map((a: { artifactId: string }) => a.artifactId)
    expect(active.sort()).toEqual(['CAD-130', 'SYS-003'])
    expect(redesigned.body.artifacts.find((a: { artifactId: string }) => a.artifactId === 'CAD-120')).toMatchObject({ removed: true, removedBy: 'eli' })
    const after = (await get(concept.id)).body
    expect({ id: after.id, key: after.key, revision: after.revision }).toEqual({ id: concept.id, key: concept.key, revision: concept.revision })
    // Retiring the implementation and linking a new one: still the same Concept.
    await env.call('eli', 'PATCH', `${BASE}/implementations/${impl.body.id}`, { expectedRevision: redesigned.body.revision, status: 'retired' })
    const v2 = await env.call('eli', 'POST', `${BASE}/implementations`, { name: 'Rod v2 (hydraulic)', conceptIds: [concept.id], artifacts: [{ module: 'external', id: 'https://example.com/hydraulic-rod.pdf' }] }, idem())
    expect(v2.status).toBe(201)
    const final = (await get(concept.id)).body
    expect({ id: final.id, key: final.key, revision: final.revision, implementationStatus: final.implementationStatus }).toEqual({ id: concept.id, key: concept.key, revision: concept.revision, implementationStatus: 'candidate' })
    const impls = await env.call('rho', 'GET', `${BASE}/implementations?conceptId=${concept.id}`)
    expect(impls.body.map((i: { status: string }) => i.status)).toEqual(['retired', 'candidate'])
    const history = (await env.call('rho', 'GET', `${BASE}/concepts/${concept.id}/history`)).body
    expect(history.map((h: { action: string }) => h.action)).toEqual(expect.arrayContaining(['artifact-replaced', 'created']))
  })

  it('validates artifact references and records realization requests as pending', async () => {
    const concept = (await create({ name: 'Bracket' })).body
    const badReq = await env.call('eli', 'POST', `${BASE}/concepts/${concept.id}/links`, { relation: 'satisfies', artifact: { module: 'requirements', id: 'REQ-001' } }, idem())
    expect(badReq.status).toBe(422)
    expect(badReq.body.error.details.fields.artifact).toMatch(/canonical UUID/)
    const link = await env.call('eli', 'POST', `${BASE}/concepts/${concept.id}/links`, { relation: 'satisfies', artifact: { module: 'requirements', id: REQ['REQ-001'], revision: 1, label: 'REQ-001' } }, idem())
    expect(link.status).toBe(201)
    const repinned = await env.call('eli', 'POST', `${BASE}/links/${link.body.id}/repin`, { revision: 2, reason: 'Reviewed REQ-001 rev 2' })
    expect(repinned.body.artifact.revision).toBe(2)
    const links = await env.call('rho', 'GET', `${BASE}/links?conceptId=${concept.id}&includeRemoved=true`)
    expect(links.body.map((l: { removed: boolean }) => l.removed)).toEqual([true, false])
    const impl = (await env.call('eli', 'POST', `${BASE}/implementations`, { name: 'Bracket part', conceptIds: [concept.id] }, idem())).body
    const req = await env.call('eli', 'POST', `${BASE}/implementations/${impl.id}/realization-requests`, { expectedRevision: impl.revision, targetModule: 'cad', requestKind: 'generate-part', parameters: { envelope: { value: 100, unit: 'mm' } } }, idem())
    expect(req.status).toBe(200)
    expect(req.body.realizationRequests[0]).toMatchObject({ status: 'pending', targetModule: 'cad' })
    const fulfilled = await env.call('eli', 'POST', `${BASE}/realization-requests/${req.body.realizationRequests[0].id}/status`, { status: 'fulfilled', fulfilledBy: { module: 'cad', id: 'CAD-140' } })
    expect(fulfilled.body.artifacts.map((a: { artifactId: string }) => a.artifactId)).toContain('CAD-140')
  })
})

describe('maturity, approval gates and verification', () => {
  it('has no mandatory sequence but enforces gates and evidence rules', async () => {
    const c = (await create({ name: 'Gated' })).body
    const jump = await env.call('eli', 'POST', `${BASE}/concepts/${c.id}/maturity`, { to: 'evaluated', expectedRevision: 1, reason: 'Assessed directly' })
    expect(jump.body.maturity).toBe('evaluated')
    const back = await env.call('eli', 'POST', `${BASE}/concepts/${c.id}/maturity`, { to: 'exploring', expectedRevision: 1, reason: 'Reopened' })
    expect(back.body.maturity).toBe('exploring')
    expect((await env.call('eli', 'POST', `${BASE}/concepts/${c.id}/maturity`, { to: 'selected', expectedRevision: 1, reason: 'x' })).status).toBe(403)
    expect((await env.call('ada', 'POST', `${BASE}/concepts/${c.id}/maturity`, { to: 'implemented', expectedRevision: 1, reason: 'x' })).status).toBe(422)
    expect((await env.call('ada', 'POST', `${BASE}/concepts/${c.id}/maturity`, { to: 'verified', expectedRevision: 1, reason: 'x' })).status).toBe(422)
    const selected = await env.call('ada', 'POST', `${BASE}/concepts/${c.id}/maturity`, { to: 'selected', expectedRevision: 1, reason: 'Approved' })
    expect(selected.body.maturity).toBe('selected')
    expect((await env.call('eli', 'POST', `${BASE}/concepts/${c.id}/maturity`, { to: 'archived', expectedRevision: 1, reason: 'x' })).status).toBe(403)
    // Verification needs verified evidence, recorded by a person with an artifact.
    const estimate = await env.call('eli', 'POST', `${BASE}/evidence`, { conceptId: c.id, kind: 'calculation', title: 'Estimate', basis: 'estimate', outputs: [{ name: 'F', value: 1, unit: 'kN' }] }, idem())
    expect((await env.call('rui', 'POST', `${BASE}/concepts/${c.id}/verification-status`, { status: 'verified', evidenceIds: [estimate.body.id], expectedRevision: 1, reason: 'x' })).status).toBe(422)
    expect((await env.call('eli', 'POST', `${BASE}/evidence`, { conceptId: c.id, kind: 'test', title: 'No artifact', basis: 'evidence' }, idem())).status).toBe(422)
    const test = await env.call('eli', 'POST', `${BASE}/evidence`, { conceptId: c.id, kind: 'test', title: 'Proof test', basis: 'evidence', artifact: { module: 'twin', id: 'OUT-001' } }, idem())
    expect(test.status).toBe(201)
    expect((await env.call('eli', 'POST', `${BASE}/concepts/${c.id}/verification-status`, { status: 'verified', evidenceIds: [test.body.id], expectedRevision: 1, reason: 'x' })).status).toBe(403)
    const verified = await env.call('rui', 'POST', `${BASE}/concepts/${c.id}/verification-status`, { status: 'verified', evidenceIds: [test.body.id], expectedRevision: 1, reason: 'Proof test passed' })
    expect(verified.body).toMatchObject({ verificationStatus: 'verified', maturity: 'selected' })
    const assessment = await env.call('rho', 'GET', `${BASE}/concepts/${c.id}/assessment`)
    await expectConforms(env, 'assessConcept', 200, assessment.body)
    expect(assessment.body.checks.find((x: { id: string }) => x.id === 'verified').met).toBe(true)
  })

  it('branches without overwriting and supersedes with a replaces link', async () => {
    const original = (await create({ name: 'Original', statements: [{ kind: 'function', text: 'Do it' }] })).body
    const branch = await env.call('eli', 'POST', `${BASE}/concepts/${original.id}/branch`, { name: 'Branch B' }, idem())
    expect(branch.status).toBe(201)
    expect(branch.body.id).not.toBe(original.id)
    expect(branch.body.statements[0].id).not.toBe(original.statements[0].id)
    expect((await get(original.id)).body.revision).toBe(1)
    const sup = await env.call('eli', 'POST', `${BASE}/concepts/${original.id}/maturity`, { to: 'superseded', expectedRevision: 1, reason: 'Replaced by the branch', replacedBy: branch.body.id })
    expect(sup.body.maturity).toBe('superseded')
    const rels = (await env.call('rho', 'GET', `${BASE}/relationships?conceptId=${original.id}`)).body.map((r: { type: string }) => r.type).sort()
    expect(rels).toEqual(['derived-from', 'replaces'])
    expect((await env.call('eli', 'PATCH', `${BASE}/concepts/${original.id}`, { expectedRevision: 1, name: 'x' })).status).toBe(422)
  })
})

describe('events and OpenAPI', () => {
  it('emits committed-change events after commit', async () => {
    const events: ConceptsEvent[] = []
    const off = env.server.conceptEvents.subscribe('PRJ-ACT100', (e) => events.push(e))
    try {
      const c = (await create({ name: 'Evented' })).body
      await env.server.conceptEvents.flush()
      await expect.poll(() => events.find((e) => e.entityId === c.id)?.type, { timeout: 5000 }).toBe('concept.created')
    } finally {
      off()
    }
  })

  it('documents every route with permissions, and serves the interactive reference', async () => {
    const doc = (await env.call('', 'GET', '/api/concepts/v1/openapi.json')).body
    expect(doc.openapi).toBe('3.1.0')
    const ops = Object.values(doc.paths).flatMap((m) => Object.values(m as Record<string, { operationId: string; 'x-permissions': unknown }>))
    expect(ops.length).toBeGreaterThan(45)
    for (const op of ops) expect(op['x-permissions'], op.operationId).toBeTruthy()
    expect(new Set(ops.map((o) => o.operationId)).size).toBe(ops.length)
    const docs = await env.call('', 'GET', '/api/concepts/v1/docs')
    expect(docs.status).toBe(200)
    expect(String(docs.body)).toContain('Conceptualize API')
  })
})

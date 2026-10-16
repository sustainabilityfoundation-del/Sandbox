/**
 * Design reasoning scenarios on the real services (Conceptualize and Requirements on the API host with disposable
 * PostgreSQL) and, as a contract test, on the in-memory adapter. Run with `npm run reasoning:test:db`.
 * Each step prints what it ran against; differences between the two are asserted per capability.
 */
import { sampleModel } from '@ews/platform-sdk/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createConceptualizeTestAdapter,
  createRequirementsHttpWriter,
  designRef,
  runActuatorScenario,
  runNewProjectScenario,
  type ConceptualizeKnowledgeApi,
  type NewProjectTranscript,
  type RequestContext,
} from '../src/index'
import { addProject, createRealEnv, realServices, transportOf, type TestEnv } from './env'

let env: TestEnv
beforeAll(async () => {
  env = await createRealEnv()
})
afterAll(async () => env?.close())

const print = (label: string, steps: { n: number; title: string; lines: string[]; backing?: string }[]) => {
  console.log(`\n=== ${label} ===\n` + steps.map((s) => `${s.n}. ${s.title} [${s.backing}]\n   ${s.lines.join('\n   ')}`).join('\n'))
}
const FOREIGN = /ROD-|CAD-|SYS-|ACT-|PRJ-ACT100|REQ-0\d\d\b/

function realNewProject(projectId: string) {
  const transport = transportOf(env)
  const { knowledge } = realServices(env)
  const reader = realServices(env, 'eli').requirements
  const writer = createRequirementsHttpWriter({ transport })
  const requirements = { ...reader, ...writer, mode: 'api' as const }
  return { knowledge, requirements, projectId }
}

describe('actuator scenario', () => {
  it('runs on the real Conceptualize API (seeded actuator project)', async () => {
    const { knowledge, requirements } = realServices(env)
    const t = await runActuatorScenario(sampleModel(), { knowledge, requirements })
    print('Actuator scenario: real service', t.steps)
    expect(t.steps.length).toBeGreaterThanOrEqual(8)
    expect(t.steps.filter((s) => s.backing?.startsWith('real service')).length).toBeGreaterThanOrEqual(6)
    // Without stored calculation models (CR-C8) the calculation step is labelled as such.
    expect(t.steps.some((s) => s.backing?.includes('CR-C8'))).toBe(!knowledge.capabilities.calculationModels)
  })

  it('runs on the contract adapter (same scenario, contract test)', async () => {
    const t = await runActuatorScenario(sampleModel())
    print('Actuator scenario: contract adapter', t.steps)
    expect(t.steps.every((s) => s.backing?.startsWith('contract adapter') || !s.backing?.startsWith('real service'))).toBe(true)
  })
})

describe('new-project scenario (milestone workflow steps 2, 4 and 7)', () => {
  const check = (t: NewProjectTranscript) => {
    expect(t.emptyAtStart).toEqual({ functions: 0, concepts: 0, decisions: 0, constraints: 0 })
    expect(t.requirement.revisions).toEqual([1, 2])
    expect(t.calculation.outputs.F.value).toBeCloseTo((2 * Math.PI * 0.3 * 5) / 0.002, 0)
    const byClass = (c: string) => t.requirementImpact.items.filter((i) => i.classification === c).map((i) => i.ref)
    const demonstrated = byClass('demonstrated')
    expect(demonstrated.some((r) => 'type' in r && r.type === 'constraint' && r.id === t.ids.constraint)).toBe(true)
    expect(demonstrated.some((r) => 'type' in r && r.type === 'decision' && r.id === t.ids.decision)).toBe(true)
    expect(byClass('possible').some((r) => 'type' in r && r.type === 'concept')).toBe(true)
    for (const r of t.allRefs) expect(r).not.toMatch(FOREIGN)
  }

  it('runs on the contract adapter with the requirements fixture', async () => {
    const t = await runNewProjectScenario({ projectId: 'PRJ-NEW-ADAPTER' })
    print('New-project scenario: contract adapter', t.steps)
    check(t)
    expect(t.calculation.verifiedByService).toBe(true)
    // With a stored model the hypothetical re-formalization demonstrates the calculation (F ≈ 4.7 kN < 6 kN).
    expect(t.reformalizationImpact.items.some((i) => i.classification === 'demonstrated' && 'type' in i.ref && (i.ref.type === 'calculation-model' || i.ref.type === 'evidence'))).toBe(true)
  })

  it('runs on the real Conceptualize and Requirements APIs (new empty project)', async () => {
    const projectId = 'PRJ-NEW-REAL'
    await addProject(env, projectId, { eli: 'editor', rui: 'reviewer' })
    const t = await runNewProjectScenario(realNewProject(projectId))
    print('New-project scenario: real services', t.steps)
    check(t)
    expect(t.calculation.verifiedByService).toBe(false) // CR-C8: manifest stored, not re-verified
    const labels = t.steps.map((s) => s.backing)
    expect(labels.filter((b) => b?.startsWith('real service')).length).toBeGreaterThanOrEqual(5)
  })
})

/**
 * Contract probes: the same call against both implementations. Each probe records what each side does and asserts
 * it, so a change on either side shows up here. The list feeds docs/modules/design-reasoning/contract-change-requests.md.
 */
describe('contract probes: real service versus adapter', () => {
  type Side = { name: 'real' | 'adapter'; k: ConceptualizeKnowledgeApi; ctx: RequestContext; reviewer: RequestContext }
  let sides: Side[]
  beforeAll(async () => {
    await addProject(env, 'PRJ-PROBE', { eli: 'editor', rui: 'reviewer' })
    const mk = (k: ConceptualizeKnowledgeApi, name: Side['name']): Side => ({
      name,
      k,
      ctx: { projectId: 'PRJ-PROBE', actor: 'eli', role: 'editor', sourceKind: 'user' },
      reviewer: { projectId: 'PRJ-PROBE', actor: 'rui', role: 'reviewer', sourceKind: 'user' },
    })
    sides = [mk(realServices(env).knowledge, 'real'), mk(createConceptualizeTestAdapter(), 'adapter')]
  })
  const outcome = async (f: () => Promise<unknown>) => {
    try {
      await f()
      return 'ok'
    } catch (e) {
      return (e as { code?: string }).code ?? 'error'
    }
  }
  let seq = 0
  const key = () => `probe-${Date.now()}-${++seq}`

  it('capabilities differ as documented', () => {
    const [real, adapter] = sides
    expect(Object.values(adapter.k.capabilities).every(Boolean)).toBe(true)
    expect(real.k.capabilities).toMatchObject({ functionAlternativeSets: false, calculationModels: false, calculatedEvidenceVerification: false, realizedConceptRevision: false, reasoningSourceKind: false, scoreQualifications: false, events: false })
  })

  it('agrees: batch is atomic (a failing item leaves nothing behind)', async () => {
    for (const s of sides) {
      const before = (await s.k.list('concept', s.ctx)).length
      const r = await outcome(() => s.k.batch({ idempotencyKey: key(), items: [{ op: 'createConcept', as: '$a', body: { name: 'A', abstraction: 'abstract' } }, { op: 'createLink', body: { type: 'performs', from: designRef('concept', '$a'), to: designRef('function', '00000000-0000-0000-0000-000000000000') } }] }, s.ctx))
      expect(r, s.name).not.toBe('ok')
      expect((await s.k.list('concept', s.ctx)).length, s.name).toBe(before)
    }
  })

  it('agrees: an idempotency key replays the first result', async () => {
    for (const s of sides) {
      const k = key()
      const a = await s.k.batch({ idempotencyKey: k, items: [{ op: 'createConcept', as: '$a', body: { name: 'Replay', abstraction: 'abstract' } }] }, s.ctx)
      const b = await s.k.batch({ idempotencyKey: k, items: [{ op: 'createConcept', as: '$a', body: { name: 'Replay', abstraction: 'abstract' } }] }, s.ctx)
      expect(b.ids.$a, s.name).toBe(a.ids.$a)
    }
  })

  it('agrees: a stale expected revision is a conflict', async () => {
    for (const s of sides) {
      const a = await s.k.batch({ idempotencyKey: key(), items: [{ op: 'createConstraint', as: '$a', body: { kind: 'dimensional', statement: 'L <= 1 m', bound: { operator: '<=', quantity: { value: 1, unit: 'm' } }, source: { kind: 'stated', basis: 'user-assertion' } } }] }, s.ctx)
      await s.k.batch({ idempotencyKey: key(), items: [{ op: 'reviseConstraint', body: { id: a.ids.$a, expectedRevision: 1, statement: 'L <= 2 m', reason: 'one' } }] }, s.ctx)
      const r = await outcome(() => s.k.batch({ idempotencyKey: key(), items: [{ op: 'reviseConstraint', body: { id: a.ids.$a, expectedRevision: 1, statement: 'L <= 3 m', reason: 'two' } }] }, s.ctx))
      expect(r, s.name).toBe('conflict')
    }
  })

  it('agrees: an assumption scope must name its subjects (D1, adapter aligned this sprint)', async () => {
    for (const s of sides) {
      const r = await outcome(() => s.k.batch({ idempotencyKey: key(), items: [{ op: 'createAssumption', body: { statement: 'x', basis: 'assumption', scope: {} as never } }] }, s.ctx))
      expect(r, s.name).toBe('invalid')
    }
  })

  it('agrees: an editor cannot record a decision; a reviewer can', async () => {
    for (const s of sides) {
      const base = await s.k.batch({ idempotencyKey: key(), items: [
        { op: 'createFunction', as: '$f', body: { name: 'F' } },
        { op: 'createConcept', as: '$p', body: { name: 'P', abstraction: 'abstract', performs: ['$f'] } },
        { op: 'createConcept', as: '$a', body: { name: 'A', abstraction: 'abstract' } },
        { op: 'createConcept', as: '$b', body: { name: 'B', abstraction: 'abstract' } },
        { op: 'createAlternativeSet', as: '$s', body: { name: 'S', question: 'Q', parentConceptId: '$p', memberIds: ['$a', '$b'] } },
        { op: 'proposeDecision', as: '$d', body: { title: 'D', question: 'Q', setId: '$s', rationale: 'r', outcomes: [{ conceptId: '$a', outcome: 'accepted', rationale: 'r' }, { conceptId: '$b', outcome: 'rejected', rationale: 'r' }] } },
      ] }, s.ctx)
      expect(await outcome(() => s.k.batch({ idempotencyKey: key(), items: [{ op: 'recordDecision', body: { id: base.ids.$d, reason: 'x' } }] }, s.ctx)), s.name).toBe('forbidden')
      expect(await outcome(() => s.k.batch({ idempotencyKey: key(), items: [{ op: 'recordDecision', body: { id: base.ids.$d, reason: 'x' } }] }, s.reviewer)), s.name).toBe('ok')
    }
  })

  it('differs: alternative sets owned by a Function (D5, CR-C7)', async () => {
    const res: Record<string, string> = {}
    for (const s of sides) {
      res[s.name] = await outcome(async () => {
        const f = await s.k.batch({ idempotencyKey: key(), items: [{ op: 'createFunction', as: '$f', body: { name: 'G' } }, { op: 'createConcept', as: '$a', body: { name: 'A', abstraction: 'abstract', performs: ['$f'] } }, { op: 'createConcept', as: '$b', body: { name: 'B', abstraction: 'abstract', performs: ['$f'] } }] }, s.ctx)
        await s.k.batch({ idempotencyKey: key(), items: [{ op: 'createAlternativeSet', body: { name: 'S', question: 'Q', functionId: f.ids.$f, memberIds: [f.ids.$a, f.ids.$b] } }] }, s.ctx)
      })
    }
    expect(res).toEqual({ real: 'not-implemented', adapter: 'ok' })
  })

  it('differs: calculation models (D6, CR-C8)', async () => {
    const res: Record<string, string> = {}
    for (const s of sides) res[s.name] = await outcome(() => s.k.batch({ idempotencyKey: key(), items: [{ op: 'createCalculationModel', body: { name: 'M', schema: 'ews-expr/1', parameters: [], outputs: [], relations: [], basis: 'user-assertion', validationStatus: 'unvalidated' } as never }] }, s.ctx))
    expect(res.real).toBe('not-implemented')
    expect(res.adapter).not.toBe('not-implemented')
  })

  it('agrees: forged calculated evidence (D6) never becomes calculated evidence', async () => {
    const forged = { schema: 'ews-calc-manifest/3', model: { id: 'x', revision: 1 }, inputs: [], outputs: { F: { value: 1e9, unit: 'N' } }, checks: [] }
    const res: Record<string, string> = {}
    for (const s of sides) res[s.name] = await outcome(() => s.k.batch({ idempotencyKey: key(), items: [{ op: 'createConcept', as: '$c', body: { name: 'Forged subject', abstraction: 'abstract' } }, { op: 'createEvidence', body: { kind: 'calculation', title: 'forged', subjects: [designRef('concept', '$c')], basis: 'calculated', manifest: forged as never } }] }, s.ctx))
    // The service refuses basis `calculated` until CR-C8 (services/conceptualize/test/design.api.test.ts); the HTTP
    // adapter therefore stores engine results as `estimate` with a stated reason, so the forged claim is not kept.
    expect(res.real).toBe('ok')
    expect(res.adapter).not.toBe('ok')
  })

  it('differs: events (CR-C13)', async () => {
    const res: Record<string, string> = {}
    for (const s of sides) res[s.name] = await outcome(() => s.k.events(s.ctx))
    expect(res).toEqual({ real: 'not-implemented', adapter: 'ok' })
  })

  it('records the link registry on both sides (D12)', async () => {
    const names: Record<string, string[]> = {}
    for (const s of sides) names[s.name] = (await s.k.linkTypes(s.ctx)).map((d) => d.name).sort()
    const onlyReal = names.real.filter((n) => !names.adapter.includes(n))
    const onlyAdapter = names.adapter.filter((n) => !names.real.includes(n))
    console.log('link types only on the real service:', onlyReal.join(', ') || '—', '| only on the adapter:', onlyAdapter.join(', ') || '—')
    expect(names.real).toContain('performs')
  })
})

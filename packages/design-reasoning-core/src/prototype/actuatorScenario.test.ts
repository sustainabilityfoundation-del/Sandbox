import { sampleModel } from '@ews/platform-sdk/testing'
import { verifyManifest } from '@ews/engineering-calc'
import { beforeAll, describe, expect, it } from 'vitest'
import { toDefinition } from '../adapters/conceptualizeContractAdapter'
import { designRef, isDesignRef, refKey } from '../refs'
import { REQ_001, runActuatorScenario, type ScenarioTranscript } from './actuatorScenario'

/**
 * Validation prototype R1 acceptance (docs/modules/design-reasoning/roadmap.md §2): the ten brief §14
 * demonstrations on the mechanical actuator, through the proposed APIs.
 */
let t: ScenarioTranscript
const fixed = new Date('2026-10-15T08:00:00Z')

beforeAll(async () => {
  t = await runActuatorScenario(sampleModel(), { now: () => fixed })
})

describe('R1 validation prototype: mechanical actuator', () => {
  it('1. defines a functional objective independently of a solution', async () => {
    const fn = await t.knowledge.get('function', t.ids.function, t.contexts.editor)
    expect(fn).toMatchObject({ key: 'FN-001', name: 'Convert motor rotation into linear force', status: 'active' })
    expect(fn!.performanceObjectives[0]).toMatchObject({ name: 'Axial force capacity', quantity: { min: 12, unit: 'kN' }, basis: 'user-assertion' })
    // A Function cannot be realized by an implementation (CR-C1).
    await expect(t.knowledge.batch({ idempotencyKey: 'x1', items: [{ op: 'createImplementation', body: { name: 'bad', concepts: [{ conceptId: t.ids.function }], artifacts: [] } }] }, t.contexts.editor)).rejects.toThrow(/is a Function, not a Concept/)
  })

  it('2. generates several candidate concepts, labelled as AI hypotheses, without duplicates', async () => {
    const concepts = await t.knowledge.list('concept', t.contexts.editor)
    expect(concepts.map((c) => c.name)).toEqual(['Ball screw', 'Lead screw', 'Rack and pinion', 'Electro-hydraulic cylinder'])
    for (const c of concepts) {
      expect(c.provenance).toMatchObject({ sourceKind: 'reasoning', runId: t.ids.run, actor: 'eli' })
      expect(c.statements.every((s) => s.basis === 'ai-hypothesis')).toBe(true)
    }
  })

  it('3. represents functions and concepts as separate entities', async () => {
    expect(await t.knowledge.get('concept', t.ids.function, t.contexts.editor)).toBeUndefined()
    expect(await t.knowledge.get('function', t.ids.ballScrew, t.contexts.editor)).toBeUndefined()
    const fn = (await t.knowledge.get('function', t.ids.function, t.contexts.editor))!
    const c = (await t.knowledge.get('concept', t.ids.ballScrew, t.contexts.editor))!
    expect(fn.key).toMatch(/^FN-/)
    expect(c.key).toMatch(/^CON-/)
  })

  it('4. links all alternatives to the same functional objective', async () => {
    const set = (await t.knowledge.get('alternative-set', t.ids.set, t.contexts.editor))!
    expect(set.functionId).toBe(t.ids.function)
    const performs = await t.knowledge.links(t.contexts.editor, { to: designRef('function', t.ids.function), type: 'performs' })
    expect(new Set(performs.map((l) => l.from.id))).toEqual(new Set([t.ids.ballScrew, t.ids.leadScrew, t.ids.rack, t.ids.hydraulic]))
  })

  it('5. records assumptions and constraints; the load constraint formalizes a pinned requirement revision', async () => {
    const asm = await t.knowledge.list('assumption', t.contexts.editor)
    expect(asm.map((a) => a.key)).toEqual(['ASM-001', 'ASM-002', 'ASM-003', 'ASM-004'])
    const cst = (await t.knowledge.get('constraint', t.ids.cstLoad, t.contexts.editor, 1))!
    expect(cst.source).toEqual({ kind: 'requirement', ref: { module: 'requirements', id: REQ_001, revision: 1, kind: 'requirement' } })
    const formalizes = await t.knowledge.links(t.contexts.editor, { from: designRef('constraint', t.ids.cstLoad), type: 'formalizes' })
    expect(formalizes).toHaveLength(1)
  })

  it('6. evaluates a preliminary relationship deterministically, with a reproducible manifest', async () => {
    const ev = (await t.knowledge.get('evidence', t.ids.evidence, t.contexts.editor))!
    expect(ev.basis).toBe('calculated')
    const manifest = ev.calculation!.manifest
    const pcr = manifest.outputs.find((o) => o.symbol === 'P_cr')!
    // Independent hand formula: π² E I / (K L)², I = π d⁴/64, SI units.
    const d = 0.025, L = 0.6, E = 210e9
    const expected = (Math.PI ** 2 * E * ((Math.PI * d ** 4) / 64)) / L ** 2 / 1000
    expect(Math.abs(pcr.value - expected) / expected).toBeLessThan(1e-9)
    expect(manifest.inputs.find((i) => i.symbol === 'd')!.source).toMatchObject({ via: 'client-attested', ref: { module: 'twin', id: 'ROD-120' }, revision: 2 })
    const model = (await t.knowledge.get('calculation-model', ev.calculation!.modelId, t.contexts.editor, 1))!
    expect(verifyManifest(toDefinition(model), manifest).ok).toBe(true)
    // The adapter (Conceptualize contract) refuses a fabricated "calculated" result.
    const forged = { ...manifest, outputs: manifest.outputs.map((o) => (o.symbol === 'P_cr' ? { ...o, value: 999 } : o)), outputDigest: 'sha256:forged' }
    await expect(
      t.knowledge.batch({ idempotencyKey: 'forged', items: [{ op: 'createEvidence', body: { kind: 'calculation', title: 'forged', subjects: ev.subjects, basis: 'calculated', calculation: { ...ev.calculation!, manifest: forged } } }] }, t.contexts.engine),
    ).rejects.toThrow(/could not be reproduced/)
    // Replaying the deterministic step gives the same digest.
    const inv = t.engine.store.invocations.find((i) => i.tool === 'reasoning.evaluate_calculation')!
    expect((inv.output as { manifest: { outputDigest: string } }).manifest.outputDigest).toBe(manifest.outputDigest)
  })

  it('7. compares candidates using explicit criteria (weighted sum and Pareto)', async () => {
    const inv = t.engine.store.invocations.find((i) => i.tool === 'reasoning.compare_alternatives')!
    const out = inv.output as { weightedSum: { options: { conceptId: string; rank: number | null }[]; preliminary: boolean }; pareto: { paretoSet: string[] } }
    expect(out.weightedSum.options.find((o) => o.rank === 1)!.conceptId).toBe(t.ids.ballScrew)
    expect(out.weightedSum.preliminary).toBe(true)
    expect(out.pareto.paretoSet).toContain(t.ids.ballScrew)
    expect(out.pareto.paretoSet).not.toContain(t.ids.hydraulic)
  })

  it('8. records a design decision with supporting evidence, assumptions and the reviewer gate', async () => {
    const d = (await t.knowledge.get('decision', t.ids.decision, t.contexts.editor))!
    expect(d).toMatchObject({ status: 'recorded', recordedBy: 'rui' })
    expect(d.support).toEqual([{ ref: designRef('evidence', t.ids.evidence), role: 'supports' }])
    expect(d.assumptionIds.map((a) => a.id)).toEqual([t.ids.asmE, t.ids.asmK, t.ids.asmN])
    expect(d.constraintIds).toEqual([{ id: t.ids.cstLoad, revision: 1 }, { id: t.ids.cstEnv, revision: 1 }])
    expect(d.invalidationConditions.map((c) => c.kind)).toEqual(['relation-violated', 'assumption-invalidated'])
    expect(t.steps.find((s) => s.title.startsWith('Design decision'))!.lines[1]).toMatch(/refused: Recording a decision .* needs the reviewer or administrator role/)
    const set = (await t.knowledge.get('alternative-set', t.ids.set, t.contexts.editor))!
    expect(Object.fromEntries(set.members.map((m) => [m.conceptId, m.status]))).toEqual({ [t.ids.ballScrew]: 'selected', [t.ids.leadScrew]: 'deferred', [t.ids.rack]: 'rejected', [t.ids.hydraulic]: 'rejected' })
    expect(t.rationaleBefore.decisions[0]).toMatchObject({ key: 'DEC-001', outcome: 'accepted', validity: 'valid' })
    expect(t.rationaleBefore.decisions[0].alternatives.map((a) => a.outcome)).toEqual(['deferred', 'rejected', 'rejected'])
  })

  it('9. links the selected concept to existing CAD and SysML artifacts of the sample twin', async () => {
    const impl = (await t.knowledge.get('implementation', t.ids.implementation, t.contexts.editor))!
    expect(impl.concepts).toEqual([{ conceptId: t.ids.ballScrew, realizedConceptRevision: 1 }])
    expect(impl.artifacts.map((a) => `${a.module}:${a.id}`)).toEqual(['twin:ROD-120', 'cad:CAD-120', 'sysml:SYS-003'])
    const model = sampleModel()
    for (const a of impl.artifacts) expect(a.revision).toBe(model.revisionOf(a.id))
    // The CAD and SysML elements really represent ROD-120 in the twin.
    expect(model.relationshipsOf('ROD-120').filter((r) => r.type === 'represents').map((r) => r.from).sort()).toEqual(['CAD-120', 'SYS-003'])
  })

  it('10. changing a constraint identifies affected decisions and implementations, possible vs demonstrated', async () => {
    const cls = (r: typeof t.applied, ref: string) => r.items.find((i) => refKey(i.ref) === ref)?.classification
    const dec = refKey(designRef('decision', t.ids.decision))
    const impl = refKey(designRef('implementation', t.ids.implementation))
    // Hypothetical 15 kN: still holds; nothing written.
    expect(cls(t.hypothetical, dec)).toBe('checked-unaffected')
    expect(cls(t.hypothetical, impl)).toBe('possible')
    // Applied revision to 120 kN: the buckling check fails → the decision is demonstrated, the implementation possible.
    expect(cls(t.applied, dec)).toBe('demonstrated')
    expect(cls(t.applied, refKey(designRef('evidence', t.ids.evidence)))).toBe('demonstrated')
    expect(cls(t.applied, impl)).toBe('possible')
    for (const a of ['twin:ROD-120', 'cad:CAD-120', 'sysml:SYS-003']) expect(cls(t.applied, a)).toBe('possible')
    expect(cls(t.applied, `requirements:${REQ_001}`)).toBe('possible')
    // Rejected and deferred alternatives become candidates for reconsideration (possible), not demonstrated.
    expect(cls(t.applied, refKey(designRef('concept', t.ids.leadScrew)))).toBe('possible')
    expect(t.applied.decisionsUnderReview.map((r) => r.id)).toEqual([t.ids.decision])
    // The path explains why: constraint → model → evidence → decision.
    const path = t.applied.items.find((i) => refKey(i.ref) === refKey(designRef('evidence', t.ids.evidence)))!.path.map((p) => p.type)
    expect(path).toEqual(['binds', 'produced-by'])
    // The review flag was applied by a person; rationale and outcomes are unchanged.
    const d = (await t.knowledge.get('decision', t.ids.decision, t.contexts.editor))!
    expect(d.validity).toBe('under-review')
    expect(d.status).toBe('recorded')
    expect(d.rationale).toBe(t.rationaleBefore.decisions[0].rationale)
    expect(d.reviewFlags[0].reason).toMatch(/invalidation condition fired: Rod buckling capacity no longer covers n·F/)
    expect(t.rationaleAfter.decisions[0].validity).toBe('under-review')
  })
})

describe('R1: run records and provenance', () => {
  it('records every tool call, the context used and who applied each draft', () => {
    const run = t.engine.store.runs.get(t.ids.run)!
    expect(run.status).toBe('completed')
    const invocations = t.engine.store.invocationsOf(run.id)
    expect(invocations.every((i) => i.ok)).toBe(true)
    expect(invocations.map((i) => i.tool)).toContain('reasoning.assess_change_impact')
    const calcManifest = t.engine.store.manifestsOf(run.id).find((m) => m.items.some((i) => i.via === 'client-attested'))!
    expect(calcManifest.items.find((i) => i.via === 'client-attested')!.ref).toMatchObject({ module: 'twin', id: 'ROD-120', revision: 2 })
    expect(calcManifest.items.filter((i) => isDesignRef(i.ref)).every((i) => i.adapter === 'test-adapter')).toBe(true)
    expect(t.drafts.every((d) => d.status === 'applied' && d.applied!.by)).toBe(true)
  })

  it('stores no authoritative design data in the engine', () => {
    const json = JSON.stringify([...t.engine.store.runs.values(), t.engine.store.justifications])
    expect(json).not.toMatch(/Rack and pinion/)
  })
})

import { qualifyManifest } from '@ews/engineering-calc'
import { describe, expect, it } from 'vitest'
import {
  applyDraftAsUser,
  assessChangeImpact,
  createConceptualizeTestAdapter,
  createReasoningEngine,
  designRef,
  evaluateTradeStudy,
  explainSelection,
  paretoAnalysis,
  refKey,
  type BatchItem,
  type CalculationModelInput,
  type RequestContext,
  type TradeStudyRecord,
} from './index'

/**
 * C11 (integration milestone 1): result kinds and proven statuses travel unchanged from the engine through
 * evidence drafts, stored evidence, trade studies, Pareto comparison, rationale and impact analysis.
 */
const P = 'PRJ-C11'
const editor: RequestContext = { projectId: P, actor: 'eli', role: 'editor', sourceKind: 'user' }
const reviewer: RequestContext = { projectId: P, actor: 'rui', role: 'reviewer', sourceKind: 'user' }
const engineCtx: RequestContext = { ...editor, sourceKind: 'reasoning' }

/** y = x(1 − x) with x bound to an assumption's quantity (a range), and the constraint y ≤ limit. */
function parabola(assumptionId: string, limit: number): CalculationModelInput {
  return {
    name: 'Parabola', grammar: 'ews-expr/1', basis: 'user-assertion', validationStatus: 'validated', assumptions: [], sources: [],
    parameters: [
      { symbol: 'x', name: 'x', role: 'input', unit: '-', defaultBinding: { ref: designRef('assumption', assumptionId), property: 'quantity' } },
      { symbol: 'y', name: 'y', role: 'output', unit: '-' },
    ],
    relations: [
      { id: 'r1', kind: 'assignment', expression: 'y = x * (1 - x)' },
      { id: 'c1', kind: 'constraint', expression: `y <= ${limit}` },
    ],
  }
}

async function setup(range: { value: number; min: number; max: number }, limit: number) {
  const k = createConceptualizeTestAdapter()
  let n = 0
  const write = (items: BatchItem[], ctx = editor) => k.batch({ idempotencyKey: `c11-${++n}`, items }, ctx)
  const base = await write([
    { op: 'createFunction', as: '$f', body: { name: 'Hold the parameter in range' } },
    { op: 'createConcept', as: '$a', body: { name: 'A', performs: ['$f'] } },
    { op: 'createConcept', as: '$b', body: { name: 'B', performs: ['$f'] } },
    { op: 'createAssumption', as: '$x', body: { statement: 'x lies in its range', quantity: { ...range, unit: '-' }, basis: 'assumption' } },
  ])
  const m = await write([{ op: 'createCalculationModel', as: '$m', body: parabola(base.ids.$x, limit) }])
  const engine = createReasoningEngine({ knowledge: k })
  const run = engine.startRun({ question: 'C11', ctx: engineCtx })
  const ids: Record<string, string> = { ...base.ids, model: m.ids.$m }
  return { k, write, engine, run, ids }
}

describe('C11 propagation through design-reasoning-core', () => {
  it('evidence drafts carry the result kinds, proven statuses and limits; stored evidence keeps them unchanged', async () => {
    const { k, engine, run, ids } = await setup({ value: 0.2, min: 0, max: 1 }, 0.2)
    const env = await engine.call(run.id, 'reasoning.evaluate_calculation', { model: designRef('calculation-model', ids.model), uncertainty: 'interval', recordAsEvidence: { subjects: [designRef('concept', ids.$a)], title: 'Parabola over [0, 1]' } }, engineCtx)
    const draft = env.draft!
    expect(draft.qualifications!.outputs[0].range).toMatchObject({ kind: 'bounds', quality: 'enclosure' })
    expect(draft.qualifications!.checks[0].status).not.toBe('satisfied') // the interior maximum 0.25 > 0.2 is not missed
    expect(draft.uncertainty.ranges![0]).toMatchObject({ kind: 'bounds', quality: 'enclosure' })
    expect(draft.preview.map((p) => p.proposed).join('\n')).toMatch(/enclosure \(true range may be narrower\)/)
    expect(draft.limits!.join()).toMatch(/does not establish that the model is valid.*does not establish that any requirement is satisfied/)
    const applied = await applyDraftAsUser(draft, { conceptualize: k }, { projectId: P, actor: 'eli', role: 'editor' })
    const ev = (await k.get('evidence', applied.results[0].ids.$ev, editor))!
    expect(ev.qualifications).toEqual(draft.qualifications)
    expect(ev.qualifications).toEqual(qualifyManifest(ev.calculation!.manifest))
  })

  it('ignores qualifications supplied by a client: Conceptualize derives them from the verified manifest', async () => {
    const { k, write, engine, run, ids } = await setup({ value: 0.1, min: 0, max: 0.2 }, 0.3)
    const env = await engine.call(run.id, 'reasoning.evaluate_calculation', { model: designRef('calculation-model', ids.model), uncertainty: 'interval', recordAsEvidence: { subjects: [designRef('concept', ids.$a)], title: 't' } }, engineCtx)
    const body = (env.draft!.operations[0].body as { items: { body: Record<string, unknown> }[] }).items[0].body
    const forged = { ...body, qualifications: { outputs: [{ symbol: 'y', range: { kind: 'bounds', quality: 'exact' } }] } }
    const r = await write([{ op: 'createEvidence', as: '$e', body: forged as never }])
    const ev = (await k.get('evidence', r.ids.$e, editor))!
    expect(ev.qualifications).toEqual(qualifyManifest(ev.calculation!.manifest))
  })

  it('trade-study scores taken from calculated evidence carry its qualification; mismatching numbers are refused', async () => {
    const { k, write, engine, run, ids } = await setup({ value: 0.1, min: 0, max: 0.2 }, 0.3)
    const env = await engine.call(run.id, 'reasoning.evaluate_calculation', { model: designRef('calculation-model', ids.model), uncertainty: 'interval', recordAsEvidence: { subjects: [designRef('concept', ids.$a)], title: 't' } }, engineCtx)
    const evId = (await applyDraftAsUser(env.draft!, { conceptualize: k }, { projectId: P, actor: 'eli', role: 'editor' })).results[0].ids.$ev
    const ev = (await k.get('evidence', evId, editor))!
    const y = ev.qualifications!.outputs[0]
    expect(y.range).toMatchObject({ kind: 'bounds', quality: 'exact', min: 0 })
    const s = await write([
      { op: 'createAlternativeSet', as: '$s', body: { name: 's', question: 'q', memberIds: [ids.$a, ids.$b] } },
      { op: 'createTradeStudy', as: '$t', body: { title: 't', setId: '$s', criteria: [{ name: 'y', category: 'performance', weight: 1, direction: 'minimize', scale: 'quantity', unit: '-' }] } },
    ])
    const study = (await k.get('trade-study', s.ids.$t, editor))!
    const range = y.range as { min: number; max: number }
    await expect(write([{ op: 'putScores', body: { studyId: study.id, expectedRevision: 1, scores: [{ criterionId: study.criteria[0].id, conceptId: ids.$a, value: 0.5, basis: 'calculated', rationale: 'x', evidenceId: evId, evidenceOutput: 'y' }] } }])).rejects.toThrow(/differs from/)
    await write([
      {
        op: 'putScores',
        body: {
          studyId: study.id,
          expectedRevision: 1,
          scores: [
            { criterionId: study.criteria[0].id, conceptId: ids.$a, value: y.value, low: range.min, high: range.max, basis: 'calculated', rationale: 'from EVD', evidenceId: evId, evidenceOutput: 'y', qualification: { source: 'calculation', evidenceId: evId, symbol: 'y', kind: 'sampled-range' } },
            { criterionId: study.criteria[0].id, conceptId: ids.$b, value: 0.5, low: 0.4, high: 0.6, basis: 'estimate', rationale: 'judgement' },
          ],
        },
      },
    ])
    const stored = (await k.get('trade-study', study.id, editor))!
    expect(stored.scores.find((x) => x.conceptId === ids.$a)!.qualification).toEqual({ source: 'calculation', evidenceId: evId, symbol: 'y', kind: 'bounds', quality: 'exact' })
    const result = await k.tradeStudyResult(study.id, editor)
    expect(result.qualifications).toMatchObject({ exactBounds: 1, statedRanges: 1, sampledRanges: 0 })
    expect(result.ranking).toBe('robust')
    const cmp = await engine.call(run.id, 'reasoning.compare_alternatives', { tradeStudy: designRef('trade-study', study.id) }, engineCtx)
    expect((cmp.result as { weightedSum: { qualifications: unknown } }).weightedSum.qualifications).toEqual(result.qualifications)
  })

  it('a sampled range is not a bound: it cannot make a ranking or a dominance robust', () => {
    const study: TradeStudyRecord = {
      id: 's', key: 'TS-1', projectId: P, createdAt: '', provenance: { actor: 'x', sourceKind: 'user', at: '' }, title: 't', setId: 'set', revision: 2,
      criteria: [{ id: 'c', name: 'mass', category: 'mass', weight: 1, direction: 'minimize', scale: 'quantity', unit: 'kg' }],
      options: ['a', 'b'],
      scores: [
        { criterionId: 'c', conceptId: 'a', value: 1.5, low: 1, high: 2, basis: 'calculated', rationale: '', evidenceId: 'e', evidenceOutput: 'm', qualification: { source: 'calculation', evidenceId: 'e', symbol: 'm', kind: 'sampled-range' } },
        { criterionId: 'c', conceptId: 'b', value: 3.5, low: 3, high: 4, basis: 'estimate', rationale: '' },
      ],
    }
    const r = evaluateTradeStudy(study)
    expect(r.ranking).toBe('uncertain')
    expect(r.qualifications.robustnessNote).toMatch(/sampled ranges \(not bounds\)/)
    expect(paretoAnalysis(study).dominated).toEqual([{ conceptId: 'b', by: 'a', strength: 'possible' }])
    const bounded = { ...study, scores: study.scores.map((s) => (s.qualification ? { ...s, qualification: { ...s.qualification, kind: 'bounds' as const, quality: 'enclosure' as const } } : s)) }
    expect(evaluateTradeStudy(bounded).ranking).toBe('robust')
    expect(paretoAnalysis(bounded).dominated[0].strength).toBe('robust')
  })

  it('rationale shows the evidence qualifications and what the evidence does not establish', async () => {
    const { k, write, engine, run, ids } = await setup({ value: 0.1, min: 0, max: 0.2 }, 0.3)
    const env = await engine.call(run.id, 'reasoning.evaluate_calculation', { model: designRef('calculation-model', ids.model), uncertainty: 'interval', recordAsEvidence: { subjects: [designRef('concept', ids.$a)], title: 't' } }, engineCtx)
    const evId = (await applyDraftAsUser(env.draft!, { conceptualize: k }, { projectId: P, actor: 'eli', role: 'editor' })).results[0].ids.$ev
    const d = await write([
      { op: 'createAlternativeSet', as: '$s', body: { name: 's', question: 'q', memberIds: [ids.$a, ids.$b] } },
      { op: 'proposeDecision', as: '$d', body: { title: 'A', question: 'q', rationale: 'r', setId: '$s', outcomes: [{ conceptId: ids.$a, outcome: 'accepted', rationale: 'x' }], support: [{ ref: designRef('evidence', evId), role: 'supports' }] } },
    ])
    await write([{ op: 'recordDecision', body: { id: d.ids.$d, reason: 'ok' } }], reviewer)
    const answer = await explainSelection(k, editor, ids.$a)
    const sup = answer.decisions[0].support[0]
    expect(sup.checks.join()).toMatch(/y <= 0.3: satisfied \(proven over the input ranges with exact bounds/)
    expect(sup.qualifications!.outputs[0].range).toMatchObject({ kind: 'bounds', quality: 'exact' })
    expect(sup.limits.join(' ')).toMatch(/does not establish that the model is valid.*validated by a person.*does not establish that any requirement is satisfied/)
  })

  it('impact: a check that was proven and can no longer be proven is a possible impact, not a demonstrated one', async () => {
    const { k, write, engine, run, ids } = await setup({ value: 0.1, min: 0, max: 0.2 }, 0.3)
    const env = await engine.call(run.id, 'reasoning.evaluate_calculation', { model: designRef('calculation-model', ids.model), uncertainty: 'interval', recordAsEvidence: { subjects: [designRef('concept', ids.$a)], title: 't' } }, engineCtx)
    const evId = (await applyDraftAsUser(env.draft!, { conceptualize: k }, { projectId: P, actor: 'eli', role: 'editor' })).results[0].ids.$ev
    const d = await write([
      { op: 'createAlternativeSet', as: '$s', body: { name: 's', question: 'q', memberIds: [ids.$a, ids.$b] } },
      { op: 'proposeDecision', as: '$d', body: { title: 'A', question: 'q', rationale: 'r', setId: '$s', outcomes: [{ conceptId: ids.$a, outcome: 'accepted', rationale: 'x' }], support: [{ ref: designRef('evidence', evId), role: 'supports' }], invalidationConditions: [{ kind: 'relation-violated', subject: designRef('calculation-model', ids.model), relation: { modelId: ids.model, revision: 1, relationId: 'c1' }, description: 'y must stay ≤ 0.3' }] } },
    ])
    await write([{ op: 'recordDecision', body: { id: d.ids.$d, reason: 'ok' } }], reviewer)
    const cls = (r: Awaited<ReturnType<typeof assessChangeImpact>>, ref: string) => r.items.find((i) => refKey(i.ref) === ref)?.classification
    const evKey = refKey(designRef('evidence', evId))
    const decKey = refKey(designRef('decision', d.ids.$d))
    // x widened to [0, 1]: y ≤ 0.3 holds in truth (max 0.25) but the enclosure cannot prove it.
    const widened = await assessChangeImpact({ ref: designRef('assumption', ids.$x), description: 'x range widened', hypothetical: { value: 0.1, min: 0, max: 1, unit: '-' } }, { knowledge: k, ctx: editor })
    expect(cls(widened, evKey)).toBe('possible')
    expect(cls(widened, decKey)).toBe('possible')
    expect(widened.items.find((i) => refKey(i.ref) === evKey)!.evidence!.summary).toMatch(/can no longer be shown to hold/)
    // Around the maximum, x in [0.45, 0.55]: y ≤ 0.25 in truth, but y is not monotonic there and the enclosure
    // [0.2025, 0.3025] cannot prove y ≤ 0.3: still only possible, never claimed safe.
    const peak = await assessChangeImpact({ ref: designRef('assumption', ids.$x), description: 'x near the peak', hypothetical: { value: 0.5, min: 0.45, max: 0.55, unit: '-' } }, { knowledge: k, ctx: editor })
    expect(cls(peak, evKey)).toBe('possible')
    // x moved to [0.6, 0.8]: y is monotonic there, exact bounds [0.16, 0.24] prove y ≤ 0.3.
    const moved = await assessChangeImpact({ ref: designRef('assumption', ids.$x), description: 'x moved', hypothetical: { value: 0.7, min: 0.6, max: 0.8, unit: '-' } }, { knowledge: k, ctx: editor })
    expect(cls(moved, evKey)).toBe('checked-unaffected')
    expect(cls(moved, decKey)).toBe('checked-unaffected')
  })
})

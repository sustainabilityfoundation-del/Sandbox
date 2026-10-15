import { sampleModel } from '@ews/platform-sdk/testing'
import { describe, expect, it } from 'vitest'
import {
  attestTwinSnapshot,
  createConceptualizeTestAdapter,
  createReasoningEngine,
  designRef,
  paretoAnalysis,
  refKey,
  validateAgainst,
  type BatchItem,
  type RequestContext,
  type TradeStudyRecord,
} from './index'

const P = 'PRJ-ACT100'
const editor: RequestContext = { projectId: P, actor: 'eli', role: 'editor', sourceKind: 'user' }
const reviewer: RequestContext = { projectId: P, actor: 'rui', role: 'reviewer', sourceKind: 'user' }
const reader: RequestContext = { projectId: P, actor: 'rho', role: 'reader', sourceKind: 'user' }
const assistant: RequestContext = { ...editor, sourceKind: 'assistant' }
const req = { module: 'requirements' as const, id: '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001', revision: 1 }

let n = 0
function setup() {
  const k = createConceptualizeTestAdapter()
  const write = (items: BatchItem[], ctx = editor) => k.batch({ idempotencyKey: `t-${++n}`, items }, ctx)
  return { k, write }
}

describe('contract adapter: roles and basis rules', () => {
  it('is labelled as a test adapter', () => {
    const { k } = setup()
    expect(k.mode).toBe('test-adapter')
    expect((k as unknown as { label: string }).label).toMatch(/TEST ADAPTER/)
  })

  it('refuses writes by readers and decisions recorded by editors', async () => {
    const { k, write } = setup()
    await expect(write([{ op: 'createFunction', body: { name: 'f' } }], reader)).rejects.toMatchObject({ code: 'forbidden' })
    const r = await write([
      { op: 'createFunction', as: '$f', body: { name: 'Hold load' } },
      { op: 'createConcept', as: '$a', body: { name: 'A', performs: ['$f'] } },
      { op: 'createConcept', as: '$b', body: { name: 'B', performs: ['$f'] } },
      { op: 'createAlternativeSet', as: '$s', body: { name: 'S', question: 'q', functionId: '$f', memberIds: ['$a', '$b'] } },
      { op: 'proposeDecision', as: '$d', body: { title: 'A', question: 'q', rationale: 'r', setId: '$s', outcomes: [{ conceptId: '$a', outcome: 'accepted', rationale: 'x' }] } },
    ])
    await expect(write([{ op: 'recordDecision', body: { id: r.ids.$d, reason: 'x' } }])).rejects.toMatchObject({ code: 'forbidden' })
    await write([{ op: 'recordDecision', body: { id: r.ids.$d, reason: 'ok' } }], reviewer)
    expect((await k.get('decision', r.ids.$d, editor))!.status).toBe('recorded')
    expect(k).toBeTruthy()
  })

  it('refuses assistant writes of person-only bases and of person-only link types', async () => {
    const { write } = setup()
    await expect(write([{ op: 'createAssumption', body: { statement: 's', basis: 'user-assertion' } }], assistant)).rejects.toThrow(/may not write basis “user-assertion”/)
    await expect(write([{ op: 'createAssumption', body: { statement: 's', basis: 'evidence' } }])).rejects.toThrow(/accepted evidence review/)
    const r = await write([{ op: 'createFunction', as: '$f', body: { name: 'f' } }, { op: 'createConcept', as: '$c', body: { name: 'c' } }])
    const e = await write([{ op: 'createEvidence', as: '$e', body: { kind: 'test', title: 't', subjects: [designRef('concept', r.ids.$c)], basis: 'estimate' } }])
    await expect(write([{ op: 'createLink', body: { type: 'verified-by', from: designRef('concept', r.ids.$c), to: designRef('evidence', e.ids.$e) } }], assistant)).rejects.toThrow(/may not assert “verified-by”/)
  })

  it('refuses calculated evidence without a reproducible manifest', async () => {
    const { write } = setup()
    const r = await write([{ op: 'createConcept', as: '$c', body: { name: 'c' } }])
    await expect(write([{ op: 'createEvidence', body: { kind: 'calculation', title: 't', subjects: [designRef('concept', r.ids.$c)], basis: 'calculated' } }], assistant)).rejects.toThrow(/needs the calculation model reference/)
  })

  it('validates assumptions only with evidence, by a person', async () => {
    const { k, write } = setup()
    const r = await write([{ op: 'createAssumption', as: '$a', body: { statement: 'K = 1', basis: 'assumption' } }])
    await expect(k.setAssumptionValidation(r.ids.$a, { status: 'validated', reason: 'x' }, editor)).rejects.toThrow(/needs an evidence reference/)
    const c = await write([{ op: 'createConcept', as: '$c', body: { name: 'c' } }])
    const e = await write([{ op: 'createEvidence', as: '$e', body: { kind: 'test', title: 'fixture test', subjects: [designRef('concept', c.ids.$c)], basis: 'estimate' } }])
    await expect(k.setAssumptionValidation(r.ids.$a, { status: 'validated', reason: 'x', evidence: designRef('evidence', e.ids.$e) }, assistant)).rejects.toThrow(/cannot validate/)
    const ok = await k.setAssumptionValidation(r.ids.$a, { status: 'validated', reason: 'end fixture test', evidence: designRef('evidence', e.ids.$e) }, editor)
    expect(ok).toMatchObject({ revision: 2, validationStatus: 'validated' })
  })

  it('refuses AI-proposed calculation models marked validated, and dimensionally wrong models', async () => {
    const { write } = setup()
    const base = { name: 'm', grammar: 'ews-expr/1' as const, relations: [{ id: 'r', kind: 'assignment' as const, expression: 'y = a + b' }], assumptions: [], sources: [], basis: 'ai-hypothesis' as const }
    const params = [
      { symbol: 'a', name: 'a', role: 'input' as const, unit: 'N' },
      { symbol: 'b', name: 'b', role: 'input' as const, unit: 'mm' },
      { symbol: 'y', name: 'y', role: 'output' as const, unit: 'N' },
    ]
    await expect(write([{ op: 'createCalculationModel', body: { ...base, parameters: params, validationStatus: 'unvalidated' } }], assistant)).rejects.toThrow(/Cannot add length to force/)
    await expect(write([{ op: 'createCalculationModel', body: { ...base, parameters: params.map((p) => ({ ...p, unit: 'N' })), validationStatus: 'validated' } }], assistant)).rejects.toThrow(/starts unvalidated/)
  })
})

describe('contract adapter: links, structure and batches', () => {
  it('enforces link endpoint rules, cycles, self links and single formalization', async () => {
    const { write } = setup()
    const r = await write([
      { op: 'createFunction', as: '$f1', body: { name: 'f1' } },
      { op: 'createFunction', as: '$f2', body: { name: 'f2', parentFunctionId: '$f1' } },
      { op: 'createConcept', as: '$c', body: { name: 'c' } },
    ])
    const f1 = designRef('function', r.ids.$f1)
    const f2 = designRef('function', r.ids.$f2)
    await expect(write([{ op: 'createLink', body: { type: 'decomposes-into', from: f2, to: f1 } }])).rejects.toThrow(/cycle/)
    await expect(write([{ op: 'createLink', body: { type: 'performs', from: f1, to: designRef('concept', r.ids.$c) } }])).rejects.toThrow(/goes from concept/)
    await expect(write([{ op: 'createLink', body: { type: 'depends-on', from: f1, to: f1 } }])).rejects.toThrow(/itself/)
    await expect(write([{ op: 'createConstraint', body: { kind: 'mathematical', statement: 's', source: { kind: 'requirement', ref: { module: 'requirements', id: req.id } } } }])).rejects.toThrow(/pinned/)
    const c = await write([{ op: 'createConstraint', as: '$k', body: { kind: 'mathematical', statement: 's', source: { kind: 'requirement', ref: req } } }])
    await expect(write([{ op: 'createLink', body: { type: 'formalizes', from: designRef('constraint', c.ids.$k), to: { ...req, id: 'other' } } }])).rejects.toThrow(/already has a “formalizes” link/)
  })

  it('requires alternatives in a set to perform the set’s function', async () => {
    const { write } = setup()
    const r = await write([{ op: 'createFunction', as: '$f', body: { name: 'f' } }, { op: 'createConcept', as: '$a', body: { name: 'A', performs: ['$f'] } }, { op: 'createConcept', as: '$b', body: { name: 'B' } }])
    await expect(write([{ op: 'createAlternativeSet', body: { name: 's', question: 'q', functionId: r.ids.$f, memberIds: [r.ids.$a, r.ids.$b] } }])).rejects.toThrow(/does not perform the set's Function/)
  })

  it('applies batches atomically, substitutes placeholders and replays idempotently', async () => {
    const { k } = setup()
    const items: BatchItem[] = [{ op: 'createFunction', as: '$f', body: { name: 'kept?' } }, { op: 'createConcept', body: { name: 'c', performs: ['$missing'] } }]
    await expect(k.batch({ idempotencyKey: 'a1', items }, editor)).rejects.toMatchObject({ code: 'not-found' })
    expect(await k.list('function', editor)).toHaveLength(0)
    const ok: BatchItem[] = [{ op: 'createFunction', as: '$f', body: { name: 'f' } }, { op: 'createConcept', as: '$c', body: { name: 'c', performs: ['$f'] } }]
    const first = await k.batch({ idempotencyKey: 'a2', items: ok }, editor)
    const again = await k.batch({ idempotencyKey: 'a2', items: ok }, editor)
    expect(again).toEqual(first)
    expect(await k.list('concept', editor)).toHaveLength(1)
    await expect(k.batch({ idempotencyKey: 'a2', items: [ok[0]] }, editor)).rejects.toThrow(/already used/)
  })

  it('revises constraints with expected revisions; relaxing a requirement constraint needs a reviewer', async () => {
    const { k, write } = setup()
    const r = await write([{ op: 'createConstraint', as: '$k', body: { kind: 'mathematical', statement: 'F ≥ 12 kN', bound: { operator: '>=', quantity: { value: 12, unit: 'kN' } }, source: { kind: 'requirement', ref: req } } }])
    await expect(write([{ op: 'reviseConstraint', body: { id: r.ids.$k, expectedRevision: 2, reason: 'x' } }])).rejects.toMatchObject({ code: 'conflict' })
    await expect(write([{ op: 'reviseConstraint', body: { id: r.ids.$k, expectedRevision: 1, status: 'relaxed', reason: 'x' } }])).rejects.toMatchObject({ code: 'forbidden' })
    await write([{ op: 'reviseConstraint', body: { id: r.ids.$k, expectedRevision: 1, bound: { operator: '>=', quantity: { value: 15, unit: 'kN' } }, reason: 'new load' } }])
    expect((await k.get('constraint', r.ids.$k, editor))!.revision).toBe(2)
    expect((await k.get('constraint', r.ids.$k, editor, 1))!.bound!.quantity.value).toBe(12)
  })

  it('traverses traceability in both directions: requirement → … → artifact and artifact → … → requirement', async () => {
    const { k, write } = setup()
    const r = await write([
      { op: 'createFunction', as: '$f', body: { name: 'f' } },
      { op: 'createConstraint', as: '$k', body: { kind: 'mathematical', statement: 's', subjects: [designRef('function', '$f')], source: { kind: 'requirement', ref: req } } },
      { op: 'createConcept', as: '$c', body: { name: 'c', performs: ['$f'] } },
      { op: 'createImplementation', as: '$i', body: { name: 'i', concepts: [{ conceptId: '$c' }], artifacts: [{ module: 'twin', id: 'ROD-120', revision: 2 }] } },
    ])
    const down = await k.traverse({ start: [req], maxDepth: 6 }, editor)
    expect(down.nodes.map((x) => refKey(x.ref))).toContain('twin:ROD-120')
    const up = await k.traverse({ start: [{ module: 'twin', id: 'ROD-120' }], maxDepth: 6 }, editor)
    expect(up.nodes.map((x) => refKey(x.ref))).toEqual(expect.arrayContaining([refKey(designRef('concept', r.ids.$c)), refKey(designRef('function', r.ids.$f)), `requirements:${req.id}`]))
  })
})

describe('engine: tools, runs and budgets', () => {
  const twin = attestTwinSnapshot(sampleModel(), ['ROD-120'], 'test')

  it('validates tool input against the schema and reports unknown tools', async () => {
    const engine = createReasoningEngine({ knowledge: createConceptualizeTestAdapter(), twin: () => twin })
    const run = engine.startRun({ question: 'q', ctx: editor })
    await expect(engine.call(run.id, 'reasoning.assess_change_impact', { change: { ref: { module: 'nope', id: 'x' }, description: 'd' } }, editor)).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(engine.call(run.id, 'reasoning.delete_everything', {}, editor)).rejects.toMatchObject({ code: 'not-implemented' })
    const failed = engine.store.invocationsOf(run.id)
    expect(failed[0]).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
  })

  it('stops after cancellation and when the budget is exhausted', async () => {
    const k = createConceptualizeTestAdapter()
    await k.batch({ idempotencyKey: 'f', items: [{ op: 'createFunction', as: '$f', body: { name: 'f' } }] }, editor)
    const fn = (await k.list('function', editor))[0]
    const engine = createReasoningEngine({ knowledge: k })
    const run = engine.startRun({ question: 'q', ctx: editor, budget: { maxToolCalls: 1 } })
    const args = { question: 'context', seeds: [designRef('function', fn.id)] }
    await engine.call(run.id, 'reasoning.retrieve_design_context', args, editor)
    await expect(engine.call(run.id, 'reasoning.retrieve_design_context', args, editor)).rejects.toMatchObject({ code: 'budget-exhausted' })
    const run2 = engine.startRun({ question: 'q', ctx: editor })
    engine.cancelRun(run2.id)
    await expect(engine.call(run2.id, 'reasoning.retrieve_design_context', args, editor)).rejects.toMatchObject({ code: 'cancelled' })
  })

  it('every tool definition has a valid, closed input schema', () => {
    const engine = createReasoningEngine({ knowledge: createConceptualizeTestAdapter() })
    for (const t of engine.tools) {
      expect(t.inputSchema.type).toBe('object')
      expect(t.inputSchema.additionalProperties).toBe(false)
      expect(validateAgainst(t.inputSchema, { unexpected: true }).join()).toMatch(/is not allowed/)
    }
  })
})

describe('comparison: Pareto dominance with intervals', () => {
  const study: TradeStudyRecord = {
    id: 's', key: 'TS-001', projectId: P, createdAt: '', provenance: { actor: 'x', sourceKind: 'user', at: '' }, title: 't', setId: 'set', revision: 2,
    criteria: [
      { id: 'mass', name: 'Mass', category: 'mass', weight: 1, direction: 'minimize', scale: 'quantity', unit: 'kg' },
      { id: 'perf', name: 'Performance', category: 'performance', weight: 1, direction: 'maximize', scale: 'quantity', unit: 'N' },
    ],
    options: ['a', 'b', 'c'],
    scores: [
      { criterionId: 'mass', conceptId: 'a', value: 2, basis: 'estimate', rationale: '' },
      { criterionId: 'perf', conceptId: 'a', value: 100, basis: 'estimate', rationale: '' },
      { criterionId: 'mass', conceptId: 'b', low: 2.5, high: 3, basis: 'estimate', rationale: '' },
      { criterionId: 'perf', conceptId: 'b', low: 60, high: 90, basis: 'estimate', rationale: '' },
      { criterionId: 'mass', conceptId: 'c', low: 1.5, high: 1.7, basis: 'estimate', rationale: '' },
      { criterionId: 'perf', conceptId: 'c', low: 80, high: 95, basis: 'estimate', rationale: '' },
    ],
  }
  it('separates robust from possible dominance', () => {
    const r = paretoAnalysis(study)
    expect(r.paretoSet.sort()).toEqual(['a', 'c'])
    expect(r.dominated).toEqual([{ conceptId: 'b', by: 'a', strength: 'robust' }])
  })
})

describe('package rules', () => {
  it('uses the SDK testing fixtures only in tests (and scripts/, outside src)', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const root = join(__dirname)
    const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)]))
    const offending = files(root)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter((f) => /from\s+['"]@ews\/platform-sdk\/testing['"]/.test(readFileSync(f, 'utf8')))
    expect(offending).toEqual([])
  })
})

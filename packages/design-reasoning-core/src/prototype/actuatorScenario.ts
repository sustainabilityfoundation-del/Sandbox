import type { CheckResult, QuantityOut } from '@ews/engineering-calc'
import type { RequirementSummary } from '@ews/platform-sdk'
import { createConceptualizeTestAdapter } from '../adapters/conceptualizeContractAdapter'
import type { BatchItem, ConceptualizeKnowledgeApi, RequestContext } from '../contract/conceptualize'
import { createReasoningEngine, type ToolEnvelope } from '../engine'
import type { ImpactReport } from '../impact'
import { applyDraftAsUser, type ProposalDraft } from '../proposals'
import type { RationaleAnswer } from '../rationale'
import { designRef, type ArtifactRefX } from '../refs'
import { attestTwinSnapshot, type RequirementsReader, type TwinReader, type TwinSnapshot } from '../sources'

/**
 * Validation prototype R1 (brief §14; roadmap.md §2): the mechanical actuator, through the proposed
 * APIs. Real code: @ews/engineering-calc, the reasoning core, the sample twin of @ews/model-service
 * (passed in by the caller, attested as a client snapshot). Labelled stand-ins: the Conceptualize
 * TEST ADAPTER (proposed contract) and a Requirements TEST FIXTURE (SDK RequirementsService subset).
 * Proposals are applied by the platform-apply emulation, as the user, after "Apply".
 */

export const PROJECT_ID = 'PRJ-ACT100'
/** Canonical UUID of REQ-001 in the Requirements service seed (requirements-contracts.md §3). */
export const REQ_001 = '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001'

/** TEST FIXTURE implementing RequirementsService.get for REQ-001 (text as in the platform seed). */
export function requirementsFixture(): RequirementsReader {
  const req: RequirementSummary = {
    id: REQ_001,
    key: 'REQ-001',
    projectId: PROJECT_ID,
    revision: 1,
    title: 'Operating load',
    statement: 'The actuator shall withstand an operating load of 12 kN in the maximum-load scenario with a positive margin of safety.',
    type: 'performance',
    status: 'approved',
    archived: false,
    applicability: [],
    verificationMethods: ['Analysis', 'Test'],
    updatedAt: '2026-10-14T00:00:00.000Z',
  }
  return { mode: 'test-fixture', get: async (id) => (id === REQ_001 ? structuredClone(req) : undefined) }
}

export interface ScenarioStep {
  n: number
  title: string
  lines: string[]
}

export interface ScenarioTranscript {
  steps: ScenarioStep[]
  knowledge: ConceptualizeKnowledgeApi
  engine: ReturnType<typeof createReasoningEngine>
  twin: TwinSnapshot
  ids: Record<string, string>
  rationaleBefore: RationaleAnswer
  rationaleAfter: RationaleAnswer
  hypothetical: ImpactReport
  applied: ImpactReport
  drafts: ProposalDraft[]
  contexts: { editor: RequestContext; reviewer: RequestContext; engine: RequestContext }
}

export async function runActuatorScenario(model: TwinReader, options: { now?: () => Date } = {}): Promise<ScenarioTranscript> {
  const now = options.now ?? (() => new Date())
  const knowledge = createConceptualizeTestAdapter({ now })
  const requirements = requirementsFixture()
  const twin = attestTwinSnapshot(model, ['ACT-100', 'ROD-120', 'CAD-120', 'SYS-003'], 'scenario (stands in for the platform executor)', now())
  const engine = createReasoningEngine({ knowledge, requirements, twin: () => twin, now })
  const editor: RequestContext = { projectId: PROJECT_ID, actor: 'eli', role: 'editor', sourceKind: 'user' }
  const reviewer: RequestContext = { projectId: PROJECT_ID, actor: 'rui', role: 'reviewer', sourceKind: 'user' }
  const engineCtx: RequestContext = { projectId: PROJECT_ID, actor: 'eli', role: 'editor', sourceKind: 'reasoning', conversationId: 'conv-demo' }
  const steps: ScenarioStep[] = []
  const ids: Record<string, string> = {}
  const drafts: ProposalDraft[] = []
  let n = 0
  const step = (title: string, lines: string[]) => steps.push({ n: ++n, title, lines })
  let batchSeq = 0
  const write = (items: BatchItem[], ctx = editor) => knowledge.batch({ idempotencyKey: `scenario-${++batchSeq}`, items }, ctx)
  const apply = async (env: ToolEnvelope, user: RequestContext) => {
    drafts.push(env.draft!)
    return applyDraftAsUser(env.draft!, { conceptualize: knowledge }, { projectId: user.projectId, actor: user.actor, role: user.role, conversationId: 'conv-demo' })
  }
  const key = async (type: 'function' | 'concept' | 'constraint' | 'assumption' | 'evidence' | 'decision' | 'implementation' | 'calculation-model' | 'alternative-set' | 'trade-study', id: string) =>
    (await knowledge.get(type, id, editor))?.key ?? id

  // 1. Functional objective, no solution -------------------------------------------------------------------
  const f = await write([
    {
      op: 'createFunction',
      as: '$fn',
      body: {
        name: 'Convert motor rotation into linear force',
        description: 'Turn the rotary output of the drive into an axial force on the load, over the stroke.',
        flows: [
          { direction: 'in', kind: 'energy', name: 'Rotary mechanical power' },
          { direction: 'out', kind: 'force', name: 'Axial force on the load', quantity: { value: 12, unit: 'kN' } },
        ],
        performanceObjectives: [{ name: 'Axial force capacity', direction: 'target', quantity: { min: 12, unit: 'kN' }, basis: 'user-assertion' }],
        classifications: ['actuation'],
      },
    },
  ])
  ids.function = f.ids.$fn
  step('Functional objective without a solution', [`${f.results[0].key} “Convert motor rotation into linear force” (Function); flows: rotary power in, axial force out; objective ≥ 12 kN. No Concept or implementation exists.`])

  // 2. Assumptions and constraints (person-entered, as in the UI) ----------------------------------------------
  const reqRef: ArtifactRefX = { module: 'requirements', id: REQ_001, revision: 1, kind: 'requirement' }
  const a = await write([
    { op: 'createAssumption', as: '$E', body: { statement: 'Rod material 42CrMo4: elastic modulus 210 GPa', quantity: { value: 210, unit: 'GPa' }, basis: 'assumption', scope: { applicability: 'ACT-100 rod' } } },
    { op: 'createAssumption', as: '$K', body: { statement: 'Rod ends pinned–pinned (end-fixity factor K = 1)', quantity: { value: 1, unit: '-' }, basis: 'assumption' } },
    { op: 'createAssumption', as: '$n', body: { statement: 'Design factor against buckling n = 2', quantity: { value: 2, unit: '-' }, basis: 'user-assertion' } },
    { op: 'createAssumption', as: '$sy', body: { statement: 'Yield strength of the quenched-and-tempered rod ≥ 600 MPa', quantity: { value: 600, unit: 'MPa' }, basis: 'assumption' } },
    {
      op: 'createConstraint',
      as: '$load',
      body: { kind: 'mathematical', statement: 'REQ-001 operating load formalized as F ≥ 12 kN on the actuation path', bound: { symbol: 'F', operator: '>=', quantity: { value: 12, unit: 'kN' } }, strength: 'hard', subjects: [designRef('function', ids.function)], source: { kind: 'requirement', ref: reqRef } },
    },
    { op: 'createConstraint', as: '$env', body: { kind: 'dimensional', statement: 'Fits the existing housing: outer diameter ≤ 60 mm', bound: { operator: '<=', quantity: { value: 60, unit: 'mm' } }, strength: 'hard', subjects: [designRef('function', ids.function)], source: { kind: 'stated', basis: 'user-assertion' } } },
  ])
  Object.assign(ids, { asmE: a.ids.$E, asmK: a.ids.$K, asmN: a.ids.$n, asmSy: a.ids.$sy, cstLoad: a.ids.$load, cstEnv: a.ids.$env })
  step('Assumptions and constraints recorded', [
    ...a.results.slice(0, 4).map((r) => `${r.key} (Assumption)`),
    `${a.results[4].key}: F ≥ 12 kN, formalizes REQ-001 at revision 1 (pinned; text stays in Requirements)`,
    `${a.results[5].key}: outer diameter ≤ 60 mm (stated)`,
  ])

  // 3. Candidate concepts through the reasoning engine (scripted candidates stand in for a model) ---------------
  const run = engine.startRun({ question: 'Which principle converts the motor rotation into 12 kN of axial force for ACT-100?', ctx: engineCtx })
  ids.run = run.id
  const proposed = await engine.call(
    run.id,
    'reasoning.propose_solution_concepts',
    {
      function: designRef('function', ids.function),
      setName: 'Rotary-to-linear principle',
      question: 'Which principle converts the motor rotation into 12 kN of axial force for ACT-100?',
      candidates: [
        { name: 'Ball screw', principle: 'Recirculating balls between screw and nut convert rotation to translation with rolling contact.', advantages: ['High efficiency'], risks: ['Back-driving under load'] },
        { name: 'Lead screw', principle: 'Sliding thread contact converts rotation to translation.', advantages: ['Self-locking possible'], risks: ['Low efficiency, wear'] },
        { name: 'Rack and pinion', principle: 'A pinion on the motor shaft drives a toothed rack.', risks: ['Needs guidance against side loads'] },
        { name: 'Electro-hydraulic cylinder', principle: 'A motor-driven pump pressurizes a cylinder.', openQuestions: ['Is a hydraulic circuit acceptable in the cell?'] },
        { name: 'Ball-screw', principle: 'Same as the first candidate.' },
      ],
    },
    engineCtx,
  )
  const created = await apply(proposed, editor)
  const conceptIds = created.results[0].results.filter((r) => r.op === 'createConcept').map((r) => r.id)
  ;[ids.ballScrew, ids.leadScrew, ids.rack, ids.hydraulic] = conceptIds
  ids.set = created.results[0].ids.$set
  step('Candidate concepts generated and applied', [
    `Draft ${proposed.draft!.id.slice(0, 8)}: ${proposed.draft!.title} (all ai-hypothesis)`,
    ...proposed.warnings,
    `Applied by eli: ${created.results[0].results.filter((r) => r.op === 'createConcept').map((r) => r.key).join(', ')} perform ${await key('function', ids.function)}; set ${await key('alternative-set', ids.set)} requires that`,
  ])

  // 4. A deterministic calculation: Euler buckling of the rod ------------------------------------------------------
  const m = await write([
    {
      op: 'createCalculationModel',
      as: '$m',
      body: {
        name: 'Euler buckling of a solid round rod',
        description: 'Critical load of the actuator rod as an Euler column, with slenderness validity.',
        grammar: 'ews-expr/1',
        parameters: [
          { symbol: 'F', name: 'Axial load', role: 'input', unit: 'kN', defaultBinding: { ref: designRef('constraint', ids.cstLoad), property: 'bound' } },
          { symbol: 'E', name: 'Elastic modulus', role: 'input', unit: 'GPa', defaultBinding: { ref: designRef('assumption', ids.asmE), property: 'quantity' } },
          { symbol: 'd', name: 'Rod diameter', role: 'input', unit: 'mm', defaultBinding: { ref: { module: 'twin', id: 'ROD-120', revision: 2, kind: 'part' }, property: 'diameter' } },
          { symbol: 'L', name: 'Effective length', role: 'input', unit: 'mm', defaultBinding: { ref: { module: 'twin', id: 'ROD-120', revision: 2, kind: 'part' }, property: 'effectiveLength' } },
          { symbol: 'K', name: 'End-fixity factor', role: 'input', unit: '-', defaultBinding: { ref: designRef('assumption', ids.asmK), property: 'quantity' } },
          { symbol: 'n', name: 'Design factor', role: 'input', unit: '-', defaultBinding: { ref: designRef('assumption', ids.asmN), property: 'quantity' } },
          { symbol: 'sigma_y', name: 'Yield strength', role: 'input', unit: 'MPa', defaultBinding: { ref: designRef('assumption', ids.asmSy), property: 'quantity' } },
          { symbol: 'I', name: 'Second moment of area', role: 'output', unit: 'mm^4' },
          { symbol: 'P_cr', name: 'Critical buckling load', role: 'output', unit: 'kN' },
          { symbol: 'lambda', name: 'Slenderness', role: 'output', unit: '-' },
        ],
        relations: [
          { id: 'r1', kind: 'assignment', expression: 'I = pi * d^4 / 64' },
          { id: 'r2', kind: 'assignment', expression: 'P_cr = pi^2 * E * I / (K * L)^2' },
          { id: 'r3', kind: 'assignment', expression: 'lambda = 4 * K * L / d' },
          { id: 'c1', kind: 'constraint', expression: 'P_cr >= n * F', description: 'Buckling capacity with the design factor' },
        ],
        validity: { text: 'Euler buckling applies to slender columns', conditions: ['lambda >= pi * sqrt(E / sigma_y)'] },
        basis: 'user-assertion',
        validationStatus: 'validated',
        assumptions: [designRef('assumption', ids.asmE), designRef('assumption', ids.asmK), designRef('assumption', ids.asmN), designRef('assumption', ids.asmSy)],
        sources: [{ module: 'external', id: 'Euler column formula (standard mechanics of materials)', kind: 'reference' }],
      },
    },
  ])
  ids.model = m.ids.$m
  const calc = await engine.call(
    run.id,
    'reasoning.evaluate_calculation',
    { model: designRef('calculation-model', ids.model), recordAsEvidence: { subjects: [designRef('concept', ids.ballScrew), designRef('constraint', ids.cstLoad)], title: 'Rod buckling check, ACT-100 rod (Euler)' } },
    engineCtx,
  )
  const calcOut = calc.result as { outputs: Record<string, QuantityOut>; checks: CheckResult[] }
  const recorded = await apply(calc, editor)
  ids.evidence = recorded.results[0].ids.$ev
  step('Preliminary relationship evaluated deterministically', [
    `${await key('calculation-model', ids.model)}: P_cr = π²·E·I/(K·L)² with d, L from ROD-120 rev ${twin.objects.find((o) => o.id === 'ROD-120')!.revision} (client-attested), E, K, n, σy from assumptions, F from ${await key('constraint', ids.cstLoad)}`,
    `P_cr = ${calcOut.outputs.P_cr.value.toFixed(1)} kN, λ = ${calcOut.outputs.lambda.value.toFixed(0)}; ${calcOut.checks[0].text}: ${calcOut.checks[0].status} at the nominal point (point evaluation), margin ${calcOut.checks[0].margin.toFixed(1)} kN (ratio ${calcOut.checks[0].marginRatio!.toFixed(2)})`,
    `Basis ${calc.basis}; manifest output digest ${(calc.result as { manifest: { outputDigest: string } }).manifest.outputDigest.slice(0, 23)}…`,
    `Recorded as ${await key('evidence', ids.evidence)} after the adapter re-verified the manifest`,
  ])

  // 5. Comparison with explicit criteria ---------------------------------------------------------------------
  const ts = await write([
    {
      op: 'createTradeStudy',
      as: '$ts',
      body: {
        title: 'Rotary-to-linear principle for ACT-100',
        setId: ids.set,
        criteria: [
          { name: 'Rod buckling margin ratio', category: 'performance', weight: 3, direction: 'maximize', scale: 'quantity', unit: '-' },
          { name: 'Efficiency', category: 'performance', weight: 2, direction: 'maximize', scale: 'quantity', unit: '%' },
          { name: 'Mass', category: 'mass', weight: 2, direction: 'minimize', scale: 'quantity', unit: 'kg' },
          { name: 'Cost', category: 'cost', weight: 1, direction: 'minimize', scale: 'qualitative' },
        ],
      },
    },
  ])
  ids.study = ts.ids.$ts
  const study = (await knowledge.get('trade-study', ids.study, editor))!
  const [cMargin, cEff, cMass, cCost] = study.criteria.map((c) => c.id)
  const ratio = calcOut.checks[0].marginRatio!
  const sc = (conceptId: string, criterionId: string, v: Partial<{ value: number; low: number; high: number; qualitative: number }>, basis: 'assumption' | 'estimate' | 'calculated', rationale: string, evidenceId?: string) => ({ conceptId, criterionId, ...v, basis, rationale, evidenceId })
  await write([
    {
      op: 'putScores',
      body: {
        studyId: ids.study,
        expectedRevision: study.revision,
        scores: [
          sc(ids.ballScrew, cMargin, { value: ratio }, 'calculated', 'From the buckling calculation', ids.evidence),
          sc(ids.leadScrew, cMargin, { value: ratio }, 'estimate', 'Same rod; same buckling load'),
          sc(ids.rack, cMargin, { low: ratio * 0.5, high: ratio }, 'estimate', 'Rack carries the load differently; rod may be shorter or absent'),
          sc(ids.hydraulic, cMargin, { value: ratio }, 'estimate', 'Same rod'),
          sc(ids.ballScrew, cEff, { low: 85, high: 95 }, 'assumption', 'Typical rolling-contact screw'),
          sc(ids.leadScrew, cEff, { low: 25, high: 50 }, 'assumption', 'Typical sliding thread'),
          sc(ids.rack, cEff, { low: 85, high: 95 }, 'assumption', 'Typical gear mesh'),
          sc(ids.hydraulic, cEff, { low: 60, high: 80 }, 'assumption', 'Pump and valve losses'),
          sc(ids.ballScrew, cMass, { low: 2.0, high: 2.6 }, 'estimate', 'Screw and nut for 12 kN'),
          sc(ids.leadScrew, cMass, { low: 1.8, high: 2.4 }, 'estimate', 'Screw and nut'),
          sc(ids.rack, cMass, { low: 2.5, high: 3.5 }, 'estimate', 'Rack, pinion and guidance'),
          sc(ids.hydraulic, cMass, { low: 4, high: 6 }, 'estimate', 'Pump, reservoir, cylinder'),
          sc(ids.ballScrew, cCost, { qualitative: 3 }, 'assumption', 'Medium cost'),
          sc(ids.leadScrew, cCost, { qualitative: 4 }, 'assumption', 'Low cost'),
          sc(ids.rack, cCost, { qualitative: 3 }, 'assumption', 'Medium cost'),
          sc(ids.hydraulic, cCost, { qualitative: 2 }, 'assumption', 'High cost'),
        ],
      },
    },
  ])
  const cmp = await engine.call(run.id, 'reasoning.compare_alternatives', { tradeStudy: designRef('trade-study', ids.study) }, engineCtx)
  const cmpOut = cmp.result as { weightedSum: { options: { conceptId: string; score: number | null; rank: number | null }[]; ranking: string; preliminary: boolean }; pareto: { paretoSet: string[]; dominated: { conceptId: string; by: string; strength: string }[] } }
  const ranked = [...cmpOut.weightedSum.options].sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99))
  step('Candidates compared with explicit criteria', [
    `Weighted sum (${cmpOut.weightedSum.ranking}, ${cmpOut.weightedSum.preliminary ? 'preliminary' : 'final'}): ${(await Promise.all(ranked.map(async (o) => `${await key('concept', o.conceptId)} ${o.score?.toFixed(3)}`))).join(' > ')}`,
    `Pareto set: ${(await Promise.all(cmpOut.pareto.paretoSet.map((id) => key('concept', id)))).join(', ')}; dominated: ${(await Promise.all(cmpOut.pareto.dominated.map(async (d) => `${await key('concept', d.conceptId)} by ${await key('concept', d.by)} (${d.strength})`))).join(', ') || 'none'}`,
    `Lowest score basis: ${cmp.basis}`,
  ])

  // 6. Decision with evidence, assumptions and invalidation conditions --------------------------------------------
  const decisionDraft = await engine.call(
    run.id,
    'reasoning.record_design_decision',
    {
      alternativeSet: designRef('alternative-set', ids.set),
      tradeStudy: designRef('trade-study', ids.study),
      title: 'Ball screw for the ACT-100 actuation path',
      question: 'Which principle converts the motor rotation into 12 kN of axial force for ACT-100?',
      rationale: 'Highest weighted score with a calculated buckling margin; efficiency keeps the existing 350 W motor adequate. Lead screw kept as deferred fallback if back-driving must be prevented without a brake.',
      outcomes: [
        { concept: designRef('concept', ids.ballScrew), outcome: 'accepted', rationale: 'Best overall; calculated rod buckling margin' },
        { concept: designRef('concept', ids.leadScrew), outcome: 'deferred', rationale: 'Self-locking fallback; low efficiency' },
        { concept: designRef('concept', ids.rack), outcome: 'rejected', rationale: 'Needs extra guidance against side loads' },
        { concept: designRef('concept', ids.hydraulic), outcome: 'rejected', rationale: 'Mass and a hydraulic circuit in the cell' },
      ],
      support: [{ ref: designRef('evidence', ids.evidence), role: 'supports' }],
      assumptions: [designRef('assumption', ids.asmE), designRef('assumption', ids.asmK), designRef('assumption', ids.asmN)],
      constraints: [designRef('constraint', ids.cstLoad), designRef('constraint', ids.cstEnv)],
      invalidationConditions: [
        { kind: 'relation-violated', subject: designRef('calculation-model', ids.model), relation: { modelId: ids.model, revision: 1, relationId: 'c1' }, description: 'Rod buckling capacity no longer covers n·F' },
        { kind: 'assumption-invalidated', subject: designRef('assumption', ids.asmK), description: 'Rod ends are not pinned–pinned' },
      ],
    },
    engineCtx,
  )
  const proposedDec = await apply(decisionDraft, editor)
  ids.decision = proposedDec.results[0].ids.$dec
  let editorRefused = ''
  try {
    await write([{ op: 'recordDecision', body: { id: ids.decision, reason: 'eli tries to record' } }], editor)
  } catch (e) {
    editorRefused = (e as Error).message
  }
  await write([{ op: 'recordDecision', body: { id: ids.decision, reason: 'Reviewed the trade study and the buckling calculation' } }], reviewer)
  step('Design decision recorded with supporting evidence', [
    `Drafted by the engine, applied by eli as a proposed decision: ${await key('decision', ids.decision)}`,
    `Recording by eli (editor) refused: ${editorRefused}`,
    `Recorded by rui (reviewer): support ${await key('evidence', ids.evidence)} [calculated]; 3 assumptions and 2 constraints pinned; 2 invalidation conditions`,
  ])

  // 7. Link the selected concept to existing artifacts ---------------------------------------------------------------
  const rev = (id: string) => twin.objects.find((o) => o.id === id)!.revision
  const impl = await write([
    {
      op: 'createImplementation',
      as: '$impl',
      body: {
        name: 'ACT-100 rod and screw (current design)',
        status: 'in-development',
        concepts: [{ conceptId: ids.ballScrew }],
        artifacts: [
          { module: 'twin', id: 'ROD-120', revision: rev('ROD-120'), kind: 'part' },
          { module: 'cad', id: 'CAD-120', revision: rev('CAD-120'), kind: 'cad-representation' },
          { module: 'sysml', id: 'SYS-003', revision: rev('SYS-003'), kind: 'sysml-element' },
        ],
      },
    },
  ])
  ids.implementation = impl.ids.$impl
  step('Selected concept linked to existing CAD and SysML artifacts', [`${impl.results[0].key} realizes ${await key('concept', ids.ballScrew)} → twin:ROD-120@${rev('ROD-120')}, cad:CAD-120@${rev('CAD-120')}, sysml:SYS-003@${rev('SYS-003')} (sample twin, client-attested)`])

  const rationale = await engine.call(run.id, 'reasoning.retrieve_design_rationale', { concept: designRef('concept', ids.ballScrew) }, engineCtx)
  const rationaleBefore = rationale.result as RationaleAnswer
  step('Why was this design selected? (records only, no model)', rationaleBefore.summary.split('\n'))

  // 8. Change impact: hypothetical, then an applied constraint revision ---------------------------------------------
  const hypo = await engine.call(
    run.id,
    'reasoning.assess_change_impact',
    { change: { ref: designRef('constraint', ids.cstLoad), description: 'What if the load constraint rises to 15 kN?', hypothetical: { value: 15, unit: 'kN' } } },
    engineCtx,
  )
  const hypothetical = hypo.result as ImpactReport
  const revised = await write([{ op: 'reviseConstraint', body: { id: ids.cstLoad, expectedRevision: 1, bound: { symbol: 'F', operator: '>=', quantity: { value: 120, unit: 'kN' } }, statement: 'Peak load raised to 120 kN for a press-fit variant (under discussion with the customer)', reason: 'Customer press-fit variant' } }])
  const impactEnv = await engine.call(
    run.id,
    'reasoning.assess_change_impact',
    { change: { ref: designRef('constraint', ids.cstLoad), description: `${revised.results[0].key} revised: F ≥ 120 kN`, fromRevision: 1 }, draftFlags: true },
    engineCtx,
  )
  const applied = impactEnv.result as ImpactReport
  await apply(impactEnv, editor)
  const rationaleAfter = (await engine.call(run.id, 'reasoning.retrieve_design_rationale', { concept: designRef('concept', ids.ballScrew) }, engineCtx)).result as RationaleAnswer
  engine.completeRun(run.id)
  const describe = async (r: ImpactReport) => {
    const groups: Record<string, string[]> = { demonstrated: [], possible: [], 'checked-unaffected': [] }
    for (const i of r.items) groups[i.classification].push(i.label)
    return Object.entries(groups).map(([k, v]) => `${k}: ${v.length ? v.join('; ') : '—'}`)
  }
  step('Hypothetical change (15 kN): nothing written', await describe(hypothetical))
  step('Applied constraint change (120 kN): affected decisions and implementations', [
    ...(await describe(applied)),
    `Review flag drafted and applied by eli: ${await key('decision', ids.decision)} validity ${rationaleAfter.decisions[0].validity}; rationale and outcomes unchanged`,
  ])

  return { steps, knowledge, engine, twin, ids, rationaleBefore, rationaleAfter, hypothetical, applied, drafts, contexts: { editor, reviewer, engine: engineCtx } }
}

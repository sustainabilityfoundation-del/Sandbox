import { evaluateModel, libraryModel, type CheckResult, type QuantityOut } from '@ews/engineering-calc'
import { createConceptualizeTestAdapter, toDefinition } from '../adapters/conceptualizeContractAdapter'
import { resolveInputs } from '../bindings'
import type { BatchItem, CalculationModelInput, CalculationModelRecord, ConceptualizeKnowledgeApi, RequestContext } from '../contract/conceptualize'
import { createReasoningEngine, type ToolEnvelope } from '../engine'
import type { ImpactReport } from '../impact'
import { applyDraftAsUser, type ProposalDraft } from '../proposals'
import { designRef, refKey, type ArtifactRefX } from '../refs'
import { requirementsFixtureStore, type RequirementsReader, type RequirementsWriter } from '../sources'
import type { ScenarioStep } from './actuatorScenario'

/**
 * New-project scenario (integration milestone 1, workflow steps 2, 4 and 7) without any actuator IDs: an empty
 * project, a requirement, a function, three candidate concepts, a decision, a calculation with pinned inputs, then a
 * change of the requirement with demonstrated and possible impact. Runs against the contract adapter (with a
 * requirements fixture) or against the real Conceptualize and Requirements APIs; every step says which.
 */
export interface NewProjectOptions {
  projectId: string
  now?: () => Date
  knowledge?: ConceptualizeKnowledgeApi
  requirements?: RequirementsReader & RequirementsWriter
  users?: { editor: string; reviewer: string }
}

export interface NewProjectTranscript {
  steps: ScenarioStep[]
  ids: Record<string, string>
  requirement: { id: string; key: string; revisions: number[] }
  emptyAtStart: { functions: number; concepts: number; decisions: number; constraints: number }
  calculation: { outputs: Record<string, QuantityOut>; checks: CheckResult[]; basis: string; verifiedByService: boolean }
  requirementImpact: ImpactReport
  reformalizationImpact: ImpactReport
  decisionValidityAfter: string
  allRefs: string[]
  knowledge: ConceptualizeKnowledgeApi
}

export async function runNewProjectScenario(options: NewProjectOptions): Promise<NewProjectTranscript> {
  const now = options.now ?? (() => new Date())
  const knowledge = options.knowledge ?? createConceptualizeTestAdapter({ now })
  const requirements = options.requirements ?? requirementsFixtureStore()
  const P = options.projectId
  const cap = knowledge.capabilities
  const users = options.users ?? { editor: 'eli', reviewer: 'rui' }
  const editor: RequestContext = { projectId: P, actor: users.editor, role: 'editor', sourceKind: 'user' }
  const reviewer: RequestContext = { projectId: P, actor: users.reviewer, role: 'reviewer', sourceKind: 'user' }
  const engineCtx: RequestContext = { ...editor, sourceKind: 'reasoning', conversationId: 'conv-new-project' }
  const service = knowledge.mode === 'api' ? 'real service (Conceptualize API)' : 'contract adapter (in memory)'
  const reqService = requirements.mode === 'api' ? 'real service (Requirements API)' : 'test fixture (requirements, in memory)'
  const engine = createReasoningEngine({ knowledge, requirements, now })
  const steps: ScenarioStep[] = []
  const ids: Record<string, string> = {}
  const drafts: ProposalDraft[] = []
  let n = 0
  const step = (title: string, lines: string[], backing = service) => steps.push({ n: ++n, title, lines, backing })
  const tag = Math.random().toString(36).slice(2, 8)
  let seq = 0
  const write = (items: BatchItem[], ctx = editor) => knowledge.batch({ idempotencyKey: `newproj-${tag}-${++seq}`, items }, ctx)
  const apply = async (env: ToolEnvelope, user: RequestContext) => {
    drafts.push(env.draft!)
    return applyDraftAsUser(env.draft!, { conceptualize: knowledge }, { projectId: P, actor: user.actor, role: user.role, conversationId: 'conv-new-project' })
  }
  const key = async (type: 'function' | 'concept' | 'constraint' | 'decision' | 'evidence', id: string) => (await knowledge.get(type, id, editor))?.key ?? id

  // 1. An empty project: no design records, no sample data.
  const emptyAtStart = {
    functions: (await knowledge.list('function', editor)).length,
    concepts: (await knowledge.list('concept', editor)).length,
    decisions: (await knowledge.list('decision', editor)).length,
    constraints: (await knowledge.list('constraint', editor)).length,
  }
  step('Empty project', [`${P}: ${emptyAtStart.functions} functions, ${emptyAtStart.concepts} concepts, ${emptyAtStart.constraints} constraints, ${emptyAtStart.decisions} decisions`])

  // 2. A requirement (owned by Requirements).
  const req = await requirements.create({ projectId: P, title: 'Clamping force', statement: 'The fixture shall hold the workpiece with a clamping force of at least 2 kN.', type: 'performance' }, users.editor)
  ids.requirement = req.id
  step('Requirement created', [`${req.key} revision ${req.revision}: clamping force ≥ 2 kN`], reqService)

  // 3. Function, formalizing constraint and assumptions (person-entered).
  const reqRef: ArtifactRefX = { module: 'requirements', id: req.id, revision: req.revision, kind: 'requirement' }
  const base = await write([
    { op: 'createFunction', as: '$fn', body: { name: 'Hold the workpiece against machining forces', flows: [{ direction: 'out', kind: 'force', name: 'Clamping force', quantity: { min: 2, unit: 'kN' } }], performanceObjectives: [{ name: 'Clamping force', direction: 'target', quantity: { min: 2, unit: 'kN' }, basis: 'user-assertion' }] } },
    { op: 'createConstraint', as: '$cst', body: { kind: 'mathematical', statement: `${req.key} clamping force formalized as F ≥ 2 kN`, bound: { symbol: 'F', operator: '>=', quantity: { value: 2, unit: 'kN' } }, strength: 'hard', subjects: [designRef('function', '$fn')], source: { kind: 'requirement', ref: reqRef } } },
    { op: 'createAssumption', as: '$T', body: { statement: 'Operator applies 5 N·m at the handle', quantity: { value: 5, unit: 'N*m' }, basis: 'assumption', scope: { subjects: [] } } },
    { op: 'createAssumption', as: '$eta', body: { statement: 'Trapezoidal thread efficiency 0.3', quantity: { value: 0.3, unit: '-' }, basis: 'assumption', scope: { subjects: [] } } },
    { op: 'createAssumption', as: '$n', body: { statement: 'Handle turned at 30 rpm', quantity: { value: 30, unit: 'rpm' }, basis: 'assumption', scope: { subjects: [] } } },
    { op: 'createAssumption', as: '$l', body: { statement: 'Vise screw lead 2 mm (single-start Tr 10×2)', quantity: { value: 2, unit: 'mm' }, basis: 'assumption', scope: { subjects: [] } } },
  ])
  Object.assign(ids, { function: base.ids.$fn, constraint: base.ids.$cst, asmT: base.ids.$T, asmEta: base.ids.$eta, asmN: base.ids.$n, asmLead: base.ids.$l })
  step('Function, constraint and assumptions', [`${await key('function', ids.function)} with objective ≥ 2 kN; ${await key('constraint', ids.constraint)} formalizes ${req.key} at revision ${req.revision} (pinned); 4 assumptions (torque, efficiency, speed, screw lead)`])

  // 4. Three candidate concepts through the engine (scripted candidates stand in for a model).
  let parentConcept: string | undefined
  if (!cap.functionAlternativeSets) {
    const p = await write([{ op: 'createConcept', as: '$p', body: { name: 'Workpiece clamping', summary: 'Parent of the clamping alternatives (until alternative sets can belong to a Function: CR-C7)', abstraction: 'abstract', performs: [ids.function] } }])
    parentConcept = p.ids.$p
  }
  const run = engine.startRun({ question: 'How should the fixture clamp the workpiece?', ctx: engineCtx })
  const proposed = await engine.call(
    run.id,
    'reasoning.propose_solution_concepts',
    {
      function: designRef('function', ids.function),
      ...(parentConcept ? { parentConcept: designRef('concept', parentConcept) } : {}),
      setName: 'Clamping principle',
      question: 'How should the fixture clamp the workpiece?',
      candidates: [
        { name: 'Screw vise', principle: 'A lead screw turned by hand drives a movable jaw.' },
        { name: 'Toggle clamp', principle: 'An over-centre linkage locks the clamping arm.' },
        { name: 'Pneumatic clamp', principle: 'A compressed-air cylinder pushes the jaw.' },
      ],
    },
    engineCtx,
  )
  const created = await apply(proposed, editor)
  ;[ids.vise, ids.toggle, ids.pneumatic] = created.results[0].results.filter((r) => r.op === 'createConcept').map((r) => r.id)
  ids.set = created.results[0].ids.$set
  const vise = (await knowledge.get('concept', ids.vise, editor))!
  step('Three candidate concepts', [`${created.results[0].results.filter((r) => r.op === 'createConcept').map((r) => r.key).join(', ')} perform ${await key('function', ids.function)} (ai-hypothesis); drafted by the engine, applied by ${users.editor}`, `Vise revision ${vise.revision}`])

  // 5. A calculation with pinned inputs: screw thrust from the library relation, validated by a person.
  const lib = libraryModel('lib.drive.screw-lead-speed-force')
  const modelBody: CalculationModelInput = {
    ...lib,
    name: 'Screw vise clamping force',
    basis: 'user-assertion', // a person reviewed the library relation for this use
    validationStatus: 'validated',
    assumptions: [designRef('assumption', ids.asmT), designRef('assumption', ids.asmEta), designRef('assumption', ids.asmN), designRef('assumption', ids.asmLead)],
    sources: [{ module: 'external', id: 'lib.drive.screw-lead-speed-force 1.0.0 (@ews/engineering-calc)', kind: 'reference' }],
    parameters: lib.parameters.map((p) => ({
      ...p,
      ...(p.symbol === 'l' ? { defaultBinding: { ref: designRef('assumption', ids.asmLead), property: 'quantity' } } : {}),
      ...(p.symbol === 'n' ? { defaultBinding: { ref: designRef('assumption', ids.asmN), property: 'quantity' } } : {}),
      ...(p.symbol === 'T' ? { defaultBinding: { ref: designRef('assumption', ids.asmT), property: 'quantity' } } : {}),
      ...(p.symbol === 'eta' ? { defaultBinding: { ref: designRef('assumption', ids.asmEta), property: 'quantity' } } : {}),
      ...(p.symbol === 'F_req' ? { defaultBinding: { ref: designRef('constraint', ids.constraint), property: 'bound' } } : {}),
    })),
  }
  delete (modelBody as { id?: string }).id
  delete (modelBody as { revision?: number }).revision
  delete (modelBody as { key?: string }).key
  let calc: NewProjectTranscript['calculation']
  let calcBacking = service
  if (cap.calculationModels) {
    const m = await write([{ op: 'createCalculationModel', as: '$m', body: modelBody }])
    ids.model = m.ids.$m
    const env = await engine.call(run.id, 'reasoning.evaluate_calculation', { model: designRef('calculation-model', ids.model), recordAsEvidence: { subjects: [designRef('concept', ids.vise), designRef('constraint', ids.constraint)], title: 'Vise clamping force (screw thrust)' } }, engineCtx)
    const out = env.result as { outputs: Record<string, QuantityOut>; checks: CheckResult[] }
    ids.evidence = (await apply(env, editor)).results[0].ids.$ev
    calc = { outputs: out.outputs, checks: out.checks, basis: env.basis!, verifiedByService: true }
  } else {
    const local: CalculationModelRecord = { ...modelBody, id: globalThis.crypto.randomUUID(), key: 'CALC (local, not stored)', projectId: P, revision: 1, createdAt: now().toISOString(), provenance: { actor: users.editor, sourceKind: 'user', at: now().toISOString() } }
    ids.model = local.id
    const resolved = await resolveInputs(local, { knowledge, ctx: editor }, {})
    const result = evaluateModel(toDefinition(local), resolved.inputs, { now })
    const ev = await write([{ op: 'createEvidence', as: '$ev', body: { kind: 'calculation', title: 'Vise clamping force (screw thrust)', summary: result.checks.map((c) => `${c.text}: ${c.status}`).join('; '), subjects: [designRef('concept', ids.vise), designRef('constraint', ids.constraint)], basis: result.basis, manifest: result.manifest } }])
    ids.evidence = ev.ids.$ev
    calc = { outputs: result.outputs, checks: result.checks, basis: result.basis, verifiedByService: false }
    calcBacking = 'engine on inputs read from the real service; model not stored and manifest not re-verified by the service (CR-C8 pending)'
  }
  step('Calculation with pinned inputs', [
    `F = 2π·η·T/l = ${calc.outputs.F.value.toFixed(0)} N with T, η, n and l from assumptions (pinned revisions in the manifest), F_req from ${await key('constraint', ids.constraint)}`,
    `${calc.checks[0].text}: ${calc.checks[0].status} (${calc.checks[0].statusBasis}); basis ${calc.basis}; ${calc.verifiedByService ? 'manifest re-verified by the knowledge service' : 'manifest stored, not re-verified (CR-C8)'}`,
  ], calcBacking)

  // 6. Decision with the calculation as support, pinned constraint and invalidation conditions.
  const dec = await engine.call(
    run.id,
    'reasoning.record_design_decision',
    {
      alternativeSet: designRef('alternative-set', ids.set),
      title: 'Screw vise for the fixture',
      question: 'How should the fixture clamp the workpiece?',
      rationale: 'Meets the clamping force by calculation with margin, needs no air supply, simplest to make.',
      outcomes: [
        { concept: designRef('concept', ids.vise), outcome: 'accepted', rationale: 'Calculated force above the requirement' },
        { concept: designRef('concept', ids.toggle), outcome: 'rejected', rationale: 'Force depends on adjustment' },
        { concept: designRef('concept', ids.pneumatic), outcome: 'rejected', rationale: 'No compressed air at the station' },
      ],
      support: [{ ref: designRef('evidence', ids.evidence), role: 'supports' }],
      assumptions: [designRef('assumption', ids.asmT), designRef('assumption', ids.asmEta)],
      constraints: [designRef('constraint', ids.constraint)],
      invalidationConditions: [
        { kind: 'requirement-revised', subject: reqRef, description: `${req.key} is revised after revision ${req.revision}` },
        { kind: 'relation-violated', subject: cap.calculationModels ? designRef('calculation-model', ids.model) : designRef('evidence', ids.evidence), relation: { modelId: ids.model, revision: 1, relationId: 'c1' }, description: 'Screw thrust no longer covers the required force' },
      ],
    },
    engineCtx,
  )
  ids.decision = (await apply(dec, editor)).results[0].ids.$dec
  await write([{ op: 'recordDecision', body: { id: ids.decision, reason: 'Reviewed the calculation' } }], reviewer)
  step('Decision recorded', [`${await key('decision', ids.decision)} accepted the screw vise; proposed by ${users.editor} from an engine draft, recorded by ${users.reviewer}`])

  // 7. The requirement changes (Requirements API), then impact.
  const rev2 = await requirements.revise(req.id, { projectId: P, statement: 'The fixture shall hold the workpiece with a clamping force of at least 6 kN.', reason: 'Heavier cuts on the new spindle' }, req.revision, users.editor)
  step('Requirement revised', [`${rev2.key} revision ${rev2.revision}: clamping force ≥ 6 kN`], reqService)
  const reqImpactEnv = await engine.call(run.id, 'reasoning.assess_change_impact', { change: { ref: { ...reqRef, revision: rev2.revision }, description: `${rev2.key} revised to revision ${rev2.revision}`, fromRevision: req.revision }, draftFlags: true }, engineCtx)
  const requirementImpact = reqImpactEnv.result as ImpactReport
  if (reqImpactEnv.draft) await apply(reqImpactEnv, editor)
  const groups = (r: ImpactReport) => {
    const g: Record<string, string[]> = { demonstrated: [], possible: [], 'checked-unaffected': [] }
    for (const i of r.items) g[i.classification].push(i.label)
    return Object.entries(g).map(([k, v]) => `${k}: ${v.join('; ') || '—'}`)
  }
  step('Impact of the requirement revision', groups(requirementImpact))

  // 8. Re-formalization considered: what if the constraint becomes F ≥ 6 kN? (hypothetical, nothing written)
  const reformEnv = await engine.call(run.id, 'reasoning.assess_change_impact', { change: { ref: designRef('constraint', ids.constraint), description: 'Constraint re-formalized as F ≥ 6 kN (hypothetical)', hypothetical: { value: 6, unit: 'kN' } } }, engineCtx)
  const reformalizationImpact = reformEnv.result as ImpactReport
  step('Impact of re-formalizing the constraint at 6 kN (hypothetical)', groups(reformalizationImpact), cap.calculationModels ? service : `${service}; calculation re-evaluation needs the stored model (CR-C8), so it is not demonstrated here`)
  engine.completeRun(run.id)

  const decisionValidityAfter = (await knowledge.get('decision', ids.decision, editor))!.validity
  // Every reference the scenario's records and reports contain (to show there are no actuator IDs).
  const allRefs = new Set<string>()
  for (const r of [...requirementImpact.items, ...reformalizationImpact.items]) allRefs.add(refKey(r.ref))
  const graph = await knowledge.traverse({ start: [designRef('function', ids.function)], maxDepth: 6, limit: 500 }, editor)
  for (const nd of graph.nodes) allRefs.add(refKey(nd.ref))
  return {
    steps,
    ids,
    requirement: { id: req.id, key: req.key, revisions: [req.revision, rev2.revision] },
    emptyAtStart,
    calculation: calc,
    requirementImpact,
    reformalizationImpact,
    decisionValidityAfter,
    allRefs: [...allRefs],
    knowledge,
  }
}

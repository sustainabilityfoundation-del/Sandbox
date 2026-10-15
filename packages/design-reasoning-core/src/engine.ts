import { CalcError, describeRange, ERROR_TAXONOMY, evaluateModel, minBasis, qualifyManifest, type Basis } from '@ews/engineering-calc'
import { toDefinition } from './adapters/conceptualizeContractAdapter'
import { BindingError, resolveInputs } from './bindings'
import { paretoAnalysis } from './compare'
import { ConceptualizeError, type BatchItem, type ConceptualizeKnowledgeApi, type InvalidationCondition, type Quantity, type RequestContext } from './contract/conceptualize'
import { assessChangeImpact, type ImpactChange } from './impact'
import { batchOperation, type ProposalDraft, type ProposalItem } from './proposals'
import { explainSelection } from './rationale'
import { designRef, isDesignRef, refKey, type AnyRef, type DesignRef } from './refs'
import { DEFAULT_ASSISTANT_BUDGET, InMemoryRunStore, type ContextManifest, type ContextManifestItem, type ReasoningRun, type RunBudget, type ToolInvocation } from './runs'
import type { RequirementsReader, TwinSnapshot } from './sources'
import { toolDefinition, TOOLS, validateAgainst } from './tools'

/**
 * The reasoning engine's tool orchestration for assistant-driven runs (reasoning-orchestration.md §1,
 * mode "assistant-driven"): each tool call is a recorded step of a run. The engine reads through the
 * module contracts as the user, runs deterministic tools, and returns drafts; it never applies them.
 */

export interface EngineDeps {
  knowledge: ConceptualizeKnowledgeApi
  requirements?: RequirementsReader
  /** The client-attested twin snapshot attached to the current call (CR-P1). */
  twin?: () => TwinSnapshot | undefined
  store?: InMemoryRunStore
  now?: () => Date
  newId?: () => string
}

export interface ToolEnvelope<T = unknown> {
  runId: string
  stepId: string
  invocationId: string
  result: T
  basis?: Basis
  context?: { manifestId: string; items: number; omitted: number }
  warnings: string[]
  /** 'test-adapter' while the knowledge source is the in-memory contract adapter. */
  implementationStatus: 'implemented' | 'test-adapter'
  draft?: ProposalDraft
}

export class ToolCallError extends Error {
  constructor(
    readonly code: 'invalid-input' | 'not-found' | 'forbidden' | 'unit-error' | 'domain-error' | 'budget-exhausted' | 'cancelled' | 'not-implemented' | 'conflict' | 'invalid' | 'timeout' | 'resource-limit' | 'internal',
    message: string,
  ) {
    super(message)
    this.name = 'ToolCallError'
  }
}

const DRAFT_LIFETIME_MS = 7 * 24 * 3600 * 1000
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

export function createReasoningEngine(deps: EngineDeps) {
  const store = deps.store ?? new InMemoryRunStore()
  const now = () => (deps.now ?? (() => new Date()))()
  const newId = deps.newId ?? (() => globalThis.crypto.randomUUID())
  const drafts = new Map<string, ProposalDraft>()
  const implementationStatus = deps.knowledge.mode === 'test-adapter' ? ('test-adapter' as const) : ('implemented' as const)
  const adapterLabel = deps.knowledge.mode === 'test-adapter' ? ('test-adapter' as const) : undefined

  function startRun(input: { question: string; ctx: RequestContext; budget?: Partial<RunBudget> }): ReasoningRun {
    const run: ReasoningRun = {
      id: newId(),
      projectId: input.ctx.projectId,
      question: input.question,
      mode: 'assistant-driven',
      actor: input.ctx.actor,
      status: 'running',
      budget: { ...DEFAULT_ASSISTANT_BUDGET, ...input.budget },
      used: { steps: 0, toolCalls: 0, drafts: 0 },
      startedAt: now().toISOString(),
    }
    store.runs.set(run.id, run)
    return run
  }

  function cancelRun(runId: string) {
    const run = store.runs.get(runId)
    if (run && run.status === 'running') Object.assign(run, { status: 'cancelled', endedAt: now().toISOString() })
  }

  function completeRun(runId: string) {
    const run = store.runs.get(runId)
    if (run && run.status === 'running') Object.assign(run, { status: 'completed', endedAt: now().toISOString() })
  }

  function newDraft(run: ReasoningRun, stepId: string, fields: Omit<ProposalDraft, 'id' | 'runId' | 'stepId' | 'status' | 'module' | 'createdAt' | 'expiresAt' | 'operations'> & { items: BatchItem[] }): ProposalDraft {
    if (run.used.drafts >= run.budget.maxDrafts) throw new ToolCallError('budget-exhausted', `The run reached its draft budget (${run.budget.maxDrafts}).`)
    run.used.drafts++
    const id = newId()
    const { items, ...rest } = fields
    const draft: ProposalDraft = {
      ...rest,
      id,
      runId: run.id,
      stepId,
      status: 'draft',
      module: 'conceptualize',
      operations: [batchOperation(id, { items })],
      createdAt: now().toISOString(),
      expiresAt: new Date(now().getTime() + DRAFT_LIFETIME_MS).toISOString(),
    }
    drafts.set(id, draft)
    return draft
  }

  function manifest(run: ReasoningRun, stepId: string, items: ContextManifestItem[], omitted: ContextManifest['omitted'] = []): ContextManifest {
    const unique = new Map<string, ContextManifestItem>()
    for (const i of items) unique.set(`${refKey(i.ref)}@${i.revision}`, i)
    const m: ContextManifest = { id: newId(), runId: run.id, stepId, builtAt: now().toISOString(), items: [...unique.values()], omitted }
    store.manifests.push(m)
    return m
  }

  const pinned = (ref: AnyRef, revision?: number): AnyRef => (revision === undefined ? ref : { ...ref, revision })

  // ---- handlers ------------------------------------------------------------------------------------------

  type Handler = (args: Record<string, unknown>, ctx: RequestContext, run: ReasoningRun, stepId: string) => Promise<Omit<ToolEnvelope, 'runId' | 'stepId' | 'invocationId' | 'implementationStatus'>>

  const handlers: Record<string, Handler> = {
    async 'concepts.create_function'(args, _ctx, run, stepId) {
      const objectives = ((args.performanceObjectives as { name: string; direction: 'minimize' | 'maximize' | 'target'; quantity?: Quantity }[]) ?? []).map((o) => ({ ...o, basis: 'ai-hypothesis' as const }))
      const items: BatchItem[] = [{ op: 'createFunction', as: '$fn', body: { name: args.name as string, description: args.description as string | undefined, performanceObjectives: objectives, parentFunctionId: args.parentFunctionId as string | undefined } }]
      const draft = newDraft(run, stepId, {
        title: `New function: ${args.name}`,
        action: `Create the Function “${args.name}”${args.parentFunctionId ? ' as a sub-function' : ''}.`,
        rationale: 'Records what the system must accomplish independently of any solution.',
        affected: [],
        expectedEffects: ['A Function with no solution attached'],
        evidence: [],
        assumptions: [],
        uncertainty: { summary: 'Objectives proposed by the assistant are hypotheses until confirmed.' },
        requiredApprovals: [{ permission: 'author', module: 'conceptualize', reason: 'Creating design records' }],
        preview: [{ label: 'New function', proposed: args.name as string, basis: 'ai-hypothesis' }, ...objectives.map((o) => ({ label: 'Objective', proposed: `${o.name} (${o.direction}${o.quantity ? ` ${o.quantity.value ?? ''} ${o.quantity.unit}` : ''})`, basis: o.basis }))],
        items,
      })
      return { result: { draftId: draft.id }, warnings: [], draft, basis: 'ai-hypothesis' }
    },

    async 'reasoning.retrieve_design_context'(args, ctx, run, stepId) {
      const seeds = args.seeds as AnyRef[]
      const depth = { rationale: 2, alternatives: 2, 'change-impact': 4, feasibility: 2, comparison: 2, 'new-principles': 1, 'implementation-impact': 3, other: 2 }[(args.questionType as string) ?? 'other'] ?? 2
      const maxItems = (args.maxItems as number) ?? 60
      const graph = await deps.knowledge.traverse({ start: seeds, maxDepth: depth, limit: maxItems }, ctx)
      const twin = deps.twin?.()
      const items: ContextManifestItem[] = []
      const nodes = []
      for (const n of graph.nodes) {
        const isSeed = seeds.some((s) => refKey(s) === refKey(n.ref))
        if (isDesignRef(n.ref)) {
          items.push({ ref: pinned(n.ref, n.revision), revision: n.revision ?? null, via: isSeed ? 'seed' : 'graph', adapter: adapterLabel, fields: ['summary'] })
          nodes.push({ ref: n.ref, key: n.key, label: n.label, revision: n.revision, status: n.status })
        } else if (n.ref.module === 'requirements' && deps.requirements) {
          const req = await deps.requirements.get(n.ref.id, { projectId: ctx.projectId })
          items.push({ ref: pinned(n.ref, req?.revision), revision: req?.revision ?? null, via: 'requirements-api', adapter: deps.requirements.mode === 'test-fixture' ? 'test-fixture' : undefined, fields: ['title', 'statement'] })
          nodes.push({ ref: n.ref, key: req?.key, label: req ? `${req.key} ${req.title}: ${req.statement}` : n.label, revision: req?.revision, pinnedRevision: n.ref.revision })
        } else {
          const o = twin?.objects.find((x) => x.id === n.ref.id)
          items.push({ ref: pinned(n.ref, o?.revision), revision: o?.revision ?? null, via: 'client-attested', fields: o ? Object.keys(o.properties) : [] })
          nodes.push({ ref: n.ref, label: o ? `${o.id} ${o.name}` : `${n.ref.module}:${n.ref.id} (not in the attested snapshot)`, revision: o?.revision })
        }
      }
      const m = manifest(run, stepId, items, graph.truncated ? [{ count: 1, reason: 'budget' }] : [])
      return { result: { items: nodes, edges: graph.edges.map((e) => ({ type: e.type, from: refKey(e.from), to: refKey(e.to), derived: e.derived })), manifestId: m.id }, context: { manifestId: m.id, items: m.items.length, omitted: graph.truncated ? 1 : 0 }, warnings: [] }
    },

    async 'reasoning.propose_solution_concepts'(args, ctx, run, stepId) {
      const fnRef = args.function as DesignRef
      const fn = await deps.knowledge.get('function', fnRef.id, ctx)
      if (!fn) throw new ToolCallError('not-found', `Function ${fnRef.id} does not exist.`)
      const performers = (await deps.knowledge.links(ctx, { to: designRef('function', fn.id), type: 'performs' })).map((l) => l.from.id)
      const existing = (await Promise.all(performers.map((id) => deps.knowledge.get('concept', id, ctx)))).filter(Boolean).map((c) => normalize(c!.name))
      const warnings: string[] = []
      const seen = new Set(existing)
      const candidates = (args.candidates as { name: string; principle: string; summary?: string; advantages?: string[]; risks?: string[]; openQuestions?: string[] }[]).filter((c) => {
        const k = normalize(c.name)
        if (seen.has(k)) {
          warnings.push(`“${c.name}” duplicates an existing or earlier candidate for ${fn.key} and was left out.`)
          return false
        }
        seen.add(k)
        return true
      })
      if (!candidates.length) throw new ToolCallError('invalid-input', 'Every candidate duplicates an existing way to perform this function.')
      const items: BatchItem[] = candidates.map((c, i) => ({
        op: 'createConcept' as const,
        as: `$c${i}`,
        body: {
          name: c.name,
          summary: c.summary ?? '',
          abstraction: 'component' as const,
          performs: [fn.id],
          statements: [
            { kind: 'principle', text: c.principle, basis: 'ai-hypothesis' as const },
            ...(c.advantages ?? []).map((t) => ({ kind: 'note', text: `Advantage: ${t}`, basis: 'ai-hypothesis' as const })),
            ...(c.risks ?? []).map((t) => ({ kind: 'uncertainty', text: t, basis: 'ai-hypothesis' as const })),
            ...(c.openQuestions ?? []).map((t) => ({ kind: 'question', text: t, basis: 'ai-hypothesis' as const })),
          ],
        },
      }))
      items.push({ op: 'createAlternativeSet', as: '$set', body: { name: args.setName as string, question: args.question as string, functionId: fn.id, memberIds: candidates.map((_, i) => `$c${i}`) } })
      const draft = newDraft(run, stepId, {
        title: `${candidates.length} candidate concepts for ${fn.key} ${fn.name}`,
        action: `Create ${candidates.length} alternative Concepts that perform ${fn.key}, grouped in one alternative set.`,
        rationale: 'Distinct physical principles for the same function, to be compared with explicit criteria.',
        affected: [designRef('function', fn.id, fn.revision)],
        expectedEffects: candidates.map((c) => `${c.name}: performs ${fn.key}`),
        evidence: [],
        assumptions: [],
        uncertainty: { summary: 'Principles, advantages and risks are assistant hypotheses; no feasibility has been shown.' },
        requiredApprovals: [{ permission: 'author', module: 'conceptualize', reason: 'Creating design records' }],
        preview: [...candidates.map((c) => ({ label: 'New concept', proposed: `${c.name}: ${c.principle}`, basis: 'ai-hypothesis' as const })), { label: 'Alternative set', proposed: args.setName as string, basis: 'ai-hypothesis' }],
        items,
      })
      return { result: { draftId: draft.id, candidates: candidates.map((c) => c.name) }, warnings, draft, basis: 'ai-hypothesis' }
    },

    async 'reasoning.evaluate_calculation'(args, ctx, run, stepId) {
      const ref = args.model as DesignRef
      const model = await deps.knowledge.get('calculation-model', ref.id, ctx, ref.revision)
      if (!model) throw new ToolCallError('not-found', `Calculation model ${ref.id} does not exist.`)
      const values = (args.values as Record<string, Quantity>) ?? {}
      const symbols = Object.fromEntries(Object.entries(values).map(([s, q]) => [s, { ...q, source: { kind: 'literal' as const, basis: 'assumption' as const } }]))
      const resolved = await resolveInputs(model, { knowledge: deps.knowledge, ctx, twin: deps.twin?.() }, { symbols })
      const result = evaluateModel(toDefinition(model), resolved.inputs, { uncertainty: (args.uncertainty as 'point' | 'interval') ?? 'point', now })
      const m = manifest(run, stepId, [{ ref: designRef('calculation-model', model.id, model.revision), revision: model.revision, via: 'seed', adapter: adapterLabel, fields: ['relations'] }, ...resolved.items])
      let draft: ProposalDraft | undefined
      const record = args.recordAsEvidence as { subjects: DesignRef[]; title: string } | undefined
      if (record) {
        // C11: statuses say what they rest on; ranges say what kind they are.
        const checks = result.checks.map((c) => `${c.text}: ${c.status} (${c.statusBasis === 'point' ? 'at the nominal point' : c.statusBasis === 'exact-bounds' ? 'proven with exact bounds' : 'from an enclosure'}; nominal margin ${c.margin.toPrecision(4)} ${c.unit})`)
        const qualifications = qualifyManifest(result.manifest)
        const limits = ['A reproducible calculation shows that these outputs follow from this model revision and these inputs. It does not establish that the model is valid for this design (model validation status: ' + result.manifest.limits.modelValidationStatus + '), and it does not establish that any requirement is satisfied.']
        draft = newDraft(run, stepId, {
          title: `Record calculation: ${record.title}`,
          action: `Record the result of ${model.key} as ${result.basis} evidence.`,
          rationale: `Deterministic evaluation of ${model.key} revision ${model.revision} by ${result.manifest.engine.name} ${result.manifest.engine.version}; Conceptualize re-verifies the manifest before accepting it.`,
          qualifications,
          limits,
          affected: record.subjects,
          expectedEffects: checks,
          evidence: [],
          assumptions: model.assumptions.map((a) => ({ text: a.id, ref: a })),
          uncertainty: {
            summary: result.manifest.uncertainty === 'point' ? 'Point values; ranges not propagated.' : 'Ranges propagated as bounds: exact where monotonicity is proven, enclosures otherwise; sampled values are not bounds.',
            ranges: Object.values(result.outputs).flatMap((o) => (o.range.kind === 'point' ? [] : [{ name: o.symbol, min: o.range.min, max: o.range.max, unit: o.unit, kind: o.range.kind, quality: o.range.kind === 'bounds' ? o.range.quality : undefined }])),
          },
          requiredApprovals: [{ permission: 'author', module: 'conceptualize', reason: 'Recording evidence' }],
          preview: [
            { label: 'New evidence', proposed: record.title, basis: result.basis },
            ...Object.values(result.outputs).map((o) => ({ label: o.symbol, proposed: o.range.kind === 'point' ? `${o.value.toPrecision(6)} ${o.unit} (point value)` : `${o.value.toPrecision(6)} ${o.unit}; ${describeRange(o.range)} ${o.range.min.toPrecision(6)}–${o.range.max.toPrecision(6)} ${o.unit}`, basis: result.basis })),
            ...limits.map((l) => ({ label: 'Does not establish', proposed: l })),
            ...checks.map((c) => ({ label: 'Check', proposed: c, basis: result.basis })),
          ],
          items: [{ op: 'createEvidence', as: '$ev', body: { kind: 'calculation', title: record.title, summary: checks.join('; '), subjects: record.subjects, basis: result.basis, calculation: { modelId: model.id, modelRevision: model.revision, manifest: result.manifest } } }],
        })
      }
      return { result: { outputs: result.outputs, checks: result.checks, validity: result.validity, manifest: result.manifest }, basis: result.basis, warnings: [...resolved.warnings, ...result.warnings], context: { manifestId: m.id, items: m.items.length, omitted: 0 }, draft }
    },

    async 'reasoning.compare_alternatives'(args, ctx) {
      const ref = args.tradeStudy as DesignRef
      const study = await deps.knowledge.get('trade-study', ref.id, ctx)
      if (!study) throw new ToolCallError('not-found', `Trade study ${ref.id} does not exist.`)
      const weightedSum = await deps.knowledge.tradeStudyResult(study.id, ctx)
      const pareto = paretoAnalysis(study)
      const bases: Partial<Record<Basis, number>> = {}
      for (const s of study.scores) bases[s.basis] = (bases[s.basis] ?? 0) + 1
      const basis = minBasis(study.scores.map((s) => s.basis))
      const warnings = weightedSum.preliminary ? ['Preliminary: not every score is verified evidence.'] : []
      return { result: { weightedSum, pareto, bases }, basis, warnings }
    },

    async 'reasoning.record_design_decision'(args, ctx, run, stepId) {
      const setRef = args.alternativeSet as DesignRef
      const set = await deps.knowledge.get('alternative-set', setRef.id, ctx)
      if (!set) throw new ToolCallError('not-found', `Alternative set ${setRef.id} does not exist.`)
      const assumptionIds = []
      for (const a of (args.assumptions as DesignRef[]) ?? []) {
        const rec = await deps.knowledge.get('assumption', a.id, ctx)
        if (!rec) throw new ToolCallError('not-found', `Assumption ${a.id} does not exist.`)
        assumptionIds.push({ id: rec.id, revision: rec.revision })
      }
      const constraintIds = []
      for (const c of (args.constraints as DesignRef[]) ?? []) {
        const rec = await deps.knowledge.get('constraint', c.id, ctx)
        if (!rec) throw new ToolCallError('not-found', `Constraint ${c.id} does not exist.`)
        constraintIds.push({ id: rec.id, revision: rec.revision })
      }
      const support = ((args.support as { ref: DesignRef; role: 'supports' | 'contradicts' }[]) ?? []).map((s) => ({ ref: s.ref, role: s.role }))
      const evidence: ProposalDraft['evidence'] = []
      for (const s of support) {
        const ev = await deps.knowledge.get('evidence', s.ref.id, ctx)
        if (!ev) throw new ToolCallError('not-found', `Evidence ${s.ref.id} does not exist.`)
        evidence.push({ ref: s.ref, basis: ev.basis })
      }
      const outcomes = (args.outcomes as { concept: DesignRef; outcome: 'accepted' | 'rejected' | 'deferred'; rationale: string }[]).map((o) => ({ conceptId: o.concept.id, outcome: o.outcome, rationale: o.rationale }))
      const record = args.record === true
      const items: BatchItem[] = [
        {
          op: 'proposeDecision',
          as: '$dec',
          body: {
            title: args.title as string,
            question: args.question as string,
            rationale: args.rationale as string,
            setId: set.id,
            tradeStudyId: (args.tradeStudy as DesignRef | undefined)?.id,
            outcomes,
            support,
            assumptionIds,
            constraintIds,
            invalidationConditions: (args.invalidationConditions as Omit<InvalidationCondition, 'id'>[]) ?? [],
          },
        },
      ]
      if (record) items.push({ op: 'recordDecision', body: { id: '$dec', reason: 'Recorded on Apply by the reviewer' } })
      const names = new Map((await deps.knowledge.list('concept', ctx)).map((c) => [c.id, `${c.key} ${c.name}`]))
      const preview: ProposalItem[] = [
        { label: 'Decision', proposed: args.title as string, basis: 'ai-hypothesis' },
        ...outcomes.map((o) => ({ label: o.outcome, targetId: o.conceptId, proposed: `${names.get(o.conceptId) ?? o.conceptId}: ${o.rationale}`, basis: 'ai-hypothesis' as const })),
        ...evidence.map((e) => ({ label: 'Supported by', targetId: e.ref.id, proposed: refKey(e.ref), basis: e.basis })),
      ]
      const draft = newDraft(run, stepId, {
        title: `Decision: ${args.title}`,
        action: record ? 'Record the decision (accepted, rejected and deferred alternatives).' : 'Propose the decision for review.',
        rationale: args.rationale as string,
        affected: [designRef('alternative-set', set.id), ...outcomes.map((o) => designRef('concept', o.conceptId))],
        expectedEffects: outcomes.map((o) => `${names.get(o.conceptId) ?? o.conceptId} → ${o.outcome === 'accepted' ? 'selected' : o.outcome}`),
        evidence,
        assumptions: assumptionIds.map((a) => ({ text: a.id, ref: designRef('assumption', a.id, a.revision) })),
        uncertainty: { summary: evidence.some((e) => e.basis !== 'evidence') ? 'Rests on preliminary or calculated evidence, not verified results.' : 'Rests on verified evidence.' },
        requiredApprovals: record ? [{ permission: 'decide', module: 'conceptualize', reason: 'Recording accepted or rejected outcomes is an approval gate (reviewer or administrator)' }] : [{ permission: 'author', module: 'conceptualize', reason: 'Proposing a decision' }],
        preview,
        items,
      })
      return { result: { draftId: draft.id }, warnings: [], draft, basis: 'ai-hypothesis' }
    },

    async 'reasoning.assess_change_impact'(args, ctx, run, stepId) {
      const change = args.change as ImpactChange
      const report = await assessChangeImpact(change, { knowledge: deps.knowledge, ctx, twin: deps.twin?.() }, { maxDepth: args.maxDepth as number | undefined })
      for (const item of report.items) {
        if (isDesignRef(item.ref)) continue
        if (item.ref.module === 'requirements' && deps.requirements) {
          const req = await deps.requirements.get(item.ref.id, { projectId: ctx.projectId })
          if (req) item.label = `${req.key} ${req.title} (current revision ${req.revision}${item.ref.revision !== undefined ? `, formalized at ${item.ref.revision}` : ''})`
        } else {
          const o = deps.twin?.()?.objects.find((x) => x.id === item.ref.id)
          if (o) item.label = `${item.ref.module}:${o.id} ${o.name} (rev ${o.revision}, client-attested)`
        }
      }
      const m = manifest(run, stepId, report.items.map((i) => ({ ref: i.ref, revision: i.ref.revision ?? null, via: isDesignRef(i.ref) ? ('graph' as const) : i.ref.module === 'requirements' ? ('requirements-api' as const) : ('client-attested' as const), adapter: isDesignRef(i.ref) ? adapterLabel : undefined, fields: [] })))
      let draft: ProposalDraft | undefined
      if (args.draftFlags === true && report.decisionsUnderReview.length) {
        const recorded = []
        for (const r of report.decisionsUnderReview) {
          const d = await deps.knowledge.get('decision', r.id, ctx)
          if (d?.status === 'recorded') recorded.push(d)
        }
        if (recorded.length) {
          const reasonOf = (id: string) => report.items.find((i) => i.ref.id === id)?.evidence?.summary ?? change.description
          draft = newDraft(run, stepId, {
            title: `Review ${recorded.map((d) => d.key).join(', ')} after: ${change.description}`,
            action: 'Flag the decisions for review. Their rationale and outcomes are not changed; a reviewer clears the flag or invalidates the decision.',
            rationale: 'Deterministic checks show that the change breaks conditions these decisions rest on.',
            affected: recorded.map((d) => designRef('decision', d.id)),
            expectedEffects: recorded.map((d) => `${d.key}: validity valid → under-review`),
            evidence: [],
            assumptions: [],
            uncertainty: { summary: 'Possible impacts without a deterministic check are listed in the report, not flagged.' },
            requiredApprovals: [{ permission: 'author', module: 'conceptualize', reason: 'Flagging decisions for review' }],
            preview: recorded.map((d) => ({ targetId: d.id, label: 'Review flag', current: `${d.key} valid`, proposed: reasonOf(d.id), basis: 'calculated' as const })),
            items: recorded.map((d) => ({ op: 'flagDecisionForReview' as const, body: { id: d.id, reason: reasonOf(d.id), impactReportId: stepId } })),
          })
        }
      }
      return { result: report, basis: 'calculated', warnings: report.truncated ? ['The traversal was truncated.'] : [], context: { manifestId: m.id, items: m.items.length, omitted: 0 }, draft }
    },

    async 'reasoning.retrieve_design_rationale'(args, ctx, run, stepId) {
      const ref = args.concept as DesignRef
      const answer = await explainSelection(deps.knowledge, ctx, ref.id)
      const items: ContextManifestItem[] = [{ ref, revision: null, via: 'seed', adapter: adapterLabel, fields: ['name'] }, ...answer.decisions.map((d) => ({ ref: d.ref, revision: null, via: 'graph' as const, adapter: adapterLabel, fields: ['rationale', 'outcomes', 'support'] }))]
      const m = manifest(run, stepId, items)
      return { result: answer, warnings: [], context: { manifestId: m.id, items: m.items.length, omitted: 0 } }
    },
  }

  async function call(runId: string, tool: string, args: Record<string, unknown>, ctx: RequestContext): Promise<ToolEnvelope> {
    const run = store.runs.get(runId)
    if (!run) throw new ToolCallError('not-found', `Run ${runId} does not exist.`)
    if (run.status === 'cancelled') throw new ToolCallError('cancelled', `Run ${runId} was cancelled; no further steps run.`)
    if (run.status !== 'running') throw new ToolCallError('invalid', `Run ${runId} is ${run.status}.`)
    if (run.used.toolCalls >= run.budget.maxToolCalls || run.used.steps >= run.budget.maxSteps || now().getTime() - Date.parse(run.startedAt) > run.budget.maxWallMs) {
      run.status = 'budget-exhausted'
      run.endedAt = now().toISOString()
      throw new ToolCallError('budget-exhausted', `Run ${runId} exhausted its budget; completed results are kept.`)
    }
    const def = toolDefinition(tool)
    const handler = handlers[tool]
    if (!def || !handler) throw new ToolCallError('not-implemented', `No reasoning tool “${tool}”. Available: ${TOOLS.map((t) => t.name).join(', ')}.`)
    run.used.toolCalls++
    run.used.steps++
    const stepId = newId()
    const started = Date.now()
    const invocation: ToolInvocation = { id: newId(), runId, stepId, tool, toolVersion: def.version, input: structuredClone(args), ok: false, startedAt: now().toISOString(), durationMs: 0 }
    store.invocations.push(invocation)
    const stepCtx: RequestContext = { ...ctx, runId, stepId }
    try {
      const problems = validateAgainst({ ...def.inputSchema }, args)
      if (problems.length) throw new ToolCallError('invalid-input', problems.join('; '))
      const out = await handler(args, stepCtx, run, stepId)
      Object.assign(invocation, { ok: true, output: out.result, basis: out.basis, manifestId: out.context?.manifestId, durationMs: Date.now() - started })
      return { runId, stepId, invocationId: invocation.id, implementationStatus, ...out }
    } catch (e) {
      const err = toToolError(e)
      Object.assign(invocation, { ok: false, error: { code: err.code, message: err.message }, durationMs: Date.now() - started })
      throw err
    }
  }

  return { startRun, call, cancelRun, completeRun, drafts, store, tools: TOOLS }
}

function toToolError(e: unknown): ToolCallError {
  if (e instanceof ToolCallError) return e
  if (e instanceof CalcError) return new ToolCallError(ERROR_TAXONOMY[e.code].toolCode, e.message)
  if (e instanceof BindingError) return new ToolCallError('invalid-input', e.message)
  if (e instanceof ConceptualizeError) return new ToolCallError(e.code === 'not-found' ? 'not-found' : e.code === 'forbidden' ? 'forbidden' : e.code === 'conflict' ? 'conflict' : e.code === 'not-implemented' ? 'not-implemented' : 'invalid', e.message)
  return new ToolCallError('invalid', e instanceof Error ? e.message : String(e))
}

export type ReasoningEngine = ReturnType<typeof createReasoningEngine>

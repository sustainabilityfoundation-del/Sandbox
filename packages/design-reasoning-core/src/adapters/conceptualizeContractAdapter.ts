import { BASIS_RANK, ENGINE_VERSION, qualifyManifest, validateModel, verifyManifest, type Basis, type CalculationModelDefinition } from '@ews/engineering-calc'
import {
  ConceptualizeError,
  type AlternativeSetRecord,
  type AssumptionRecord,
  type AssumptionValidationStatus,
  type BatchItem,
  type BatchRequest,
  type BatchResponse,
  type CalculationVerification,
  type CalculationModelRecord,
  type ConceptRecord,
  type ConceptualizeKnowledgeApi,
  type ConstraintRecord,
  type DecisionRationale,
  type DecisionRecord,
  type DesignEvent,
  type DesignLink,
  type EvidenceRecord,
  type FunctionRecord,
  type GraphEdge,
  type GraphNode,
  type ImplementationRecord,
  type LinkInput,
  type Provenance,
  type RecordByType,
  type RequestContext,
  type TradeStudyRecord,
  type TradeStudyResult,
  type TraverseRequest,
  type TraverseResponse,
} from '../contract/conceptualize'
import { BUILT_IN_LINK_TYPES, type LinkTypeDefinition } from '../linkTypes'
import { designRef, isDesignRef, refKey, type AnyRef, type DesignRef } from '../refs'

/**
 * TEST ADAPTER — in-memory implementation of the PROPOSED Conceptualize contract (CR-C1…C10,
 * docs/modules/design-reasoning/contract-change-requests.md). It exists so that the reasoning core can
 * be validated against the contract before Conceptualize implements it in PostgreSQL. It is not a store
 * of record, has no persistence and must never be presented as the Conceptualize module.
 *
 * It enforces the contract's invariants (roles, basis promotion rules, link endpoint rules and cycles,
 * function/concept separation, calculated-evidence re-verification, atomic batches with placeholders,
 * expected revisions, idempotency) so that tests exercise the same failures the real API must produce.
 */

type Versioned<T> = T[] // revisions, oldest first

interface State {
  revision: number
  counters: Record<string, number>
  functions: Map<string, Versioned<FunctionRecord>>
  concepts: Map<string, Versioned<ConceptRecord>>
  constraints: Map<string, Versioned<ConstraintRecord>>
  assumptions: Map<string, Versioned<AssumptionRecord>>
  models: Map<string, Versioned<CalculationModelRecord>>
  evidence: Map<string, EvidenceRecord>
  decisions: Map<string, DecisionRecord>
  sets: Map<string, AlternativeSetRecord>
  studies: Map<string, TradeStudyRecord>
  implementations: Map<string, Versioned<ImplementationRecord>>
  links: DesignLink[]
  events: DesignEvent[]
  idempotency: Map<string, { hash: string; response: BatchResponse }>
}

const KEY_PREFIX: Record<keyof RecordByType, string> = {
  function: 'FN',
  concept: 'CON',
  constraint: 'CST',
  assumption: 'ASM',
  evidence: 'EVD',
  decision: 'DEC',
  'alternative-set': 'ALT',
  'trade-study': 'TS',
  implementation: 'IMP',
  'calculation-model': 'CALC',
}

const AUTHOR: string[] = ['editor', 'administrator']
const DECIDE: string[] = ['reviewer', 'administrator']
/** Bases an assistant or reasoning source may never write directly (ADR-0043). */
const PERSON_ONLY: Basis[] = ['user-assertion', 'evidence', 'decision']

export interface ConceptualizeTestAdapterOptions {
  now?: () => Date
  newId?: () => string
}

export function createConceptualizeTestAdapter(options: ConceptualizeTestAdapterOptions = {}): ConceptualizeKnowledgeApi & { readonly label: string } {
  const now = () => (options.now ?? (() => new Date()))().toISOString()
  let seq = 0
  const newId = options.newId ?? (() => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`))
  let state: State = {
    revision: 0,
    counters: {},
    functions: new Map(),
    concepts: new Map(),
    constraints: new Map(),
    assumptions: new Map(),
    models: new Map(),
    evidence: new Map(),
    decisions: new Map(),
    sets: new Map(),
    studies: new Map(),
    implementations: new Map(),
    links: [],
    events: [],
    idempotency: new Map(),
  }
  const linkTypes: LinkTypeDefinition[] = [...BUILT_IN_LINK_TYPES]

  // ---- helpers --------------------------------------------------------------------------------------------

  const fail = (code: ConceptualizeError['code'], message: string, details?: Record<string, unknown>): never => {
    throw new ConceptualizeError(code, message, details)
  }
  const nextKey = (type: keyof RecordByType, projectId: string) => {
    const k = `${projectId}:${KEY_PREFIX[type]}`
    state.counters[k] = (state.counters[k] ?? 0) + 1
    return `${KEY_PREFIX[type]}-${String(state.counters[k]).padStart(3, '0')}`
  }
  const provenance = (ctx: RequestContext, reason?: string): Provenance => ({
    actor: ctx.actor,
    sourceKind: ctx.sourceKind,
    at: now(),
    conversationId: ctx.conversationId,
    proposalId: ctx.proposalId,
    messageId: ctx.messageId,
    runId: ctx.runId,
    stepId: ctx.stepId,
    reason,
  })
  const requireRole = (ctx: RequestContext, allowed: string[], what: string) => {
    if (!allowed.includes(ctx.role)) fail('forbidden', `${what} needs the ${allowed.join(' or ')} role; ${ctx.actor} is ${ctx.role}.`)
  }
  const aiSource = (ctx: RequestContext) => ctx.sourceKind === 'assistant' || ctx.sourceKind === 'reasoning'
  const checkBasis = (ctx: RequestContext, basis: Basis, what: string) => {
    if (aiSource(ctx) && PERSON_ONLY.includes(basis)) fail('invalid', `${what}: an ${ctx.sourceKind} source may not write basis “${basis}” (ADR-0043).`)
    if (basis === 'evidence') fail('invalid', `${what}: basis “evidence” is reached only through an accepted evidence review, not written directly.`)
    if (basis === 'decision') fail('invalid', `${what}: basis “decision” is reached only through a recorded decision.`)
  }
  const emit = (ctx: RequestContext, type: string, entity: DesignRef, committedRevision: number) => {
    state.events.push({ eventId: newId(), type, projectId: ctx.projectId, entity, committedRevision, occurredAt: now(), actor: ctx.actor })
  }
  const latest = <T>(versions: Versioned<T> | undefined): T | undefined => versions?.[versions.length - 1]
  const at = <T extends { revision: number }>(versions: Versioned<T> | undefined, revision?: number): T | undefined =>
    revision === undefined ? latest(versions) : versions?.find((v) => v.revision === revision)

  function exists(ref: DesignRef): boolean {
    return getRecord(ref.type as keyof RecordByType, ref.id, ref.revision) !== undefined
  }

  function getRecord<T extends keyof RecordByType>(type: T, id: string, revision?: number): RecordByType[T] | undefined {
    const s = state
    switch (type) {
      case 'function':
        return at(s.functions.get(id), revision) as RecordByType[T] | undefined
      case 'concept':
        return at(s.concepts.get(id), revision) as RecordByType[T] | undefined
      case 'constraint':
        return at(s.constraints.get(id), revision) as RecordByType[T] | undefined
      case 'assumption':
        return at(s.assumptions.get(id), revision) as RecordByType[T] | undefined
      case 'calculation-model':
        return at(s.models.get(id), revision) as RecordByType[T] | undefined
      case 'implementation':
        return at(s.implementations.get(id), revision) as RecordByType[T] | undefined
      case 'evidence':
        return s.evidence.get(id) as RecordByType[T] | undefined
      case 'decision':
        return s.decisions.get(id) as RecordByType[T] | undefined
      case 'alternative-set':
        return s.sets.get(id) as RecordByType[T] | undefined
      case 'trade-study':
        return s.studies.get(id) as RecordByType[T] | undefined
      default:
        return undefined
    }
  }

  const requireConcept = (id: string, what: string): ConceptRecord => {
    const c = getRecord('concept', id)
    if (c) return c
    if (state.functions.has(id)) return fail('invalid', `${what}: ${latest(state.functions.get(id))!.key} is a Function, not a Concept. Functions have no implementations and are not alternatives (CR-C1).`)
    return fail('not-found', `${what}: Concept ${id} does not exist.`)
  }

  const activeLinks = (type?: string) => state.links.filter((l) => !l.removed && (!type || l.type === type))

  function wouldCycle(type: string, from: string, to: string): boolean {
    const out = new Map<string, string[]>()
    for (const l of activeLinks(type)) if (isDesignRef(l.to)) out.set(l.from.id, [...(out.get(l.from.id) ?? []), l.to.id])
    const seen = new Set([to])
    const queue = [to]
    while (queue.length) {
      const n = queue.shift()!
      if (n === from) return true
      for (const m of out.get(n) ?? []) if (!seen.has(m)) seen.add(m), queue.push(m)
    }
    return false
  }

  function addLink(input: LinkInput, ctx: RequestContext): DesignLink {
    const def = linkTypes.find((t) => t.name === input.type) ?? fail('invalid', `Unknown link type “${input.type}”.`)
    const basis = input.basis ?? (aiSource(ctx) ? 'ai-hypothesis' : 'user-assertion')
    checkBasis(ctx, basis, `Link ${input.type}`)
    if (aiSource(ctx) && !def.assistantMayAssert) fail('invalid', `An ${ctx.sourceKind} source may not assert “${def.name}” links; a person records them.`)
    if (!def.from.includes(input.from.type)) fail('invalid', `A “${def.name}” link goes from ${def.from.join('/')}, not from ${input.from.type}.`)
    if (!exists(input.from)) fail('not-found', `${input.from.type} ${input.from.id} does not exist.`)
    if (isDesignRef(input.to)) {
      if (!def.to.includes(input.to.type)) fail('invalid', `A “${def.name}” link goes to ${def.to.join('/')}, not to ${input.to.type}.`)
      if (!exists(input.to)) fail('not-found', `${input.to.type} ${input.to.id} does not exist.`)
      if (input.to.id === input.from.id) fail('invalid', 'A record cannot be linked to itself.')
      if (def.acyclic && wouldCycle(def.name, input.from.id, input.to.id)) fail('invalid', `The “${def.name}” link would create a cycle.`)
    } else {
      if (!def.to.includes('artifact')) fail('invalid', `A “${def.name}” link cannot point at an artifact of another module.`)
      if (def.artifactModules && !def.artifactModules.includes(input.to.module)) fail('invalid', `A “${def.name}” link must point at ${def.artifactModules.join('/')}, not ${input.to.module}.`)
      if (def.name === 'formalizes' && input.to.revision === undefined) fail('invalid', 'A formalized requirement must be pinned to a revision.')
    }
    const dup = activeLinks(def.name).find(
      (l) => (refKey(l.from) === refKey(input.from) && refKey(l.to) === refKey(input.to)) || (def.symmetric && refKey(l.to) === refKey(input.from) && refKey(l.from) === refKey(input.to)),
    )
    if (dup) fail('conflict', `The “${def.name}” link already exists (${dup.id}).`)
    if (def.singlePerFrom && activeLinks(def.name).some((l) => l.from.id === input.from.id)) fail('conflict', `${input.from.type} ${input.from.id} already has a “${def.name}” link.`)
    const link: DesignLink = { id: newId(), type: def.name, from: input.from, to: input.to, basis, note: input.note ?? '', removed: false, provenance: provenance(ctx) }
    state.links.push(link)
    emit(ctx, 'link.created', input.from, 1)
    return link
  }

  // ---- operations ------------------------------------------------------------------------------------------

  type Result = { id: string; key?: string; revision?: number }

  function apply(item: BatchItem, ctx: RequestContext): Result {
    switch (item.op) {
      case 'createFunction': {
        requireRole(ctx, AUTHOR, 'Creating a Function')
        const b = item.body
        if (!b.name?.trim()) fail('invalid', 'A Function needs a name.')
        for (const o of b.performanceObjectives ?? []) checkBasis(ctx, o.basis, `Objective ${o.name}`)
        const id = newId()
        const rec: FunctionRecord = {
          id, key: nextKey('function', ctx.projectId), projectId: ctx.projectId, revision: 1, createdAt: now(), provenance: provenance(ctx),
          name: b.name.trim(), description: b.description ?? '', flows: b.flows ?? [], performanceObjectives: b.performanceObjectives ?? [], classifications: b.classifications ?? [], status: 'active',
        }
        state.functions.set(id, [rec])
        emit(ctx, 'function.created', designRef('function', id), 1)
        if (b.parentFunctionId) addLink({ type: 'decomposes-into', from: designRef('function', b.parentFunctionId), to: designRef('function', id) }, ctx)
        return { id, key: rec.key, revision: 1 }
      }
      case 'createConcept': {
        requireRole(ctx, AUTHOR, 'Creating a Concept')
        const b = item.body
        if (!b.name?.trim()) fail('invalid', 'A Concept needs a name.')
        for (const s of b.statements ?? []) checkBasis(ctx, s.basis, `Statement “${s.text.slice(0, 30)}”`)
        for (const [k, a] of Object.entries(b.attributes ?? {})) checkBasis(ctx, a.basis, `Attribute ${k}`)
        const id = newId()
        const rec: ConceptRecord = {
          id, key: nextKey('concept', ctx.projectId), projectId: ctx.projectId, revision: 1, createdAt: now(), provenance: provenance(ctx),
          name: b.name.trim(), summary: b.summary ?? '', description: b.description ?? '', abstraction: b.abstraction ?? 'component', classifications: b.classifications ?? [],
          maturity: 'idea', attributes: b.attributes ?? {}, statements: b.statements ?? [],
        }
        state.concepts.set(id, [rec])
        emit(ctx, 'concept.created', designRef('concept', id), 1)
        for (const fn of b.performs ?? []) addLink({ type: 'performs', from: designRef('concept', id), to: designRef('function', fn) }, ctx)
        return { id, key: rec.key, revision: 1 }
      }
      case 'createConstraint': {
        requireRole(ctx, AUTHOR, 'Creating a constraint')
        const b = item.body
        if (!b.statement?.trim()) fail('invalid', 'A constraint needs a statement.')
        if (b.source.kind === 'stated') checkBasis(ctx, b.source.basis, 'Constraint')
        if (b.source.kind === 'requirement' && (b.source.ref.module !== 'requirements' || b.source.ref.revision === undefined)) fail('invalid', 'A constraint formalizes a requirement by a pinned Requirements reference.')
        const id = newId()
        const rec: ConstraintRecord = {
          id, key: nextKey('constraint', ctx.projectId), projectId: ctx.projectId, revision: 1, createdAt: now(), provenance: provenance(ctx),
          kind: b.kind, statement: b.statement.trim(), bound: b.bound, expression: b.expression, strength: b.strength ?? 'hard', subjects: b.subjects ?? [], source: b.source, status: b.status ?? 'active',
        }
        state.constraints.set(id, [rec])
        emit(ctx, 'constraint.created', designRef('constraint', id), 1)
        for (const s of rec.subjects) addLink({ type: 'constrains', from: designRef('constraint', id), to: s }, ctx)
        if (b.source.kind === 'requirement') addLink({ type: 'formalizes', from: designRef('constraint', id), to: b.source.ref, basis: aiSource(ctx) ? 'ai-hypothesis' : 'user-assertion' }, ctx)
        return { id, key: rec.key, revision: 1 }
      }
      case 'reviseConstraint': {
        requireRole(ctx, AUTHOR, 'Revising a constraint')
        const b = item.body
        const versions = state.constraints.get(b.id) ?? fail('not-found', `Constraint ${b.id} does not exist.`)
        const cur = latest(versions)!
        if (cur.revision !== b.expectedRevision) fail('conflict', `Constraint ${cur.key} is at revision ${cur.revision}, not ${b.expectedRevision}.`, { currentRevision: cur.revision })
        if (!b.reason?.trim()) fail('invalid', 'A constraint revision needs a reason.')
        const relaxing = b.status === 'relaxed' || b.status === 'retired'
        if (relaxing && cur.strength === 'hard' && cur.source.kind === 'requirement' && !DECIDE.includes(ctx.role)) fail('forbidden', 'Relaxing a hard constraint that formalizes a requirement needs a reviewer.')
        const next: ConstraintRecord = { ...cur, revision: cur.revision + 1, statement: b.statement ?? cur.statement, bound: b.bound ?? cur.bound, strength: b.strength ?? cur.strength, status: b.status ?? cur.status, provenance: provenance(ctx, b.reason) }
        versions.push(next)
        emit(ctx, 'constraint.revised', designRef('constraint', b.id, next.revision), next.revision)
        return { id: b.id, key: cur.key, revision: next.revision }
      }
      case 'createAssumption': {
        requireRole(ctx, AUTHOR, 'Creating an assumption')
        const b = item.body
        checkBasis(ctx, b.basis, 'Assumption')
        if (b.scope && !Array.isArray((b.scope as { subjects?: unknown }).subjects)) fail('invalid', 'An assumption scope needs subjects (may be empty).', { fields: { 'scope.subjects': 'required' } })
        for (const s of b.scope?.subjects ?? []) if (!exists(s)) fail('not-found', `Assumption subject ${s.type} ${s.id} does not exist.`)
        const id = newId()
        const rec: AssumptionRecord = {
          id, key: nextKey('assumption', ctx.projectId), projectId: ctx.projectId, revision: 1, createdAt: now(), provenance: provenance(ctx),
          statement: b.statement, quantity: b.quantity, scope: { subjects: b.scope?.subjects ?? [], applicability: b.scope?.applicability }, validationStatus: 'unvalidated', validations: [], basis: b.basis, dependsOn: b.dependsOn ?? [],
        }
        state.assumptions.set(id, [rec])
        emit(ctx, 'assumption.created', designRef('assumption', id), 1)
        return { id, key: rec.key, revision: 1 }
      }
      case 'createCalculationModel': {
        requireRole(ctx, AUTHOR, 'Creating a calculation model')
        const b = item.body
        checkBasis(ctx, b.basis, 'Calculation model')
        if (aiSource(ctx) && b.validationStatus === 'validated') fail('invalid', 'An AI-proposed calculation model starts unvalidated; a person validates it.')
        const definition: CalculationModelDefinition = { ...b, id: 'pending', revision: 1 }
        const problems = validateModel(definition)
        if (problems.length) fail('invalid', `The calculation model is not valid: ${problems.map((p) => `${p.where}: ${p.message}`).join('; ')}`, { problems })
        for (const a of b.assumptions) if (!exists(a)) fail('not-found', `Assumption ${a.id} does not exist.`)
        for (const p of b.parameters) if (p.defaultBinding && isDesignRef(p.defaultBinding.ref) && !exists(p.defaultBinding.ref)) fail('not-found', `Binding of ${p.symbol}: ${p.defaultBinding.ref.type} ${p.defaultBinding.ref.id} does not exist.`)
        const id = newId()
        const rec: CalculationModelRecord = { ...b, id, key: nextKey('calculation-model', ctx.projectId), projectId: ctx.projectId, revision: 1, createdAt: now(), provenance: provenance(ctx) }
        state.models.set(id, [rec])
        emit(ctx, 'calculation-model.created', designRef('calculation-model', id), 1)
        return { id, key: rec.key, revision: 1 }
      }
      case 'createEvidence': {
        requireRole(ctx, AUTHOR, 'Recording evidence')
        const b = item.body
        if (b.basis !== 'calculated') checkBasis(ctx, b.basis, 'Evidence')
        if (!b.subjects.length) fail('invalid', 'Evidence needs at least one subject.')
        for (const s of b.subjects) if (!exists(s)) fail('not-found', `Evidence subject ${s.type} ${s.id} does not exist.`)
        let verification: CalculationVerification | undefined
        if (b.basis === 'calculated' || b.calculation) {
          const calc = b.calculation ?? fail('invalid', 'Evidence with basis “calculated” needs the calculation model reference and its manifest (CR-C8).')
          const model = getRecord('calculation-model', calc.modelId, calc.modelRevision) ?? fail('not-found', `Calculation model ${calc.modelId} revision ${calc.modelRevision} does not exist.`)
          const verdict = verifyManifest(toDefinition(model), calc.manifest)
          if (!verdict.ok) fail('invalid', `The calculation could not be reproduced: ${verdict.reasons.join(' ')}`, { reasons: verdict.reasons })
          if (BASIS_RANK[b.basis] > BASIS_RANK[calc.manifest.basis]) fail('invalid', `The manifest supports basis “${calc.manifest.basis}”, not “${b.basis}”.`)
          verification = { verifiedAt: now(), engineVersion: ENGINE_VERSION, manifestVersion: (calc.manifest.manifestVersion ?? 1) as 1 | 2 | 3, ok: true, exactDigestMatch: verdict.exactDigestMatch }
        }
        const id = newId()
        const rec: EvidenceRecord = {
          id, key: nextKey('evidence', ctx.projectId), projectId: ctx.projectId, createdAt: now(), provenance: provenance(ctx),
          kind: b.kind, title: b.title, summary: b.summary ?? '', subjects: b.subjects, basis: b.basis, applicability: b.applicability, calculation: b.calculation ? { modelId: b.calculation.modelId, modelRevision: b.calculation.modelRevision, manifest: b.calculation.manifest, verification } : undefined, source: b.source,
          // C11: derived from the verified manifest, never from the client.
          qualifications: b.calculation ? qualifyManifest(b.calculation.manifest) : undefined,
          supersedesId: b.supersedesId, version: b.supersedesId ? (state.evidence.get(b.supersedesId)?.version ?? 0) + 1 : 1, reviews: [], validationStatus: 'unreviewed',
        }
        state.evidence.set(id, rec)
        emit(ctx, 'evidence.recorded', designRef('evidence', id), 1)
        return { id, key: rec.key }
      }
      case 'createLink': {
        requireRole(ctx, AUTHOR, 'Creating a link')
        return { id: addLink(item.body, ctx).id }
      }
      case 'createAlternativeSet': {
        requireRole(ctx, AUTHOR, 'Creating an alternative set')
        const b = item.body
        if (b.functionId && !state.functions.has(b.functionId)) fail('not-found', `Function ${b.functionId} does not exist.`)
        for (const m of b.memberIds) {
          const c = requireConcept(m, 'Alternative')
          if (b.functionId && !activeLinks('performs').some((l) => l.from.id === m && l.to.module === 'conceptualize' && l.to.id === b.functionId)) {
            fail('invalid', `${c.key} does not perform the set's Function; alternatives in one set must perform the same Function (CR-C7).`)
          }
        }
        const id = newId()
        const rec: AlternativeSetRecord = {
          id, key: nextKey('alternative-set', ctx.projectId), projectId: ctx.projectId, createdAt: now(), provenance: provenance(ctx),
          name: b.name, question: b.question, parentConceptId: b.parentConceptId, functionId: b.functionId, members: b.memberIds.map((conceptId) => ({ conceptId, status: 'candidate' })),
        }
        state.sets.set(id, rec)
        emit(ctx, 'alternative-set.created', designRef('alternative-set', id), 1)
        return { id, key: rec.key }
      }
      case 'createTradeStudy': {
        requireRole(ctx, AUTHOR, 'Creating a trade study')
        const set = state.sets.get(item.body.setId) ?? fail('not-found', `Alternative set ${item.body.setId} does not exist.`)
        if (!item.body.criteria.length) fail('invalid', 'A trade study needs criteria.')
        for (const c of item.body.criteria) if (c.scale === 'quantity' && !c.unit) fail('invalid', `Criterion ${c.name} needs a unit.`)
        const id = newId()
        const rec: TradeStudyRecord = {
          id, key: nextKey('trade-study', ctx.projectId), projectId: ctx.projectId, createdAt: now(), provenance: provenance(ctx),
          title: item.body.title, setId: set.id, revision: 1, criteria: item.body.criteria.map((c) => ({ ...c, id: newId() })), options: set.members.map((m) => m.conceptId), scores: [],
        }
        state.studies.set(id, rec)
        emit(ctx, 'trade-study.created', designRef('trade-study', id), 1)
        return { id, key: rec.key, revision: 1 }
      }
      case 'putScores': {
        requireRole(ctx, AUTHOR, 'Scoring a trade study')
        const study = state.studies.get(item.body.studyId) ?? fail('not-found', `Trade study ${item.body.studyId} does not exist.`)
        if (study.revision !== item.body.expectedRevision) fail('conflict', `Trade study ${study.key} is at revision ${study.revision}.`, { currentRevision: study.revision })
        for (const s of item.body.scores) {
          if (!study.criteria.some((c) => c.id === s.criterionId)) fail('invalid', `Unknown criterion ${s.criterionId}.`)
          if (!study.options.includes(s.conceptId)) fail('invalid', `Concept ${s.conceptId} is not an option of ${study.key}.`)
          if (s.basis === 'calculated') {
            const ev = s.evidenceId ? state.evidence.get(s.evidenceId) : undefined
            if (!ev || ev.basis !== 'calculated') fail('invalid', 'A score with basis “calculated” must reference calculated evidence.')
          } else checkBasis(ctx, s.basis, 'Score')
          if (s.qualitative !== undefined && (s.qualitative < 1 || s.qualitative > 5)) fail('invalid', 'Qualitative scores are 1–5.')
        }
        // C11: a score taken from calculated evidence carries that output's qualification, unchanged. The numbers
        // must match the evidence; client-supplied qualifications are replaced.
        const scores = item.body.scores.map(({ qualification: _ignored, ...s }) => {
          if (!s.evidenceOutput) return s
          const ev = s.evidenceId ? state.evidence.get(s.evidenceId) : undefined
          const q = ev?.qualifications ?? fail('invalid', 'A score with evidenceOutput must reference calculated evidence (evidenceId).')
          const out = q.outputs.find((o) => o.symbol === s.evidenceOutput) ?? fail('invalid', `Evidence ${ev!.key} has no output “${s.evidenceOutput}”.`)
          const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1e-300)
          if (s.value !== undefined && !near(s.value, out.value)) fail('invalid', `The score differs from ${ev!.key} ${out.symbol} = ${out.value} ${out.unit}.`)
          if (out.range.kind === 'point') {
            if (s.low !== undefined || s.high !== undefined) fail('invalid', `${ev!.key} ${out.symbol} is a point value; a score range cannot be taken from it.`)
          } else if ((s.low !== undefined || s.high !== undefined) && (!near(s.low, out.range.min) || !near(s.high, out.range.max))) {
            fail('invalid', `The score range differs from the ${out.range.kind} of ${ev!.key} ${out.symbol}.`)
          }
          return { ...s, qualification: { source: 'calculation' as const, evidenceId: ev!.id, symbol: out.symbol, kind: out.range.kind, quality: out.range.kind === 'bounds' ? out.range.quality : undefined } }
        })
        study.scores = [...study.scores.filter((x) => !scores.some((s) => s.criterionId === x.criterionId && s.conceptId === x.conceptId)), ...scores]
        study.revision++
        emit(ctx, 'trade-study.scored', designRef('trade-study', study.id), study.revision)
        return { id: study.id, key: study.key, revision: study.revision }
      }
      case 'proposeDecision': {
        requireRole(ctx, AUTHOR, 'Proposing a decision')
        const b = item.body
        if (!b.rationale?.trim()) fail('invalid', 'A decision needs a rationale.')
        const set = b.setId ? (state.sets.get(b.setId) ?? fail('not-found', `Alternative set ${b.setId} does not exist.`)) : undefined
        for (const o of b.outcomes) {
          requireConcept(o.conceptId, 'Decision outcome')
          if (set && !set.members.some((m) => m.conceptId === o.conceptId)) fail('invalid', `Concept ${o.conceptId} is not a member of ${set.key}.`)
        }
        for (const s of b.support ?? []) if (!exists(s.ref)) fail('not-found', `Supporting ${s.ref.type} ${s.ref.id} does not exist.`)
        for (const a of b.assumptionIds ?? []) if (!getRecord('assumption', a.id, a.revision)) fail('not-found', `Assumption ${a.id} revision ${a.revision} does not exist.`)
        for (const c of b.constraintIds ?? []) if (!getRecord('constraint', c.id, c.revision)) fail('not-found', `Constraint ${c.id} revision ${c.revision} does not exist.`)
        const id = newId()
        const rec: DecisionRecord = {
          id, key: nextKey('decision', ctx.projectId), projectId: ctx.projectId, createdAt: now(), provenance: provenance(ctx),
          title: b.title, question: b.question, rationale: b.rationale, setId: b.setId, subjectId: b.subjectId, tradeStudyId: b.tradeStudyId, outcomes: b.outcomes, status: 'proposed',
          support: b.support ?? [], assumptionIds: b.assumptionIds ?? [], constraintIds: b.constraintIds ?? [], affected: b.affected ?? [],
          invalidationConditions: (b.invalidationConditions ?? []).map((c) => ({ ...c, id: newId() })), reviewFlags: [], validity: 'valid', supersedesId: b.supersedesId,
        }
        state.decisions.set(id, rec)
        emit(ctx, 'decision.proposed', designRef('decision', id), 1)
        return { id, key: rec.key }
      }
      case 'recordDecision': {
        requireRole(ctx, DECIDE, 'Recording a decision (accepted or rejected outcomes)')
        const d = state.decisions.get(item.body.id) ?? fail('not-found', `Decision ${item.body.id} does not exist.`)
        if (d.status !== 'proposed') fail('conflict', `${d.key} is ${d.status}.`)
        d.status = 'recorded'
        d.recordedBy = ctx.actor
        d.recordedAt = now()
        const set = d.setId ? state.sets.get(d.setId) : undefined
        for (const o of d.outcomes) {
          const m = set?.members.find((x) => x.conceptId === o.conceptId)
          if (m) {
            m.status = o.outcome === 'accepted' ? 'selected' : o.outcome
            m.decisionId = d.id
          }
        }
        if (d.supersedesId) {
          const old = state.decisions.get(d.supersedesId)
          if (old) old.validity = 'invalidated'
        }
        emit(ctx, 'concept.decision-recorded', designRef('decision', d.id), 1)
        return { id: d.id, key: d.key }
      }
      case 'flagDecisionForReview': {
        if (!AUTHOR.includes(ctx.role) && !DECIDE.includes(ctx.role)) fail('forbidden', 'Flagging a decision needs an editor, reviewer or administrator.')
        const d = state.decisions.get(item.body.id) ?? fail('not-found', `Decision ${item.body.id} does not exist.`)
        if (d.status !== 'recorded') fail('invalid', `Only recorded decisions are flagged for review; ${d.key} is ${d.status}.`)
        if (!item.body.reason?.trim()) fail('invalid', 'A review flag needs a reason.')
        d.reviewFlags.push({ at: now(), by: ctx.actor, reason: item.body.reason, impactReportId: item.body.impactReportId })
        if (d.validity === 'valid') d.validity = 'under-review'
        emit(ctx, 'decision.review-flagged', designRef('decision', d.id), d.reviewFlags.length)
        return { id: d.id, key: d.key }
      }
      case 'createImplementation': {
        requireRole(ctx, AUTHOR, 'Creating an implementation')
        const b = item.body
        if (!b.concepts.length) fail('invalid', 'An implementation realizes at least one Concept.')
        const concepts = b.concepts.map((c) => {
          const rec = requireConcept(c.conceptId, 'Implementation')
          return { conceptId: c.conceptId, realizedConceptRevision: c.realizedConceptRevision === undefined ? rec.revision : c.realizedConceptRevision }
        })
        for (const a of b.artifacts) if ((a.module as string) === 'conceptualize') fail('invalid', 'Implementation artifacts are artifacts of other modules.')
        const id = newId()
        const rec: ImplementationRecord = {
          id, key: nextKey('implementation', ctx.projectId), projectId: ctx.projectId, revision: 1, createdAt: now(), provenance: provenance(ctx),
          name: b.name, status: b.status ?? 'candidate', concepts, artifacts: b.artifacts,
        }
        state.implementations.set(id, [rec])
        emit(ctx, 'concept.implementation-linked', designRef('implementation', id), 1)
        return { id, key: rec.key, revision: 1 }
      }
    }
  }

  /** Replaces "$name" strings anywhere in a body by the IDs created earlier in the batch. */
  function substitute<T>(value: T, ids: Record<string, string>): T {
    if (typeof value === 'string') return (value.startsWith('$') && value in ids ? ids[value] : value) as T
    if (Array.isArray(value)) return value.map((v) => substitute(v, ids)) as T
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, ids)])) as T
    return value
  }

  function graphEdges(): GraphEdge[] {
    const edges: GraphEdge[] = activeLinks().map((l) => ({ id: l.id, type: l.type, from: l.from, to: l.to, derived: false, basis: l.basis }))
    const d = (type: string, from: AnyRef, to: AnyRef, id: string): GraphEdge => ({ id, type, from, to, derived: true })
    for (const [id, versions] of state.implementations) {
      const impl = latest(versions)!
      for (const c of impl.concepts) edges.push(d('realizes', designRef('implementation', id), designRef('concept', c.conceptId), `${id}:realizes:${c.conceptId}`))
      for (const a of impl.artifacts) edges.push(d('realized-as', designRef('implementation', id), a, `${id}:realized-as:${refKey(a)}`))
    }
    for (const [id, dec] of state.decisions) {
      const from = designRef('decision', id)
      if (dec.setId) edges.push(d('decides', from, designRef('alternative-set', dec.setId), `${id}:decides`))
      for (const o of dec.outcomes) edges.push(d('selected-through', designRef('concept', o.conceptId), from, `${id}:selected-through:${o.conceptId}`))
      for (const s of dec.support) edges.push(d(s.role === 'supports' ? 'supported-by' : 'contradicted-by', from, s.ref, `${id}:support:${s.ref.id}`))
      for (const a of dec.assumptionIds) edges.push(d('decision-assumes', from, designRef('assumption', a.id, a.revision), `${id}:assumes:${a.id}`))
      for (const c of dec.constraintIds) edges.push(d('decision-constrained-by', from, designRef('constraint', c.id, c.revision), `${id}:constrained:${c.id}`))
      for (const a of dec.affected) edges.push(d('affects', from, a, `${id}:affects:${refKey(a)}`))
      for (const c of dec.invalidationConditions) edges.push(d('watches', from, c.subject, `${id}:watches:${c.id}`))
    }
    for (const [id, set] of state.sets) for (const m of set.members) edges.push(d('member', designRef('alternative-set', id), designRef('concept', m.conceptId), `${id}:member:${m.conceptId}`))
    for (const [id, versions] of state.models) {
      const m = latest(versions)!
      for (const p of m.parameters) if (p.defaultBinding) edges.push(d('binds', designRef('calculation-model', id), p.defaultBinding.ref, `${id}:binds:${p.symbol}`))
      for (const a of m.assumptions) edges.push(d('binds', designRef('calculation-model', id), a, `${id}:assumes:${a.id}`))
    }
    for (const [id, ev] of state.evidence) {
      if (ev.calculation) edges.push(d('produced-by', designRef('evidence', id), designRef('calculation-model', ev.calculation.modelId, ev.calculation.modelRevision), `${id}:produced-by`))
      for (const s of ev.subjects) edges.push(d('subject', designRef('evidence', id), s, `${id}:subject:${s.id}`))
    }
    return edges
  }

  function nodeOf(ref: AnyRef): GraphNode {
    if (!isDesignRef(ref)) return { ref, label: `${ref.module}:${ref.id}`, revision: ref.revision }
    const rec = getRecord(ref.type as keyof RecordByType, ref.id) as (RecordByType[keyof RecordByType] & { name?: string; title?: string; statement?: string; status?: string; validity?: string; revision?: number }) | undefined
    return { ref, key: rec?.key, label: rec?.name ?? rec?.title ?? rec?.statement ?? ref.id, revision: rec?.revision, status: rec?.validity ?? rec?.status }
  }

  const ctxProject = (ctx: RequestContext) => {
    if (!ctx.projectId) fail('invalid', 'projectId is required.')
  }

  return {
    mode: 'test-adapter',
    capabilities: { functionAlternativeSets: true, calculationModels: true, calculatedEvidenceVerification: true, realizedConceptRevision: true, reasoningSourceKind: true, scoreQualifications: true, events: true },
    label: 'TEST ADAPTER: in-memory implementation of the proposed Conceptualize contract (CR-C1…C10); not the Conceptualize module',

    async get(type, id, ctx, revision) {
      ctxProject(ctx)
      const rec = getRecord(type, id, revision)
      return rec && (rec as { projectId: string }).projectId === ctx.projectId ? structuredClone(rec) : undefined
    },

    async list(type, ctx) {
      ctxProject(ctx)
      const all: unknown[] = []
      const pick = (m: Map<string, unknown>) => {
        for (const v of m.values()) all.push(Array.isArray(v) ? v[v.length - 1] : v)
      }
      const map: Record<keyof RecordByType, Map<string, unknown>> = {
        function: state.functions, concept: state.concepts, constraint: state.constraints, assumption: state.assumptions, 'calculation-model': state.models,
        implementation: state.implementations, evidence: state.evidence, decision: state.decisions, 'alternative-set': state.sets, 'trade-study': state.studies,
      }
      pick(map[type])
      return structuredClone(all.filter((r) => (r as { projectId: string }).projectId === ctx.projectId)) as never
    },

    async batch(request: BatchRequest, ctx: RequestContext) {
      ctxProject(ctx)
      if (ctx.role === 'reader') fail('forbidden', `${ctx.actor} is a reader and cannot write.`)
      if (!request.idempotencyKey) fail('invalid', 'A batch needs an Idempotency-Key.')
      const hash = JSON.stringify(request.items)
      const idemKey = `${ctx.actor}:${request.idempotencyKey}`
      const seen = state.idempotency.get(idemKey)
      if (seen) {
        if (seen.hash !== hash) fail('conflict', 'The Idempotency-Key was already used for a different request.')
        return structuredClone(seen.response)
      }
      const before = structuredClone(state)
      try {
        const ids: Record<string, string> = {}
        const results: BatchResponse['results'] = []
        for (const raw of request.items) {
          const item = substitute(raw, ids)
          const r = apply(item, ctx)
          if (raw.as) {
            if (!raw.as.startsWith('$')) fail('invalid', `Placeholder “${raw.as}” must start with “$”.`)
            ids[raw.as] = r.id
          }
          results.push({ op: raw.op, ...r })
        }
        state.revision++
        const response: BatchResponse = { ids, results }
        state.idempotency.set(idemKey, { hash, response: structuredClone(response) })
        return response
      } catch (e) {
        state = before // atomic: nothing of a failed batch remains
        throw e
      }
    },

    async linkTypes() {
      return structuredClone(linkTypes)
    },

    async links(ctx, filter = {}) {
      ctxProject(ctx)
      return structuredClone(activeLinks(filter.type).filter((l) => (!filter.from || refKey(l.from) === refKey(filter.from)) && (!filter.to || refKey(l.to) === refKey(filter.to))))
    },

    async traverse(request: TraverseRequest, ctx: RequestContext): Promise<TraverseResponse> {
      ctxProject(ctx)
      if (request.asOf) fail('not-implemented', 'The test adapter reads the current state only (asOf is part of the contract but not emulated).')
      const maxDepth = Math.min(Math.max(request.maxDepth ?? 3, 1), 6)
      const limit = Math.min(request.limit ?? 500, 500)
      const edges = graphEdges()
      const allowed = (e: GraphEdge, dir: 'in' | 'out') =>
        !request.follow || request.follow.some((f) => f.type === e.type && (f.direction === 'both' || f.direction === dir))
      const nodes = new Map<string, AnyRef>()
      const usedEdges = new Map<string, GraphEdge>()
      let frontier = request.start.map((r) => refKey(r))
      for (const r of request.start) nodes.set(refKey(r), r)
      let truncated = false
      for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
        const next: string[] = []
        for (const key of frontier) {
          for (const e of edges) {
            const out = refKey(e.from) === key && allowed(e, 'out')
            const inn = refKey(e.to) === key && allowed(e, 'in')
            if (!out && !inn) continue
            usedEdges.set(e.id, e)
            const other = out ? e.to : e.from
            const k = refKey(other)
            if (!nodes.has(k)) {
              if (nodes.size >= limit) {
                truncated = true
                continue
              }
              nodes.set(k, other)
              next.push(k)
            }
          }
        }
        frontier = next
      }
      const nodeList = [...nodes.values()].map(nodeOf).filter((n) => !request.nodeTypes || request.nodeTypes.includes(isDesignRef(n.ref) ? n.ref.type : 'artifact'))
      return { nodes: structuredClone(nodeList), edges: structuredClone([...usedEdges.values()]), truncated, builtFrom: { at: now(), revision: state.revision } }
    },

    async tradeStudyResult(studyId, ctx) {
      ctxProject(ctx)
      const study = state.studies.get(studyId) ?? fail('not-found', `Trade study ${studyId} does not exist.`)
      return evaluateTradeStudy(study)
    },

    async decisionRationale(decisionId, ctx) {
      ctxProject(ctx)
      const decision = state.decisions.get(decisionId) ?? fail('not-found', `Decision ${decisionId} does not exist.`)
      const set = decision.setId ? state.sets.get(decision.setId) : undefined
      const study = decision.tradeStudyId ? state.studies.get(decision.tradeStudyId) : undefined
      const rationale: DecisionRationale = {
        decision,
        set,
        tradeStudy: study ? { study, result: evaluateTradeStudy(study) } : undefined,
        support: decision.support.map((s) => ({ ...s, evidence: s.ref.type === 'evidence' ? state.evidence.get(s.ref.id) : undefined })),
        assumptions: decision.assumptionIds.map((a) => getRecord('assumption', a.id) ?? fail('not-found', `Assumption ${a.id} missing.`)),
        constraints: decision.constraintIds.map((c) => getRecord('constraint', c.id) ?? fail('not-found', `Constraint ${c.id} missing.`)),
      }
      return structuredClone(rationale)
    },

    async reviewEvidence(id, review, ctx) {
      ctxProject(ctx)
      requireRole(ctx, DECIDE, 'Reviewing evidence')
      const ev = state.evidence.get(id) ?? fail('not-found', `Evidence ${id} does not exist.`)
      ev.reviews.push({ ...review, reviewer: ctx.actor, at: now() })
      ev.validationStatus = review.outcome
      emit(ctx, 'evidence.reviewed', designRef('evidence', id), ev.reviews.length)
      return structuredClone(ev)
    },

    async setAssumptionValidation(id, input: { status: AssumptionValidationStatus; reason: string; evidence?: DesignRef }, ctx) {
      ctxProject(ctx)
      const versions = state.assumptions.get(id) ?? fail('not-found', `Assumption ${id} does not exist.`)
      const cur = latest(versions)!
      if (input.status === 'validated' && !input.evidence) fail('invalid', 'Validating an assumption needs an evidence reference.')
      const usedByRecorded = [...state.decisions.values()].some((d) => d.status === 'recorded' && d.assumptionIds.some((a) => a.id === id))
      if ((input.status === 'validated' || input.status === 'invalidated') && usedByRecorded) requireRole(ctx, DECIDE, 'Validating or invalidating an assumption used by a recorded decision')
      else requireRole(ctx, [...AUTHOR, ...DECIDE], 'Changing assumption validation')
      if (aiSource(ctx) && input.status === 'validated') fail('invalid', 'An assistant or reasoning source cannot validate an assumption; a person does.')
      const next: AssumptionRecord = { ...cur, revision: cur.revision + 1, validationStatus: input.status, validations: [...cur.validations, { status: input.status, by: ctx.actor, at: now(), reason: input.reason, evidence: input.evidence }], provenance: provenance(ctx, input.reason) }
      versions.push(next)
      emit(ctx, 'assumption.validation-changed', designRef('assumption', id, next.revision), next.revision)
      return structuredClone(next)
    },

    async events(ctx) {
      ctxProject(ctx)
      return structuredClone(state.events.filter((e) => e.projectId === ctx.projectId))
    },
  }
}

/** Calculation model record → engine definition at that revision. */
export function toDefinition(model: CalculationModelRecord): CalculationModelDefinition {
  return {
    id: model.id,
    key: model.key,
    revision: model.revision,
    name: model.name,
    description: model.description,
    grammar: model.grammar,
    parameters: model.parameters.map(({ defaultBinding: _b, ...p }) => p),
    relations: model.relations,
    validity: model.validity,
    basis: model.basis,
    validationStatus: model.validationStatus,
  }
}

/**
 * Weighted-sum trade-study result, following the method Conceptualize documents and computes
 * server-side (services/conceptualize/src/domain/tradeStudy.ts on its branch): normalization over the
 * span of the options, qualitative 1–5 → 0–1, interval bounds, coverage, robustness, preliminary flag.
 * Emulated here because the adapter stands in for that API.
 */
export function evaluateTradeStudy(study: TradeStudyRecord): TradeStudyResult {
  const method = 'Weighted sum of normalized scores (0–1, 1 = best); quantities normalized over the span of all options; qualitative 1–5 → 0–1; ranges as interval bounds (test-adapter emulation of the Conceptualize computation).'
  const totalWeight = study.criteria.reduce((s, c) => s + c.weight, 0) || 1
  const interval = (s: { value?: number; low?: number; high?: number; qualitative?: number }): [number, number] | null =>
    s.qualitative !== undefined ? [(s.qualitative - 1) / 4, (s.qualitative - 1) / 4] : s.low !== undefined && s.high !== undefined ? [s.low, s.high] : s.value !== undefined ? [s.value, s.value] : null
  const options = study.options.map((conceptId) => {
    let lo = 0
    let hi = 0
    let weight = 0
    const missing: string[] = []
    for (const c of study.criteria) {
      const score = study.scores.find((s) => s.criterionId === c.id && s.conceptId === conceptId)
      const iv = score ? interval(score) : null
      if (!iv) {
        missing.push(c.name)
        continue
      }
      let nlo = iv[0]
      let nhi = iv[1]
      if (c.scale === 'quantity') {
        const all = study.scores.filter((s) => s.criterionId === c.id).map(interval).filter((x): x is [number, number] => !!x)
        const min = Math.min(...all.map((x) => x[0]))
        const max = Math.max(...all.map((x) => x[1]))
        const span = max - min
        const norm = (v: number) => (span === 0 ? 1 : c.direction === 'maximize' ? (v - min) / span : (max - v) / span)
        ;[nlo, nhi] = c.direction === 'maximize' ? [norm(iv[0]), norm(iv[1])] : [norm(iv[1]), norm(iv[0])]
      } // qualitative 1–5 already means very poor … very good, whatever the direction
      lo += c.weight * nlo
      hi += c.weight * nhi
      weight += c.weight
    }
    return { conceptId, low: weight ? lo / weight : null, high: weight ? hi / weight : null, score: weight ? (lo + hi) / 2 / weight : null, coverage: weight / totalWeight, missing, rank: null as number | null }
  })
  const scored = options.filter((o) => o.score !== null).sort((a, b) => b.score! - a.score!)
  scored.forEach((o, i) => (o.rank = i + 1))
  const incomplete = options.some((o) => o.coverage < 1)
  const best = scored[0]
  const intervalsSeparate = scored.length >= 2 && scored.slice(1).every((o) => best.low! > o.high!)
  // C11: count how the score ranges are qualified; a sampled range is not a bound and cannot prove robustness.
  const q = { points: 0, exactBounds: 0, enclosures: 0, sampledRanges: 0, statedRanges: 0 }
  for (const s of study.scores) {
    if (s.qualification?.kind === 'sampled-range') q.sampledRanges++
    else if (s.qualification?.kind === 'bounds') s.qualification.quality === 'exact' ? q.exactBounds++ : q.enclosures++
    else if (s.low !== undefined && s.high !== undefined && s.low !== s.high) q.statedRanges++
    else q.points++
  }
  const robust = intervalsSeparate && q.sampledRanges === 0
  const robustnessNote = intervalsSeparate && q.sampledRanges ? 'The score ranges separate, but some are sampled ranges (not bounds), so robustness is not proven.' : undefined
  return {
    options,
    ranking: incomplete ? 'incomplete' : robust ? 'robust' : 'uncertain',
    preliminary: !study.scores.length || study.scores.some((s) => s.basis !== 'evidence'),
    method,
    qualifications: { ...q, ...(robustnessNote ? { robustnessNote } : {}) },
  }
}

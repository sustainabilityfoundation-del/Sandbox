import { qualifyManifest } from '@ews/engineering-calc'
import type { RequirementSummary } from '@ews/platform-sdk'
import {
  ConceptualizeError,
  type AlternativeSetRecord,
  type AssumptionRecord,
  type BatchRequest,
  type BatchResponse,
  type ConceptRecord,
  type ConceptualizeKnowledgeApi,
  type ConstraintRecord,
  type DecisionRationale,
  type DecisionRecord,
  type DesignLink,
  type EvidenceRecord,
  type FunctionRecord,
  type ImplementationRecord,
  type KnowledgeCapabilities,
  type Provenance,
  type RecordByType,
  type RequestContext,
  type TradeStudyRecord,
  type TradeStudyResult,
  type TraverseResponse,
} from '../contract/conceptualize'
import type { LinkTypeDefinition } from '../linkTypes'
import type { AnyRef, DesignRef } from '../refs'
import type { RequirementsReader, RequirementsWriter } from '../sources'

/**
 * HTTP binding of the knowledge contract to the REAL Conceptualize API (`/api/concepts/v1`). The transport is
 * injected (fetch in a service, Fastify inject in tests), so the core stays framework-free.
 *
 * It translates only what the contract defines as equivalent: writes go through `POST …/batch` with the R1
 * operation names (Conceptualize publishes the mapping as `x-r1-operation`), reads map the DTOs to the contract
 * records. Where the service does not implement part of the contract yet, the request goes through unchanged and
 * the service's answer (often 501) surfaces; `capabilities` says so in advance. It never emulates missing
 * features.
 */
export interface HttpResponse {
  status: number
  body: unknown
}
export type HttpTransport = (request: { method: 'GET' | 'POST' | 'PATCH'; path: string; body?: unknown; headers: Record<string, string> }) => Promise<HttpResponse>

/** What the Conceptualize service on main implements of the contract (checked by the dual-run tests). */
export const CONCEPTUALIZE_API_CAPABILITIES: KnowledgeCapabilities = {
  functionAlternativeSets: false, // CR-C7: alternative sets for a Function (501); v1 sets need a parent Concept
  calculationModels: false, // CR-C8 (501)
  calculatedEvidenceVerification: false, // CR-C8: `calculation` refused (501); a bare manifest is stored without re-verification
  realizedConceptRevision: false, // CR-C11 (501)
  reasoningSourceKind: false, // CR-C13: X-Source-Kind 'reasoning', run and step IDs not recorded
  scoreQualifications: false, // C11 storage contract (evidenceOutput, qualification) not yet implemented
  events: false, // SSE stream exists, not bound here
}

const DEFAULT_BASE = '/api/concepts/v1'
/** POST operations that only read (no provenance headers). */
const READ_ONLY_POSTS = new Set(['/graph/traverse', '/graph/paths'])
let seq = 0

export function createConceptualizeHttpAdapter(options: { transport: HttpTransport; basePath?: string; idempotencyPrefix?: string }): ConceptualizeKnowledgeApi & { readonly label: string } {
  const base = options.basePath ?? DEFAULT_BASE
  const prefix = options.idempotencyPrefix ?? `drc-${Date.now().toString(36)}`

  const headersFor = (ctx: RequestContext, write: boolean): Record<string, string> => {
    const h: Record<string, string> = { 'x-dev-user': ctx.actor }
    if (!write) return h
    // CR-C13 not on the service: reasoning-sourced writes are recorded as assistant writes of the proposal.
    const kind = ctx.sourceKind === 'reasoning' ? 'assistant' : ctx.sourceKind === 'system' ? 'import' : ctx.sourceKind
    h['x-source-kind'] = kind
    if (ctx.conversationId) h['x-conversation-id'] = ctx.conversationId
    if (ctx.proposalId) h['x-proposal-id'] = ctx.proposalId
    if (ctx.messageId) h['x-message-id'] = ctx.messageId
    return h
  }

  async function call<T>(ctx: RequestContext, method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, extra: Record<string, string> = {}): Promise<T> {
    const res = await options.transport({ method, path: `${base}/projects/${encodeURIComponent(ctx.projectId)}${path}`, body, headers: { ...headersFor(ctx, method !== 'GET' && !READ_ONLY_POSTS.has(path)), ...extra } })
    if (res.status >= 200 && res.status < 300) return res.body as T
    const err = (res.body as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })?.error
    const code: ConceptualizeError['code'] = res.status === 404 ? 'not-found' : res.status === 409 ? 'conflict' : res.status === 403 || res.status === 401 ? 'forbidden' : res.status === 501 ? 'not-implemented' : 'invalid'
    throw new ConceptualizeError(code, err?.message ?? `HTTP ${res.status}`, { status: res.status, ...(err?.details ?? {}) })
  }
  const getOrUndefined = async <T>(ctx: RequestContext, path: string): Promise<T | undefined> => {
    try {
      return await call<T>(ctx, 'GET', path)
    } catch (e) {
      if (e instanceof ConceptualizeError && e.code === 'not-found') return undefined
      throw e
    }
  }
  const items = <T>(body: unknown): T[] => (Array.isArray(body) ? body : ((body as { items?: T[] })?.items ?? [])) as T[]

  // ---- DTO → contract records -----------------------------------------------------------------------------------
  type Dto = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const prov = (d: Dto): Provenance => ({ actor: d.revisionCreatedBy ?? d.createdBy ?? d.proposedBy ?? '', sourceKind: d.provenance?.sourceKind ?? 'user', at: d.revisionCreatedAt ?? d.createdAt ?? d.proposedAt ?? '', conversationId: d.provenance?.conversationId ?? undefined, proposalId: d.provenance?.proposalId ?? undefined, messageId: d.provenance?.messageId ?? undefined })
  const nn = <T>(v: T | null | undefined) => (v === null ? undefined : v)
  const quantity = (q: Dto | null | undefined) => (q ? { ...(q.value != null ? { value: q.value } : {}), ...(q.min != null ? { min: q.min } : {}), ...(q.max != null ? { max: q.max } : {}), unit: q.unit } : undefined)
  const pin = (r: Dto) => ({ id: r.id, revision: r.revision })

  const map: { [K in keyof RecordByType]: (d: Dto) => RecordByType[K] } = {
    function: (d): FunctionRecord => ({ id: d.id, key: d.key, projectId: d.projectId, revision: d.revision, createdAt: d.createdAt, provenance: prov(d), name: d.name, description: d.description, flows: d.flows.map((f: Dto) => ({ ...f, quantity: quantity(f.quantity) })), performanceObjectives: d.performanceObjectives.map((o: Dto) => ({ ...o, quantity: quantity(o.quantity), basis: o.basis ?? 'user-assertion' })), classifications: d.classifications, status: d.status }),
    concept: (d): ConceptRecord => ({ id: d.id, key: d.key, projectId: d.projectId, revision: d.revision, createdAt: d.createdAt, provenance: prov(d), name: d.name, summary: d.summary, description: d.description, abstraction: d.abstraction, classifications: d.classifications, maturity: d.maturity, attributes: Object.fromEntries(Object.entries(d.attributes ?? {}).map(([k, a]) => [k, { ...quantity(a as Dto)!, basis: (a as Dto).basis ?? 'user-assertion' }])), statements: (d.statements ?? []).map((s: Dto) => ({ kind: s.kind, text: s.text, basis: s.basis })) }),
    constraint: (d): ConstraintRecord => ({ id: d.id, key: d.key, projectId: d.projectId, revision: d.revision, createdAt: d.createdAt, provenance: prov(d), kind: d.kind, statement: d.statement, bound: d.bound ? { ...d.bound, quantity: quantity(d.bound.quantity)! } : undefined, expression: nn(d.expression), strength: d.strength, subjects: d.subjects, source: d.source.kind === 'stated' ? { kind: 'stated', basis: d.source.basis ?? d.basis } : d.source, status: d.status }),
    assumption: (d): AssumptionRecord => ({ id: d.id, key: d.key, projectId: d.projectId, revision: d.revision, createdAt: d.createdAt, provenance: prov(d), statement: d.statement, quantity: quantity(d.quantity), scope: { subjects: d.scope.subjects, applicability: d.scope.applicability || undefined }, validationStatus: d.validationStatus, validations: d.validations.map((v: Dto) => ({ status: v.toStatus ?? v.status, by: v.by ?? v.actor, at: v.at ?? v.occurredAt, reason: v.reason, evidence: v.evidence })), basis: d.basis, dependsOn: d.dependsOn, origin: nn(d.origin) }),
    evidence: (d): EvidenceRecord => ({
      id: d.id, key: d.key, projectId: d.projectId, createdAt: d.createdAt, provenance: prov(d), kind: d.kind, title: d.title, summary: d.summary, subjects: d.subjects, basis: d.basis,
      applicability: typeof d.applicability === 'string' ? d.applicability || undefined : JSON.stringify(d.applicability), source: nn(d.source), supersedesId: nn(d.supersedesId), version: d.version ?? 1,
      reviews: (d.reviews ?? []).map((r: Dto) => ({ outcome: r.outcome, reviewer: r.reviewer, at: r.reviewedAt, method: r.method, note: r.note })), validationStatus: d.validationStatus,
      // Interim (CR-C8 not on the service): a bare manifest is stored without a model reference or re-verification.
      ...(d.calculation ? { calculation: d.calculation } : {}),
      ...(d.qualifications ? { qualifications: d.qualifications } : d.manifest?.engine ? { qualifications: qualifyManifest(d.manifest), interimManifest: d.manifest } : {}),
    }),
    decision: (d): DecisionRecord => ({ id: d.id, key: d.key, projectId: d.projectId, createdAt: d.proposedAt, provenance: prov(d), title: d.title, question: d.question, rationale: d.rationale, setId: nn(d.setId), subjectId: nn(d.subjectId), tradeStudyId: nn(d.tradeStudyId), outcomes: d.outcomes.map((o: Dto) => ({ conceptId: o.conceptId, outcome: o.outcome, rationale: o.rationale ?? '' })), status: d.status, support: d.support, assumptionIds: d.assumptionIds.map(pin), constraintIds: d.constraintIds.map(pin), affected: d.affected, invalidationConditions: d.invalidationConditions, reviewFlags: d.reviewFlags, validity: d.validity, recordedBy: nn(d.recordedBy), recordedAt: nn(d.recordedAt), supersedesId: nn(d.supersedesId) }),
    'alternative-set': (d): AlternativeSetRecord => ({ id: d.id, key: d.key, projectId: d.projectId ?? '', createdAt: d.createdAt, provenance: prov(d), name: d.name, question: d.question, parentConceptId: nn(d.parentId), functionId: nn(d.functionId), members: d.members.map((m: Dto) => ({ conceptId: m.conceptId, status: m.status, decisionId: nn(m.decisionId) })) }),
    'trade-study': (d): TradeStudyRecord => ({ id: d.id, key: d.key, projectId: d.projectId ?? '', createdAt: d.createdAt, provenance: prov(d), title: d.title, setId: d.setId, revision: d.revision, criteria: d.criteria.map((c: Dto) => ({ ...c, unit: nn(c.unit) })), options: d.options, scores: d.scores.map((s: Dto) => ({ criterionId: s.criterionId, conceptId: s.conceptId, value: nn(s.value), low: nn(s.low), high: nn(s.high), qualitative: nn(s.qualitative), basis: s.basis, rationale: s.rationale, evidenceId: nn(s.evidenceId), evidenceOutput: nn(s.evidenceOutput), qualification: nn(s.qualification) })) }),
    implementation: (d): ImplementationRecord => ({ id: d.id, key: d.key, projectId: d.projectId ?? '', revision: d.revision, createdAt: d.createdAt, provenance: prov(d), name: d.name, status: d.status, concepts: (d.concepts ?? d.conceptIds.map((c: string) => ({ conceptId: c, realizedConceptRevision: null }))).map((c: Dto) => ({ conceptId: c.conceptId, realizedConceptRevision: c.realizedConceptRevision ?? null })), artifacts: d.artifacts.filter((a: Dto) => !a.removed).map((a: Dto) => ({ module: a.module, id: a.artifactId, ...(a.revision != null ? { revision: a.revision } : {}), ...(a.kind ? { kind: a.kind } : {}) })) }),
    'calculation-model': (d) => d as RecordByType['calculation-model'],
  }
  const PATH: Record<keyof RecordByType, string> = {
    function: 'functions', concept: 'concepts', constraint: 'constraints', assumption: 'assumptions', evidence: 'evidence', decision: 'decisions',
    'alternative-set': 'alternative-sets', 'trade-study': 'trade-studies', implementation: 'implementations', 'calculation-model': 'calculation-models',
  }

  async function get<T extends keyof RecordByType>(type: T, id: string, ctx: RequestContext, revision?: number): Promise<RecordByType[T] | undefined> {
    if (type === 'calculation-model') return undefined // CR-C8 not on the service
    const d = await getOrUndefined<Dto>(ctx, `/${PATH[type]}/${encodeURIComponent(id)}${revision !== undefined ? `?revision=${revision}` : ''}`)
    if (!d) return undefined
    const record = map[type]({ projectId: ctx.projectId, ...d })
    return record
  }

  async function list<T extends keyof RecordByType>(type: T, ctx: RequestContext): Promise<RecordByType[T][]> {
    if (type === 'calculation-model') return []
    const rows = items<Dto>(await call<unknown>(ctx, 'GET', type === 'concept' ? '/concepts?limit=200' : `/${PATH[type]}`))
    const out: RecordByType[T][] = []
    for (const r of rows) {
      const full = await get(type, r.id, ctx)
      if (full) out.push(full)
    }
    return out
  }

  async function study(ctx: RequestContext, id: string): Promise<{ record: TradeStudyRecord; result: Dto }> {
    const d = await call<Dto>(ctx, 'GET', `/trade-studies/${encodeURIComponent(id)}`)
    return { record: map['trade-study']({ projectId: ctx.projectId, ...d }), result: d.result }
  }

  function qualificationCounts(scores: TradeStudyRecord['scores']): TradeStudyResult['qualifications'] {
    const q = { points: 0, exactBounds: 0, enclosures: 0, sampledRanges: 0, statedRanges: 0 }
    for (const s of scores) {
      if (s.qualification?.kind === 'sampled-range') q.sampledRanges++
      else if (s.qualification?.kind === 'bounds') s.qualification.quality === 'exact' ? q.exactBounds++ : q.enclosures++
      else if (s.low !== undefined && s.high !== undefined && s.low !== s.high) q.statedRanges++
      else q.points++
    }
    return q
  }

  return {
    mode: 'api',
    label: 'Conceptualize API (HTTP binding of the knowledge contract)',
    capabilities: CONCEPTUALIZE_API_CAPABILITIES,
    get,
    list,

    async batch(request: BatchRequest, ctx: RequestContext): Promise<BatchResponse> {
      const res = await call<{ results: { op: string; id: string; key: string | null; revision: number | null }[]; ids: Record<string, string> }>(ctx, 'POST', '/batch', { items: request.items }, { 'idempotency-key': request.idempotencyKey || `${prefix}-${++seq}` })
      return { ids: res.ids, results: res.results.map((r) => ({ op: r.op as BatchResponse['results'][number]['op'], id: r.id, ...(r.key ? { key: r.key } : {}), ...(r.revision != null ? { revision: r.revision } : {}) })) }
    },

    async linkTypes(ctx) {
      return items<Dto>(await call<unknown>(ctx, 'GET', '/link-types')).map(
        (t): LinkTypeDefinition => ({ name: t.name, from: t.fromTypes, to: t.toTypes, inverse: t.inverse, meaning: t.description, acyclic: t.acyclic, symmetric: t.symmetric, assistantMayAssert: t.assistantAssertable, propagation: t.propagation, ...(t.artifactModules ? { artifactModules: t.artifactModules } : {}) }),
      )
    },

    async links(ctx, filter = {}) {
      const all = items<Dto>(await call<unknown>(ctx, 'GET', '/design-links'))
      const key = (r: AnyRef) => (r.module === 'conceptualize' ? `${r.type}:${r.id}` : `${r.module}:${r.id}`)
      return all
        .filter((l) => !l.removed && (!filter.type || l.type === filter.type) && (!filter.from || key(l.from) === key(filter.from)) && (!filter.to || key(l.to) === key(filter.to)))
        .map((l): DesignLink => ({ id: l.id, type: l.type, from: l.from, to: l.to, basis: l.basis, note: l.note, removed: l.removed, provenance: { actor: l.createdBy, sourceKind: l.provenance?.sourceKind ?? 'user', at: l.createdAt } }))
    },

    async traverse(request, ctx): Promise<TraverseResponse> {
      const r = await call<Dto>(ctx, 'POST', '/graph/traverse', request)
      return {
        nodes: r.nodes.map((n: Dto) => ({ ref: n.ref, key: n.key || undefined, label: n.label, revision: nn(n.revision), status: n.status || undefined })),
        edges: r.edges.map((e: Dto) => ({ id: e.id, type: e.type, from: e.from, to: e.to, derived: e.derived, basis: nn(e.basis) })),
        truncated: r.truncated,
        builtFrom: { at: r.builtFrom.at, revision: r.builtFrom.revision },
      }
    },

    async tradeStudyResult(studyId, ctx) {
      const { record, result } = await study(ctx, studyId)
      // C11 qualification counts: the service does not report them yet; counted here from the stored scores.
      return { options: result.options, ranking: result.ranking, preliminary: result.preliminary, method: result.method, qualifications: qualificationCounts(record.scores) }
    },

    async decisionRationale(decisionId, ctx): Promise<DecisionRationale> {
      const decision = (await get('decision', decisionId, ctx)) ?? (() => { throw new ConceptualizeError('not-found', `Decision ${decisionId} does not exist.`) })()
      const set = decision.setId ? await get('alternative-set', decision.setId, ctx) : undefined
      const ts = decision.tradeStudyId ? await study(ctx, decision.tradeStudyId) : undefined
      const support = []
      for (const s of decision.support) support.push({ ...s, evidence: s.ref.type === 'evidence' ? await get('evidence', s.ref.id, ctx) : undefined })
      const assumptions: AssumptionRecord[] = []
      for (const a of decision.assumptionIds) {
        const r = await get('assumption', a.id, ctx)
        if (r) assumptions.push(r)
      }
      const constraints: ConstraintRecord[] = []
      for (const c of decision.constraintIds) {
        const r = await get('constraint', c.id, ctx)
        if (r) constraints.push(r)
      }
      return { decision, set, tradeStudy: ts ? { study: ts.record, result: { ...(ts.result as TradeStudyResult), qualifications: qualificationCounts(ts.record.scores) } } : undefined, support, assumptions, constraints }
    },

    async reviewEvidence(id, review, ctx) {
      await call(ctx, 'POST', `/evidence/${encodeURIComponent(id)}/reviews`, review, { 'idempotency-key': `${prefix}-${++seq}` })
      return (await get('evidence', id, ctx))!
    },

    async setAssumptionValidation(id, input, ctx) {
      await call(ctx, 'POST', `/assumptions/${encodeURIComponent(id)}/validation`, input, { 'idempotency-key': `${prefix}-${++seq}` })
      return (await get('assumption', id, ctx))!
    },

    async events() {
      throw new ConceptualizeError('not-implemented', 'Events are delivered by the service over SSE; this binding does not subscribe.')
    },
  }
}

/** HTTP reader of the Requirements service (SDK RequirementsService subset `get`). */
export function createRequirementsHttpReader(options: { transport: HttpTransport; user: string; basePath?: string }): RequirementsReader {
  const base = options.basePath ?? '/api/requirements/v1'
  return {
    mode: 'api',
    async get(id, scope) {
      const res = await options.transport({ method: 'GET', path: `${base}/projects/${encodeURIComponent(scope.projectId)}/requirements/${encodeURIComponent(id)}${scope.revision ? `?revision=${scope.revision}` : ''}`, headers: { 'x-dev-user': options.user } })
      if (res.status === 404) return undefined
      if (res.status !== 200) throw new Error(`Requirements API: HTTP ${res.status}`)
      const d = res.body as Record<string, unknown>
      return { ...(d as object), id: d.id, key: d.key, revision: d.revision, title: d.title, statement: d.statement, projectId: scope.projectId } as RequirementSummary
    },
  }
}


/** HTTP writer of the Requirements service (create a draft requirement; revise it with an expected revision). */
export function createRequirementsHttpWriter(options: { transport: HttpTransport; basePath?: string }): RequirementsWriter {
  const base = options.basePath ?? '/api/requirements/v1'
  let n = 0
  const tag = Date.now().toString(36)
  const ok = (res: HttpResponse, what: string) => {
    if (res.status < 200 || res.status >= 300) throw new Error(`Requirements API (${what}): HTTP ${res.status} ${JSON.stringify(res.body)}`)
    const d = res.body as { id: string; key: string; revision: number }
    return { id: d.id, key: d.key, revision: d.revision }
  }
  const idem = () => `drc-req-${tag}-${++n}`
  return {
    mode: 'api',
    async create(input, actor) {
      const { projectId, ...body } = input
      return ok(await options.transport({ method: 'POST', path: `${base}/projects/${encodeURIComponent(projectId)}/requirements`, body, headers: { 'x-dev-user': actor, 'idempotency-key': idem() } }), 'create')
    },
    async revise(id, patch, expectedRevision, actor) {
      const { projectId, ...body } = patch
      return ok(await options.transport({ method: 'PATCH', path: `${base}/projects/${encodeURIComponent(projectId)}/requirements/${encodeURIComponent(id)}`, body: { ...body, expectedRevision }, headers: { 'x-dev-user': actor, 'idempotency-key': idem() } }), 'revise')
    },
  }
}

export type { DesignRef }

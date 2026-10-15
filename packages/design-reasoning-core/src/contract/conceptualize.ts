import type { Basis, CalculationManifest, CalculationModelDefinition, CalculationParameter, CalculationQualifications, ResultRange } from '@ews/engineering-calc'
import type { LinkTypeDefinition } from '../linkTypes'
import type { AnyRef, ArtifactRefX, DesignEntityType, DesignRef } from '../refs'

/**
 * The PROPOSED Conceptualize contract extension (CR-C1…C10 in
 * docs/modules/design-reasoning/contract-change-requests.md), as TypeScript. The in-memory test adapter
 * implements it; the Conceptualize service implements the same operations over HTTP (operation names =
 * OpenAPI operationIds). Field names follow the document; where this file refines it, the document was
 * updated in the same change.
 */

export interface Quantity {
  value?: number
  min?: number
  max?: number
  unit: string
}

export type SourceKind = 'user' | 'assistant' | 'reasoning' | 'import' | 'system'
export type Role = 'reader' | 'editor' | 'reviewer' | 'administrator'

/** Request context: who acts, in which role, and the provenance recorded with the write (CR-C13). */
export interface RequestContext {
  projectId: string
  actor: string
  role: Role
  sourceKind: SourceKind
  conversationId?: string
  proposalId?: string
  messageId?: string
  runId?: string
  stepId?: string
}

export interface Provenance {
  actor: string
  sourceKind: SourceKind
  at: string
  conversationId?: string
  proposalId?: string
  messageId?: string
  runId?: string
  stepId?: string
  reason?: string
}

interface RecordBase {
  id: string
  key: string
  projectId: string
  createdAt: string
  provenance: Provenance
}

interface Revisioned {
  revision: number
}

// ---- CR-C1 Function ------------------------------------------------------------------------------

export interface FunctionFlow {
  direction: 'in' | 'out'
  kind: 'energy' | 'material' | 'signal' | 'force' | 'data' | 'other'
  name: string
  quantity?: Quantity
}

export interface PerformanceObjective {
  name: string
  direction: 'minimize' | 'maximize' | 'target'
  quantity?: Quantity
  basis: Basis
}

export interface FunctionRecord extends RecordBase, Revisioned {
  name: string
  description: string
  flows: FunctionFlow[]
  performanceObjectives: PerformanceObjective[]
  classifications: string[]
  status: 'draft' | 'active' | 'retired'
}

export interface FunctionInput {
  name: string
  description?: string
  flows?: FunctionFlow[]
  performanceObjectives?: PerformanceObjective[]
  classifications?: string[]
  /** Creates a decomposes-into link from this parent Function. */
  parentFunctionId?: string
}

// ---- Concept (existing; the subset the reasoning layer uses) --------------------------------------

export interface ConceptAttribute extends Quantity {
  basis: Basis
}

export interface ConceptRecord extends RecordBase, Revisioned {
  name: string
  summary: string
  description: string
  abstraction: 'function' | 'component' | 'assembly' | 'subsystem' | 'system' | 'abstract'
  classifications: string[]
  maturity: 'idea' | 'exploring' | 'defined' | 'evaluated' | 'selected' | 'engineering-development' | 'implemented' | 'verified' | 'superseded' | 'archived'
  attributes: Record<string, ConceptAttribute>
  /** Statements (principle, mechanism, question …) with their basis; existing Conceptualize structure. */
  statements: { kind: string; text: string; basis: Basis }[]
}

export interface ConceptInput {
  name: string
  summary?: string
  description?: string
  abstraction?: ConceptRecord['abstraction']
  classifications?: string[]
  attributes?: Record<string, ConceptAttribute>
  statements?: { kind: string; text: string; basis: Basis }[]
  /** Creates performs links (Concept → Function). */
  performs?: string[]
}

// ---- CR-C2 DesignConstraint -------------------------------------------------------------------------

export type ConstraintOperator = '<=' | '<' | '=' | '>=' | '>' | 'in-range'

export interface ConstraintRecord extends RecordBase, Revisioned {
  kind: 'qualitative' | 'logical' | 'mathematical' | 'dimensional' | 'interface'
  statement: string
  /** Quantity bound, e.g. { symbol: 'F', operator: '>=', quantity: { value: 12, unit: 'kN' } }. */
  bound?: { symbol?: string; operator: ConstraintOperator; quantity: Quantity }
  expression?: { modelId: string; revision: number; relationId: string }
  strength: 'hard' | 'soft' | 'preference'
  /** Subjects it constrains (stored as `constrains` links). */
  subjects: DesignRef[]
  source: { kind: 'requirement'; ref: ArtifactRefX } | { kind: 'derived'; from: DesignRef } | { kind: 'stated'; basis: Basis }
  status: 'proposed' | 'active' | 'relaxed' | 'retired'
}

export interface ConstraintInput {
  kind: ConstraintRecord['kind']
  statement: string
  bound?: ConstraintRecord['bound']
  expression?: ConstraintRecord['expression']
  strength?: ConstraintRecord['strength']
  subjects?: DesignRef[]
  source: ConstraintRecord['source']
  status?: ConstraintRecord['status']
}

export interface ConstraintRevision {
  statement?: string
  bound?: ConstraintRecord['bound']
  strength?: ConstraintRecord['strength']
  status?: ConstraintRecord['status']
  reason: string
}

// ---- CR-C3 Assumption --------------------------------------------------------------------------------

export type AssumptionValidationStatus = 'unvalidated' | 'under-review' | 'validated' | 'invalidated' | 'retired'

export interface AssumptionRecord extends RecordBase, Revisioned {
  statement: string
  quantity?: Quantity
  scope: { subjects: DesignRef[]; applicability?: string }
  validationStatus: AssumptionValidationStatus
  validations: { status: AssumptionValidationStatus; by: string; at: string; reason: string; evidence?: DesignRef }[]
  basis: Basis
  dependsOn: AnyRef[]
  /** For assumptions migrated from statements (CR-C3 migration). */
  origin?: { conceptId: string; statementId: string }
}

export interface AssumptionInput {
  statement: string
  quantity?: Quantity
  /** When given, subjects is required (may be empty), as in the service. */
  scope?: { subjects: DesignRef[]; applicability?: string }
  basis: Basis
  dependsOn?: AnyRef[]
}

// ---- CR-C6 Evidence ------------------------------------------------------------------------------------

export interface EvidenceRecord extends RecordBase {
  kind: 'calculation' | 'analysis' | 'simulation' | 'test' | 'review' | 'reference' | 'estimate'
  title: string
  summary: string
  subjects: DesignRef[]
  basis: Basis
  applicability?: string
  /** Calculation model executed, with the manifest (CR-C8). */
  calculation?: {
    modelId: string
    modelRevision: number
    manifest: CalculationManifest
    /** Set by Conceptualize when it accepted the evidence (CR-C8). */
    verification?: CalculationVerification
  }
  /**
   * C11: derived by Conceptualize from the VERIFIED manifest (qualifyManifest), never taken from the client.
   * Stored and displayed unchanged: result kinds, bound quality, proven statuses and the manifest limits.
   */
  qualifications?: CalculationQualifications
  /**
   * Interim, real service only (CR-C8 pending): a manifest stored without a model reference or re-verification.
   * Its qualifications are derived by the client for display; it is not verified calculated evidence.
   */
  interimManifest?: CalculationManifest
  source?: ArtifactRefX
  supersedesId?: string
  version: number
  reviews: { outcome: 'accepted' | 'rejected'; reviewer: string; at: string; method: string; note: string }[]
  validationStatus: 'unreviewed' | 'accepted' | 'rejected'
}

export interface EvidenceInput {
  kind: EvidenceRecord['kind']
  title: string
  summary?: string
  subjects: DesignRef[]
  basis: Basis
  applicability?: string
  calculation?: EvidenceRecord['calculation']
  /** Interim, real service only (CR-C8 pending): the manifest without a model reference; not re-verified. */
  manifest?: CalculationManifest
  source?: ArtifactRefX
  supersedesId?: string
}

// ---- CR-C8 CalculationModel ------------------------------------------------------------------------------

export interface CalculationParameterRecord extends CalculationParameter {
  /** Where the input value comes from by default (resolved by the reasoning core). */
  defaultBinding?: { ref: AnyRef; property: string }
}

export interface CalculationModelRecord extends RecordBase, Omit<CalculationModelDefinition, 'parameters' | 'key'> {
  parameters: CalculationParameterRecord[]
  assumptions: DesignRef[]
  sources: ArtifactRefX[]
}

export type CalculationModelInput = Omit<CalculationModelRecord, 'id' | 'key' | 'projectId' | 'createdAt' | 'provenance' | 'revision'>

// ---- Alternatives, trade studies (existing, extended by CR-C7) ---------------------------------------------

export interface AlternativeMember {
  conceptId: string
  /** CR-C7: the alternative is the Concept with this decomposition (a complete architecture). */
  decompositionId?: string
  status: 'candidate' | 'selected' | 'rejected' | 'deferred' | 'withdrawn'
  decisionId?: string
}

export interface AlternativeSetRecord extends RecordBase {
  name: string
  question: string
  parentConceptId?: string
  /** CR-C7: all members must perform this Function. */
  functionId?: string
  members: AlternativeMember[]
}

export interface AlternativeSetInput {
  name: string
  question: string
  parentConceptId?: string
  functionId?: string
  memberIds: string[]
}

export interface TradeCriterion {
  id: string
  name: string
  category: 'performance' | 'mass' | 'cost' | 'complexity' | 'manufacturability' | 'risk' | 'custom'
  weight: number
  direction: 'maximize' | 'minimize'
  scale: 'quantity' | 'qualitative'
  unit?: string
}

export interface TradeScore {
  criterionId: string
  conceptId: string
  value?: number
  low?: number
  high?: number
  qualitative?: number
  basis: Basis
  rationale: string
  evidenceId?: string
  /** C11: the calculation output this score is taken from (with evidenceId). */
  evidenceOutput?: string
  /** C11: set by Conceptualize from the evidence's qualifications (client values are ignored). */
  qualification?: ScoreQualification
}

/** Outcome of Conceptualize's re-verification of a calculation manifest (CR-C8). */
export interface CalculationVerification {
  verifiedAt: string
  /** Version of @ews/engineering-calc that re-evaluated the manifest. */
  engineVersion: string
  manifestVersion: 1 | 2 | 3
  ok: true
  /** Whether the output digest matched exactly (informational; values are compared with a tolerance). */
  exactDigestMatch?: boolean
}

/** C11 qualification of a trade-study score taken from calculated evidence. */
export interface ScoreQualification {
  source: 'calculation'
  evidenceId: string
  symbol: string
  kind: ResultRange['kind']
  quality?: 'exact' | 'enclosure'
}

export interface TradeStudyRecord extends RecordBase {
  title: string
  setId: string
  revision: number
  criteria: TradeCriterion[]
  options: string[]
  scores: TradeScore[]
}

export interface TradeStudyInput {
  title: string
  setId: string
  criteria: Omit<TradeCriterion, 'id'>[]
}

export interface TradeStudyResult {
  options: { conceptId: string; score: number | null; low: number | null; high: number | null; coverage: number; missing: string[]; rank: number | null }[]
  ranking: 'robust' | 'uncertain' | 'incomplete'
  preliminary: boolean
  method: string
  /**
   * C11: how the score ranges are qualified. A robust ranking needs ranges that are bounds (exact or enclosure)
   * or stated ranges; a sampled range is not a bound, so it can never make a ranking robust.
   */
  qualifications: { points: number; exactBounds: number; enclosures: number; sampledRanges: number; statedRanges: number; robustnessNote?: string }
}

// ---- CR-C5 Decisions ----------------------------------------------------------------------------------------

export type InvalidationKind = 'assumption-invalidated' | 'constraint-changed' | 'evidence-superseded' | 'requirement-revised' | 'artifact-revised' | 'relation-violated' | 'manual'

export interface InvalidationCondition {
  id: string
  kind: InvalidationKind
  subject: AnyRef
  /** For relation-violated: the calculation relation that must keep holding. */
  relation?: { modelId: string; revision: number; relationId: string }
  description: string
}

export interface DecisionRecord extends RecordBase {
  title: string
  question: string
  rationale: string
  setId?: string
  subjectId?: string
  tradeStudyId?: string
  outcomes: { conceptId: string; outcome: 'accepted' | 'rejected' | 'deferred'; rationale: string }[]
  status: 'proposed' | 'recorded' | 'withdrawn'
  support: { ref: DesignRef; role: 'supports' | 'contradicts'; note?: string }[]
  assumptionIds: { id: string; revision: number }[]
  constraintIds: { id: string; revision: number }[]
  affected: AnyRef[]
  invalidationConditions: InvalidationCondition[]
  reviewFlags: { at: string; by: string; reason: string; impactReportId?: string; cleared?: { at: string; by: string; note: string } }[]
  /** Derived: valid, or under-review while an uncleared flag exists, or invalidated by a reviewer. */
  validity: 'valid' | 'under-review' | 'invalidated'
  recordedBy?: string
  recordedAt?: string
  supersedesId?: string
}

export interface DecisionInput {
  title: string
  question: string
  rationale: string
  setId?: string
  subjectId?: string
  tradeStudyId?: string
  outcomes: DecisionRecord['outcomes']
  support?: DecisionRecord['support']
  assumptionIds?: DecisionRecord['assumptionIds']
  constraintIds?: DecisionRecord['constraintIds']
  affected?: AnyRef[]
  invalidationConditions?: Omit<InvalidationCondition, 'id'>[]
  supersedesId?: string
}

export interface DecisionRationale {
  decision: DecisionRecord
  set?: AlternativeSetRecord
  tradeStudy?: { study: TradeStudyRecord; result: TradeStudyResult }
  support: { ref: DesignRef; role: 'supports' | 'contradicts'; evidence?: EvidenceRecord }[]
  assumptions: AssumptionRecord[]
  constraints: ConstraintRecord[]
}

// ---- Implementations (existing, CR-C11 subset) ------------------------------------------------------------------

export interface ImplementationRecord extends RecordBase, Revisioned {
  name: string
  status: 'candidate' | 'in-development' | 'implemented' | 'retired'
  concepts: { conceptId: string; realizedConceptRevision: number | null }[]
  artifacts: ArtifactRefX[]
}

export interface ImplementationInput {
  name: string
  status?: ImplementationRecord['status']
  concepts: { conceptId: string; realizedConceptRevision?: number | null }[]
  artifacts: ArtifactRefX[]
}

// ---- CR-C4 Links -----------------------------------------------------------------------------------------------------

export interface DesignLink {
  id: string
  type: string
  from: DesignRef
  to: AnyRef
  basis: Basis
  note: string
  removed: boolean
  provenance: Provenance
}

export interface LinkInput {
  type: string
  from: DesignRef
  to: AnyRef
  basis?: Basis
  note?: string
}

// ---- CR-C9 Graph ------------------------------------------------------------------------------------------------------

export interface TraverseRequest {
  start: AnyRef[]
  follow?: { type: string; direction: 'in' | 'out' | 'both' }[]
  maxDepth?: number
  nodeTypes?: (DesignEntityType | 'artifact')[]
  asOf?: string | null
  limit?: number
}

export interface GraphNode {
  ref: AnyRef
  key?: string
  label: string
  revision?: number
  status?: string
}

export interface GraphEdge {
  id: string
  type: string
  from: AnyRef
  to: AnyRef
  /** True for edges read from records (implementations, decisions, bindings) rather than stored links. */
  derived: boolean
  basis?: Basis
}

export interface TraverseResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  truncated: boolean
  builtFrom: { at: string; revision: number }
}

// ---- CR-C10 Batch -----------------------------------------------------------------------------------------------------

/** One operation of a batch. `as` names a placeholder ("$fn1") that later items may use in place of an ID. */
export type BatchItem =
  | { op: 'createFunction'; as?: string; body: FunctionInput }
  | { op: 'createConcept'; as?: string; body: ConceptInput }
  | { op: 'createConstraint'; as?: string; body: ConstraintInput }
  | { op: 'reviseConstraint'; as?: string; body: { id: string; expectedRevision: number } & ConstraintRevision }
  | { op: 'createAssumption'; as?: string; body: AssumptionInput }
  | { op: 'createEvidence'; as?: string; body: EvidenceInput }
  | { op: 'createLink'; as?: string; body: LinkInput }
  | { op: 'createAlternativeSet'; as?: string; body: AlternativeSetInput }
  | { op: 'createTradeStudy'; as?: string; body: TradeStudyInput }
  | { op: 'putScores'; as?: string; body: { studyId: string; expectedRevision: number; scores: TradeScore[] } }
  | { op: 'proposeDecision'; as?: string; body: DecisionInput }
  | { op: 'recordDecision'; as?: string; body: { id: string; reason: string } }
  | { op: 'flagDecisionForReview'; as?: string; body: { id: string; reason: string; impactReportId?: string } }
  | { op: 'createImplementation'; as?: string; body: ImplementationInput }
  | { op: 'createCalculationModel'; as?: string; body: CalculationModelInput }

export interface BatchRequest {
  idempotencyKey: string
  items: BatchItem[]
}

export interface BatchResponse {
  /** Placeholder → created or affected ID. */
  ids: Record<string, string>
  results: { op: BatchItem['op']; id: string; key?: string; revision?: number }[]
}

// ---- Errors and events -------------------------------------------------------------------------------------------------

export type ConceptualizeErrorCode = 'not-found' | 'conflict' | 'invalid' | 'forbidden' | 'not-implemented'

export class ConceptualizeError extends Error {
  constructor(
    readonly code: ConceptualizeErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ConceptualizeError'
  }
}

export interface DesignEvent {
  eventId: string
  type: string
  projectId: string
  entity: DesignRef
  committedRevision: number
  occurredAt: string
  actor: string
}

/** Records by type, for generic reads (`get`). */
export interface RecordByType {
  function: FunctionRecord
  concept: ConceptRecord
  constraint: ConstraintRecord
  assumption: AssumptionRecord
  evidence: EvidenceRecord
  decision: DecisionRecord
  'alternative-set': AlternativeSetRecord
  'trade-study': TradeStudyRecord
  implementation: ImplementationRecord
  'calculation-model': CalculationModelRecord
}

/**
 * The operations of the proposed contract the reasoning core uses. Every method maps one-to-one to an
 * HTTP operation of `/api/concepts/v1/projects/{projectId}/…` (integration.md §3).
 */
/**
 * Parts of the contract an implementation provides. The in-memory test adapter provides all of them; the HTTP
 * binding declares what the Conceptualize service on main implements (conceptualizeHttpAdapter.ts). Callers adapt
 * and label steps instead of assuming.
 */
export interface KnowledgeCapabilities {
  /** CR-C7: alternative sets attached to a Function (otherwise they need a parent Concept). */
  functionAlternativeSets: boolean
  /** CR-C8: calculation model records. */
  calculationModels: boolean
  /** CR-C8: evidence with a calculation reference, re-verified by the service. */
  calculatedEvidenceVerification: boolean
  /** CR-C11: implementations record the realized Concept revision. */
  realizedConceptRevision: boolean
  /** CR-C13: source kind 'reasoning' with run and step IDs in provenance. */
  reasoningSourceKind: boolean
  /** C11 storage contract: trade scores with evidenceOutput and qualification. */
  scoreQualifications: boolean
  /** Event list (the test adapter); the service publishes events over SSE instead. */
  events: boolean
}

export interface ConceptualizeKnowledgeApi {
  /** 'api' for the real service, 'test-adapter' for the in-memory contract adapter. */
  readonly mode: 'api' | 'test-adapter'
  readonly capabilities: KnowledgeCapabilities
  get<T extends keyof RecordByType>(type: T, id: string, ctx: RequestContext, revision?: number): Promise<RecordByType[T] | undefined>
  list<T extends keyof RecordByType>(type: T, ctx: RequestContext): Promise<RecordByType[T][]>
  batch(request: BatchRequest, ctx: RequestContext): Promise<BatchResponse>
  linkTypes(ctx: RequestContext): Promise<LinkTypeDefinition[]>
  links(ctx: RequestContext, filter?: { from?: DesignRef; to?: AnyRef; type?: string }): Promise<DesignLink[]>
  traverse(request: TraverseRequest, ctx: RequestContext): Promise<TraverseResponse>
  tradeStudyResult(studyId: string, ctx: RequestContext): Promise<TradeStudyResult>
  decisionRationale(decisionId: string, ctx: RequestContext): Promise<DecisionRationale>
  reviewEvidence(id: string, review: { outcome: 'accepted' | 'rejected'; method: string; note: string }, ctx: RequestContext): Promise<EvidenceRecord>
  setAssumptionValidation(id: string, input: { status: AssumptionValidationStatus; reason: string; evidence?: DesignRef }, ctx: RequestContext): Promise<AssumptionRecord>
  events(ctx: RequestContext): Promise<DesignEvent[]>
}

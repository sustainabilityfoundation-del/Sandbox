/**
 * Design-knowledge types of the Conceptualize API (Design Reasoning P1: CR-C1…C6, C9, C10), mirroring
 * services/conceptualize/src/http/designSchemas.ts.
 */
import type { ArtifactRefInput, Basis, ProvenanceInfo, Quantity, RevisionSummary, Statement, StatementInput } from './types'

export type DesignEntityType = 'concept' | 'function' | 'constraint' | 'assumption' | 'evidence' | 'decision' | 'implementation' | 'exploration'

/** Reference to a Conceptualize record (local until the SDK DesignRef, CR-S1). */
export interface DesignRef {
  module: 'conceptualize'
  type: DesignEntityType
  id: string
  revision?: number
}
/** A Conceptualize record or an artifact of another module. */
export type AnyRef = DesignRef | ArtifactRefInput

export interface Flow {
  direction: 'in' | 'out'
  kind: 'energy' | 'material' | 'signal' | 'force' | 'data' | 'other'

  name: string
  quantity?: Quantity | null
}
/** Performance objective of a Function (R1): optimisation direction, optional value or range, basis. */
export interface PerformanceObjective {
  name: string
  direction: 'minimize' | 'maximize' | 'target'
  quantity?: Quantity
  basis?: Basis
}

// ---- Function (CR-C1) ----------------------------------------------------------------------------------
export type FunctionStatus = 'draft' | 'active' | 'retired'
export interface DesignFunction {
  id: string
  key: string
  projectId: string
  revision: number
  name: string
  verbPhrase: string
  description: string
  purpose: string
  flows: Flow[]
  performanceObjectives: PerformanceObjective[]
  statements: Statement[]
  classifications: string[]
  status: FunctionStatus
  originConceptId: string | null
  changeReason: string
  provenance: ProvenanceInfo
  revisionCreatedAt: string
  revisionCreatedBy: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}
export interface FunctionCreate {
  name: string
  verbPhrase?: string
  description?: string
  purpose?: string
  flows?: Flow[]
  performanceObjectives?: PerformanceObjective[]
  statements?: StatementInput[]
  classifications?: string[]
  status?: 'draft' | 'active'
  parentFunctionId?: string
  decompositionId?: string
  reason?: string
}
export type FunctionPatch = Partial<Omit<FunctionCreate, 'status' | 'parentFunctionId' | 'decompositionId'>> & { status?: FunctionStatus }
export interface Conversion {
  function: DesignFunction
  derivedLinkId: string
  performsLinkIds: string[]
  conceptId: string
}

// ---- DesignConstraint (CR-C2) ----------------------------------------------------------------------------
export type ConstraintKind = 'qualitative' | 'logical' | 'mathematical' | 'dimensional' | 'interface'
export type ConstraintStrength = 'hard' | 'soft' | 'preference'
export type ConstraintStatus = 'proposed' | 'active' | 'relaxed' | 'retired'
export interface Bound {
  symbol?: string
  operator: '<=' | '<' | '=' | '>=' | '>' | 'in-range'
  quantity: Quantity
}
export type ConstraintSource = { kind: 'requirement'; ref: ArtifactRefInput } | { kind: 'derived'; from: DesignRef } | { kind: 'stated'; basis?: Basis }
export interface DesignConstraint {
  id: string
  key: string
  projectId: string
  revision: number
  kind: ConstraintKind
  statement: string
  bound: Bound | null
  expression: { modelId: string; revision: number; relationId: string } | null
  strength: ConstraintStrength
  source: ConstraintSource
  basis: Basis
  origin: { conceptId: string; statementId: string } | null
  status: ConstraintStatus
  subjects: DesignRef[]
  changeReason: string
  provenance: ProvenanceInfo
  revisionCreatedAt: string
  revisionCreatedBy: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}
export interface ConstraintCreate {
  kind: ConstraintKind
  statement: string
  bound?: Bound | null
  strength?: ConstraintStrength
  basis?: Basis
  source?: ConstraintSource
  subjects?: DesignRef[]
  status?: 'proposed' | 'active'
  reason?: string
}
export type ConstraintPatch = Partial<Pick<ConstraintCreate, 'kind' | 'statement' | 'bound' | 'strength' | 'basis' | 'reason'>>

// ---- Assumption (CR-C3) ---------------------------------------------------------------------------------
export type AssumptionStatus = 'unvalidated' | 'under-review' | 'validated' | 'invalidated' | 'retired'
export interface AssumptionValidation {
  id: string
  revision: number
  /** R1 fields. */
  status: AssumptionStatus
  by: string
  at: string
  evidence?: DesignRef
  fromStatus: string
  toStatus: string
  evidenceIds: string[]
  reason: string
  actor: string
  occurredAt: string
  provenance: ProvenanceInfo
}
export interface Assumption {
  id: string
  key: string
  projectId: string
  revision: number
  statement: string
  quantity: Quantity | null
  scope: { subjects: DesignRef[]; applicability: string }
  basis: Basis
  dependsOn: AnyRef[]
  origin: { conceptId: string; statementId: string } | null
  validationStatus: AssumptionStatus
  validatedBy: string[]
  validations: AssumptionValidation[]
  changeReason: string
  provenance: ProvenanceInfo
  revisionCreatedAt: string
  revisionCreatedBy: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}
export interface AssumptionCreate {
  statement: string
  quantity?: Quantity | null
  scope?: { subjects: DesignRef[]; applicability?: string }
  basis?: 'user-assertion' | 'ai-hypothesis' | 'assumption'
  dependsOn?: AnyRef[]
  origin?: { conceptId: string; statementId: string }
  reason?: string
}
export type AssumptionPatch = Partial<Omit<AssumptionCreate, 'origin'>>

// ---- links (CR-C4) ----------------------------------------------------------------------------------------
export interface LinkType {
  name: string
  label: string
  inverse: string
  fromTypes: string[]
  toTypes: string[]
  symmetric: boolean
  acyclic: boolean
  assistantAssertable: boolean
  impact: 'possible' | 'demonstrated' | 'none'
  propagation: 'to-from' | 'from-to' | 'both' | 'none'
  artifactModules: string[] | null
  description: string
  builtin: boolean
  stored: 'design-links' | 'relationships' | 'derived'
}
export interface LinkTypeCreate {
  name: string
  label: string
  inverse: string
  fromTypes: string[]
  toTypes: string[]
  symmetric?: boolean
  acyclic?: boolean
  assistantAssertable?: boolean
  impact?: 'possible' | 'none'
  description?: string
}
export interface DesignLink {
  id: string
  type: string
  from: DesignRef
  to: AnyRef
  decompositionId: string | null
  basis: Basis
  note: string
  attributes: Record<string, unknown>
  revision: number
  removed: boolean
  createdAt: string
  createdBy: string
  removedAt: string | null
  removedBy: string | null
  provenance: ProvenanceInfo
}
export interface DesignLinkCreate {
  type: string
  from: DesignRef
  to: AnyRef
  decompositionId?: string
  basis?: Basis
  note?: string
  attributes?: Record<string, unknown>
  reason?: string
}

// ---- decisions and evidence (CR-C5, CR-C6) ------------------------------------------------------------------
export type DecisionValidity = 'valid' | 'under-review' | 'invalidated'
export interface SupportRef {
  ref: DesignRef
  role: 'supports' | 'contradicts'
  note?: string
}
export interface InvalidationCondition {
  id?: string
  kind: 'assumption-invalidated' | 'constraint-changed' | 'evidence-superseded' | 'requirement-revised' | 'artifact-revised' | 'relation-violated' | 'manual'
  subject: AnyRef
  description: string
}
/** R1-7: append-only review flags; validity is under-review while one is not cleared. */
export interface ReviewFlagRecord {
  at: string
  by: string
  reason: string
  impactReportId?: string
  conditionId?: string
  sourceKind?: string
  cleared?: { at: string; by: string; note: string; outcome?: string }
}
/** A pinned revision as in R1 ({ id, revision }); DesignRefs are accepted too. */
export type PinRef = { id: string; revision?: number } | DesignRef
export interface Rationale {
  decision: unknown
  question: string
  alternatives: { ref: DesignRef; key: string; name: string; outcome: string | null; outcomeRationale: string; memberStatus: string | null }[]
  support: { ref: DesignRef; key: string; title: string; role: string; basis: string; validationStatus: string }[]
  assumptions: { ref: DesignRef; key: string; statement: string; pinnedRevision: number | null; currentRevision: number; validationStatus: string }[]
  constraints: { ref: DesignRef; key: string; statement: string; pinnedRevision: number | null; currentRevision: number; status: string }[]
  tradeStudy: { ref: DesignRef; key: string; title: string; ranking: string; preliminary: boolean } | null
  invalidationConditions: InvalidationCondition[]
  validity: DecisionValidity
  reviewFlags: ReviewFlagRecord[]
  supersedes: string | null
  supersededBy: string | null
  stale: string[]
}
/** C11 qualification of a result value (kept unchanged from the producing tool). */
export interface ResultQualification {
  kind: 'point' | 'sampled-range' | 'bounds'
  quality?: 'exact' | 'enclosure'
  note?: string
}
export interface ToolInfo {
  name: string
  version: string
}
export interface EvidenceResultInput {
  name: string
  value?: number | null
  min?: number | null
  max?: number | null
  unit: string
  qualification: ResultQualification
  /** The constraint checked against; the service computes the status from its bound. */
  constraint?: DesignRef | { id: string; revision?: number }
  status?: 'satisfied' | 'violated' | 'uncertain'
  note?: string
}
export interface EvidenceResult {
  name: string
  value: number | null
  min: number | null
  max: number | null
  unit: string
  qualification: ResultQualification
  constraint: DesignRef | null
  status: 'satisfied' | 'violated' | 'uncertain' | null
  margin: number | null
  marginUnit: string | null
  note: string
}
export interface EvidenceReview {
  id: string
  outcome: 'accepted' | 'rejected'
  method: string
  note: string
  reviewer: string
  reviewedAt: string
}

// ---- batch (CR-C10) ----------------------------------------------------------------------------------------
/** R1-1: item ops are the operationIds of the writes; the last five are Conceptualize extensions. */
export type BatchOp =
  | 'createFunction'
  | 'createConcept'
  | 'createConstraint'
  | 'reviseConstraint'
  | 'createAssumption'
  | 'createEvidence'
  | 'createLink'
  | 'createAlternativeSet'
  | 'createTradeStudy'
  | 'putScores'
  | 'proposeDecision'
  | 'recordDecision'
  | 'flagDecisionForReview'
  | 'createImplementation'
  | 'createCalculationModel'
  | 'updateConcept'
  | 'updateFunction'
  | 'createRelationship'
  | 'createConceptLink'
  | 'addAlternative'
export interface BatchItem {
  op: BatchOp
  /** Placeholder for the created record ("$name"); replaced by its ID anywhere in later bodies. */
  as?: string
  /** Body of the single operation; updates carry id and expectedRevision. */
  body: Record<string, unknown>
}
export interface BatchResult {
  results: { index: number; op: string; as: string | null; id: string; key: string | null; revision: number | null }[]
  ids: Record<string, string>
}

// ---- graph and search (CR-C9) -----------------------------------------------------------------------------
export interface GraphNode {
  ref: AnyRef
  key: string
  label: string
  revision: number | null
  type: string
  status: string
}
export interface GraphEdge {
  id: string
  type: string
  from: AnyRef
  to: AnyRef
  basis: string | null
  pinned: boolean
  /** R1-8: read from records rather than a stored link. */
  derived: boolean
  stored: 'design-links' | 'relationships' | 'concept-links' | 'derived'
}
export interface TraverseRequest {
  start: AnyRef[]
  follow?: { type: string; direction?: 'in' | 'out' | 'both' }[]
  maxDepth?: number
  nodeTypes?: string[]
  where?: { status?: string[]; basis?: string[] }
  asOf?: string | null
  limit?: number
  cursor?: string
}
export interface TraverseResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
  truncated: boolean
  cursor?: string
  builtFrom: { at: string; asOf: string | null; revision: number }
}
export interface PathsResult {
  paths: { nodes: AnyRef[]; edges: GraphEdge[] }[]
  nodes: GraphNode[]
  truncated: boolean
}
export interface SearchResult {
  items: { ref: DesignRef; key: string; label: string; status: string; rank: number; snippet: string }[]
  total: number
}
export type DesignRevisionSummary = RevisionSummary

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
export interface Objective {
  name: string
  quantity: Quantity
  direction: 'min' | 'max' | 'target'
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
  objectives: Objective[]
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
  objectives?: Objective[]
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
export type ConstraintSource = { kind: 'requirement'; ref: ArtifactRefInput } | { kind: 'derived'; from: DesignRef } | { kind: 'stated' }
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
export interface ReviewFlagRecord {
  reason: string
  conditionId?: string
  by?: string
  at?: string
  cleared?: { by: string; at: string; outcome: string; reason: string }
}
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
export interface EvidenceReview {
  id: string
  outcome: 'accepted' | 'rejected'
  method: string
  note: string
  reviewer: string
  reviewedAt: string
}

// ---- batch (CR-C10) ----------------------------------------------------------------------------------------
export type BatchOp =
  | 'create-concept'
  | 'update-concept'
  | 'create-function'
  | 'update-function'
  | 'create-constraint'
  | 'create-assumption'
  | 'create-relationship'
  | 'create-design-link'
  | 'create-evidence'
  | 'create-decision'
  | 'create-implementation'
  | 'create-concept-link'
  | 'create-alternative-set'
  | 'add-alternative'
export interface BatchOperation {
  op: BatchOp
  /** Placeholder for the created record ("$name"), usable by later operations. */
  ref?: string
  id?: string
  expectedRevision?: number
  data: Record<string, unknown>
}
export interface BatchResult {
  results: { index: number; op: string; ref: string | null; id: string; key: string | null; revision: number | null }[]
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
  builtFrom: { at: string; asOf: string | null }
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

/**
 * Types of the Conceptualize API (v1), mirroring the OpenAPI document served at
 * /api/concepts/v1/openapi.json (source: services/conceptualize/src/http/schemas.ts).
 */
import type { ArtifactModule, ConceptAbstraction, ConceptMaturity } from '@ews/platform-sdk'
import type { AnyRef, DecisionValidity, DesignRef, EvidenceReview, InvalidationCondition, ReviewFlagRecord, SupportRef } from './designTypes'
export type * from './designTypes'

/** Basis ladder (ADR-0043), lowest to highest: ai-hypothesis, assumption / user-assertion, assessment, estimate, calculated, evidence, decision. */
export type Basis = 'user-assertion' | 'ai-hypothesis' | 'assumption' | 'assessment' | 'estimate' | 'calculated' | 'evidence' | 'decision'
export type StatementKind =
  | 'function'
  | 'behavior'
  | 'principle'
  | 'effect'
  | 'input'
  | 'output'
  | 'constraint'
  | 'interface'
  | 'mechanism'
  | 'problem'
  | 'capability'
  | 'performance'
  | 'assumption'
  | 'uncertainty'
  | 'question'
  | 'rationale'
  | 'note'
export type SourceKind = 'user' | 'assistant' | 'import' | 'system'
export type VerificationStatus = 'not-verified' | 'partially-verified' | 'verified' | 'failed'
export type ImplementationStatus = 'candidate' | 'in-development' | 'implemented' | 'retired'
export type RelationshipType = 'contains' | 'depends-on' | 'interfaces-with' | 'alternative-to' | 'derived-from' | 'refines' | 'implements' | 'conflicts-with' | 'replaces'
export type LinkRelation = 'satisfies' | 'derives' | 'refines' | 'proposes' | 'references'

export interface ProvenanceInfo {
  sourceKind: SourceKind
  conversationId: string | null
  proposalId: string | null
  messageId?: string | null
}

export interface Quantity {
  value?: number | null
  unit: string
  min?: number | null
  max?: number | null
}

export interface Attribute extends Quantity {
  basis?: Basis
  note?: string
}

export interface ArtifactRefInput {
  module: ArtifactModule
  id: string
  revision?: number
  kind?: string
  label?: string
}

export interface Statement {
  id: string
  kind: StatementKind
  text: string
  basis: Basis
  quantity: Quantity | null
  state: 'open' | 'resolved' | null
  evidenceId: string | null
  decisionId: string | null
  confirmedBy: string | null
  confirmedAt: string | null
  source: string
}

export interface StatementInput {
  id?: string
  kind: StatementKind
  text: string
  basis?: Basis
  quantity?: Quantity | null
  state?: 'open' | 'resolved' | null
  evidenceId?: string | null
  decisionId?: string | null
  source?: string
  confirm?: boolean
}

export interface Concept {
  id: string
  key: string
  projectId: string
  revision: number
  name: string
  summary: string
  description: string
  purpose: string
  abstraction: ConceptAbstraction
  classifications: string[]
  attributes: Record<string, Attribute>
  statements: Statement[]
  maturity: ConceptMaturity
  verificationStatus: VerificationStatus
  implementationStatus: ImplementationStatus | 'none'
  changeReason: string
  provenance: ProvenanceInfo
  revisionCreatedAt: string
  revisionCreatedBy: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface ConceptListItem {
  id: string
  key: string
  projectId: string
  revision: number
  name: string
  summary: string
  abstraction: ConceptAbstraction
  classifications: string[]
  maturity: ConceptMaturity
  verificationStatus: VerificationStatus
  implementationStatus: ImplementationStatus | 'none'
  sourceKind: SourceKind
  openQuestions: number
  unconfirmedHypotheses: number
  updatedAt: string
}

export interface Page<T> {
  items: T[]
  nextCursor?: string
  total: number
}

export interface ConceptCreate {
  name: string
  summary?: string
  description?: string
  purpose?: string
  abstraction?: ConceptAbstraction
  classifications?: string[]
  attributes?: Record<string, Attribute>
  statements?: StatementInput[]
  maturity?: 'idea' | 'exploring' | 'defined'
  parentId?: string
  decompositionId?: string
  reason?: string
}

export interface ConceptPatch {
  name?: string
  summary?: string
  description?: string
  purpose?: string
  abstraction?: ConceptAbstraction
  classifications?: string[]
  attributes?: Record<string, Attribute | null>
  statements?: StatementInput[]
  reason?: string
}

export interface ListQuery {
  text?: string
  maturity?: ConceptMaturity[]
  abstraction?: ConceptAbstraction[]
  classification?: string
  ids?: string[]
  includeArchived?: boolean
  cursor?: string
  limit?: number
}

export interface RevisionSummary {
  revision: number
  name: string
  changeReason: string
  maturityAtCreation: string
  createdAt: string
  createdBy: string
  provenance: ProvenanceInfo
}

export interface AuditEvent {
  id: string
  entityType: string
  entityId: string
  conceptIds: string[]
  action: string
  revision: number | null
  actor: string
  occurredAt: string
  reason: string
  provenance: ProvenanceInfo
  details: Record<string, unknown>
}

export interface Assessment {
  conceptId: string
  revision: number
  maturity: ConceptMaturity
  completeness: number
  suggestedMaturity: ConceptMaturity
  checks: { id: string; label: string; met: boolean; detail: string }[]
  counts: { openQuestions: number; openUncertainties: number; unconfirmedHypotheses: number; assumptions: number; quantifiedConstraints: number }
  nextSteps: { id: string; text: string; operation?: string; priority: 'high' | 'medium' | 'low' }[]
  note: string
}

export interface InterfaceDefinition {
  name: string
  kind: 'mechanical' | 'electrical' | 'thermal' | 'fluid' | 'data' | 'control' | 'other'
  description?: string
  flows?: string[]
}

export interface Relationship {
  id: string
  type: RelationshipType
  fromId: string
  toId: string
  decompositionId: string | null
  note: string
  interface: InterfaceDefinition | null
  basis: Basis
  revision: number
  removed: boolean
  createdAt: string
  createdBy: string
  removedAt: string | null
  removedBy: string | null
  provenance: ProvenanceInfo
}

export interface RelationshipCreate {
  type: RelationshipType
  fromId: string
  toId: string
  decompositionId?: string
  note?: string
  interface?: InterfaceDefinition
  basis?: Basis
  reason?: string
}

export interface RelationshipTypeInfo {
  type: RelationshipType
  acyclic: boolean
  symmetric: boolean
  reads: string
  inverse: string
  meaning: string
}

export interface Decomposition {
  id: string
  parentId: string
  name: string
  description: string
  status: 'candidate' | 'preferred' | 'rejected'
  recordVersion: number
  createdAt: string
  createdBy: string
  updatedAt: string
}

export interface AlternativeMember {
  conceptId: string
  status: 'candidate' | 'selected' | 'rejected' | 'deferred' | 'withdrawn'
  decisionId: string | null
  addedAt: string
  addedBy: string
}

export interface AlternativeSet {
  id: string
  key: string
  parentId: string
  name: string
  question: string
  members: AlternativeMember[]
  recordVersion: number
  createdAt: string
  createdBy: string
  updatedAt: string
}

export type DecisionOutcomeKind = 'accepted' | 'rejected' | 'deferred'
export interface DecisionOutcome {
  conceptId: string
  outcome: DecisionOutcomeKind
  rationale?: string
}

export interface Decision {
  id: string
  key: string
  title: string
  question: string
  rationale: string
  subjectId: string | null
  setId: string | null
  tradeStudyId: string | null
  outcomes: DecisionOutcome[]
  status: 'proposed' | 'recorded' | 'withdrawn'
  supersedesId: string | null
  supersededById: string | null
  proposedBy: string
  proposedAt: string
  recordedBy: string | null
  recordedAt: string | null
  recordVersion: number
  provenance: ProvenanceInfo
  /** CR-C5 extensions (empty on decisions recorded before them). */
  support?: SupportRef[]
  assumptionIds?: DesignRef[]
  constraintIds?: DesignRef[]
  affected?: AnyRef[]
  invalidationConditions?: InvalidationCondition[]
  validity?: DecisionValidity
  reviewFlags?: ReviewFlagRecord[]
}

export interface DecisionCreate {
  title: string
  question?: string
  rationale: string
  subjectId?: string
  setId?: string
  tradeStudyId?: string
  outcomes: DecisionOutcome[]
  record?: boolean
  supersedesId?: string
  support?: SupportRef[]
  assumptionIds?: DesignRef[]
  constraintIds?: DesignRef[]
  affected?: AnyRef[]
  invalidationConditions?: InvalidationCondition[]
}

export type CriterionCategory = 'performance' | 'mass' | 'cost' | 'complexity' | 'manufacturability' | 'risk' | 'custom'
export interface CriterionInput {
  name: string
  category: CriterionCategory
  description?: string
  weight: number
  direction: 'maximize' | 'minimize'
  scale: 'quantity' | 'qualitative'
  unit?: string | null
}
export interface Criterion extends CriterionInput {
  id: string
  description: string
  unit: string | null
}

export interface Score {
  criterionId: string
  conceptId: string
  value: number | null
  low: number | null
  high: number | null
  qualitative: number | null
  basis: Basis
  rationale: string
  evidenceId: string | null
  enteredUnit: string | null
  studyRevision: number
  createdAt: string
  createdBy: string
  provenance: ProvenanceInfo
}

export interface ScoreInput {
  criterionId: string
  conceptId: string
  value?: number | null
  low?: number | null
  high?: number | null
  unit?: string
  qualitative?: number | null
  basis: Basis
  rationale?: string
  evidenceId?: string | null
  clear?: boolean
}

export interface OptionResult {
  conceptId: string
  score: number | null
  low: number | null
  high: number | null
  coverage: number
  missing: string[]
  rank: number | null
  bases: Record<string, number>
  normalized: Record<string, { low: number; high: number } | null>
}

export interface TradeStudy {
  id: string
  key: string
  title: string
  description: string
  setId: string | null
  revision: number
  criteria: Criterion[]
  options: string[]
  scores: Score[]
  result: { options: OptionResult[]; ranking: 'robust' | 'uncertain' | 'incomplete'; preliminary: boolean; method: string }
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface TradeStudyCreate {
  title: string
  description?: string
  setId?: string
  conceptIds?: string[]
  criteria?: CriterionInput[]
  useDefaultCriteria?: boolean
}

export interface TradeStudyPatch {
  title?: string
  description?: string
  addCriteria?: CriterionInput[]
  updateCriteria?: { id: string; name?: string; description?: string; weight?: number; direction?: 'maximize' | 'minimize' }[]
  removeCriteria?: string[]
  addOptions?: string[]
  removeOptions?: string[]
}

export interface NamedQuantity extends Quantity {
  name: string
}

export type EvidenceKind = 'calculation' | 'analysis' | 'simulation' | 'test' | 'review' | 'reference' | 'estimate'
export interface Evidence {
  id: string
  key: string
  conceptId: string | null
  conceptRevision: number | null
  kind: EvidenceKind
  title: string
  summary: string
  basis: EvidenceBasis
  method: string
  inputs: NamedQuantity[]
  outputs: NamedQuantity[]
  assumptions: string[]
  artifact: ArtifactRefInput | null
  supersedesId: string | null
  createdAt: string
  createdBy: string
  provenance: ProvenanceInfo
  /** CR-C6 extensions. */
  subjects?: DesignRef[]
  applicability?: Record<string, unknown>
  manifest?: Record<string, unknown> | null
  source?: AnyRef | null
  assumptionIds?: string[]
  reviews?: EvidenceReview[]
  validationStatus?: 'unreviewed' | 'accepted' | 'rejected'
}

export type EvidenceBasis = 'ai-hypothesis' | 'assumption' | 'assessment' | 'estimate' | 'calculated' | 'evidence'
export interface EvidenceCreate {
  conceptId?: string
  kind: EvidenceKind
  title: string
  summary?: string
  basis: Evidence['basis']
  method?: string
  inputs?: NamedQuantity[]
  outputs?: NamedQuantity[]
  assumptions?: string[]
  artifact?: ArtifactRefInput
  supersedesId?: string
  subjects?: DesignRef[]
  applicability?: Record<string, unknown>
  /** Required for basis calculated (reproducibility manifest). */
  manifest?: Record<string, unknown>
  source?: AnyRef
  assumptionIds?: string[]
}

export interface ImplementationArtifact {
  id: string
  module: ArtifactModule
  artifactId: string
  revision: number | null
  kind: string | null
  label: string
  addedAt: string
  addedBy: string
  removed: boolean
  removedAt: string | null
  removedBy: string | null
  provenance: ProvenanceInfo
}

export interface RealizationRequest {
  id: string
  implementationId: string
  targetModule: 'cad' | 'sysml' | 'requirements' | 'analysis'
  requestKind: string
  description: string
  parameters: Record<string, unknown>
  status: 'pending' | 'cancelled' | 'fulfilled'
  fulfilledBy: ArtifactRefInput | null
  createdAt: string
  createdBy: string
  updatedAt: string
  provenance: ProvenanceInfo
}

export interface Implementation {
  id: string
  key: string
  name: string
  description: string
  status: ImplementationStatus
  revision: number
  conceptIds: string[]
  artifacts: ImplementationArtifact[]
  realizationRequests: RealizationRequest[]
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface ImplementationCreate {
  name: string
  description?: string
  status?: ImplementationStatus
  conceptIds: string[]
  artifacts?: ArtifactRefInput[]
  reason?: string
}

export interface ImplementationPatch {
  name?: string
  description?: string
  status?: ImplementationStatus
  addConceptIds?: string[]
  removeConceptIds?: string[]
  reason?: string
}

export interface RealizationCreate {
  targetModule: RealizationRequest['targetModule']
  requestKind: string
  description?: string
  parameters?: Record<string, unknown>
}

export interface ConceptLink {
  id: string
  conceptId: string
  relation: LinkRelation
  artifact: ArtifactRefInput
  note: string
  createdAt: string
  createdBy: string
  removed: boolean
  removedAt: string | null
  removedBy: string | null
  provenance: ProvenanceInfo
}

export interface ArtifactConcepts {
  implementations: { concept: ConceptListItem; implementation: Implementation }[]
  links: { concept: ConceptListItem; link: ConceptLink }[]
}

export interface Graph {
  nodes: ConceptListItem[]
  edges: Relationship[]
  decompositions: Decomposition[]
  alternativeSets: AlternativeSet[]
}

export interface ConceptSeed {
  name: string
  summary?: string
  description?: string
  purpose?: string
  abstraction?: ConceptAbstraction
  classifications?: string[]
  attributes?: Record<string, Attribute>
  statements?: StatementInput[]
}

export type EvidenceSeed = Omit<EvidenceCreate, 'conceptId' | 'artifact' | 'supersedesId' | 'basis' | 'subjects' | 'applicability' | 'manifest' | 'source' | 'assumptionIds'> & { basis: 'ai-hypothesis' | 'assumption' | 'estimate' }

export interface ExplorationCreate {
  objective: string
  parentId?: string
  parent?: ConceptSeed
  setName?: string
  question?: string
  alternatives: (ConceptSeed & {
    children?: ConceptSeed[]
    interfaces?: { from: number; to: number; definition: InterfaceDefinition }[]
    evidence?: EvidenceSeed[]
  })[]
  tradeStudy?: {
    title: string
    criteria: CriterionInput[]
    scores?: { criterion: number; alternative: number; value?: number | null; low?: number | null; high?: number | null; unit?: string; qualitative?: number | null; basis: Basis; rationale?: string }[]
  }
  generator?: string
}

export interface Exploration {
  id: string
  objective: string
  parentId: string
  setId: string | null
  tradeStudyId: string | null
  created: { concepts: { id: string; key: string; name: string; role: 'parent' | 'alternative' | 'child' }[]; relationships: string[]; evidence: string[] }
  generator: string
  undone: boolean
  undoneAt: string | null
  undoneBy: string | null
  createdAt: string
  createdBy: string
  provenance: ProvenanceInfo
}

export interface MyPermissions {
  userId: string
  projectId: string
  role: string | null
  permissions: ('read' | 'author' | 'decide')[]
}

export interface UnitCheck {
  unit: string
  valid: boolean
  dimension: string
  message?: string
  common: string[]
}

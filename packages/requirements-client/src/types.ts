/**
 * DTOs of the Requirements API v1 (mirrors the OpenAPI schemas published by
 * @ews/requirements-service at /api/requirements/v1/openapi.json; the API's
 * conformance tests validate real responses against that document).
 */
import type { RequirementLifecycleStatus } from '@ews/platform-sdk'

export type AttributeValue = string | number | boolean | string[] | null
export type Priority = 'high' | 'medium' | 'low'
export type RelationshipType = 'derives-from' | 'decomposes' | 'depends-on' | 'allocated-to'
export type Role = 'reader' | 'editor' | 'reviewer' | 'administrator'

export interface Requirement {
  id: string
  key: string
  projectId: string
  revision: number
  title: string
  statement: string
  statementXhtml: string | null
  rationale: string
  type: string
  source: string
  owner: string | null
  priority: Priority | null
  status: RequirementLifecycleStatus
  archived: boolean
  applicability: string[]
  verificationMethods: string[]
  acceptanceCriteria: string
  attributes: Record<string, Exclude<AttributeValue, null>>
  legacyIds: string[]
  changeReason: string
  revisionCreatedAt: string
  revisionCreatedBy: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
  openReviewId: string | null
  baselineId?: string
}

export interface RequirementCreate {
  title: string
  statement: string
  rationale?: string
  type?: string
  source?: string
  owner?: string | null
  priority?: Priority | null
  applicability?: string[]
  verificationMethods?: string[]
  acceptanceCriteria?: string
  attributes?: Record<string, AttributeValue>
  collectionId?: string
  parentNodeId?: string
  reason?: string
}

export type RequirementPatch = Partial<Omit<RequirementCreate, 'collectionId' | 'parentNodeId' | 'reason'>> & { key?: string }

export interface ListQuery {
  text?: string
  status?: RequirementLifecycleStatus[]
  type?: string[]
  priority?: Priority[]
  owner?: string
  ids?: string[]
  keys?: string[]
  collectionId?: string
  allocatedTo?: string
  includeArchived?: boolean
  configurationId?: string
  baselineId?: string
  sort?: 'key' | '-updated'
  cursor?: string
  limit?: number
}

export interface Page<T> {
  items: T[]
  nextCursor?: string
  total?: number
}

export interface RevisionSummary {
  revision: number
  title: string
  changeReason: string
  createdAt: string
  createdBy: string
  statusAtCreation: RequirementLifecycleStatus
}

export interface FieldChange {
  field: string
  from: unknown
  to: unknown
}

export interface AuditEvent {
  id: string
  entityType: string
  entityId: string
  action: string
  revision: number | null
  actor: string
  occurredAt: string
  reason: string
  details: Record<string, unknown>
}

export interface LifecycleEvent {
  id: string
  revision: number
  fromStatus: RequirementLifecycleStatus
  toStatus: RequirementLifecycleStatus
  reviewId: string | null
  actor: string
  occurredAt: string
  reason: string
}

export interface Relationship {
  id: string
  projectId: string
  type: RelationshipType
  fromId: string
  toRequirementId: string | null
  toTwinId: string | null
  revision: number
  deleted: boolean
  rationale: string
  fromRequirementRevision: number
  toRequirementRevision: number | null
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface RelationshipRule {
  type: RelationshipType
  to: 'requirement' | 'twin-component'
  acyclic: boolean
  meaning: string
  reads: string
  sysml: string
}

export interface ImpactItem {
  kind: 'requirement' | 'twin-component' | 'baseline' | 'collection' | 'review'
  id: string
  label: string
  via: string
  depth: number
}

export interface TraceMatrix {
  rows: { id: string; key: string; title: string }[]
  columns: { id: string; label: string; kind: string }[]
  cells: { row: string; column: string; types: string[] }[]
  truncated: boolean
}

export interface Collection {
  id: string
  projectId: string
  name: string
  description: string
  kind: 'document' | 'set'
  revision: number
  structureRevision: number
  archived: boolean
  requirementCount: number
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface CollectionNode {
  id: string
  parentId: string | null
  position: number
  depth: number
  number: string
  kind: 'heading' | 'requirement'
  heading: string | null
  requirementId: string | null
  key: string | null
  title: string | null
  status: RequirementLifecycleStatus | null
}

export interface CollectionTree {
  collection: Collection
  nodes: CollectionNode[]
  baselineId?: string
}

export interface AttributeDefinition {
  id: string
  projectId: string
  key: string
  name: string
  description: string
  dataType: 'string' | 'integer' | 'real' | 'boolean' | 'date' | 'enumeration' | 'xhtml'
  multiValued: boolean
  minValue: number | null
  maxValue: number | null
  maxLength: number | null
  required: boolean
  revision: number
  archived: boolean
  enumValues: { id: string; key: string; label: string; position: number; archived: boolean }[]
}

export interface Review {
  id: string
  requirementId: string
  requirementRevision: number
  state: 'open' | 'approved' | 'rejected' | 'withdrawn' | 'superseded'
  requestedBy: string
  requestedAt: string
  note: string
  closedBy: string | null
  closedAt: string | null
  decisions: { id: string; decision: 'approve' | 'reject' | 'comment'; comment: string; decidedBy: string; decidedAt: string }[]
}

export interface Comment {
  id: string
  requirementId: string
  revision: number
  body: string
  author: string
  createdAt: string
}

export interface ExternalReference {
  id: string
  requirementId: string
  system: string
  externalId: string
  url: string | null
  note: string
  createdAt: string
  createdBy: string
  sourceMapping?: boolean
}

export interface Baseline {
  id: string
  projectId: string
  name: string
  description: string
  configurationId: string | null
  scopeCollectionIds: string[] | null
  requirementCount: number
  relationshipCount: number
  createdAt: string
  createdBy: string
}

export interface BaselineComparison {
  from: string
  to: string
  requirements: { id: string; key: string; change: 'added' | 'removed' | 'changed' | 'unchanged'; fromRevision: number | null; toRevision: number | null; fields: string[] }[]
  relationships: { id: string; change: string; type: string; from: string; to: string }[]
  structure: { collectionId: string; change: string; detail: string }[]
}

export interface BulkOperation {
  requirementId: string
  expectedRevision: number
  set?: Pick<RequirementPatch, 'type' | 'owner' | 'priority' | 'applicability' | 'verificationMethods' | 'source' | 'attributes'>
  archive?: boolean
  addToCollectionId?: string
  transition?: 'request-review' | 'withdraw' | 'retire' | 'reinstate' | 'reopen'
}

export interface BulkOutcome {
  requirementId: string
  ok: boolean
  revision?: number
  error?: { code: string; message: string; details?: Record<string, unknown> }
}

export interface BulkResult {
  atomic: boolean
  committed: boolean
  outcomes: BulkOutcome[]
}

export interface SavedView {
  id: string
  projectId: string
  owner: string
  name: string
  shared: boolean
  definition: Record<string, unknown>
  revision: number
  createdAt: string
  updatedAt: string
}

export interface QualityFinding {
  ruleId: string
  class: 'validation' | 'heuristic' | 'assistant'
  severity: 'error' | 'warning' | 'info'
  field: string
  message: string
  explanation: string
  suggestion: string
  evidence?: string
  fingerprint: string
  reference?: string
  dismissal?: { reason: string; by: string; at: string }
}

export interface QualityReport {
  requirementId: string
  revision: number
  findings: QualityFinding[]
  disclaimer: string
}

export interface QualitySummary {
  requirementsChecked: number
  byRule: Record<string, number>
  items: { requirementId: string; key: string; title: string; revision: number; open: number; dismissed: number; topRules: string[] }[]
  disclaimer: string
}

export interface Conventions {
  settings: Record<string, unknown>
  revision: number
  updatedAt: string | null
  updatedBy: string | null
}

export interface MyPermissions {
  userId: string
  role: Role | null
  entitlements: string[]
  permissions: string[]
  fullModule: boolean
}

export type ImportRecordState = 'new' | 'changed' | 'unchanged' | 'conflicting' | 'unsupported'

export interface ImportPreviewRecord {
  /** Stable key used for decisions, e.g. "spec-object:<external id>". */
  key: string
  kind: 'requirement' | 'heading' | 'relationship' | 'collection'
  state: ImportRecordState
  externalId: string
  label: string
  localId: string | null
  localKey: string | null
  changes: { field: string; from: unknown; to: unknown }[]
  notes: string[]
}

export interface ImportPreview {
  format: 'reqif' | 'json'
  source: { key: string; name: string; matchedSourceId: string | null; matchedBy: string }
  header: Record<string, unknown>
  counts: Record<ImportRecordState, number>
  records: ImportPreviewRecord[]
  attributeMappings: { externalId: string; name: string; dataType: string; target: string; note?: string }[]
  relationshipMappings: { externalType: string; name: string; target: string; note?: string }[]
  findings: { severity: 'error' | 'warning' | 'info'; code: string; message: string; path?: string }[]
  unsupported: { kind: string; count: number; treatment: string }[]
  policies: string[]
  schemaValidation: { performed: boolean; valid: boolean | null; schema: string; errors: string[] }
}

export interface ImportJob {
  id: string
  projectId: string
  format: 'reqif' | 'json'
  status: 'previewed' | 'applied' | 'failed' | 'discarded'
  fileName: string
  sha256: string
  byteSize: number
  sourceId: string | null
  sourceKey: string | null
  preview: ImportPreview
  result: Record<string, unknown> | null
  createdAt: string
  createdBy: string
  appliedAt: string | null
  appliedBy: string | null
}

export interface ExportRequest {
  format: 'reqif' | 'reqifz' | 'json'
  collectionIds?: string[]
  requirementIds?: string[]
  configurationId?: string
  baselineId?: string
  includeArchived?: boolean
  sourceId?: string | null
  title?: string
}

export interface ExportJob {
  id: string
  projectId: string
  format: string
  request: Record<string, unknown>
  report: { requirements?: number; relationships?: number; collections?: number; lossy?: string[]; notes?: string[]; schemaValidation?: { performed: boolean; valid: boolean | null; errors: string[] } } & Record<string, unknown>
  fileName: string
  mediaType: string
  byteSize: number
  createdAt: string
  createdBy: string
}

export interface ExchangeSource {
  id: string
  format: string
  sourceKey: string
  name: string
  createdAt: string
  createdBy: string
  mappedRecords: number
}

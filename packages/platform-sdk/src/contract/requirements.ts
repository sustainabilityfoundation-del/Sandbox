/**
 * Requirements service: the cross-module contract (SDK 1.2).
 *
 * This is the part of the Requirements Management API that other modules
 * (SysML, CAD, the workspace shell) may use. The Requirements module owns the
 * implementation (HTTP adapter over its PostgreSQL-backed API, plus an explicit
 * demo adapter) and its full API (collections, attributes, reviews, baselines,
 * ReqIF), which is published as OpenAPI. Consumers never import Requirements
 * implementation packages or tables; they receive this interface from the host.
 *
 * Agreed contract: docs/specifications/requirements-contracts.md. Changes are
 * coordinator-owned and follow the root AGENTS.md "Contract changes" process.
 */

export const REQUIREMENTS_CONTRACT_VERSION = '1.0.0'

/** Canonical, stable requirement identity: a UUID. Never shown as the human-readable identifier. */
export type RequirementId = string

export type RequirementLifecycleStatus = 'draft' | 'in-review' | 'approved' | 'retired'

/** A requirement as other modules see it. Canonical fields are owned by Requirements. */
export interface RequirementSummary {
  id: RequirementId
  /** Human-readable identifier, unique within the project (e.g. "REQ-001"). May be renumbered; never use it as a key. */
  key: string
  projectId: string
  /** Immutable revision number of this snapshot (1, 2, …). */
  revision: number
  title: string
  /** Normative text only; rationale and comments are separate. */
  statement: string
  type: string
  status: RequirementLifecycleStatus
  archived: boolean
  /** Configurations the requirement applies to; empty means all. */
  applicability: string[]
  verificationMethods: string[]
  updatedAt: string
}

/**
 * A reference to a requirement. With `revision` it is exact and never follows
 * later edits; without it, it deliberately means "latest working revision".
 */
export interface RequirementRef {
  id: RequirementId
  revision?: number
}

/** How a read is scoped: the working state of a configuration, or a requirements baseline. */
export interface RequirementsReadScope {
  projectId: string
  configurationId?: string
  /** Read the pinned revisions of this baseline instead of the working state. */
  baselineId?: string
}

export interface RequirementsQuery extends RequirementsReadScope {
  ids?: RequirementId[]
  keys?: string[]
  text?: string
  status?: RequirementLifecycleStatus[]
  includeArchived?: boolean
  /** Opaque cursor from a previous page. */
  cursor?: string
  /** 1–200; default 50. */
  limit?: number
}

export interface Page<T> {
  items: T[]
  nextCursor?: string
  /** Total matches, when cheap to compute. */
  total?: number
}

/**
 * Cross-module trace link types and their direction. Requirement-to-requirement
 * links and allocation are owned by Requirements; `references` and `satisfies`
 * are owned by SysML and stored in the shared twin (see the contracts document).
 */
export type RequirementTraceType = 'derives-from' | 'decomposes' | 'depends-on' | 'allocated-to' | 'references' | 'satisfies' | 'verifies'

export interface RequirementTraceLink {
  id: string
  type: RequirementTraceType
  /** Requirement ID, twin object ID (component, SysML element) or artifact ID, per the type's endpoints. */
  from: string
  to: string
  ownerModule: 'requirements' | 'sysml' | 'verification'
  /** Requirement revision the link was made against, when the link pins one. */
  fromRevision?: number
}

/** Fields a consumer (for example SysML) may set when creating a requirement through the API. */
export interface RequirementCreateInput {
  projectId: string
  title: string
  statement: string
  type?: string
  rationale?: string
  collectionId?: string
}

/** Canonical fields editable through this contract; the same validation applies as in the Requirements tool. */
export interface RequirementPatch {
  title?: string
  statement?: string
  rationale?: string
  type?: string
}

export interface RequirementWriteOptions {
  /** Optimistic concurrency: the write fails with `conflict` unless the current revision equals this. */
  expectedRevision: number
  /** Why the change was made; recorded in the change history. */
  reason?: string
  /** Makes a retried request safe: the same key returns the first outcome. */
  idempotencyKey?: string
}

export type RequirementsEventType =
  | 'requirement.created'
  | 'requirement.updated'
  | 'requirement.archived'
  | 'requirement.restored'
  | 'requirement.relationships-changed'
  | 'requirements.baseline-created'
  | 'requirements.import-completed'

/** Emitted only after the change is committed (transactional outbox). Delivery may repeat; dedupe by `eventId`. */
export interface RequirementsEvent {
  eventId: string
  type: RequirementsEventType
  projectId: string
  /** The changed requirement, baseline or import job. */
  entityId: string
  committedRevision: number
  configurationId?: string
  occurredAt: string
  actor: string
}

export type RequirementsErrorCode = 'not-found' | 'conflict' | 'invalid' | 'forbidden' | 'unauthenticated' | 'unavailable'

export class RequirementsServiceError extends Error {
  constructor(
    readonly code: RequirementsErrorCode,
    message: string,
    /** For `conflict`: the current revision. For `invalid`: field-level problems. */
    readonly details?: { currentRevision?: number; fields?: Record<string, string> },
  ) {
    super(message)
    this.name = 'RequirementsServiceError'
  }
}

export interface RequirementsService {
  readonly contractVersion: string
  /** 'api': the PostgreSQL-backed HTTP API. 'demo': explicit in-browser demo data. Never switches silently. */
  readonly mode: 'api' | 'demo'
  get: (id: RequirementId, scope: RequirementsReadScope & { revision?: number }) => Promise<RequirementSummary | undefined>
  /** Resolves a human-readable key, or a legacy twin ID such as "REQ-001", to the canonical requirement. */
  resolve: (keyOrLegacyId: string, scope: RequirementsReadScope) => Promise<RequirementSummary | undefined>
  list: (query: RequirementsQuery) => Promise<Page<RequirementSummary>>
  create: (input: RequirementCreateInput, options: { idempotencyKey: string; reason?: string }) => Promise<RequirementSummary>
  update: (id: RequirementId, patch: RequirementPatch, options: RequirementWriteOptions) => Promise<RequirementSummary>
  traceLinks: (id: RequirementId, scope: RequirementsReadScope) => Promise<RequirementTraceLink[]>
  /** Committed-change notifications for a project. Returns an unsubscribe function. */
  subscribe: (projectId: string, listener: (event: RequirementsEvent) => void) => () => void
}

/** Platform services a host may provide to tools (SDK 1.2). Absent when unavailable or not entitled. */
export interface PlatformServices {
  requirements?: RequirementsService
}

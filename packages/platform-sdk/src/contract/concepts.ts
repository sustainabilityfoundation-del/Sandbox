/**
 * Conceptualize: the cross-module Concepts contract (SDK 1.5).
 *
 * A Concept is a persistent, implementation-independent engineering idea (function, solution,
 * component, system …). Conceptualize owns Concepts, their revisions, relationships, alternatives,
 * decisions, trade studies and ConceptImplementations (links from Concepts to concrete artifacts in
 * other modules). Other modules use only this interface, through `services.concepts`; they never read
 * Conceptualize storage or import its packages. Agreed contract:
 * docs/specifications/conceptualize-contracts.md.
 */

export const CONCEPTS_CONTRACT_VERSION = '1.0.0'

/** Canonical Concept identity: a UUID. `key` (e.g. "CON-001") is display text only. */
export type ConceptId = string

/** Maturity, tracked separately from implementation and verification status. Not a mandatory sequence. */
export type ConceptMaturity = 'idea' | 'exploring' | 'defined' | 'evaluated' | 'selected' | 'engineering-development' | 'implemented' | 'verified' | 'superseded' | 'archived'

/** Starting classification; it never restricts what the Concept can become. */
export type ConceptAbstraction = 'function' | 'component' | 'assembly' | 'subsystem' | 'system' | 'abstract'

export interface ConceptSummary {
  id: ConceptId
  key: string
  projectId: string
  /** Immutable revision number of this snapshot. */
  revision: number
  name: string
  /** Short natural-language description (the full intent is in the module API). */
  summary: string
  abstraction: ConceptAbstraction
  classifications: string[]
  maturity: ConceptMaturity
  updatedAt: string
}

/** Module that owns a referenced artifact. 'twin' = an object or artifact of the shared twin. */
export type ArtifactModule = 'requirements' | 'sysml' | 'cad' | 'analysis' | 'twin' | 'external' | 'projects' | 'product' | 'conceptualize'

/**
 * Every module that can own a referenced artifact (SDK 1.7): 'projects' (Project Management entities:
 * documents, work items, milestones, baselines), 'product' (product registry elements, ADR-0063) and
 * 'conceptualize' (Conceptualize records referenced by other modules) besides the original modules.
 * `ArtifactModule` was widened to the same union with CR-PM-CON-1; this alias is kept for existing imports.
 */
export type PlatformArtifactModule = ArtifactModule | 'projects' | 'product' | 'conceptualize'

export const PLATFORM_ARTIFACT_MODULES: readonly PlatformArtifactModule[] = ['requirements', 'sysml', 'cad', 'analysis', 'twin', 'external', 'projects', 'product', 'conceptualize']

/**
 * A version-aware reference to an artifact owned by another module. With `revision` it pins that
 * revision; without, it deliberately follows the latest. Authoritative data stays in the owning module.
 */
export interface ArtifactRef {
  module: ArtifactModule
  /** Canonical ID in the owning module (requirement UUID, twin object ID, artifact ID, URL for external). */
  id: string
  revision?: number
  /** e.g. 'requirement', 'part', 'assembly', 'sysml-element', 'cad-representation', 'calculation'. */
  kind?: string
}

export type ImplementationStatus = 'candidate' | 'in-development' | 'implemented' | 'retired'

/** A concrete realization of one or more Concepts. Concepts keep their identity when it changes. */
export interface ConceptImplementationSummary {
  id: string
  name: string
  conceptIds: ConceptId[]
  status: ImplementationStatus
  artifacts: ArtifactRef[]
  updatedAt: string
}

export interface ConceptsQuery {
  projectId: string
  ids?: ConceptId[]
  text?: string
  maturity?: ConceptMaturity[]
  cursor?: string
  /** 1–200; default 50. */
  limit?: number
}

export interface ConceptPage {
  items: ConceptSummary[]
  nextCursor?: string
  total?: number
}

export type ConceptsEventType =
  | 'concept.created'
  | 'concept.revised'
  | 'concept.relationships-changed'
  | 'concept.implementation-linked'
  | 'concept.implementation-unlinked'
  | 'concept.selected'
  | 'concept.superseded'
  | 'concept.decision-recorded'

/** Emitted only after commit (transactional outbox); dedupe by eventId. */
export interface ConceptsEvent {
  eventId: string
  type: ConceptsEventType
  projectId: string
  /** The Concept, implementation or decision. */
  entityId: string
  committedRevision: number
  occurredAt: string
  actor: string
}

export type ConceptsErrorCode = 'not-found' | 'conflict' | 'invalid' | 'forbidden' | 'unauthenticated' | 'unavailable'

export class ConceptsServiceError extends Error {
  constructor(
    readonly code: ConceptsErrorCode,
    message: string,
    readonly details?: { currentRevision?: number; fields?: Record<string, string> },
  ) {
    super(message)
    this.name = 'ConceptsServiceError'
  }
}

export interface ConceptsService {
  readonly contractVersion: string
  /** 'api': the PostgreSQL-backed service. 'demo': explicit in-browser data. Never switches silently. */
  readonly mode: 'api' | 'demo'
  get: (id: ConceptId, scope: { projectId: string; revision?: number }) => Promise<ConceptSummary | undefined>
  list: (query: ConceptsQuery) => Promise<ConceptPage>
  /** Concepts an artifact realizes (for "realizes concept" links in SysML, CAD, Requirements, the inspector). */
  conceptsForArtifact: (artifact: ArtifactRef, scope: { projectId: string }) => Promise<{ concept: ConceptSummary; implementation: ConceptImplementationSummary }[]>
  implementations: (conceptId: ConceptId, scope: { projectId: string }) => Promise<ConceptImplementationSummary[]>
  subscribe: (projectId: string, listener: (event: ConceptsEvent) => void) => () => void
  /**
   * A design constraint at a revision (SDK 1.8, demonstration D1). Bounds are authoritative here: other modules
   * (for example CAD checks) read them instead of trusting values supplied by a caller. Optional: absent in
   * hosts whose Conceptualize does not provide it yet.
   */
  getConstraint?: (id: string, scope: { projectId: string; revision?: number }) => Promise<ConstraintSummary | undefined>
}

/** Design constraint as other modules read it (SDK 1.8). Mirrors Conceptualize's record; display text is not identity. */
export interface ConstraintSummary {
  id: string
  /** Human key, e.g. 'CST-004'. */
  key: string
  projectId: string
  /** Revision returned (the requested one, or the latest). */
  revision: number
  latestRevision: number
  kind: 'qualitative' | 'logical' | 'mathematical' | 'dimensional' | 'interface'
  statement: string
  bound: { symbol?: string; operator: '<=' | '<' | '=' | '>=' | '>' | 'in-range'; quantity: { value?: number | null; min?: number | null; max?: number | null; unit: string } } | null
  strength: 'hard' | 'soft' | 'preference'
  status: 'proposed' | 'active' | 'relaxed' | 'retired'
  /** Basis of knowledge (ADR-0043), e.g. 'user-assertion', 'assumption', 'ai-hypothesis'. */
  basis: string
  /** The requirement it formalizes, pinned, if any. */
  formalizes: ArtifactRef | null
}

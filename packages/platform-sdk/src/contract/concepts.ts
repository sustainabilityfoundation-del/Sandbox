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
export type ArtifactModule = 'requirements' | 'sysml' | 'cad' | 'analysis' | 'twin' | 'external'

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
}

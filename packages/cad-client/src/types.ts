import type { CadDocument } from '@ews/cad-core'

/** Summary of a stored CAD document (its current revision). */
export interface CadDocumentSummary {
  id: string
  projectId: string
  title: string
  revision: number
  archived: boolean
  formatVersion: string
  modelVersion: number
  partCount: number
  featureCount: number
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface CadProvenance {
  sourceKind: 'user' | 'assistant' | 'import' | 'system'
  conversationId?: string
  proposalId?: string
  messageId?: string
}

export interface CadRevisionInfo {
  revision: number
  title: string
  formatVersion: string
  modelVersion: number
  partCount: number
  featureCount: number
  message: string
  actor: string
  source: CadProvenance
  createdAt: string
}

export type CadEventType = 'cad.document-created' | 'cad.revision-created' | 'cad.document-archived'

export interface CadEvent {
  eventId: string
  type: CadEventType
  projectId: string
  documentId: string
  revision?: number
  occurredAt: string
  actor: string
  sourceKind: string
}

/** Platform reference to a CAD Modeler entity (CR-CAD-1). */
export interface CadEntityRef {
  module: 'cad'
  kind: 'cad-modeler-entity'
  /** `<documentUuid>/<entityId>`; the document ID twice for the whole document. */
  id: string
  revision?: number
}

export interface WriteOptions {
  idempotencyKey: string
  message?: string
  provenance?: CadProvenance
}

export type CadClientErrorCode = 'invalid' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'unavailable'

export class CadClientError extends Error {
  constructor(
    readonly code: CadClientErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'CadClientError'
  }
}

/** The CAD document store as the tool sees it (until PlatformServices.cad lands in SDK 1.6). */
export interface CadClient {
  /** 'api': the PostgreSQL-backed service. 'local': explicit in-browser store. Never switches silently. */
  readonly mode: 'api' | 'local'
  list: (projectId: string, options?: { includeArchived?: boolean }) => Promise<CadDocumentSummary[]>
  get: (projectId: string, documentId: string, revision?: number) => Promise<{ summary: CadDocumentSummary; revision: CadRevisionInfo; document: CadDocument }>
  create: (projectId: string, document: CadDocument, options: WriteOptions) => Promise<{ summary: CadDocumentSummary; revision: CadRevisionInfo }>
  /** New revision; fails with `conflict` (details.currentRevision) when expectedRevision is stale. */
  save: (projectId: string, documentId: string, document: CadDocument, options: WriteOptions & { expectedRevision: number }) => Promise<{ summary: CadDocumentSummary; revision: CadRevisionInfo; unchanged: boolean }>
  revisions: (projectId: string, documentId: string) => Promise<CadRevisionInfo[]>
  archive: (projectId: string, documentId: string, archived: boolean, options: { expectedRevision: number; idempotencyKey?: string }) => Promise<CadDocumentSummary>
  resolveEntity: (projectId: string, documentId: string, entityId: string, revision?: number) => Promise<{ ref: CadEntityRef; entityType: string; label: string; documentTitle: string; verifiedInGeometry: boolean }>
  /** Committed-change events of a project; returns an unsubscribe function. */
  subscribe: (projectId: string, listener: (e: CadEvent) => void) => () => void
}

export function newIdempotencyKey(): string {
  return `cad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function entityRef(documentId: string, entityId?: string, revision?: number): CadEntityRef {
  return { module: 'cad', kind: 'cad-modeler-entity', id: `${documentId}/${entityId ?? documentId}`, ...(revision !== undefined ? { revision } : {}) }
}

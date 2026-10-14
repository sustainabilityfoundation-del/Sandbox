import type { RequirementsEvent } from '@ews/platform-sdk'
import { HttpTransport, newIdempotencyKey, openEventStream, type HttpConfig } from './transport'
import type * as T from './types'

export interface WriteOpts {
  expectedRevision: number
  reason?: string
  idempotencyKey?: string
}

/**
 * The Requirements module's full typed client (used by the Requirements tool). Every write
 * carries an expected revision or an idempotency key; nothing is retried silently and nothing
 * falls back to other data when the API fails.
 */
export class RequirementsModuleClient {
  readonly transport: HttpTransport
  constructor(config: HttpConfig, readonly projectId: string) {
    this.transport = new HttpTransport(config)
  }

  private p(path = '') {
    return `/projects/${encodeURIComponent(this.projectId)}${path}`
  }
  private async get<R>(path: string, query?: Record<string, string | number | boolean | string[] | undefined | null>) {
    return (await this.transport.request<R>('GET', this.p(path), { query })).data
  }
  private async send<R>(method: string, path: string, body: unknown, opts: { idempotencyKey?: string; ifMatch?: number; query?: Record<string, string | number | boolean | undefined> } = {}) {
    return (await this.transport.request<R>(method, this.p(path), { body, idempotencyKey: opts.idempotencyKey, ifMatch: opts.ifMatch, query: opts.query })).data
  }

  // ---- requirements ----------------------------------------------------------------------------------
  list(q: T.ListQuery = {}) {
    return this.get<T.Page<T.Requirement>>('/requirements', { ...q } as Record<string, string | number | boolean | string[] | undefined>)
  }
  getRequirement(id: string, scope: { revision?: number; baselineId?: string } = {}) {
    return this.get<T.Requirement>(`/requirements/${id}`, scope)
  }
  resolve(key: string, scope: { baselineId?: string; configurationId?: string } = {}) {
    return this.get<T.Requirement>('/requirements/resolve', { key, ...scope })
  }
  create(input: T.RequirementCreate, idempotencyKey = newIdempotencyKey()) {
    return this.send<T.Requirement>('POST', '/requirements', input, { idempotencyKey })
  }
  update(id: string, patch: T.RequirementPatch, opts: WriteOpts) {
    return this.send<T.Requirement>('PATCH', `/requirements/${id}`, { ...patch, expectedRevision: opts.expectedRevision, reason: opts.reason }, { idempotencyKey: opts.idempotencyKey })
  }
  archive(id: string, opts: WriteOpts) {
    return this.send<T.Requirement>('POST', `/requirements/${id}/archive`, { expectedRevision: opts.expectedRevision, reason: opts.reason }, { idempotencyKey: opts.idempotencyKey })
  }
  restore(id: string, opts: WriteOpts) {
    return this.send<T.Requirement>('POST', `/requirements/${id}/restore`, { expectedRevision: opts.expectedRevision, reason: opts.reason }, { idempotencyKey: opts.idempotencyKey })
  }
  transition(id: string, action: 'request-review' | 'withdraw' | 'reopen' | 'retire' | 'reinstate', opts: WriteOpts) {
    return this.send<T.Requirement>('POST', `/requirements/${id}/transitions`, { action, expectedRevision: opts.expectedRevision, reason: opts.reason }, { idempotencyKey: opts.idempotencyKey })
  }
  revisions(id: string) {
    return this.get<T.RevisionSummary[]>(`/requirements/${id}/revisions`)
  }
  compare(id: string, from: number, to: number) {
    return this.get<{ requirementId: string; from: number; to: number; changes: T.FieldChange[] }>(`/requirements/${id}/compare`, { from, to })
  }
  history(id: string) {
    return this.get<T.AuditEvent[]>(`/requirements/${id}/history`)
  }
  lifecycle(id: string) {
    return this.get<T.LifecycleEvent[]>(`/requirements/${id}/lifecycle`)
  }
  reviews(id: string) {
    return this.get<T.Review[]>(`/requirements/${id}/reviews`)
  }
  decide(id: string, reviewId: string, decision: 'approve' | 'reject' | 'comment', opts: { expectedRevision: number; comment?: string }) {
    return this.send<T.Review>('POST', `/requirements/${id}/reviews/${reviewId}/decisions`, { decision, comment: opts.comment, expectedRevision: opts.expectedRevision }, { idempotencyKey: newIdempotencyKey() })
  }
  comments(id: string) {
    return this.get<T.Comment[]>(`/requirements/${id}/comments`)
  }
  addComment(id: string, body: string) {
    return this.send<T.Comment>('POST', `/requirements/${id}/comments`, { body }, { idempotencyKey: newIdempotencyKey() })
  }
  externalReferences(id: string) {
    return this.get<T.ExternalReference[]>(`/requirements/${id}/external-references`)
  }
  addExternalReference(id: string, input: { system: string; externalId: string; url?: string; note?: string }) {
    return this.send<T.ExternalReference>('POST', `/requirements/${id}/external-references`, input, { idempotencyKey: newIdempotencyKey() })
  }
  collectionsOf(id: string) {
    return this.get<{ id: string; name: string; nodeId: string }[]>(`/requirements/${id}/collections`)
  }

  // ---- relationships -------------------------------------------------------------------------------------
  relationshipTypes() {
    return this.get<T.RelationshipRule[]>('/relationship-types')
  }
  relationshipsOf(id: string, baselineId?: string) {
    return this.get<T.Relationship[]>(`/requirements/${id}/relationships`, { baselineId })
  }
  listRelationships(q: { type?: T.RelationshipType; toTwinId?: string; baselineId?: string; limit?: number } = {}) {
    return this.get<T.Relationship[]>('/relationships', q)
  }
  createRelationship(input: { type: T.RelationshipType; fromId: string; toRequirementId?: string; toTwinId?: string; rationale?: string; reason?: string }) {
    return this.send<T.Relationship>('POST', '/relationships', input, { idempotencyKey: newIdempotencyKey() })
  }
  deleteRelationship(id: string, expectedRevision: number, reason?: string) {
    return this.send<T.Relationship>('DELETE', `/relationships/${id}`, undefined, { ifMatch: expectedRevision, query: { reason } })
  }
  impact(id: string, depth?: number) {
    return this.get<{ requirementId: string; revision: number; items: T.ImpactItem[]; note: string }>(`/requirements/${id}/impact`, { depth })
  }
  traceMatrix(q: { collectionId?: string; types?: T.RelationshipType[]; columns?: 'requirements' | 'components'; baselineId?: string; limit?: number } = {}) {
    return this.get<T.TraceMatrix>('/trace-matrix', q)
  }

  // ---- collections ---------------------------------------------------------------------------------------
  collections(includeArchived = false) {
    return this.get<T.Collection[]>('/collections', { includeArchived })
  }
  createCollection(input: { name: string; description?: string; kind?: 'document' | 'set' }) {
    return this.send<T.Collection>('POST', '/collections', input, { idempotencyKey: newIdempotencyKey() })
  }
  updateCollection(id: string, patch: { name?: string; description?: string; archived?: boolean }, expectedRevision: number) {
    return this.send<T.Collection>('PATCH', `/collections/${id}`, { ...patch, expectedRevision })
  }
  tree(id: string, baselineId?: string) {
    return this.get<T.CollectionTree>(`/collections/${id}`, { baselineId })
  }
  addNode(collectionId: string, input: { kind: 'heading' | 'requirement'; heading?: string; requirementId?: string; parentId?: string | null; position?: number }, expectedStructureRevision: number) {
    return this.send<T.CollectionNode>('POST', `/collections/${collectionId}/nodes`, { ...input, expectedStructureRevision }, { idempotencyKey: newIdempotencyKey() })
  }
  moveNode(collectionId: string, nodeId: string, to: { parentId: string | null; position: number }, expectedStructureRevision: number) {
    return this.send<T.CollectionNode[]>('POST', `/collections/${collectionId}/nodes/${nodeId}/move`, { ...to, expectedStructureRevision })
  }
  renameHeading(collectionId: string, nodeId: string, heading: string, expectedStructureRevision: number) {
    return this.send<T.CollectionNode[]>('PATCH', `/collections/${collectionId}/nodes/${nodeId}`, { heading, expectedStructureRevision })
  }
  removeNode(collectionId: string, nodeId: string, expectedStructureRevision: number) {
    return this.send<T.CollectionNode[]>('DELETE', `/collections/${collectionId}/nodes/${nodeId}`, undefined, { query: { expectedStructureRevision } })
  }

  // ---- attributes, baselines, bulk, views ---------------------------------------------------------------------
  attributeDefinitions() {
    return this.get<T.AttributeDefinition[]>('/attribute-definitions')
  }
  createAttributeDefinition(input: Partial<T.AttributeDefinition> & { key: string; name: string; dataType: T.AttributeDefinition['dataType']; enumValues?: { key: string; label: string }[] }) {
    return this.send<T.AttributeDefinition>('POST', '/attribute-definitions', input, { idempotencyKey: newIdempotencyKey() })
  }
  baselines() {
    return this.get<T.Baseline[]>('/baselines')
  }
  createBaseline(input: { name: string; description?: string; configurationId?: string; collectionIds?: string[]; includeArchived?: boolean }) {
    return this.send<T.Baseline>('POST', '/baselines', input, { idempotencyKey: newIdempotencyKey() })
  }
  compareBaseline(id: string, to: string | 'working') {
    return this.get<T.BaselineComparison>(`/baselines/${id}/compare`, { to })
  }
  bulk(operations: T.BulkOperation[], opts: { atomic?: boolean; reason?: string } = {}) {
    return this.send<T.BulkResult>('POST', '/bulk', { operations, atomic: opts.atomic ?? true, reason: opts.reason }, { idempotencyKey: newIdempotencyKey() })
  }
  views() {
    return this.get<T.SavedView[]>('/views')
  }
  saveView(input: { name: string; shared?: boolean; definition: Record<string, unknown> }, existing?: { id: string; revision: number }) {
    return existing
      ? this.send<T.SavedView>('PUT', `/views/${existing.id}`, { ...input, expectedRevision: existing.revision })
      : this.send<T.SavedView>('POST', '/views', input, { idempotencyKey: newIdempotencyKey() })
  }
  deleteView(id: string, expectedRevision: number) {
    return this.send<void>('DELETE', `/views/${id}`, undefined, { query: { expectedRevision } })
  }

  // ---- quality -------------------------------------------------------------------------------------------------
  quality(id: string, revision?: number) {
    return this.get<T.QualityReport>(`/requirements/${id}/quality`, { revision })
  }
  dismiss(id: string, input: { revision: number; ruleId: string; fingerprint: string; reason: string }) {
    return this.send<T.QualityReport>('POST', `/requirements/${id}/quality/dismissals`, input, { idempotencyKey: newIdempotencyKey() })
  }
  qualitySummary(collectionId?: string) {
    return this.get<T.QualitySummary>('/quality', { collectionId })
  }
  conventions() {
    return this.get<T.Conventions>('/quality/conventions')
  }
  putConventions(settings: Record<string, unknown>, expectedRevision: number) {
    return this.send<T.Conventions>('PUT', '/quality/conventions', { settings, expectedRevision })
  }
  permissions() {
    return this.get<T.MyPermissions>('/permissions')
  }

  // ---- exchange -------------------------------------------------------------------------------------------------
  async previewImport(file: Uint8Array | Blob, opts: { fileName: string; format?: 'reqif' | 'json'; sourceKey?: string; sourceName?: string }) {
    const isZip = /\.reqifz$|\.zip$/i.test(opts.fileName)
    return (
      await this.transport.request<T.ImportJob>('POST', this.p('/imports'), {
        rawBody: file,
        contentType: isZip ? 'application/zip' : opts.format === 'json' ? 'application/octet-stream' : 'application/xml',
        query: { fileName: opts.fileName, format: opts.format ?? (/\.json$/i.test(opts.fileName) ? 'json' : 'reqif'), sourceKey: opts.sourceKey, sourceName: opts.sourceName },
        idempotencyKey: newIdempotencyKey(),
      })
    ).data
  }
  importJob(id: string) {
    return this.get<T.ImportJob>(`/imports/${id}`)
  }
  importJobs() {
    return this.get<T.ImportJob[]>('/imports')
  }
  applyImport(id: string, input: { decisions?: Record<string, 'take-incoming' | 'keep-local' | 'skip'>; collectionName?: string } = {}) {
    return this.send<T.ImportJob>('POST', `/imports/${id}/apply`, input, { idempotencyKey: newIdempotencyKey() })
  }
  discardImport(id: string) {
    return this.send<T.ImportJob>('POST', `/imports/${id}/discard`, {})
  }
  exportFile(request: T.ExportRequest) {
    return this.send<T.ExportJob>('POST', '/exports', request, { idempotencyKey: newIdempotencyKey() })
  }
  async exportContent(id: string) {
    return (await this.transport.request<Uint8Array>('GET', this.p(`/exports/${id}/content`), { accept: 'bytes' })).data
  }
  exchangeSources() {
    return this.get<T.ExchangeSource[]>('/exchange-sources')
  }
  attachmentUrl(id: string) {
    return this.transport.url(this.p(`/attachments/${id}/content`))
  }

  // ---- events --------------------------------------------------------------------------------------------------
  events(handlers: { onEvent: (e: RequirementsEvent) => void; onReset?: () => void; onStatus?: (s: 'connecting' | 'open' | 'retrying', error?: string) => void }) {
    return openEventStream(this.transport, this.p('/events'), handlers)
  }
}

import type { ConceptMaturity, ConceptsEvent } from '@ews/platform-sdk'
import { HttpTransport, newIdempotencyKey, openEventStream, type HttpConfig, type Provenance } from './transport'
import type * as T from './types'

/** Options of a write: expected revision (concurrency), idempotency key (safe retries), provenance (who and why). */
export interface WriteOpts {
  expectedRevision?: number
  idempotencyKey?: string
  provenance?: Provenance
  reason?: string
}

type Q = Record<string, string | number | boolean | string[] | undefined | null>

/**
 * The Conceptualize module's full typed client (used by the Conceptualize tool and its assistant
 * actions). Every write carries an expected revision or an idempotency key and optional provenance;
 * nothing is retried silently and nothing falls back to other data when the API fails.
 */
export class ConceptsModuleClient {
  readonly transport: HttpTransport
  constructor(
    config: HttpConfig,
    readonly projectId: string,
  ) {
    this.transport = new HttpTransport(config)
  }

  private p(path = '') {
    return `/projects/${encodeURIComponent(this.projectId)}${path}`
  }
  private async get<R>(path: string, query?: Q) {
    return (await this.transport.request<R>('GET', this.p(path), { query })).data
  }
  private async send<R>(method: string, path: string, body: unknown, opts: WriteOpts = {}) {
    return (await this.transport.request<R>(method, this.p(path), { body, idempotencyKey: opts.idempotencyKey, provenance: opts.provenance })).data
  }
  private create<R>(path: string, body: unknown, opts: WriteOpts = {}) {
    return this.send<R>('POST', path, body, { ...opts, idempotencyKey: opts.idempotencyKey ?? newIdempotencyKey() })
  }

  // ---- concepts ---------------------------------------------------------------------------------------------
  list(q: T.ListQuery = {}) {
    return this.get<T.Page<T.ConceptListItem>>('/concepts', { ...q } as Q)
  }
  concept(id: string, revision?: number) {
    return this.get<T.Concept>(`/concepts/${id}`, { revision })
  }
  createConcept(input: T.ConceptCreate, opts: WriteOpts = {}) {
    return this.create<T.Concept>('/concepts', input, opts)
  }
  updateConcept(id: string, patch: T.ConceptPatch, opts: WriteOpts & { expectedRevision: number }) {
    return this.send<T.Concept>('PATCH', `/concepts/${id}`, { ...patch, expectedRevision: opts.expectedRevision, ...(opts.reason ? { reason: opts.reason } : {}) }, opts)
  }
  revisions(id: string) {
    return this.get<T.RevisionSummary[]>(`/concepts/${id}/revisions`)
  }
  compare(id: string, from: number, to: number) {
    return this.get<{ from: number; to: number; changes: { field: string; from: unknown; to: unknown }[] }>(`/concepts/${id}/compare`, { from, to })
  }
  history(id: string) {
    return this.get<T.AuditEvent[]>(`/concepts/${id}/history`)
  }
  projectHistory(q: { proposalId?: string; limit?: number } = {}) {
    return this.get<T.AuditEvent[]>('/history', q)
  }
  changeMaturity(id: string, to: ConceptMaturity, opts: WriteOpts & { expectedRevision: number; reason: string; replacedBy?: string }) {
    return this.send<T.Concept>('POST', `/concepts/${id}/maturity`, { to, expectedRevision: opts.expectedRevision, reason: opts.reason, ...(opts.replacedBy ? { replacedBy: opts.replacedBy } : {}) }, opts)
  }
  changeVerificationStatus(id: string, status: T.VerificationStatus, evidenceIds: string[], opts: WriteOpts & { expectedRevision: number; reason: string }) {
    return this.send<T.Concept>('POST', `/concepts/${id}/verification-status`, { status, evidenceIds, expectedRevision: opts.expectedRevision, reason: opts.reason }, opts)
  }
  branch(id: string, input: { name?: string; alternativeSetId?: string; reason?: string } = {}, opts: WriteOpts = {}) {
    return this.create<T.Concept>(`/concepts/${id}/branch`, input, opts)
  }
  assessment(id: string) {
    return this.get<T.Assessment>(`/concepts/${id}/assessment`)
  }
  graph(includeArchived = false) {
    return this.get<T.Graph>('/graph', { includeArchived })
  }

  // ---- relationships -------------------------------------------------------------------------------------------
  relationshipTypes() {
    return this.get<T.RelationshipTypeInfo[]>('/relationship-types')
  }
  relationships(q: { conceptId?: string; type?: string; includeRemoved?: boolean } = {}) {
    return this.get<T.Relationship[]>('/relationships', q)
  }
  createRelationship(input: T.RelationshipCreate, opts: WriteOpts = {}) {
    return this.create<T.Relationship>('/relationships', input, opts)
  }
  removeRelationship(id: string, opts: WriteOpts & { expectedRevision: number }) {
    return this.send<T.Relationship>('POST', `/relationships/${id}/remove`, { expectedRevision: opts.expectedRevision, ...(opts.reason ? { reason: opts.reason } : {}) }, opts)
  }
  decompositions(parentId?: string) {
    return this.get<T.Decomposition[]>('/decompositions', { parentId })
  }
  createDecomposition(input: { parentId: string; name: string; description?: string }, opts: WriteOpts = {}) {
    return this.create<T.Decomposition>('/decompositions', input, opts)
  }
  updateDecomposition(id: string, patch: { name?: string; description?: string; status?: T.Decomposition['status'] }, opts: WriteOpts & { expectedRevision: number }) {
    return this.send<T.Decomposition>('PATCH', `/decompositions/${id}`, { ...patch, expectedRevision: opts.expectedRevision }, opts)
  }

  // ---- alternatives and decisions ----------------------------------------------------------------------------------
  alternativeSets(conceptId?: string) {
    return this.get<T.AlternativeSet[]>('/alternative-sets', { conceptId })
  }
  alternativeSet(id: string) {
    return this.get<T.AlternativeSet>(`/alternative-sets/${id}`)
  }
  createAlternativeSet(input: { parentId: string; name: string; question?: string; memberIds?: string[] }, opts: WriteOpts = {}) {
    return this.create<T.AlternativeSet>('/alternative-sets', input, opts)
  }
  addAlternative(setId: string, conceptId: string, opts: WriteOpts = {}) {
    return this.send<T.AlternativeSet>('POST', `/alternative-sets/${setId}/members`, { conceptId }, opts)
  }
  withdrawAlternative(setId: string, conceptId: string, opts: WriteOpts = {}) {
    return this.send<T.AlternativeSet>('POST', `/alternative-sets/${setId}/members/${conceptId}/withdraw`, opts.reason ? { reason: opts.reason } : {}, opts)
  }
  decisions(q: { conceptId?: string; setId?: string } = {}) {
    return this.get<T.Decision[]>('/decisions', q)
  }
  decision(id: string) {
    return this.get<T.Decision>(`/decisions/${id}`)
  }
  createDecision(input: T.DecisionCreate, opts: WriteOpts = {}) {
    return this.create<T.Decision>('/decisions', input, opts)
  }
  recordDecision(id: string, opts: WriteOpts & { expectedRevision: number }) {
    return this.send<T.Decision>('POST', `/decisions/${id}/record`, { expectedRevision: opts.expectedRevision, ...(opts.reason ? { reason: opts.reason } : {}) }, opts)
  }
  withdrawDecision(id: string, opts: WriteOpts & { expectedRevision: number }) {
    return this.send<T.Decision>('POST', `/decisions/${id}/withdraw`, { expectedRevision: opts.expectedRevision, ...(opts.reason ? { reason: opts.reason } : {}) }, opts)
  }

  // ---- trade studies -----------------------------------------------------------------------------------------------------
  tradeStudies(q: { setId?: string; conceptId?: string } = {}) {
    return this.get<T.TradeStudy[]>('/trade-studies', q)
  }
  tradeStudy(id: string) {
    return this.get<T.TradeStudy>(`/trade-studies/${id}`)
  }
  createTradeStudy(input: T.TradeStudyCreate, opts: WriteOpts = {}) {
    return this.create<T.TradeStudy>('/trade-studies', input, opts)
  }
  updateTradeStudy(id: string, patch: T.TradeStudyPatch, opts: WriteOpts & { expectedRevision: number }) {
    return this.send<T.TradeStudy>('PATCH', `/trade-studies/${id}`, { ...patch, expectedRevision: opts.expectedRevision }, opts)
  }
  putScores(id: string, scores: T.ScoreInput[], opts: WriteOpts & { expectedRevision: number }) {
    return this.send<T.TradeStudy>('PUT', `/trade-studies/${id}/scores`, { expectedRevision: opts.expectedRevision, scores }, opts)
  }

  // ---- evidence -------------------------------------------------------------------------------------------------------------
  evidence(conceptId?: string) {
    return this.get<T.Evidence[]>('/evidence', { conceptId })
  }
  createEvidence(input: T.EvidenceCreate, opts: WriteOpts = {}) {
    return this.create<T.Evidence>('/evidence', input, opts)
  }

  // ---- implementations and links ------------------------------------------------------------------------------------------------
  implementations(conceptId?: string) {
    return this.get<T.Implementation[]>('/implementations', { conceptId })
  }
  implementation(id: string) {
    return this.get<T.Implementation>(`/implementations/${id}`)
  }
  createImplementation(input: T.ImplementationCreate, opts: WriteOpts = {}) {
    return this.create<T.Implementation>('/implementations', input, opts)
  }
  updateImplementation(id: string, patch: T.ImplementationPatch, opts: WriteOpts & { expectedRevision: number }) {
    return this.send<T.Implementation>('PATCH', `/implementations/${id}`, { ...patch, expectedRevision: opts.expectedRevision }, opts)
  }
  linkArtifact(id: string, artifact: T.ArtifactRefInput, opts: WriteOpts & { expectedRevision: number; replaces?: string }) {
    return this.send<T.Implementation>('POST', `/implementations/${id}/artifacts`, { expectedRevision: opts.expectedRevision, artifact, ...(opts.replaces ? { replaces: opts.replaces } : {}), ...(opts.reason ? { reason: opts.reason } : {}) }, opts)
  }
  unlinkArtifact(id: string, linkId: string, opts: WriteOpts & { expectedRevision: number }) {
    return this.send<T.Implementation>('POST', `/implementations/${id}/artifacts/${linkId}/remove`, { expectedRevision: opts.expectedRevision, ...(opts.reason ? { reason: opts.reason } : {}) }, opts)
  }
  repinArtifact(id: string, linkId: string, revision: number | null, opts: WriteOpts & { expectedRevision: number }) {
    return this.send<T.Implementation>('POST', `/implementations/${id}/artifacts/${linkId}/repin`, { expectedRevision: opts.expectedRevision, revision, ...(opts.reason ? { reason: opts.reason } : {}) }, opts)
  }
  requestRealization(id: string, input: T.RealizationCreate, opts: WriteOpts & { expectedRevision: number }) {
    return this.send<T.Implementation>('POST', `/implementations/${id}/realization-requests`, { ...input, expectedRevision: opts.expectedRevision }, { ...opts, idempotencyKey: opts.idempotencyKey ?? newIdempotencyKey() })
  }
  setRealizationStatus(requestId: string, status: 'cancelled' | 'fulfilled', opts: WriteOpts & { fulfilledBy?: T.ArtifactRefInput } = {}) {
    return this.send<T.Implementation>('POST', `/realization-requests/${requestId}/status`, { status, ...(opts.fulfilledBy ? { fulfilledBy: opts.fulfilledBy } : {}), ...(opts.reason ? { reason: opts.reason } : {}) }, opts)
  }
  artifactConcepts(module: T.ArtifactRefInput['module'], id: string) {
    return this.get<T.ArtifactConcepts>('/artifact-concepts', { module, id })
  }
  links(q: { conceptId?: string; module?: string; artifactId?: string; includeRemoved?: boolean } = {}) {
    return this.get<T.ConceptLink[]>('/links', q)
  }
  createLink(conceptId: string, input: { relation: T.LinkRelation; artifact: T.ArtifactRefInput; note?: string }, opts: WriteOpts = {}) {
    return this.create<T.ConceptLink>(`/concepts/${conceptId}/links`, input, opts)
  }
  removeLink(linkId: string, opts: WriteOpts = {}) {
    return this.send<T.ConceptLink>('POST', `/links/${linkId}/remove`, opts.reason ? { reason: opts.reason } : {}, opts)
  }
  repinLink(linkId: string, revision: number | null, opts: WriteOpts = {}) {
    return this.send<T.ConceptLink>('POST', `/links/${linkId}/repin`, { revision, ...(opts.reason ? { reason: opts.reason } : {}) }, opts)
  }

  // ---- explorations ------------------------------------------------------------------------------------------------------------------
  explorations(conceptId?: string) {
    return this.get<T.Exploration[]>('/explorations', { conceptId })
  }
  createExploration(input: T.ExplorationCreate, opts: WriteOpts = {}) {
    return this.create<T.Exploration>('/explorations', input, opts)
  }
  undoExploration(id: string, opts: WriteOpts = {}) {
    return this.send<T.Exploration>('POST', `/explorations/${id}/undo`, opts.reason ? { reason: opts.reason } : {}, opts)
  }

  // ---- functions (CR-C1) ----------------------------------------------------------------------------------
  functions(q: { text?: string; status?: string; ids?: string } = {}) {
    return this.get<T.DesignFunction[]>('/functions', q)
  }
  function(id: string, revision?: number) {
    return this.get<T.DesignFunction>(`/functions/${id}`, { revision })
  }
  createFunction(input: T.FunctionCreate, opts: WriteOpts = {}) {
    return this.create<T.DesignFunction>('/functions', input, opts)
  }
  updateFunction(id: string, patch: T.FunctionPatch, opts: WriteOpts & { expectedRevision: number }) {
    return this.send<T.DesignFunction>('PATCH', `/functions/${id}`, { ...patch, expectedRevision: opts.expectedRevision, ...(opts.reason ? { reason: opts.reason } : {}) }, opts)
  }
  functionRevisions(id: string) {
    return this.get<T.RevisionSummary[]>(`/functions/${id}/revisions`)
  }
  createFunctionDecomposition(functionId: string, input: { name: string; description?: string }, opts: WriteOpts = {}) {
    return this.create<T.Decomposition>(`/functions/${functionId}/decompositions`, input, opts)
  }
  /** Explicit conversion of a function-Concept (CR-C1 step 3); the Concept stays as history. */
  convertToFunction(conceptId: string, opts: WriteOpts & { expectedRevision: number }) {
    return this.create<T.Conversion>(`/concepts/${conceptId}/convert-to-function`, { expectedRevision: opts.expectedRevision, ...(opts.reason ? { reason: opts.reason } : {}) }, opts)
  }

  // ---- constraints (CR-C2) --------------------------------------------------------------------------------
  constraints(q: { subjectId?: string; status?: string; text?: string } = {}) {
    return this.get<T.DesignConstraint[]>('/constraints', q)
  }
  constraint(id: string, revision?: number) {
    return this.get<T.DesignConstraint>(`/constraints/${id}`, { revision })
  }
  createConstraint(input: T.ConstraintCreate, opts: WriteOpts = {}) {
    return this.create<T.DesignConstraint>('/constraints', input, opts)
  }
  /** reviseConstraint (R1): content changes and, optionally, a status in one call. */
  updateConstraint(id: string, patch: T.ConstraintPatch & { status?: T.ConstraintStatus }, opts: WriteOpts & { expectedRevision: number }) {
    return this.send<T.DesignConstraint>('PATCH', `/constraints/${id}`, { ...patch, expectedRevision: opts.expectedRevision }, opts)
  }
  changeConstraintStatus(id: string, status: T.ConstraintStatus, opts: WriteOpts & { expectedRevision: number; reason: string }) {
    return this.send<T.DesignConstraint>('POST', `/constraints/${id}/status`, { status, expectedRevision: opts.expectedRevision, reason: opts.reason }, opts)
  }
  constraintRevisions(id: string) {
    return this.get<T.RevisionSummary[]>(`/constraints/${id}/revisions`)
  }
  /** User-invoked promotion of a constraint statement with a quantity (CR-C2); the statement stays unchanged. */
  promoteStatement(conceptId: string, input: { statementId: string; kind?: T.ConstraintKind; strength?: T.ConstraintStrength; operator?: T.Bound['operator']; reason?: string }, opts: WriteOpts = {}) {
    return this.create<T.DesignConstraint>(`/concepts/${conceptId}/promote-statement`, input, opts)
  }

  // ---- assumptions (CR-C3) ----------------------------------------------------------------------------------
  assumptions(q: { subjectId?: string; statementId?: string; status?: string; text?: string } = {}) {
    return this.get<T.Assumption[]>('/assumptions', q)
  }
  assumption(id: string, revision?: number) {
    return this.get<T.Assumption>(`/assumptions/${id}`, { revision })
  }
  createAssumption(input: T.AssumptionCreate, opts: WriteOpts = {}) {
    return this.create<T.Assumption>('/assumptions', input, opts)
  }
  updateAssumption(id: string, patch: T.AssumptionPatch, opts: WriteOpts & { expectedRevision: number }) {
    return this.send<T.Assumption>('PATCH', `/assumptions/${id}`, { ...patch, expectedRevision: opts.expectedRevision }, opts)
  }
  /** setAssumptionValidation (R1-2): validated needs evidence; a reviewer when a recorded decision rests on the assumption. */
  changeAssumptionValidation(id: string, status: T.AssumptionStatus, opts: WriteOpts & { expectedRevision?: number; reason: string; evidence?: T.DesignRef; evidenceIds?: string[] }) {
    return this.send<T.Assumption>('POST', `/assumptions/${id}/validation`, { status, reason: opts.reason, ...(opts.expectedRevision ? { expectedRevision: opts.expectedRevision } : {}), ...(opts.evidence ? { evidence: opts.evidence } : {}), ...(opts.evidenceIds ? { evidenceIds: opts.evidenceIds } : {}) }, opts)
  }
  assumptionRevisions(id: string) {
    return this.get<T.RevisionSummary[]>(`/assumptions/${id}/revisions`)
  }
  assumptionsFromStatements(conceptId: string, opts: WriteOpts = {}) {
    return this.send<T.Assumption[]>('POST', `/concepts/${conceptId}/assumptions-from-statements`, {}, opts)
  }

  // ---- link registry and design links (CR-C4) --------------------------------------------------------------------
  linkTypes() {
    return this.get<T.LinkType[]>('/link-types')
  }
  registerLinkType(input: T.LinkTypeCreate, opts: WriteOpts = {}) {
    return this.create<T.LinkType>('/link-types', input, opts)
  }
  /** Design links touching a record (id), optionally of one type. Served at /design-links (/links are Concept→artifact links). */
  designLinks(q: { id?: string; type?: string; includeRemoved?: boolean } = {}) {
    return this.get<T.DesignLink[]>('/design-links', q)
  }
  designLink(id: string) {
    return this.get<T.DesignLink>(`/design-links/${id}`)
  }
  createDesignLink(input: T.DesignLinkCreate, opts: WriteOpts = {}) {
    return this.create<T.DesignLink>('/design-links', input, opts)
  }
  removeDesignLink(id: string, opts: WriteOpts & { expectedRevision: number }) {
    return this.send<T.DesignLink>('POST', `/design-links/${id}/remove`, { expectedRevision: opts.expectedRevision, ...(opts.reason ? { reason: opts.reason } : {}) }, opts)
  }

  // ---- decision and evidence extensions (CR-C5, CR-C6) ----------------------------------------------------------
  /** flagDecisionForReview (R1-7): only recorded decisions. */
  flagDecision(id: string, input: { reason: string; conditionId?: string; impactReportId?: string; impactReportRef?: T.ArtifactRefInput }, opts: WriteOpts = {}) {
    return this.send<T.Decision>('POST', `/decisions/${id}/review-flag`, input, opts)
  }
  changeDecisionValidity(id: string, validity: 'valid' | 'invalidated', opts: WriteOpts & { expectedRevision: number; reason: string; invalidatedBy?: T.AnyRef }) {
    return this.send<T.Decision>('POST', `/decisions/${id}/validity`, { validity, expectedRevision: opts.expectedRevision, reason: opts.reason, ...(opts.invalidatedBy ? { invalidatedBy: opts.invalidatedBy } : {}) }, opts)
  }
  rationale(decisionId: string) {
    return this.get<T.Rationale>(`/decisions/${decisionId}/rationale`)
  }
  evidenceRecord(id: string) {
    return this.get<T.Evidence>(`/evidence/${id}`)
  }
  reviewEvidence(id: string, input: { outcome: 'accepted' | 'rejected'; method?: string; note?: string }, opts: WriteOpts = {}) {
    return this.send<T.Evidence>('POST', `/evidence/${id}/reviews`, input, opts)
  }

  // ---- batch, graph and search (CR-C10, CR-C9) ---------------------------------------------------------------------
  /** All or nothing, with placeholders ("$name") resolved across operations. */
  batch(items: T.BatchItem[], opts: WriteOpts = {}) {
    return this.create<T.BatchResult>('/batch', { items, ...(opts.reason ? { reason: opts.reason } : {}) }, opts)
  }
  traverse(request: T.TraverseRequest) {
    return this.send<T.TraverseResult>('POST', '/graph/traverse', request)
  }
  neighbourhood(type: T.DesignEntityType, id: string, depth = 1, asOf?: string) {
    return this.get<T.TraverseResult>('/graph/neighbourhood', { type, id, depth, asOf })
  }
  paths(from: T.AnyRef, to: T.AnyRef, q: { maxDepth?: number; follow?: string[]; limit?: number; asOf?: string } = {}) {
    return this.send<T.PathsResult>('POST', '/graph/paths', { from, to, ...q })
  }
  search(q: string, types?: T.DesignEntityType[], limit?: number) {
    return this.get<T.SearchResult>('/search', { q, types: types?.join(','), limit })
  }
  entityHistory(entityId: string) {
    return this.get<T.AuditEvent[]>('/entity-history', { entityId })
  }

  // ---- utilities ------------------------------------------------------------------------------------------------------------------------
  permissions() {
    return this.get<T.MyPermissions>('/me/permissions')
  }
  checkUnit(unit: string) {
    return this.get<T.UnitCheck>('/units', { unit })
  }
  events(handlers: { onEvent: (e: ConceptsEvent) => void; onReset?: () => void; onStatus?: (s: 'connecting' | 'open' | 'retrying', error?: string) => void }, options: { retryMs?: number } = {}) {
    return openEventStream(this.transport, this.p('/events'), handlers as never, options)
  }
}

import { HttpTransport, newIdempotencyKey, openEventStream, type HttpConfig, type Provenance, type StreamHandle } from './transport'
import type { ProjectsEvent } from '@ews/platform-sdk'
import type {
  ActivityEntry,
  Artifact,
  Breakdown,
  BreakdownNode,
  CreateProjectInput,
  Link,
  Member,
  Milestone,
  ModuleState,
  Page,
  ProductElement,
  Project,
  ProjectContext,
  ProjectDocument,
  ProjectTemplate,
  PropertyValue,
  ElementKind,
  WorkItem,
  WorkItemInput,
} from './types'

export interface WriteOpts {
  idempotencyKey?: string
  provenance?: Provenance
  dryRun?: boolean
}

const enc = encodeURIComponent

/**
 * The full typed client of the Project Management API (used by the workspace's project screens and the
 * `projects.*` assistant actions). Other modules use the SDK `ProjectsService` instead.
 */
export class ProjectsClient {
  readonly transport: HttpTransport
  constructor(config: HttpConfig) {
    this.transport = new HttpTransport(config)
  }

  private p(projectId: string) {
    return `/projects/${enc(projectId)}`
  }

  private async get<T>(path: string, query?: Record<string, string | number | boolean | string[] | undefined>) {
    return (await this.transport.request<T>('GET', path, { query })).data
  }

  private async write<T>(method: string, path: string, body: unknown, opts: WriteOpts & { ifMatch?: number; idempotent?: boolean; headers?: Record<string, string> } = {}) {
    return (
      await this.transport.request<T>(method, path, {
        body,
        ifMatch: opts.ifMatch,
        idempotencyKey: opts.idempotencyKey ?? (opts.idempotent ? newIdempotencyKey() : undefined),
        provenance: opts.provenance,
        query: opts.dryRun ? { dryRun: true } : undefined,
      })
    ).data
  }

  // ---- projects
  listProjects(query: { q?: string; status?: string[]; state?: string; discipline?: string; sort?: string; limit?: number; cursor?: string } = {}) {
    return this.get<Page<Project>>('/projects', query)
  }
  recentProjects() {
    return this.get<Project[]>('/me/recent-projects')
  }
  createProject(input: CreateProjectInput, opts: WriteOpts = {}) {
    return this.write<Project>('POST', '/projects', input, { ...opts, idempotent: true })
  }
  getProject(projectId: string) {
    return this.get<Project>(this.p(projectId))
  }
  updateProject(projectId: string, revision: number, input: Partial<Pick<Project, 'name' | 'description' | 'objectives' | 'scope' | 'disciplines' | 'status' | 'tags' | 'key' | 'ownerId'>>, opts: WriteOpts = {}) {
    return this.write<Project>('PATCH', this.p(projectId), input, { ...opts, ifMatch: revision })
  }
  openProject(projectId: string) {
    return this.write<ProjectContext>('POST', `${this.p(projectId)}/open`, undefined)
  }
  context(projectId: string) {
    return this.get<ProjectContext>(`${this.p(projectId)}/context`)
  }
  provision(projectId: string) {
    return this.write<ModuleState[]>('POST', `${this.p(projectId)}/provision`, undefined)
  }
  archiveProject(projectId: string, reason?: string, opts: WriteOpts = {}) {
    return this.write<Project>('POST', `${this.p(projectId)}/archive`, { reason }, opts)
  }
  restoreProject(projectId: string, reason?: string, opts: WriteOpts = {}) {
    return this.write<Project>('POST', `${this.p(projectId)}/restore`, { reason }, opts)
  }
  /** Soft delete; `confirmKey` is the project key the person typed (sent as X-Confirm). */
  async deleteProject(projectId: string, confirmKey: string, opts: WriteOpts = {}) {
    const res = await this.transport.request<Project>('DELETE', this.p(projectId), { query: opts.dryRun ? { dryRun: true } : undefined, provenance: opts.provenance, headers: { 'X-Confirm': confirmKey } })
    return res.data
  }
  duplicateProject(projectId: string, input: { key: string; name: string; include?: { members?: boolean; milestones?: boolean; workItems?: boolean } }, opts: WriteOpts = {}) {
    return this.write<Project>('POST', `${this.p(projectId)}/duplicate`, input, { ...opts, idempotent: true })
  }
  templates() {
    return this.get<ProjectTemplate[]>('/templates')
  }

  // ---- members
  members(projectId: string) {
    return this.get<Member[]>(`${this.p(projectId)}/members`)
  }
  setMember(projectId: string, userId: string, role: Member['role']) {
    return this.write<{ userId: string; role: string }>('PUT', `${this.p(projectId)}/members/${enc(userId)}`, { role })
  }
  removeMember(projectId: string, userId: string) {
    return this.write<void>('DELETE', `${this.p(projectId)}/members/${enc(userId)}`, undefined)
  }

  // ---- registry and links
  artifacts(projectId: string, query: { q?: string; module?: string; kind?: string; category?: string; lifecycle?: string; sort?: string; limit?: number; cursor?: string } = {}) {
    return this.get<Page<Artifact>>(`${this.p(projectId)}/artifacts`, query)
  }
  artifact(projectId: string, artifactId: string) {
    return this.get<Artifact & { links: Link[] }>(`${this.p(projectId)}/artifacts/${enc(artifactId)}`)
  }
  links(projectId: string, query: { artifactId?: string; direction?: 'out' | 'in' | 'both'; type?: string } = {}) {
    return this.get<Link[]>(`${this.p(projectId)}/links`, query)
  }
  createLink(projectId: string, input: { type: string; from: { artifactId: string; revision?: string | number }; to: { artifactId: string; revision?: string | number }; note?: string }, opts: WriteOpts = {}) {
    return this.write<Link>('POST', `${this.p(projectId)}/links`, input, opts)
  }

  // ---- work items, milestones
  workItems(projectId: string, query: { kind?: string; status?: string; open?: boolean; subject?: string; q?: string; sort?: string; limit?: number } = {}) {
    return this.get<Page<WorkItem>>(`${this.p(projectId)}/work-items`, query)
  }
  createWorkItem(projectId: string, input: WorkItemInput, opts: WriteOpts = {}) {
    return this.write<WorkItem>('POST', `${this.p(projectId)}/work-items`, input, { ...opts, idempotent: true })
  }
  updateWorkItem(projectId: string, id: string, revision: number, input: Partial<Omit<WorkItemInput, 'kind'>>, opts: WriteOpts = {}) {
    return this.write<WorkItem>('PATCH', `${this.p(projectId)}/work-items/${enc(id)}`, input, { ...opts, ifMatch: revision })
  }
  milestones(projectId: string) {
    return this.get<Milestone[]>(`${this.p(projectId)}/milestones`)
  }
  createMilestone(projectId: string, input: { name: string; description?: string; due?: string; deliverables?: string[] }, opts: WriteOpts = {}) {
    return this.write<Milestone>('POST', `${this.p(projectId)}/milestones`, input, { ...opts, idempotent: true })
  }
  updateMilestone(projectId: string, id: string, revision: number, input: { name?: string; description?: string; due?: string | null; status?: Milestone['status'] }) {
    return this.write<Milestone>('PATCH', `${this.p(projectId)}/milestones/${enc(id)}`, input, { ifMatch: revision })
  }

  // ---- documents
  documents(projectId: string) {
    return this.get<ProjectDocument[]>(`${this.p(projectId)}/documents`)
  }
  createDocument(projectId: string, input: { title: string; description?: string; documentKind?: string; subjects?: string[] }) {
    return this.write<ProjectDocument>('POST', `${this.p(projectId)}/documents`, input, { idempotent: true })
  }
  async uploadDocumentVersion(projectId: string, id: string, revision: number, file: { bytes: Uint8Array | Blob; fileName: string; mediaType?: string; note?: string }) {
    const res = await this.transport.request<ProjectDocument>('POST', `${this.p(projectId)}/documents/${enc(id)}/versions`, {
      rawBody: file.bytes,
      contentType: file.mediaType ?? 'application/octet-stream',
      ifMatch: revision,
      headers: { 'X-File-Name': encodeURIComponent(file.fileName), ...(file.note ? { 'X-Version-Note': encodeURIComponent(file.note) } : {}) },
    })
    return res.data
  }
  documentVersionUrl(projectId: string, id: string, version: number) {
    return this.transport.url(`${this.p(projectId)}/documents/${enc(id)}/versions/${version}/content`)
  }

  // ---- product structure
  productElements(projectId: string, query: { q?: string; elementKind?: ElementKind } = {}) {
    return this.get<ProductElement[]>(`${this.p(projectId)}/product-elements`, query)
  }
  productElement(projectId: string, idOrAlias: string) {
    return this.get<ProductElement>(`${this.p(projectId)}/product-elements/${enc(idOrAlias)}`)
  }
  createProductElement(projectId: string, input: { name: string; elementKind: ElementKind; description?: string; properties?: Record<string, PropertyValue>; placement?: { breakdownId: string; parentId?: string | null; quantity?: number } }, opts: WriteOpts = {}) {
    return this.write<ProductElement>('POST', `${this.p(projectId)}/product-elements`, input, { ...opts, idempotent: true })
  }
  updateProductElement(projectId: string, id: string, revision: number, input: { name?: string; elementKind?: ElementKind; description?: string; properties?: Record<string, PropertyValue>; lifecycle?: string }) {
    return this.write<ProductElement>('PATCH', `${this.p(projectId)}/product-elements/${enc(id)}`, input, { ifMatch: revision })
  }
  breakdowns(projectId: string) {
    return this.get<Breakdown[]>(`${this.p(projectId)}/breakdowns`)
  }
  createBreakdown(projectId: string, input: { name: string; purpose: Breakdown['purpose']; description?: string }) {
    return this.write<Breakdown>('POST', `${this.p(projectId)}/breakdowns`, input, { idempotent: true })
  }
  breakdownTree(projectId: string, breakdownId: string) {
    return this.get<{ breakdown: Breakdown; roots: BreakdownNode[]; unplaced: string[] }>(`${this.p(projectId)}/breakdowns/${enc(breakdownId)}/tree`)
  }
  addEdge(projectId: string, breakdownId: string, input: { parentId: string | null; childId: string; quantity?: number }) {
    return this.write<{ id: string }>('POST', `${this.p(projectId)}/breakdowns/${enc(breakdownId)}/edges`, input)
  }

  // ---- activity and events
  activity(projectId: string, query: { entityType?: string; entityId?: string; actor?: string; before?: number; limit?: number } = {}) {
    return this.get<ActivityEntry[]>(`${this.p(projectId)}/activity`, query)
  }
  events(projectId: string, handlers: { onEvent: (e: ProjectsEvent) => void; onReset?: () => void; onStatus?: (s: 'connecting' | 'open' | 'retrying', error?: string) => void }): StreamHandle {
    return openEventStream(this.transport, `${this.p(projectId)}/events`, handlers)
  }
}

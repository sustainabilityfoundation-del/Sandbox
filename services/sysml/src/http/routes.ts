import type { FastifyInstance } from 'fastify'
import {
  COMMAND_SCHEMAS,
  CREATABLE_KINDS,
  RULES,
  allMetaclasses,
  attributesOf,
  children,
  diffModels,
  findElements,
  impact,
  incomingReferences,
  isKindOf,
  referencesOfCached,
  semanticsOf,
  serialize,
  toJson,
  type Element,
  type Model,
} from '@ews/sysml-core'
import { forbidden, invalid, notFound } from '../errors'
import type { BranchRow, CommitRow, OnCommit, ProjectRow, TagRow, TransactionOutcome } from '../repository'
import { isUuid } from '../repository'
import { registerRoute, type Ctx, type RequestContext, type RouteSpec } from './route'

// ---- wire shapes (Systems Modeling API resource names) -----------------------------------------
export const projectJson = (p: ProjectRow) => ({ '@id': p.id, '@type': 'Project', name: p.name, description: p.description, created: p.created_at.toISOString(), defaultBranch: p.default_branch_id ? { '@id': p.default_branch_id } : null, platformProjectId: p.platform_project_id, rootElement: { '@id': p.root_element_id } })
export const branchJson = (b: BranchRow) => ({ '@id': b.id, '@type': 'Branch', name: b.name, owningProject: { '@id': b.project_id }, head: b.head_commit_id ? { '@id': b.head_commit_id } : null, referencedCommit: b.head_commit_id ? { '@id': b.head_commit_id } : null, created: b.created_at.toISOString(), revision: b.revision })
export const tagJson = (t: TagRow) => ({ '@id': t.id, '@type': 'Tag', name: t.name, owningProject: { '@id': t.project_id }, taggedCommit: { '@id': t.commit_id }, referencedCommit: { '@id': t.commit_id }, created: t.created_at.toISOString() })
export const commitJson = (c: CommitRow) => ({
  '@id': c.id,
  '@type': 'Commit',
  owningProject: { '@id': c.project_id },
  previousCommit: c.parent_ids.map((id) => ({ '@id': id })),
  created: c.created_at.toISOString(),
  description: c.description,
  number: c.number,
  actor: c.actor,
  source: c.source,
  summary: c.summary,
  changeCount: c.change_count,
  branch: c.branch_id ? { '@id': c.branch_id } : null,
})

/** Records the response of an idempotent write inside the repository's commit transaction. */
function inTx<T>(rc: RequestContext, shape: (r: T) => unknown): OnCommit<T> | undefined {
  const scope = rc.idempotency
  return scope ? (db, r) => scope.record(db, shape(r)) : undefined
}

const uuid = { type: 'string', format: 'uuid' }
const pid = { projectId: uuid }

function paged<T>(items: T[], query: Record<string, unknown>): { items: T[]; nextCursor?: string } {
  const limit = Math.min(Math.max(Number(query.limit ?? query['page[size]'] ?? 100), 1), 5000)
  const start = Number(query.cursor ?? query['page[after]'] ?? 0) || 0
  const slice = items.slice(start, start + limit)
  return { items: slice, ...(start + limit < items.length ? { nextCursor: String(start + limit) } : {}) }
}

async function commitModel(ctx: Ctx, rc: RequestContext): Promise<{ model: Model; commit: CommitRow }> {
  const commit = await ctx.repo.getCommit(rc.project!.id, rc.params.commitId)
  return { model: await ctx.repo.loadModel(rc.project!.id, commit.id), commit }
}

function elementOr404(model: Model, id: unknown): Element {
  if (!isUuid(id)) throw notFound(`No element ${String(id)}.`)
  const el = model.get(id)
  if (!el) throw notFound(`No element ${id} at this commit.`)
  return el
}

const COMMAND_ITEMS = { type: 'array', minItems: 1, maxItems: 500, items: { type: 'object', required: ['op'], properties: { op: { type: 'string' } } } }
const SOURCE = {
  type: 'object',
  additionalProperties: false,
  properties: { kind: { enum: ['user', 'assistant', 'import', 'api'] }, conversationId: { type: 'string', maxLength: 200 }, proposalId: { type: 'string', maxLength: 200 }, messageId: { type: 'string', maxLength: 200 }, tool: { type: 'string', maxLength: 100 } },
  required: ['kind'],
}

export function registerRoutes(app: FastifyInstance, ctx: Ctx, registry: RouteSpec[]) {
  const route = (spec: RouteSpec) => registerRoute(app, ctx, spec, registry)

  // ---- projects -------------------------------------------------------------------------------
  route({
    method: 'GET', path: '/projects', operationId: 'getProjects', tag: 'Projects', alignment: 'aligned', permission: 'read',
    summary: 'SysML projects of the platform projects you are a member of',
    query: { platformProjectId: { type: 'string', description: 'Only projects of this platform project (extension)' } },
    handler: async (rc) => {
      const all = await ctx.repo.listProjects(rc.query.platformProjectId ? [String(rc.query.platformProjectId)] : undefined)
      const roles = new Map<string, unknown>()
      for (const p of all) if (!roles.has(p.platform_project_id)) roles.set(p.platform_project_id, await ctx.host.roleOf(rc.principal.userId, p.platform_project_id))
      return all.filter((p) => roles.get(p.platform_project_id)).map(projectJson)
    },
  })
  route({
    method: 'POST', path: '/projects', operationId: 'postProject', tag: 'Projects', alignment: 'aligned', permission: 'create-project', idempotent: true, responseStatus: 201,
    summary: 'Create a project (with branch main and commit 1: the root namespace, optionally an initial model in textual notation)',
    body: { type: 'object', additionalProperties: false, required: ['name', 'platformProjectId'], properties: { '@type': { const: 'Project' }, name: { type: 'string', minLength: 1, maxLength: 200 }, description: { type: 'string', maxLength: 4000 }, platformProjectId: { type: 'string', minLength: 1, maxLength: 100 }, initialText: { type: 'string', maxLength: 2_000_000 } } },
    handler: async (rc) => {
      const role = await ctx.host.roleOf(rc.principal.userId, rc.body.platformProjectId)
      if (!role) throw forbidden(`You are not a member of project ${rc.body.platformProjectId}.`)
      if (!['editor', 'reviewer', 'administrator'].includes(String(role))) throw forbidden(`Your role (${role}) does not allow creating SysML projects.`)
      const shape = (r: { project: ProjectRow; commit: CommitRow }) => ({ ...projectJson(r.project), headCommit: commitJson(r.commit) })
      const r = await ctx.repo.createProject(rc.principal.userId, { name: rc.body.name, description: rc.body.description, platformProjectId: rc.body.platformProjectId, initialText: rc.body.initialText }, inTx(rc, shape))
      return shape(r)
    },
  })
  route({ method: 'GET', path: '/projects/{projectId}', operationId: 'getProjectById', tag: 'Projects', alignment: 'aligned', permission: 'read', summary: 'A project', params: pid, handler: async (rc) => projectJson(rc.project!) })

  // ---- branches and tags ------------------------------------------------------------------------
  route({ method: 'GET', path: '/projects/{projectId}/branches', operationId: 'getBranches', tag: 'Branches', alignment: 'aligned', permission: 'read', summary: 'Branches of a project', params: pid, handler: async (rc) => (await ctx.repo.listBranches(rc.project!.id)).map(branchJson) })
  route({
    method: 'GET', path: '/projects/{projectId}/branches/{branchId}', operationId: 'getBranchById', tag: 'Branches', alignment: 'aligned', permission: 'read', summary: 'A branch; ETag is its head commit ID', params: { ...pid, branchId: uuid },
    handler: async (rc) => {
      const b = await ctx.repo.getBranch(rc.project!.id, rc.params.branchId)
      if (b.head_commit_id) rc.header('ETag', `"${b.head_commit_id}"`)
      return branchJson(b)
    },
  })
  route({
    method: 'POST', path: '/projects/{projectId}/branches', operationId: 'postBranch', tag: 'Branches', alignment: 'aligned', permission: 'write', idempotent: true, responseStatus: 201, summary: 'Create a branch at a commit', params: pid,
    body: { type: 'object', additionalProperties: false, required: ['name', 'head'], properties: { '@type': { const: 'Branch' }, name: { type: 'string', minLength: 1, maxLength: 100 }, head: { type: 'object', required: ['@id'], properties: { '@id': uuid } } } },
    handler: async (rc) => branchJson(await ctx.repo.createBranch(rc.project!.id, rc.principal.userId, rc.body.name, rc.body.head['@id'], inTx(rc, branchJson))),
  })
  route({ method: 'GET', path: '/projects/{projectId}/tags', operationId: 'getTags', tag: 'Tags', alignment: 'aligned', permission: 'read', summary: 'Tags (baselines) of a project', params: pid, handler: async (rc) => (await ctx.repo.listTags(rc.project!.id)).map(tagJson) })
  route({
    method: 'POST', path: '/projects/{projectId}/tags', operationId: 'postTag', tag: 'Tags', alignment: 'aligned', permission: 'write', idempotent: true, responseStatus: 201, summary: 'Tag a commit (baseline)', params: pid,
    body: { type: 'object', additionalProperties: false, required: ['name', 'taggedCommit'], properties: { '@type': { const: 'Tag' }, name: { type: 'string', minLength: 1, maxLength: 100 }, taggedCommit: { type: 'object', required: ['@id'], properties: { '@id': uuid } } } },
    handler: async (rc) => tagJson(await ctx.repo.createTag(rc.project!.id, rc.principal.userId, rc.body.name, rc.body.taggedCommit['@id'], inTx(rc, tagJson))),
  })

  // ---- commits ----------------------------------------------------------------------------------
  route({
    method: 'GET', path: '/projects/{projectId}/commits', operationId: 'getCommits', tag: 'Commits', alignment: 'aligned', permission: 'read', summary: 'Commits, newest first (optionally only those of a branch)', params: pid,
    query: { branchId: uuid, limit: { type: 'integer', minimum: 1, maximum: 500 }, before: { type: 'integer', minimum: 1, description: 'Only commits with a lower number (paging)' } },
    handler: async (rc) => (await ctx.repo.listCommits(rc.project!.id, { branchId: rc.query.branchId as string | undefined, limit: rc.query.limit as number | undefined, before: rc.query.before as number | undefined })).map(commitJson),
  })
  route({ method: 'GET', path: '/projects/{projectId}/commits/{commitId}', operationId: 'getCommitById', tag: 'Commits', alignment: 'aligned', permission: 'read', summary: 'A commit with provenance (actor, source, description, typed commands summary)', params: { ...pid, commitId: uuid }, handler: async (rc) => commitJson(await ctx.repo.getCommit(rc.project!.id, rc.params.commitId)) })
  route({
    method: 'GET', path: '/projects/{projectId}/commits/{commitId}/changes', operationId: 'getChangesByCommit', tag: 'Commits', alignment: 'aligned', permission: 'read', summary: 'The data versions of a commit (payload null = deleted)', params: { ...pid, commitId: uuid },
    handler: async (rc) => (await ctx.repo.commitChanges(rc.project!.id, rc.params.commitId)).map((v) => ({ '@id': v.version_id, '@type': 'DataVersion', identity: { '@id': v.element_id, '@type': 'DataIdentity' }, payload: v.payload })),
  })
  route({
    method: 'POST', path: '/projects/{projectId}/commits', operationId: 'postCommit', tag: 'Commits', alignment: 'aligned', permission: 'write', idempotent: true, responseStatus: 201,
    summary: 'Commit raw element versions (Systems Modeling API). The core checks well-formedness (references, ownership) before accepting.', params: pid,
    query: { branchId: uuid },
    body: {
      type: 'object', additionalProperties: false, required: ['change'],
      properties: {
        '@type': { const: 'Commit' }, description: { type: 'string', maxLength: 4000 },
        previousCommit: { type: 'object', required: ['@id'], properties: { '@id': uuid } },
        change: { type: 'array', minItems: 1, maxItems: 20000, items: { type: 'object', properties: { '@type': { const: 'DataVersion' }, payload: { type: ['object', 'null'] }, identity: { type: 'object', properties: { '@id': uuid } } } } },
      },
    },
    handler: async (rc) => {
      const branchId = (rc.query.branchId as string | undefined) ?? rc.project!.default_branch_id!
      return commitJson(await ctx.repo.rawCommit(rc.project!.id, branchId, rc.principal.userId, { change: rc.body.change, description: rc.body.description, previousCommitId: rc.body.previousCommit?.['@id'] }, inTx(rc, commitJson)))
    },
  })

  // ---- elements -----------------------------------------------------------------------------------
  route({
    method: 'GET', path: '/projects/{projectId}/commits/{commitId}/elements', operationId: 'getElements', tag: 'Elements', alignment: 'aligned', permission: 'read', summary: 'Elements at a commit (paged with page[size] / page[after]; Link header)', params: { ...pid, commitId: uuid },
    query: { 'page[size]': { type: 'integer', minimum: 1, maximum: 5000 }, 'page[after]': { type: 'string' }, derived: { type: 'boolean' } },
    handler: async (rc) => {
      const { model } = await commitModel(ctx, rc)
      const all = [...model.elements()]
      const page = paged(all, rc.query)
      if (page.nextCursor) rc.header('Link', `<${rc.request.url.split('?')[0]}?page[after]=${page.nextCursor}&page[size]=${page.items.length}>; rel="next"`)
      return page.items.map((e) => toJson(model, e, { derived: rc.query.derived === true }))
    },
  })
  route({
    method: 'GET', path: '/projects/{projectId}/commits/{commitId}/elements/{elementId}', operationId: 'getElementByProjectCommitId', tag: 'Elements', alignment: 'aligned', permission: 'read', summary: 'An element at a commit (?derived=true adds name, qualifiedName, owner, source, target …)', params: { ...pid, commitId: uuid, elementId: uuid },
    query: { derived: { type: 'boolean' } },
    handler: async (rc) => {
      const { model } = await commitModel(ctx, rc)
      return toJson(model, elementOr404(model, rc.params.elementId), { derived: rc.query.derived === true })
    },
  })
  route({
    method: 'GET', path: '/projects/{projectId}/commits/{commitId}/elements/{elementId}/relationships', operationId: 'getRelationshipsByProjectCommitRelatedElement', tag: 'Elements', alignment: 'aligned', permission: 'read', summary: 'Relationships related to an element', params: { ...pid, commitId: uuid, elementId: uuid },
    query: { direction: { enum: ['in', 'out', 'both'] } },
    handler: async (rc) => {
      const { model } = await commitModel(ctx, rc)
      const el = elementOr404(model, rc.params.elementId)
      const s = semanticsOf(model)
      const dir = (rc.query.direction as string | undefined) ?? 'both'
      const out = new Map<string, Element>()
      if (dir !== 'in') for (const r of s.ownedRelationships(el['@id'])) out.set(r['@id'], r)
      if (dir !== 'out') for (const r of model.referencesTo(el['@id'])) {
        const rel = model.get(r)
        if (rel && isKindOf(rel['@type'], 'Relationship')) out.set(r, rel)
      }
      return [...out.values()].map((r) => toJson(model, r, { derived: true }))
    },
  })
  route({
    method: 'GET', path: '/projects/{projectId}/commits/{commitId}/roots', operationId: 'getRootsByProjectCommit', tag: 'Elements', alignment: 'aligned', permission: 'read', summary: 'Root elements (the root namespace)', params: { ...pid, commitId: uuid },
    handler: async (rc) => {
      const { model } = await commitModel(ctx, rc)
      return [toJson(model, model.own(model.rootId)!, { derived: true })]
    },
  })
  route({
    method: 'GET', path: '/projects/{projectId}/commits/{compareCommitId}/diff', operationId: 'getDiffsByProjectCommit', tag: 'Commits', alignment: 'aligned', permission: 'read', summary: 'Element-level semantic diff between a base commit and this commit', params: { ...pid, compareCommitId: uuid },
    query: { baseCommitId: uuid },
    handler: async (rc) => {
      if (!rc.query.baseCommitId) throw invalid('baseCommitId is required.', undefined, 400)
      const pidv = rc.project!.id
      const a = await ctx.repo.loadModel(pidv, (await ctx.repo.getCommit(pidv, String(rc.query.baseCommitId))).id)
      const b = await ctx.repo.loadModel(pidv, (await ctx.repo.getCommit(pidv, rc.params.compareCommitId)).id)
      const sa = semanticsOf(a)
      const sb = semanticsOf(b)
      return diffModels(a, b).map((c) => ({ '@type': 'DataDifference', id: c.id, kind: c.kind, metaclass: c.metaclass, label: c.kind === 'deleted' ? sa.label(c.id) : sb.label(c.id), baseData: c.before ? toJson(a, c.before) : null, compareData: c.after ? toJson(b, c.after) : null }))
    },
  })

  // ---- queries ------------------------------------------------------------------------------------
  route({
    method: 'POST', path: '/projects/{projectId}/query-results', operationId: 'getQueryResultsByProjectIdQuery', tag: 'Queries', alignment: 'aligned', permission: 'read',
    summary: 'Run a query (subset of the API Query: PrimitiveConstraint on @type, declaredName, name, qualifiedName, owner; CompositeConstraint and/or)', params: pid,
    query: { commitId: uuid },
    body: { type: 'object', required: ['where'], properties: { '@type': { const: 'Query' }, select: { type: 'array', items: { type: 'string' } }, where: { type: 'object' } } },
    handler: async (rc) => {
      const commitId = (rc.query.commitId as string | undefined) ?? (await ctx.repo.headCommitId(rc.project!.id, rc.project!.default_branch_id!))
      const model = await ctx.repo.loadModel(rc.project!.id, (await ctx.repo.getCommit(rc.project!.id, commitId)).id)
      const s = semanticsOf(model)
      const test = constraintTest(rc.body.where, s)
      return [...model.elements()].filter(test).slice(0, 5000).map((e) => toJson(model, e, { derived: true }))
    },
  })

  // ---- platform extensions: commands and transactions -------------------------------------------
  route({
    method: 'GET', path: '/commands', operationId: 'describeCommands', tag: 'Schema', alignment: 'extension', permission: 'read',
    summary: 'Schema discovery: typed command schemas, creatable kinds, supported metaclasses with attributes and references, validation rules',
    handler: async () => ({
      commands: COMMAND_SCHEMAS,
      creatableKinds: CREATABLE_KINDS,
      metaclasses: allMetaclasses().map((m) => ({ name: m.name, supers: m.supers, abstract: !!m.abstract, layer: m.layer, attributes: Object.keys(attributesOf(m.name)), references: Object.keys(referencesOfCached(m.name)) })),
      validationRules: RULES,
      notes: 'Element references in commands: UUID, $placeholder (created earlier in the same transaction) or qualified name. Not SysML v2 conformant: see the conformance list in the help.',
    }),
  })
  route({
    method: 'POST', path: '/projects/{projectId}/branches/{branchId}/transactions', operationId: 'postTransaction', tag: 'Transactions', alignment: 'extension', permission: 'write', idempotent: true,
    summary: 'Apply typed commands atomically (or dry-run them): change set, diagnostics introduced/resolved, commit with provenance',
    description: 'Send baseCommitId (or If-Match with the branch ETag). If the branch moved on and none of the elements this transaction changes were changed since, the commands are re-run on the current head (rebased: true); otherwise 409 conflict lists the elements. validationPolicy reject-new-errors refuses changes that introduce validation errors (422 rejected).',
    params: { ...pid, branchId: uuid },
    body: {
      type: 'object', additionalProperties: false, required: ['commands'],
      properties: { baseCommitId: uuid, commands: COMMAND_ITEMS, dryRun: { type: 'boolean' }, validationPolicy: { enum: ['report', 'reject-new-errors'] }, reason: { type: 'string', maxLength: 2000 }, source: SOURCE },
    },
    handler: async (rc) => {
      const ifMatch = typeof rc.request.headers['if-match'] === 'string' ? rc.request.headers['if-match'].replace(/^W\//, '').replace(/"/g, '') : undefined
      const base = rc.body.baseCommitId ?? ifMatch
      if (base !== undefined && !isUuid(base)) throw invalid('If-Match must be the branch ETag (a commit ID).', undefined, 400)
      if (!rc.body.dryRun && !base) throw invalid('Send baseCommitId (or If-Match with the branch ETag); changes are never applied without a version check.', { fields: { baseCommitId: 'required' } }, 400)
      const shape = (o: TransactionOutcome) => ({ ...o, commit: o.commit ? commitJson(o.commit) : undefined })
      const out = await ctx.repo.transact(rc.project!.id, rc.params.branchId, rc.principal.userId, { baseCommitId: base, commands: rc.body.commands, dryRun: rc.body.dryRun, validationPolicy: rc.body.validationPolicy, reason: rc.body.reason, source: rc.body.source }, inTx(rc, shape))
      if (out.commit) rc.header('ETag', `"${out.commit.id}"`)
      return shape(out)
    },
  })
  route({
    method: 'POST', path: '/projects/{projectId}/commits/{commitId}/revert', operationId: 'revertCommit', tag: 'Transactions', alignment: 'extension', permission: 'write', idempotent: true,
    summary: 'Undo a commit with a compensating commit on a branch (refused when later commits changed the same elements)', params: { ...pid, commitId: uuid },
    query: { branchId: uuid, dryRun: { type: 'boolean' } },
    body: { type: ['object', 'null'], additionalProperties: false, properties: { reason: { type: 'string', maxLength: 2000 }, source: SOURCE } },
    handler: async (rc) => {
      const branchId = (rc.query.branchId as string | undefined) ?? rc.project!.default_branch_id!
      const shape = (o: TransactionOutcome) => ({ ...o, commit: o.commit ? commitJson(o.commit) : undefined })
      const out = await ctx.repo.revert(rc.project!.id, rc.params.commitId, branchId, rc.principal.userId, { reason: rc.body?.reason, source: rc.body?.source ? { ...rc.body.source, revertedCommitId: rc.params.commitId } : undefined, dryRun: rc.query.dryRun === true }, inTx(rc, shape))
      return shape(out)
    },
  })

  // ---- platform extensions: model services ------------------------------------------------------
  route({
    method: 'GET', path: '/projects/{projectId}/commits/{commitId}/model', operationId: 'getModelSnapshot', tag: 'Model services', alignment: 'extension', permission: 'read',
    summary: 'All elements of the model at a commit (standard JSON), paged with limit/cursor, for editors', params: { ...pid, commitId: uuid },
    query: { limit: { type: 'integer', minimum: 1, maximum: 20000 }, cursor: { type: 'string' } },
    handler: async (rc) => {
      const { model, commit } = await commitModel(ctx, rc)
      const page = paged([...model.elements()], { limit: rc.query.limit ?? 20000, cursor: rc.query.cursor })
      return { commit: commitJson(commit), rootId: model.rootId, total: model.size, elements: page.items.map((e) => toJson(model, e)), ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) }
    },
  })
  route({
    method: 'GET', path: '/projects/{projectId}/commits/{commitId}/text', operationId: 'getText', tag: 'Model services', alignment: 'extension', permission: 'read',
    summary: 'SysML v2 textual notation of the model or of one namespace (members)', params: { ...pid, commitId: uuid }, query: { elementId: uuid },
    handler: async (rc) => {
      const { model } = await commitModel(ctx, rc)
      const target = rc.query.elementId ? elementOr404(model, rc.query.elementId)['@id'] : model.rootId
      return { elementId: target, text: serialize(model, target) }
    },
  })
  route({
    method: 'GET', path: '/projects/{projectId}/commits/{commitId}/validation', operationId: 'getValidation', tag: 'Model services', alignment: 'extension', permission: 'read',
    summary: 'Validation diagnostics of the model at a commit', params: { ...pid, commitId: uuid },
    handler: async (rc) => {
      const commit = await ctx.repo.getCommit(rc.project!.id, rc.params.commitId)
      const d = await ctx.repo.validation(rc.project!.id, commit.id)
      return { commitId: commit.id, counts: { error: d.filter((x) => x.severity === 'error').length, warning: d.filter((x) => x.severity === 'warning').length, info: d.filter((x) => x.severity === 'info').length }, diagnostics: d.slice(0, 2000) }
    },
  })
  route({
    method: 'GET', path: '/projects/{projectId}/commits/{commitId}/children', operationId: 'getChildren', tag: 'Model services', alignment: 'extension', permission: 'read',
    summary: 'Members of a namespace with derived summaries (lazy model browser); root namespace by default', params: { ...pid, commitId: uuid }, query: { ownerId: uuid },
    handler: async (rc) => {
      const { model } = await commitModel(ctx, rc)
      const owner = rc.query.ownerId ? elementOr404(model, rc.query.ownerId)['@id'] : model.rootId
      return children(model, owner)
    },
  })
  route({
    method: 'GET', path: '/projects/{projectId}/commits/{commitId}/search', operationId: 'searchElements', tag: 'Model services', alignment: 'extension', permission: 'read',
    summary: 'Find elements by text, metaclass (kinds include specializations) and owner', params: { ...pid, commitId: uuid },
    query: { text: { type: 'string' }, metaclass: { type: 'string' }, ownerId: uuid, recursive: { type: 'boolean' }, limit: { type: 'integer', minimum: 1, maximum: 1000 } },
    handler: async (rc) => {
      const { model } = await commitModel(ctx, rc)
      return findElements(model, { text: rc.query.text as string | undefined, metaclass: rc.query.metaclass as string | undefined, ownerId: rc.query.ownerId as string | undefined, recursive: rc.query.recursive === true, limit: rc.query.limit as number | undefined })
    },
  })
  route({
    method: 'GET', path: '/projects/{projectId}/commits/{commitId}/impact', operationId: 'getImpact', tag: 'Model services', alignment: 'extension', permission: 'read',
    summary: 'Impact analysis: elements that refer to an element (directly: references; transitively to depth)', params: { ...pid, commitId: uuid },
    query: { elementId: uuid, depth: { type: 'integer', minimum: 1, maximum: 6 } },
    handler: async (rc) => {
      const { model } = await commitModel(ctx, rc)
      const el = elementOr404(model, rc.query.elementId)
      return { elementId: el['@id'], references: incomingReferences(model, el['@id']), impact: impact(model, el['@id'], (rc.query.depth as number | undefined) ?? 3) }
    },
  })

  // ---- events ------------------------------------------------------------------------------------
  route({
    method: 'GET', path: '/projects/{projectId}/events', operationId: 'events', tag: 'Events', alignment: 'extension', permission: 'read', raw: true,
    summary: 'Committed-change notifications (Server-Sent Events); resume with Last-Event-ID or ?after', params: pid, query: { after: { type: 'string' } },
    handler: async (rc) => {
      const projectId = rc.project!.id
      const after = (rc.query.after as string | undefined) ?? (rc.request.headers['last-event-id'] as string | undefined) ?? null
      rc.reply.hijack()
      const res = rc.reply.raw
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
      res.write('retry: 3000\n\n')
      const sent = new Set<string>()
      let ready = false
      const buffer: unknown[] = []
      const send = (e: { eventId: string; type: string }) => {
        if (sent.has(e.eventId)) return
        sent.add(e.eventId)
        res.write(`id: ${e.eventId}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
      }
      const off = ctx.events.subscribe(projectId, (e) => (ready ? send(e) : buffer.push(e)))
      const keep = setInterval(() => res.write(': keep-alive\n\n'), 15000)
      rc.request.raw.on('close', () => {
        clearInterval(keep)
        off()
      })
      const backlog = await ctx.events.readAfter(projectId, after)
      if (backlog === undefined) res.write(`event: reset\ndata: ${JSON.stringify({ reason: 'unknown resume point' })}\n\n`)
      else backlog.forEach(send)
      ready = true
      ;(buffer.splice(0) as { eventId: string; type: string }[]).forEach(send)
    },
  })
}

type Constraint = { '@type'?: string; property?: string; operator?: string; value?: unknown; inverse?: boolean; constraint?: Constraint[] }

function constraintTest(c: Constraint, s: ReturnType<typeof semanticsOf>): (e: Element) => boolean {
  if (!c || typeof c !== 'object') throw invalid('where must be a constraint object.')
  if (c['@type'] === 'CompositeConstraint' || Array.isArray(c.constraint)) {
    const parts = (c.constraint ?? []).map((x) => constraintTest(x, s))
    const op = c.operator ?? 'and'
    if (op !== 'and' && op !== 'or') throw invalid('CompositeConstraint.operator must be and or or.')
    return (e) => (op === 'and' ? parts.every((p) => p(e)) : parts.some((p) => p(e)))
  }
  const prop = c.property
  const op = c.operator ?? '='
  const values = Array.isArray(c.value) ? c.value.map(String) : [String(c.value)]
  if (!prop) throw invalid('PrimitiveConstraint needs a property.')
  if (!['=', 'contains', 'kindOf'].includes(op)) throw invalid('Supported operators: =, contains, kindOf.')
  const get = (e: Element): string | undefined => {
    switch (prop) {
      case '@type':
        return e['@type']
      case '@id':
      case 'elementId':
        return e['@id']
      case 'declaredName':
        return typeof e.declaredName === 'string' ? e.declaredName : undefined
      case 'name':
        return s.name(e['@id'])
      case 'qualifiedName':
        return s.qualifiedName(e['@id']) ?? undefined
      case 'owner':
        return s.owner(e['@id'])?.['@id']
      default:
        throw invalid(`Unsupported query property “${prop}” (supported: @type, @id, declaredName, name, qualifiedName, owner).`)
    }
  }
  const test = (e: Element) => {
    const v = get(e)
    if (v === undefined) return false
    if (op === 'kindOf') return values.some((x) => isKindOf(e['@type'], x))
    if (op === 'contains') return values.some((x) => v.toLowerCase().includes(x.toLowerCase()))
    return values.includes(v)
  }
  return c.inverse ? (e) => !test(e) : test
}

import { Type, type Static } from '@sinclair/typebox'
import type { FastifyInstance } from 'fastify'
import { forbidden, invalid, notFound } from '../errors'
import { PERMISSIONS, RELATIONSHIP_RULES, RELATIONSHIP_TYPES, roleAllows, type Permission } from '../domain/rules'
import { impact, traceMatrix, traceLinks } from '../store/analysis'
import { createAttributeDefinition, getConventions, listAttributeDefinitions, putConventions, updateAttributeDefinition } from '../store/attributes'
import { compareBaselines, createBaseline, getBaseline, listBaselines } from '../store/baselines'
import { runBulk } from '../store/bulk'
import { addNode, collectionTree, collectionsOf, createCollection, listCollections, moveNode, removeNode, renameHeading, updateCollection } from '../store/collections'
import { dismissFinding, qualityReport, qualitySummary } from '../store/quality'
import { createRelationship, deleteRelationship, listRelationships, relationshipsOf } from '../store/relationships'
import {
  compareRequirements,
  createRequirement,
  getRequirement,
  listHistory,
  listLifecycle,
  listRequirements,
  listRevisions,
  requireRequirement,
  resolveId,
  setArchived,
  transition,
  updateRequirement,
} from '../store/requirements'
import { addComment, addExternalReference, decide, listComments, listExternalReferences, listReviews } from '../store/reviews'
import { deleteView, listViews, saveView } from '../store/views'
import { registerRoute, type HostServices, type RequestContext, type RouteSpec } from './route'
import * as S from './schemas'

const P = Type.Object({ projectId: Type.String({ minLength: 1, maxLength: 100 }) })
const PR = Type.Object({ projectId: Type.String(), requirementId: Type.String() })
const E = {
  400: { description: 'Malformed request (invalid)', schema: S.ErrorBody },
  401: { description: 'No identity (unauthenticated)', schema: S.ErrorBody },
  403: { description: 'Not entitled or role does not allow it (forbidden)', schema: S.ErrorBody },
  404: { description: 'Not found', schema: S.ErrorBody },
  409: { description: 'Revision conflict; details.currentRevision is the current revision (conflict)', schema: S.ErrorBody },
  422: { description: 'Semantically invalid (invalid); details.fields lists field problems', schema: S.ErrorBody },
  503: { description: 'Database not available (unavailable)', schema: S.ErrorBody },
}
const READ_ERRORS = { 400: E[400], 401: E[401], 403: E[403], 404: E[404], 503: E[503] }
const WRITE_ERRORS = { ...READ_ERRORS, 409: E[409], 422: E[422] }

/** Fields the cross-module SDK subset may set (RequirementCreateInput / RequirementPatch). */
const SDK_CREATE_FIELDS = new Set(['title', 'statement', 'type', 'rationale', 'collectionId', 'reason'])
const SDK_PATCH_FIELDS = new Set(['title', 'statement', 'rationale', 'type', 'expectedRevision', 'reason'])

function restrictToSdk(rc: RequestContext, allowed: Set<string>) {
  if (rc.principal.entitlements.includes('tool:requirements')) return
  const extra = Object.keys((rc.body as object) ?? {}).filter((k) => !allowed.has(k))
  if (extra.length) throw forbidden(`With the SysML entitlement only canonical fields can be set (${[...allowed].join(', ')}); not ${extra.join(', ')}.`)
}

const reqId = async (rc: RequestContext, ctx: { db: import('pg').PoolClient }) => {
  const id = rc.params.requirementId
  const r = await getRequirement(ctx.db, rc.projectId, id)
  if (!r) throw notFound(`Requirement ${id} not found.`)
  return r
}

export function registerRequirementRoutes(app: FastifyInstance, services: HostServices, registry: RouteSpec[]) {
  const route = (spec: RouteSpec) => registerRoute(app, services, spec, registry)

  // ---- requirements ---------------------------------------------------------------------------------
  // Project-free lookup by canonical UUID (the SDK's update() carries no project). Same checks as
  // the project-scoped read once the owning project is known.
  app.get('/requirements/:requirementId', async (request, reply) => {
    const id = (request.params as { requirementId: string }).requirementId
    const principal = await services.authenticate(request)
    if (!principal.entitlements.includes('tool:requirements') && !principal.entitlements.includes('tool:sysml')) throw forbidden('Your subscription includes neither Requirements nor SysML.')
    const { rows } = await services.pool.query<{ project_id: string }>('SELECT project_id FROM requirements.requirements WHERE id::text = $1', [id])
    const projectId = rows[0]?.project_id
    // Not a member and not existing look the same, so IDs of other projects are not disclosed.
    if (!projectId || !(await services.roleOf(principal.userId, projectId))) throw notFound(`Requirement ${id} not found.`)
    const r = await getRequirement(services.pool, projectId, id)
    reply.header('ETag', `"${r!.revision}"`).send(r)
  })
  registry.push({
    method: 'GET',
    path: '/requirements/{requirementId}',
    operationId: 'getRequirementById',
    tag: 'Requirements',
    summary: 'Read a requirement by canonical UUID without knowing its project',
    description: 'Returns 404 both for unknown IDs and for requirements of projects the caller is not a member of.',
    params: Type.Object({ requirementId: Type.String() }),
    permission: 'read',
    crossModule: true,
    responses: { 200: { description: 'The requirement', schema: S.Requirement }, ...READ_ERRORS },
    handler: async () => undefined,
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/requirements',
    operationId: 'listRequirements',
    tag: 'Requirements',
    summary: 'Search and list requirements',
    description: 'Cursor pagination with stable ordering (natural key order, or newest revision first). `total` counts all matches. Working state by default; `baselineId` reads the pinned revisions; `configurationId` keeps requirements applicable to that configuration.',
    params: P,
    query: S.RequirementListQuery,
    permission: 'read',
    crossModule: true,
    responses: { 200: { description: 'A page of requirements', schema: S.RequirementPage }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listRequirements(ctx.db, rc.projectId, rc.query as S.RequirementListQueryDto)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/requirements',
    operationId: 'createRequirement',
    tag: 'Requirements',
    summary: 'Create a requirement',
    description: 'Creates revision 1 in status draft with the next free key. Requires Idempotency-Key. With only the SysML entitlement, the body is limited to the SDK fields (title, statement, type, rationale, collectionId).',
    params: P,
    body: S.RequirementCreate,
    permission: 'author',
    crossModule: true,
    idempotency: 'required',
    responses: { 201: { description: 'Created', schema: S.Requirement }, ...WRITE_ERRORS },
    handler: async (rc) => {
      restrictToSdk(rc, SDK_CREATE_FIELDS)
      return rc.write(async (ctx) => {
        const r = await createRequirement(ctx, rc.body as S.RequirementCreateDto)
        return { status: 201, body: r, etag: r.revision, headers: { Location: `/api/requirements/v1/projects/${rc.projectId}/requirements/${r.id}` } }
      })
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/requirements/resolve',
    operationId: 'resolveRequirement',
    tag: 'Requirements',
    summary: 'Resolve a key or legacy twin ID to the canonical requirement',
    params: P,
    query: Type.Object({ key: Type.String({ minLength: 1, maxLength: 100 }), baselineId: Type.Optional(S.Uuid), configurationId: Type.Optional(Type.String()) }, { additionalProperties: false }),
    permission: 'read',
    crossModule: true,
    responses: { 200: { description: 'The requirement', schema: S.Requirement }, ...READ_ERRORS },
    handler: async (rc) => {
      const q = rc.query as { key: string; baselineId?: string; configurationId?: string }
      const r = await rc.read(async (ctx) => {
        const id = await resolveId(ctx.db, rc.projectId, q.key)
        const found = id ? await getRequirement(ctx.db, rc.projectId, id, { baselineId: q.baselineId }) : undefined
        if (!found || (q.configurationId && found.applicability.length && !found.applicability.includes(q.configurationId))) throw notFound(`No requirement ${q.key}${q.baselineId ? ' in that baseline' : ''}${q.configurationId ? ` applicable to ${q.configurationId}` : ''}.`)
        return found
      })
      return { body: r, etag: r.revision }
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/requirements/{requirementId}',
    operationId: 'getRequirement',
    tag: 'Requirements',
    summary: 'Read a requirement (working, exact revision, or as pinned by a baseline)',
    params: PR,
    query: Type.Object({ revision: Type.Optional(Type.Integer({ minimum: 1 })), baselineId: Type.Optional(S.Uuid) }, { additionalProperties: false }),
    permission: 'read',
    crossModule: true,
    responses: { 200: { description: 'The requirement; ETag is its revision', schema: S.Requirement }, ...READ_ERRORS },
    handler: async (rc) => {
      const q = rc.query as { revision?: number; baselineId?: string }
      if (q.revision && q.baselineId) throw invalid('Use either revision or baselineId.', { revision: 'conflicts with baselineId' }, 400)
      const r = await rc.read((ctx) => requireRequirement(ctx.db, rc.projectId, rc.params.requirementId, q))
      return { body: r, etag: r.revision }
    },
  })
  route({
    method: 'PATCH',
    path: '/projects/{projectId}/requirements/{requirementId}',
    operationId: 'updateRequirement',
    tag: 'Requirements',
    summary: 'Edit canonical fields (new immutable revision)',
    description: 'Needs expectedRevision or If-Match; a mismatch returns 409 with the current revision and changes nothing. Editing an in-review or approved requirement creates a draft revision and supersedes the open review. `attributes` merge into current values (null removes).',
    params: PR,
    body: S.RequirementPatch,
    permission: 'author',
    crossModule: true,
    idempotency: 'optional',
    concurrency: 'If-Match: "<revision>" or expectedRevision',
    responses: { 200: { description: 'The updated requirement', schema: S.Requirement }, ...WRITE_ERRORS },
    handler: async (rc) => {
      restrictToSdk(rc, SDK_PATCH_FIELDS)
      const body = rc.body as S.RequirementPatchDto
      const expected = rc.expected(body.expectedRevision)
      return rc.write(async (ctx) => {
        const { requirement } = await updateRequirement(ctx, rc.params.requirementId, body, expected, { role: rc.role })
        return { body: requirement, etag: requirement.revision }
      })
    },
  })
  for (const archived of [true, false]) {
    route({
      method: 'POST',
      path: `/projects/{projectId}/requirements/{requirementId}/${archived ? 'archive' : 'restore'}`,
      operationId: archived ? 'archiveRequirement' : 'restoreRequirement',
      tag: 'Requirements',
      summary: archived ? 'Archive a requirement (never deletes)' : 'Restore an archived requirement',
      params: PR,
      body: S.WriteOptions,
      permission: 'author',
      idempotency: 'optional',
      responses: { 200: { description: 'The requirement', schema: S.Requirement }, ...WRITE_ERRORS },
      handler: async (rc) => {
        const body = (rc.body ?? {}) as { expectedRevision?: number; reason?: string }
        const expected = rc.expected(body.expectedRevision)
        return rc.write(async (ctx) => {
          const r = await setArchived(ctx, rc.params.requirementId, archived, expected, body.reason)
          return { body: r, etag: r.revision }
        })
      },
    })
  }
  route({
    method: 'POST',
    path: '/projects/{projectId}/requirements/{requirementId}/transitions',
    operationId: 'transitionRequirement',
    tag: 'Lifecycle and reviews',
    summary: 'Lifecycle transition: request review, withdraw, reopen, retire, reinstate',
    description: 'request-review and withdraw: editor or administrator. reopen: editor or administrator. retire and reinstate: reviewer or administrator. Approval and rejection are review decisions.',
    params: PR,
    body: S.Transition,
    permission: 'read',
    idempotency: 'optional',
    responses: { 200: { description: 'The requirement after the transition', schema: S.Requirement }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const body = rc.body as Static<typeof S.Transition>
      const expected = rc.expected(body.expectedRevision)
      return rc.write(async (ctx) => {
        const r = await transition(ctx, rc.params.requirementId, body.action, expected, rc.role, body.reason)
        return { body: r, etag: r.revision }
      })
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/requirements/{requirementId}/revisions',
    operationId: 'listRevisions',
    tag: 'History and baselines',
    summary: 'Revisions of a requirement, newest first',
    params: PR,
    permission: 'read',
    crossModule: true,
    responses: { 200: { description: 'Revisions', schema: Type.Array(S.RevisionSummary) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read(async (ctx) => (await reqId(rc, ctx), listRevisions(ctx.db, rc.projectId, rc.params.requirementId))) }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/requirements/{requirementId}/compare',
    operationId: 'compareRevisions',
    tag: 'History and baselines',
    summary: 'Field-level comparison of two revisions',
    params: PR,
    query: Type.Object({ from: Type.Integer({ minimum: 1 }), to: Type.Integer({ minimum: 1 }) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Changed fields', schema: S.RevisionComparison }, ...READ_ERRORS },
    handler: async (rc) => {
      const q = rc.query as { from: number; to: number }
      return {
        body: await rc.read(async (ctx) => {
          const a = await requireRequirement(ctx.db, rc.projectId, rc.params.requirementId, { revision: q.from })
          const b = await requireRequirement(ctx.db, rc.projectId, rc.params.requirementId, { revision: q.to })
          return { requirementId: a.id, from: q.from, to: q.to, changes: compareRequirements(a, b).filter((c) => c.field !== 'status') }
        }),
      }
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/requirements/{requirementId}/history',
    operationId: 'requirementHistory',
    tag: 'History and baselines',
    summary: 'Append-only change history (actor, timestamp, reason), newest first',
    params: PR,
    permission: 'read',
    responses: { 200: { description: 'Audit events', schema: Type.Array(S.AuditEvent) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read(async (ctx) => (await reqId(rc, ctx), listHistory(ctx.db, rc.projectId, rc.params.requirementId))) }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/requirements/{requirementId}/lifecycle',
    operationId: 'requirementLifecycle',
    tag: 'Lifecycle and reviews',
    summary: 'Lifecycle events (status changes per revision)',
    params: PR,
    permission: 'read',
    responses: { 200: { description: 'Lifecycle events', schema: Type.Array(S.LifecycleEvent) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read(async (ctx) => (await reqId(rc, ctx), listLifecycle(ctx.db, rc.params.requirementId))) }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/requirements/{requirementId}/reviews',
    operationId: 'listReviews',
    tag: 'Lifecycle and reviews',
    summary: 'Review records with decisions',
    params: PR,
    permission: 'read',
    responses: { 200: { description: 'Reviews', schema: Type.Array(S.Review) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read(async (ctx) => (await reqId(rc, ctx), listReviews(ctx.db, rc.projectId, rc.params.requirementId))) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/requirements/{requirementId}/reviews/{reviewId}/decisions',
    operationId: 'decideReview',
    tag: 'Lifecycle and reviews',
    summary: 'Approve, reject or comment on an open review',
    description: 'approve/reject: reviewer or administrator who did not author the revision under review; expectedRevision must be the reviewed revision. comment: editor, reviewer or administrator.',
    params: Type.Object({ projectId: Type.String(), requirementId: Type.String(), reviewId: Type.String() }),
    body: S.ReviewDecisionCreate,
    permission: 'read',
    idempotency: 'optional',
    responses: { 200: { description: 'The review', schema: S.Review }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const body = rc.body as Static<typeof S.ReviewDecisionCreate>
      const expected = rc.expected(body.expectedRevision)
      return rc.write(async (ctx) => ({ body: await decide(ctx, rc.params.requirementId, rc.params.reviewId, { ...body, expectedRevision: expected }, rc.role) }))
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/requirements/{requirementId}/comments',
    operationId: 'listComments',
    tag: 'Requirements',
    summary: 'Comments (separate from normative text and rationale)',
    params: PR,
    permission: 'read',
    responses: { 200: { description: 'Comments, oldest first', schema: Type.Array(S.Comment) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read(async (ctx) => (await reqId(rc, ctx), listComments(ctx.db, rc.projectId, rc.params.requirementId))) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/requirements/{requirementId}/comments',
    operationId: 'addComment',
    tag: 'Requirements',
    summary: 'Add a comment on the current revision',
    params: PR,
    body: S.CommentCreate,
    permission: 'comment',
    idempotency: 'optional',
    responses: { 201: { description: 'The comment', schema: S.Comment }, ...WRITE_ERRORS },
    handler: async (rc) => rc.write(async (ctx) => ({ status: 201, body: await addComment(ctx, rc.params.requirementId, (rc.body as { body: string }).body) })),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/requirements/{requirementId}/external-references',
    operationId: 'listExternalReferences',
    tag: 'Requirements',
    summary: 'External references, including ReqIF exchange mappings per source',
    params: PR,
    permission: 'read',
    responses: { 200: { description: 'References', schema: Type.Array(S.ExternalReference) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read(async (ctx) => (await reqId(rc, ctx), listExternalReferences(ctx.db, rc.projectId, rc.params.requirementId))) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/requirements/{requirementId}/external-references',
    operationId: 'addExternalReference',
    tag: 'Requirements',
    summary: 'Record an external reference (e.g. a customer document clause)',
    params: PR,
    body: S.ExternalReferenceCreate,
    permission: 'author',
    idempotency: 'optional',
    responses: { 201: { description: 'The reference', schema: S.ExternalReference }, ...WRITE_ERRORS },
    handler: async (rc) => rc.write(async (ctx) => ({ status: 201, body: await addExternalReference(ctx, rc.params.requirementId, rc.body as { system: string; externalId: string }) })),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/requirements/{requirementId}/collections',
    operationId: 'requirementCollections',
    tag: 'Collections',
    summary: 'Collections that contain the requirement',
    params: PR,
    permission: 'read',
    responses: { 200: { description: 'Collections', schema: Type.Array(Type.Object({ id: S.Uuid, name: Type.String(), nodeId: S.Uuid })) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read(async (ctx) => (await reqId(rc, ctx), collectionsOf(ctx.db, rc.params.requirementId))) }),
  })

  // ---- relationships, trace, impact -------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/requirements/{requirementId}/trace-links',
    operationId: 'traceLinks',
    tag: 'Traceability',
    summary: 'SDK trace links owned by Requirements (derives-from, decomposes, depends-on, allocated-to)',
    description: 'SysML-owned references/satisfies and verification records live in the shared twin and are not returned here.',
    params: PR,
    query: Type.Object({ baselineId: Type.Optional(S.Uuid), configurationId: Type.Optional(Type.String()) }, { additionalProperties: false }),
    permission: 'read',
    crossModule: true,
    responses: { 200: { description: 'Trace links', schema: Type.Array(S.TraceLink) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read(async (ctx) => (await reqId(rc, ctx), traceLinks(ctx.db, rc.projectId, rc.params.requirementId, (rc.query as { baselineId?: string }).baselineId))) }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/requirements/{requirementId}/relationships',
    operationId: 'requirementRelationships',
    tag: 'Traceability',
    summary: 'Relationships touching the requirement (both directions)',
    params: PR,
    query: Type.Object({ baselineId: Type.Optional(S.Uuid) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Relationships', schema: Type.Array(S.Relationship) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read(async (ctx) => (await reqId(rc, ctx), relationshipsOf(ctx.db, rc.projectId, rc.params.requirementId, rc.query as { baselineId?: string }))) }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/requirements/{requirementId}/impact',
    operationId: 'requirementImpact',
    tag: 'Traceability',
    summary: 'Potentially affected linked items',
    params: PR,
    query: Type.Object({ depth: Type.Optional(Type.Integer({ minimum: 1, maximum: 6 })) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Impact assessment input', schema: S.Impact }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => impact(ctx.db, rc.projectId, rc.params.requirementId, (rc.query as { depth?: number }).depth)) }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/relationship-types',
    operationId: 'relationshipTypes',
    tag: 'Traceability',
    summary: 'Meaning, direction and permitted endpoints of each relationship type',
    params: P,
    permission: 'read',
    crossModule: true,
    responses: { 200: { description: 'Rules', schema: Type.Array(S.RelationshipRuleDto) }, ...READ_ERRORS },
    handler: async () => ({ body: RELATIONSHIP_TYPES.map((t) => ({ type: t, ...RELATIONSHIP_RULES[t] })) }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/relationships',
    operationId: 'listRelationships',
    tag: 'Traceability',
    summary: 'List relationships (e.g. all allocations to a component)',
    params: P,
    query: Type.Object({ type: Type.Optional(S.RelationshipType), toTwinId: Type.Optional(Type.String()), baselineId: Type.Optional(S.Uuid), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20000 })) }, { additionalProperties: false }),
    permission: 'read',
    crossModule: true,
    responses: { 200: { description: 'Relationships', schema: Type.Array(S.Relationship) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listRelationships(ctx.db, rc.projectId, rc.query as { type?: string })) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/relationships',
    operationId: 'createRelationship',
    tag: 'Traceability',
    summary: 'Create a typed relationship',
    description: 'Endpoints are validated per type; self-links, duplicates and cycles in derives-from/decomposes are refused. Allocation targets must be components (assembly or part) or product elements known to the host twin directory.',
    params: P,
    body: S.RelationshipCreate,
    permission: 'author',
    idempotency: 'optional',
    responses: { 201: { description: 'Created', schema: S.Relationship }, ...WRITE_ERRORS },
    handler: async (rc) => rc.write(async (ctx) => {
      const rel = await createRelationship(ctx, services.twin, rc.body as Static<typeof S.RelationshipCreate>)
      return { status: 201, body: rel, etag: rel.revision }
    }),
  })
  route({
    method: 'DELETE',
    path: '/projects/{projectId}/relationships/{relationshipId}',
    operationId: 'deleteRelationship',
    tag: 'Traceability',
    summary: 'Delete a relationship (adds a deleted revision; history and baselines keep earlier revisions)',
    params: Type.Object({ projectId: Type.String(), relationshipId: Type.String() }),
    query: Type.Object({ expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), reason: Type.Optional(Type.String({ maxLength: 2000 })) }, { additionalProperties: false }),
    permission: 'author',
    concurrency: 'If-Match: "<relationship revision>" or ?expectedRevision',
    responses: { 200: { description: 'The relationship (deleted)', schema: S.Relationship }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const q = rc.query as { expectedRevision?: number; reason?: string }
      const expected = rc.expected(q.expectedRevision)
      return rc.write(async (ctx) => ({ body: await deleteRelationship(ctx, rc.params.relationshipId, expected, q.reason) }))
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/trace-matrix',
    operationId: 'traceMatrix',
    tag: 'Traceability',
    summary: 'Traceability matrix (requirements × related requirements or components)',
    params: P,
    query: Type.Object(
      { collectionId: Type.Optional(S.Uuid), types: Type.Optional(Type.String()), columns: Type.Optional(Type.Union([Type.Literal('requirements'), Type.Literal('components')])), baselineId: Type.Optional(S.Uuid), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })) },
      { additionalProperties: false },
    ),
    permission: 'read',
    responses: { 200: { description: 'Matrix', schema: S.TraceMatrix }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => traceMatrix(ctx.db, rc.projectId, rc.query as { columns?: 'requirements' })) }),
  })

  // ---- collections -------------------------------------------------------------------------------------
  const PC = Type.Object({ projectId: Type.String(), collectionId: Type.String() })
  const PCN = Type.Object({ projectId: Type.String(), collectionId: Type.String(), nodeId: Type.String() })
  route({
    method: 'GET',
    path: '/projects/{projectId}/collections',
    operationId: 'listCollections',
    tag: 'Collections',
    summary: 'Collections (documents and sets)',
    params: P,
    query: Type.Object({ includeArchived: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
    permission: 'read',
    crossModule: true,
    responses: { 200: { description: 'Collections', schema: Type.Array(S.Collection) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listCollections(ctx.db, rc.projectId, (rc.query as { includeArchived?: boolean }).includeArchived)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/collections',
    operationId: 'createCollection',
    tag: 'Collections',
    summary: 'Create a collection',
    params: P,
    body: S.CollectionCreate,
    permission: 'author',
    idempotency: 'optional',
    responses: { 201: { description: 'Created', schema: S.Collection }, ...WRITE_ERRORS },
    handler: async (rc) => rc.write(async (ctx) => {
      const c = await createCollection(ctx, rc.body as { name: string })
      return { status: 201, body: c, etag: c.revision }
    }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/collections/{collectionId}',
    operationId: 'getCollectionTree',
    tag: 'Collections',
    summary: 'Collection with its ordered structure (working or as pinned by a baseline)',
    description: 'ETag is the structure revision; send it as If-Match (or expectedStructureRevision) with structure edits.',
    params: PC,
    query: Type.Object({ baselineId: Type.Optional(S.Uuid) }, { additionalProperties: false }),
    permission: 'read',
    crossModule: true,
    responses: { 200: { description: 'Tree (flat, document order)', schema: S.CollectionTree }, ...READ_ERRORS },
    handler: async (rc) => {
      const t = await rc.read((ctx) => collectionTree(ctx.db, rc.projectId, rc.params.collectionId, (rc.query as { baselineId?: string }).baselineId))
      return { body: t, etag: t.collection.structureRevision }
    },
  })
  route({
    method: 'PATCH',
    path: '/projects/{projectId}/collections/{collectionId}',
    operationId: 'updateCollection',
    tag: 'Collections',
    summary: 'Rename, describe, archive or restore a collection',
    params: PC,
    body: S.CollectionPatch,
    permission: 'author',
    idempotency: 'optional',
    concurrency: 'expectedRevision (collection metadata revision)',
    responses: { 200: { description: 'The collection', schema: S.Collection }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const body = rc.body as { expectedRevision?: number; name?: string; description?: string; archived?: boolean }
      if (body.expectedRevision === undefined) throw invalid('expectedRevision is required.', { expectedRevision: 'required' }, 400)
      return rc.write(async (ctx) => {
        const c = await updateCollection(ctx, rc.params.collectionId, body, body.expectedRevision!)
        return { body: c, etag: c.revision }
      })
    },
  })
  const structureWrite = (rc: RequestContext, bodyValue: number | undefined) => rc.expected(bodyValue, 'expectedStructureRevision')
  route({
    method: 'POST',
    path: '/projects/{projectId}/collections/{collectionId}/nodes',
    operationId: 'addCollectionNode',
    tag: 'Collections',
    summary: 'Add a heading or a requirement reference',
    params: PC,
    body: S.NodeCreate,
    permission: 'author',
    idempotency: 'optional',
    concurrency: 'If-Match: "<structureRevision>" or expectedStructureRevision',
    responses: { 201: { description: 'The new node', schema: S.CollectionNode }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const body = rc.body as Static<typeof S.NodeCreate>
      const expected = structureWrite(rc, body.expectedStructureRevision)
      return rc.write(async (ctx) => {
        const node = await addNode(ctx, rc.params.collectionId, body, expected)
        return { status: 201, body: node, etag: expected + 1 }
      })
    },
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/collections/{collectionId}/nodes/{nodeId}/move',
    operationId: 'moveCollectionNode',
    tag: 'Collections',
    summary: 'Move a node (reorder or re-parent); never changes relationships',
    params: PCN,
    body: S.NodeMove,
    permission: 'author',
    idempotency: 'optional',
    responses: { 200: { description: 'The structure after the move', schema: Type.Array(S.CollectionNode) }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const body = rc.body as Static<typeof S.NodeMove>
      const expected = structureWrite(rc, body.expectedStructureRevision)
      return rc.write(async (ctx) => ({ body: await moveNode(ctx, rc.params.collectionId, rc.params.nodeId, body, expected), etag: expected + 1 }))
    },
  })
  route({
    method: 'PATCH',
    path: '/projects/{projectId}/collections/{collectionId}/nodes/{nodeId}',
    operationId: 'renameHeading',
    tag: 'Collections',
    summary: 'Rename a heading',
    params: PCN,
    body: S.NodeUpdate,
    permission: 'author',
    idempotency: 'optional',
    responses: { 200: { description: 'The structure', schema: Type.Array(S.CollectionNode) }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const body = rc.body as Static<typeof S.NodeUpdate>
      const expected = structureWrite(rc, body.expectedStructureRevision)
      return rc.write(async (ctx) => ({ body: await renameHeading(ctx, rc.params.collectionId, rc.params.nodeId, body.heading, expected), etag: expected + 1 }))
    },
  })
  route({
    method: 'DELETE',
    path: '/projects/{projectId}/collections/{collectionId}/nodes/{nodeId}',
    operationId: 'removeCollectionNode',
    tag: 'Collections',
    summary: 'Remove a node from the structure (the requirement itself is not touched)',
    params: PCN,
    query: Type.Object({ expectedStructureRevision: Type.Optional(Type.Integer()) }, { additionalProperties: false }),
    permission: 'author',
    responses: { 200: { description: 'The structure', schema: Type.Array(S.CollectionNode) }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const expected = structureWrite(rc, (rc.query as { expectedStructureRevision?: number }).expectedStructureRevision)
      return rc.write(async (ctx) => ({ body: await removeNode(ctx, rc.params.collectionId, rc.params.nodeId, expected), etag: expected + 1 }))
    },
  })

  // ---- attributes ----------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/attribute-definitions',
    operationId: 'listAttributeDefinitions',
    tag: 'Attributes',
    summary: 'Custom attribute definitions with enumeration values',
    params: P,
    permission: 'read',
    responses: { 200: { description: 'Definitions', schema: Type.Array(S.AttributeDefinition) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listAttributeDefinitions(ctx.db, rc.projectId)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/attribute-definitions',
    operationId: 'createAttributeDefinition',
    tag: 'Attributes',
    summary: 'Define a custom attribute (administrators)',
    params: P,
    body: S.AttributeDefinitionCreate,
    permission: 'define-attributes',
    idempotency: 'optional',
    responses: { 201: { description: 'Created', schema: S.AttributeDefinition }, ...WRITE_ERRORS },
    handler: async (rc) => rc.write(async (ctx) => ({ status: 201, body: await createAttributeDefinition(ctx, rc.body as Static<typeof S.AttributeDefinitionCreate>) })),
  })
  route({
    method: 'PATCH',
    path: '/projects/{projectId}/attribute-definitions/{definitionId}',
    operationId: 'updateAttributeDefinition',
    tag: 'Attributes',
    summary: 'Rename, require, archive, or add enumeration values (data type and keys never change)',
    params: Type.Object({ projectId: Type.String(), definitionId: Type.String() }),
    body: S.AttributeDefinitionPatch,
    permission: 'define-attributes',
    idempotency: 'optional',
    responses: { 200: { description: 'The definition', schema: S.AttributeDefinition }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const body = rc.body as Static<typeof S.AttributeDefinitionPatch>
      const expected = rc.expected(body.expectedRevision)
      return rc.write(async (ctx) => ({ body: await updateAttributeDefinition(ctx, rc.params.definitionId, body, expected) }))
    },
  })

  // ---- baselines -------------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/baselines',
    operationId: 'listBaselines',
    tag: 'History and baselines',
    summary: 'Requirements baselines, newest first',
    params: P,
    permission: 'read',
    crossModule: true,
    responses: { 200: { description: 'Baselines', schema: Type.Array(S.Baseline) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listBaselines(ctx.db, rc.projectId)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/baselines',
    operationId: 'createBaseline',
    tag: 'History and baselines',
    summary: 'Create an immutable baseline (pins requirement revisions, relationship revisions and collection structure)',
    params: P,
    body: S.BaselineCreate,
    permission: 'create-baseline',
    idempotency: 'optional',
    responses: { 201: { description: 'Created', schema: S.Baseline }, ...WRITE_ERRORS },
    handler: async (rc) => rc.write(async (ctx) => ({ status: 201, body: await createBaseline(ctx, rc.body as Static<typeof S.BaselineCreate>) })),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/baselines/{baselineId}',
    operationId: 'getBaseline',
    tag: 'History and baselines',
    summary: 'A baseline',
    params: Type.Object({ projectId: Type.String(), baselineId: Type.String() }),
    permission: 'read',
    crossModule: true,
    responses: { 200: { description: 'Baseline', schema: S.Baseline }, ...READ_ERRORS },
    handler: async (rc) => {
      const b = await rc.read((ctx) => getBaseline(ctx.db, rc.projectId, rc.params.baselineId))
      if (!b) throw notFound('Baseline not found.')
      return { body: b }
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/baselines/{baselineId}/compare',
    operationId: 'compareBaselines',
    tag: 'History and baselines',
    summary: "Compare a baseline with another baseline or the working state ('working')",
    params: Type.Object({ projectId: Type.String(), baselineId: Type.String() }),
    query: Type.Object({ to: Type.String() }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Differences', schema: S.BaselineComparison }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => compareBaselines(ctx.db, rc.projectId, rc.params.baselineId, (rc.query as { to: string }).to)) }),
  })

  // ---- bulk ---------------------------------------------------------------------------------------------------
  route({
    method: 'POST',
    path: '/projects/{projectId}/bulk',
    operationId: 'bulkUpdate',
    tag: 'Requirements',
    summary: 'Validated bulk operations',
    description: 'atomic=true (default): all items commit together or nothing changes; on failure the response is an error whose details.outcomes lists each item. atomic=false: each item is applied separately; the 200 response lists per-item outcomes. Every item needs its expectedRevision.',
    notes: 'Bulk semantics: atomic (default) or per-item outcomes.',
    params: P,
    body: S.BulkRequest,
    permission: 'read',
    idempotency: 'optional',
    responses: { 200: { description: 'Outcomes', schema: S.BulkResult }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const body = rc.body as Static<typeof S.BulkRequest>
      return rc.write(async (ctx) => ({ body: await runBulk(ctx, body.operations, body.atomic ?? true, rc.role, body.reason) }))
    },
  })

  // ---- saved views -----------------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/views',
    operationId: 'listViews',
    tag: 'Saved views',
    summary: 'Your saved views and views shared with the project',
    params: P,
    permission: 'read',
    responses: { 200: { description: 'Views', schema: Type.Array(S.SavedView) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listViews(ctx.db, rc.projectId, rc.principal.userId)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/views',
    operationId: 'createView',
    tag: 'Saved views',
    summary: 'Save a view (filters, columns, sort)',
    params: P,
    body: S.SavedViewWrite,
    permission: 'save-personal-view',
    idempotency: 'optional',
    responses: { 201: { description: 'Saved', schema: S.SavedView }, ...WRITE_ERRORS },
    handler: async (rc) => rc.write(async (ctx) => ({ status: 201, body: await saveView(ctx, rc.role, rc.body as Static<typeof S.SavedViewWrite>) })),
  })
  route({
    method: 'PUT',
    path: '/projects/{projectId}/views/{viewId}',
    operationId: 'updateView',
    tag: 'Saved views',
    summary: 'Replace a saved view (owner only)',
    params: Type.Object({ projectId: Type.String(), viewId: Type.String() }),
    body: S.SavedViewWrite,
    permission: 'save-personal-view',
    idempotency: 'optional',
    responses: { 200: { description: 'Saved', schema: S.SavedView }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const body = rc.body as Static<typeof S.SavedViewWrite>
      const expected = rc.expected(body.expectedRevision)
      return rc.write(async (ctx) => ({ body: await saveView(ctx, rc.role, body, rc.params.viewId, expected) }))
    },
  })
  route({
    method: 'DELETE',
    path: '/projects/{projectId}/views/{viewId}',
    operationId: 'deleteView',
    tag: 'Saved views',
    summary: 'Delete a saved view (owner only)',
    params: Type.Object({ projectId: Type.String(), viewId: Type.String() }),
    query: Type.Object({ expectedRevision: Type.Optional(Type.Integer()) }, { additionalProperties: false }),
    permission: 'save-personal-view',
    responses: { 204: { description: 'Deleted' }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const expected = rc.expected((rc.query as { expectedRevision?: number }).expectedRevision)
      return rc.write(async (ctx) => (await deleteView(ctx, rc.params.viewId, expected), { status: 204 }))
    },
  })

  // ---- quality ------------------------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/requirements/{requirementId}/quality',
    operationId: 'requirementQuality',
    tag: 'Quality',
    summary: 'Explainable quality findings for a revision (deterministic validation and heuristics)',
    params: PR,
    query: Type.Object({ revision: Type.Optional(Type.Integer({ minimum: 1 })) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Findings', schema: S.QualityReport }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => qualityReport(ctx.db, rc.projectId, rc.params.requirementId, (rc.query as { revision?: number }).revision)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/requirements/{requirementId}/quality/dismissals',
    operationId: 'dismissFinding',
    tag: 'Quality',
    summary: 'Dismiss a finding for this revision with a reason',
    params: PR,
    body: S.Dismissal,
    permission: 'dismiss-finding',
    idempotency: 'optional',
    responses: { 200: { description: 'Findings after dismissal', schema: S.QualityReport }, ...WRITE_ERRORS },
    handler: async (rc) => rc.write(async (ctx) => ({ body: await dismissFinding(ctx, rc.params.requirementId, rc.body as Static<typeof S.Dismissal>) })),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/quality',
    operationId: 'qualitySummary',
    tag: 'Quality',
    summary: 'Project-wide summary of open findings',
    params: P,
    query: Type.Object({ collectionId: Type.Optional(S.Uuid), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000 })) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Summary', schema: S.QualitySummary }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => qualitySummary(ctx.db, rc.projectId, rc.query as { collectionId?: string })) }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/quality/conventions',
    operationId: 'getConventions',
    tag: 'Quality',
    summary: 'Writing conventions used by the checks (configurable; no universal "shall")',
    params: P,
    permission: 'read',
    crossModule: true,
    responses: { 200: { description: 'Conventions', schema: S.Conventions }, ...READ_ERRORS },
    handler: async (rc) => {
      const c = await rc.read((ctx) => getConventions(ctx.db, rc.projectId))
      return { body: c, etag: c.revision }
    },
  })
  route({
    method: 'PUT',
    path: '/projects/{projectId}/quality/conventions',
    operationId: 'putConventions',
    tag: 'Quality',
    summary: 'Change writing conventions (administrators)',
    params: P,
    body: S.ConventionsWrite,
    permission: 'edit-conventions',
    idempotency: 'optional',
    responses: { 200: { description: 'Conventions', schema: S.Conventions }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const body = rc.body as { settings: Record<string, unknown>; expectedRevision?: number }
      const expected = rc.expected(body.expectedRevision)
      return rc.write(async (ctx) => {
        const c = await putConventions(ctx, body.settings, expected)
        return { body: c, etag: c.revision }
      })
    },
  })

  // ---- caller ---------------------------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/permissions',
    operationId: 'myPermissions',
    tag: 'Meta',
    summary: "The caller's role, entitlements and allowed permissions in the project (UI gating only; the server enforces)",
    params: P,
    permission: 'read',
    crossModule: true,
    responses: {
      200: { description: 'Permissions', schema: Type.Object({ userId: Type.String(), role: Type.Union([Type.String(), Type.Null()]), entitlements: Type.Array(Type.String()), permissions: Type.Array(Type.String()), fullModule: Type.Boolean() }) },
      ...READ_ERRORS,
    },
    handler: async (rc) => ({
      body: {
        userId: rc.principal.userId,
        role: rc.role,
        entitlements: rc.principal.entitlements,
        permissions: (Object.keys(PERMISSIONS) as Permission[]).filter((p) => roleAllows(rc.role, p)),
        fullModule: rc.principal.entitlements.includes('tool:requirements'),
      },
    }),
  })
}


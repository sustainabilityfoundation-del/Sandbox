import { Type } from '@sinclair/typebox'
import type { FastifyInstance } from 'fastify'
import { notFound } from '../errors'
import type { DesignEntityType } from '../domain/rules'
import { changeValidity, decisionRationale, flagDecision } from '../store/alternatives'
import { assumptionsFromStatements, changeValidation, createAssumption, listAssumptionRevisions, listAssumptions, requireAssumption, updateAssumption } from '../store/assumptions'
import { runBatch } from '../store/batch'
import { listHistory } from '../store/concepts'
import { changeConstraintStatus, createConstraint, listConstraintRevisions, listConstraints, promoteStatement, requireConstraint, updateConstraint } from '../store/constraints'
import { createDesignLink, createLinkType, getDesignLink, listDesignLinks, listLinkTypes, removeDesignLink } from '../store/designLinks'
import { convertToFunction, createFunction, listFunctionRevisions, listFunctions, requireFunction, updateFunction } from '../store/functions'
import { paths, search, traverse } from '../store/graph'
import { getEvidence, reviewEvidence } from '../store/implementations'
import { createFunctionDecomposition } from '../store/relationships'
import * as D from './designSchemas'
import { registerRoute, type HostServices, type RequestContext, type RouteSpec } from './route'
import * as S from './schemas'

const PI = (name: string) => Type.Object({ projectId: Type.String(), [name]: Type.String() })
const P = Type.Object({ projectId: Type.String({ minLength: 1, maxLength: 100 }) })
const E = {
  400: { description: 'Malformed request (invalid)', schema: S.ErrorBody },
  401: { description: 'No identity (unauthenticated)', schema: S.ErrorBody },
  403: { description: 'Not entitled, role does not allow it, or an approval gate (forbidden)', schema: S.ErrorBody },
  404: { description: 'Not found', schema: S.ErrorBody },
  409: { description: 'Revision or state conflict (conflict)', schema: S.ErrorBody },
  422: { description: 'Semantically invalid (invalid)', schema: S.ErrorBody },
  503: { description: 'Database not available (unavailable)', schema: S.ErrorBody },
}
const READ = { 400: E[400], 401: E[401], 403: E[403], 404: E[404], 503: E[503] }
const WRITE = { ...READ, 409: E[409], 422: E[422] }
const CONC = 'Expected revision as an ETag; alternative to expectedRevision in the body'
const body = <T>(rc: RequestContext) => rc.body as T
const base = (rc: RequestContext) => `/api/concepts/v1/projects/${rc.projectId}`

export function registerDesignRoutes(app: FastifyInstance, services: HostServices, registry: RouteSpec[]) {
  const route = (spec: RouteSpec) => registerRoute(app, services, spec, registry)

  // ---- functions (CR-C1) ----------------------------------------------------------------------------------
  route({
    method: 'GET', path: '/projects/{projectId}/functions', operationId: 'listFunctions', tag: 'Functions', summary: 'Functions (excluding retired unless a status filter is given)', params: P,
    query: Type.Object({ text: Type.Optional(Type.String({ maxLength: 200 })), status: Type.Optional(Type.String()), ids: Type.Optional(Type.String()) }, { additionalProperties: false }),
    permission: 'read', crossModule: true, responses: { 200: { description: 'Functions', schema: Type.Array(D.FunctionDto) }, ...READ },
    handler: async (rc) => ({ body: await rc.read((ctx) => listFunctions(ctx.db, rc.projectId, rc.query as { text?: string; status?: string; ids?: string })) }),
  })
  route({
    method: 'POST', path: '/projects/{projectId}/functions', operationId: 'createFunction', tag: 'Functions', summary: 'Create a Function (optionally as a sub-function: decomposes-into from parentFunctionId)', params: P, body: D.FunctionCreate,
    permission: 'author', idempotency: 'required', responses: { 201: { description: 'Created', schema: D.FunctionDto }, ...WRITE },
    handler: async (rc) => rc.write(async (ctx) => { const f = await createFunction(ctx, body(rc)); return { status: 201, body: f, etag: f.revision, headers: { Location: `${base(rc)}/functions/${f.id}` } } }),
  })
  route({
    method: 'GET', path: '/projects/{projectId}/functions/{functionId}', operationId: 'getFunction', tag: 'Functions', summary: 'Read a Function (current or an exact revision)', params: PI('functionId'),
    query: Type.Object({ revision: Type.Optional(Type.Integer({ minimum: 1 })) }, { additionalProperties: false }), permission: 'read', crossModule: true, concurrency: CONC,
    responses: { 200: { description: 'Function', schema: D.FunctionDto }, ...READ },
    handler: async (rc) => { const f = await rc.read((ctx) => requireFunction(ctx.db, rc.projectId, rc.params.functionId, rc.query.revision as number | undefined)); return { body: f, etag: f.revision } },
  })
  route({
    method: 'PATCH', path: '/projects/{projectId}/functions/{functionId}', operationId: 'updateFunction', tag: 'Functions', summary: 'Edit a Function (new immutable revision) or change its status', params: PI('functionId'), body: D.FunctionPatch,
    permission: 'author', idempotency: 'optional', concurrency: CONC, responses: { 200: { description: 'Function', schema: D.FunctionDto }, ...WRITE },
    handler: async (rc) => { const b = body<D.FunctionPatchDto>(rc); const ex = rc.expected(b.expectedRevision); return rc.write(async (ctx) => { const f = await updateFunction(ctx, rc.params.functionId, b, ex); return { body: f, etag: f.revision } }) },
  })
  route({
    method: 'GET', path: '/projects/{projectId}/functions/{functionId}/revisions', operationId: 'listFunctionRevisions', tag: 'Functions', summary: 'Revisions of a Function with provenance', params: PI('functionId'),
    permission: 'read', responses: { 200: { description: 'Revisions', schema: Type.Array(S.RevisionSummary) }, ...READ },
    handler: async (rc) => ({ body: await rc.read(async (ctx) => { await requireFunction(ctx.db, rc.projectId, rc.params.functionId); return listFunctionRevisions(ctx.db, rc.projectId, rc.params.functionId) }) }),
  })
  route({
    method: 'POST', path: '/projects/{projectId}/functions/{functionId}/decompositions', operationId: 'createFunctionDecomposition', tag: 'Functions', summary: 'Create a named (alternative) decomposition of a Function', params: PI('functionId'),
    body: Type.Object({ name: Type.String({ minLength: 1, maxLength: 200 }), description: Type.Optional(Type.String({ maxLength: 4000 })) }, { additionalProperties: false }),
    permission: 'author', idempotency: 'required', responses: { 201: { description: 'Created', schema: S.Decomposition }, ...WRITE },
    handler: async (rc) => rc.write(async (ctx) => ({ status: 201, body: await createFunctionDecomposition(ctx, rc.params.functionId, body(rc)) })),
  })
  route({
    method: 'POST', path: '/projects/{projectId}/concepts/{conceptId}/convert-to-function', operationId: 'convertToFunction', tag: 'Functions',
    summary: 'Convert a function-Concept into a Function (explicit; the Concept stays as history)',
    description: 'Creates a Function from the current revision (function, behavior, performance and constraint statements; quantified ones become objectives), links Function derived-from Concept and re-expresses each implements relationship into the Concept as a performs link to the Function. Nothing is converted automatically.',
    params: PI('conceptId'), body: D.ConvertToFunction, permission: 'author', idempotency: 'required', concurrency: CONC,
    responses: { 201: { description: 'Function created', schema: D.Conversion }, ...WRITE },
    handler: async (rc) => { const b = body<{ expectedRevision?: number; reason?: string }>(rc); const ex = rc.expected(b.expectedRevision); return rc.write(async (ctx) => ({ status: 201, body: await convertToFunction(ctx, rc.params.conceptId, ex, b.reason) })) },
  })

  // ---- constraints (CR-C2) --------------------------------------------------------------------------------
  route({
    method: 'GET', path: '/projects/{projectId}/constraints', operationId: 'listConstraints', tag: 'Constraints', summary: 'Design constraints, optionally of one subject', params: P,
    query: Type.Object({ subjectId: Type.Optional(Type.String()), status: Type.Optional(Type.String()), text: Type.Optional(Type.String({ maxLength: 200 })) }, { additionalProperties: false }),
    permission: 'read', crossModule: true, responses: { 200: { description: 'Constraints', schema: Type.Array(D.ConstraintDto) }, ...READ },
    handler: async (rc) => ({ body: await rc.read((ctx) => listConstraints(ctx.db, rc.projectId, rc.query as { subjectId?: string; status?: string; text?: string })) }),
  })
  route({
    method: 'POST', path: '/projects/{projectId}/constraints', operationId: 'createConstraint', tag: 'Constraints',
    summary: 'Create a design constraint (formalizing one pinned requirement, derived, or stated)', params: P, body: D.ConstraintCreate,
    permission: 'author', idempotency: 'required', responses: { 201: { description: 'Created', schema: D.ConstraintDto }, ...WRITE },
    handler: async (rc) => rc.write(async (ctx) => { const c = await createConstraint(ctx, body(rc)); return { status: 201, body: c, etag: c.revision } }),
  })
  route({
    method: 'GET', path: '/projects/{projectId}/constraints/{constraintId}', operationId: 'getConstraint', tag: 'Constraints', summary: 'Read a constraint', params: PI('constraintId'),
    query: Type.Object({ revision: Type.Optional(Type.Integer({ minimum: 1 })) }, { additionalProperties: false }), permission: 'read', crossModule: true, concurrency: CONC,
    responses: { 200: { description: 'Constraint', schema: D.ConstraintDto }, ...READ },
    handler: async (rc) => { const c = await rc.read((ctx) => requireConstraint(ctx.db, rc.projectId, rc.params.constraintId, rc.query.revision as number | undefined)); return { body: c, etag: c.revision } },
  })
  route({
    method: 'PATCH', path: '/projects/{projectId}/constraints/{constraintId}', operationId: 'updateConstraint', tag: 'Constraints', summary: 'Edit a constraint (new revision)', params: PI('constraintId'), body: D.ConstraintPatch,
    permission: 'author', idempotency: 'optional', concurrency: CONC, responses: { 200: { description: 'Constraint', schema: D.ConstraintDto }, ...WRITE },
    handler: async (rc) => { const b = body<D.ConstraintPatchDto>(rc); const ex = rc.expected(b.expectedRevision); return rc.write(async (ctx) => { const c = await updateConstraint(ctx, rc.params.constraintId, b, ex); return { body: c, etag: c.revision } }) },
  })
  route({
    method: 'POST', path: '/projects/{projectId}/constraints/{constraintId}/status', operationId: 'changeConstraintStatus', tag: 'Constraints',
    summary: 'Change a constraint status (proposed, active, relaxed, retired)', description: 'Relaxing or retiring a hard constraint that formalizes a requirement needs a reviewer. The assistant may only propose.',
    params: PI('constraintId'), body: D.StatusChange, permission: 'read', anyOf: ['author', 'decide'], idempotency: 'optional', concurrency: CONC,
    responses: { 200: { description: 'Constraint', schema: D.ConstraintDto }, ...WRITE },
    handler: async (rc) => { const b = body<{ status: string; expectedRevision?: number; reason: string }>(rc); const ex = rc.expected(b.expectedRevision); return rc.write(async (ctx) => { const c = await changeConstraintStatus(ctx, rc.params.constraintId, b.status as never, ex, b.reason); return { body: c, etag: c.revision } }) },
  })
  route({
    method: 'GET', path: '/projects/{projectId}/constraints/{constraintId}/revisions', operationId: 'listConstraintRevisions', tag: 'Constraints', summary: 'Revisions of a constraint', params: PI('constraintId'),
    permission: 'read', responses: { 200: { description: 'Revisions', schema: Type.Array(S.RevisionSummary) }, ...READ },
    handler: async (rc) => ({ body: await rc.read(async (ctx) => { await requireConstraint(ctx.db, rc.projectId, rc.params.constraintId); return listConstraintRevisions(ctx.db, rc.projectId, rc.params.constraintId) }) }),
  })
  route({
    method: 'POST', path: '/projects/{projectId}/concepts/{conceptId}/promote-statement', operationId: 'promoteStatement', tag: 'Constraints',
    summary: 'Promote a constraint statement with a quantity to a design constraint (user-invoked; the statement stays)', params: PI('conceptId'), body: D.PromoteStatement,
    permission: 'author', idempotency: 'required', responses: { 201: { description: 'Constraint', schema: D.ConstraintDto }, ...WRITE },
    handler: async (rc) => rc.write(async (ctx) => { const c = await promoteStatement(ctx, rc.params.conceptId, body(rc)); return { status: 201, body: c, etag: c.revision } }),
  })

  // ---- assumptions (CR-C3) --------------------------------------------------------------------------------
  route({
    method: 'GET', path: '/projects/{projectId}/assumptions', operationId: 'listAssumptions', tag: 'Assumptions', summary: 'Assumptions, optionally of one subject or originating statement', params: P,
    query: Type.Object({ subjectId: Type.Optional(Type.String()), status: Type.Optional(Type.String()), text: Type.Optional(Type.String({ maxLength: 200 })), statementId: Type.Optional(Type.String()) }, { additionalProperties: false }),
    permission: 'read', crossModule: true, responses: { 200: { description: 'Assumptions', schema: Type.Array(D.AssumptionDto) }, ...READ },
    handler: async (rc) => ({ body: await rc.read((ctx) => listAssumptions(ctx.db, rc.projectId, rc.query as { subjectId?: string })) }),
  })
  route({
    method: 'POST', path: '/projects/{projectId}/assumptions', operationId: 'createAssumption', tag: 'Assumptions', summary: 'Record an assumption', params: P, body: D.AssumptionCreate,
    permission: 'author', idempotency: 'required', responses: { 201: { description: 'Created', schema: D.AssumptionDto }, ...WRITE },
    handler: async (rc) => rc.write(async (ctx) => { const a = await createAssumption(ctx, body(rc)); return { status: 201, body: a, etag: a.revision } }),
  })
  route({
    method: 'GET', path: '/projects/{projectId}/assumptions/{assumptionId}', operationId: 'getAssumption', tag: 'Assumptions', summary: 'Read an assumption with its validation history', params: PI('assumptionId'),
    query: Type.Object({ revision: Type.Optional(Type.Integer({ minimum: 1 })) }, { additionalProperties: false }), permission: 'read', crossModule: true, concurrency: CONC,
    responses: { 200: { description: 'Assumption', schema: D.AssumptionDto }, ...READ },
    handler: async (rc) => { const a = await rc.read((ctx) => requireAssumption(ctx.db, rc.projectId, rc.params.assumptionId, rc.query.revision as number | undefined)); return { body: a, etag: a.revision } },
  })
  route({
    method: 'PATCH', path: '/projects/{projectId}/assumptions/{assumptionId}', operationId: 'updateAssumption', tag: 'Assumptions', summary: 'Edit an assumption (new revision)', params: PI('assumptionId'), body: D.AssumptionPatch,
    permission: 'author', idempotency: 'optional', concurrency: CONC, responses: { 200: { description: 'Assumption', schema: D.AssumptionDto }, ...WRITE },
    handler: async (rc) => { const b = body<D.AssumptionPatchDto>(rc); const ex = rc.expected(b.expectedRevision); return rc.write(async (ctx) => { const a = await updateAssumption(ctx, rc.params.assumptionId, b, ex); return { body: a, etag: a.revision } }) },
  })
  route({
    method: 'POST', path: '/projects/{projectId}/assumptions/{assumptionId}/validation', operationId: 'changeAssumptionValidation', tag: 'Assumptions',
    summary: 'Record a validation status change (validated and invalidated need evidence; the assistant may only propose a review)', params: PI('assumptionId'), body: D.ValidationChange,
    permission: 'read', anyOf: ['author', 'decide'], idempotency: 'optional', concurrency: CONC, responses: { 200: { description: 'Assumption', schema: D.AssumptionDto }, ...WRITE },
    handler: async (rc) => { const b = body<{ status: string; evidenceIds?: string[]; expectedRevision?: number; reason: string }>(rc); const ex = rc.expected(b.expectedRevision); return rc.write(async (ctx) => { const a = await changeValidation(ctx, rc.params.assumptionId, b.status as never, b.evidenceIds ?? [], ex, b.reason); return { body: a, etag: a.revision } }) },
  })
  route({
    method: 'GET', path: '/projects/{projectId}/assumptions/{assumptionId}/revisions', operationId: 'listAssumptionRevisions', tag: 'Assumptions', summary: 'Revisions of an assumption', params: PI('assumptionId'),
    permission: 'read', responses: { 200: { description: 'Revisions', schema: Type.Array(S.RevisionSummary) }, ...READ },
    handler: async (rc) => ({ body: await rc.read(async (ctx) => { await requireAssumption(ctx.db, rc.projectId, rc.params.assumptionId); return listAssumptionRevisions(ctx.db, rc.projectId, rc.params.assumptionId) }) }),
  })
  route({
    method: 'POST', path: '/projects/{projectId}/concepts/{conceptId}/assumptions-from-statements', operationId: 'assumptionsFromStatements', tag: 'Assumptions',
    summary: 'Create Assumptions for assumption statements that have none yet (same rule as the CR-C3 migration)', params: PI('conceptId'), body: Type.Object({}, { additionalProperties: false }),
    permission: 'author', idempotency: 'optional', responses: { 200: { description: 'Created assumptions', schema: Type.Array(D.AssumptionDto) }, ...WRITE },
    handler: async (rc) => rc.write(async (ctx) => ({ body: await assumptionsFromStatements(ctx, [rc.params.conceptId]) })),
  })

  // ---- link registry and design links (CR-C4) ----------------------------------------------------------------
  route({
    method: 'GET', path: '/projects/{projectId}/link-types', operationId: 'listLinkTypes', tag: 'Links', summary: 'Link vocabulary with endpoint rules, symmetry, acyclicity, assistant flag and impact propagation', params: P,
    permission: 'read', crossModule: true, responses: { 200: { description: 'Link types', schema: Type.Array(D.LinkType) }, ...READ },
    handler: async (rc) => ({ body: await rc.read((ctx) => listLinkTypes(ctx.db)) }),
  })
  route({
    method: 'POST', path: '/projects/{projectId}/link-types', operationId: 'registerLinkType', tag: 'Links', summary: 'Register a namespaced link type (administrator)', params: P, body: D.LinkTypeCreate,
    permission: 'administer', idempotency: 'required', responses: { 201: { description: 'Registered', schema: D.LinkType }, ...WRITE },
    handler: async (rc) => rc.write(async (ctx) => ({ status: 201, body: await createLinkType(ctx, body(rc)) })),
  })
  route({
    method: 'GET', path: '/projects/{projectId}/design-links', operationId: 'listDesignLinks', tag: 'Links', summary: 'Design links (all registered types), optionally touching one record', params: P,
    query: Type.Object({ id: Type.Optional(Type.String({ maxLength: 2000 })), type: Type.Optional(Type.String()), includeRemoved: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
    permission: 'read', crossModule: true, responses: { 200: { description: 'Links', schema: Type.Array(D.DesignLinkDto) }, ...READ },
    handler: async (rc) => ({ body: await rc.read((ctx) => listDesignLinks(ctx.db, rc.projectId, rc.query as { id?: string; type?: string; includeRemoved?: boolean })) }),
  })
  route({
    method: 'POST', path: '/projects/{projectId}/design-links', operationId: 'createDesignLink', tag: 'Links', summary: 'Create a typed design link (validated against the registry)', params: P, body: D.DesignLinkCreate,
    permission: 'author', idempotency: 'required', responses: { 201: { description: 'Created', schema: D.DesignLinkDto }, ...WRITE },
    handler: async (rc) => rc.write(async (ctx) => { const l = await createDesignLink(ctx, body(rc)); return { status: 201, body: l, etag: l.revision } }),
  })
  route({
    method: 'GET', path: '/projects/{projectId}/design-links/{linkId}', operationId: 'getDesignLink', tag: 'Links', summary: 'Read a design link', params: PI('linkId'),
    permission: 'read', responses: { 200: { description: 'Link', schema: D.DesignLinkDto }, ...READ },
    handler: async (rc) => { const l = await rc.read((ctx) => getDesignLink(ctx.db, rc.projectId, rc.params.linkId)); if (!l) throw notFound(`Link ${rc.params.linkId} not found.`); return { body: l, etag: l.revision } },
  })
  route({
    method: 'POST', path: '/projects/{projectId}/design-links/{linkId}/remove', operationId: 'removeDesignLink', tag: 'Links', summary: 'Remove a design link (recorded, never deleted)', params: PI('linkId'), body: S.RemoveBody,
    permission: 'author', idempotency: 'optional', concurrency: CONC, responses: { 200: { description: 'Link', schema: D.DesignLinkDto }, ...WRITE },
    handler: async (rc) => { const b = body<{ expectedRevision?: number; reason?: string }>(rc); const ex = rc.expected(b.expectedRevision); return rc.write(async (ctx) => ({ body: await removeDesignLink(ctx, rc.params.linkId, ex, b.reason) })) },
  })

  // ---- decisions (CR-C5) -----------------------------------------------------------------------------------
  route({
    method: 'POST', path: '/projects/{projectId}/decisions/{decisionId}/review-flag', operationId: 'flagDecision', tag: 'Decisions',
    summary: 'Flag a recorded decision for review (validity under-review; the decision record is not edited)', params: PI('decisionId'), body: D.ReviewFlag,
    permission: 'author', idempotency: 'optional', responses: { 200: { description: 'Decision', schema: D.DecisionV }, ...WRITE },
    handler: async (rc) => rc.write(async (ctx) => { const d = await flagDecision(ctx, rc.params.decisionId, body(rc)); return { body: d, etag: d.recordVersion } }),
  })
  route({
    method: 'POST', path: '/projects/{projectId}/decisions/{decisionId}/validity', operationId: 'changeDecisionValidity', tag: 'Decisions',
    summary: 'Clear a review flag (valid) or record invalidation (reviewer or administrator)', params: PI('decisionId'), body: D.ValidityChange,
    permission: 'decide', idempotency: 'optional', concurrency: CONC, responses: { 200: { description: 'Decision', schema: D.DecisionV }, ...WRITE },
    handler: async (rc) => { const b = body<{ validity: 'valid' | 'invalidated'; expectedRevision?: number; reason: string; invalidatedBy?: unknown }>(rc); const ex = rc.expected(b.expectedRevision); return rc.write(async (ctx) => { const d = await changeValidity(ctx, rc.params.decisionId, b.validity, ex, b.reason, b.invalidatedBy); return { body: d, etag: d.recordVersion } }) },
  })
  route({
    method: 'GET', path: '/projects/{projectId}/decisions/{decisionId}/rationale', operationId: 'decisionRationale', tag: 'Decisions',
    summary: 'Assembled rationale: alternatives, support, assumptions, constraints (with stale pins), study, validity', params: PI('decisionId'),
    permission: 'read', crossModule: true, responses: { 200: { description: 'Rationale', schema: D.Rationale }, ...READ },
    handler: async (rc) => ({ body: await rc.read((ctx) => decisionRationale(ctx.db, rc.projectId, rc.params.decisionId)) }),
  })

  // ---- evidence (CR-C6) ------------------------------------------------------------------------------------
  route({
    method: 'GET', path: '/projects/{projectId}/evidence/{evidenceId}', operationId: 'getEvidence', tag: 'Evidence', summary: 'Read an evidence record with subjects and reviews', params: PI('evidenceId'),
    permission: 'read', responses: { 200: { description: 'Evidence', schema: D.EvidenceV }, ...READ },
    handler: async (rc) => { const e = await rc.read((ctx) => getEvidence(ctx.db, rc.projectId, rc.params.evidenceId)); if (!e) throw notFound(`Evidence ${rc.params.evidenceId} not found.`); return { body: e } },
  })
  route({
    method: 'POST', path: '/projects/{projectId}/evidence/{evidenceId}/reviews', operationId: 'reviewEvidence', tag: 'Evidence',
    summary: 'Append a review (accepted or rejected) to an evidence record (reviewer; not the person who recorded it for acceptance)', params: PI('evidenceId'), body: D.EvidenceReviewCreate,
    permission: 'decide', idempotency: 'optional', responses: { 200: { description: 'Evidence', schema: D.EvidenceV }, ...WRITE },
    handler: async (rc) => rc.write(async (ctx) => ({ body: await reviewEvidence(ctx, rc.params.evidenceId, body(rc)) })),
  })

  // ---- batch (CR-C10) --------------------------------------------------------------------------------------
  route({
    method: 'POST', path: '/projects/{projectId}/batch', operationId: 'batch', tag: 'Batch',
    summary: 'Atomic batch of create, link and update operations with placeholders and one provenance',
    description: 'All or nothing. Placeholders ("$name") defined by an operation are replaced in later operations. Each item uses the same validation as its single endpoint; the error names the failing item. Idempotency-Key covers the whole batch.',
    params: P, body: D.BatchRequest, permission: 'author', idempotency: 'required', responses: { 200: { description: 'Results and placeholder map', schema: D.BatchResult }, ...WRITE },
    handler: async (rc) => rc.write(async (ctx) => ({ body: await runBatch(ctx, body(rc)) })),
  })

  // ---- graph and search (CR-C9) ----------------------------------------------------------------------------
  route({
    method: 'POST', path: '/projects/{projectId}/graph/traverse', operationId: 'traverseGraph', tag: 'Graph',
    summary: 'Traverse design knowledge from start refs along link types and directions (depth ≤ 6, asOf)', params: P, body: D.TraverseRequest,
    permission: 'read', crossModule: true, responses: { 200: { description: 'Nodes and edges', schema: D.TraverseResult }, ...READ },
    handler: async (rc) => ({ body: await rc.read((ctx) => traverse(ctx.db, rc.projectId, body(rc))) }),
  })
  route({
    method: 'GET', path: '/projects/{projectId}/graph/neighbourhood', operationId: 'graphNeighbourhood', tag: 'Graph', summary: 'Neighbourhood of one design record (UI)', params: P,
    query: Type.Object({ type: D.DesignEntityType, id: Type.String({ minLength: 1, maxLength: 100 }), depth: Type.Optional(Type.Integer({ minimum: 1, maximum: 3 })), asOf: Type.Optional(Type.String({ format: 'date-time' })) }, { additionalProperties: false }),
    permission: 'read', crossModule: true, responses: { 200: { description: 'Nodes and edges', schema: D.TraverseResult }, ...READ },
    handler: async (rc) => {
      const q = rc.query as { type: DesignEntityType; id: string; depth?: number; asOf?: string }
      return { body: await rc.read((ctx) => traverse(ctx.db, rc.projectId, { start: [{ module: 'conceptualize', type: q.type, id: q.id }], maxDepth: q.depth ?? 1, asOf: q.asOf ?? null, limit: 500 })) }
    },
  })
  route({
    method: 'POST', path: '/projects/{projectId}/graph/paths', operationId: 'graphPaths', tag: 'Graph', summary: 'All simple paths between two refs (why is X related to Y)', params: P, body: D.PathsRequest,
    permission: 'read', crossModule: true, responses: { 200: { description: 'Paths', schema: D.PathsResult }, ...READ },
    handler: async (rc) => ({ body: await rc.read((ctx) => paths(ctx.db, rc.projectId, body(rc))) }),
  })
  route({
    method: 'GET', path: '/projects/{projectId}/search', operationId: 'searchDesign', tag: 'Graph', summary: 'Full-text search across Concepts, Functions, Constraints, Assumptions, Decisions and Evidence', params: P,
    query: Type.Object({ q: Type.String({ minLength: 1, maxLength: 200 }), types: Type.Optional(Type.String()), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })) }, { additionalProperties: false }),
    permission: 'read', crossModule: true, responses: { 200: { description: 'Matches', schema: D.SearchResult }, ...READ },
    handler: async (rc) => { const q = rc.query as { q: string; types?: string; limit?: number }; return { body: await rc.read((ctx) => search(ctx.db, rc.projectId, q.q, q.types, q.limit)) } },
  })
  route({
    method: 'GET', path: '/projects/{projectId}/entity-history', operationId: 'entityHistory', tag: 'History', summary: 'Audit history of any design record (function, constraint, assumption, link …) with provenance', params: P,
    query: Type.Object({ entityId: Type.String({ minLength: 1, maxLength: 100 }) }, { additionalProperties: false }),
    permission: 'read', responses: { 200: { description: 'Audit events', schema: Type.Array(S.AuditEvent) }, ...READ },
    handler: async (rc) => ({ body: await rc.read((ctx) => listHistory(ctx.db, rc.projectId, { entityId: rc.query.entityId as string })) }),
  })
}

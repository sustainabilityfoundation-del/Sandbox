import { Type } from '@sinclair/typebox'
import type { FastifyInstance } from 'fastify'
import type { ConceptMaturity } from '@ews/platform-sdk'
import { forbidden, invalid, notFound } from '../errors'
import { PERMISSIONS, RELATIONSHIP_RULES, RELATIONSHIP_TYPES, roleAllows, type Permission } from '../domain/rules'
import { COMMON_UNITS, dimensionName, parseUnit } from '../domain/units'
import { addMember, createDecision, createSet, getDecision, listDecisions, listSets, recordDecision, requireSet, withdrawDecision, withdrawMember } from '../store/alternatives'
import {
  branchConcept,
  changeMaturity,
  changeVerificationStatus,
  compareConcepts,
  createConcept,
  listConcepts,
  listHistory,
  listRevisions,
  requireConcept,
  updateConcept,
} from '../store/concepts'
import { createExploration, getExploration, listExplorations, undoExploration } from '../store/explorations'
import {
  addArtifact,
  createEvidence,
  createImplementation,
  createLink,
  createRealizationRequest,
  getImplementation,
  listEvidence,
  listImplementations,
  listLinks,
  removeArtifact,
  removeLink,
  repinArtifact,
  repinLink,
  setRealizationStatus,
  updateImplementation,
} from '../store/implementations'
import { createDecomposition, createRelationship, listDecompositions, listRelationships, removeRelationship, updateDecomposition } from '../store/relationships'
import { createStudy, putScores, requireStudy, listStudies, updateStudy } from '../store/tradeStudies'
import { artifactConcepts, assessment, projectGraph } from '../store/views'
import { BASE_PATH } from './openapi'
import { registerRoute, type HostServices, type RequestContext, type RouteSpec } from './route'
import * as S from './schemas'

const P = Type.Object({ projectId: Type.String({ minLength: 1, maxLength: 100 }) })
const PC = Type.Object({ projectId: Type.String(), conceptId: Type.String() })
const PI = (name: string) => Type.Object({ projectId: Type.String(), [name]: Type.String() })
const E = {
  400: { description: 'Malformed request (invalid)', schema: S.ErrorBody },
  401: { description: 'No identity (unauthenticated)', schema: S.ErrorBody },
  403: { description: 'Not entitled, role does not allow it, or an approval gate (forbidden)', schema: S.ErrorBody },
  404: { description: 'Not found', schema: S.ErrorBody },
  409: { description: 'Revision conflict or state conflict; details.currentRevision is the current revision (conflict)', schema: S.ErrorBody },
  422: { description: 'Semantically invalid (invalid); details.fields lists field problems', schema: S.ErrorBody },
  503: { description: 'Database not available (unavailable)', schema: S.ErrorBody },
}
const READ_ERRORS = { 400: E[400], 401: E[401], 403: E[403], 404: E[404], 503: E[503] }
const WRITE_ERRORS = { ...READ_ERRORS, 409: E[409], 422: E[422] }
const CONCURRENCY = 'Expected revision as an ETag; alternative to expectedRevision in the body'

const body = <T>(rc: RequestContext) => rc.body as T
const conceptPath = (projectId: string, id: string) => `${BASE_PATH}/projects/${projectId}/concepts/${id}`

export function registerConceptRoutes(app: FastifyInstance, services: HostServices, registry: RouteSpec[]) {
  const route = (spec: RouteSpec) => registerRoute(app, services, spec, registry)
  const need = (rc: RequestContext, p: Permission, what: string) => {
    if (!roleAllows(rc.role, p)) throw forbidden(`${what} needs: ${PERMISSIONS[p].label.toLowerCase()}.`)
  }

  // ---- concepts ---------------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/concepts',
    operationId: 'listConcepts',
    tag: 'Concepts',
    summary: 'Search and list Concepts',
    description: 'Cursor pagination in key order. Archived and superseded Concepts are excluded unless includeArchived or a maturity filter is given.',
    params: P,
    query: S.ConceptListQuery,
    permission: 'read',
    crossModule: true,
    responses: { 200: { description: 'A page of Concepts', schema: S.ConceptPage }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listConcepts(ctx.db, rc.projectId, rc.query as S.ConceptListQueryDto)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/concepts',
    operationId: 'createConcept',
    tag: 'Concepts',
    summary: 'Create a Concept',
    description: 'Creates revision 1 with the next free key. With parentId the new Concept is added to the parent (contains), optionally in a decomposition. Requires Idempotency-Key.',
    params: P,
    body: S.ConceptCreate,
    permission: 'author',
    idempotency: 'required',
    responses: { 201: { description: 'Created', schema: S.Concept }, ...WRITE_ERRORS },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const input = body<S.ConceptCreateDto>(rc)
        const { parentId, decompositionId, ...rest } = input
        if (decompositionId && !parentId) throw invalid('decompositionId needs parentId.', { decompositionId: 'needs parentId' })
        const c = await createConcept(ctx, rest)
        if (parentId) await createRelationship(ctx, { type: 'contains', fromId: parentId, toId: c.id, decompositionId })
        return { status: 201, body: c, etag: c.revision, headers: { Location: conceptPath(rc.projectId, c.id) } }
      }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/concepts/{conceptId}',
    operationId: 'getConcept',
    tag: 'Concepts',
    summary: 'Read a Concept (current or an exact revision)',
    params: PC,
    query: Type.Object({ revision: Type.Optional(Type.Integer({ minimum: 1 })) }, { additionalProperties: false }),
    permission: 'read',
    crossModule: true,
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'The Concept', schema: S.Concept }, ...READ_ERRORS },
    handler: async (rc) => {
      const c = await rc.read((ctx) => requireConcept(ctx.db, rc.projectId, rc.params.conceptId, rc.query.revision as number | undefined))
      return { body: c, etag: c.revision }
    },
  })
  route({
    method: 'PATCH',
    path: '/projects/{projectId}/concepts/{conceptId}',
    operationId: 'updateConcept',
    tag: 'Concepts',
    summary: 'Edit a Concept (new immutable revision)',
    description:
      'Content changes (name, summary, description, purpose, abstraction, classifications, attributes, statements) create a new revision; unchanged content returns the current revision. statements replaces the list; statements sent with their id keep their identity. Confirming an AI hypothesis (confirm: true) records who confirmed it.',
    params: PC,
    body: S.ConceptPatch,
    permission: 'author',
    idempotency: 'optional',
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'The Concept after the change', schema: S.Concept }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const patch = body<S.ConceptPatchDto>(rc)
      const expected = rc.expected(patch.expectedRevision)
      return rc.write(async (ctx) => {
        const { concept } = await updateConcept(ctx, rc.params.conceptId, patch, expected)
        return { body: concept, etag: concept.revision }
      })
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/concepts/{conceptId}/revisions',
    operationId: 'listConceptRevisions',
    tag: 'History',
    summary: 'Revisions of a Concept, newest first, with provenance',
    params: PC,
    permission: 'read',
    responses: { 200: { description: 'Revisions', schema: Type.Array(S.RevisionSummary) }, ...READ_ERRORS },
    handler: async (rc) => ({
      body: await rc.read(async (ctx) => {
        await requireConcept(ctx.db, rc.projectId, rc.params.conceptId)
        return listRevisions(ctx.db, rc.projectId, rc.params.conceptId)
      }),
    }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/concepts/{conceptId}/compare',
    operationId: 'compareConceptRevisions',
    tag: 'History',
    summary: 'Field-by-field comparison of two revisions',
    params: PC,
    query: Type.Object({ from: Type.Integer({ minimum: 1 }), to: Type.Integer({ minimum: 1 }) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Changed fields', schema: S.RevisionComparison }, ...READ_ERRORS },
    handler: async (rc) => {
      const q = rc.query as { from: number; to: number }
      return {
        body: await rc.read(async (ctx) => {
          const a = await requireConcept(ctx.db, rc.projectId, rc.params.conceptId, q.from)
          const b = await requireConcept(ctx.db, rc.projectId, rc.params.conceptId, q.to)
          return { from: q.from, to: q.to, changes: compareConcepts(a, b) }
        }),
      }
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/concepts/{conceptId}/history',
    operationId: 'conceptHistory',
    tag: 'History',
    summary: 'Audit history of a Concept (revisions, maturity, relationships, decisions, implementations, links), with provenance',
    params: PC,
    permission: 'read',
    responses: { 200: { description: 'Audit events, newest first', schema: Type.Array(S.AuditEvent) }, ...READ_ERRORS },
    handler: async (rc) => ({
      body: await rc.read(async (ctx) => {
        await requireConcept(ctx.db, rc.projectId, rc.params.conceptId)
        return listHistory(ctx.db, rc.projectId, { conceptId: rc.params.conceptId })
      }),
    }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/history',
    operationId: 'projectHistory',
    tag: 'History',
    summary: 'Audit history of the project, optionally of one assistant proposal (traceability of AI-generated changes)',
    params: P,
    query: Type.Object({ proposalId: Type.Optional(Type.String({ maxLength: 200 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Audit events, newest first', schema: Type.Array(S.AuditEvent) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listHistory(ctx.db, rc.projectId, { proposalId: rc.query.proposalId as string | undefined }, (rc.query.limit as number | undefined) ?? 300)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/concepts/{conceptId}/maturity',
    operationId: 'changeMaturity',
    tag: 'Maturity',
    summary: 'Change the maturity of a Concept',
    description: 'No mandatory sequence. Approval gates and evidence rules are listed in x-maturity. With replacedBy (to = superseded) a replaces relationship is recorded.',
    params: PC,
    body: S.MaturityChange,
    permission: 'author',
    idempotency: 'optional',
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'The Concept', schema: S.Concept }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const b = body<{ to: ConceptMaturity; expectedRevision?: number; reason: string; replacedBy?: string }>(rc)
      const expected = rc.expected(b.expectedRevision)
      return rc.write(async (ctx) => {
        const c = await changeMaturity(ctx, rc.params.conceptId, b.to, expected, b.reason.trim(), b.replacedBy)
        return { body: c, etag: c.revision }
      })
    },
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/concepts/{conceptId}/verification-status',
    operationId: 'changeVerificationStatus',
    tag: 'Maturity',
    summary: 'Set the verification status (reviewer or administrator; needs verified evidence)',
    params: PC,
    body: S.VerificationChange,
    permission: 'decide',
    idempotency: 'optional',
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'The Concept', schema: S.Concept }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const b = body<{ status: 'not-verified' | 'partially-verified' | 'verified' | 'failed'; evidenceIds: string[]; expectedRevision?: number; reason: string }>(rc)
      const expected = rc.expected(b.expectedRevision)
      return rc.write(async (ctx) => {
        const c = await changeVerificationStatus(ctx, rc.params.conceptId, b.status, b.evidenceIds, expected, b.reason.trim())
        return { body: c, etag: c.revision }
      })
    },
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/concepts/{conceptId}/branch',
    operationId: 'branchConcept',
    tag: 'Alternatives',
    summary: 'Branch a Concept into a new alternative',
    description: 'Creates a new Concept from the current revision with its own identity and a derived-from link; optionally adds it to an alternative set. The original is never changed (branches do not overwrite each other).',
    params: PC,
    body: S.Branch,
    permission: 'author',
    idempotency: 'required',
    responses: { 201: { description: 'The new Concept', schema: S.Concept }, ...WRITE_ERRORS },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const c = await branchConcept(ctx, rc.params.conceptId, body(rc))
        return { status: 201, body: c, etag: c.revision, headers: { Location: conceptPath(rc.projectId, c.id) } }
      }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/concepts/{conceptId}/assessment',
    operationId: 'assessConcept',
    tag: 'Maturity',
    summary: 'Maturity assessment: completeness checklist, suggested maturity and next steps (deterministic)',
    params: PC,
    permission: 'read',
    responses: { 200: { description: 'Assessment', schema: S.Assessment }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => assessment(ctx.db, rc.projectId, rc.params.conceptId)) }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/graph',
    operationId: 'conceptGraph',
    tag: 'Concepts',
    summary: 'All Concepts with relationships, decompositions and alternative sets (tree and graph views)',
    params: P,
    query: Type.Object({ includeArchived: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Graph', schema: S.Graph }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => projectGraph(ctx.db, rc.projectId, !!rc.query.includeArchived)) }),
  })

  // ---- relationships and decompositions ------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/relationship-types',
    operationId: 'relationshipTypes',
    tag: 'Relationships',
    summary: 'Relationship types with direction, meaning and validation rules',
    params: P,
    permission: 'read',
    responses: { 200: { description: 'Types', schema: Type.Array(S.RelationshipTypeInfo) }, ...READ_ERRORS },
    handler: async () => ({ body: RELATIONSHIP_TYPES.map((type) => ({ type, ...RELATIONSHIP_RULES[type] })) }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/relationships',
    operationId: 'listRelationships',
    tag: 'Relationships',
    summary: 'Relationships of the project or of one Concept',
    params: P,
    query: Type.Object({ conceptId: Type.Optional(Type.String()), type: Type.Optional(Type.String({ description: 'Comma-separated types' })), includeRemoved: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Relationships', schema: Type.Array(S.Relationship) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listRelationships(ctx.db, rc.projectId, rc.query as { conceptId?: string; type?: string; includeRemoved?: boolean })) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/relationships',
    operationId: 'createRelationship',
    tag: 'Relationships',
    summary: 'Create a typed relationship',
    description: 'Validated: both Concepts exist, no self links, no duplicates (either direction for symmetric types), no cycles for acyclic types (containment over all decompositions). See relationshipTypes.',
    params: P,
    body: S.RelationshipCreate,
    permission: 'author',
    idempotency: 'required',
    responses: { 201: { description: 'Created', schema: S.Relationship }, ...WRITE_ERRORS },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const r = await createRelationship(ctx, body(rc))
        return { status: 201, body: r, etag: r.revision }
      }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/relationships/{relationshipId}/remove',
    operationId: 'removeRelationship',
    tag: 'Relationships',
    summary: 'Remove a relationship (recorded, never deleted)',
    params: PI('relationshipId'),
    body: S.RemoveBody,
    permission: 'author',
    idempotency: 'optional',
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'The removed relationship', schema: S.Relationship }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const b = body<{ expectedRevision?: number; reason?: string }>(rc)
      const expected = rc.expected(b.expectedRevision)
      return rc.write(async (ctx) => {
        const r = await removeRelationship(ctx, rc.params.relationshipId, expected, b.reason)
        return { body: r, etag: r.revision }
      })
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/decompositions',
    operationId: 'listDecompositions',
    tag: 'Relationships',
    summary: 'Named (alternative) decompositions, optionally of one parent',
    params: P,
    query: Type.Object({ parentId: Type.Optional(Type.String()) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Decompositions', schema: Type.Array(S.Decomposition) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listDecompositions(ctx.db, rc.projectId, rc.query.parentId as string | undefined)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/decompositions',
    operationId: 'createDecomposition',
    tag: 'Relationships',
    summary: 'Create an alternative decomposition structure of a parent Concept',
    params: P,
    body: S.DecompositionCreate,
    permission: 'author',
    idempotency: 'required',
    responses: { 201: { description: 'Created', schema: S.Decomposition }, ...WRITE_ERRORS },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const d = await createDecomposition(ctx, body(rc))
        return { status: 201, body: d, etag: d.recordVersion }
      }),
  })
  route({
    method: 'PATCH',
    path: '/projects/{projectId}/decompositions/{decompositionId}',
    operationId: 'updateDecomposition',
    tag: 'Relationships',
    summary: 'Rename a decomposition or mark it preferred or rejected',
    params: PI('decompositionId'),
    body: S.DecompositionPatch,
    permission: 'author',
    idempotency: 'optional',
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'Decomposition', schema: S.Decomposition }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const b = body<{ expectedRevision?: number; name?: string; description?: string; status?: 'candidate' | 'preferred' | 'rejected'; reason?: string }>(rc)
      const expected = rc.expected(b.expectedRevision)
      return rc.write(async (ctx) => {
        const d = await updateDecomposition(ctx, rc.params.decompositionId, b, expected)
        return { body: d, etag: d.recordVersion }
      })
    },
  })

  // ---- alternatives and decisions ------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/alternative-sets',
    operationId: 'listAlternativeSets',
    tag: 'Alternatives',
    summary: 'Alternative sets of the project, or those a Concept is parent or member of',
    params: P,
    query: Type.Object({ conceptId: Type.Optional(Type.String()) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Alternative sets', schema: Type.Array(S.AlternativeSet) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listSets(ctx.db, rc.projectId, { conceptId: rc.query.conceptId as string | undefined })) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/alternative-sets',
    operationId: 'createAlternativeSet',
    tag: 'Alternatives',
    summary: 'Create an alternative set (competing solutions under a parent Concept)',
    params: P,
    body: S.AlternativeSetCreate,
    permission: 'author',
    idempotency: 'required',
    responses: { 201: { description: 'Created', schema: S.AlternativeSet }, ...WRITE_ERRORS },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const s = await createSet(ctx, body(rc))
        return { status: 201, body: s, etag: s.recordVersion }
      }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/alternative-sets/{setId}',
    operationId: 'getAlternativeSet',
    tag: 'Alternatives',
    summary: 'Read an alternative set',
    params: PI('setId'),
    permission: 'read',
    responses: { 200: { description: 'Alternative set', schema: S.AlternativeSet }, ...READ_ERRORS },
    handler: async (rc) => {
      const s = await rc.read((ctx) => requireSet(ctx.db, rc.projectId, rc.params.setId))
      return { body: s, etag: s.recordVersion }
    },
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/alternative-sets/{setId}/members',
    operationId: 'addAlternative',
    tag: 'Alternatives',
    summary: 'Add an existing Concept as an alternative',
    params: PI('setId'),
    body: S.MemberAdd,
    permission: 'author',
    idempotency: 'optional',
    responses: { 200: { description: 'Alternative set', schema: S.AlternativeSet }, ...WRITE_ERRORS },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const s = await addMember(ctx, rc.params.setId, body<{ conceptId: string }>(rc).conceptId)
        return { body: s, etag: s.recordVersion }
      }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/alternative-sets/{setId}/members/{conceptId}/withdraw',
    operationId: 'withdrawAlternative',
    tag: 'Alternatives',
    summary: 'Withdraw a candidate from a set (it stays a Concept; decided members change only through decisions)',
    params: Type.Object({ projectId: Type.String(), setId: Type.String(), conceptId: Type.String() }),
    body: S.RemoveBody,
    permission: 'author',
    idempotency: 'optional',
    responses: { 200: { description: 'Alternative set', schema: S.AlternativeSet }, ...WRITE_ERRORS },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const s = await withdrawMember(ctx, rc.params.setId, rc.params.conceptId, body<{ reason?: string }>(rc).reason)
        return { body: s, etag: s.recordVersion }
      }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/decisions',
    operationId: 'listDecisions',
    tag: 'Decisions',
    summary: 'Design decisions, optionally of a Concept or an alternative set (including superseded and withdrawn ones)',
    params: P,
    query: Type.Object({ conceptId: Type.Optional(Type.String()), setId: Type.Optional(Type.String()) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Decisions, newest first', schema: Type.Array(S.Decision) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listDecisions(ctx.db, rc.projectId, rc.query as { conceptId?: string; setId?: string })) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/decisions',
    operationId: 'createDecision',
    tag: 'Decisions',
    summary: 'Propose (or record) a design decision with accepted, rejected or deferred outcomes and rationale',
    description: 'Editors propose; recording accepted or rejected outcomes (record: true or recordDecision) is the approval gate for reviewers and administrators. supersedesId revisits an earlier decision; the old record is kept.',
    params: P,
    body: S.DecisionCreate,
    permission: 'author',
    anyOf: ['author', 'decide'],
    idempotency: 'required',
    responses: { 201: { description: 'Created', schema: S.Decision }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const input = body<S.DecisionCreateDto>(rc)
      if (input.record && input.outcomes.some((o) => o.outcome !== 'deferred')) need(rc, 'decide', 'Recording accepted or rejected outcomes')
      return rc.write(async (ctx) => {
        const d = await createDecision(ctx, input)
        return { status: 201, body: d, etag: d.recordVersion }
      })
    },
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/decisions/{decisionId}/record',
    operationId: 'recordDecision',
    tag: 'Decisions',
    summary: 'Record a proposed decision (approval gate for accepted or rejected outcomes)',
    description: 'Applies the outcomes: accepted alternatives become selected, rejected ones are kept with the rejection recorded. Editors may record deferred-only decisions; accepted or rejected outcomes need a reviewer or administrator. The assistant cannot record decisions.',
    params: PI('decisionId'),
    body: S.DecisionAction,
    permission: 'decide',
    anyOf: ['author', 'decide'],
    idempotency: 'optional',
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'Decision', schema: S.Decision }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const b = body<{ expectedRevision?: number; reason?: string }>(rc)
      const expected = rc.expected(b.expectedRevision)
      return rc.write(async (ctx) => {
        const d = await recordDecision(ctx, rc.params.decisionId, expected, b.reason)
        return { body: d, etag: d.recordVersion }
      })
    },
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/decisions/{decisionId}/withdraw',
    operationId: 'withdrawDecision',
    tag: 'Decisions',
    summary: 'Withdraw a proposed decision',
    params: PI('decisionId'),
    body: S.DecisionAction,
    permission: 'author',
    anyOf: ['author', 'decide'],
    idempotency: 'optional',
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'Decision', schema: S.Decision }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const b = body<{ expectedRevision?: number; reason?: string }>(rc)
      const expected = rc.expected(b.expectedRevision)
      return rc.write(async (ctx) => {
        const d = await withdrawDecision(ctx, rc.params.decisionId, expected, b.reason)
        return { body: d, etag: d.recordVersion }
      })
    },
  })

  route({
    method: 'GET',
    path: '/projects/{projectId}/decisions/{decisionId}',
    operationId: 'getDecision',
    tag: 'Decisions',
    summary: 'Read a decision',
    params: PI('decisionId'),
    permission: 'read',
    responses: { 200: { description: 'Decision', schema: S.Decision }, ...READ_ERRORS },
    handler: async (rc) => {
      const d = await rc.read((ctx) => getDecision(ctx.db, rc.projectId, rc.params.decisionId))
      if (!d) throw notFound(`Decision ${rc.params.decisionId} not found.`)
      return { body: d, etag: d.recordVersion }
    },
  })

  // ---- trade studies ----------------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/trade-studies',
    operationId: 'listTradeStudies',
    tag: 'Trade studies',
    summary: 'Trade studies with computed results',
    params: P,
    query: Type.Object({ setId: Type.Optional(Type.String()), conceptId: Type.Optional(Type.String()) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Trade studies', schema: Type.Array(S.TradeStudy) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listStudies(ctx.db, rc.projectId, rc.query as { setId?: string; conceptId?: string })) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/trade-studies',
    operationId: 'createTradeStudy',
    tag: 'Trade studies',
    summary: 'Create a multicriteria trade study',
    params: P,
    body: S.TradeStudyCreate,
    permission: 'author',
    idempotency: 'required',
    responses: { 201: { description: 'Created', schema: S.TradeStudy }, ...WRITE_ERRORS },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const s = await createStudy(ctx, body(rc))
        return { status: 201, body: s, etag: s.revision }
      }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/trade-studies/{studyId}',
    operationId: 'getTradeStudy',
    tag: 'Trade studies',
    summary: 'Read a trade study with its computed result (weighted sum with uncertainty ranges and coverage)',
    params: PI('studyId'),
    permission: 'read',
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'Trade study', schema: S.TradeStudy }, ...READ_ERRORS },
    handler: async (rc) => {
      const s = await rc.read((ctx) => requireStudy(ctx.db, rc.projectId, rc.params.studyId))
      return { body: s, etag: s.revision }
    },
  })
  route({
    method: 'PATCH',
    path: '/projects/{projectId}/trade-studies/{studyId}',
    operationId: 'updateTradeStudy',
    tag: 'Trade studies',
    summary: 'Edit title, criteria (add, update weights, remove) and options',
    params: PI('studyId'),
    body: S.TradeStudyPatch,
    permission: 'author',
    idempotency: 'optional',
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'Trade study', schema: S.TradeStudy }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const b = body<S.TradeStudyPatchDto>(rc)
      const expected = rc.expected(b.expectedRevision)
      return rc.write(async (ctx) => {
        const s = await updateStudy(ctx, rc.params.studyId, b, expected)
        return { body: s, etag: s.revision }
      })
    },
  })
  route({
    method: 'PUT',
    path: '/projects/{projectId}/trade-studies/{studyId}/scores',
    operationId: 'putTradeScores',
    tag: 'Trade studies',
    summary: 'Record scores (values or ranges with units, or qualitative 1–5) with basis and rationale',
    description: 'All-or-nothing: if any score is invalid nothing is recorded. Scores are append-only (history is kept); clear: true removes a score.',
    params: PI('studyId'),
    body: S.ScoresPut,
    permission: 'author',
    idempotency: 'optional',
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'Trade study', schema: S.TradeStudy }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const b = body<{ expectedRevision?: number; scores: S.ScoreInputDto[] }>(rc)
      const expected = rc.expected(b.expectedRevision)
      return rc.write(async (ctx) => {
        const s = await putScores(ctx, rc.params.studyId, b.scores, expected)
        return { body: s, etag: s.revision }
      })
    },
  })

  // ---- evidence ----------------------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/evidence',
    operationId: 'listEvidence',
    tag: 'Evidence',
    summary: 'Evidence records, optionally of one Concept',
    params: P,
    query: Type.Object({ conceptId: Type.Optional(Type.String()) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Evidence', schema: Type.Array(S.Evidence) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listEvidence(ctx.db, rc.projectId, rc.query.conceptId as string | undefined)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/evidence',
    operationId: 'createEvidence',
    tag: 'Evidence',
    summary: 'Record evidence (preliminary calculation, analysis, test, review, reference)',
    description: 'Immutable. Inputs and outputs are unit-checked quantities. basis evidence (verified) needs an artifact reference and cannot come from the assistant.',
    params: P,
    body: S.EvidenceCreate,
    permission: 'author',
    idempotency: 'required',
    responses: { 201: { description: 'Created', schema: S.Evidence }, ...WRITE_ERRORS },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const e = await createEvidence(ctx, body(rc))
        return { status: 201, body: e }
      }),
  })

  // ---- implementations -----------------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/implementations',
    operationId: 'listImplementations',
    tag: 'Implementations',
    summary: 'ConceptImplementations, optionally of one Concept',
    params: P,
    query: Type.Object({ conceptId: Type.Optional(Type.String()) }, { additionalProperties: false }),
    permission: 'read',
    crossModule: true,
    responses: { 200: { description: 'Implementations', schema: Type.Array(S.Implementation) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listImplementations(ctx.db, rc.projectId, { conceptId: rc.query.conceptId as string | undefined })) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/implementations',
    operationId: 'createImplementation',
    tag: 'Implementations',
    summary: 'Create a ConceptImplementation realizing one or more Concepts',
    params: P,
    body: S.ImplementationCreate,
    permission: 'author',
    idempotency: 'required',
    responses: { 201: { description: 'Created', schema: S.Implementation }, ...WRITE_ERRORS },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const i = await createImplementation(ctx, body(rc))
        return { status: 201, body: i, etag: i.revision }
      }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/implementations/{implementationId}',
    operationId: 'getImplementation',
    tag: 'Implementations',
    summary: 'Read an implementation with its artifact references (including removed ones) and realization requests',
    params: PI('implementationId'),
    permission: 'read',
    crossModule: true,
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'Implementation', schema: S.Implementation }, ...READ_ERRORS },
    handler: async (rc) => {
      const i = await rc.read((ctx) => getImplementation(ctx.db, rc.projectId, rc.params.implementationId))
      if (!i) throw notFound(`Implementation ${rc.params.implementationId} not found.`)
      return { body: i, etag: i.revision }
    },
  })
  route({
    method: 'PATCH',
    path: '/projects/{projectId}/implementations/{implementationId}',
    operationId: 'updateImplementation',
    tag: 'Implementations',
    summary: 'Edit an implementation (name, status, realized Concepts)',
    params: PI('implementationId'),
    body: S.ImplementationPatch,
    permission: 'author',
    idempotency: 'optional',
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'Implementation', schema: S.Implementation }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const b = body<S.ImplementationPatchDto>(rc)
      const expected = rc.expected(b.expectedRevision)
      return rc.write(async (ctx) => {
        const i = await updateImplementation(ctx, rc.params.implementationId, b, expected)
        return { body: i, etag: i.revision }
      })
    },
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/implementations/{implementationId}/artifacts',
    operationId: 'linkArtifact',
    tag: 'Implementations',
    summary: 'Link an artifact to an implementation, or replace a linked one (redesign)',
    description: 'Version-aware reference (module, id, optional pinned revision). The realized Concepts keep their identity and revisions.',
    params: PI('implementationId'),
    body: S.ArtifactAdd,
    permission: 'author',
    idempotency: 'optional',
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'Implementation', schema: S.Implementation }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const b = body<{ expectedRevision?: number; artifact: S.ArtifactRefDto; replaces?: string; reason?: string }>(rc)
      const expected = rc.expected(b.expectedRevision)
      return rc.write(async (ctx) => {
        const i = await addArtifact(ctx, rc.params.implementationId, b.artifact, expected, b.replaces, b.reason)
        return { body: i, etag: i.revision }
      })
    },
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/implementations/{implementationId}/artifacts/{linkId}/remove',
    operationId: 'unlinkArtifact',
    tag: 'Implementations',
    summary: 'Remove an artifact reference (recorded; the Concepts stay valid)',
    params: Type.Object({ projectId: Type.String(), implementationId: Type.String(), linkId: Type.String() }),
    body: S.RemoveBody,
    permission: 'author',
    idempotency: 'optional',
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'Implementation', schema: S.Implementation }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const b = body<{ expectedRevision?: number; reason?: string }>(rc)
      const expected = rc.expected(b.expectedRevision)
      return rc.write(async (ctx) => {
        const i = await removeArtifact(ctx, rc.params.implementationId, rc.params.linkId, expected, b.reason)
        return { body: i, etag: i.revision }
      })
    },
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/implementations/{implementationId}/artifacts/{linkId}/repin',
    operationId: 'repinArtifact',
    tag: 'Implementations',
    summary: 'Pin an artifact reference to another revision after reviewing the change (user-approved synchronization)',
    params: Type.Object({ projectId: Type.String(), implementationId: Type.String(), linkId: Type.String() }),
    body: S.Repin,
    permission: 'author',
    idempotency: 'optional',
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'Implementation', schema: S.Implementation }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const b = body<{ expectedRevision?: number; revision: number | null; reason?: string }>(rc)
      const expected = rc.expected(b.expectedRevision)
      return rc.write(async (ctx) => {
        const i = await repinArtifact(ctx, rc.params.implementationId, rc.params.linkId, b.revision, expected, b.reason)
        return { body: i, etag: i.revision }
      })
    },
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/implementations/{implementationId}/realization-requests',
    operationId: 'requestRealization',
    tag: 'Implementations',
    summary: 'Record a realization request to another module (for example CAD generation; stays pending until that module offers an API)',
    params: PI('implementationId'),
    body: S.RealizationCreate,
    permission: 'author',
    idempotency: 'required',
    concurrency: CONCURRENCY,
    responses: { 200: { description: 'Implementation', schema: S.Implementation }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const b = body<S.RealizationCreateDto>(rc)
      const expected = rc.expected(b.expectedRevision)
      return rc.write(async (ctx) => {
        const i = await createRealizationRequest(ctx, rc.params.implementationId, b, expected)
        return { body: i, etag: i.revision }
      })
    },
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/realization-requests/{requestId}/status',
    operationId: 'setRealizationStatus',
    tag: 'Implementations',
    summary: 'Cancel a realization request or mark it fulfilled by an artifact',
    params: PI('requestId'),
    body: S.RealizationStatus,
    permission: 'author',
    idempotency: 'optional',
    responses: { 200: { description: 'Implementation', schema: S.Implementation }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const b = body<{ status: 'cancelled' | 'fulfilled'; fulfilledBy?: S.ArtifactRefDto; reason?: string }>(rc)
      return rc.write(async (ctx) => {
        const i = await setRealizationStatus(ctx, rc.params.requestId, b.status, b.fulfilledBy, b.reason)
        return { body: i, etag: i.revision }
      })
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/artifact-concepts',
    operationId: 'conceptsForArtifact',
    tag: 'Integration',
    summary: 'Concepts an artifact realizes (through implementations) or is linked to',
    params: P,
    query: Type.Object({ module: S.ArtifactModule, id: Type.String({ minLength: 1, maxLength: 2000 }) }, { additionalProperties: false }),
    permission: 'read',
    crossModule: true,
    responses: { 200: { description: 'Concepts', schema: S.ArtifactConcepts }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => artifactConcepts(ctx.db, rc.projectId, rc.query.module as string, rc.query.id as string)) }),
  })

  // ---- concept links -----------------------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/links',
    operationId: 'listLinks',
    tag: 'Integration',
    summary: 'Concept links to requirements and other artifacts',
    params: P,
    query: Type.Object({ conceptId: Type.Optional(Type.String()), module: Type.Optional(S.ArtifactModule), artifactId: Type.Optional(Type.String()), includeRemoved: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Links', schema: Type.Array(S.ConceptLink) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listLinks(ctx.db, rc.projectId, rc.query as { conceptId?: string; module?: string; artifactId?: string; includeRemoved?: boolean })) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/concepts/{conceptId}/links',
    operationId: 'createLink',
    tag: 'Integration',
    summary: 'Link a Concept to a requirement (satisfies, derives, refines, proposes) or reference any artifact',
    params: PC,
    body: S.LinkCreate,
    permission: 'author',
    idempotency: 'required',
    responses: { 201: { description: 'Created', schema: S.ConceptLink }, ...WRITE_ERRORS },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const l = await createLink(ctx, rc.params.conceptId, body(rc))
        return { status: 201, body: l }
      }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/links/{linkId}/remove',
    operationId: 'removeLink',
    tag: 'Integration',
    summary: 'Remove a Concept link (recorded)',
    params: PI('linkId'),
    body: S.RemoveBody,
    permission: 'author',
    idempotency: 'optional',
    responses: { 200: { description: 'The removed link', schema: S.ConceptLink }, ...WRITE_ERRORS },
    handler: async (rc) => rc.write(async (ctx) => ({ body: await removeLink(ctx, rc.params.linkId, body<{ reason?: string }>(rc).reason) })),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/links/{linkId}/repin',
    operationId: 'repinLink',
    tag: 'Integration',
    summary: 'Pin a link to another artifact revision after reviewing the change (user-approved synchronization)',
    params: PI('linkId'),
    body: S.Repin,
    permission: 'author',
    idempotency: 'optional',
    responses: { 200: { description: 'The new link', schema: S.ConceptLink }, ...WRITE_ERRORS },
    handler: async (rc) => {
      const b = body<{ revision: number | null; reason?: string }>(rc)
      return rc.write(async (ctx) => ({ body: await repinLink(ctx, rc.params.linkId, b.revision, b.reason) }))
    },
  })

  // ---- explorations ------------------------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/explorations',
    operationId: 'listExplorations',
    tag: 'Explorations',
    summary: 'Explorations (atomic sets of generated alternatives), optionally involving one Concept',
    params: P,
    query: Type.Object({ conceptId: Type.Optional(Type.String()) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Explorations', schema: Type.Array(S.Exploration) }, ...READ_ERRORS },
    handler: async (rc) => ({ body: await rc.read((ctx) => listExplorations(ctx.db, rc.projectId, rc.query.conceptId as string | undefined)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/explorations',
    operationId: 'createExploration',
    tag: 'Explorations',
    summary: 'Create a parent Concept with alternatives, decompositions, interfaces, preliminary evidence and a trade study in one transaction',
    params: P,
    body: S.ExplorationCreate,
    permission: 'author',
    idempotency: 'required',
    responses: { 201: { description: 'Created', schema: S.Exploration }, ...WRITE_ERRORS },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const e = await createExploration(ctx, body(rc))
        return { status: 201, body: e }
      }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/explorations/{explorationId}',
    operationId: 'getExploration',
    tag: 'Explorations',
    summary: 'Read an exploration',
    params: PI('explorationId'),
    permission: 'read',
    responses: { 200: { description: 'Exploration', schema: S.Exploration }, ...READ_ERRORS },
    handler: async (rc) => {
      const e = await rc.read((ctx) => getExploration(ctx.db, rc.projectId, rc.params.explorationId))
      if (!e) throw notFound(`Exploration ${rc.params.explorationId} not found.`)
      return { body: e }
    },
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/explorations/{explorationId}/undo',
    operationId: 'undoExploration',
    tag: 'Explorations',
    summary: 'Compensating undo: archive the created Concepts, remove their relationships, withdraw the alternatives (nothing is deleted)',
    params: PI('explorationId'),
    body: S.RemoveBody,
    permission: 'author',
    idempotency: 'optional',
    responses: { 200: { description: 'Exploration', schema: S.Exploration }, ...WRITE_ERRORS },
    handler: async (rc) => rc.write(async (ctx) => ({ body: await undoExploration(ctx, rc.params.explorationId, body<{ reason?: string }>(rc).reason) })),
  })

  // ---- utilities -------------------------------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/me/permissions',
    operationId: 'myConceptPermissions',
    tag: 'Utilities',
    summary: 'The caller’s role and permissions in the project (for clients; the server enforces)',
    params: P,
    permission: 'read',
    responses: { 200: { description: 'Permissions', schema: S.Permissions }, ...READ_ERRORS },
    handler: async (rc) => ({ body: { userId: rc.principal.userId, projectId: rc.projectId, role: rc.role, permissions: (Object.keys(PERMISSIONS) as Permission[]).filter((p) => roleAllows(rc.role, p)) } }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/units',
    operationId: 'checkUnit',
    tag: 'Utilities',
    summary: 'Check a unit expression and its dimension; lists common units',
    params: P,
    query: Type.Object({ unit: Type.Optional(Type.String({ maxLength: 60 })) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Unit check', schema: S.UnitCheck }, ...READ_ERRORS },
    handler: async (rc) => {
      const unit = (rc.query.unit as string | undefined) ?? '-'
      try {
        parseUnit(unit)
        return { body: { unit, valid: true, dimension: dimensionName(unit), common: COMMON_UNITS } }
      } catch (e) {
        return { body: { unit, valid: false, dimension: 'unknown', message: (e as Error).message, common: COMMON_UNITS } }
      }
    },
  })
}

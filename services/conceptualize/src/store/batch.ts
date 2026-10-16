import { Ajv, type ValidateFunction } from 'ajv'
import addFormatsModule from 'ajv-formats'
import { Type, type TSchema } from '@sinclair/typebox'
import { forbidden, invalid, ServiceError } from '../errors'
import { roleAllows } from '../domain/rules'
import * as C from '../http/calcSchemas'
import * as D from '../http/designSchemas'
import { createCalculationModel } from './calculations'
import * as S from '../http/schemas'
import { addMember, createDecision, createSet, flagDecision, getDecision, recordDecision } from './alternatives'
import { createAssumption } from './assumptions'
import { createConcept, updateConcept } from './concepts'
import { createConstraint, updateConstraint } from './constraints'
import { audit, type Ctx } from './context'
import { createDesignLink } from './designLinks'
import { createFunction, updateFunction } from './functions'
import { createEvidence, createImplementation, createLink } from './implementations'
import { createRelationship } from './relationships'
import { createStudy as createTradeStudy, putScores } from './tradeStudies'

/**
 * Atomic batch (CR-C10, refined by R1-1): `items` of `{ op, as?, body }` executed in one transaction with
 * one provenance. `op` is the OpenAPI operationId of the write (R1 names); `as` names a placeholder
 * ("$fn1") whose created ID replaces that string anywhere in later bodies. Each body is validated with the
 * schema and rules of its single endpoint; any failure rolls back the whole batch and names the item.
 */

const addFormats = addFormatsModule as unknown as (a: Ajv) => Ajv
const ajv = addFormats(new Ajv({ allErrors: true, strict: false, coerceTypes: false, useDefaults: false }))

function stripIds(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(stripIds)
  if (!schema || typeof schema !== 'object') return schema
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(schema)) if (k !== '$id') out[k] = stripIds(v)
  return out
}
const props = (schema: TSchema) => (schema as unknown as { properties: Record<string, TSchema> }).properties
const withFields = (schema: TSchema, fields: Record<string, TSchema>, omit: string[] = []) =>
  Type.Object({ ...Object.fromEntries(Object.entries(props(schema)).filter(([k]) => !omit.includes(k))), ...fields }, { additionalProperties: false })
const Id = { id: S.Uuid }
const Expected = { expectedRevision: Type.Integer({ minimum: 1 }) }

/** R1 bodies of an alternative set and an implementation (single endpoints keep their v1 bodies and accept these too). */
export const R1AlternativeSet = Type.Object(
  { name: Type.String({ minLength: 1, maxLength: 200 }), question: Type.Optional(Type.String({ maxLength: 4000 })), parentConceptId: Type.Optional(S.Uuid), parentId: Type.Optional(S.Uuid), functionId: Type.Optional(S.Uuid), memberIds: Type.Optional(Type.Array(S.Uuid, { maxItems: 50 })) },
  { additionalProperties: false },
)
export const R1Implementation = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 200 }),
    description: Type.Optional(Type.String({ maxLength: 4000 })),
    status: Type.Optional(S.ImplementationStatus),
    concepts: Type.Optional(Type.Array(Type.Object({ conceptId: S.Uuid, realizedConceptRevision: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])) }, { additionalProperties: false }), { minItems: 1, maxItems: 50 })),
    conceptIds: Type.Optional(Type.Array(S.Uuid, { minItems: 1, maxItems: 50 })),
    artifacts: Type.Optional(Type.Array(S.ArtifactRef, { maxItems: 100 })),
    reason: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  { additionalProperties: false },
)

/** Body schema per op. R1 operations first, then Conceptualize extensions (named after their operationIds). */
export const BATCH_BODIES: Record<string, TSchema> = {
  createFunction: D.FunctionCreate,
  createConcept: S.ConceptCreate,
  createConstraint: D.ConstraintCreate,
  reviseConstraint: withFields(D.ConstraintPatch, { ...Id, ...Expected, reason: Type.String({ minLength: 1, maxLength: 2000 }) }, ['expectedRevision', 'reason']),
  createAssumption: D.AssumptionCreate,
  createEvidence: D.EvidenceCreateV,
  createLink: D.DesignLinkCreate,
  createAlternativeSet: R1AlternativeSet,
  createTradeStudy: S.TradeStudyCreate,
  putScores: withFields(S.ScoresPut, { studyId: S.Uuid, ...Expected }, ['expectedRevision']),
  proposeDecision: withFields(D.DecisionCreateV, {}, ['record']),
  recordDecision: Type.Object({ ...Id, reason: Type.Optional(Type.String({ maxLength: 2000 })), expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })) }, { additionalProperties: false }),
  flagDecisionForReview: withFields(D.ReviewFlag, Id),
  createImplementation: R1Implementation,
  createCalculationModel: C.CalculationModelCreate,
  // Conceptualize extensions
  updateConcept: withFields(S.ConceptPatch, { ...Id, ...Expected }, ['expectedRevision']),
  updateFunction: withFields(D.FunctionPatch, { ...Id, ...Expected }, ['expectedRevision']),
  createRelationship: S.RelationshipCreate,
  createConceptLink: withFields(S.LinkCreate, { conceptId: S.Uuid }),
  addAlternative: Type.Object({ setId: S.Uuid, conceptId: S.Uuid }, { additionalProperties: false }),
}
export const R1_BATCH_OPS = ['createFunction', 'createConcept', 'createConstraint', 'reviseConstraint', 'createAssumption', 'createEvidence', 'createLink', 'createAlternativeSet', 'createTradeStudy', 'putScores', 'proposeDecision', 'recordDecision', 'flagDecisionForReview', 'createImplementation', 'createCalculationModel'] as const

/** Permission per item (the batch route admits author or decide; each item is checked like its single endpoint). */
const ITEM_PERMISSION: Record<string, ('author' | 'decide')[]> = { recordDecision: ['decide'], flagDecisionForReview: ['author', 'decide'], reviseConstraint: ['author', 'decide'] }

const validators = new Map<string, ValidateFunction>()
const validatorFor = (op: string) => {
  let v = validators.get(op)
  if (!v) validators.set(op, (v = ajv.compile(stripIds(BATCH_BODIES[op]) as object)))
  return v
}

const PLACEHOLDER = /^\$[A-Za-z][A-Za-z0-9_-]{0,40}$/
const notImplemented = (message: string) => new ServiceError('invalid', message, { notImplemented: true, fields: { op: 'not implemented yet' } }, 501)

function substitute(value: unknown, ids: Map<string, string>, path: string): unknown {
  if (typeof value === 'string' && PLACEHOLDER.test(value)) {
    const id = ids.get(value)
    if (!id) throw invalid(`Unknown placeholder ${value}; it must be defined (as) by an earlier item.`, { [path]: 'unknown placeholder' })
    return id
  }
  if (Array.isArray(value)) return value.map((v, i) => substitute(v, ids, `${path}.${i}`))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, ids, `${path}.${k}`)]))
  return value
}

type Result = { id: string; key?: string | null; revision?: number | null }

export async function runBatch(ctx: Ctx, request: D.BatchRequestDto) {
  const ids = new Map<string, string>()
  const results: { index: number; op: string; as: string | null; id: string; key: string | null; revision: number | null }[] = []
  for (const [index, item] of request.items.entries()) {
    const path = `items.${index}`
    if (item.as && ids.has(item.as)) throw invalid(`Placeholder ${item.as} is defined twice.`, { [`${path}.as`]: 'duplicate' })
    const need = ITEM_PERMISSION[item.op] ?? ['author']
    if (!need.some((p) => roleAllows(ctx.role, p))) throw forbidden(`Item ${index} (${item.op}) needs the ${need.join(' or ')} permission; your role is ${ctx.role}.`)
    if (!(item.op in BATCH_BODIES)) throw invalid(`Item ${index}: unknown op ${item.op}.`, { [`${path}.op`]: `one of ${Object.keys(BATCH_BODIES).join(', ')}` })
    const body = substitute(item.body, ids, `${path}.body`) as Record<string, unknown>
    let out: Result
    try {
      const validate = validatorFor(item.op)
      if (!validate(body)) {
        const fields = Object.fromEntries((validate.errors ?? []).map((e) => [`${path}.body${e.instancePath.replace(/\//g, '.')}`, `${e.message ?? 'invalid'}${e.params && 'additionalProperty' in e.params ? ` (${e.params.additionalProperty})` : ''}`]))
        throw invalid(`Item ${index} (${item.op}) is not valid.`, fields)
      }
      out = await execute(ctx, item.op, body)
    } catch (e) {
      if (e instanceof ServiceError && !e.message.startsWith(`Item ${index} (`)) {
        const fields = Object.fromEntries(Object.entries(e.details?.fields ?? {}).map(([k, v]) => [k.startsWith(path) ? k : `${path}.body.${k}`, v]))
        Object.assign(e, { message: `Item ${index} (${item.op}): ${e.message}`, details: { ...(e.details ?? {}), fields: { ...fields, [path]: 'failed' } } })
      }
      throw e
    }
    if (item.as) ids.set(item.as, out.id)
    results.push({ index, op: item.op, as: item.as ?? null, id: out.id, key: out.key ?? null, revision: out.revision ?? null })
  }
  await audit(ctx, { entityType: 'batch', entityId: results[0]?.id ?? 'batch', action: 'applied', reason: request.reason ?? '', details: { items: results.map((r) => `${r.op}:${r.id}`) } })
  return { results, ids: Object.fromEntries(ids) }
}

const performsLinks = async (ctx: Ctx, conceptId: string, functions: string[] | undefined) => {
  for (const fn of functions ?? []) await createDesignLink(ctx, { type: 'performs', from: { module: 'conceptualize', type: 'concept', id: conceptId }, to: { module: 'conceptualize', type: 'function', id: fn } })
}

async function execute(ctx: Ctx, op: string, body: Record<string, unknown>): Promise<Result> {
  switch (op) {
    case 'createFunction':
      return createFunction(ctx, body as D.FunctionCreateDto)
    case 'createConcept': {
      const { parentId, decompositionId, performs, ...rest } = body as S.ConceptCreateDto
      if (decompositionId && !parentId) throw invalid('decompositionId needs parentId.', { decompositionId: 'needs parentId' })
      const c = await createConcept(ctx, rest)
      if (parentId) await createRelationship(ctx, { type: 'contains', fromId: parentId, toId: c.id, decompositionId })
      await performsLinks(ctx, c.id, performs)
      return c
    }
    case 'createConstraint':
      return createConstraint(ctx, body as D.ConstraintCreateDto)
    case 'reviseConstraint': {
      const { id, expectedRevision, ...patch } = body as D.ConstraintPatchDto & { id: string; expectedRevision: number }
      return updateConstraint(ctx, id, patch, expectedRevision)
    }
    case 'createAssumption':
      return createAssumption(ctx, body as D.AssumptionCreateDto)
    case 'createEvidence':
      return createEvidence(ctx, body as D.EvidenceCreateVDto)
    case 'createLink':
      return createDesignLink(ctx, body as D.DesignLinkCreateDto)
    case 'createAlternativeSet': {
      const b = body as { name: string; question?: string; parentConceptId?: string; parentId?: string; functionId?: string; memberIds?: string[] }
      if (b.functionId) throw notImplemented('Alternative sets for a Function (functionId) arrive with CR-C7.')
      const parentId = b.parentConceptId ?? b.parentId
      if (!parentId) throw invalid('An alternative set in Conceptualize v1 belongs to a parent Concept (parentConceptId).', { parentConceptId: 'required' })
      const s = await createSet(ctx, { parentId, name: b.name, question: b.question, memberIds: b.memberIds })
      return { id: s.id, key: s.key, revision: s.recordVersion }
    }
    case 'createTradeStudy': {
      const t = await createTradeStudy(ctx, body as S.TradeStudyCreateDto)
      return { id: t.id, key: t.key, revision: t.revision }
    }
    case 'putScores': {
      const { studyId, expectedRevision, scores } = body as { studyId: string; expectedRevision: number; scores: S.ScoreInputDto[] }
      const t = await putScores(ctx, studyId, scores, expectedRevision)
      return { id: t.id, key: t.key, revision: t.revision }
    }
    case 'proposeDecision': {
      // R1-3: reviewers do not author; recording is a separate reviewer action (recordDecision).
      if (!roleAllows(ctx.role, 'author')) throw forbidden('Proposing a decision needs an editor or administrator; a reviewer records it.')
      const d = await createDecision(ctx, body as D.DecisionCreateVDto)
      return { id: d.id, key: d.key, revision: d.recordVersion }
    }
    case 'recordDecision': {
      const b = body as { id: string; reason?: string; expectedRevision?: number }
      const current = await getDecision(ctx.db, ctx.projectId, b.id)
      if (!current) throw invalid(`Decision ${b.id} not found.`, { id: 'not found' })
      if (!roleAllows(ctx.role, 'decide')) throw forbidden('Recording a decision needs a reviewer or administrator.')
      const d = await recordDecision(ctx, b.id, b.expectedRevision ?? current.recordVersion, b.reason ?? '')
      return { id: d.id, key: d.key, revision: d.recordVersion }
    }
    case 'flagDecisionForReview': {
      const { id, ...flag } = body as { id: string; reason: string; impactReportId?: string; conditionId?: string }
      const d = await flagDecision(ctx, id, flag)
      return { id: d.id, key: d.key, revision: d.recordVersion }
    }
    case 'createCalculationModel':
      return createCalculationModel(ctx, body as C.CalculationModelCreateDto)
    case 'createImplementation': {
      const b = body as { name: string; description?: string; status?: S.ImplementationCreateDto['status']; concepts?: { conceptId: string; realizedConceptRevision?: number | null }[]; conceptIds?: string[]; artifacts?: S.ImplementationCreateDto['artifacts']; reason?: string }
      if (b.concepts?.some((c) => c.realizedConceptRevision != null)) throw notImplemented('realizedConceptRevision arrives with CR-C11 (implementation synchronization).')
      const conceptIds = b.conceptIds ?? b.concepts?.map((c) => c.conceptId) ?? []
      if (!conceptIds.length) throw invalid('An implementation realizes at least one Concept.', { concepts: 'required' })
      const impl = await createImplementation(ctx, { name: b.name, description: b.description, status: b.status, conceptIds, artifacts: b.artifacts, reason: b.reason } as S.ImplementationCreateDto)
      return { id: impl.id, key: impl.key, revision: impl.revision }
    }
    case 'updateConcept': {
      const { id, expectedRevision, ...patch } = body as S.ConceptPatchDto & { id: string; expectedRevision: number }
      return (await updateConcept(ctx, id, patch, expectedRevision)).concept
    }
    case 'updateFunction': {
      const { id, expectedRevision, ...patch } = body as D.FunctionPatchDto & { id: string; expectedRevision: number }
      return updateFunction(ctx, id, patch, expectedRevision)
    }
    case 'createRelationship':
      return createRelationship(ctx, body as S.RelationshipCreateDto)
    case 'createConceptLink': {
      const { conceptId, ...rest } = body as S.LinkCreateDto & { conceptId: string }
      return createLink(ctx, conceptId, rest)
    }
    case 'addAlternative': {
      const s = await addMember(ctx, body.setId as string, body.conceptId as string)
      return { id: s.id, key: s.key, revision: s.recordVersion }
    }
    default:
      throw invalid(`Unknown op ${op}.`, { op: 'unknown' })
  }
}

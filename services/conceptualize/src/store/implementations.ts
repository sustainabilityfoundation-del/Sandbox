import { randomUUID } from 'node:crypto'
import { conflict, forbidden, invalid, notFound } from '../errors'
import { KEY_PREFIX, roleAllows } from '../domain/rules'
import { quantityProblem } from '../domain/units'
import type { ArtifactRefDto, ConceptLinkDto, ImplementationCreateDto, ImplementationDto, ImplementationPatchDto, LinkCreateDto, RealizationCreateDto } from '../http/schemas'
import type { EvidenceCreateVDto as EvidenceCreateDto, EvidenceVDto as EvidenceDto } from '../http/designSchemas'
import { requireConcept } from './concepts'
import { audit, emit, isUuid, iso, isoRequired, nextKey, prov, type Ctx, type Queryable } from './context'

type Prov = ImplementationDto['artifacts'][number]['provenance']

// ---- artifact references --------------------------------------------------------------------------------

const ID_PATTERN: Record<ArtifactRefDto['module'], RegExp> = {
  requirements: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  // One module per artifact kind (contracts §3): SysML elements SYS-…, CAD representations CAD-…,
  // physical components and saved results/verification records in the twin (ROD-120, ACT-100, OUT-…).
  sysml: /^SYS-[A-Za-z0-9._-]+$/,
  cad: /^CAD-[A-Za-z0-9._-]+$/,
  twin: /^(?!SYS-|CAD-)[A-Z][A-Z0-9]*-[A-Za-z0-9._-]+$/,
  analysis: /^[A-Za-z][A-Za-z0-9._:-]{0,199}$/,
  external: /^(https?:\/\/\S+|[A-Za-z][\w.-]*:\S+|[\w .:/#-]{1,300})$/,
}

/**
 * Checks an ArtifactRef's shape (contracts §3): requirement UUIDs, twin object IDs for SysML, CAD and
 * twin artifacts, a test-adapter identifier for analysis, a URL or document reference for external.
 * Existence is checked by clients through the owning module (contracts §9: stale and broken links
 * are detected client-side in v1); the service never copies the artifact's data.
 */
export function artifactProblem(a: ArtifactRefDto): string | null {
  if (!ID_PATTERN[a.module]) return `unknown module ${a.module}`
  if (!ID_PATTERN[a.module].test(a.id)) {
    return a.module === 'requirements' ? 'a requirement is referenced by its canonical UUID (resolve keys such as REQ-001 first)' : `"${a.id}" is not a valid ${a.module} identifier`
  }
  return null
}

// ---- evidence ------------------------------------------------------------------------------------------------

interface EvidenceRow {
  id: string
  key: string
  concept_id: string | null
  concept_revision: number | null
  kind: EvidenceDto['kind']
  title: string
  summary: string
  basis: EvidenceDto['basis']
  method: string
  inputs: EvidenceDto['inputs']
  outputs: EvidenceDto['outputs']
  assumptions: string[]
  artifact: EvidenceDto['artifact']
  supersedes_id: string | null
  created_at: Date
  created_by: string
  source_kind: Prov['sourceKind']
  conversation_id: string | null
  proposal_id: string | null
  applicability: Record<string, unknown>
  manifest: Record<string, unknown> | null
  source: EvidenceDto['source']
  assumption_ids: string[]
}
interface ReviewRow {
  id: string
  evidence_id: string
  outcome: 'accepted' | 'rejected'
  method: string
  note: string
  reviewer: string
  reviewed_at: Date
}

async function toEvidenceDtos(db: Queryable, rows: EvidenceRow[]): Promise<EvidenceDto[]> {
  const ids = rows.map((r) => r.id)
  const subjects = ids.length ? (await db.query<{ evidence_id: string; subject_type: string; subject_id: string; subject_revision: number | null }>('SELECT * FROM conceptualize.evidence_subjects WHERE evidence_id = ANY($1::uuid[])', [ids])).rows : []
  const reviews = ids.length ? (await db.query<ReviewRow>('SELECT * FROM conceptualize.evidence_reviews WHERE evidence_id = ANY($1::uuid[]) ORDER BY reviewed_at, id', [ids])).rows : []
  return rows.map((r) => {
    const rv = reviews.filter((x) => x.evidence_id === r.id)
    return {
      id: r.id,
      key: r.key,
      conceptId: r.concept_id,
      conceptRevision: r.concept_revision,
      kind: r.kind,
      title: r.title,
      summary: r.summary,
      basis: r.basis,
      method: r.method,
      inputs: r.inputs,
      outputs: r.outputs,
      assumptions: r.assumptions,
      artifact: r.artifact,
      supersedesId: r.supersedes_id,
      createdAt: isoRequired(r.created_at),
      createdBy: r.created_by,
      provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id },
      subjects: subjects.filter((s) => s.evidence_id === r.id).map((s) => ({ module: 'conceptualize' as const, type: s.subject_type as never, id: s.subject_id, ...(s.subject_revision ? { revision: s.subject_revision } : {}) })),
      applicability: r.applicability,
      manifest: r.manifest,
      source: r.source,
      assumptionIds: r.assumption_ids,
      reviews: rv.map((x) => ({ id: x.id, outcome: x.outcome, method: x.method, note: x.note, reviewer: x.reviewer, reviewedAt: isoRequired(x.reviewed_at) })),
      validationStatus: rv.length ? rv[rv.length - 1].outcome : 'unreviewed',
    }
  })
}

export async function getEvidence(db: Queryable, projectId: string, id: string): Promise<EvidenceDto | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<EvidenceRow>('SELECT * FROM conceptualize.evidence WHERE id = $1 AND project_id = $2', [id, projectId])
  return (await toEvidenceDtos(db, rows))[0]
}

/** Evidence of the project, or of one subject (any design entity; Concepts also through concept_id). */
export async function listEvidence(db: Queryable, projectId: string, subjectId?: string): Promise<EvidenceDto[]> {
  if (subjectId && !isUuid(subjectId)) throw invalid('conceptId must be a UUID.', { conceptId: 'uuid' }, 400)
  const { rows } = await db.query<EvidenceRow>(
    `SELECT * FROM conceptualize.evidence e WHERE e.project_id = $1 ${subjectId ? 'AND (e.concept_id = $2 OR EXISTS (SELECT 1 FROM conceptualize.evidence_subjects s WHERE s.evidence_id = e.id AND s.subject_id = $2))' : ''} ORDER BY e.created_at DESC, e.key DESC`,
    subjectId ? [projectId, subjectId] : [projectId],
  )
  return toEvidenceDtos(db, rows)
}

/**
 * Records evidence (immutable). Preliminary records (ai-hypothesis, assumption, assessment, estimate) keep
 * method, inputs, outputs, units and assumptions. calculated needs a reproducibility manifest; verified
 * evidence (basis evidence) needs an artifact reference and a person. Subjects may be any design records;
 * conceptId stays supported as the first subject.
 */
export async function createEvidence(ctx: Ctx, input: EvidenceCreateDto): Promise<EvidenceDto> {
  const subjects = [...(input.subjects ?? [])]
  if (input.conceptId && !subjects.some((s) => s.type === 'concept' && s.id === input.conceptId)) subjects.unshift({ module: 'conceptualize', type: 'concept', id: input.conceptId })
  if (!subjects.length) throw invalid('Evidence needs a subject (conceptId or subjects).', { subjects: 'required' })
  const { requireRefs } = await import('./refs')
  const found = await requireRefs(ctx.db, ctx.projectId, subjects, 'subjects')
  const firstConcept = subjects.find((s) => s.type === 'concept')
  const concept = firstConcept ? await requireConcept(ctx.db, ctx.projectId, firstConcept.id) : undefined
  const errors: Record<string, string> = {}
  if (ctx.provenance.sourceKind === 'assistant' && input.basis === 'evidence') errors.basis = 'the assistant cannot record verified evidence; it records estimates or hypotheses'
  if (input.basis === 'evidence' && !input.artifact) errors.artifact = 'verified evidence references the authoritative result (artifact) in its owning module'
  // ADR-0043: calculated evidence carries its reproducibility manifest; the assistant may not assert it until
  // the service re-verifies manifests with the calculation engine (CR-C8, next sprint).
  if (input.basis === 'calculated' && !input.manifest) errors.manifest = 'calculated evidence needs its reproducibility manifest'
  if (input.basis === 'calculated' && ctx.provenance.sourceKind === 'assistant') errors.basis = 'the assistant cannot record calculated evidence until manifests are re-verified by the service (CR-C8)'
  if (input.artifact) {
    const p = artifactProblem(input.artifact)
    if (p) errors.artifact = p
  }
  if (input.source && (input.source as { module: string }).module !== 'conceptualize') {
    const p = artifactProblem(input.source as ArtifactRefDto)
    if (p) errors.source = p
  }
  for (const [list, name] of [
    [input.inputs ?? [], 'inputs'],
    [input.outputs ?? [], 'outputs'],
  ] as const) {
    list.forEach((q, i) => {
      const p = quantityProblem(q)
      if (p) errors[`${name}.${i}`] = `${q.name}: ${p}`
    })
  }
  if (input.supersedesId) {
    const { rowCount } = await ctx.db.query('SELECT 1 FROM conceptualize.evidence WHERE id = $1 AND project_id = $2', [input.supersedesId, ctx.projectId])
    if (!rowCount) errors.supersedesId = 'not an evidence record of this project'
  }
  if (input.assumptionIds?.length) {
    const { rows } = await ctx.db.query<{ id: string }>('SELECT id FROM conceptualize.assumptions WHERE project_id = $1 AND id = ANY($2::uuid[])', [ctx.projectId, input.assumptionIds])
    if (rows.length !== new Set(input.assumptionIds).size) errors.assumptionIds = 'unknown assumption'
  }
  if (Object.keys(errors).length) throw invalid('The evidence record is not valid.', errors)
  const id = randomUUID()
  const key = await nextKey(ctx, KEY_PREFIX.evidence, 'evidence')
  const [sourceKind, conversationId, proposalId] = prov(ctx)
  await ctx.db.query(
    `INSERT INTO conceptualize.evidence (id, project_id, key, concept_id, concept_revision, kind, title, summary, basis, method, inputs, outputs, assumptions, artifact, supersedes_id, created_at, created_by, source_kind, conversation_id, proposal_id, applicability, manifest, source, assumption_ids)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
    [
      id,
      ctx.projectId,
      key,
      concept?.id ?? null,
      concept?.revision ?? null,
      input.kind,
      input.title.trim(),
      (input.summary ?? '').trim(),
      input.basis,
      (input.method ?? '').trim(),
      JSON.stringify(input.inputs ?? []),
      JSON.stringify(input.outputs ?? []),
      input.assumptions ?? [],
      input.artifact ? JSON.stringify(input.artifact) : null,
      input.supersedesId ?? null,
      ctx.now,
      ctx.actor,
      sourceKind,
      conversationId,
      proposalId,
      JSON.stringify(input.applicability ?? {}),
      input.manifest ? JSON.stringify(input.manifest) : null,
      input.source ? JSON.stringify(input.source) : null,
      input.assumptionIds ?? [],
    ],
  )
  for (const s of subjects) {
    const info = found.find((f) => f.ref.type === s.type && f.ref.id === s.id)!
    await ctx.db.query('INSERT INTO conceptualize.evidence_subjects (evidence_id, subject_type, subject_id, subject_revision) VALUES ($1,$2,$3,$4)', [id, s.type, s.id, s.revision ?? info.revision])
  }
  const conceptIds = subjects.filter((s) => s.type === 'concept').map((s) => s.id)
  await audit(ctx, { entityType: 'evidence', entityId: id, conceptIds, action: 'recorded', revision: concept?.revision ?? null, details: { key, kind: input.kind, basis: input.basis, subjects: subjects.map((s) => `${s.type}:${s.id}`) } })
  if (concept) await emit(ctx, 'concept.revised', concept.id, concept.revision)
  await emit(ctx, 'evidence.recorded', id, 1)
  return (await getEvidence(ctx.db, ctx.projectId, id))!
}

/** Append-only review of an evidence record (reviewer or administrator; never the assistant). */
export async function reviewEvidence(ctx: Ctx, id: string, input: { outcome: 'accepted' | 'rejected'; method?: string; note?: string }): Promise<EvidenceDto> {
  if (!roleAllows(ctx.role, 'decide')) throw forbidden('Reviewing evidence needs a reviewer or administrator.')
  if (ctx.provenance.sourceKind === 'assistant') throw forbidden('The assistant cannot review evidence.')
  const e = await getEvidence(ctx.db, ctx.projectId, id)
  if (!e) throw notFound(`Evidence ${id} not found.`)
  if (e.createdBy === ctx.actor && input.outcome === 'accepted') throw forbidden('Evidence is accepted by a reviewer other than the person who recorded it.')
  await ctx.db.query('INSERT INTO conceptualize.evidence_reviews (id, evidence_id, outcome, method, note, reviewer, reviewed_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), id, input.outcome, (input.method ?? '').trim(), (input.note ?? '').trim(), ctx.actor, ctx.now])
  await audit(ctx, { entityType: 'evidence', entityId: id, conceptIds: e.subjects.filter((s) => s.type === 'concept').map((s) => s.id), action: `review-${input.outcome}`, reason: input.note ?? '', details: { method: input.method ?? '' } })
  await emit(ctx, 'evidence.reviewed', id, e.reviews.length + 2)
  return (await getEvidence(ctx.db, ctx.projectId, id))!
}

// ---- implementations -------------------------------------------------------------------------------------------

interface ImplRow {
  id: string
  key: string
  name: string
  description: string
  status: ImplementationDto['status']
  revision: number
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
}
interface ArtRow {
  id: string
  implementation_id: string
  module: ArtifactRefDto['module']
  artifact_id: string
  artifact_revision: number | null
  kind: string | null
  label: string
  added_at: Date
  added_by: string
  removed: boolean
  removed_at: Date | null
  removed_by: string | null
  source_kind: Prov['sourceKind']
  conversation_id: string | null
  proposal_id: string | null
}
interface ReqRow {
  id: string
  implementation_id: string
  target_module: ImplementationDto['realizationRequests'][number]['targetModule']
  request_kind: string
  description: string
  parameters: Record<string, unknown>
  status: 'pending' | 'cancelled' | 'fulfilled'
  fulfilled_by: ArtifactRefDto | null
  created_at: Date
  created_by: string
  updated_at: Date
  source_kind: Prov['sourceKind']
  conversation_id: string | null
  proposal_id: string | null
}

async function toImplementations(db: Queryable, rows: ImplRow[], includeRemoved = true): Promise<ImplementationDto[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const concepts = (await db.query<{ implementation_id: string; concept_id: string }>('SELECT implementation_id, concept_id FROM conceptualize.implementation_concepts WHERE implementation_id = ANY($1::uuid[]) AND NOT removed ORDER BY added_at', [ids])).rows
  const arts = (await db.query<ArtRow>(`SELECT * FROM conceptualize.implementation_artifacts WHERE implementation_id = ANY($1::uuid[]) ${includeRemoved ? '' : 'AND NOT removed'} ORDER BY added_at, id`, [ids])).rows
  const reqs = (await db.query<ReqRow>('SELECT * FROM conceptualize.realization_requests WHERE implementation_id = ANY($1::uuid[]) ORDER BY created_at', [ids])).rows
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    status: r.status,
    revision: r.revision,
    conceptIds: concepts.filter((c) => c.implementation_id === r.id).map((c) => c.concept_id),
    artifacts: arts
      .filter((a) => a.implementation_id === r.id)
      .map((a) => ({
        id: a.id,
        module: a.module,
        artifactId: a.artifact_id,
        revision: a.artifact_revision,
        kind: a.kind,
        label: a.label,
        addedAt: isoRequired(a.added_at),
        addedBy: a.added_by,
        removed: a.removed,
        removedAt: iso(a.removed_at),
        removedBy: a.removed_by,
        provenance: { sourceKind: a.source_kind, conversationId: a.conversation_id, proposalId: a.proposal_id },
      })),
    realizationRequests: reqs
      .filter((q) => q.implementation_id === r.id)
      .map((q) => ({
        id: q.id,
        implementationId: q.implementation_id,
        targetModule: q.target_module,
        requestKind: q.request_kind,
        description: q.description,
        parameters: q.parameters,
        status: q.status,
        fulfilledBy: q.fulfilled_by,
        createdAt: isoRequired(q.created_at),
        createdBy: q.created_by,
        updatedAt: isoRequired(q.updated_at),
        provenance: { sourceKind: q.source_kind, conversationId: q.conversation_id, proposalId: q.proposal_id },
      })),
    createdAt: isoRequired(r.created_at),
    createdBy: r.created_by,
    updatedAt: isoRequired(r.updated_at),
    updatedBy: r.updated_by,
  }))
}

export async function getImplementation(db: Queryable, projectId: string, id: string): Promise<ImplementationDto | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<ImplRow>('SELECT * FROM conceptualize.implementations WHERE id = $1 AND project_id = $2', [id, projectId])
  return (await toImplementations(db, rows))[0]
}

export async function listImplementations(db: Queryable, projectId: string, filter: { conceptId?: string } = {}): Promise<ImplementationDto[]> {
  if (filter.conceptId && !isUuid(filter.conceptId)) throw invalid('conceptId must be a UUID.', { conceptId: 'uuid' }, 400)
  const { rows } = await db.query<ImplRow>(
    filter.conceptId
      ? `SELECT i.* FROM conceptualize.implementations i WHERE i.project_id = $1 AND EXISTS (SELECT 1 FROM conceptualize.implementation_concepts ic WHERE ic.implementation_id = i.id AND ic.concept_id = $2 AND NOT ic.removed) ORDER BY i.created_at`
      : 'SELECT * FROM conceptualize.implementations WHERE project_id = $1 ORDER BY created_at',
    filter.conceptId ? [projectId, filter.conceptId] : [projectId],
  )
  return toImplementations(db, rows)
}

async function insertArtifact(ctx: Ctx, implementationId: string, a: ArtifactRefDto): Promise<string> {
  const problem = artifactProblem(a)
  if (problem) throw invalid('The artifact reference is not valid.', { artifact: problem })
  const id = randomUUID()
  const [sourceKind, conversationId, proposalId] = prov(ctx)
  await ctx.db.query(
    `INSERT INTO conceptualize.implementation_artifacts (id, implementation_id, module, artifact_id, artifact_revision, kind, label, added_at, added_by, source_kind, conversation_id, proposal_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, implementationId, a.module, a.id, a.revision ?? null, a.kind ?? null, (a.label ?? '').trim(), ctx.now, ctx.actor, sourceKind, conversationId, proposalId],
  )
  return id
}

async function checkConcepts(ctx: Ctx, ids: string[]) {
  const { rows } = await ctx.db.query<{ id: string }>('SELECT id FROM conceptualize.concepts WHERE project_id = $1 AND id = ANY($2::uuid[])', [ctx.projectId, ids])
  if (rows.length !== new Set(ids).size) throw invalid('Every Concept must exist in this project.', { conceptIds: 'unknown Concept' })
}

export async function createImplementation(ctx: Ctx, input: ImplementationCreateDto): Promise<ImplementationDto> {
  const conceptIds = [...new Set(input.conceptIds)]
  await checkConcepts(ctx, conceptIds)
  if (input.status === 'implemented' && ctx.provenance.sourceKind === 'assistant') throw forbidden('The assistant cannot declare an implementation implemented.')
  const id = randomUUID()
  const key = await nextKey(ctx, KEY_PREFIX.implementation, 'implementations')
  await ctx.db.query(
    `INSERT INTO conceptualize.implementations (id, project_id, key, name, description, status, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$7,$8)`,
    [id, ctx.projectId, key, input.name.trim(), (input.description ?? '').trim(), input.status ?? 'candidate', ctx.now, ctx.actor],
  )
  for (const c of conceptIds) await ctx.db.query('INSERT INTO conceptualize.implementation_concepts (implementation_id, concept_id, added_at, added_by) VALUES ($1,$2,$3,$4)', [id, c, ctx.now, ctx.actor])
  for (const a of input.artifacts ?? []) await insertArtifact(ctx, id, a)
  await audit(ctx, { entityType: 'implementation', entityId: id, conceptIds, action: 'created', revision: 1, reason: input.reason ?? '', details: { key, name: input.name, artifacts: (input.artifacts ?? []).map((a) => `${a.module}:${a.id}`) } })
  for (const c of conceptIds) await emit(ctx, 'concept.implementation-linked', c, 1)
  return (await getImplementation(ctx.db, ctx.projectId, id))!
}

async function lockImplementation(ctx: Ctx, id: string, expected: number): Promise<ImplementationDto> {
  if (!isUuid(id)) throw notFound(`Implementation ${id} not found.`)
  const { rowCount } = await ctx.db.query('SELECT 1 FROM conceptualize.implementations WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  if (!rowCount) throw notFound(`Implementation ${id} not found.`)
  const impl = (await getImplementation(ctx.db, ctx.projectId, id))!
  if (impl.revision !== expected) throw conflict(`${impl.key} changed since revision ${expected} (now ${impl.revision}). Reload; nothing was overwritten.`, impl.revision)
  return impl
}

async function bumpImplementation(ctx: Ctx, id: string): Promise<number> {
  const { rows } = await ctx.db.query<{ revision: number }>('UPDATE conceptualize.implementations SET revision = revision + 1, updated_at = $2, updated_by = $3 WHERE id = $1 RETURNING revision', [id, ctx.now, ctx.actor])
  return rows[0].revision
}

export async function updateImplementation(ctx: Ctx, id: string, patch: ImplementationPatchDto, expected: number): Promise<ImplementationDto> {
  const impl = await lockImplementation(ctx, id, expected)
  if (patch.status === 'implemented' && ctx.provenance.sourceKind === 'assistant') throw forbidden('The assistant cannot declare an implementation implemented.')
  const add = [...new Set(patch.addConceptIds ?? [])].filter((c) => !impl.conceptIds.includes(c))
  const remove = [...new Set(patch.removeConceptIds ?? [])]
  if (add.length) await checkConcepts(ctx, add)
  if (remove.some((r) => !impl.conceptIds.includes(r))) throw invalid('Only Concepts the implementation realizes can be removed.', { removeConceptIds: 'not linked' })
  if (impl.conceptIds.length + add.length - remove.length < 1) throw invalid('An implementation realizes at least one Concept; retire it instead.', { removeConceptIds: 'would leave none' })
  await ctx.db.query('UPDATE conceptualize.implementations SET name = $2, description = $3, status = $4 WHERE id = $1', [id, patch.name?.trim() ?? impl.name, patch.description?.trim() ?? impl.description, patch.status ?? impl.status])
  for (const c of add) {
    await ctx.db.query(
      `INSERT INTO conceptualize.implementation_concepts (implementation_id, concept_id, added_at, added_by) VALUES ($1,$2,$3,$4)
       ON CONFLICT (implementation_id, concept_id) DO UPDATE SET removed = false, removed_at = NULL, removed_by = NULL, added_at = $3, added_by = $4`,
      [id, c, ctx.now, ctx.actor],
    )
  }
  for (const c of remove) await ctx.db.query('UPDATE conceptualize.implementation_concepts SET removed = true, removed_at = $3, removed_by = $4 WHERE implementation_id = $1 AND concept_id = $2', [id, c, ctx.now, ctx.actor])
  const revision = await bumpImplementation(ctx, id)
  await audit(ctx, { entityType: 'implementation', entityId: id, conceptIds: [...impl.conceptIds, ...add], action: 'updated', revision, reason: patch.reason ?? '', details: { status: { from: impl.status, to: patch.status ?? impl.status }, addConceptIds: add, removeConceptIds: remove } })
  for (const c of add) await emit(ctx, 'concept.implementation-linked', c, revision)
  for (const c of remove) await emit(ctx, 'concept.implementation-unlinked', c, revision)
  for (const c of impl.conceptIds.filter((x) => !remove.includes(x))) await emit(ctx, 'concept.implementation-linked', c, revision)
  return (await getImplementation(ctx.db, ctx.projectId, id))!
}

/**
 * Adds an artifact reference to an implementation; with `replaces`, removes that reference in the same
 * transaction (a redesign). The Concepts the implementation realizes are not touched: their identity,
 * revisions and intent stay as they were (brief §3).
 */
export async function addArtifact(ctx: Ctx, id: string, artifact: ArtifactRefDto, expected: number, replaces?: string, reason = ''): Promise<ImplementationDto> {
  const impl = await lockImplementation(ctx, id, expected)
  if (impl.artifacts.some((a) => !a.removed && a.module === artifact.module && a.artifactId === artifact.id && a.id !== replaces)) throw conflict(`${artifact.module}:${artifact.id} is already linked to ${impl.key}.`)
  let replaced: (typeof impl.artifacts)[number] | undefined
  if (replaces) {
    replaced = impl.artifacts.find((a) => a.id === replaces && !a.removed)
    if (!replaced) throw invalid('The artifact reference to replace is not active on this implementation.', { replaces: 'not found' })
    await ctx.db.query('UPDATE conceptualize.implementation_artifacts SET removed = true, removed_at = $2, removed_by = $3 WHERE id = $1', [replaces, ctx.now, ctx.actor])
  }
  const linkId = await insertArtifact(ctx, id, artifact)
  const revision = await bumpImplementation(ctx, id)
  await audit(ctx, {
    entityType: 'implementation',
    entityId: id,
    conceptIds: impl.conceptIds,
    action: replaced ? 'artifact-replaced' : 'artifact-linked',
    revision,
    reason,
    details: { linkId, artifact: `${artifact.module}:${artifact.id}${artifact.revision ? `@${artifact.revision}` : ''}`, ...(replaced ? { replaced: `${replaced.module}:${replaced.artifactId}` } : {}) },
  })
  for (const c of impl.conceptIds) await emit(ctx, 'concept.implementation-linked', c, revision)
  return (await getImplementation(ctx.db, ctx.projectId, id))!
}

export async function removeArtifact(ctx: Ctx, id: string, linkId: string, expected: number, reason = ''): Promise<ImplementationDto> {
  const impl = await lockImplementation(ctx, id, expected)
  const a = impl.artifacts.find((x) => x.id === linkId && !x.removed)
  if (!a) throw notFound('The artifact reference is not active on this implementation.')
  await ctx.db.query('UPDATE conceptualize.implementation_artifacts SET removed = true, removed_at = $2, removed_by = $3 WHERE id = $1', [linkId, ctx.now, ctx.actor])
  const revision = await bumpImplementation(ctx, id)
  await audit(ctx, { entityType: 'implementation', entityId: id, conceptIds: impl.conceptIds, action: 'artifact-unlinked', revision, reason, details: { linkId, artifact: `${a.module}:${a.artifactId}` } })
  for (const c of impl.conceptIds) await emit(ctx, 'concept.implementation-unlinked', c, revision)
  return (await getImplementation(ctx.db, ctx.projectId, id))!
}

/** User-approved synchronization: pin an artifact reference to another revision (the old reference stays in the history). */
export async function repinArtifact(ctx: Ctx, id: string, linkId: string, revision: number | null, expected: number, reason = ''): Promise<ImplementationDto> {
  const impl = await lockImplementation(ctx, id, expected)
  const a = impl.artifacts.find((x) => x.id === linkId && !x.removed)
  if (!a) throw notFound('The artifact reference is not active on this implementation.')
  await ctx.db.query('UPDATE conceptualize.implementation_artifacts SET removed = true, removed_at = $2, removed_by = $3 WHERE id = $1', [linkId, ctx.now, ctx.actor])
  const newId = await insertArtifact(ctx, id, { module: a.module, id: a.artifactId, ...(revision ? { revision } : {}), ...(a.kind ? { kind: a.kind } : {}), label: a.label })
  const r = await bumpImplementation(ctx, id)
  await audit(ctx, { entityType: 'implementation', entityId: id, conceptIds: impl.conceptIds, action: 'artifact-repinned', revision: r, reason, details: { linkId: newId, previous: linkId, artifact: `${a.module}:${a.artifactId}`, from: a.revision, to: revision } })
  for (const c of impl.conceptIds) await emit(ctx, 'concept.implementation-linked', c, r)
  return (await getImplementation(ctx.db, ctx.projectId, id))!
}

/** Records a request for another module to realize the implementation (no CAD generation API exists: it stays pending). */
export async function createRealizationRequest(ctx: Ctx, id: string, input: RealizationCreateDto, expected: number): Promise<ImplementationDto> {
  const impl = await lockImplementation(ctx, id, expected)
  for (const [k, v] of Object.entries(input.parameters ?? {})) {
    if (v && typeof v === 'object' && 'unit' in (v as object)) {
      const p = quantityProblem(v as { value?: number; unit: string })
      if (p) throw invalid('A parameter is not a valid quantity.', { [`parameters.${k}`]: p })
    }
  }
  const rid = randomUUID()
  const [sourceKind, conversationId, proposalId] = prov(ctx)
  await ctx.db.query(
    `INSERT INTO conceptualize.realization_requests (id, implementation_id, target_module, request_kind, description, parameters, created_at, created_by, updated_at, updated_by, source_kind, conversation_id, proposal_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$7,$8,$9,$10,$11)`,
    [rid, id, input.targetModule, input.requestKind.trim(), (input.description ?? '').trim(), JSON.stringify(input.parameters ?? {}), ctx.now, ctx.actor, sourceKind, conversationId, proposalId],
  )
  const revision = await bumpImplementation(ctx, id)
  await audit(ctx, { entityType: 'realization-request', entityId: rid, conceptIds: impl.conceptIds, action: 'requested', revision, details: { implementationId: id, targetModule: input.targetModule, requestKind: input.requestKind } })
  for (const c of impl.conceptIds) await emit(ctx, 'concept.implementation-linked', c, revision)
  return (await getImplementation(ctx.db, ctx.projectId, id))!
}

export async function setRealizationStatus(ctx: Ctx, requestId: string, status: 'cancelled' | 'fulfilled', fulfilledBy: ArtifactRefDto | undefined, reason = ''): Promise<ImplementationDto> {
  if (!isUuid(requestId)) throw notFound(`Realization request ${requestId} not found.`)
  const { rows } = await ctx.db.query<ReqRow & { project_id: string }>(
    `SELECT r.*, i.project_id FROM conceptualize.realization_requests r JOIN conceptualize.implementations i ON i.id = r.implementation_id WHERE r.id = $1 AND i.project_id = $2 FOR UPDATE OF r`,
    [requestId, ctx.projectId],
  )
  const req = rows[0]
  if (!req) throw notFound(`Realization request ${requestId} not found.`)
  if (req.status !== 'pending') throw conflict(`The request is already ${req.status}.`)
  if (status === 'fulfilled') {
    if (!fulfilledBy) throw invalid('A fulfilled request names the artifact that realizes it.', { fulfilledBy: 'required' })
    const p = artifactProblem(fulfilledBy)
    if (p) throw invalid('The artifact reference is not valid.', { fulfilledBy: p })
  }
  await ctx.db.query('UPDATE conceptualize.realization_requests SET status = $2, fulfilled_by = $3, updated_at = $4, updated_by = $5 WHERE id = $1', [requestId, status, fulfilledBy ? JSON.stringify(fulfilledBy) : null, ctx.now, ctx.actor])
  const impl = (await getImplementation(ctx.db, ctx.projectId, req.implementation_id))!
  if (status === 'fulfilled' && fulfilledBy && !impl.artifacts.some((a) => !a.removed && a.module === fulfilledBy.module && a.artifactId === fulfilledBy.id)) await insertArtifact(ctx, impl.id, fulfilledBy)
  const revision = await bumpImplementation(ctx, impl.id)
  await audit(ctx, { entityType: 'realization-request', entityId: requestId, conceptIds: impl.conceptIds, action: status, revision, reason, details: { fulfilledBy } })
  for (const c of impl.conceptIds) await emit(ctx, 'concept.implementation-linked', c, revision)
  return (await getImplementation(ctx.db, ctx.projectId, impl.id))!
}

// ---- concept links (requirement traceability and references) --------------------------------------------------

interface LinkRow {
  id: string
  concept_id: string
  relation: ConceptLinkDto['relation']
  module: ArtifactRefDto['module']
  artifact_id: string
  artifact_revision: number | null
  kind: string | null
  label: string
  note: string
  created_at: Date
  created_by: string
  removed: boolean
  removed_at: Date | null
  removed_by: string | null
  source_kind: Prov['sourceKind']
  conversation_id: string | null
  proposal_id: string | null
}
export const toLink = (r: LinkRow): ConceptLinkDto => ({
  id: r.id,
  conceptId: r.concept_id,
  relation: r.relation,
  artifact: { module: r.module, id: r.artifact_id, ...(r.artifact_revision ? { revision: r.artifact_revision } : {}), ...(r.kind ? { kind: r.kind } : {}), ...(r.label ? { label: r.label } : {}) },
  note: r.note,
  createdAt: isoRequired(r.created_at),
  createdBy: r.created_by,
  removed: r.removed,
  removedAt: iso(r.removed_at),
  removedBy: r.removed_by,
  provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id },
})

export async function listLinks(db: Queryable, projectId: string, filter: { conceptId?: string; module?: string; artifactId?: string; includeRemoved?: boolean }): Promise<ConceptLinkDto[]> {
  const params: unknown[] = [projectId]
  const where = ['project_id = $1']
  if (!filter.includeRemoved) where.push('NOT removed')
  if (filter.conceptId) {
    if (!isUuid(filter.conceptId)) throw invalid('conceptId must be a UUID.', { conceptId: 'uuid' }, 400)
    params.push(filter.conceptId)
    where.push(`concept_id = $${params.length}`)
  }
  if (filter.module) {
    params.push(filter.module)
    where.push(`module = $${params.length}`)
  }
  if (filter.artifactId) {
    params.push(filter.artifactId)
    where.push(`artifact_id = $${params.length}`)
  }
  const { rows } = await db.query<LinkRow>(`SELECT * FROM conceptualize.concept_links WHERE ${where.join(' AND ')} ORDER BY created_at, id`, params)
  return rows.map(toLink)
}

export async function createLink(ctx: Ctx, conceptId: string, input: LinkCreateDto): Promise<ConceptLinkDto> {
  const concept = await requireConcept(ctx.db, ctx.projectId, conceptId)
  const p = artifactProblem(input.artifact)
  if (p) throw invalid('The artifact reference is not valid.', { artifact: p })
  if (input.relation !== 'references' && input.artifact.module !== 'requirements') throw invalid(`${input.relation} links point to requirements; use references for other artifacts or link them through an implementation.`, { relation: 'requirements only' })
  const { rowCount } = await ctx.db.query('SELECT 1 FROM conceptualize.concept_links WHERE concept_id = $1 AND relation = $2 AND module = $3 AND artifact_id = $4 AND NOT removed', [conceptId, input.relation, input.artifact.module, input.artifact.id])
  if (rowCount) throw conflict(`${concept.key} already ${input.relation} ${input.artifact.label || input.artifact.id}.`)
  const id = randomUUID()
  const [sourceKind, conversationId, proposalId] = prov(ctx)
  await ctx.db.query(
    `INSERT INTO conceptualize.concept_links (id, project_id, concept_id, relation, module, artifact_id, artifact_revision, kind, label, note, created_at, created_by, source_kind, conversation_id, proposal_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id, ctx.projectId, conceptId, input.relation, input.artifact.module, input.artifact.id, input.artifact.revision ?? null, input.artifact.kind ?? null, (input.artifact.label ?? '').trim(), (input.note ?? '').trim(), ctx.now, ctx.actor, sourceKind, conversationId, proposalId],
  )
  await audit(ctx, { entityType: 'link', entityId: id, conceptIds: [conceptId], action: 'linked', revision: concept.revision, details: { relation: input.relation, artifact: `${input.artifact.module}:${input.artifact.id}`, revision: input.artifact.revision ?? null } })
  await emit(ctx, 'concept.relationships-changed', conceptId, concept.revision)
  const { rows } = await ctx.db.query<LinkRow>('SELECT * FROM conceptualize.concept_links WHERE id = $1', [id])
  return toLink(rows[0])
}

async function lockLink(ctx: Ctx, id: string): Promise<LinkRow> {
  if (!isUuid(id)) throw notFound(`Link ${id} not found.`)
  const { rows } = await ctx.db.query<LinkRow>('SELECT * FROM conceptualize.concept_links WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  if (!rows[0]) throw notFound(`Link ${id} not found.`)
  if (rows[0].removed) throw conflict('The link is already removed.')
  return rows[0]
}

export async function removeLink(ctx: Ctx, id: string, reason = ''): Promise<ConceptLinkDto> {
  const l = await lockLink(ctx, id)
  await ctx.db.query('UPDATE conceptualize.concept_links SET removed = true, removed_at = $2, removed_by = $3 WHERE id = $1', [id, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'link', entityId: id, conceptIds: [l.concept_id], action: 'unlinked', reason, details: { artifact: `${l.module}:${l.artifact_id}` } })
  await emit(ctx, 'concept.relationships-changed', l.concept_id, 1)
  const { rows } = await ctx.db.query<LinkRow>('SELECT * FROM conceptualize.concept_links WHERE id = $1', [id])
  return toLink(rows[0])
}

/** User-approved synchronization of a link to a newer artifact revision (the old link stays in the history). */
export async function repinLink(ctx: Ctx, id: string, revision: number | null, reason = ''): Promise<ConceptLinkDto> {
  const l = await lockLink(ctx, id)
  await ctx.db.query('UPDATE conceptualize.concept_links SET removed = true, removed_at = $2, removed_by = $3 WHERE id = $1', [id, ctx.now, ctx.actor])
  const created = await createLink(ctx, l.concept_id, { relation: l.relation, artifact: { module: l.module, id: l.artifact_id, ...(revision ? { revision } : {}), ...(l.kind ? { kind: l.kind } : {}), ...(l.label ? { label: l.label } : {}) }, note: l.note })
  await audit(ctx, { entityType: 'link', entityId: created.id, conceptIds: [l.concept_id], action: 'repinned', reason, details: { previous: id, from: l.artifact_revision, to: revision } })
  return created
}

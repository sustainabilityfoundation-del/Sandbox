import { randomUUID } from 'node:crypto'
import { conflict, forbidden, invalid, notFound } from '../errors'
import { BASIS_RANK, RELATIONSHIP_RULES, RELATIONSHIP_TYPES, roleAllows, wouldCreateCycle, type Basis, type DesignEntityType } from '../domain/rules'
import type { DesignLinkCreateDto, DesignLinkOut } from '../http/designSchemas'
import type { ArtifactRefDto } from '../http/schemas'
import { ASSISTANT_BASES, audit, emit, iso, isUuid, isoRequired, prov, type Ctx, type Queryable } from './context'
import { artifactProblem } from './implementations'
import { requireRefs } from './refs'

/**
 * Typed design links across entity types (CR-C4) and the link-type registry. Built-in types are rows of
 * `link_types`; administrators register namespaced types. Concept↔Concept relationships (`relationships`)
 * and readings of stored data (realizes, selected-through, member-of) are listed in the registry as
 * read-only types so the graph API has one vocabulary.
 */

export interface LinkTypeInfo {
  name: string
  label: string
  inverse: string
  fromTypes: string[]
  toTypes: string[]
  symmetric: boolean
  acyclic: boolean
  assistantAssertable: boolean
  impact: 'possible' | 'demonstrated' | 'none'
  description: string
  builtin: boolean
  stored: 'design-links' | 'relationships' | 'derived'
}

interface TypeRow {
  name: string
  label: string
  inverse: string
  from_types: string[]
  to_types: string[]
  is_symmetric: boolean
  acyclic: boolean
  assistant_assertable: boolean
  impact: LinkTypeInfo['impact']
  description: string
  builtin: boolean
}

/** Readings of stored data (never written as design links), listed so the graph vocabulary is complete. */
export const DERIVED_TYPES: LinkTypeInfo[] = [
  { name: 'realizes', label: 'realizes', inverse: 'implemented by', fromTypes: ['implementation'], toTypes: ['concept'], symmetric: false, acyclic: false, assistantAssertable: false, impact: 'possible', description: 'Implementation membership (ConceptImplementation realizes the Concept).', builtin: true, stored: 'derived' },
  { name: 'implemented-with', label: 'implemented with', inverse: 'artifact of', fromTypes: ['implementation'], toTypes: ['artifact'], symmetric: false, acyclic: false, assistantAssertable: false, impact: 'possible', description: 'Artifact references of an implementation.', builtin: true, stored: 'derived' },
  { name: 'selected-through', label: 'selected through', inverse: 'selects', fromTypes: ['concept'], toTypes: ['decision'], symmetric: false, acyclic: false, assistantAssertable: false, impact: 'demonstrated', description: 'Accepted outcome of a recorded decision.', builtin: true, stored: 'derived' },
  { name: 'member-of', label: 'alternative in', inverse: 'has alternative', fromTypes: ['concept'], toTypes: ['alternative-set'], symmetric: false, acyclic: false, assistantAssertable: false, impact: 'none', description: 'Membership in an alternative set.', builtin: true, stored: 'derived' },
  { name: 'decides', label: 'decides', inverse: 'decided by', fromTypes: ['decision'], toTypes: ['alternative-set', 'concept'], symmetric: false, acyclic: false, assistantAssertable: false, impact: 'none', description: 'The decision is about the set or subject.', builtin: true, stored: 'derived' },
  { name: 'evidence-for', label: 'evidence for', inverse: 'has evidence', fromTypes: ['evidence'], toTypes: ['concept', 'function', 'constraint', 'assumption', 'decision'], symmetric: false, acyclic: false, assistantAssertable: false, impact: 'possible', description: 'Evidence subjects.', builtin: true, stored: 'derived' },
  { name: 'applies-to', label: 'applies to', inverse: 'assumes', fromTypes: ['assumption'], toTypes: ['concept', 'function', 'constraint', 'exploration'], symmetric: false, acyclic: false, assistantAssertable: false, impact: 'possible', description: 'Scope subjects of an assumption.', builtin: true, stored: 'derived' },
  { name: 'requirement-link', label: 'traces to', inverse: 'traced from', fromTypes: ['concept'], toTypes: ['artifact'], symmetric: false, acyclic: false, assistantAssertable: true, impact: 'possible', description: 'Concept links (satisfies, derives, refines, proposes, references) to artifacts.', builtin: true, stored: 'derived' },
]

const RELATIONSHIP_TYPES_INFO: LinkTypeInfo[] = RELATIONSHIP_TYPES.map((t) => ({
  name: t,
  label: RELATIONSHIP_RULES[t].reads.replace('{from} ', '').replace(' {to}', ''),
  inverse: RELATIONSHIP_RULES[t].inverse.replace('{to} ', '').replace(' {from}', ''),
  fromTypes: ['concept'],
  toTypes: ['concept'],
  symmetric: RELATIONSHIP_RULES[t].symmetric,
  acyclic: RELATIONSHIP_RULES[t].acyclic,
  assistantAssertable: true,
  impact: t === 'alternative-to' ? 'none' : 'possible',
  description: RELATIONSHIP_RULES[t].meaning,
  builtin: true,
  stored: 'relationships',
}))

const toType = (r: TypeRow): LinkTypeInfo => ({
  name: r.name,
  label: r.label,
  inverse: r.inverse,
  fromTypes: r.from_types,
  toTypes: r.to_types,
  symmetric: r.is_symmetric,
  acyclic: r.acyclic,
  assistantAssertable: r.assistant_assertable,
  impact: r.impact,
  description: r.description,
  builtin: r.builtin,
  stored: 'design-links',
})

export async function listLinkTypes(db: Queryable): Promise<LinkTypeInfo[]> {
  const { rows } = await db.query<TypeRow>('SELECT * FROM conceptualize.link_types ORDER BY builtin DESC, name')
  const stored = rows.map(toType)
  // Concept↔Concept relationship types keep their own table; a design-link type with the same name
  // (depends-on, interfaces-with, derived-from) covers the other entity types.
  return [...stored, ...RELATIONSHIP_TYPES_INFO.filter((r) => !stored.some((s) => s.name === r.name)), ...DERIVED_TYPES]
}

async function linkType(db: Queryable, name: string): Promise<LinkTypeInfo> {
  const { rows } = await db.query<TypeRow>('SELECT * FROM conceptualize.link_types WHERE name = $1', [name])
  if (!rows[0]) {
    if (RELATIONSHIP_TYPES.includes(name as never) && !['depends-on', 'interfaces-with', 'derived-from'].includes(name)) throw invalid(`${name} links Concepts to Concepts; create it as a relationship (POST /relationships).`, { type: 'Concept relationship type' })
    if (DERIVED_TYPES.some((d) => d.name === name)) throw invalid(`${name} is a reading of stored data and cannot be written as a link.`, { type: 'derived type' })
    throw invalid(`Unknown link type ${name}. Registered types: GET /link-types.`, { type: 'unknown' })
  }
  return toType(rows[0])
}

export async function createLinkType(ctx: Ctx, input: { name: string; label: string; inverse: string; fromTypes: string[]; toTypes: string[]; symmetric?: boolean; acyclic?: boolean; assistantAssertable?: boolean; impact?: 'possible' | 'none'; description?: string }): Promise<LinkTypeInfo> {
  if (!roleAllows(ctx.role, 'administer')) throw forbidden('Registering link types needs an administrator.')
  if (ctx.provenance.sourceKind === 'assistant') throw forbidden('The assistant cannot register link types.')
  const { rowCount } = await ctx.db.query('SELECT 1 FROM conceptualize.link_types WHERE name = $1', [input.name])
  if (rowCount) throw conflict(`The link type ${input.name} already exists.`)
  if (input.symmetric && input.toTypes.some((t) => !input.fromTypes.includes(t))) throw invalid('A symmetric type needs the same entity types on both ends.', { toTypes: 'differs from fromTypes' })
  await ctx.db.query(
    `INSERT INTO conceptualize.link_types (name, label, inverse, from_types, to_types, is_symmetric, acyclic, assistant_assertable, impact, description, builtin, created_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11,$12)`,
    [input.name, input.label.trim(), input.inverse.trim(), input.fromTypes, input.toTypes, !!input.symmetric, !!input.acyclic, input.assistantAssertable ?? true, input.impact ?? 'possible', (input.description ?? '').trim(), ctx.now, ctx.actor],
  )
  await audit(ctx, { entityType: 'link-type', entityId: input.name, action: 'registered', details: { fromTypes: input.fromTypes, toTypes: input.toTypes } })
  return linkType(ctx.db, input.name)
}

// ---- links ----------------------------------------------------------------------------------------------------

interface LinkRow {
  id: string
  type: string
  from_type: DesignEntityType
  from_id: string
  from_revision: number | null
  to_type: string
  to_id: string
  to_module: string | null
  to_revision: number | null
  decomposition_id: string | null
  basis: Basis
  note: string
  attributes: Record<string, unknown>
  revision: number
  removed: boolean
  created_at: Date
  created_by: string
  removed_at: Date | null
  removed_by: string | null
  source_kind: DesignLinkOut['provenance']['sourceKind']
  conversation_id: string | null
  proposal_id: string | null
}

export const toLinkDto = (r: LinkRow): DesignLinkOut => ({
  id: r.id,
  type: r.type,
  from: { module: 'conceptualize', type: r.from_type, id: r.from_id, ...(r.from_revision ? { revision: r.from_revision } : {}) },
  to:
    r.to_type === 'artifact'
      ? ({ module: r.to_module, id: r.to_id, ...(r.to_revision ? { revision: r.to_revision } : {}) } as never)
      : { module: 'conceptualize', type: r.to_type as DesignEntityType, id: r.to_id, ...(r.to_revision ? { revision: r.to_revision } : {}) },
  decompositionId: r.decomposition_id,
  basis: r.basis,
  note: r.note,
  attributes: r.attributes,
  revision: r.revision,
  removed: r.removed,
  createdAt: isoRequired(r.created_at),
  createdBy: r.created_by,
  removedAt: iso(r.removed_at),
  removedBy: r.removed_by,
  provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id },
})

export async function getDesignLink(db: Queryable, projectId: string, id: string): Promise<DesignLinkOut | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<LinkRow>('SELECT * FROM conceptualize.design_links WHERE id = $1 AND project_id = $2', [id, projectId])
  return rows[0] ? toLinkDto(rows[0]) : undefined
}

export async function listDesignLinks(db: Queryable, projectId: string, filter: { id?: string; type?: string; includeRemoved?: boolean } = {}): Promise<DesignLinkOut[]> {
  const params: unknown[] = [projectId]
  const where = ['project_id = $1']
  if (!filter.includeRemoved) where.push('NOT removed')
  if (filter.id) {
    params.push(filter.id)
    where.push(`(from_id::text = $${params.length} OR to_id = $${params.length})`)
  }
  if (filter.type) {
    params.push(filter.type.split(',').map((t) => t.trim()))
    where.push(`type = ANY($${params.length})`)
  }
  const { rows } = await db.query<LinkRow>(`SELECT * FROM conceptualize.design_links WHERE ${where.join(' AND ')} ORDER BY created_at, id`, params)
  return rows.map(toLinkDto)
}

const isArtifact = (to: DesignLinkCreateDto['to']): to is ArtifactRefDto => (to as { module: string }).module !== 'conceptualize'

/**
 * Creates a design link after validating it against the registry: endpoint types, existence, no self
 * links, no duplicates (either direction for symmetric types), no cycles for acyclic types, the
 * assistant-assertable flag, and type-specific rules (formalizes: one pinned requirement per constraint;
 * supported-by: link basis not above the evidence basis; verified-by: verification-grade target).
 */
export async function createDesignLink(ctx: Ctx, input: DesignLinkCreateDto): Promise<DesignLinkOut> {
  const t = await linkType(ctx.db, input.type)
  const assistant = ctx.provenance.sourceKind === 'assistant'
  if (assistant && !t.assistantAssertable) throw forbidden(`The assistant cannot assert ${t.name} links; a person records them.`)
  const basis: Basis = input.basis ?? (assistant ? 'ai-hypothesis' : 'user-assertion')
  if (assistant && !ASSISTANT_BASES.includes(basis)) throw invalid('The assistant may only record links as ai-hypothesis, assumption, assessment or estimate.', { basis: 'not allowed for the assistant' })
  if (basis === 'decision' || basis === 'calculated') throw invalid('Link basis decision or calculated is not recorded on links; link the decision or evidence instead.', { basis: 'not allowed' })
  if (!t.fromTypes.includes(input.from.type)) throw invalid(`${t.name} links start at ${t.fromTypes.join(' or ')}, not ${input.from.type}.`, { from: 'wrong entity type' })
  const artifact = isArtifact(input.to)
  const toTypeName = artifact ? 'artifact' : (input.to as { type: DesignEntityType }).type
  if (!t.toTypes.includes(toTypeName)) throw invalid(`${t.name} links point to ${t.toTypes.join(' or ')}, not ${toTypeName}.`, { to: 'wrong entity type' })
  const refs: { type: DesignEntityType; id: string }[] = [{ type: input.from.type, id: input.from.id }]
  if (!artifact) refs.push({ type: (input.to as { type: DesignEntityType }).type, id: input.to.id })
  const found = await requireRefs(ctx.db, ctx.projectId, refs, 'to')
  if (artifact) {
    const p = artifactProblem(input.to as ArtifactRefDto)
    if (p) throw invalid('The artifact reference is not valid.', { to: p })
  } else if (input.from.id === input.to.id) throw invalid('A record cannot be linked to itself.', { to: 'same as from' })

  // Type-specific rules.
  if (t.name === 'formalizes') {
    const a = input.to as ArtifactRefDto
    if (a.module !== 'requirements' || !a.revision) throw invalid('formalizes points to one requirement with a pinned revision.', { to: 'requirement with revision' })
    const { rowCount } = await ctx.db.query(`SELECT 1 FROM conceptualize.design_links WHERE project_id = $1 AND type = 'formalizes' AND from_id = $2 AND NOT removed`, [ctx.projectId, input.from.id])
    if (rowCount) throw conflict('This constraint already formalizes a requirement (exactly one per formalizing constraint).')
  }
  if (t.name === 'supported-by' || t.name === 'contradicted-by' || t.name === 'verified-by') {
    if (!artifact) {
      const { rows } = await ctx.db.query<{ basis: Basis }>('SELECT basis FROM conceptualize.evidence WHERE id = $1', [input.to.id])
      const evBasis = rows[0].basis
      if (t.name === 'verified-by' && evBasis !== 'evidence') throw invalid('verified-by needs verification-grade evidence (basis evidence).', { to: `evidence basis ${evBasis}` })
      if (BASIS_RANK[basis] > BASIS_RANK[evBasis]) throw invalid(`The link basis (${basis}) cannot be stronger than the evidence basis (${evBasis}).`, { basis: 'above the evidence' })
    } else if (t.name === 'verified-by' && (input.to as ArtifactRefDto).module !== 'twin') throw invalid('verified-by points to evidence or a twin verification record.', { to: 'twin artifact' })
  }
  if (input.decompositionId) {
    if (t.name !== 'decomposes-into') throw invalid('Only decomposes-into links belong to a decomposition.', { decompositionId: 'only for decomposes-into' })
    const { rows } = await ctx.db.query<{ parent_function_id: string | null }>('SELECT parent_function_id FROM conceptualize.decompositions WHERE id = $1 AND project_id = $2', [input.decompositionId, ctx.projectId])
    if (rows[0]?.parent_function_id !== input.from.id) throw invalid('The decomposition belongs to another parent function.', { decompositionId: 'other parent' })
  }

  await ctx.db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`conceptualize-structure:${ctx.projectId}`])
  const { rows: existing } = await ctx.db.query<{ id: string; from_id: string; to_id: string; decomposition_id: string | null }>(
    'SELECT id, from_id::text, to_id, decomposition_id FROM conceptualize.design_links WHERE project_id = $1 AND type = $2 AND NOT removed',
    [ctx.projectId, t.name],
  )
  const dup = existing.find((e) => ((e.from_id === input.from.id && e.to_id === input.to.id) || (t.symmetric && e.from_id === input.to.id && e.to_id === input.from.id)) && (e.decomposition_id ?? null) === (input.decompositionId ?? null))
  if (dup) throw conflict(`This ${t.name} link already exists${t.symmetric ? ' (in either direction)' : ''}.`, undefined, { linkId: dup.id })
  if (t.acyclic && !artifact) {
    const cycle = wouldCreateCycle(existing.map((e) => ({ from: e.from_id, to: e.to_id })), input.from.id, input.to.id)
    if (cycle) throw invalid(`This ${t.name} link would create a cycle (${cycle.length - 1} links).`, { to: 'cycle' })
  }
  const id = randomUUID()
  const [sourceKind, conversationId, proposalId] = prov(ctx)
  const to = input.to as { id: string; revision?: number; module?: string }
  await ctx.db.query(
    `INSERT INTO conceptualize.design_links (id, project_id, type, from_type, from_id, from_revision, to_type, to_id, to_module, to_revision, decomposition_id, basis, note, attributes, created_at, created_by, source_kind, conversation_id, proposal_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [id, ctx.projectId, t.name, input.from.type, input.from.id, input.from.revision ?? null, toTypeName, to.id, artifact ? to.module : null, to.revision ?? null, input.decompositionId ?? null, basis, (input.note ?? '').trim(), JSON.stringify(input.attributes ?? {}), ctx.now, ctx.actor, sourceKind, conversationId, proposalId],
  )
  const conceptIds = found.filter((f) => f.ref.type === 'concept').map((f) => f.ref.id)
  await audit(ctx, { entityType: 'design-link', entityId: id, conceptIds, action: 'created', revision: 1, reason: input.reason ?? '', details: { type: t.name, from: `${input.from.type}:${found.find((f) => f.ref.id === input.from.id)?.key}`, to: artifact ? `${to.module}:${to.id}` : `${toTypeName}:${found.find((f) => f.ref.id === to.id)?.key}` } })
  await emit(ctx, 'link.created', id, 1)
  return (await getDesignLink(ctx.db, ctx.projectId, id))!
}

export async function removeDesignLink(ctx: Ctx, id: string, expected: number, reason = ''): Promise<DesignLinkOut> {
  if (!isUuid(id)) throw notFound(`Link ${id} not found.`)
  const { rows } = await ctx.db.query<LinkRow>('SELECT * FROM conceptualize.design_links WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  const l = rows[0]
  if (!l) throw notFound(`Link ${id} not found.`)
  if (l.revision !== expected) throw conflict(`The link changed since revision ${expected} (now ${l.revision}).`, l.revision)
  if (l.removed) throw conflict('The link is already removed.', l.revision)
  const t = await linkType(ctx.db, l.type)
  if (ctx.provenance.sourceKind === 'assistant' && !t.assistantAssertable) throw forbidden(`The assistant cannot remove ${t.name} links.`)
  await ctx.db.query('UPDATE conceptualize.design_links SET removed = true, revision = revision + 1, removed_at = $2, removed_by = $3 WHERE id = $1', [id, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'design-link', entityId: id, action: 'removed', revision: l.revision + 1, reason, details: { type: l.type } })
  await emit(ctx, 'link.removed', id, l.revision + 1)
  return (await getDesignLink(ctx.db, ctx.projectId, id))!
}

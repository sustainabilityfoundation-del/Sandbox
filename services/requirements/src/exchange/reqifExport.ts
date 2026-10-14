import { randomUUID } from 'node:crypto'
import {
  toNcName,
  toReqifXhtml,
  validateAgainstSchema,
  writeReqIF,
  writeReqifz,
  type AttributeDefinition as ReqifDef,
  type AttributeValue as ReqifValue,
  type Datatype,
  type HierarchyNode,
  type ReqIFDocument,
  type SpecObject,
  type SpecType,
} from '@ews/reqif'
import { invalid } from '../errors'
import { RELATIONSHIP_RULES, RELATIONSHIP_TYPES } from '../domain/rules'
import type { RequirementDto } from '../http/schemas'
import { listAttributeDefinitions } from '../store/attributes'
import { getBaseline } from '../store/baselines'
import { collectionTree, listCollections, type NodeDto } from '../store/collections'
import { audit, isoRequired, type Ctx } from '../store/context'
import { mappingsOf } from '../store/exchange'
import { listRelationships } from '../store/relationships'
import { listRequirements } from '../store/requirements'
import type { ObjectStorage } from '../storage'

export interface ExportRequest {
  format: 'reqif' | 'reqifz' | 'json'
  collectionIds?: string[]
  requirementIds?: string[]
  configurationId?: string
  baselineId?: string
  includeArchived?: boolean
  sourceId?: string | null
  title?: string
}

/** Requirements in scope (all pages), working state or as pinned by a baseline. */
export async function selectRequirements(ctx: Ctx, req: ExportRequest): Promise<RequirementDto[]> {
  const all: RequirementDto[] = []
  const collections = req.collectionIds?.length ? req.collectionIds : [undefined]
  const seen = new Set<string>()
  for (const collectionId of collections) {
    let cursor: string | undefined
    do {
      const page = await listRequirements(ctx.db, ctx.projectId, { collectionId, configurationId: req.configurationId, baselineId: req.baselineId, includeArchived: req.includeArchived, ids: req.requirementIds?.join(','), limit: 200, cursor })
      for (const r of page.items) if (!seen.has(r.id)) (seen.add(r.id), all.push(r))
      cursor = page.nextCursor
    } while (cursor)
  }
  return all
}

const EWS_DT = { string: '_ews-dt-string', xhtml: '_ews-dt-xhtml' }

/**
 * Builds a ReqIF document. Our own type system describes requirements; lifecycle status,
 * allocation to twin components and the canonical ID are written as *informative* string
 * attributes (EWS.*) because ReqIF has no equivalent semantics. Exporting to a known source reuses
 * its identifiers, types and preserved values so the receiving tool can update its objects.
 */
export async function buildReqif(ctx: Ctx, req: ExportRequest) {
  const lossy: string[] = []
  const notes: string[] = []
  if (req.baselineId && !(await getBaseline(ctx.db, ctx.projectId, req.baselineId))) throw invalid('Baseline not found.', { baselineId: 'unknown' })
  const requirements = await selectRequirements(ctx, req)
  const ids = new Set(requirements.map((r) => r.id))
  const defs = (await listAttributeDefinitions(ctx.db, ctx.projectId)).filter((d) => !d.archived)
  const now = ctx.now.toISOString()
  const def = (identifier: string, longName: string, kind: ReqifDef['kind'], datatypeRef: string, extra: Partial<ReqifDef> = {}): ReqifDef => ({ identifier, lastChange: now, longName, kind, datatypeRef, ...extra })
  const datatypes: Datatype[] = [
    { identifier: EWS_DT.string, lastChange: now, longName: 'EWS string', kind: 'STRING', maxLength: 20000 },
    { identifier: EWS_DT.xhtml, lastChange: now, longName: 'EWS rich text', kind: 'XHTML' },
  ]
  const reqAttrs: ReqifDef[] = [
    def('_ews-ad-key', 'ReqIF.ForeignID', 'STRING', EWS_DT.string, { desc: 'Human-readable key in the exporting project (display only; may be renumbered)' }),
    def('_ews-ad-name', 'ReqIF.Name', 'STRING', EWS_DT.string),
    def('_ews-ad-text', 'ReqIF.Text', 'XHTML', EWS_DT.xhtml, { desc: 'Normative statement' }),
    def('_ews-ad-rationale', 'Rationale', 'STRING', EWS_DT.string),
    def('_ews-ad-source', 'Source', 'STRING', EWS_DT.string),
    def('_ews-ad-acceptance', 'Acceptance criteria', 'STRING', EWS_DT.string),
    def('_ews-ad-type', 'EWS.Type', 'STRING', EWS_DT.string, { desc: 'Informative' }),
    def('_ews-ad-status', 'EWS.LifecycleStatus', 'STRING', EWS_DT.string, { desc: 'Informative: lifecycle status in the exporting tool (draft, in-review, approved, retired). Not an approval record, verification result or compliance assessment.' }),
    def('_ews-ad-revision', 'EWS.Revision', 'STRING', EWS_DT.string, { desc: 'Informative: content revision in the exporting tool' }),
    def('_ews-ad-uuid', 'EWS.CanonicalId', 'STRING', EWS_DT.string, { desc: 'Informative: canonical UUID in the exporting tool' }),
    def('_ews-ad-alloc', 'EWS.AllocatedTo', 'STRING', EWS_DT.string, { desc: 'Informative: digital-twin component IDs the requirement is allocated to (not ReqIF objects)' }),
    def('_ews-ad-methods', 'EWS.VerificationMethods', 'STRING', EWS_DT.string, { desc: 'Informative' }),
  ]
  // Custom attributes with their own datatypes.
  const customDef = new Map<string, ReqifDef>()
  for (const d of defs) {
    const dtId = `_ews-dt-${d.id}`
    const kind = ({ string: 'STRING', xhtml: 'XHTML', integer: 'INTEGER', real: 'REAL', boolean: 'BOOLEAN', date: 'DATE', enumeration: 'ENUMERATION' } as const)[d.dataType]
    datatypes.push({
      identifier: dtId,
      lastChange: now,
      longName: d.name,
      kind,
      maxLength: d.dataType === 'string' ? (d.maxLength ?? 20000) : undefined,
      min: d.minValue ?? undefined,
      max: d.maxValue ?? undefined,
      accuracy: d.dataType === 'real' ? 10 : undefined,
      values: d.dataType === 'enumeration' ? d.enumValues.map((v, i) => ({ identifier: `_ews-ev-${v.id}`, lastChange: now, longName: v.label, key: i + 1, otherContent: v.key })) : undefined,
    })
    const ad = def(`_ews-ad-${d.id}`, d.name, kind, dtId, { desc: d.description || undefined, multiValued: d.dataType === 'enumeration' ? d.multiValued : undefined })
    customDef.set(d.id, ad)
    reqAttrs.push(ad)
  }
  const specTypes: SpecType[] = [
    { identifier: '_ews-type-requirement', lastChange: now, longName: 'Requirement', category: 'SPEC-OBJECT-TYPE', attributes: reqAttrs },
    { identifier: '_ews-type-heading', lastChange: now, longName: 'Heading', category: 'SPEC-OBJECT-TYPE', attributes: [def('_ews-ad-chapter', 'ReqIF.ChapterName', 'STRING', EWS_DT.string)] },
    { identifier: '_ews-type-specification', lastChange: now, longName: 'Specification', category: 'SPECIFICATION-TYPE', attributes: [] },
    ...RELATIONSHIP_TYPES.filter((t) => t !== 'allocated-to').map((t) => ({ identifier: `_ews-rel-${t}`, lastChange: now, longName: `${t} (EWS)`, desc: `${RELATIONSHIP_RULES[t].reads.replace('{from}', 'SOURCE').replace('{to}', 'TARGET')}. ${RELATIONSHIP_RULES[t].meaning}`, category: 'SPEC-RELATION-TYPE' as const, attributes: [] })),
  ]

  // Exporting back to a known source: reuse its identifiers, types and preserved values.
  const sourceObjectId = new Map<string, string>()
  const sourceRelationId = new Map<string, string>()
  const sourceSpecId = new Map<string, string>()
  const preservedObject = new Map<string, { typeRef: string; fieldDefs: Record<string, string>; values: ReqifValue[] }>()
  let toolExtensions: string[] = []
  if (req.sourceId) {
    const maps = await mappingsOf(ctx.db, req.sourceId)
    if (!maps.length) throw invalid('That exchange source has no mappings.', { sourceId: 'unknown or empty' })
    for (const m of maps) {
      if (m.external_kind === 'spec-object' && m.internal_id) {
        sourceObjectId.set(m.internal_id, m.external_id)
        if (m.preserved) preservedObject.set(m.internal_id, m.preserved as never)
      } else if (m.external_kind === 'spec-relation' && m.internal_id) sourceRelationId.set(m.internal_id, m.external_id)
      else if (m.external_kind === 'specification' && m.internal_id) sourceSpecId.set(m.internal_id, m.external_id)
      else if (m.external_kind === 'datatype' && m.preserved) datatypes.push(m.preserved as unknown as Datatype)
      else if (m.external_kind === 'spec-type' && m.preserved) specTypes.push(m.preserved as unknown as SpecType)
      else if (m.external_kind === 'header' && m.preserved) toolExtensions = ((m.preserved as { toolExtensions?: string[] }).toolExtensions ?? []).slice()
    }
    notes.push('Objects imported from this source keep their identifiers, types and unmapped attribute values; other objects use this platform’s types.')
  }

  const allocations = new Map<string, string[]>()
  for (const rel of await listRelationships(ctx.db, ctx.projectId, { type: 'allocated-to', baselineId: req.baselineId, limit: 20000 })) {
    if (ids.has(rel.fromId)) allocations.set(rel.fromId, [...(allocations.get(rel.fromId) ?? []), rel.toTwinId!])
  }
  if (allocations.size) lossy.push(`Allocation to twin components (${[...allocations.values()].flat().length} links) has no ReqIF equivalent: written as the informative attribute EWS.AllocatedTo, not as SPEC-RELATIONs.`)
  lossy.push('Lifecycle status is written as the informative attribute EWS.LifecycleStatus; reviews, approvals, comments, history and baselines are not part of ReqIF and are not exported.')

  const attachmentPath = new Map((await ctx.db.query<{ id: string; original_name: string }>('SELECT id, original_name FROM requirements.attachments WHERE project_id = $1', [ctx.projectId])).rows.map((a) => [a.id, `files/${a.id}${/\.[A-Za-z0-9]{1,8}$/.exec(a.original_name)?.[0] ?? ''}`]))
  const objectId = (r: { id: string }) => sourceObjectId.get(r.id) ?? toNcName(`_${r.id}`)
  const str = (identifier: string, value: string): ReqifValue => ({ kind: 'STRING', definitionRef: identifier, value })
  const specObjects: SpecObject[] = requirements.map((r) => {
    const preserved = preservedObject.get(r.id)
    const xhtml = toReqifXhtml(r.statementXhtml?.replace(/attachment:([0-9a-f-]{36})/g, (_m, id: string) => attachmentPath.get(id) ?? `files/${id}`) ?? null, r.statement)
    if (preserved) {
      const fd = preserved.fieldDefs
      const vals: ReqifValue[] = [...preserved.values]
      const put = (role: string, kind: 'STRING' | 'XHTML', value: string) => {
        const ref = fd[role]
        if (!ref) return
        const srcDef = specTypes.flatMap((t) => t.attributes).find((a) => a.identifier === ref)
        vals.push(srcDef?.kind === 'XHTML' ? { kind: 'XHTML', definitionRef: ref, value, xhtml: { sanitized: '', plain: value, raw: kind === 'XHTML' ? xhtml : toReqifXhtml(null, value), objects: [], removed: [] } } : { kind: 'STRING', definitionRef: ref, value })
      }
      put('title', 'STRING', r.title)
      put('statement', 'XHTML', r.statement)
      put('rationale', 'STRING', r.rationale)
      put('source', 'STRING', r.source)
      put('acceptance', 'STRING', r.acceptanceCriteria)
      return { identifier: objectId(r), lastChange: r.revisionCreatedAt, longName: r.key, typeRef: preserved.typeRef, values: vals }
    }
    const values: ReqifValue[] = [
      str('_ews-ad-key', r.key),
      str('_ews-ad-name', r.title),
      { kind: 'XHTML', definitionRef: '_ews-ad-text', value: r.statement, xhtml: { sanitized: '', plain: r.statement, raw: xhtml, objects: [], removed: [] } },
      ...(r.rationale ? [str('_ews-ad-rationale', r.rationale)] : []),
      ...(r.source ? [str('_ews-ad-source', r.source)] : []),
      ...(r.acceptanceCriteria ? [str('_ews-ad-acceptance', r.acceptanceCriteria)] : []),
      str('_ews-ad-type', r.type),
      str('_ews-ad-status', r.status),
      str('_ews-ad-revision', String(r.revision)),
      str('_ews-ad-uuid', r.id),
      ...(allocations.get(r.id)?.length ? [str('_ews-ad-alloc', allocations.get(r.id)!.join(', '))] : []),
      ...(r.verificationMethods.length ? [str('_ews-ad-methods', r.verificationMethods.join(', '))] : []),
    ]
    for (const [defId, v] of Object.entries(r.attributes)) {
      const ad = customDef.get(defId)
      const d = defs.find((x) => x.id === defId)
      if (!ad || !d) continue
      if (d.dataType === 'enumeration') values.push({ kind: 'ENUMERATION', definitionRef: ad.identifier, value: (v as string[]).map((k) => `_ews-ev-${d.enumValues.find((e) => e.key === k)?.id}`) })
      else if (d.dataType === 'xhtml') values.push({ kind: 'XHTML', definitionRef: ad.identifier, value: String(v), xhtml: { sanitized: '', plain: String(v), raw: toReqifXhtml(String(v), String(v)), objects: [], removed: [] } })
      else if (d.dataType === 'date') values.push({ kind: 'DATE', definitionRef: ad.identifier, value: /T/.test(String(v)) ? String(v) : `${v}T00:00:00Z` })
      else values.push({ kind: ad.kind, definitionRef: ad.identifier, value: v as string | number | boolean })
    }
    return { identifier: objectId(r), lastChange: r.revisionCreatedAt, longName: r.key, typeRef: '_ews-type-requirement', values }
  })

  // Relationships between exported requirements.
  const rels = (await listRelationships(ctx.db, ctx.projectId, { baselineId: req.baselineId, limit: 20000 })).filter((r) => r.type !== 'allocated-to' && ids.has(r.fromId) && r.toRequirementId && ids.has(r.toRequirementId))
  const reqById = new Map(requirements.map((r) => [r.id, r]))
  const specRelations = rels.map((r) => ({
    identifier: sourceRelationId.get(r.id) ?? toNcName(`_${r.id}`),
    lastChange: r.updatedAt,
    typeRef: `_ews-rel-${r.type}`,
    sourceRef: objectId(reqById.get(r.fromId)!),
    targetRef: objectId(reqById.get(r.toRequirementId!)!),
    values: [],
  }))
  const outside = (await listRelationships(ctx.db, ctx.projectId, { baselineId: req.baselineId, limit: 20000 })).filter((r) => r.type !== 'allocated-to' && ids.has(r.fromId) && r.toRequirementId && !ids.has(r.toRequirementId)).length
  if (outside) lossy.push(`${outside} relationship(s) to requirements outside the export scope are not exported.`)

  // Structure: one SPECIFICATION per collection in scope (or one flat specification).
  const headings: SpecObject[] = []
  const toHierarchy = (nodes: NodeDto[], parent: string | null): HierarchyNode[] =>
    nodes
      .filter((n) => n.parentId === parent)
      .sort((a, b) => a.position - b.position)
      .flatMap((n): HierarchyNode[] => {
        if (n.kind === 'heading') {
          const hid = toNcName(`_${n.id}`)
          headings.push({ identifier: hid, lastChange: now, typeRef: '_ews-type-heading', values: [str('_ews-ad-chapter', n.heading!)] })
          return [{ identifier: toNcName(`_h${n.id}`), lastChange: now, objectRef: hid, children: toHierarchy(nodes, n.id) }]
        }
        const r = n.requirementId ? reqById.get(n.requirementId) : undefined
        if (!r) return toHierarchy(nodes, n.id)
        return [{ identifier: toNcName(`_h${n.id}`), lastChange: now, objectRef: objectId(r), children: toHierarchy(nodes, n.id) }]
      })
  const collectionIds = req.collectionIds?.length ? req.collectionIds : (await listCollections(ctx.db, ctx.projectId)).map((c) => c.id)
  const specifications = []
  const placed = new Set<string>()
  for (const cid of collectionIds) {
    let tree
    try {
      tree = await collectionTree(ctx.db, ctx.projectId, cid, req.baselineId)
    } catch {
      continue
    }
    const children = toHierarchy(tree.nodes, null)
    const walk = (hs: HierarchyNode[]) => hs.forEach((h) => (placed.add(h.objectRef), walk(h.children)))
    walk(children)
    if (!children.length) continue
    specifications.push({ identifier: sourceSpecId.get(cid) ?? toNcName(`_${cid}`), lastChange: tree.collection.updatedAt, longName: tree.collection.name, typeRef: '_ews-type-specification', values: [], children })
  }
  const unplaced = specObjects.filter((o) => !placed.has(o.identifier))
  if (unplaced.length) {
    specifications.push({
      identifier: toNcName(`_unstructured-${ctx.projectId}`),
      lastChange: now,
      longName: req.collectionIds?.length ? 'Selected requirements' : 'Requirements not in a collection',
      typeRef: '_ews-type-specification',
      values: [],
      children: unplaced.map((o) => ({ identifier: toNcName(`_h${o.identifier}`), lastChange: now, objectRef: o.identifier, children: [] })),
    })
  }
  const doc: ReqIFDocument = {
    header: {
      identifier: toNcName(`_export-${randomUUID()}`),
      comment: `Exported by the engineering platform Requirements module${req.baselineId ? ` from baseline ${req.baselineId}` : ''}${req.configurationId ? ` for configuration ${req.configurationId}` : ''}.`,
      creationTime: now,
      repositoryId: `ews:${ctx.projectId}`,
      reqifToolId: 'EWS Requirements (engineering platform)',
      reqifVersion: '1.0',
      sourceToolId: 'EWS Requirements (engineering platform)',
      title: req.title ?? `${ctx.projectId} requirements`,
    },
    datatypes,
    specTypes,
    specObjects: [...headings, ...specObjects],
    specRelations,
    specifications,
    relationGroups: [],
    toolExtensions,
  }
  return { doc, requirements, specRelations, lossy, notes, collections: specifications.length }
}

export async function runExport(ctx: Ctx, storage: ObjectStorage, req: ExportRequest, schemaDir?: string) {
  let bytes: Uint8Array
  let mediaType: string
  let fileName: string
  const stamp = ctx.now.toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const report: Record<string, unknown> = {}
  if (req.format === 'json') {
    const { exportJson } = await import('./json')
    const data = await exportJson(ctx, req)
    bytes = new TextEncoder().encode(JSON.stringify(data, null, 2))
    mediaType = 'application/json'
    fileName = `${ctx.projectId}-requirements-${stamp}.json`
    Object.assign(report, { requirements: data.requirements.length, relationships: data.relationships.length, collections: data.collections.length, lossy: [], notes: ['Complete module data for the selection (canonical IDs, revisions as of export, relationships, collection structure, attribute definitions). Reviews and history are not included.'] })
  } else {
    const built = await buildReqif(ctx, req)
    const xml = writeReqIF(built.doc)
    const validation = schemaDir ? await validateAgainstSchema(xml, schemaDir) : { performed: false, valid: null, errors: [] as string[] }
    Object.assign(report, { requirements: built.requirements.length, relationships: built.specRelations.length, collections: built.collections, lossy: built.lossy, notes: built.notes, schemaValidation: validation })
    if (req.format === 'reqifz') {
      const files: { path: string; bytes: Uint8Array }[] = []
      for (const m of xml.matchAll(/data="files\/([0-9a-f-]{36})(\.[A-Za-z0-9]{1,8})?"/g)) {
        const { rows } = await ctx.db.query<{ storage_key: string }>('SELECT storage_key FROM requirements.attachments WHERE id = $1 AND project_id = $2', [m[1], ctx.projectId])
        const p = `files/${m[1]}${m[2] ?? ''}`
        if (rows[0] && !files.some((f) => f.path === p)) files.push({ path: p, bytes: await storage.get(rows[0].storage_key) })
      }
      bytes = writeReqifz({ path: 'requirements.reqif', xml }, files)
      mediaType = 'application/zip'
      fileName = `${ctx.projectId}-requirements-${stamp}.reqifz`
      report.attachments = files.length
    } else {
      bytes = new TextEncoder().encode(xml)
      mediaType = 'application/xml'
      fileName = `${ctx.projectId}-requirements-${stamp}.reqif`
      if (/data="files\//.test(xml)) (report.lossy as string[]).push('Rich text references attachments; use .reqifz to include the files.')
    }
  }
  const stored = await storage.put(bytes)
  const id = randomUUID()
  await ctx.db.query(
    'INSERT INTO requirements.export_jobs (id, project_id, format, request, report, storage_key, file_name, media_type, byte_size, created_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [id, ctx.projectId, req.format, JSON.stringify(req), JSON.stringify(report), stored.key, fileName, mediaType, stored.byteSize, ctx.now, ctx.actor],
  )
  await audit(ctx, { entityType: 'export', entityId: id, action: 'exported', details: { format: req.format, requirements: report.requirements, baselineId: req.baselineId, configurationId: req.configurationId } })
  return { id, projectId: ctx.projectId, format: req.format, request: req as unknown as Record<string, unknown>, report, fileName, mediaType, byteSize: stored.byteSize, createdAt: isoRequired(ctx.now), createdBy: ctx.actor }
}

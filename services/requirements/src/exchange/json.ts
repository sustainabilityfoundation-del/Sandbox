import { conflict, invalid } from '../errors'
import type { RequirementDto } from '../http/schemas'
import { listAttributeDefinitions } from '../store/attributes'
import { addNode, collectionTree, createCollection, getCollection, listCollections } from '../store/collections'
import { audit, emit, isUuid, type Ctx, type Queryable } from '../store/context'
import { ensureSource, getJob, insertJob, upsertMapping } from '../store/exchange'
import { createRelationship, listRelationships } from '../store/relationships'
import { createRequirement, getRequirement, updateRequirement } from '../store/requirements'
import type { ObjectStorage } from '../storage'
import type { TwinDirectory } from '../twin'
import type { ExportRequest } from './reqifExport'
import { selectRequirements } from './reqifExport'
import type { ImportPreviewRecord, RecordState } from './reqifImport'

/**
 * JSON exchange: the module's own complete format (canonical IDs, fields, relationships,
 * collection structure, attribute definitions). Import matches by canonical ID within the project;
 * nothing is deleted; conflicts (newer local revision with different content) are explicit.
 */
export const JSON_FORMAT = 'ews-requirements'
export const JSON_VERSION = 1

export async function exportJson(ctx: Ctx, req: ExportRequest) {
  const requirements = await selectRequirements(ctx, req)
  const ids = new Set(requirements.map((r) => r.id))
  const relationships = (await listRelationships(ctx.db, ctx.projectId, { baselineId: req.baselineId, limit: 20000 })).filter((r) => ids.has(r.fromId) && (!r.toRequirementId || ids.has(r.toRequirementId)))
  const collectionIds = req.collectionIds?.length ? req.collectionIds : (await listCollections(ctx.db, ctx.projectId)).map((c) => c.id)
  const collections = []
  for (const cid of collectionIds) {
    try {
      const t = await collectionTree(ctx.db, ctx.projectId, cid, req.baselineId)
      collections.push({ collection: t.collection, nodes: t.nodes.filter((n) => n.kind === 'heading' || (n.requirementId && ids.has(n.requirementId))) })
    } catch {
      /* not in that baseline */
    }
  }
  return {
    format: JSON_FORMAT,
    version: JSON_VERSION,
    projectId: ctx.projectId,
    exportedAt: ctx.now.toISOString(),
    baselineId: req.baselineId ?? null,
    configurationId: req.configurationId ?? null,
    attributeDefinitions: await listAttributeDefinitions(ctx.db, ctx.projectId),
    requirements,
    relationships,
    collections,
  }
}

type JsonFile = Awaited<ReturnType<typeof exportJson>>
const FIELDS = ['title', 'statement', 'rationale', 'type', 'source', 'owner', 'priority', 'applicability', 'verificationMethods', 'acceptanceCriteria'] as const

function parse(bytes: Uint8Array): JsonFile {
  let data: JsonFile
  try {
    data = JSON.parse(new TextDecoder().decode(bytes))
  } catch (e) {
    throw invalid(`The file is not valid JSON: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (data?.format !== JSON_FORMAT || data.version !== JSON_VERSION || !Array.isArray(data.requirements)) throw invalid(`Not a ${JSON_FORMAT} version ${JSON_VERSION} file.`)
  return data
}

async function analyze(db: Queryable, projectId: string, bytes: Uint8Array) {
  const data = parse(bytes)
  const records: ImportPreviewRecord[] = []
  const findings: { severity: 'error' | 'warning' | 'info'; code: string; message: string }[] = []
  for (const r of data.requirements as RequirementDto[]) {
    if (!isUuid(r.id) || typeof r.title !== 'string') {
      findings.push({ severity: 'error', code: 'invalid-record', message: `Requirement record ${String(r.id)} is malformed.` })
      continue
    }
    const local = await getRequirement(db, projectId, r.id)
    if (!local) {
      const elsewhere = await db.query('SELECT 1 FROM requirements.requirements WHERE id = $1', [r.id])
      records.push({ key: `requirement:${r.id}`, kind: 'requirement', state: 'new', externalId: r.id, label: `${r.key} ${r.title}`, localId: null, localKey: null, localRevision: null, changes: [], notes: elsewhere.rowCount ? ['The ID exists in another project; a new ID is assigned'] : ['Created with the same canonical ID'] })
      continue
    }
    const changes = FIELDS.filter((f) => JSON.stringify(local[f]) !== JSON.stringify(r[f])).map((f) => ({ field: f, from: local[f], to: r[f] }))
    const state: RecordState = !changes.length ? 'unchanged' : local.revision > r.revision ? 'conflicting' : 'changed'
    records.push({ key: `requirement:${r.id}`, kind: 'requirement', state, externalId: r.id, label: `${r.key} ${r.title}`, localId: local.id, localKey: local.key, localRevision: local.revision, changes, notes: state === 'conflicting' ? [`Local revision ${local.revision} is newer than the file's revision ${r.revision}.`] : [] })
  }
  const existing = await listRelationships(db, projectId, { limit: 20000 })
  for (const rel of data.relationships ?? []) {
    const exists = existing.some((e) => e.type === rel.type && e.fromId === rel.fromId && (e.toRequirementId ?? e.toTwinId) === (rel.toRequirementId ?? rel.toTwinId))
    records.push({ key: `relationship:${rel.id}`, kind: 'relationship', state: exists ? 'unchanged' : 'new', externalId: rel.id, label: `${rel.type} ${rel.fromId.slice(0, 8)} → ${(rel.toRequirementId ?? rel.toTwinId ?? '').slice(0, 12)}`, localId: null, localKey: null, localRevision: null, changes: [], notes: [] })
  }
  for (const c of data.collections ?? []) {
    const local = await getCollection(db, projectId, c.collection.id)
    records.push({ key: `collection:${c.collection.id}`, kind: 'collection', state: local ? 'unchanged' : 'new', externalId: c.collection.id, label: c.collection.name, localId: local?.id ?? null, localKey: null, localRevision: local?.structureRevision ?? null, changes: [], notes: [`${c.nodes.length} nodes; existing collections only gain missing items`] })
  }
  const counts = { new: 0, changed: 0, unchanged: 0, conflicting: 0, unsupported: 0 } as Record<RecordState, number>
  for (const r of records) counts[r.state]++
  return {
    data,
    preview: {
      format: 'json' as const,
      source: { key: `json:${data.projectId}`, name: `JSON from ${data.projectId}`, matchedSourceId: null, matchedBy: 'canonical requirement IDs' },
      header: { projectId: data.projectId, exportedAt: data.exportedAt, baselineId: data.baselineId },
      counts,
      records,
      attributeMappings: [],
      relationshipMappings: [],
      findings,
      unsupported: [],
      policies: ['Nothing is deleted; records absent from the file stay unchanged.', 'Records are matched by canonical ID; conflicts default to keeping the local version.', 'Lifecycle status, reviews and history are not imported; new requirements start as drafts.'],
      schemaValidation: { performed: false, valid: null, schema: 'not applicable (JSON)', errors: [] as string[] },
    },
  }
}

export async function previewJsonImport(ctx: Ctx, storage: ObjectStorage, bytes: Uint8Array, fileName: string) {
  const a = await analyze(ctx.db, ctx.projectId, bytes)
  const stored = await storage.put(bytes)
  return insertJob(ctx, { format: 'json', fileName, sha256: stored.sha256, byteSize: stored.byteSize, sourceId: null, sourceKey: a.preview.source.key, storageKey: stored.key, preview: a.preview })
}

export async function applyJsonImport(ctx: Ctx, jobId: string, opts: { decisions: Record<string, string>; storage: ObjectStorage; twin: TwinDirectory }) {
  const { row } = await getJob(ctx.db, ctx.projectId, jobId, true)
  if (row.status !== 'previewed') throw conflict(`The import is ${row.status}.`)
  const a = await analyze(ctx.db, ctx.projectId, await opts.storage.get(row.storage_key))
  if (a.preview.findings.some((f) => f.severity === 'error')) throw invalid('The file has errors and cannot be imported.')
  const prior = new Map(((row.preview as { records: ImportPreviewRecord[] }).records ?? []).map((r) => [r.key, r]))
  if (a.preview.records.some((r) => prior.get(r.key)?.state !== r.state || prior.get(r.key)?.localRevision !== r.localRevision)) throw conflict('Data changed since the preview. Preview the file again; nothing was imported.')
  const sourceId = await ensureSource(ctx, 'json', a.preview.source.key, a.preview.source.name)
  const result = { requirementsCreated: 0, requirementsUpdated: 0, keptLocal: 0, relationshipsCreated: 0, relationshipsSkipped: [] as string[], collectionsCreated: 0 }
  const idMap = new Map<string, string>()
  const defs = await listAttributeDefinitions(ctx.db, ctx.projectId)
  const reason = `Imported from ${row.file_name} (JSON)`
  for (const rec of a.preview.records.filter((r) => r.kind === 'requirement')) {
    const r = a.data.requirements.find((x) => x.id === rec.externalId)! as RequirementDto
    const decision = a.preview && (opts.decisions[rec.key] ?? (rec.state === 'conflicting' ? 'keep-local' : 'take-incoming'))
    const attributes = Object.fromEntries(Object.entries(r.attributes ?? {}).filter(([k]) => defs.some((d) => d.id === k)))
    if (rec.state === 'new' && decision !== 'skip') {
      const elsewhere = rec.notes.some((n) => n.includes('another project'))
      const created = await createRequirement(ctx, { title: r.title, statement: r.statement, rationale: r.rationale, type: r.type, source: r.source, owner: r.owner, priority: r.priority, applicability: r.applicability, verificationMethods: r.verificationMethods, acceptanceCriteria: r.acceptanceCriteria, attributes, reason }, { id: elsewhere ? undefined : r.id, statementXhtml: r.statementXhtml, reason })
      idMap.set(r.id, created.id)
      await upsertMapping(ctx, { sourceId, externalKind: 'requirement', externalId: r.id, internalKind: 'requirement', internalId: created.id, internalRevision: created.revision })
      result.requirementsCreated++
    } else if (rec.localId) {
      idMap.set(r.id, rec.localId)
      if ((rec.state === 'changed' || rec.state === 'conflicting') && decision === 'take-incoming') {
        await updateRequirement(ctx, rec.localId, { title: r.title, statement: r.statement, rationale: r.rationale, type: r.type, source: r.source, owner: r.owner, priority: r.priority, applicability: r.applicability, verificationMethods: r.verificationMethods, acceptanceCriteria: r.acceptanceCriteria, attributes }, rec.localRevision!, { role: 'administrator', statementXhtml: r.statementXhtml, reason })
        result.requirementsUpdated++
      } else if (rec.state === 'conflicting') result.keptLocal++
    }
  }
  for (const rec of a.preview.records.filter((r) => r.kind === 'relationship' && r.state === 'new' && opts.decisions[r.key] !== 'skip')) {
    const rel = a.data.relationships.find((x) => x.id === rec.externalId)!
    const from = idMap.get(rel.fromId)
    const to = rel.toRequirementId ? idMap.get(rel.toRequirementId) : undefined
    if (!from || (rel.toRequirementId && !to)) {
      result.relationshipsSkipped.push(`${rel.id}: an end was not imported`)
      continue
    }
    await ctx.db.query('SAVEPOINT rel')
    try {
      await createRelationship(ctx, opts.twin, { type: rel.type, fromId: from, toRequirementId: to, toTwinId: rel.toTwinId ?? undefined, rationale: rel.rationale, reason })
      await ctx.db.query('RELEASE SAVEPOINT rel')
      result.relationshipsCreated++
    } catch (e) {
      await ctx.db.query('ROLLBACK TO SAVEPOINT rel')
      result.relationshipsSkipped.push(`${rel.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  for (const c of a.data.collections ?? []) {
    if (opts.decisions[`collection:${c.collection.id}`] === 'skip') continue
    let col = await getCollection(ctx.db, ctx.projectId, c.collection.id)
    if (!col) {
      let name = c.collection.name
      for (let i = 2; (await ctx.db.query('SELECT 1 FROM requirements.collections WHERE project_id = $1 AND name = $2', [ctx.projectId, name])).rowCount; i++) name = `${c.collection.name} (${i})`
      const free = !(await ctx.db.query('SELECT 1 FROM requirements.collections WHERE id = $1', [c.collection.id])).rowCount
      col = await createCollection(ctx, { name, description: c.collection.description }, free ? c.collection.id : undefined)
      result.collectionsCreated++
    }
    const tree = await collectionTree(ctx.db, ctx.projectId, col.id)
    const present = new Set(tree.nodes.map((n) => n.requirementId).filter(Boolean))
    const headingIds = new Set(tree.nodes.map((n) => n.id))
    const nodeMap = new Map<string, string>()
    for (const n of c.nodes) {
      const parent = n.parentId ? (nodeMap.get(n.parentId) ?? (headingIds.has(n.parentId) ? n.parentId : null)) : null
      if (n.kind === 'heading') {
        if (headingIds.has(n.id)) nodeMap.set(n.id, n.id)
        else nodeMap.set(n.id, (await addNode(ctx, col.id, { kind: 'heading', heading: n.heading!, parentId: parent }, null)).id)
      } else {
        const rid = idMap.get(n.requirementId!)
        if (rid && !present.has(rid)) {
          nodeMap.set(n.id, (await addNode(ctx, col.id, { kind: 'requirement', requirementId: rid, parentId: parent }, null)).id)
          present.add(rid)
        }
      }
    }
  }
  await ctx.db.query(`UPDATE requirements.import_jobs SET status = 'applied', source_id = $2, result = $3, applied_at = $4, applied_by = $5 WHERE id = $1`, [jobId, sourceId, JSON.stringify(result), ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'import', entityId: jobId, action: 'applied', details: result })
  await emit(ctx, 'requirements.import-completed', jobId, 1)
  return (await getJob(ctx.db, ctx.projectId, jobId)).dto
}

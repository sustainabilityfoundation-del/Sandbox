import { createHash } from 'node:crypto'
import {
  readReqIF,
  readReqifz,
  resolveReference,
  validateAgainstSchema,
  type AttributeDefinition as ReqifAttributeDefinition,
  type AttributeValue as ReqifValue,
  type Datatype,
  type HierarchyNode,
  type ReqIFDocument,
  type SpecObject,
} from '@ews/reqif'
import { conflict, invalid } from '../errors'
import { roleAllows, type RelationshipType, type Role } from '../domain/rules'
import { createAttributeDefinition, getConventions, listAttributeDefinitions } from '../store/attributes'
import { addNode, collectionTree, createCollection, getCollection } from '../store/collections'
import { audit, emit, isUuid, type Ctx, type Queryable } from '../store/context'
import { ensureSource, findSource, getJob, insertJob, mappingsOf, upsertMapping, type MappingRow } from '../store/exchange'
import { createRelationship } from '../store/relationships'
import { createRequirement, getRequirement, updateRequirement } from '../store/requirements'
import type { ObjectStorage } from '../storage'
import type { TwinDirectory } from '../twin'

/**
 * ReqIF import: preview (new / changed / unchanged / conflicting / unsupported), then apply with
 * explicit decisions. Mapping is keyed by exchange source and ReqIF IDENTIFIER, never by canonical
 * UUID. Absence from a file never deletes anything.
 */

export type RecordState = 'new' | 'changed' | 'unchanged' | 'conflicting' | 'unsupported'
type FieldRole = 'title' | 'statement' | 'heading' | 'rationale' | 'source' | 'acceptance' | 'foreignId'

const ROLE_NAMES: Record<FieldRole, string[]> = {
  statement: ['reqif.text', 'object text', 'text', 'description', 'requirement text', 'requirement', 'req text', 'statement'],
  title: ['reqif.name', 'name', 'title', 'summary', 'short description', 'short text'],
  heading: ['reqif.chaptername', 'object heading', 'chapter name', 'heading', 'chapter'],
  rationale: ['rationale', 'justification', 'reqif.rationale'],
  source: ['source', 'origin', 'reqif.source'],
  acceptance: ['acceptance criteria', 'acceptance criterion', 'verification criteria', 'fit criterion'],
  foreignId: ['reqif.foreignid', 'foreign id', 'absolute number', 'req id', 'requirement id', 'ews.key', 'key'],
}
const roleOf = (longName: string | undefined): FieldRole | undefined => {
  const n = (longName ?? '').trim().toLowerCase()
  return (Object.keys(ROLE_NAMES) as FieldRole[]).find((r) => ROLE_NAMES[r].includes(n))
}
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'value'
const EWS_ATTR_PREFIX = 'reqif-'
const EWS_INFORMATIVE = new Set(['ews.lifecyclestatus', 'ews.revision', 'ews.canonicalid', 'ews.allocatedto', 'ews.type', 'ews.priority', 'ews.verificationmethods', 'ews.owner'])

const DATA_TYPE: Record<Datatype['kind'], 'string' | 'xhtml' | 'integer' | 'real' | 'boolean' | 'date' | 'enumeration'> = {
  STRING: 'string',
  XHTML: 'xhtml',
  INTEGER: 'integer',
  REAL: 'real',
  BOOLEAN: 'boolean',
  DATE: 'date',
  ENUMERATION: 'enumeration',
}

export function relationTypeFor(longName: string | undefined): RelationshipType | undefined {
  const n = (longName ?? '').toLowerCase()
  if (/deriv/.test(n)) return 'derives-from'
  if (/decompos/.test(n)) return 'decomposes'
  if (/depend/.test(n)) return 'depends-on'
  return undefined
}

export interface ImportPreviewRecord {
  key: string
  kind: 'requirement' | 'heading' | 'relationship' | 'collection'
  state: RecordState
  externalId: string
  label: string
  localId: string | null
  localKey: string | null
  localRevision: number | null
  changes: { field: string; from: unknown; to: unknown }[]
  notes: string[]
}

interface Incoming {
  object: SpecObject
  kind: 'requirement' | 'heading'
  title: string
  heading: string | null
  statement: string
  statementXhtml: string | null
  rationale?: string
  source?: string
  acceptanceCriteria?: string
  attributes: Record<string, string | number | boolean | string[]>
  preservedValues: ReqifValue[]
  fieldDefs: Partial<Record<FieldRole, string>>
}

export interface Analysis {
  preview: {
    format: 'reqif'
    source: { key: string; name: string; matchedSourceId: string | null; matchedBy: string }
    header: Record<string, unknown>
    counts: Record<RecordState, number>
    records: ImportPreviewRecord[]
    attributeMappings: { externalId: string; name: string; dataType: string; target: string; note?: string }[]
    relationshipMappings: { externalType: string; name: string; target: string; note?: string }[]
    findings: { severity: 'error' | 'warning' | 'info'; code: string; message: string; path?: string }[]
    unsupported: { kind: string; count: number; treatment: string }[]
    policies: string[]
    schemaValidation: { performed: boolean; valid: boolean | null; schema: string; errors: string[] }
  }
  doc: ReqIFDocument
  incoming: Map<string, Incoming>
  sourceId: string | null
  sourceKey: string
  sourceName: string
  mappings: Map<string, MappingRow>
  attachments: Map<string, Uint8Array>
  newDefinitions: { key: string; name: string; dataType: string; enumValues?: { key: string; label: string }[]; multiValued?: boolean }[]
}

export interface AnalyzeOptions {
  fileName: string
  sourceKey?: string
  sourceName?: string
  role: Role | null
  schemaDir?: string
}

function unpack(bytes: Uint8Array, fileName: string) {
  const zip = /\.(reqifz|zip)$/i.test(fileName) || (bytes[0] === 0x50 && bytes[1] === 0x4b)
  if (!zip) return { xml: bytes, reqifPath: fileName, files: new Map<string, Uint8Array>(), notes: [] as string[] }
  const c = readReqifz(bytes)
  const notes = c.rejected.map((r) => `Archive entry “${r}” was ignored (unsafe path).`)
  if (c.reqifFiles.length > 1) notes.push(`The archive holds ${c.reqifFiles.length} .reqif files; only “${c.reqifFiles[0].path}” is imported.`)
  return { xml: c.reqifFiles[0].bytes, reqifPath: c.reqifFiles[0].path, files: c.files, notes }
}

const iso = (s: string | undefined | null) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null)

export async function analyzeReqif(db: Queryable, projectId: string, bytes: Uint8Array, opts: AnalyzeOptions): Promise<Analysis> {
  const { xml, reqifPath, files, notes: packageNotes } = unpack(bytes, opts.fileName)
  const attachments = new Map<string, Uint8Array>()
  let unresolvedObjects = 0
  const read = readReqIF(xml, {
    rewriteObjectData: (data) => {
      const p = resolveReference(reqifPath, data)
      const f = p ? files.get(p) : undefined
      if (!p || !f) {
        unresolvedObjects++
        return null
      }
      attachments.set(p, f)
      return `attachment-pending:${p}`
    },
  })
  const doc = read.document
  const findings: Analysis['preview']['findings'] = [...read.findings, ...packageNotes.map((m) => ({ severity: 'warning' as const, code: 'package', message: m }))]
  if (unresolvedObjects) findings.push({ severity: 'warning', code: 'unresolved-object', message: `${unresolvedObjects} rich-text object reference(s) could not be resolved inside the package and were removed from the rendered text (the original XHTML is kept for audit).` })
  const xmlText = new TextDecoder().decode(xml)
  const schemaValidation = opts.schemaDir ? await validateAgainstSchema(xmlText, opts.schemaDir) : { performed: false, valid: null, schema: 'not configured on this server', errors: [] }
  if (schemaValidation.performed && !schemaValidation.valid) {
    findings.push({ severity: 'warning', code: 'schema-invalid', message: `The file is not valid against the official ReqIF schema (${schemaValidation.errors.length} error(s), first: ${schemaValidation.errors[0] ?? ''}). Content that could be read is still shown.` })
  }

  // ---- source ------------------------------------------------------------------------------------
  const h = doc.header
  const sourceKey = (opts.sourceKey?.trim() || h.repositoryId?.trim() || `tool:${h.sourceToolId || h.reqifToolId || 'unknown'}|title:${h.title || opts.fileName}`).slice(0, 500)
  const matchedBy = opts.sourceKey?.trim() ? 'the source key you entered' : h.repositoryId?.trim() ? 'the header REPOSITORY-ID' : 'the header tool and title (no REPOSITORY-ID in the file)'
  const existingSource = await findSource(db, projectId, 'reqif', sourceKey)
  const sourceName = opts.sourceName?.trim() || existingSource?.name || `${h.sourceToolId || h.reqifToolId || 'ReqIF'}${h.title ? ` — ${h.title}` : ''}`.slice(0, 200)
  const mappings = new Map<string, MappingRow>()
  if (existingSource) for (const m of await mappingsOf(db, existingSource.id)) mappings.set(`${m.external_kind}:${m.external_id}`, m)
  const ownExport = h.repositoryId === `ews:${projectId}`

  // ---- attribute definitions ----------------------------------------------------------------------
  const defs = new Map<string, ReqifAttributeDefinition>()
  for (const t of doc.specTypes) for (const a of t.attributes) defs.set(a.identifier, a)
  const datatypes = new Map(doc.datatypes.map((d) => [d.identifier, d]))
  const enumLabel = new Map<string, { key: string; label: string }>()
  for (const d of doc.datatypes) for (const v of d.values ?? []) enumLabel.set(v.identifier, { key: slug(v.longName || v.otherContent || v.identifier), label: (v.longName || v.otherContent || v.identifier).slice(0, 200) })
  const local = await listAttributeDefinitions(db, projectId)
  const canDefine = roleAllows(opts.role, 'define-attributes')
  const attrTarget = new Map<string, { target: 'role'; role: FieldRole } | { target: 'attribute'; key: string; id?: string } | { target: 'preserved'; reason: string }>()
  const attributeMappings: Analysis['preview']['attributeMappings'] = []
  const newDefinitions: Analysis['newDefinitions'] = []
  const seenNames = new Map<string, string>()
  for (const t of doc.specTypes.filter((x) => x.category === 'SPEC-OBJECT-TYPE')) {
    for (const a of t.attributes) {
      const role = roleOf(a.longName)
      const name = a.longName || a.identifier
      if (role) {
        attrTarget.set(a.identifier, { target: 'role', role })
        if (!seenNames.has(`${name}|${a.kind}`)) attributeMappings.push({ externalId: a.identifier, name, dataType: a.kind, target: role === 'foreignId' ? 'external reference (shown with the requirement)' : role === 'acceptance' ? 'acceptanceCriteria' : role })
        seenNames.set(`${name}|${a.kind}`, a.identifier)
        continue
      }
      if (EWS_INFORMATIVE.has(name.toLowerCase())) {
        attrTarget.set(a.identifier, { target: 'preserved', reason: 'informative export attribute of this platform; not imported as data' })
        continue
      }
      const key = `${EWS_ATTR_PREFIX}${slug(name)}`.slice(0, 60)
      const dataType = DATA_TYPE[a.kind]
      const existing = local.find((d) => d.key === key)
      let target: { target: 'attribute'; key: string; id?: string } | { target: 'preserved'; reason: string }
      const enumValues = a.kind === 'ENUMERATION' ? (datatypes.get(a.datatypeRef)?.values ?? []).map((v) => enumLabel.get(v.identifier)!) : undefined
      if (existing && existing.dataType === dataType) {
        const missing = (enumValues ?? []).filter((v) => !existing.enumValues.some((e) => e.key === v.key))
        target = missing.length ? { target: 'preserved', reason: `local enumeration lacks value(s) ${missing.map((m) => m.label).join(', ')}` } : { target: 'attribute', key, id: existing.id }
      } else if (existing) target = { target: 'preserved', reason: `local attribute “${key}” has type ${existing.dataType}, file has ${dataType}` }
      else if (canDefine) {
        target = { target: 'attribute', key }
        if (!newDefinitions.some((n) => n.key === key)) newDefinitions.push({ key, name: name.slice(0, 120), dataType, enumValues: enumValues?.filter((v, i, all) => all.findIndex((x) => x.key === v.key) === i), multiValued: a.kind === 'ENUMERATION' ? !!a.multiValued : undefined })
      } else target = { target: 'preserved', reason: 'no matching attribute definition; an administrator can import it as a new custom attribute' }
      attrTarget.set(a.identifier, target)
      if (!seenNames.has(`${name}|${a.kind}`)) {
        attributeMappings.push({ externalId: a.identifier, name, dataType: a.kind, target: target.target === 'attribute' ? `custom attribute ${target.key}${target.id ? '' : ' (will be created)'}` : 'preserved for re-export', note: target.target === 'preserved' ? target.reason : undefined })
        seenNames.set(`${name}|${a.kind}`, a.identifier)
      }
    }
  }

  // ---- objects -----------------------------------------------------------------------------------
  const incoming = new Map<string, Incoming>()
  const badValues: string[] = []
  for (const o of doc.specObjects) {
    const fieldDefs: Incoming['fieldDefs'] = {}
    const roleText: Partial<Record<FieldRole, { text: string; xhtml: string | null }>> = {}
    const attributes: Incoming['attributes'] = {}
    const preservedValues: ReqifValue[] = []
    for (const v of o.values) {
      const t = attrTarget.get(v.definitionRef)
      if (!t || t.target === 'preserved') {
        preservedValues.push(v)
        continue
      }
      if (t.target === 'role') {
        fieldDefs[t.role] ??= v.definitionRef
        const text = v.kind === 'XHTML' ? (v.xhtml?.plain ?? '') : v.kind === 'ENUMERATION' ? (v.value as string[]).map((x) => enumLabel.get(x)?.label ?? x).join(', ') : String(v.value)
        if (!roleText[t.role] || (v.kind === 'XHTML' && !roleText[t.role]!.xhtml)) roleText[t.role] = { text, xhtml: v.kind === 'XHTML' ? (v.xhtml?.sanitized ?? null) : null }
        continue
      }
      const bad =
        (v.kind === 'DATE' && (typeof v.value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(v.value) || Number.isNaN(Date.parse(v.value)))) ||
        ((v.kind === 'INTEGER' || v.kind === 'REAL') && (typeof v.value !== 'number' || !Number.isFinite(v.value)))
      if (bad) {
        preservedValues.push(v)
        badValues.push(`${o.identifier}: ${defs.get(v.definitionRef)?.longName ?? v.definitionRef} = “${String(v.value).slice(0, 40)}”`)
        continue
      }
      attributes[t.key] = v.kind === 'ENUMERATION' ? (v.value as string[]).map((x) => enumLabel.get(x)?.key ?? x) : v.kind === 'XHTML' ? (v.xhtml?.sanitized ?? '') : v.kind === 'DATE' ? String(v.value) : (v.value as string | number | boolean)
    }
    const statement = roleText.statement?.text.trim() ?? ''
    const heading = roleText.heading?.text.trim() || null
    const kind: 'requirement' | 'heading' = heading && !statement ? 'heading' : 'requirement'
    const firstSentence = statement.split(/(?<=[.!?])\s/)[0]?.slice(0, 80)
    const title = (roleText.title?.text.trim() || heading || o.longName || firstSentence || o.identifier).slice(0, 300)
    incoming.set(o.identifier, {
      object: o,
      kind,
      title,
      heading,
      statement,
      statementXhtml: roleText.statement?.xhtml && roleText.statement.xhtml !== statement ? roleText.statement.xhtml : null,
      rationale: roleText.rationale?.text,
      source: roleText.source?.text,
      acceptanceCriteria: roleText.acceptance?.text,
      attributes,
      preservedValues,
      fieldDefs,
    })
  }

  if (badValues.length) findings.push({ severity: 'warning', code: 'invalid-value', message: `${badValues.length} attribute value(s) do not match their datatype and are preserved, not imported (e.g. ${badValues.slice(0, 3).join('; ')}).` })
  const records: ImportPreviewRecord[] = []
  const conventions = (await getConventions(db, projectId)).settings
  const defaultType = conventions.requirementTypes.includes('other') ? 'other' : conventions.requirementTypes[0]
  for (const inc of incoming.values()) {
    const o = inc.object
    const mapping = mappings.get(`spec-object:${o.identifier}`)
    const notes: string[] = []
    if (inc.preservedValues.length) notes.push(`${inc.preservedValues.length} attribute value(s) preserved for re-export, not shown as data`)
    if (inc.kind === 'heading') {
      // Own export: heading objects are named after the collection node they came from.
      const ownNode = !mapping && ownExport && /^_[0-9a-f-]{36}$/i.test(o.identifier) ? (await db.query<{ id: string }>('SELECT n.id FROM requirements.collection_nodes n JOIN requirements.collections c ON c.id = n.collection_id WHERE n.id = $1 AND c.project_id = $2', [o.identifier.slice(1), projectId])).rows[0]?.id : undefined
      const localNode = mapping?.internal_id ?? ownNode ?? null
      records.push({ key: `spec-object:${o.identifier}`, kind: 'heading', state: localNode ? 'unchanged' : 'new', externalId: o.identifier, label: inc.heading!, localId: localNode, localKey: null, localRevision: null, changes: [], notes: ['Imported as a collection heading (document structure only)'] })
      continue
    }
    let localId = mapping?.internal_kind === 'requirement' ? mapping.internal_id : null
    if (!localId && ownExport && /^_[0-9a-f-]{36}$/i.test(o.identifier) && isUuid(o.identifier.slice(1))) {
      const self = await getRequirement(db, projectId, o.identifier.slice(1))
      if (self) {
        localId = self.id
        notes.push('Matched by canonical ID (a file exported from this project)')
      }
    }
    const r = localId ? await getRequirement(db, projectId, localId) : undefined
    if (!r) {
      records.push({ key: `spec-object:${o.identifier}`, kind: 'requirement', state: 'new', externalId: o.identifier, label: inc.title, localId: null, localKey: null, localRevision: null, changes: [], notes: [...notes, `Type will be “${defaultType}”, status draft`] })
      continue
    }
    const changes: ImportPreviewRecord['changes'] = []
    const cmp = (field: string, from: unknown, to: unknown) => JSON.stringify(from) !== JSON.stringify(to) && changes.push({ field, from, to })
    cmp('title', r.title, inc.title)
    cmp('statement', r.statement, inc.statement)
    if (inc.statementXhtml && r.statementXhtml && inc.statementXhtml !== r.statementXhtml) cmp('statementXhtml', r.statementXhtml, inc.statementXhtml)
    if (inc.rationale !== undefined) cmp('rationale', r.rationale, inc.rationale.trim())
    if (inc.source !== undefined) cmp('source', r.source, inc.source.trim())
    if (inc.acceptanceCriteria !== undefined) cmp('acceptanceCriteria', r.acceptanceCriteria, inc.acceptanceCriteria.trim())
    for (const [k, v] of Object.entries(inc.attributes)) {
      const def = local.find((d) => d.key === k)
      if (def) cmp(`attribute ${k}`, r.attributes[def.id] ?? null, v)
    }
    const incomingChange = iso(o.lastChange)
    const knownChange = mapping?.external_last_change ? new Date(mapping.external_last_change).toISOString() : null
    const localChanged = mapping ? r.revision !== mapping.internal_revision : incomingChange !== null && incomingChange < r.revisionCreatedAt
    const externalChanged = mapping ? incomingChange !== knownChange : true
    let state: RecordState
    if (!changes.length) state = 'unchanged'
    else if (knownChange && incomingChange && incomingChange < knownChange) {
      state = 'conflicting'
      notes.push(`The file's LAST-CHANGE (${incomingChange}) is older than the last import from this source (${knownChange}).`)
    } else if (localChanged && externalChanged) {
      state = 'conflicting'
      notes.push(`Changed here (now rev ${r.revision}${mapping?.internal_revision ? `, imported as rev ${mapping.internal_revision}` : ''}) and in the source.`)
    } else if (localChanged && !externalChanged) {
      state = 'unchanged'
      notes.push('Changed here since the last import while the source did not change; local changes are kept.')
      changes.length = 0
    } else state = 'changed'
    if (r.archived) notes.push('The local requirement is archived; it stays archived.')
    if ((r.status === 'approved' || r.status === 'in-review') && state !== 'unchanged') notes.push(`Taking incoming text creates a new draft revision of ${r.key} (approval stays with rev ${r.revision}).`)
    records.push({ key: `spec-object:${o.identifier}`, kind: 'requirement', state, externalId: o.identifier, label: inc.title, localId: r.id, localKey: r.key, localRevision: r.revision, changes, notes })
  }

  // ---- relations ---------------------------------------------------------------------------------
  const relTypes = new Map(doc.specTypes.filter((t) => t.category === 'SPEC-RELATION-TYPE').map((t) => [t.identifier, t]))
  const relationshipMappings: Analysis['preview']['relationshipMappings'] = []
  for (const t of relTypes.values()) {
    const ours = relationTypeFor(t.longName)
    relationshipMappings.push({ externalType: t.identifier, name: t.longName ?? t.identifier, target: ours ?? 'not imported (preserved)', note: ours ? `ReqIF SOURCE → TARGET becomes from → to (${ours})` : 'No equivalent relationship type with the same meaning; satisfaction, verification and generic trace links are not guessed' })
  }
  let unsupportedRelations = 0
  for (const rel of doc.specRelations) {
    const ours = relationTypeFor(relTypes.get(rel.typeRef)?.longName)
    const label = `${incoming.get(rel.sourceRef)?.title ?? rel.sourceRef} → ${incoming.get(rel.targetRef)?.title ?? rel.targetRef}`
    const endpointsOk = incoming.get(rel.sourceRef)?.kind === 'requirement' && incoming.get(rel.targetRef)?.kind === 'requirement'
    if (!ours || !endpointsOk) {
      unsupportedRelations++
      records.push({ key: `spec-relation:${rel.identifier}`, kind: 'relationship', state: 'unsupported', externalId: rel.identifier, label, localId: null, localKey: null, localRevision: null, changes: [], notes: [!ours ? `Relation type “${relTypes.get(rel.typeRef)?.longName ?? rel.typeRef}” has no equivalent; preserved, not imported` : 'An end is a heading or missing; not imported'] })
      continue
    }
    const mapping = mappings.get(`spec-relation:${rel.identifier}`)
    const ownRel = !mapping && ownExport && /^_[0-9a-f-]{36}$/i.test(rel.identifier) ? (await db.query<{ id: string }>('SELECT id FROM requirements.relationships WHERE id = $1 AND project_id = $2 AND NOT deleted', [rel.identifier.slice(1), projectId])).rows[0]?.id : undefined
    const relLocal = mapping?.internal_id ?? ownRel ?? null
    records.push({ key: `spec-relation:${rel.identifier}`, kind: 'relationship', state: relLocal ? 'unchanged' : 'new', externalId: rel.identifier, label: `${ours}: ${label}`, localId: relLocal, localKey: null, localRevision: null, changes: [], notes: [] })
  }

  // ---- specifications ------------------------------------------------------------------------------
  for (const s of doc.specifications) {
    const mapping = mappings.get(`specification:${s.identifier}`)
    const count = (nodes: HierarchyNode[]): number => nodes.reduce((n, x) => n + 1 + count(x.children), 0)
    const ownCollection = !mapping && ownExport && /^_[0-9a-f-]{36}$/i.test(s.identifier) ? s.identifier.slice(1) : undefined
    const collection = mapping?.internal_id || ownCollection ? await getCollection(db, projectId, (mapping?.internal_id ?? ownCollection)!) : undefined
    records.push({
      key: `specification:${s.identifier}`,
      kind: 'collection',
      state: collection ? 'unchanged' : 'new',
      externalId: s.identifier,
      label: s.longName || s.identifier,
      localId: collection?.id ?? null,
      localKey: null,
      localRevision: collection?.structureRevision ?? null,
      changes: [],
      notes: [`${count(s.children)} hierarchy entries`, collection ? `Existing collection “${collection.name}”: newly imported items are added; existing structure is not reordered or removed` : 'A new collection is created with this structure'],
    })
  }

  const counts = { new: 0, changed: 0, unchanged: 0, conflicting: 0, unsupported: 0 } as Record<RecordState, number>
  for (const r of records) counts[r.state]++
  const present = new Set(doc.specObjects.map((o) => o.identifier))
  const absent = [...mappings.values()].filter((m) => m.external_kind === 'spec-object' && !present.has(m.external_id)).length
  const unsupported = [...read.unsupported]
  if (unsupportedRelations) unsupported.push({ kind: 'SPEC-RELATION without an equivalent type', count: unsupportedRelations, treatment: 'Not imported; listed in the preview' })
  const preservedCount = [...incoming.values()].reduce((n, i) => n + i.preservedValues.length, 0)
  if (preservedCount) unsupported.push({ kind: 'attribute values without a mapping', count: preservedCount, treatment: 'Preserved per object and written back when exporting to this source' })
  if (doc.specifications.some((s) => s.values.length)) unsupported.push({ kind: 'SPECIFICATION attribute values', count: doc.specifications.filter((s) => s.values.length).length, treatment: 'Not imported (collections have name and description only)' })
  return {
    preview: {
      format: 'reqif',
      source: { key: sourceKey, name: sourceName, matchedSourceId: existingSource?.id ?? null, matchedBy },
      header: { ...h, file: opts.fileName, reqifPath, sha256: createHash('sha256').update(bytes).digest('hex') },
      counts,
      records,
      attributeMappings,
      relationshipMappings,
      findings,
      unsupported,
      policies: [
        'Nothing is deleted: requirements absent from the file stay unchanged' + (absent ? ` (${absent} previously imported requirement(s) of this source are absent from this file).` : '.'),
        'Records are matched by exchange source and ReqIF IDENTIFIER, never by title; another source cannot update them.',
        'Conflicts (changed here and in the source) default to keeping the local version; choose per record.',
        'Imported requirements start as drafts. Lifecycle status, reviews and verification are not taken from the file.',
        'Rich text is sanitised; the original XHTML of each value is kept for audit and re-export.',
        'Collection structure: new items are added; existing collections are not reordered or emptied.',
      ],
      schemaValidation,
    },
    doc,
    incoming,
    sourceId: existingSource?.id ?? null,
    sourceKey,
    sourceName,
    mappings,
    attachments,
    newDefinitions,
  }
}

// ---- apply --------------------------------------------------------------------------------------------

export interface ApplyOptions {
  decisions: Record<string, 'take-incoming' | 'keep-local' | 'skip'>
  collectionName?: string
  role: Role | null
  storage: ObjectStorage
  twin: TwinDirectory
  schemaDir?: string
}

export async function previewReqifImport(ctx: Ctx, storage: ObjectStorage, bytes: Uint8Array, opts: AnalyzeOptions) {
  const analysis = await analyzeReqif(ctx.db, ctx.projectId, bytes, opts)
  const stored = await storage.put(bytes)
  return insertJob(ctx, { format: 'reqif', fileName: opts.fileName, sha256: stored.sha256, byteSize: stored.byteSize, sourceId: analysis.sourceId, sourceKey: analysis.sourceKey, storageKey: stored.key, preview: analysis.preview })
}

export async function applyReqifImport(ctx: Ctx, jobId: string, opts: ApplyOptions) {
  const { row } = await getJob(ctx.db, ctx.projectId, jobId, true)
  if (row.status !== 'previewed') throw conflict(`The import is ${row.status}; preview the file again to import it.`)
  const bytes = await opts.storage.get(row.storage_key)
  const prior = row.preview as unknown as Analysis['preview']
  const a = await analyzeReqif(ctx.db, ctx.projectId, bytes, { fileName: row.file_name, sourceKey: row.source_key ?? undefined, sourceName: prior.source.name, role: opts.role, schemaDir: undefined })
  if (a.preview.findings.some((f) => f.severity === 'error')) throw invalid('The file has errors and cannot be imported. See the preview findings.')
  // The data must not have changed between preview and apply.
  const before = new Map(prior.records.map((r) => [r.key, r]))
  const drift = a.preview.records.filter((r) => {
    const p = before.get(r.key)
    return !p || p.state !== r.state || p.localRevision !== r.localRevision
  })
  if (drift.length) throw conflict(`${drift.length} record(s) changed since the preview (for example ${drift[0].label}). Preview the file again; nothing was imported.`, undefined, { changedRecords: drift.slice(0, 20).map((d) => d.key) })

  const sourceId = await ensureSource(ctx, 'reqif', a.sourceKey, a.sourceName)
  const result = { requirementsCreated: 0, requirementsUpdated: 0, keptLocal: 0, skipped: 0, headings: 0, relationshipsCreated: 0, relationshipsSkipped: [] as string[], collectionsCreated: 0, attachments: 0, attributeDefinitionsCreated: 0 }

  // Attribute definitions (administrators only; decided in the preview).
  for (const d of a.newDefinitions) {
    if (!roleAllows(opts.role, 'define-attributes')) break
    await createAttributeDefinition(ctx, { key: d.key, name: d.name, dataType: d.dataType as 'string', enumValues: d.enumValues, multiValued: d.multiValued, description: `Imported from ReqIF source “${a.sourceName}”` })
    result.attributeDefinitionsCreated++
  }
  const defs = await listAttributeDefinitions(ctx.db, ctx.projectId)
  const toAttrs = (attrs: Incoming['attributes']) => Object.fromEntries(Object.entries(attrs).flatMap(([k, v]) => {
    const def = defs.find((d) => d.key === k)
    return def ? [[def.id, v]] : []
  }))

  // Attachments referenced by imported rich text.
  const attachmentIds = new Map<string, string>()
  const resolveAttachments = async (markup: string | null, requirementId: string | null) => {
    if (!markup) return markup
    let out = markup
    for (const m of markup.matchAll(/attachment-pending:([^"]+)/g)) {
      const path = m[1]
      let id = attachmentIds.get(path)
      if (!id) {
        const data = a.attachments.get(path)
        if (!data) continue
        const stored = await opts.storage.put(data)
        id = (await import('node:crypto')).randomUUID()
        const ext = path.split('.').pop()?.toLowerCase() ?? ''
        const mediaType = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf', ole: 'application/octet-stream' }[ext] ?? 'application/octet-stream'
        await ctx.db.query(
          'INSERT INTO requirements.attachments (id, project_id, sha256, media_type, byte_size, storage_key, original_name, requirement_id, provenance, created_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [id, ctx.projectId, stored.sha256, mediaType, stored.byteSize, stored.key, path, requirementId, JSON.stringify({ importJobId: jobId, source: a.sourceKey, archivePath: path }), ctx.now, ctx.actor],
        )
        attachmentIds.set(path, id)
        result.attachments++
      }
      out = out.split(`attachment-pending:${path}`).join(`attachment:${id}`)
    }
    return out
  }

  const conventions = (await getConventions(ctx.db, ctx.projectId)).settings
  const defaultType = conventions.requirementTypes.includes('other') ? 'other' : conventions.requirementTypes[0]
  const localOf = new Map<string, string>() // external object id -> requirement id
  const reason = `Imported from ${row.file_name} (ReqIF source “${a.sourceName}”)`
  for (const rec of a.preview.records) {
    if (rec.kind !== 'requirement') continue
    const inc = a.incoming.get(rec.externalId)!
    const decision = opts.decisions[rec.key] ?? (rec.state === 'conflicting' ? 'keep-local' : 'take-incoming')
    const preserved = { typeRef: inc.object.typeRef, fieldDefs: inc.fieldDefs, values: inc.preservedValues, longName: inc.object.longName }
    if (rec.localId) localOf.set(rec.externalId, rec.localId)
    if (decision === 'skip' || rec.state === 'unchanged' || (rec.state === 'conflicting' && decision === 'keep-local')) {
      if (rec.localId) {
        await upsertMapping(ctx, { sourceId, externalKind: 'spec-object', externalId: rec.externalId, internalKind: 'requirement', internalId: rec.localId, externalLastChange: inc.object.lastChange, internalRevision: rec.localRevision, preserved })
        if (decision === 'keep-local') result.keptLocal++
        else if (decision === 'skip') result.skipped++
      } else result.skipped++
      continue
    }
    if (rec.state === 'new') {
      const xhtml = await resolveAttachments(inc.statementXhtml, null)
      const created = await createRequirement(
        ctx,
        { title: inc.title, statement: inc.statement, rationale: inc.rationale?.trim(), source: inc.source?.trim() || `ReqIF ${a.sourceName}: ${rec.externalId}`, acceptanceCriteria: inc.acceptanceCriteria?.trim(), type: defaultType, attributes: toAttrs(inc.attributes), reason },
        { statementXhtml: xhtml, reason },
      )
      const revision = created.revision
      localOf.set(rec.externalId, created.id)
      await upsertMapping(ctx, { sourceId, externalKind: 'spec-object', externalId: rec.externalId, internalKind: 'requirement', internalId: created.id, externalLastChange: inc.object.lastChange, internalRevision: revision, preserved })
      result.requirementsCreated++
    } else {
      const xhtml = await resolveAttachments(inc.statementXhtml, rec.localId)
      const { requirement } = await updateRequirement(
        ctx,
        rec.localId!,
        { title: inc.title, statement: inc.statement, ...(inc.rationale !== undefined ? { rationale: inc.rationale } : {}), ...(inc.source !== undefined ? { source: inc.source } : {}), ...(inc.acceptanceCriteria !== undefined ? { acceptanceCriteria: inc.acceptanceCriteria } : {}), attributes: toAttrs(inc.attributes) },
        rec.localRevision!,
        { role: 'administrator', statementXhtml: xhtml, reason },
      )
      await upsertMapping(ctx, { sourceId, externalKind: 'spec-object', externalId: rec.externalId, internalKind: 'requirement', internalId: requirement.id, externalLastChange: inc.object.lastChange, internalRevision: requirement.revision, preserved })
      result.requirementsUpdated++
    }
  }

  // Collections and structure.
  for (const s of a.doc.specifications) {
    const rec = a.preview.records.find((r) => r.key === `specification:${s.identifier}`)!
    if ((opts.decisions[rec.key] ?? 'take-incoming') === 'skip') continue
    let collectionId = rec.localId
    if (!collectionId) {
      const base = (opts.collectionName?.trim() && result.collectionsCreated === 0 ? opts.collectionName.trim() : s.longName || a.doc.header.title || row.file_name).slice(0, 180)
      let name = base
      for (let i = 2; (await ctx.db.query('SELECT 1 FROM requirements.collections WHERE project_id = $1 AND name = $2', [ctx.projectId, name])).rowCount; i++) name = `${base} (${i})`
      collectionId = (await createCollection(ctx, { name, description: `Imported from ${row.file_name}; ReqIF specification ${s.identifier}.` })).id
      result.collectionsCreated++
      await upsertMapping(ctx, { sourceId, externalKind: 'specification', externalId: s.identifier, internalKind: 'collection', internalId: collectionId, externalLastChange: s.lastChange })
    }
    const tree = await collectionTree(ctx.db, ctx.projectId, collectionId)
    const inCollection = new Set(tree.nodes.map((n) => n.requirementId).filter(Boolean))
    const nodeOfHierarchy = new Map<string, string>()
    for (const n of tree.nodes) for (const [k, m] of a.mappings) if (k.startsWith('spec-hierarchy:') && m.internal_id === n.id) nodeOfHierarchy.set(m.external_id, n.id)
    const place = async (nodes: HierarchyNode[], parentNodeId: string | null) => {
      for (const hn of nodes) {
        let nodeId = nodeOfHierarchy.get(hn.identifier) ?? a.mappings.get(`spec-hierarchy:${hn.identifier}`)?.internal_id ?? null
        const inc = a.incoming.get(hn.objectRef)
        if (nodeId && !tree.nodes.some((n) => n.id === nodeId)) nodeId = null
        if (!nodeId && inc?.kind === 'heading') {
          const known = a.preview.records.find((r) => r.key === `spec-object:${hn.objectRef}`)?.localId
          if (known && tree.nodes.some((n) => n.id === known)) nodeId = known
        }
        if (!nodeId && inc) {
          if (inc.kind === 'heading') {
            nodeId = (await addNode(ctx, collectionId!, { kind: 'heading', heading: inc.heading!.slice(0, 300), parentId: parentNodeId }, null)).id
            result.headings++
            await upsertMapping(ctx, { sourceId, externalKind: 'spec-object', externalId: hn.objectRef, internalKind: 'heading', internalId: nodeId, externalLastChange: inc.object.lastChange })
          } else {
            const reqId = localOf.get(hn.objectRef)
            if (reqId && !inCollection.has(reqId)) {
              nodeId = (await addNode(ctx, collectionId!, { kind: 'requirement', requirementId: reqId, parentId: parentNodeId }, null)).id
              inCollection.add(reqId)
            }
          }
          if (nodeId) await upsertMapping(ctx, { sourceId, externalKind: 'spec-hierarchy', externalId: hn.identifier, internalKind: 'collection-node', internalId: nodeId, externalLastChange: hn.lastChange })
        }
        await place(hn.children, nodeId ?? parentNodeId)
      }
    }
    await place(s.children, null)
  }

  // Relationships.
  for (const rel of a.doc.specRelations) {
    const rec = a.preview.records.find((r) => r.key === `spec-relation:${rel.identifier}`)
    if (!rec || rec.state !== 'new' || (opts.decisions[rec.key] ?? 'take-incoming') === 'skip') continue
    const type = relationTypeFor(a.doc.specTypes.find((t) => t.identifier === rel.typeRef)?.longName)!
    const from = localOf.get(rel.sourceRef)
    const to = localOf.get(rel.targetRef)
    if (!from || !to) {
      result.relationshipsSkipped.push(`${rel.identifier}: an end was not imported`)
      continue
    }
    await ctx.db.query('SAVEPOINT rel')
    try {
      const created = await createRelationship(ctx, opts.twin, { type, fromId: from, toRequirementId: to, reason }, { silent: false })
      await ctx.db.query('RELEASE SAVEPOINT rel')
      await upsertMapping(ctx, { sourceId, externalKind: 'spec-relation', externalId: rel.identifier, internalKind: 'relationship', internalId: created.id, externalLastChange: rel.lastChange, internalRevision: created.revision })
      result.relationshipsCreated++
    } catch (e) {
      await ctx.db.query('ROLLBACK TO SAVEPOINT rel')
      result.relationshipsSkipped.push(`${rel.identifier}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Preserve the source's type system for lossless re-export to it.
  for (const d of a.doc.datatypes) await upsertMapping(ctx, { sourceId, externalKind: 'datatype', externalId: d.identifier, internalKind: 'preserved', internalId: null, externalLastChange: d.lastChange, preserved: d })
  for (const t of a.doc.specTypes) await upsertMapping(ctx, { sourceId, externalKind: 'spec-type', externalId: t.identifier, internalKind: 'preserved', internalId: null, externalLastChange: t.lastChange, preserved: t })
  await upsertMapping(ctx, { sourceId, externalKind: 'header', externalId: 'header', internalKind: 'preserved', internalId: null, preserved: { header: a.doc.header, toolExtensions: a.doc.toolExtensions, relationGroups: a.doc.relationGroups } })

  await ctx.db.query(`UPDATE requirements.import_jobs SET status = 'applied', source_id = $2, result = $3, applied_at = $4, applied_by = $5 WHERE id = $1`, [jobId, sourceId, JSON.stringify(result), ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'import', entityId: jobId, action: 'applied', details: { ...result, sourceKey: a.sourceKey, fileName: row.file_name } })
  await emit(ctx, 'requirements.import-completed', jobId, 1)
  return (await getJob(ctx.db, ctx.projectId, jobId)).dto
}

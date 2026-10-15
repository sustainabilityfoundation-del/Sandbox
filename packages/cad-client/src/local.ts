import { allIds, entityUuid, stableStringify, validateDocument, type CadDocument } from '@ews/cad-core'
import { CadClientError, entityRef, type CadClient, type CadDocumentSummary, type CadEvent, type CadRevisionInfo } from './types'

/**
 * Explicit in-browser CAD document store (mode 'local'): the same contract as the HTTP client, kept
 * in memory, for the standalone harness, demos and tests. It is chosen explicitly and never replaces
 * the API silently. It validates with cad-core's rules (the server additionally applies the JSON Schema).
 */
export function createLocalCadClient(options: { actor?: string; clock?: () => string } = {}): CadClient {
  const actor = options.actor ?? 'local-user'
  const now = options.clock ?? (() => new Date().toISOString())
  type Stored = { projectId: string; archived: boolean; createdAt: string; createdBy: string; revisions: { info: CadRevisionInfo; document: CadDocument; hash: string }[] }
  const docs = new Map<string, Stored>()
  const listeners = new Map<string, Set<(e: CadEvent) => void>>()
  const keys = new Map<string, unknown>()
  let seq = 0

  const partsOf = (id: string, doc: CadDocument) => doc.parts.map((p) => ({ uuid: entityUuid(id, p.id), id: p.id, name: p.name }))
  const emit = (e: Pick<CadEvent, 'type' | 'projectId' | 'documentId' | 'revision'>, sourceKind: string) => {
    const s = docs.get(e.documentId)!
    const cur = s.revisions.at(-1)!
    const at = now()
    const ev: CadEvent = { ...e, kind: 'cad-document', name: cur.info.title, parts: partsOf(e.documentId, cur.document), eventId: `local-${++seq}`, occurredAt: at, actor, updatedAt: at, updatedBy: actor, sourceKind }
    queueMicrotask(() => listeners.get(e.projectId)?.forEach((l) => l(ev)))
  }
  const check = (doc: CadDocument) => {
    const problems = validateDocument(doc)
    if (problems.length) throw new CadClientError('invalid', 'The document is not a valid ews-cad model.', { problems: problems.slice(0, 12) })
    return structuredClone(doc)
  }
  const find = (projectId: string, id: string) => {
    const s = docs.get(id)
    if (!s || s.projectId !== projectId) throw new CadClientError('not-found', `CAD document ${id} does not exist in project ${projectId}.`)
    return s
  }
  const summary = (id: string, s: Stored): CadDocumentSummary => {
    const cur = s.revisions.at(-1)!
    return { id, kind: 'cad-document', projectId: s.projectId, title: cur.info.title, revision: cur.info.revision, archived: s.archived, formatVersion: cur.info.formatVersion, modelVersion: cur.info.modelVersion, partCount: cur.info.partCount, featureCount: cur.info.featureCount, parts: partsOf(id, cur.document), createdAt: s.createdAt, createdBy: s.createdBy, updatedAt: cur.info.createdAt, updatedBy: cur.info.actor }
  }
  const info = (doc: CadDocument, revision: number, message: string, sourceKind: CadRevisionInfo['source']['sourceKind']): CadRevisionInfo => ({
    revision,
    title: doc.metadata.title || 'Untitled',
    formatVersion: doc.formatVersion,
    modelVersion: doc.version,
    partCount: doc.parts.length,
    featureCount: doc.parts.reduce((n, p) => n + p.features.length, 0),
    message,
    actor,
    source: { sourceKind },
    createdAt: now(),
  })
  const once = async <T>(key: string | undefined, fn: () => T): Promise<T> => {
    if (key && keys.has(key)) return keys.get(key) as T
    const out = fn()
    if (key) keys.set(key, out)
    return out
  }
  const hash = (d: CadDocument) => stableStringify({ ...d, version: 0 })

  const client: CadClient = {
    mode: 'local',
    async list(projectId, o) {
      return [...docs.entries()].filter(([, s]) => s.projectId === projectId && (o?.includeArchived || !s.archived)).map(([id, s]) => summary(id, s)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async get(projectId, id, revision) {
      const s = find(projectId, id)
      const r = revision ? s.revisions.find((x) => x.info.revision === revision) : s.revisions.at(-1)
      if (!r) throw new CadClientError('not-found', `Revision ${revision} of CAD document ${id} does not exist.`)
      return { summary: summary(id, s), revision: r.info, document: structuredClone(r.document) }
    },
    create(projectId, document, o) {
      return once(o.idempotencyKey, () => {
        const doc = check(document)
        if (docs.has(doc.documentId)) throw new CadClientError('conflict', `A CAD document with ID ${doc.documentId} already exists.`, { reason: 'document-exists' })
        const s: Stored = { projectId, archived: false, createdAt: now(), createdBy: actor, revisions: [{ info: info(doc, 1, o.message ?? '', o.provenance?.sourceKind ?? 'user'), document: doc, hash: hash(doc) }] }
        docs.set(doc.documentId, s)
        emit({ type: 'cad.document-created', projectId, documentId: doc.documentId, revision: 1 }, o.provenance?.sourceKind ?? 'user')
        return { summary: summary(doc.documentId, s), revision: s.revisions[0].info }
      })
    },
    save(projectId, id, document, o) {
      return once(o.idempotencyKey, () => {
        const doc = check(document)
        if (doc.documentId !== id) throw new CadClientError('invalid', `The document's documentId (${doc.documentId}) does not match ${id}.`)
        const s = find(projectId, id)
        const cur = s.revisions.at(-1)!
        if (s.archived) throw new CadClientError('conflict', `CAD document ${id} is archived.`, { reason: 'archived' })
        if (cur.info.revision !== o.expectedRevision) throw new CadClientError('conflict', `Expected revision ${o.expectedRevision}, current revision ${cur.info.revision}.`, { currentRevision: cur.info.revision, expectedRevision: o.expectedRevision })
        if (cur.hash === hash(doc)) return { summary: summary(id, s), revision: cur.info, unchanged: true }
        const r = { info: info(doc, cur.info.revision + 1, o.message ?? '', o.provenance?.sourceKind ?? 'user'), document: doc, hash: hash(doc) }
        s.revisions.push(r)
        emit({ type: 'cad.revision-created', projectId, documentId: id, revision: r.info.revision }, o.provenance?.sourceKind ?? 'user')
        return { summary: summary(id, s), revision: r.info, unchanged: false }
      })
    },
    async revisions(projectId, id) {
      return find(projectId, id).revisions.map((r) => r.info).reverse()
    },
    async archive(projectId, id, archived, o) {
      const s = find(projectId, id)
      const cur = s.revisions.at(-1)!.info.revision
      if (cur !== o.expectedRevision) throw new CadClientError('conflict', `Expected revision ${o.expectedRevision}, current revision ${cur}.`, { currentRevision: cur, expectedRevision: o.expectedRevision })
      const changed = s.archived !== archived
      s.archived = archived
      if (changed) emit({ type: archived ? 'cad.document-archived' : 'cad.document-restored', projectId, documentId: id, revision: cur }, 'user')
      return summary(id, s)
    },
    async resolveEntity(projectId, id, entityId, revision) {
      const { document: doc, revision: r } = await client.get(projectId, id, revision)
      const isDoc = entityId === doc.documentId
      const featureId = entityId.split('/')[0]
      const isFace = entityId.includes('/') && doc.parts.some((p) => p.features.some((f) => f.id === featureId))
      if (!isDoc && !allIds(doc).includes(entityId) && !isFace) throw new CadClientError('not-found', `${entityId} is not an entity of CAD document ${doc.documentId}.`)
      const part = doc.parts.find((p) => p.id === entityId)
      const feature = doc.parts.flatMap((p) => p.features).find((f) => f.id === (isFace ? featureId : entityId))
      const parameter = doc.parts.flatMap((p) => p.parameters).find((x) => x.id === entityId)
      return {
        ref: entityRef(doc.documentId, isDoc ? undefined : entityId, r.revision),
        entityType: isDoc ? 'document' : part ? 'part' : isFace ? 'face' : feature ? feature.type : parameter ? 'parameter' : 'sketch-element',
        label: isDoc ? doc.metadata.title : part?.name ?? (isFace ? `${feature?.name ?? featureId} · ${entityId.slice(featureId.length + 1)}` : feature?.name ?? parameter?.name ?? entityId),
        documentTitle: doc.metadata.title,
        verifiedInGeometry: !isFace,
      }
    },
    subscribe(projectId, listener) {
      const set = listeners.get(projectId) ?? new Set()
      set.add(listener)
      listeners.set(projectId, set)
      return () => set.delete(listener)
    },
  }
  return client
}

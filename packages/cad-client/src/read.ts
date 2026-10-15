import { massProperties, type CadDocument, type MassProperties, type Regenerator } from '@ews/cad-core'
import { CadClientError, type CadClient } from './types'

/**
 * Read access to CAD Modeler entities for other modules (contract C5). This is the implementation
 * behind the proposed SDK 1.8 `PlatformServices.cad`; the TypeScript proposed for the SDK is in
 * docs/specifications/cad-program-progress.md.
 *
 * - Summaries come from the stored revision through the CAD API.
 * - Mass properties come from regenerating that stored revision with the injected regenerator (the
 *   kernel worker in the browser, in-process OCCT in Node). The service stores no derived geometry
 *   (C4).
 * - Revisions are immutable, so results are cached per (document, revision).
 * - Unresolvable references give `missing` or `unavailable` and never throw.
 */

/** A reference as other modules store it (ArtifactRef, CR-CAD-1). */
export interface CadArtifactRefInput {
  module: string
  kind: string
  id: string
  revision?: number
}

export type CadReadResult<T> =
  | { status: 'resolved'; value: T }
  | { status: 'missing'; reason: 'not-a-cad-reference' | 'document-not-found' | 'revision-not-found' | 'entity-not-found' | 'no-geometry'; message: string }
  | { status: 'unavailable'; reason: 'forbidden' | 'unauthenticated' | 'service-unavailable' | 'kernel-unavailable'; message: string }

export interface CadEntitySummary {
  /** The reference with the revision it resolved at (the pinned one, or the latest). */
  ref: { module: 'cad'; kind: 'cad-modeler-entity'; id: string; revision: number }
  documentId: string
  entityId: string
  entityType: string
  label: string
  documentTitle: string
  /** True when the input reference carried a revision. */
  pinned: boolean
  /** Current revision of the document; greater than ref.revision means a newer revision exists. */
  latestRevision: number
  archived: boolean
  /** False for face names, which only regeneration can confirm. */
  verifiedInGeometry: boolean
}

export interface CadMassPropertiesResult {
  ref: CadEntitySummary['ref']
  /** Parts measured: the part itself, or every part of a document reference. */
  parts: { partId: string; name: string; bodies: MassProperties[] }[]
  /** Regeneration outcome of the measured revision. Failed features leave their bodies out. */
  regeneration: { ok: boolean; failures: { partId: string; featureId: string; status: string; code?: string; message?: string }[]; kernel: string; location: string }
  /** Derived, never stored: recomputed from the native model of that revision. */
  derivedFrom: 'regeneration'
}

export interface CadReadService {
  summary(projectId: string, ref: CadArtifactRefInput): Promise<CadReadResult<CadEntitySummary>>
  massProperties(projectId: string, ref: CadArtifactRefInput): Promise<CadReadResult<CadMassPropertiesResult>>
}

export function createCadReadService(options: { client: CadClient; regenerator?: () => Promise<Regenerator> | Regenerator }): CadReadService {
  const { client } = options
  const docCache = new Map<string, Promise<{ document: CadDocument; revision: number; latest: number; archived: boolean }>>()
  const massCache = new Map<string, Promise<CadReadResult<CadMassPropertiesResult>>>()

  const parse = (ref: CadArtifactRefInput) => {
    if (ref.module !== 'cad' || ref.kind !== 'cad-modeler-entity') return undefined
    const slash = ref.id.indexOf('/')
    if (slash !== 36) return undefined
    return { documentId: ref.id.slice(0, 36), entityId: ref.id.slice(37) }
  }
  const failure = (e: unknown, revision?: number): CadReadResult<never> => {
    if (e instanceof CadClientError) {
      if (e.code === 'not-found') return { status: 'missing', reason: revision && /Revision/.test(e.message) ? 'revision-not-found' : /entity/.test(e.message) ? 'entity-not-found' : 'document-not-found', message: e.message }
      if (e.code === 'forbidden' || e.code === 'unauthenticated') return { status: 'unavailable', reason: e.code, message: e.message }
    }
    return { status: 'unavailable', reason: 'service-unavailable', message: e instanceof Error ? e.message : String(e) }
  }
  const load = (projectId: string, documentId: string, revision?: number) => {
    // Pinned revisions never change, so they are cached. "Latest" is always reread.
    const key = revision ? `${projectId}|${documentId}|${revision}` : undefined
    const hit = key ? docCache.get(key) : undefined
    if (hit) return hit
    const p = client.get(projectId, documentId, revision).then((g) => ({ document: g.document, revision: g.revision.revision, latest: g.summary.revision, archived: g.summary.archived }))
    if (key) {
      docCache.set(key, p)
      p.catch(() => docCache.delete(key))
    }
    return p
  }

  const service: CadReadService = {
    async summary(projectId, ref) {
      const parsed = parse(ref)
      if (!parsed) return { status: 'missing', reason: 'not-a-cad-reference', message: `${ref.module}/${ref.kind} ${ref.id} is not a CAD Modeler reference ({ module: 'cad', kind: 'cad-modeler-entity', id: '<documentUuid>/<entityId>' }).` }
      try {
        const doc = await load(projectId, parsed.documentId, ref.revision)
        const r = await client.resolveEntity(projectId, parsed.documentId, parsed.entityId, doc.revision)
        return {
          status: 'resolved',
          value: {
            ref: { module: 'cad', kind: 'cad-modeler-entity', id: ref.id, revision: doc.revision },
            documentId: parsed.documentId,
            entityId: parsed.entityId,
            entityType: r.entityType,
            label: r.label,
            documentTitle: r.documentTitle,
            pinned: ref.revision !== undefined,
            latestRevision: doc.latest,
            archived: doc.archived,
            verifiedInGeometry: r.verifiedInGeometry,
          },
        }
      } catch (e) {
        return failure(e, ref.revision)
      }
    },

    async massProperties(projectId, ref) {
      const s = await service.summary(projectId, ref)
      if (s.status !== 'resolved') return s
      if (s.value.entityType !== 'part' && s.value.entityType !== 'document') return { status: 'missing', reason: 'no-geometry', message: `${s.value.label} is a ${s.value.entityType}; mass properties exist for parts and documents.` }
      const key = `${projectId}|${ref.id}|${s.value.ref.revision}`
      const hit = massCache.get(key)
      if (hit) return hit
      const run = (async (): Promise<CadReadResult<CadMassPropertiesResult>> => {
        if (!options.regenerator) return { status: 'unavailable', reason: 'kernel-unavailable', message: 'No CAD kernel is available in this host to regenerate the model.' }
        const { document } = await load(projectId, s.value.documentId, s.value.ref.revision)
        let regen
        try {
          const regenerator = await options.regenerator()
          regen = await regenerator.regenerate(document, { evict: true })
        } catch (e) {
          return { status: 'unavailable', reason: 'kernel-unavailable', message: e instanceof Error ? e.message : String(e) }
        }
        const parts = document.parts.filter((p) => s.value.entityType === 'document' || p.id === s.value.entityId)
        return {
          status: 'resolved',
          value: {
            ref: s.value.ref,
            parts: parts.map((p) => ({ partId: p.id, name: p.name, bodies: massProperties(document, regen, p.id) })),
            regeneration: {
              ok: regen.ok,
              failures: regen.parts.flatMap((p) => p.features.filter((f) => f.status !== 'ok' && f.status !== 'suppressed').map((f) => ({ partId: p.partId, featureId: f.featureId, status: f.status, code: f.error?.code, message: f.error?.message }))),
              kernel: `${regen.kernel.name} ${regen.kernel.version}`,
              location: regen.location ?? 'unknown',
            },
            derivedFrom: 'regeneration',
          },
        }
      })()
      massCache.set(key, run)
      run.then((r) => r.status !== 'resolved' && massCache.delete(key), () => massCache.delete(key))
      return run
    },
  }
  return service
}

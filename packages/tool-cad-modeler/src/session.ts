import {
  CadEngine,
  CadError,
  FILE_EXTENSION,
  MEDIA_TYPE,
  createDocument,
  parseDocument,
  serializeDocument,
  type CadDocument,
  type GeometryKernel,
} from '@ews/cad-core'
import { detectFormat, inspectStep, type StepInspection } from '@ews/cad-kernel'
import { CadClientError, newIdempotencyKey, type CadClient, type CadDocumentSummary, type CadProvenance } from '@ews/cad-client'
import { useSyncExternalStore } from 'react'
import pkg from '../package.json'

/**
 * The CAD Modeler session of this window: open documents (each a CadEngine with history and
 * regeneration), the active document, the geometric kernel and file transfer. The view and the
 * assistant actions both use this one session, so they operate on the same model through the same
 * commands (ADR-0023). Documents live in memory; Save writes the open native file (.ewscad).
 */

export interface OpenDocument {
  id: string
  engine: CadEngine
  /** Version last saved to a file (null: never saved). */
  savedVersion: number | null
  fileName: string
  /** Where the document is stored in the CAD service (API mode), and its revision there. */
  stored?: { projectId: string; revision: number }
  /** A newer revision saved elsewhere (from service events). */
  remoteRevision?: number
}

export interface DownloadFile {
  name: string
  mime: string
  content: string
}

export interface SessionSnapshot {
  documents: { id: string; title: string; version: number; dirty: boolean; everSaved: boolean; fileName: string; stored: { projectId: string; revision: number } | null; remoteRevision: number | null }[]
  /** The CAD document service (API mode) or an explicit local store; null: files only. */
  store: { mode: CadClient['mode'] } | null
  activeId: string | null
  kernel: { status: 'not-started' | 'loading' | 'ready' | 'failed'; info?: GeometryKernel['info']; loadMs?: number; error?: string }
  lastExport: { fileName: string; inspection: StepInspection; documentVersion: number } | null
  rev: number
}

type KernelFactory = () => GeometryKernel & { ready?: Promise<{ loadMs: number }> }

const WRITER = { tool: '@ews/tool-cad-modeler', version: pkg.version }

export class CadSession {
  private readonly docs = new Map<string, OpenDocument>()
  private activeId: string | null = null
  private kernel?: GeometryKernel
  private kernelState: SessionSnapshot['kernel'] = { status: 'not-started' }
  private lastExport: SessionSnapshot['lastExport'] = null
  private readonly listeners = new Set<() => void>()
  private snap: SessionSnapshot
  private rev = 0
  private untitled = 0
  private kernelFactory: KernelFactory | null = null
  private downloader: (file: DownloadFile) => void = browserDownload

  constructor() {
    this.snap = this.build()
  }

  // ---- configuration ----------------------------------------------------------------------

  /** The kernel to use (browser: the Web Worker kernel; tests: the in-process Node kernel). */
  configureKernel(factory: KernelFactory) {
    this.kernelFactory = factory
  }
  configureDownloads(fn: (file: DownloadFile) => void) {
    this.downloader = fn
  }

  /** The window's kernel (started on first use). */
  getKernel(): GeometryKernel {
    if (this.kernel) return this.kernel
    const factory = this.kernelFactory ?? defaultKernelFactory
    if (!factory) throw new CadError('kernel-unavailable', 'No geometric kernel is available in this environment (Web Workers are required).')
    const k = factory()
    this.kernel = k
    this.kernelState = { status: 'loading', info: k.info }
    this.emit()
    const ready = k.ready ?? Promise.resolve({ loadMs: 0 })
    ready.then(
      (r) => {
        this.kernelState = { status: 'ready', info: k.info, loadMs: r.loadMs }
        this.emit()
      },
      (e) => {
        this.kernelState = { status: 'failed', info: k.info, error: e instanceof Error ? e.message : String(e) }
        this.emit()
      },
    )
    return k
  }

  // ---- subscription -----------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  getSnapshot = (): SessionSnapshot => this.snap

  private build(): SessionSnapshot {
    return {
      documents: [...this.docs.values()].map((d) => ({ id: d.id, title: d.engine.document.metadata.title, version: d.engine.document.version, dirty: this.isDirty(d), everSaved: d.savedVersion !== null, fileName: d.fileName, stored: d.stored ?? null, remoteRevision: d.remoteRevision ?? null })),
      store: this.store ? { mode: this.store.mode } : null,
      activeId: this.activeId,
      kernel: this.kernelState,
      lastExport: this.lastExport,
      rev: this.rev,
    }
  }
  private emit = () => {
    this.rev++
    this.snap = this.build()
    this.listeners.forEach((l) => l())
  }
  private isDirty(d: OpenDocument): boolean {
    const v = d.engine.document.version
    return d.savedVersion === null ? v > 1 : v !== d.savedVersion
  }

  // ---- documents ----------------------------------------------------------------------------

  get active(): OpenDocument | undefined {
    return this.activeId ? this.docs.get(this.activeId) : undefined
  }
  document(id?: string | null): OpenDocument | undefined {
    return id ? this.docs.get(id) : this.active
  }
  /** The document to act on: the given one, else the active one; throws a clear error otherwise. */
  require(id?: string | null): OpenDocument {
    const d = this.document(id)
    if (!d) throw new CadError('not-found', id ? `CAD document ${id} is not open.` : 'No CAD Modeler document is open. Create one first (New) or open a .ewscad file.')
    return d
  }
  setActive(id: string) {
    if (!this.docs.has(id)) throw new CadError('not-found', `CAD document ${id} is not open.`)
    if (this.activeId !== id) {
      this.activeId = id
      this.emit()
    }
  }

  private add(engine: CadEngine, fileName: string, savedVersion: number | null): OpenDocument {
    const d: OpenDocument = { id: engine.document.documentId, engine, savedVersion, fileName }
    if (this.docs.has(d.id)) throw new CadError('precondition-failed', `A document with ID ${d.id} is already open.`)
    this.docs.set(d.id, d)
    engine.subscribe(this.emit)
    this.activeId = d.id
    this.emit()
    return d
  }

  /** New document with one empty part (the part is created by the create_part command). */
  async newDocument(options: { title?: string; partName?: string; source?: 'user' | 'assistant'; empty?: boolean } = {}): Promise<OpenDocument> {
    const title = options.title ?? `Untitled ${++this.untitled}`
    const engine = new CadEngine({ kernel: this.getKernel(), document: createDocument({ title, createdAt: new Date().toISOString(), writer: WRITER }) })
    const d = this.add(engine, `${fileStem(title)}${FILE_EXTENSION}`, null)
    if (!options.empty) await engine.execute({ commands: [{ command: 'create_part', input: { name: options.partName ?? 'Part 1' } }], label: 'Create part', source: options.source ?? 'user' })
    return d
  }

  /** Opens native text; other formats are detected and explained (never guessed). */
  async openText(text: string, fileName: string): Promise<OpenDocument> {
    const format = detectFormat(text, fileName)
    if (format.format !== 'ews-cad') throw new CadError('unsupported', `${format.label}: ${format.message}`, { format: format.format })
    return this.openDocument(parseDocument(text), fileName)
  }

  async openDocument(doc: CadDocument, fileName = `${fileStem(doc.metadata.title)}${FILE_EXTENSION}`): Promise<OpenDocument> {
    const existing = this.docs.get(doc.documentId)
    if (existing) {
      if (this.isDirty(existing)) throw new CadError('precondition-failed', `“${doc.metadata.title}” is already open with unsaved changes. Save or close it first.`)
      this.close(existing.id)
    }
    const engine = new CadEngine({ kernel: this.getKernel() })
    await engine.open(doc)
    return this.add(engine, fileName, doc.version)
  }

  close(id: string) {
    const d = this.docs.get(id)
    if (!d) return
    this.docs.delete(id)
    void d.engine.dispose()
    if (this.activeId === id) this.activeId = [...this.docs.keys()].at(-1) ?? null
    this.emit()
  }

  // ---- files ----------------------------------------------------------------------------------

  /** Downloads the native file and marks the document saved. */
  save(id?: string | null): DownloadFile {
    const d = this.require(id)
    const doc = d.engine.document
    const stamped: CadDocument = { ...doc, metadata: { ...doc.metadata, modifiedAt: new Date().toISOString(), writer: WRITER } }
    const file = { name: d.fileName || `${fileStem(doc.metadata.title)}${FILE_EXTENSION}`, mime: MEDIA_TYPE, content: serializeDocument(stamped) }
    this.downloader(file)
    d.savedVersion = doc.version
    this.emit()
    return file
  }

  /** STEP AP242 of a part, with a structural inspection; downloads it. */
  async exportStep(id?: string | null, partId?: string): Promise<{ file: DownloadFile; inspection: StepInspection; version: number }> {
    const d = this.require(id)
    const result = await d.engine.exportStep(partId)
    const part = d.engine.document.parts.find((p) => p.id === result.partId)!
    const inspection = inspectStep(result.text)
    const file = { name: `${fileStem(part.name)}.step`, mime: 'model/step', content: result.text }
    this.downloader(file)
    this.lastExport = { fileName: file.name, inspection, documentVersion: result.version }
    this.emit()
    return { file, inspection, version: result.version }
  }

  // ---- CAD document service (CR-CAD-2) ------------------------------------------------------

  private store: CadClient | null = null
  private storeEvents: (() => void) | null = null
  private storeProject: string | null = null

  /** Uses the CAD document service (API mode) or an explicit local store; null: files only. */
  configureStore(client: CadClient | null) {
    this.storeEvents?.()
    this.storeEvents = null
    this.storeProject = null
    this.store = client
    this.emit()
  }

  get storeClient(): CadClient | null {
    return this.store
  }

  /** Listens to committed-change events of a project; marks open documents saved elsewhere. */
  watchProject(projectId: string) {
    if (!this.store || this.storeProject === projectId) return
    this.storeEvents?.()
    this.storeProject = projectId
    this.storeEvents = this.store.subscribe(projectId, (e) => {
      const d = this.docs.get(e.documentId)
      if (!d || e.revision === undefined || !d.stored || e.revision <= d.stored.revision) return
      d.remoteRevision = e.revision
      this.emit()
    })
  }

  listStored(projectId: string): Promise<CadDocumentSummary[]> {
    if (!this.store) throw new CadError('unsupported', 'No CAD document service is connected; use files.')
    return this.store.list(projectId)
  }

  /**
   * Saves the document as a new revision in the service (or creates it). Optimistic concurrency: the
   * revision last loaded or saved is sent as expectedRevision; a conflict never overwrites.
   */
  async saveToStore(projectId: string, id?: string | null, options: { message?: string; provenance?: CadProvenance } = {}): Promise<{ revision: number; unchanged: boolean }> {
    if (!this.store) throw new CadError('unsupported', 'No CAD document service is connected; use Save file.')
    const d = this.require(id)
    const doc = d.engine.document
    const stamped: CadDocument = { ...doc, metadata: { ...doc.metadata, modifiedAt: new Date().toISOString(), writer: WRITER } }
    const common = { idempotencyKey: newIdempotencyKey(), message: options.message, provenance: options.provenance }
    try {
      if (d.stored && d.stored.projectId !== projectId) throw new CadError('precondition-failed', `This document is stored in project ${d.stored.projectId}, not ${projectId}.`)
      const out = d.stored
        ? await this.store.save(projectId, d.id, stamped, { ...common, expectedRevision: d.stored.revision })
        : { ...(await this.store.create(projectId, stamped, common)), unchanged: false }
      d.stored = { projectId, revision: out.summary.revision }
      d.remoteRevision = undefined
      d.savedVersion = doc.version
      this.watchProject(projectId)
      this.emit()
      return { revision: out.summary.revision, unchanged: out.unchanged }
    } catch (e) {
      if (e instanceof CadClientError && e.code === 'conflict' && e.details?.currentRevision)
        throw new CadError('version-conflict', `Revision ${e.details.currentRevision} was saved by someone else since you opened revision ${d.stored?.revision}. Nothing was overwritten. Open the latest revision (your changes stay in this window until you close it), or save this one to a file.`, { currentRevision: e.details.currentRevision })
      if (e instanceof CadClientError && e.details?.reason === 'document-exists') throw new CadError('precondition-failed', `${e.message} Open it from the project instead.`)
      if (e instanceof CadClientError) throw new CadError(e.code === 'unavailable' ? 'kernel-unavailable' : 'invalid-input', e.message, e.details)
      throw e
    }
  }

  /** Opens a stored document (the current or a given revision) and regenerates it. */
  async openFromStore(projectId: string, documentId: string, revision?: number): Promise<OpenDocument> {
    if (!this.store) throw new CadError('unsupported', 'No CAD document service is connected.')
    const got = await this.store.get(projectId, documentId, revision)
    const existing = this.docs.get(documentId)
    if (existing && this.isDirty(existing)) throw new CadError('precondition-failed', `“${existing.engine.document.metadata.title}” is open with unsaved changes. Save it to a file or close it first.`)
    if (existing) this.close(existing.id)
    const engine = new CadEngine({ kernel: this.getKernel() })
    await engine.open(got.document)
    const d = this.add(engine, `${fileStem(got.document.metadata.title)}${FILE_EXTENSION}`, got.document.version)
    // An older revision opens as a read-back: saving it again needs the current revision as base.
    d.stored = { projectId, revision: got.summary.revision }
    this.watchProject(projectId)
    this.emit()
    return d
  }

  /** For tests. */
  async reset() {
    for (const id of [...this.docs.keys()]) this.close(id)
    this.lastExport = null
    this.untitled = 0
    this.emit()
  }
}

function fileStem(title: string): string {
  return (title || 'model').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'model'
}

function browserDownload(file: DownloadFile) {
  if (typeof document === 'undefined') return
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

let defaultKernelFactory: KernelFactory | null = null

/** Registers the browser kernel factory (done by the view module, so tests never load the worker). */
export function setDefaultKernelFactory(factory: KernelFactory) {
  defaultKernelFactory = factory
}

export const cadSession = new CadSession()

export function useCadSession(): SessionSnapshot {
  return useSyncExternalStore(cadSession.subscribe, cadSession.getSnapshot, cadSession.getSnapshot)
}

export function useEngineState(engine: CadEngine | undefined) {
  return useSyncExternalStore(
    (l) => (engine ? engine.subscribe(l) : () => undefined),
    () => engine?.getState(),
    () => engine?.getState(),
  )
}

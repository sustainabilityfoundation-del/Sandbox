import { DocumentHistory, type ExecuteResult, type OperationLogEntry } from './commands/history'
import { readBackStep, type StepReadBack } from './regen/readback'
import { applyTransaction } from './commands/executor'
import { QUERIES } from './commands/catalog'
import type { Affected, CommandSource, Transaction } from './commands/types'
import { CadError, toErrorInfo, type CadErrorInfo } from './errors'
import type { GeometryKernel, MeshData } from './kernel'
import { createDocument, findPart, validateDocument } from './model/document'
import { validateSchema } from './model/jsonSchema'
import type { CadDocument } from './model/types'
import { failures } from './query/queries'
import type { RegenerationResult } from './regen/engine'
import { localRegenerator, type Regenerator } from './regen/regenerator'

export interface EngineState {
  doc: CadDocument
  regen?: RegenerationResult
  /** Regenerating a newer version than `regen` shows. */
  regenerating: boolean
  /** Kernel or engine error of the last regeneration attempt (not a feature failure). */
  regenError?: CadErrorInfo
  canUndo: boolean
  canRedo: boolean
  undoLabel?: string
  redoLabel?: string
}

export interface EngineOptions {
  kernel: GeometryKernel
  /** Where regeneration runs; default in-process with the kernel (the browser passes the worker's). */
  regenerator?: Regenerator
  document?: CadDocument
  clock?: () => string
}

export interface BodySnapshot {
  bodyId: string
  valid: boolean
  volume: number
  area: number
  boundingBox: { min: number[]; max: number[] }
  faces: number
}

export interface DryRunResult {
  ok: boolean
  error?: CadErrorInfo
  failedIndex?: number
  baseVersion: number
  predictedVersion?: number
  affected?: Affected
  results?: { command: string; result: Record<string, unknown> }[]
  before: { bodies: BodySnapshot[]; failures: ReturnType<typeof failures> }
  after?: { bodies: BodySnapshot[]; failures: ReturnType<typeof failures>; ok: boolean }
}

/**
 * The CAD engine: one document with history, regeneration through a kernel, dry runs and queries.
 * The tool's view and the assistant both drive the model through this object (ADR-0023).
 */
export class CadEngine {
  private history: DocumentHistory
  private readonly regenerator: Regenerator
  private regen?: RegenerationResult
  private regenError?: CadErrorInfo
  private pending = 0
  private chain: Promise<unknown> = Promise.resolve()
  private readonly listeners = new Set<() => void>()
  private snapshot: EngineState
  readonly kernel: GeometryKernel

  constructor(private readonly options: EngineOptions) {
    this.kernel = options.kernel
    this.regenerator = options.regenerator ?? localRegenerator(options.kernel)
    this.history = new DocumentHistory(options.document ?? createDocument(), { clock: options.clock })
    this.snapshot = this.buildState()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  getState(): EngineState {
    return this.snapshot
  }
  get document(): CadDocument {
    return this.history.document
  }
  get regeneration(): RegenerationResult | undefined {
    return this.regen
  }
  operations(limit = 100): OperationLogEntry[] {
    return this.history.operations(limit)
  }

  private buildState(): EngineState {
    return {
      doc: this.history.document,
      regen: this.regen,
      regenerating: this.pending > 0,
      regenError: this.regenError,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      undoLabel: this.history.undoLabel,
      redoLabel: this.history.redoLabel,
    }
  }
  private emit() {
    this.snapshot = this.buildState()
    this.listeners.forEach((l) => l())
  }

  /** Regenerates the current document (queued; later calls see later versions). */
  regenerate(options: { full?: boolean } = {}): Promise<RegenerationResult | undefined> {
    this.pending++
    this.emit()
    const run = this.chain.then(async () => {
      try {
        if (options.full) await this.regenerator.clear()
        const doc = this.history.document
        if (this.regen && this.regen.documentVersion === doc.version && this.regen.documentId === doc.documentId && !options.full) return this.regen
        const result = await this.regenerator.regenerate(doc, { evict: true })
        // A newer version may have been committed meanwhile; the next queued run handles it.
        if (result.documentVersion === this.history.document.version) {
          this.regen = result
          this.regenError = undefined
        }
        return result
      } catch (e) {
        this.regenError = toErrorInfo(e)
        return undefined
      } finally {
        this.pending--
        this.emit()
      }
    })
    this.chain = run.catch(() => undefined)
    return run
  }

  /** Executes a transaction and regenerates. The result includes the regeneration of the new version. */
  async execute(tx: Transaction): Promise<ExecuteResult & { regeneration?: RegenerationResult }> {
    const result = this.history.execute(tx)
    this.emit()
    if (!result.ok) return result
    const regeneration = await this.regenerate()
    return { ...result, regeneration }
  }

  async undo(source: CommandSource = 'user', expectedVersion?: number) {
    const r = this.history.undo(source, expectedVersion)
    this.emit()
    await this.regenerate()
    return r
  }
  async redo(source: CommandSource = 'user', expectedVersion?: number) {
    const r = this.history.redo(source, expectedVersion)
    this.emit()
    await this.regenerate()
    return r
  }

  /** Restores earlier content as a new version (compensating change for an applied proposal). */
  async restore(content: CadDocument, label: string, source: CommandSource, expectedVersion?: number) {
    const r = this.history.restore(content, label, source, expectedVersion)
    this.emit()
    await this.regenerate()
    return r
  }

  /** Replaces the document (open, new). Undo history starts again. */
  async open(doc: CadDocument): Promise<RegenerationResult | undefined> {
    const problems = validateDocument(doc)
    if (problems.length) throw new CadError('invalid-document', problems.join(' '), { problems })
    this.history = new DocumentHistory(structuredClone(doc), { clock: this.options.clock })
    this.regen = undefined
    this.emit()
    return this.regenerate()
  }

  /** Executes a transaction on a copy and regenerates it; nothing is committed (brief §9.3 preview). */
  async dryRun(tx: Transaction): Promise<DryRunResult> {
    const before = await this.regenerate()
    const snap = (r?: RegenerationResult): BodySnapshot[] =>
      (r?.parts ?? []).flatMap((p) => p.bodies.map((b) => ({ bodyId: b.bodyId, valid: b.analysis.valid, volume: b.analysis.volume, area: b.analysis.area, boundingBox: b.analysis.boundingBox, faces: b.analysis.counts.faces })))
    const base = { baseVersion: this.history.version, before: { bodies: snap(before), failures: failures(before) } }
    const outcome = applyTransaction(this.history.document, tx)
    if (!outcome.ok) return { ...base, ok: false, error: outcome.error, failedIndex: outcome.failedIndex }
    let predicted: RegenerationResult
    try {
      predicted = await this.chain.then(() => this.regenerator.regenerate(outcome.doc, { evict: false }))
    } catch (e) {
      return { ...base, ok: false, error: toErrorInfo(e), predictedVersion: outcome.version }
    }
    return {
      ...base,
      ok: true,
      predictedVersion: outcome.version,
      affected: outcome.affected,
      results: outcome.results.map((r) => ({ command: r.command, result: r.result })),
      after: { bodies: snap(predicted), failures: failures(predicted), ok: predicted.ok },
    }
  }

  /** Runs a named query (QUERIES) against the current state. */
  query(name: string, input: Record<string, unknown> = {}): unknown {
    const spec = QUERIES.find((q) => q.name === name)
    if (!spec) throw new CadError('unknown-command', `Unknown query “${name}”. Available: ${QUERIES.map((q) => q.name).join(', ')}.`)
    const problems = validateSchema(spec.input, input)
    if (problems.length) throw new CadError('invalid-input', `${name}: ${problems.join('; ')}.`)
    return spec.run({ doc: this.history.document, regen: this.regen, operations: (l) => this.history.operations(l) }, input)
  }

  /** STEP AP242 text of a part's bodies, from the current regenerated version. */
  async exportStep(partId?: string, options: { color?: string } = {}): Promise<{ text: string; version: number; partId: string; bodies: string[] }> {
    const regen = await this.regenerate()
    const doc = this.history.document
    const id = partId ?? doc.parts[0]?.id
    if (!id) throw new CadError('not-found', 'The document has no part to export.')
    const part = findPart(doc, id)
    const pr = regen?.parts.find((p) => p.partId === id)
    if (!pr || !pr.bodies.length) throw new CadError('precondition-failed', `${part.name} has no solid body to export.`)
    const multi = pr.bodies.length > 1
    const text = await this.kernel.exportStep(
      pr.bodies.map((b, i) => ({ shape: b.shape, name: multi ? `${part.name} – ${b.name || `Body ${i + 1}`}` : part.name, color: options.color })),
      { unit: 'mm' },
    )
    return { text, version: regen!.documentVersion, partId: id, bodies: pr.bodies.map((b) => b.bodyId) }
  }

  /** STEP export of a part, imported again and compared with the native bodies (solid count, bounding box, volume). */
  async exportStepWithReadBack(partId?: string, options: { color?: string } = {}): Promise<{ text: string; version: number; partId: string; bodies: string[]; readBack: StepReadBack }> {
    const out = await this.exportStep(partId, options)
    const pr = this.regen!.parts.find((p) => p.partId === out.partId)!
    const readBack = await readBackStep(this.kernel, out.text, pr.bodies.map((b) => b.analysis))
    return { ...out, readBack }
  }

  /** Mesh of a body for display (face indices map to stable face names in the analysis). */
  async mesh(bodyId: string, options?: { tolerance?: number; angularTolerance?: number }): Promise<MeshData> {
    const body = this.regen?.parts.flatMap((p) => p.bodies).find((b) => b.bodyId === bodyId)
    if (!body) throw new CadError('not-found', `Body ${bodyId} is not in the current regeneration.`)
    return this.kernel.mesh(body.shape, options)
  }

  async dispose(): Promise<void> {
    await this.regenerator.clear().catch(() => undefined)
  }
}

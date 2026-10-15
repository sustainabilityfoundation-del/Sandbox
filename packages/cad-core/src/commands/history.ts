import { CadError, type CadErrorInfo } from '../errors'
import type { CadDocument } from '../model/types'
import { applyTransaction, type CommandResult } from './executor'
import type { Affected, CommandCall, CommandSource, Transaction } from './types'

export interface OperationLogEntry {
  sequence: number
  kind: 'transaction' | 'undo' | 'redo' | 'open' | 'rejected'
  label: string
  source: CommandSource
  baseVersion: number
  version: number
  commands: CommandCall[]
  affected: Affected
  error?: CadErrorInfo
  /** ISO time; informational only (never used for IDs or results). */
  at: string
}

export type ExecuteResult =
  | { ok: true; version: number; baseVersion: number; results: CommandResult[]; affected: Affected; refs: Record<string, string> }
  | { ok: false; error: CadErrorInfo; failedIndex: number; failedCommand?: string; version: number }

/**
 * A document with undo/redo stacks and a complete operation log. Undo and redo are versioned
 * transitions: they restore content but always increase the version, so stale edits are detected.
 */
export class DocumentHistory {
  private current: CadDocument
  private readonly undoStack: { doc: CadDocument; label: string }[] = []
  private readonly redoStack: { doc: CadDocument; label: string }[] = []
  private readonly log: OperationLogEntry[] = []
  private sequence = 0

  constructor(
    doc: CadDocument,
    private readonly options: { maxUndo?: number; maxLog?: number; clock?: () => string } = {},
  ) {
    this.current = doc
    this.record({ kind: 'open', label: 'Open document', source: 'system', baseVersion: doc.version, version: doc.version, commands: [], affected: { created: [], modified: [], deleted: [] } })
  }

  get document(): CadDocument {
    return this.current
  }
  get version(): number {
    return this.current.version
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }
  get undoLabel(): string | undefined {
    return this.undoStack.at(-1)?.label
  }
  get redoLabel(): string | undefined {
    return this.redoStack.at(-1)?.label
  }
  operations(limit = 100): OperationLogEntry[] {
    return this.log.slice(-limit)
  }

  /** Executes a transaction; on success it becomes the current document and can be undone. */
  execute(tx: Transaction): ExecuteResult {
    const outcome = applyTransaction(this.current, tx)
    const label = tx.label ?? describe(tx.commands)
    const source = tx.source ?? 'user'
    if (!outcome.ok) {
      this.record({ kind: 'rejected', label, source, baseVersion: this.current.version, version: this.current.version, commands: tx.commands, affected: { created: [], modified: [], deleted: [] }, error: outcome.error })
      return { ok: false, error: outcome.error, failedIndex: outcome.failedIndex, failedCommand: outcome.failedCommand, version: this.current.version }
    }
    this.undoStack.push({ doc: this.current, label })
    if (this.undoStack.length > (this.options.maxUndo ?? 200)) this.undoStack.shift()
    this.redoStack.length = 0
    this.current = outcome.doc
    this.record({ kind: 'transaction', label, source, baseVersion: outcome.baseVersion, version: outcome.version, commands: tx.commands, affected: outcome.affected })
    return { ok: true, version: outcome.version, baseVersion: outcome.baseVersion, results: outcome.results, affected: outcome.affected, refs: outcome.refs }
  }

  undo(source: CommandSource = 'user', expectedVersion?: number): { version: number; label: string } {
    if (expectedVersion !== undefined && expectedVersion !== this.current.version) throw new CadError('version-conflict', `Expected version ${expectedVersion}, current version ${this.current.version}.`)
    const entry = this.undoStack.pop()
    if (!entry) throw new CadError('nothing-to-undo', 'There is nothing to undo.')
    this.redoStack.push({ doc: this.current, label: entry.label })
    return this.transition(entry.doc, 'undo', `Undo ${entry.label}`, source)
  }

  redo(source: CommandSource = 'user', expectedVersion?: number): { version: number; label: string } {
    if (expectedVersion !== undefined && expectedVersion !== this.current.version) throw new CadError('version-conflict', `Expected version ${expectedVersion}, current version ${this.current.version}.`)
    const entry = this.redoStack.pop()
    if (!entry) throw new CadError('nothing-to-redo', 'There is nothing to redo.')
    this.undoStack.push({ doc: this.current, label: entry.label })
    return this.transition(entry.doc, 'redo', `Redo ${entry.label}`, source)
  }

  /** Restores the content of an earlier document state as a new version (for compensating undo). */
  restore(content: CadDocument, label: string, source: CommandSource, expectedVersion?: number): { version: number } {
    if (expectedVersion !== undefined && expectedVersion !== this.current.version) throw new CadError('version-conflict', `Expected version ${expectedVersion}, current version ${this.current.version}.`)
    this.undoStack.push({ doc: this.current, label })
    this.redoStack.length = 0
    return this.transition(content, 'transaction', label, source)
  }

  private transition(content: CadDocument, kind: OperationLogEntry['kind'], label: string, source: CommandSource) {
    const baseVersion = this.current.version
    const version = baseVersion + 1
    this.current = { ...content, version, nextId: Math.max(content.nextId, this.current.nextId) }
    this.record({ kind, label, source, baseVersion, version, commands: [], affected: { created: [], modified: [], deleted: [] } })
    return { version, label }
  }

  private record(entry: Omit<OperationLogEntry, 'sequence' | 'at'>) {
    this.log.push({ ...entry, sequence: ++this.sequence, at: this.options.clock?.() ?? new Date().toISOString() })
    if (this.log.length > (this.options.maxLog ?? 1000)) this.log.shift()
  }
}

export function describe(commands: CommandCall[]): string {
  if (!commands.length) return 'Empty transaction'
  const names = commands.map((c) => c.command.replace(/_/g, ' '))
  return names.length === 1 ? capital(names[0]) : `${capital(names[0])} and ${names.length - 1} more`
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

import { CadError, toErrorInfo, type CadErrorInfo } from '../errors'
import { validateSchema } from '../model/jsonSchema'
import type { CadDocument } from '../model/types'
import { deepClone } from '../util'
import { COMMAND_INDEX } from './registry'
import type { Affected, CommandCall, CommandContext, Transaction } from './types'

export interface CommandResult {
  command: string
  result: Record<string, unknown>
  affected: Affected
}

export type TransactionOutcome =
  | { ok: true; doc: CadDocument; baseVersion: number; version: number; results: CommandResult[]; affected: Affected; refs: Record<string, string> }
  | { ok: false; error: CadErrorInfo; failedIndex: number; failedCommand?: string; baseVersion: number }

const PLACEHOLDER = /^\$[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_]+)*$/

/**
 * Applies a transaction (ADR-0023): validates each command's input against its schema, checks the
 * expected version, applies the commands in order on a working copy and commits all of them or none.
 * Pure and deterministic: the same document and commands always give the same result.
 */
export function applyTransaction(doc: CadDocument, tx: Transaction): TransactionOutcome {
  const baseVersion = doc.version
  if (tx.expectedVersion !== undefined && tx.expectedVersion !== doc.version) {
    return {
      ok: false,
      failedIndex: -1,
      baseVersion,
      error: { code: 'version-conflict', message: `The model changed: expected version ${tx.expectedVersion}, current version ${doc.version}. Re-read the model and try again.`, details: { expectedVersion: tx.expectedVersion, currentVersion: doc.version } },
    }
  }
  if (!Array.isArray(tx.commands) || !tx.commands.length) return { ok: false, failedIndex: -1, baseVersion, error: { code: 'invalid-input', message: 'A transaction needs at least one command.' } }
  if (tx.commands.length > 500) return { ok: false, failedIndex: -1, baseVersion, error: { code: 'invalid-input', message: 'A transaction may contain at most 500 commands.' } }

  const work = deepClone(doc)
  const results: CommandResult[] = []
  const total: Affected = { created: [], modified: [], deleted: [] }
  const refs: Record<string, string> = {}
  const outputs: Record<string, Record<string, unknown>> = {}

  for (let index = 0; index < tx.commands.length; index++) {
    const call = tx.commands[index] as CommandCall
    try {
      const spec = COMMAND_INDEX.get(call?.command)
      if (!spec) throw new CadError('unknown-command', `Unknown command “${call?.command}”.`, { available: [...COMMAND_INDEX.keys()] })
      const input = substitute(call.input ?? {}, refs, outputs) as Record<string, unknown>
      const problems = validateSchema(spec.input, input)
      if (problems.length) throw new CadError('invalid-input', `${spec.name}: ${problems.join('; ')}.`, { problems })
      const affected: Affected = { created: [], modified: [], deleted: [] }
      const ctx: CommandContext = {
        doc: work,
        newId: (prefix) => `${prefix}-${work.nextId++}`,
        created: (...ids) => affected.created.push(...ids),
        modified: (...ids) => affected.modified.push(...ids),
        deleted: (...ids) => affected.deleted.push(...ids),
      }
      const result = spec.apply(ctx, input)
      const placeholder = typeof input.ref === 'string' ? input.ref : undefined
      if (placeholder) {
        if (refs[placeholder]) throw new CadError('invalid-input', `Placeholder ${placeholder} is used twice in this transaction.`)
        const primary = Object.values(result).find((v) => typeof v === 'string') as string | undefined
        if (primary) refs[placeholder] = primary
        outputs[placeholder] = result
      }
      results.push({ command: spec.name, result, affected: dedupe(affected) })
      total.created.push(...affected.created)
      total.modified.push(...affected.modified)
      total.deleted.push(...affected.deleted)
    } catch (e) {
      return { ok: false, failedIndex: index, failedCommand: call?.command, baseVersion, error: toErrorInfo(e) }
    }
  }
  work.version = doc.version + 1
  const affected = dedupe(total)
  // Created-then-deleted entities and modifications of created ones collapse.
  affected.modified = affected.modified.filter((x) => !affected.created.includes(x) && !affected.deleted.includes(x))
  return { ok: true, doc: work, baseVersion, version: work.version, results, affected, refs }
}

function dedupe(a: Affected): Affected {
  return { created: [...new Set(a.created)], modified: [...new Set(a.modified)], deleted: [...new Set(a.deleted)] }
}

/** Replaces "$name" (and "$name.field[.index]") strings with IDs created earlier in the transaction. */
function substitute(value: unknown, refs: Record<string, string>, outputs: Record<string, Record<string, unknown>>): unknown {
  if (typeof value === 'string' && PLACEHOLDER.test(value)) {
    const [head, ...path] = value.split('.')
    if (!path.length) {
      if (refs[head]) return refs[head]
      // A "ref" field defining a new placeholder is left as is.
      return value
    }
    let current: unknown = outputs[head]
    for (const key of path) current = current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined
    if (typeof current !== 'string') throw new CadError('invalid-input', `Placeholder ${value} does not resolve to an ID.`)
    return current
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, refs, outputs))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'ref' ? v : substitute(v, refs, outputs)]))
  return value
}

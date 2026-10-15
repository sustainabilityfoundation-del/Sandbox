import { refId, type Model } from '../model/model'
import { semanticsOf } from '../semantics/semantics'
import { diagnosticKey, type Diagnostic } from '../validation/diagnostic'
import { validate } from '../validation/validate'
import { diffModels, describeSummary, summarizeChanges, type ChangeSummaryItem, type ElementChange } from './changes'
import { CommandError, executeCommand, type Command } from './commands'
import { checkCommandShape } from './schemas'

/**
 * Transactions (ADR-0034): a list of commands applied atomically to a working copy, followed by
 * semantic validation of the affected elements. The base model is never modified; the caller
 * (repository, local client) commits `model` and `changes` if it wants to.
 */

export type ValidationPolicy = 'report' | 'reject-new-errors'

export interface TransactionInput {
  commands: Command[]
  validationPolicy?: ValidationPolicy
}

export interface DiagnosticsDelta {
  introduced: Diagnostic[]
  resolved: Diagnostic[]
  /** Errors among the affected elements after the change. */
  errorsAfter: number
}

export type TransactionResult =
  | {
      ok: true
      /** The new model state (working copy). */
      model: Model
      changes: ElementChange[]
      summary: ChangeSummaryItem[]
      summaryText: string
      /** Placeholder → element ID, and the main element of each command (by index). */
      createdIds: Record<string, string>
      commandResults: { op: string; elementId?: string }[]
      diagnostics: DiagnosticsDelta
      /** IDs of elements that touched by the change (written set), for concurrency checks. */
      touched: string[]
    }
  | {
      ok: false
      error: { code: 'invalid' | 'not-found' | 'not-allowed' | 'rejected'; message: string; commandIndex?: number; diagnostics?: Diagnostic[] }
      /** For 'rejected': the diagnostics the change would introduce. */
      diagnostics?: DiagnosticsDelta
    }

/** Elements whose validation may change when `changes` are applied: changed ones, their owners and referrers. */
export function affectedElements(before: Model, after: Model, changes: ElementChange[]): Set<string> {
  const out = new Set<string>()
  const sa = semanticsOf(after)
  const sb = semanticsOf(before)
  for (const c of changes) {
    out.add(c.id)
    for (const s of [sa, sb]) {
      let cur = s.owner(c.id)?.['@id']
      for (let k = 0; cur && k < 6; k++) {
        out.add(cur)
        cur = s.owner(cur)?.['@id']
      }
    }
    for (const r of after.referencesTo(c.id)) out.add(r)
    for (const r of before.referencesTo(c.id)) out.add(r)
  }
  // Features typed by a changed type (directly or through its typings) are affected too.
  for (const id of [...out]) for (const r of after.referencesTo(id)) {
    const rel = after.own(r)
    const owner = rel && refId(rel, 'owningRelatedElement')
    if (owner) out.add(owner)
  }
  return out
}

export function diagnosticsDelta(before: Model, after: Model, affected: Set<string>): DiagnosticsDelta {
  const b = validate(before, [...affected].filter((id) => before.own(id)))
  const a = validate(after, [...affected].filter((id) => after.own(id)))
  const bk = new Set(b.map(diagnosticKey))
  const ak = new Set(a.map(diagnosticKey))
  return { introduced: a.filter((x) => !bk.has(diagnosticKey(x))), resolved: b.filter((x) => !ak.has(diagnosticKey(x))), errorsAfter: a.filter((x) => x.severity === 'error').length }
}

export function applyTransaction(base: Model, input: TransactionInput): TransactionResult {
  if (!Array.isArray(input.commands) || !input.commands.length) return { ok: false, error: { code: 'invalid', message: 'A transaction needs at least one command.' } }
  const model = base.clone()
  const placeholders = new Map<string, string>()
  const commandResults: { op: string; elementId?: string }[] = []
  for (const [k, cmd] of input.commands.entries()) {
    try {
      const shape = checkCommandShape(cmd)
      if (shape) throw new CommandError('invalid', shape)
      const r = executeCommand({ model, base, placeholders }, cmd)
      commandResults.push({ op: cmd.op, elementId: r.elementId })
    } catch (e) {
      if (e instanceof CommandError) return { ok: false, error: { code: e.code, message: `Command ${k + 1} (${(cmd as { op?: string }).op}): ${e.message}`, commandIndex: k, diagnostics: e.diagnostics } }
      throw e
    }
  }
  const changes = diffModels(base, model)
  // Referential integrity: nothing may refer to a deleted element.
  const s = semanticsOf(model)
  for (const c of changes) {
    if (c.kind !== 'deleted') continue
    const refs = model.referencesTo(c.id).filter((r) => model.own(r))
    if (refs.length) return { ok: false, error: { code: 'not-allowed', message: `The change would leave ${s.label(refs[0])} referring to a deleted element.` } }
  }
  const affected = affectedElements(base, model, changes)
  const diagnostics = diagnosticsDelta(base, model, affected)
  const newErrors = diagnostics.introduced.filter((d) => d.severity === 'error')
  if (input.validationPolicy === 'reject-new-errors' && newErrors.length) {
    return { ok: false, error: { code: 'rejected', message: `The change would introduce ${newErrors.length} validation error${newErrors.length === 1 ? '' : 's'}: ${newErrors[0].message}`, diagnostics: newErrors }, diagnostics }
  }
  const summary = summarizeChanges(base, model, changes)
  const createdIds: Record<string, string> = Object.fromEntries(placeholders)
  return { ok: true, model, changes, summary, summaryText: describeSummary(summary), createdIds, commandResults, diagnostics, touched: changes.map((c) => c.id) }
}

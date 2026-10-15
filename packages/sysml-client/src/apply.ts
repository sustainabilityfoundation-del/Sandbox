import { fromJson, type Model } from '@ews/sysml-core'
import type { TransactionOutcome } from './types'

/**
 * Applies a committed transaction's change set to a loaded model (incremental update; no reload).
 * Returns a new model; the given one is not modified.
 */
export function applyOutcome(model: Model, outcome: Pick<TransactionOutcome, 'changes'>): Model {
  const next = model.clone()
  for (const c of outcome.changes) {
    if (c.kind === 'deleted') next.remove(c.id)
    else if (c.after) next.put(fromJson(c.after))
  }
  return next
}

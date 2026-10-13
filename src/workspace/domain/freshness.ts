import type { ModelIndex } from './modelIndex'
import type { OutputRecord } from './types'

export interface Freshness {
  /** True when any input the output depended on has changed since it was produced. */
  stale: boolean
  reasons: string[]
}

/**
 * Outputs are snapshots. They are never updated in place; instead we compare the
 * input revisions captured at save time with the current model.
 */
export function outputFreshness(output: OutputRecord, model: ModelIndex): Freshness {
  const reasons: string[] = []
  for (const input of output.inputs) {
    const current = model.revisionOf(input.id)
    if (current === undefined) {
      reasons.push(`${input.id} no longer exists`)
    } else if (current !== input.revision) {
      reasons.push(`${model.nameOf(input.id)} (${input.id}) changed: rev ${input.revision} → ${current}`)
    }
  }
  return { stale: reasons.length > 0, reasons }
}

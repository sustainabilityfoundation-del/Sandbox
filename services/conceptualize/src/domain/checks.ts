import { convert, isValidUnit, sameDimension } from './units'

/**
 * Status of an evidence result against a constraint bound (D1-CON, C11). The service computes it from the
 * constraint's bound at the pinned revision; callers never assert it. Semantics follow the calculation engine:
 * `satisfied` and `violated` hold for the whole value set, otherwise `uncertain`.
 *
 * - point: a single value; satisfied or violated.
 * - bounds (exact): the range is attained; satisfied if its worst case holds, violated if its best case fails.
 * - bounds (enclosure): the true range lies inside; the same proofs hold (worst case inside the enclosure).
 * - sampled-range: values seen, not a proven range; never `satisfied` and never `violated` everywhere.
 */

export type ResultKind = 'point' | 'sampled-range' | 'bounds'
export interface ResultQualification {
  kind: ResultKind
  quality?: 'exact' | 'enclosure'
  note?: string
}
export interface BoundLike {
  operator: '<=' | '<' | '=' | '>=' | '>' | 'in-range'
  quantity: { value?: number | null; min?: number | null; max?: number | null; unit: string }
}
export interface CheckOutcome {
  status: 'satisfied' | 'violated' | 'uncertain'
  /** For points: distance to the bound in the bound's unit, positive when satisfied. */
  margin?: number
  unit: string
}

const REL = 1e-9
const eq = (a: number, b: number) => Math.abs(a - b) <= REL * Math.max(1, Math.abs(a), Math.abs(b))

/** Whether a single value satisfies the bound. */
function holds(v: number, b: BoundLike): boolean {
  const q = b.quantity
  switch (b.operator) {
    case '<=':
      return v <= (q.value ?? q.max!) || eq(v, (q.value ?? q.max!))
    case '<':
      return v < (q.value ?? q.max!)
    case '>=':
      return v >= (q.value ?? q.min!) || eq(v, (q.value ?? q.min!))
    case '>':
      return v > (q.value ?? q.min!)
    case '=':
      return eq(v, q.value!)
    case 'in-range':
      return (q.min == null || v >= q.min || eq(v, q.min)) && (q.max == null || v <= q.max || eq(v, q.max))
  }
}

/** Throws a message when the result cannot be compared with the bound (unit dimension, missing values). */
export function checkAgainstBound(result: { value?: number | null; min?: number | null; max?: number | null; unit: string }, qualification: ResultQualification, bound: BoundLike): CheckOutcome {
  const to = bound.quantity.unit
  if (!isValidUnit(result.unit) || !isValidUnit(to)) throw new Error(`unknown unit ${result.unit} or ${to}`)
  if (!sameDimension(result.unit, to)) throw new Error(`${result.unit} cannot be compared with ${to}`)
  const c = (x: number | null | undefined) => (x == null ? null : convert(x, result.unit, to))
  if (qualification.kind === 'point') {
    const v = c(result.value)
    if (v == null) throw new Error('a point result needs a value')
    const ok = holds(v, bound)
    const q = bound.quantity
    const ref = bound.operator === '<=' || bound.operator === '<' ? (q.value ?? q.max) : bound.operator === '>=' || bound.operator === '>' ? (q.value ?? q.min) : null
    const margin = ref == null ? undefined : bound.operator.startsWith('<') ? ref - v : v - ref
    return { status: ok ? 'satisfied' : 'violated', ...(margin !== undefined ? { margin } : {}), unit: to }
  }
  const lo = c(result.min)
  const hi = c(result.max)
  if (lo == null || hi == null || lo > hi) throw new Error('a range result needs min ≤ max')
  if (qualification.kind === 'sampled-range') return { status: 'uncertain', unit: to }
  if (qualification.kind === 'bounds' && (qualification.quality === 'exact' || qualification.quality === 'enclosure')) {
    if (holds(lo, bound) && holds(hi, bound)) {
      // Monotone bounds: every value between lo and hi holds when both ends hold (all operators are intervals).
      return { status: 'satisfied', unit: to }
    }
    // Violated everywhere when no value of [lo, hi] can hold.
    const q = bound.quantity
    const everywhereViolated =
      (bound.operator === '<=' && lo > (q.value ?? q.max!) && !eq(lo, (q.value ?? q.max!))) ||
      (bound.operator === '<' && lo >= (q.value ?? q.max!)) ||
      (bound.operator === '>=' && hi < (q.value ?? q.min!) && !eq(hi, (q.value ?? q.min!))) ||
      (bound.operator === '>' && hi <= (q.value ?? q.min!)) ||
      (bound.operator === 'in-range' && ((q.max != null && lo > q.max) || (q.min != null && hi < q.min)))
    return { status: everywhereViolated ? 'violated' : 'uncertain', unit: to }
  }
  return { status: 'uncertain', unit: to }
}

import type { TradeStudyRecord } from './contract/conceptualize'

/**
 * Pareto dominance over a trade study's criteria (exploration.md §3), with interval scores. Option A
 * dominates B on a criterion set when A is at least as good on every criterion and better on one.
 * With ranges: "robust" when it holds for the interval bounds (A's worst ≥ B's best), "possible" when
 * it holds for nominal values only. Missing scores make dominance undecidable for that pair.
 */

interface Interval {
  lo: number
  hi: number
  nominal: number
  /** C11: true when the range is a sampled range from a calculation (not a bound). */
  sampled: boolean
}

export interface ParetoResult {
  criteria: string[]
  /** Options not dominated (nominal values). */
  paretoSet: string[]
  dominated: { conceptId: string; by: string; strength: 'robust' | 'possible' }[]
  undecided: { a: string; b: string; reason: string }[]
  method: string
}

function goodness(study: TradeStudyRecord, criterionId: string, conceptId: string): Interval | undefined {
  const c = study.criteria.find((x) => x.id === criterionId)!
  const s = study.scores.find((x) => x.criterionId === criterionId && x.conceptId === conceptId)
  if (!s) return undefined
  const lo = s.qualitative ?? s.low ?? s.value
  const hi = s.qualitative ?? s.high ?? s.value
  const nominal = s.qualitative ?? s.value ?? (lo !== undefined && hi !== undefined ? (lo + hi) / 2 : undefined)
  if (lo === undefined || hi === undefined || nominal === undefined) return undefined
  // Orient so that larger is better. Qualitative 1–5 already means very poor … very good.
  const sampled = s.qualification?.kind === 'sampled-range'
  return c.direction === 'maximize' || s.qualitative !== undefined ? { lo, hi, nominal, sampled } : { lo: -hi, hi: -lo, nominal: -nominal, sampled }
}

export function paretoAnalysis(study: TradeStudyRecord, criterionIds: string[] = study.criteria.map((c) => c.id)): ParetoResult {
  const dominated: ParetoResult['dominated'] = []
  const undecided: ParetoResult['undecided'] = []
  const options = study.options
  for (const b of options) {
    for (const a of options) {
      if (a === b) continue
      const pairs = criterionIds.map((c) => [goodness(study, c, a), goodness(study, c, b)] as const)
      if (pairs.some(([x, y]) => !x || !y)) {
        if (!undecided.some((u) => (u.a === a && u.b === b) || (u.a === b && u.b === a))) undecided.push({ a, b, reason: 'missing scores' })
        continue
      }
      const nominalDominates = pairs.every(([x, y]) => x!.nominal >= y!.nominal) && pairs.some(([x, y]) => x!.nominal > y!.nominal)
      if (!nominalDominates) continue
      // C11: robust dominance needs bounds (or stated ranges); a sampled range is not a bound.
      const robust = pairs.every(([x, y]) => !x!.sampled && !y!.sampled) && pairs.every(([x, y]) => x!.lo >= y!.hi) && pairs.some(([x, y]) => x!.lo > y!.hi)
      const prior = dominated.find((d) => d.conceptId === b)
      if (!prior) dominated.push({ conceptId: b, by: a, strength: robust ? 'robust' : 'possible' })
      else if (robust && prior.strength === 'possible') Object.assign(prior, { by: a, strength: 'robust' })
    }
  }
  return {
    criteria: criterionIds,
    paretoSet: options.filter((o) => !dominated.some((d) => d.conceptId === o)),
    dominated,
    undecided,
    method: 'Pareto dominance on nominal scores; "robust" when it also holds for the score ranges and none of them is a sampled range (C11: sampled ranges are not bounds). Weighted sums are reported alongside because they cannot find non-convex trade-offs.',
  }
}

/**
 * Multicriteria trade-study evaluation (brief §5). Deterministic and documented:
 *
 * - Quantity criteria: each option's value or range [low, high] (in the criterion unit) is normalized
 *   to 0–1 over the span of all options' values (1 = best, according to `direction`). If every option
 *   has the same value the criterion does not discriminate and every option gets 1.
 * - Qualitative criteria: 1–5 → 0, 0.25, 0.5, 0.75, 1.
 * - Option score = Σ weight·normalized / Σ weight over the criteria scored for that option, with a
 *   range from the low and high ends of every interval (uncertainty propagation by interval bounds).
 *   `coverage` is the share of total weight that was scored; missing scores are reported, not guessed.
 * - The ranking is "robust" only when the best option's low bound exceeds every other option's high
 *   bound; otherwise the uncertainty ranges overlap and the ranking is "uncertain".
 * - Results are always preliminary unless every score has basis `evidence`.
 */
import type { Basis } from './rules'

export interface CriterionInput {
  id: string
  name: string
  weight: number
  direction: 'maximize' | 'minimize'
  scale: 'quantity' | 'qualitative'
  unit?: string | null
}

export interface ScoreInput {
  criterionId: string
  conceptId: string
  value?: number | null
  low?: number | null
  high?: number | null
  qualitative?: number | null
  basis: Basis
  qualification?: { kind: 'point' | 'sampled-range' | 'bounds'; quality?: 'exact' | 'enclosure' } | null
}

export interface OptionResult {
  conceptId: string
  score: number | null
  low: number | null
  high: number | null
  coverage: number
  missing: string[]
  rank: number | null
  bases: Partial<Record<Basis, number>>
  normalized: Record<string, { low: number; high: number } | null>
}

export interface StudyResult {
  options: OptionResult[]
  ranking: 'robust' | 'uncertain' | 'incomplete'
  preliminary: boolean
  method: string
  /** C11 (Q6): how the score ranges are qualified. */
  qualifications: { points: number; exactBounds: number; enclosures: number; sampledRanges: number; statedRanges: number; robustnessNote?: string }
}

export const TRADE_METHOD =
  'Weighted sum of normalized scores (0–1, 1 = best). Quantities are normalized over the span of all options; qualitative scores 1–5 map to 0–1. Ranges propagate as interval bounds. Coverage = scored weight / total weight.'

const interval = (s: ScoreInput): [number, number] | null => {
  if (s.qualitative != null) {
    const n = (s.qualitative - 1) / 4
    return [n, n]
  }
  const lo = s.low ?? s.value
  const hi = s.high ?? s.value
  if (lo == null || hi == null) return null
  return [Math.min(lo, hi), Math.max(lo, hi)]
}

export function evaluateStudy(criteria: CriterionInput[], optionIds: string[], scores: ScoreInput[]): StudyResult {
  const byKey = new Map(scores.map((s) => [`${s.criterionId}|${s.conceptId}`, s]))
  const totalWeight = criteria.reduce((a, c) => a + c.weight, 0)
  const normalized = new Map<string, { low: number; high: number } | null>()
  for (const c of criteria) {
    const raw = optionIds.map((o) => {
      const s = byKey.get(`${c.id}|${o}`)
      return s ? interval(s) : null
    })
    if (c.scale === 'qualitative') {
      optionIds.forEach((o, i) => normalized.set(`${c.id}|${o}`, raw[i] ? { low: raw[i]![0], high: raw[i]![1] } : null))
      continue
    }
    const ends = raw.flatMap((r) => (r ? r : []))
    const min = Math.min(...ends)
    const max = Math.max(...ends)
    optionIds.forEach((o, i) => {
      const r = raw[i]
      if (!r) return normalized.set(`${c.id}|${o}`, null)
      if (max === min) return normalized.set(`${c.id}|${o}`, { low: 1, high: 1 })
      const n = (x: number) => (c.direction === 'maximize' ? (x - min) / (max - min) : (max - x) / (max - min))
      const a = n(r[0])
      const b = n(r[1])
      normalized.set(`${c.id}|${o}`, { low: Math.min(a, b), high: Math.max(a, b) })
    })
  }
  const options: OptionResult[] = optionIds.map((o) => {
    let w = 0
    let lo = 0
    let hi = 0
    const missing: string[] = []
    const bases: Partial<Record<Basis, number>> = {}
    const norm: Record<string, { low: number; high: number } | null> = {}
    for (const c of criteria) {
      const n = normalized.get(`${c.id}|${o}`) ?? null
      norm[c.id] = n
      const s = byKey.get(`${c.id}|${o}`)
      if (s && n) bases[s.basis] = (bases[s.basis] ?? 0) + 1
      if (!n) {
        missing.push(c.name)
        continue
      }
      w += c.weight
      lo += c.weight * n.low
      hi += c.weight * n.high
    }
    const has = w > 0
    return {
      conceptId: o,
      score: has ? round((lo + hi) / 2 / w) : null,
      low: has ? round(lo / w) : null,
      high: has ? round(hi / w) : null,
      coverage: totalWeight > 0 ? round(w / totalWeight) : 0,
      missing,
      rank: null,
      bases,
      normalized: norm,
    }
  })
  const ranked = options.filter((o) => o.score !== null).sort((a, b) => b.score! - a.score!)
  ranked.forEach((o, i) => (o.rank = i + 1))
  // C11 (Q6): a sampled range is not a bound, so it cannot make a ranking robust; enclosures can (sound bounds).
  const q = { points: 0, exactBounds: 0, enclosures: 0, sampledRanges: 0, statedRanges: 0 }
  for (const s of scores) {
    if (s.qualification?.kind === 'sampled-range') q.sampledRanges++
    else if (s.qualification?.kind === 'bounds') s.qualification.quality === 'exact' ? q.exactBounds++ : q.enclosures++
    else if (s.low != null && s.high != null && s.low !== s.high) q.statedRanges++
    else q.points++
  }
  let ranking: StudyResult['ranking'] = 'incomplete'
  let robustnessNote: string | undefined
  if (ranked.length >= 2 && options.every((o) => o.coverage === 1)) {
    const [best, ...rest] = ranked
    const separate = rest.every((o) => best.low! > o.high!)
    ranking = separate && q.sampledRanges === 0 ? 'robust' : 'uncertain'
    if (separate && q.sampledRanges) robustnessNote = 'The score ranges separate, but some are sampled ranges (not bounds), so robustness is not proven.'
  }
  const preliminary = !scores.length || scores.some((s) => s.basis !== 'evidence')
  return { options, ranking, preliminary, method: TRADE_METHOD, qualifications: { ...q, ...(robustnessNote ? { robustnessNote } : {}) } }
}

const round = (n: number) => Math.round(n * 1000) / 1000

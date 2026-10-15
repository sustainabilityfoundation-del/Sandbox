/**
 * Basis of knowledge (ADR-0043, docs/decisions/0043-basis-of-knowledge-and-promotion.md).
 * Defined here, in the lowest package, because calculation results carry a basis; the reasoning core
 * re-exports it as the canonical type until it is promoted to the SDK (CR-S4).
 */
export type Basis = 'user-assertion' | 'ai-hypothesis' | 'assumption' | 'assessment' | 'estimate' | 'calculated' | 'evidence' | 'decision'

export const BASES: Basis[] = ['ai-hypothesis', 'assumption', 'user-assertion', 'assessment', 'estimate', 'calculated', 'evidence', 'decision']

/** Rank on the ladder; user-assertion ranks with assumption (stated by a person, not verified). */
export const BASIS_RANK: Record<Basis, number> = {
  'ai-hypothesis': 0,
  assumption: 1,
  'user-assertion': 1,
  assessment: 2,
  estimate: 3,
  calculated: 4,
  evidence: 5,
  decision: 6,
}

/** The lowest basis of a set (a conclusion is never better known than what it rests on). */
export function minBasis(bases: Basis[]): Basis | undefined {
  return bases.reduce<Basis | undefined>((low, b) => (low === undefined || BASIS_RANK[b] < BASIS_RANK[low] ? b : low), undefined)
}

/**
 * Basis of a calculation result (ADR-0043): `calculated` when a person-authored or validated model is
 * evaluated on inputs that are at least assumptions; `estimate` when the model is an unvalidated AI
 * hypothesis or any input is an AI hypothesis.
 */
export function calculationBasis(model: { basis: Basis; validationStatus: string }, inputBases: Basis[]): 'calculated' | 'estimate' {
  if (model.basis === 'ai-hypothesis' && model.validationStatus !== 'validated') return 'estimate'
  if (inputBases.some((b) => b === 'ai-hypothesis')) return 'estimate'
  return 'calculated'
}

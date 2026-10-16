import { describe, expect, it } from 'vitest'
import { checkStatusLabel, limitsText, rangeLabel, sampledWithinLabel } from './calcLabels'

// C11 storage contract §4: the display vocabulary of calculation qualifications.
describe('calculation qualification labels (C11 §4)', () => {
  it('labels points, exact bounds, enclosures and sampled values without merging kinds', () => {
    expect(rangeLabel({ kind: 'point' }, 'kN')).toBe('point value')
    expect(rangeLabel({ kind: 'bounds', quality: 'exact', min: 1, max: 2 }, 'kN')).toBe('exact bounds 1–2 kN')
    expect(rangeLabel({ kind: 'bounds', quality: 'enclosure', min: 1, max: 2 }, 'kN')).toBe('enclosure 1–2 kN (true range may be narrower)')
    expect(rangeLabel({ kind: 'sampled-range', min: 1, max: 2, method: 'vertices', samples: 4, note: '' }, 'kN')).toBe('sampled values 1–2 kN (4 samples; not a bound)')
    expect(sampledWithinLabel({ kind: 'bounds', quality: 'enclosure', min: 0, max: 3, sampled: { kind: 'sampled-range', min: 1, max: 2, method: 'vertices-and-nominal', samples: 5, note: '' } }, 'mm')).toBe('sampled values 1–2 mm (5 samples; not a bound)')
    expect(sampledWithinLabel({ kind: 'point' }, 'mm')).toBeNull()
  })
  it('never shows a range as satisfied unless proven', () => {
    expect(checkStatusLabel('satisfied', 'point')).toBe('satisfied at the nominal point')
    expect(checkStatusLabel('violated', 'exact-bounds')).toBe('violated over the input ranges (proven, exact bounds)')
    expect(checkStatusLabel('satisfied', 'enclosure')).toBe('satisfied over the input ranges (proven from an enclosure)')
    expect(checkStatusLabel('uncertain', 'enclosure')).toBe('uncertain: not proven over the input ranges')
    expect(checkStatusLabel('satisfied', 'sampled')).toBe('uncertain: not proven over the input ranges')
  })
  it('states what a reproducible calculation does not establish', () => {
    expect(limitsText({ establishesModelValidity: false, establishesRequirementSatisfaction: false, modelValidationStatus: 'unvalidated', modelBasis: 'ai-hypothesis' })).toBe(
      'Reproducible calculation. It does not establish that the model is valid for this design (validation status: unvalidated) or that any requirement is satisfied.',
    )
  })
})

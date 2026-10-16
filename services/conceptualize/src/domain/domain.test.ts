import { describe, expect, it } from 'vitest'
import { assess, type AssessmentInput } from './assessment'
import { maturityProblem, wouldCreateCycle } from './rules'
import { evaluateStudy } from './tradeStudy'
import { convert, dimensionName, parseUnit, quantityProblem, sameDimension } from './units'

describe('units and dimensions', () => {
  it('parses prefixed, compound and superscript units', () => {
    expect(parseUnit('kN').factor).toBe(1000)
    expect(dimensionName('N*m')).toBe('energy or torque')
    expect(dimensionName('N·m')).toBe('energy or torque')
    expect(dimensionName('Nm')).toBe('energy or torque')
    expect(dimensionName('m/s^2')).toBe('acceleration')
    expect(dimensionName('kg/m³')).toBe('density')
    expect(dimensionName('W/(m*K)')).toBe('m·kg·s^-3·K^-1')
    expect(dimensionName('-')).toBe('dimensionless')
    expect(dimensionName('EUR')).toBe('currency EUR')
    expect(dimensionName('rpm')).toBe('frequency or rotational speed')
    expect(dimensionName('mm')).toBe('length')
    expect(dimensionName('min')).toBe('time')
  })

  it('converts compatible units and refuses others', () => {
    expect(convert(0.5, 'kN', 'N')).toBeCloseTo(500)
    expect(convert(100, 'mm', 'm')).toBeCloseTo(0.1)
    expect(convert(20, '°C', 'K')).toBeCloseTo(293.15)
    expect(convert(1, 'bar', 'kPa')).toBeCloseTo(100)
    expect(convert(3000, 'rpm', 'Hz')).toBeCloseTo(50)
    expect(() => convert(1, 'N', 'mm')).toThrow(/dimensions differ/)
    expect(sameDimension('EUR', 'USD')).toBe(false)
    expect(() => parseUnit('°C/s')).toThrow(/offset/)
    expect(() => parseUnit('furlong')).toThrow(/Unknown unit/)
  })

  it('validates quantities with ranges and expected dimensions', () => {
    expect(quantityProblem({ value: 500, unit: 'N' })).toBeNull()
    expect(quantityProblem({ min: 0.4, max: 0.7, unit: 'kN' }, 'N')).toBeNull()
    expect(quantityProblem({ unit: 'N' })).toMatch(/value or a range/)
    expect(quantityProblem({ value: 5, min: 6, unit: 'N' })).toMatch(/below min/)
    expect(quantityProblem({ value: 5, unit: 'mm' }, 'N')).toMatch(/length, expected force/)
    expect(quantityProblem({ value: Number.NaN, unit: 'N' })).toMatch(/finite/)
  })
})

describe('relationship cycles', () => {
  it('detects the cycle a new edge would close and reports its path', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]
    expect(wouldCreateCycle(edges, 'c', 'a')).toEqual(['c', 'a', 'b', 'c'])
    expect(wouldCreateCycle(edges, 'a', 'c')).toBeNull()
    expect(wouldCreateCycle(edges, 'x', 'x')).toEqual(['x', 'x'])
  })
})

describe('maturity rules (no mandatory sequence)', () => {
  const base = { implemented: false, verificationStatus: 'not-verified' }
  it('allows going back and forth below the gates', () => {
    expect(maturityProblem({ ...base, from: 'evaluated', to: 'idea', role: 'editor' })).toBeNull()
    expect(maturityProblem({ ...base, from: 'idea', to: 'evaluated', role: 'editor' })).toBeNull()
  })
  it('gates selection and later stages, and needs evidence for implemented and verified', () => {
    expect(maturityProblem({ ...base, from: 'evaluated', to: 'selected', role: 'editor' })?.code).toBe('forbidden')
    expect(maturityProblem({ ...base, from: 'evaluated', to: 'selected', role: 'reviewer' })).toBeNull()
    expect(maturityProblem({ ...base, from: 'selected', to: 'archived', role: 'editor' })?.code).toBe('forbidden')
    expect(maturityProblem({ ...base, from: 'selected', to: 'implemented', role: 'administrator' })?.code).toBe('invalid')
    expect(maturityProblem({ ...base, implemented: true, from: 'selected', to: 'implemented', role: 'administrator' })).toBeNull()
    expect(maturityProblem({ ...base, from: 'implemented', to: 'verified', role: 'administrator' })?.code).toBe('invalid')
  })
})

describe('trade-study evaluation', () => {
  const criteria = [
    { id: 'f', name: 'Force', weight: 2, direction: 'maximize' as const, scale: 'quantity' as const, unit: 'N' },
    { id: 'm', name: 'Mass', weight: 1, direction: 'minimize' as const, scale: 'quantity' as const, unit: 'kg' },
    { id: 'c', name: 'Cost', weight: 1, direction: 'maximize' as const, scale: 'qualitative' as const },
  ]
  it('normalizes, weights and ranks, propagating ranges', () => {
    const r = evaluateStudy(criteria, ['a', 'b'], [
      { criterionId: 'f', conceptId: 'a', value: 600, basis: 'estimate' },
      { criterionId: 'f', conceptId: 'b', low: 400, high: 500, basis: 'estimate' },
      { criterionId: 'm', conceptId: 'a', value: 1, basis: 'estimate' },
      { criterionId: 'm', conceptId: 'b', value: 2, basis: 'estimate' },
      { criterionId: 'c', conceptId: 'a', qualitative: 5, basis: 'ai-hypothesis' },
      { criterionId: 'c', conceptId: 'b', qualitative: 1, basis: 'ai-hypothesis' },
    ])
    const [a, b] = r.options
    expect(a).toMatchObject({ score: 1, low: 1, high: 1, coverage: 1, rank: 1 })
    expect(b.rank).toBe(2)
    expect(b.low).toBe(0)
    expect(b.high).toBeCloseTo(0.25)
    expect(r.ranking).toBe('robust')
    expect(r.preliminary).toBe(true)
    expect(a.bases).toEqual({ estimate: 2, 'ai-hypothesis': 1 })
  })
  it('reports missing scores instead of guessing and marks the ranking incomplete', () => {
    const r = evaluateStudy(criteria, ['a', 'b'], [
      { criterionId: 'f', conceptId: 'a', value: 600, basis: 'evidence' },
      { criterionId: 'f', conceptId: 'b', value: 500, basis: 'evidence' },
    ])
    expect(r.options[0].coverage).toBe(0.5)
    expect(r.options[0].missing).toEqual(['Mass', 'Cost'])
    expect(r.ranking).toBe('incomplete')
    expect(r.preliminary).toBe(false)
    expect(evaluateStudy(criteria, ['a'], []).options[0].score).toBeNull()
  })
  it('overlapping ranges make the ranking uncertain', () => {
    const r = evaluateStudy([criteria[0]], ['a', 'b'], [
      { criterionId: 'f', conceptId: 'a', low: 400, high: 700, basis: 'estimate' },
      { criterionId: 'f', conceptId: 'b', low: 500, high: 600, basis: 'estimate' },
    ])
    expect(r.ranking).toBe('uncertain')
  })
})

describe('maturity assessment', () => {
  const empty: AssessmentInput = {
    maturity: 'idea',
    verificationStatus: 'not-verified',
    description: '',
    purpose: '',
    statements: [],
    childCount: 0,
    interfaceCount: 0,
    alternativeSets: { asParent: 0, asMember: 0, memberCount: 0 },
    tradeStudies: 0,
    scoredTradeStudies: 0,
    decisions: { recorded: 0, accepted: false, proposed: 0 },
    evidence: { preliminary: 0, verified: 0 },
    requirementLinks: 0,
    implementations: { total: 0, inDevelopment: 0, implemented: 0 },
    pendingRealizations: 0,
  }
  it('suggests a maturity from the evidence and lists next steps', () => {
    const a = assess(empty)
    expect(a.suggestedMaturity).toBe('idea')
    expect(a.nextSteps.map((s) => s.id)).toEqual(expect.arrayContaining(['describe', 'purpose', 'decompose', 'constraints']))
    const defined = assess({
      ...empty,
      description: 'A compact actuator that delivers 500 N within 100 mm.',
      purpose: 'Linear force',
      statements: [
        { kind: 'function', basis: 'user-assertion', state: null, hasQuantity: false, confirmed: false },
        { kind: 'constraint', basis: 'ai-hypothesis', state: null, hasQuantity: true, confirmed: false },
        { kind: 'question', basis: 'user-assertion', state: 'open', hasQuantity: false, confirmed: false },
      ],
    })
    expect(defined.suggestedMaturity).toBe('defined')
    expect(defined.counts).toMatchObject({ openQuestions: 1, unconfirmedHypotheses: 1, quantifiedConstraints: 1 })
    expect(defined.nextSteps.find((s) => s.id === 'hypotheses')?.priority).toBe('high')
    expect(assess({ ...empty, decisions: { recorded: 1, accepted: true, proposed: 0 } }).suggestedMaturity).toBe('selected')
  })
})

describe('trade-study qualifications (C11 Q6)', () => {
  const crit = [{ id: 'k', name: 'Mass', weight: 1, direction: 'minimize' as const, scale: 'quantity' as const, unit: 'kg' }]
  const scores = (kind: 'sampled-range' | 'bounds') => [
    { criterionId: 'k', conceptId: 'a', value: 1, low: 0.9, high: 1.1, basis: 'calculated' as const, qualification: { kind, ...(kind === 'bounds' ? { quality: 'enclosure' as const } : {}) } },
    { criterionId: 'k', conceptId: 'b', value: 3, low: 2.9, high: 3.1, basis: 'estimate' as const },
  ]
  it('never ranks robustly on sampled ranges; enclosures may support robustness', () => {
    const sampled = evaluateStudy(crit, ['a', 'b'], scores('sampled-range'))
    expect(sampled.ranking).toBe('uncertain')
    expect(sampled.qualifications).toMatchObject({ sampledRanges: 1, statedRanges: 1, robustnessNote: expect.stringMatching(/not bounds/) })
    const enclosed = evaluateStudy(crit, ['a', 'b'], scores('bounds'))
    expect(enclosed.ranking).toBe('robust')
    expect(enclosed.qualifications).toMatchObject({ enclosures: 1, statedRanges: 1 })
    expect(enclosed.qualifications.robustnessNote).toBeUndefined()
  })
})

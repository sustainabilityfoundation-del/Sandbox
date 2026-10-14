import { describe, expect, it } from 'vitest'
import { DEFAULT_CONVENTIONS, checkRequirement, type CheckedRequirement, type CheckContext } from './rules'

const base: CheckedRequirement = {
  id: 'a',
  key: 'REQ-010',
  type: 'performance',
  title: 'Speed',
  statement: 'The actuator shall extend at no less than 50 mm/s at nominal load.',
  rationale: 'Cycle time.',
  source: 'Customer spec 4.2',
  acceptanceCriteria: 'Measured speed at least 50 mm/s.',
  verificationMethods: ['test'],
  attributes: {},
}
const ctx = (over: Partial<CheckContext> = {}): CheckContext => ({ conventions: DEFAULT_CONVENTIONS, knownKeys: new Set(['REQ-010', 'REQ-001']), relationshipTypes: new Set(['allocated-to']), requiredAttributes: [], ...over })
const rules = (r: Partial<CheckedRequirement>, c?: Partial<CheckContext>) => checkRequirement({ ...base, ...r }, ctx(c)).map((f) => f.ruleId)

describe('quality checks (AC-Q1–Q4)', () => {
  it('finds nothing in a well-formed requirement', () => {
    expect(rules({})).toEqual([])
  })
  it('detects multiple obligations, vague and ambiguous terms, placeholders and negative statements', () => {
    expect(rules({ statement: 'The pump shall start quickly and shall stop safely.' })).toEqual(expect.arrayContaining(['heuristic.multiple-obligations', 'heuristic.vague-term']))
    expect(rules({ statement: 'The housing shall resist corrosion etc. as appropriate.' })).toEqual(expect.arrayContaining(['heuristic.ambiguous-term']))
    expect(rules({ statement: 'The motor shall deliver TBD W.' })).toContain('validation.placeholder')
    expect(rules({ statement: 'The valve shall not leak.' })).toContain('heuristic.negative-statement')
  })
  it('detects numbers without units and quantities without limits', () => {
    expect(rules({ statement: 'The pump shall deliver 40 at 2 bar.' })).toContain('heuristic.number-without-unit')
    expect(rules({ statement: 'The rod shall be 25 mm in diameter.' })).toContain('heuristic.missing-tolerance')
    expect(rules({ statement: 'The housing shall meet IP65.' })).not.toContain('heuristic.number-without-unit')
  })
  it('validates recorded data: missing rationale, source, acceptance criteria, method, trace, required attributes, undefined references', () => {
    const r = rules({ rationale: '', source: '', acceptanceCriteria: '', verificationMethods: [], statement: 'The motor shall meet REQ-999 and REQ-001.', attributes: {} }, { relationshipTypes: new Set(), requiredAttributes: [{ id: 'x', name: 'Safety class' }] })
    expect(r).toEqual(expect.arrayContaining(['validation.missing-rationale', 'validation.missing-source', 'validation.missing-acceptance-criteria', 'validation.missing-verification-method', 'validation.missing-trace', 'validation.required-attribute', 'validation.undefined-reference']))
    expect(checkRequirement({ ...base, statement: 'Meets REQ-999.' }, ctx()).find((f) => f.ruleId === 'validation.undefined-reference')!.evidence).toBe('REQ-999')
  })
  it('flags potential duplicates by similarity', () => {
    const found = checkRequirement(base, ctx({ others: [{ id: 'b', key: 'REQ-011', statement: 'The actuator shall extend at no less than 50 mm/s at nominal load and temperature.' }] }))
    expect(found.find((f) => f.ruleId === 'heuristic.potential-duplicate')?.evidence).toBe('REQ-011')
  })
  it('makes conventions configurable: no universal "shall" unless enabled; rules can be disabled; vocabularies are editable', () => {
    expect(rules({ statement: 'The pump delivers at least 40 l/min.' })).not.toContain('heuristic.no-obligation-verb')
    expect(rules({ statement: 'The pump delivers at least 40 l/min.' }, { conventions: { ...DEFAULT_CONVENTIONS, requireObligationVerb: true } })).toContain('heuristic.no-obligation-verb')
    expect(rules({ statement: 'The pump must be easy to clean.' }, { conventions: { ...DEFAULT_CONVENTIONS, disabledRules: ['heuristic.vague-term'] } })).not.toContain('heuristic.vague-term')
    expect(rules({ statement: 'The pump shall be snappy.' }, { conventions: { ...DEFAULT_CONVENTIONS, vagueTerms: ['snappy'] } })).toContain('heuristic.vague-term')
  })
  it('explains each finding with class, issue, explanation and a proposed improvement — never a rewrite', () => {
    const f = checkRequirement({ ...base, statement: 'The UI shall be user-friendly.' }, ctx()).find((x) => x.ruleId === 'heuristic.vague-term')!
    expect(f).toMatchObject({ class: 'heuristic', evidence: 'user-friendly' })
    expect(f.explanation.length).toBeGreaterThan(20)
    expect(f.suggestion).toMatch(/measurable/)
  })
})

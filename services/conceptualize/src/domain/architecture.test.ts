import { describe, expect, it } from 'vitest'
import { architectureProblems, assessDiversity, evaluateReadiness, readArchitecture, textSimilarity, EMPTY_ARCHITECTURE, type ArchitectureBlock, type DiversityItem } from './architecture'
import { computeGaps, type IntentContent, type IntentSystem } from './intent'

/**
 * Architecture block validation, the diversity assessment and the readiness gate (ECII increment 2). These tests prove
 * the structure and the computation; they say nothing about whether a model proposes good architectures. Domain words
 * appear only as fixture values, never in the rules.
 */

const arch = (extra: Partial<ArchitectureBlock> = {}): ArchitectureBlock => ({
  ...EMPTY_ARCHITECTURE,
  hostInterface: 'Existing threaded boss on the apparatus housing',
  attachmentPrinciple: 'Fastened through the boss with a captive screw',
  interfaceGeometry: 'Boss diameter and thread unknown',
  loadPath: 'Weight into the boss in shear',
  installationRemoval: 'One tool, no disassembly',
  advantages: ['Simple'],
  disadvantages: ['Depends on one feature'],
  risks: ['Boss may not carry the load'],
  assumptions: ['The boss exists'],
  evidenceRequired: ['Boss dimensions'],
  ...extra,
})
const item = (id: string, architecture: ArchitectureBlock | null, parameters: Record<string, number | null> = {}): DiversityItem => ({ id, key: `CON-00${id}`, name: `Alternative ${id}`, architecture, parameters })

describe('architecture block', () => {
  it('accepts a complete architecture and a variant that names its parent', () => {
    expect(architectureProblems(arch())).toEqual({})
    expect(architectureProblems({ ...EMPTY_ARCHITECTURE, level: 'variant', parent: 'CON-001' })).toEqual({})
  })
  it('names each missing field of an architecture', () => {
    const p = architectureProblems({ ...EMPTY_ARCHITECTURE })
    expect(Object.keys(p).sort()).toEqual(['architecture.attachmentPrinciple', 'architecture.disadvantages', 'architecture.evidenceRequired', 'architecture.installationRemoval', 'architecture.loadPath'])
  })
  it('refuses a variant without a parent and an architecture with one', () => {
    expect(architectureProblems({ ...EMPTY_ARCHITECTURE, level: 'variant' })).toHaveProperty(['architecture.parent'])
    expect(architectureProblems(arch({ parent: 'CON-001' }))).toHaveProperty(['architecture.parent'])
  })
  it('reads only well-formed blocks and trims text', () => {
    expect(readArchitecture(null)).toBeNull()
    expect(readArchitecture({ level: 'other' })).toBeNull()
    expect(readArchitecture({ level: 'architecture', loadPath: '  a  ', risks: [' x ', ''] })).toMatchObject({ loadPath: 'a', risks: ['x'], parent: '' })
  })
})

describe('text similarity', () => {
  it('is symmetric, 1 for equal token sets and undefined without tokens', () => {
    expect(textSimilarity('Clamp around the housing', 'housing around clamp')).toBe(1)
    expect(textSimilarity('Slide into a rail', 'Clamp around the housing')).toBe(0)
    expect(textSimilarity('', 'x y z')).toBeUndefined()
    expect(textSimilarity('a b', 'the and')).toBeUndefined()
  })
})

describe('diversity assessment', () => {
  const clamp = arch({ hostInterface: 'Outer surface of the housing', attachmentPrinciple: 'Friction clamp tightened around the housing', interfaceGeometry: 'Cylindrical section of unknown diameter', loadPath: 'Clamping friction carries the weight', installationRemoval: 'Slide on from the end and tighten' })
  const rail = arch({ hostInterface: 'Existing guide rail', attachmentPrinciple: 'Sliding dovetail engaging the rail', interfaceGeometry: 'Rail profile unknown', loadPath: 'Weight into the rail through the dovetail flanks', installationRemoval: 'Slides along the rail and locks with a detent' })

  it('counts really different architectures as distinct', () => {
    const r = assessDiversity([item('1', arch()), item('2', clamp), item('3', rail)], 3)
    expect(r.distinctCount).toBe(3)
    expect(r.verdict).toBe('diverse')
    expect(r.pairs.every((p) => p.verdict === 'distinct')).toBe(true)
  })
  it('reports parameter-only differences as one architecture, not as diversity', () => {
    const r = assessDiversity([item('1', arch(), { n: 4 }), item('2', arch(), { n: 6 }), item('3', arch(), { n: 8 })])
    expect(r.distinctCount).toBe(1)
    expect(r.verdict).toBe('insufficient')
    expect(r.pairs[0]).toMatchObject({ verdict: 'same', differsOnlyIn: 'parameters' })
    expect(r.findings.join(' ')).toContain('differs only in parameters')
  })
  it('does not count variants as architectures and links them to their parent', () => {
    const r = assessDiversity([item('1', arch()), item('2', clamp), item('3', { ...EMPTY_ARCHITECTURE, level: 'variant', parent: 'CON-001' })])
    expect(r.distinctCount).toBe(2)
    expect(r.variants).toEqual([expect.objectContaining({ id: '3', parent: 'CON-001', parentId: '1' })])
  })
  it('lists alternatives without a block as unclassified and does not guess', () => {
    const r = assessDiversity([item('1', arch()), item('2', null)])
    expect(r.unclassified.map((u) => u.id)).toEqual(['2'])
    expect(r.distinctCount).toBe(1)
    expect(r.verdict).toBe('insufficient')
  })
  it('is deterministic', () => {
    const items = [item('1', arch()), item('2', clamp), item('3', rail)]
    expect(assessDiversity(items)).toEqual(assessDiversity([...items]))
  })
})

describe('readiness gate', () => {
  const system = (extra: Partial<IntentSystem> = {}): IntentSystem => ({ id: 'sys-1', name: 'Existing apparatus', role: 'host', description: 'x', identified: false, owner: 'external', relation: 'mounts-to', ...extra })
  const intent = (extra: Partial<IntentContent> = {}): IntentContent => ({ designObject: 'Accessory', role: 'accessory', integration: 'hosted', rationale: '', externalSystems: [system()], objectives: [], environment: [], informationNeeds: [], questions: [], ...extra })
  const evalFor = (i: IntentContent | null, architectures: ArchitectureBlock[] = [], activity?: Parameters<typeof evaluateReadiness>[1]) => evaluateReadiness({ intent: i, gaps: i ? computeGaps(i) : null, architectures }, activity)

  it('has no level without an intent and names why', () => {
    const r = evalFor(null)
    expect(r.level).toBe('not-established')
    expect(r.contextReadiness.state).toBe('exploratory')
    expect(r.activities[0].unmet[0].text).toMatch(/no engineering intent/)
  })
  it('is Exploratory for an unidentified system: architecture concepts are ready, the rest are provisional', () => {
    const r = evalFor(intent(), [arch()])
    expect(r.level).toBe('exploratory')
    expect(r.activities.map((a) => [a.activity, a.met])).toEqual([['architecture-concepts', true], ['host-specific-concepts', false], ['dimensioned-design', false], ['cad-handoff', false]])
    expect(r.activities[1].unmet[0].text).toMatch(/identify host model/)
    expect(r.contextReadiness.blockingIssues.length).toBeGreaterThan(0)
    expect(r.provisional).toBe(true)
    expect(r.label).toMatch(/^Provisional: readiness is Exploratory/)
  })
  it('an undetermined integration is not even Exploratory', () => {
    expect(evalFor(intent({ integration: 'undetermined', externalSystems: [] })).level).toBe('not-established')
  })
  it('is Context Established once the system is identified and an architecture states its host interface', () => {
    const i = intent({ externalSystems: [system({ identified: true })] })
    expect(evalFor(i, []).level).toBe('exploratory')
    expect(evalFor(i, [arch({ hostInterface: '' })]).level).toBe('exploratory')
    const r = evalFor(i, [arch()])
    expect(r.level).toBe('context-established')
    expect(r.contextReadiness.state).toBe('established')
    expect(r.activities.find((a) => a.activity === 'host-specific-concepts')?.met).toBe(true)
    expect(r.activities.find((a) => a.activity === 'cad-handoff')?.met).toBe(false)
    // A met gate is still provisional while the interface information is not verified.
    expect(evalFor(i, [arch()], 'host-specific-concepts')).toMatchObject({ provisional: true, label: expect.stringMatching(/gate for host-specific-concepts is met, but the interface information is not verified/) })
  })
  it('does not treat a variant as an interface statement: a hosted intent with one variant and no host interface stays Exploratory', () => {
    const i = intent({ externalSystems: [system({ identified: true })] })
    const variant = { ...EMPTY_ARCHITECTURE, level: 'variant' as const, parent: 'CON-001' }
    expect(evalFor(i, [variant]).level).toBe('exploratory')
    expect(JSON.stringify(evalFor(i, [variant]).activities[1].unmet)).toMatch(/no solution architecture states its host interface/)
  })
  it('never reaches Interfaces Verified for a design that works with another system until facts can be verified', () => {
    const i = intent({ externalSystems: [system({ identified: true })] })
    const r = evalFor(i, [arch()], 'cad-handoff')
    expect(r.level).toBe('context-established')
    expect(r.activities[0].unmet.map((u) => u.id)).toContain('interfaces-verified')
    expect(r.provisional).toBe(true)
  })
  it('a standalone design object has no outside interface to verify', () => {
    const i = intent({ role: 'standalone', integration: 'standalone', externalSystems: [] })
    const r = evalFor(i, [arch({ hostInterface: '' })], 'cad-handoff')
    expect(r.level).toBe('interfaces-verified')
    expect(r.provisional).toBe(false)
    expect(r.contextReadiness).toEqual({ state: 'verified', blockingIssues: [] })
  })
  it('is advisory and carries the criteria version', () => {
    const r = evalFor(intent())
    expect(r.advisory).toBe(true)
    expect(r.criteriaVersion).toBe('readiness-criteria/1')
  })
})

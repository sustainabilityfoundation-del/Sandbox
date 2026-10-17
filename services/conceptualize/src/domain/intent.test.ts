import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { computeGaps, intentProblems, type IntentContent, type IntentSystem } from './intent'

/**
 * Engineering intent: structure validation and deterministic gaps (ECII increment 1). These tests prove the
 * structure and the computation; they say nothing about whether a model interprets a request well. Domain words
 * appear only as fixture values, never in the rules.
 */

const system = (extra: Partial<IntentSystem> = {}): IntentSystem => ({ id: 'sys-1', name: 'Existing apparatus', role: 'host', description: 'The apparatus the design attaches to', identified: false, owner: 'external', relation: 'mounts-to', ...extra })
const intent = (extra: Partial<IntentContent> = {}): IntentContent => ({
  designObject: 'Accessory',
  role: 'accessory',
  integration: 'hosted',
  rationale: '',
  externalSystems: [system()],
  objectives: [],
  environment: [],
  informationNeeds: [],
  questions: [],
  ...extra,
})

describe('intent structure validation', () => {
  it('accepts an accessory that works with an unidentified system', () => {
    expect(intentProblems(intent())).toEqual({})
  })
  it('refuses a standalone design object with external systems, and a standalone role with an integration', () => {
    expect(intentProblems(intent({ role: 'standalone', integration: 'standalone' }))).toHaveProperty('externalSystems')
    expect(intentProblems(intent({ role: 'standalone', integration: 'embedded' }))).toHaveProperty('integration')
    expect(intentProblems(intent({ role: 'standalone', integration: 'standalone', externalSystems: [] }))).toEqual({})
  })
  it('checks identification, duplicate IDs, question content and tier-4 research', () => {
    expect(intentProblems(intent({ externalSystems: [system({ identified: true, name: ' ' })] }))).toHaveProperty(['externalSystems.0.identified'])
    expect(intentProblems(intent({ externalSystems: [system({ identified: false, productElement: { module: 'product', id: 'x' } })] }))).toHaveProperty(['externalSystems.0.identified'])
    const need = { id: 'N1', text: 't', tier: 1 as const, route: 'ask-user' as const, state: 'open' as const }
    expect(intentProblems(intent({ informationNeeds: [need, need] }))).toHaveProperty(['informationNeeds.1.id'])
    expect(intentProblems(intent({ informationNeeds: [{ ...need, tier: 4, route: 'research' }] }))).toHaveProperty(['informationNeeds.0.route'])
    const q = { id: 'Q1', text: 'Which one?', why: 'It changes the interface', impact: 'blocks' as const, options: ['continue generically'], state: 'open' as const }
    expect(intentProblems(intent({ questions: [q] }))).toEqual({})
    expect(intentProblems(intent({ questions: [{ ...q, why: ' ' }] }))).toHaveProperty(['questions.0.why'])
    expect(intentProblems(intent({ questions: [{ ...q, options: [] }] }))).toHaveProperty(['questions.0.options'])
    expect(intentProblems(intent({ questions: [{ ...q, needId: 'nope' }] }))).toHaveProperty(['questions.0.needId'])
    expect(intentProblems(intent({ questions: [{ ...q, needId: 'system-0' }] }))).toEqual({})
  })
})

describe('gaps are computed from the structure', () => {
  it('an unidentified system the design attaches to is an essential gap, asked of the person', () => {
    const g = computeGaps(intent())
    expect(g.counts).toEqual({ essential: 1, concept: 0, detail: 0, immaterial: 0 })
    expect(g.gaps[0]).toMatchObject({ id: 'system-0', tier: 'essential', text: 'identify host model and mounting features', route: 'ask-user', source: 'structure' })
    expect(g.researchItems).toEqual([])
    expect(g.unaskedEssential).toHaveLength(1)
  })
  it('a question that names the gap covers it', () => {
    const q = { id: 'Q1', text: 'Which one?', why: 'It changes the interface', impact: 'blocks' as const, options: ['continue generically'], state: 'open' as const, needId: 'system-0' }
    expect(computeGaps(intent({ questions: [q] })).unaskedEssential).toEqual([])
    expect(computeGaps(intent({ questions: [{ ...q, state: 'answered' }] })).unaskedEssential).toHaveLength(1)
  })
  it('a standalone intent has no system gaps and no research items', () => {
    const g = computeGaps(intent({ role: 'standalone', integration: 'standalone', externalSystems: [] }))
    expect(g.gaps).toEqual([])
    expect(g.systemGaps).toEqual([])
    expect(g.researchItems).toEqual([])
  })
  it('identifying the system closes the gap; the wording follows the relation, not a noun', () => {
    expect(computeGaps(intent({ externalSystems: [system({ identified: true })] })).gaps).toEqual([])
    expect(computeGaps(intent({ externalSystems: [system({ relation: 'connects-to', role: '' })] })).gaps[0].text).toBe('identify external system model and connection features')
    expect(computeGaps(intent({ externalSystems: [system({ relation: 'interferes-with' })] })).gaps[0]).toMatchObject({ tier: 'concept' })
  })
  it('an undetermined integration, or a mode without any listed system, is essential', () => {
    expect(computeGaps(intent({ integration: 'undetermined', externalSystems: [] })).gaps.map((g) => g.id)).toEqual(['integration'])
    expect(computeGaps(intent({ integration: 'connected', externalSystems: [] })).gaps.map((g) => g.id)).toEqual(['systems'])
  })
  it('an open need about a system that already has a structural gap is merged into it, keeping both IDs', () => {
    const need = { id: 'N1', text: 'which model', tier: 1 as const, route: 'ask-user' as const, state: 'open' as const, subject: 'sys-1' }
    const g = computeGaps(intent({ informationNeeds: [need, { ...need, id: 'N2', subject: 'Something else' }] }))
    expect(g.gaps.map((x) => x.id)).toEqual(['system-0', 'need-N2'])
    expect(g.gaps[0].ids).toEqual(['system-0', 'need-N1'])
    expect(g.counts.essential).toBe(2)
    expect(g.gaps[0]).not.toHaveProperty('systemKeys')
    const q = { id: 'Q1', text: 'Which one?', why: 'It changes the interface', impact: 'blocks' as const, options: ['continue generically'], state: 'open' as const, needId: 'N1' }
    expect(computeGaps(intent({ informationNeeds: [need], questions: [q] })).unaskedEssential).toEqual([])
  })
  it('does not merge on a matching name: only the system id or its product element', () => {
    const need = { id: 'N1', text: 'which model', tier: 1 as const, route: 'ask-user' as const, state: 'open' as const }
    const byName = computeGaps(intent({ informationNeeds: [{ ...need, subject: 'Existing apparatus' }, { ...need, id: 'N2', subject: 'sys-9' }] }))
    expect(byName.gaps.map((x) => x.id)).toEqual(['system-0', 'need-N1', 'need-N2'])
    const el = { module: 'product', id: 'PE-001' }
    const byRef = computeGaps(intent({ externalSystems: [system({ productElement: el })], informationNeeds: [{ ...need, subject: 'product:PE-001' }] }))
    expect(byRef.gaps.map((x) => x.ids)).toEqual([['system-0', 'need-N1']])
  })
  it('information needs map tier 1-4 to the four tiers; only open tier 1 needs routed to research are research items', () => {
    const n = (id: string, tier: 1 | 2 | 3 | 4, route: 'research' | 'ask-user' | 'measure' | 'defer', state: 'open' | 'resolved' = 'open') => ({ id, text: `need ${id}`, tier, route, state })
    const g = computeGaps(intent({ role: 'standalone', integration: 'standalone', externalSystems: [], informationNeeds: [n('a', 1, 'research'), n('b', 2, 'ask-user'), n('c', 3, 'defer'), n('d', 4, 'defer'), n('e', 1, 'research', 'resolved'), n('f', 2, 'research')] }))
    expect(g.counts).toEqual({ essential: 1, concept: 2, detail: 1, immaterial: 1 })
    expect(g.researchItems.map((x) => x.ref)).toEqual(['a'])
  })
})

describe('isolation: the ECII generic code and instructions contain no domain words', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
  const files = [
    'services/conceptualize/src/domain/intent.ts',
    'services/conceptualize/src/store/intents.ts',
    'services/conceptualize/src/http/intentSchemas.ts',
    'services/conceptualize/src/http/intentRoutes.ts',
    'services/conceptualize/src/db/migrations/0008_engineering_intent.sql',
    'packages/conceptualize-client/src/intentTypes.ts',
    'packages/tool-conceptualize/src/assistantIntent.ts',
    'packages/tool-conceptualize/help/engineering-context.md',
  ]
  // Domain nouns belong in fixtures only. Whole words, case-insensitive.
  const DOMAIN = /\b(drills?|bits?|holders?|sensors?|brackets?|fans?|enclosures?|cordless|chucks?|bolts?|screws?|magnets?|motors?|workbench|hex|cooling|battery|pump|valve|gear)\b/i
  it.each(files)('%s', (file) => {
    const text = readFileSync(join(root, file), 'utf8')
    expect(text.match(DOMAIN)?.[0] ?? null).toBeNull()
  })
  it('the assistant instructions', () => {
    const wire = readFileSync(join(root, 'services/assistant/src/wire.ts'), 'utf8')
    const block = wire.slice(wire.indexOf('export const INSTRUCTIONS'), wire.indexOf(".join('\\n')"))
    expect(block.length).toBeGreaterThan(500)
    // "double brackets" is the reference syntax, not a design object.
    expect(block.replace(/double brackets/g, '').match(DOMAIN)?.[0] ?? null).toBeNull()
  })
})

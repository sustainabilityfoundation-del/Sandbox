import { describe, expect, it } from 'vitest'
import drill from '../../fixtures/demo-plans/drill-bit-holder.json'
import { runScriptedPlan, scriptedPlans, type ScriptedPlan } from './scriptedPlans'
import type { AssistantRequest, ToolCallResult } from './types'

/** The generic scripted-plan engine, exercised with the isolated drill bit holder fixture (test and tutorial data). */
const plan = drill as ScriptedPlan
const tools = ['conceptualize.create', 'conceptualize.search', 'conceptualize.decompose', 'conceptualize.develop_alternatives', 'conceptualize.propose_requirement'].map((name) => ({ name, description: '', parameters: { type: 'object' as const, properties: {} } }))
const req = (text: string, toolResults: ToolCallResult[] = [], offered = tools): AssistantRequest => ({ history: [], turn: { text, context: {} as never, toolResults }, tools: offered })
const ok = (name: string, data: unknown): ToolCallResult => ({ callId: 'c', name, ok: true, data })
const run = (r: AssistantRequest) => runScriptedPlan(r, [plan])

describe('scripted demonstration plans (fixtures, demo assistant only)', () => {
  it('loads plans from fixtures; the drill bit holder is one of them, labelled as a demo with its disclaimers', () => {
    expect(scriptedPlans().map((p) => p.id)).toContain('drill-bit-holder')
    expect(plan.label).toMatch(/Scripted demo plan.*not affiliated with or endorsed by Milwaukee Tool/is)
  })

  it('creates the Concept from the verbatim need, with Milwaukee only as compatibility and drill dimensions as assumptions', () => {
    const first = run(req('Start the drill bit holder example'))!
    expect(first).toMatchObject({ type: 'tool_calls', calls: [{ name: 'conceptualize.create' }] })
    const text = (first.type === 'tool_calls' && (first.calls[0].arguments.text as string)) || ''
    expect(text).toMatch(/Milwaukee-compatible/)
    expect(text).toMatch(/Assume the drill body dimensions are not measured/)
    const done = run(req('Start the drill bit holder example', [ok('conceptualize.create', { proposalId: 'CP-1' })]))!
    expect(done.type === 'final' && done.text).toMatch(/\*\*CP-1\*\*.*Apply/s)
    expect(done.type === 'final' && done.text).toContain(plan.label)
  })

  it('records quantified constraint statements on the Concept, the precondition of conceptualize.propose_requirement', () => {
    // conceptualize.create records only what the caller writes (CR-AI-1); propose_requirement needs constraint or performance statements with a quantity.
    const first = run(req('Start the drill bit holder example'))!
    const args = first.type === 'tool_calls' ? (first.calls[0].arguments as { statements?: { kind: string; quantity?: { unit: string } }[] }) : {}
    const quantified = (args.statements ?? []).filter((s) => (s.kind === 'constraint' || s.kind === 'performance') && s.quantity)
    expect(quantified.map((s) => s.quantity?.unit).sort()).toEqual(['m', 'mm', 's'])
  })

  it('finds the applied Concept,then decomposes, adds three alternatives with a trade study, and drafts requirements', () => {
    const found = ok('conceptualize.search', { concepts: [{ key: 'CON-007', name: 'Drill bit holder for a Milwaukee-compatible cordless drill/driver' }] })
    expect(run(req('Decompose the drill bit holder'))).toMatchObject({ calls: [{ name: 'conceptualize.search' }] })
    expect(run(req('Decompose the drill bit holder', [found]))).toMatchObject({ calls: [{ name: 'conceptualize.decompose', arguments: { conceptId: 'CON-007' } }] })
    // One model-written alternative set with its trade study (conceptualize.develop_alternatives, CR-AI-1).
    const next = run(req('Propose alternatives for the drill bit holder', [found]))!
    expect(next).toMatchObject({ calls: [{ name: 'conceptualize.develop_alternatives', arguments: { parentId: 'CON-007', alternatives: [{ name: 'Magnetic clip at the belt-clip mount' }, { name: 'Sleeve on the battery foot' }, { name: 'Belt holster with a bit strip' }] } }] })
    const args = next.type === 'tool_calls' ? (next.calls[0].arguments as { tradeStudy: { criteria: { weight: number }[]; scores: unknown[] } }) : undefined
    expect(args?.tradeStudy.criteria.map((c) => c.weight)).toEqual([3, 2, 2, 1])
    expect(args?.tradeStudy.scores).toHaveLength(12)
    const study = run(req('Propose alternatives for the drill bit holder', [found, ok('conceptualize.develop_alternatives', { proposalId: 'CP-2' })]))!
    expect(study.type === 'final' && study.text).toMatch(/Weighted total\*\* \| \*\*31\*\* \| \*\*27\*\* \| \*\*31\*\*/)
    expect(study.type === 'final' && study.text).toContain('**CP-2**')
    expect(run(req('Draft requirements for the drill bit holder', [found]))).toMatchObject({ calls: [{ name: 'conceptualize.propose_requirement', arguments: { conceptId: 'CON-007' } }] })
  })

  it('explains instead of acting when operations are not offered, and ignores unrelated prompts', () => {
    const r = run(req('Start the drill bit holder example', [], []))!
    expect(r.type === 'final' && r.text).toMatch(/subscription does not include/)
    expect(run(req('Change the rod diameter to 28 mm'))).toBeNull()
  })

  it('keeps the trade study arithmetic consistent (weights 3/2/2/1)', () => {
    const w = [3, 2, 2, 1]
    const total = (s: number[]) => s.reduce((a, v, i) => a + v * w[i], 0)
    expect([total([4, 5, 3, 3]), total([4, 4, 2, 3]), total([4, 2, 5, 5])]).toEqual([31, 27, 31])
  })
})

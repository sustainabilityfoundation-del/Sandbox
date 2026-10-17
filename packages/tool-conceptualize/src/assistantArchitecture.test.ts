import { describe, expect, it } from 'vitest'
import type { AssistantActionContext, ServiceProposal } from '@ews/platform-sdk'
import { sampleModel } from '@ews/platform-sdk/testing'
import { createHttpConceptsService } from '@ews/conceptualize-client'
import { conceptsAssistant } from './assistant'

/**
 * Architecture-first generation and the readiness gate (ECII increment 2): the operations prepare the same API calls as
 * the UI. These tests prove the structure and the refusals; they say nothing about whether a model proposes good
 * architectures.
 */
const P = 'PRJ-ACT100'
const BASE = `http://api.test/api/concepts/v1/projects/${P}`
type Call = { method: string; url: string; body: any }
function server(routes: (c: Call) => unknown) {
  const calls: Call[] = []
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const c: Call = { method: init.method ?? 'GET', url: String(input), body: init.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(c)
    const out = routes(c)
    if (out === undefined) return new Response(JSON.stringify({ error: { code: 'not-found', message: `no route ${c.method} ${c.url}` } }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify(out), { status: c.method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof globalThis.fetch
  return { calls, concepts: createHttpConceptsService({ baseUrl: 'http://api.test/api/concepts/v1', fetch }) }
}
const ctx = (services: AssistantActionContext['services']): AssistantActionContext => {
  const model = sampleModel()
  return { model, artifacts: [], captured: { projectId: P, configurationId: 'CFG-BASE', scenarioId: 'SCN-NOM', modelRevision: model.revision, selectionIds: [] }, services }
}
const action = (name: string) => conceptsAssistant.actions.find((a) => a.name === name)!
const applied = { conversationId: 'C-1', proposalId: 'CP-1', messageId: 'M-1' }

const block = (extra: Record<string, unknown> = {}) => ({ hostInterface: 'An existing feature', attachmentPrinciple: 'Fastened through it', loadPath: 'Weight into the feature', installationRemoval: 'One tool', disadvantages: ['Depends on one feature'], evidenceRequired: ['Feature dimensions'], assumptions: ['The feature exists'], ...extra })
const alt = (name: string, architecture?: unknown) => ({ name, summary: `${name} summary`, ...(architecture ? { architecture } : {}) })
const readiness = (provisional = true) => ({
  intent: { id: 'i', key: 'INT-001', revision: 1, designObject: 'x', integration: 'hosted' },
  concept: null,
  architecturesConsidered: 0,
  criteriaVersion: 'readiness-criteria/1',
  advisory: true,
  level: 'exploratory',
  contextReadiness: { state: 'exploratory', blockingIssues: ['identify host'] },
  activities: [{ activity: 'architecture-concepts', requires: 'exploratory', met: !provisional, unmet: [] }],
  provisional,
  label: 'Provisional: readiness is Exploratory; 1 item(s) unmet, first: identify host',
})

describe('develop_alternatives with a level', () => {
  it('refuses level architecture without an architecture block, and a variant without its parent', async () => {
    const { concepts } = server(() => undefined)
    await expect(action('conceptualize.develop_alternatives').run({ text: 'x', level: 'architecture', alternatives: [alt('A'), alt('B')] }, ctx({ concepts }))).rejects.toThrow(/architecture is required for level architecture/)
    await expect(action('conceptualize.develop_alternatives').run({ text: 'x', level: 'variant', alternatives: [alt('A')] }, ctx({ concepts }))).rejects.toThrow(/needs parentArchitecture/)
    await expect(action('conceptualize.develop_alternatives').run({ text: 'x', alternatives: [alt('A', block())] }, ctx({ concepts }))).rejects.toThrow(/needs the operation to say level/)
    await expect(action('conceptualize.develop_alternatives').run({ text: 'x', level: 'nonsense', alternatives: [alt('A')] }, ctx({ concepts }))).rejects.toThrow(/level must be one of/)
  })

  it('prepares the blocks in the definition, labels the preview provisional and notes diversity after Apply', async () => {
    const { calls, concepts } = server((c) => {
      if (c.method === 'GET' && c.url.startsWith(`${BASE}/readiness`)) return readiness()
      if (c.method === 'POST' && c.url === `${BASE}/explorations`) return { id: 'e1', created: { concepts: [{ id: 'p', key: 'CON-100', name: 'Mounting', role: 'parent' }, { id: 'a', key: 'CON-101', name: 'A', role: 'alternative' }, { id: 'b', key: 'CON-102', name: 'B', role: 'alternative' }] } }
      if (c.method === 'GET' && c.url.startsWith(`${BASE}/diversity`)) return { distinctCount: 2, verdict: 'diverse', findings: [], subjects: [] }
    })
    const r = (await action('conceptualize.develop_alternatives').run({ text: 'Ways to mount', level: 'architecture', alternatives: [alt('A', block()), alt('B', block({ attachmentPrinciple: 'Clamped around it' }))] }, ctx({ concepts }))) as ServiceProposal
    expect(calls.find((c) => c.url.startsWith(`${BASE}/readiness`))!.url).toContain('activity=architecture-concepts')
    expect(r.preview).toEqual(expect.arrayContaining([{ label: 'Level', proposed: 'Architectures (different ways the solution is organised)' }, { label: 'Readiness (advisory)', proposed: expect.stringMatching(/^Provisional: readiness is Exploratory/) }, expect.objectContaining({ label: 'A: host interface', proposed: 'An existing feature' }), expect.objectContaining({ label: 'B: evidence required', proposed: 'Feature dimensions' })]))
    expect(r.assumptions).toEqual(expect.arrayContaining([expect.stringMatching(/provisional concepts, not validated engineering solutions/)]))
    const out = await r.apply(applied)
    const exploration = calls.find((c) => c.url.endsWith('/explorations'))!.body
    expect(exploration.alternatives[0]).toMatchObject({ name: 'A', stage: 'exploration', definition: { architecture: { level: 'architecture', hostInterface: 'An existing feature', evidenceRequired: ['Feature dimensions'] } } })
    expect(out.summary).toMatch(/\(level architecture\).*Diversity: 2 distinct architecture\(s\), diverse/)
  })

  it('records variants with the parent architecture and no architecture fields of their own', async () => {
    const { calls, concepts } = server((c) => (c.method === 'GET' && c.url.startsWith(`${BASE}/readiness`) ? readiness(false) : undefined))
    const r = (await action('conceptualize.develop_alternatives').run({ text: 'Layouts', name: 'Layouts', level: 'variant', parentArchitecture: 'CON-101', alternatives: [alt('Four'), alt('Six')] }, ctx({ concepts }))) as ServiceProposal
    expect(calls.find((c) => c.url.startsWith(`${BASE}/readiness`))!.url).toContain('activity=dimensioned-design')
    expect(r.preview).toEqual(expect.arrayContaining([{ label: 'Level', proposed: 'Variants of CON-101' }, expect.objectContaining({ label: 'Four: variant of', proposed: 'CON-101' })]))
  })
})

describe('assess_diversity and evaluate_readiness', () => {
  it('assess_diversity resolves keys and reports distinct architectures, variants and what cannot be compared', async () => {
    const A = '0c0a0001-0000-4000-8000-0000000000a1'
    const B = '0c0a0001-0000-4000-8000-0000000000a2'
    const { calls, concepts } = server((c) => {
      if (c.method === 'GET' && c.url.startsWith(`${BASE}/diversity`)) {
        return {
          subjects: [{ id: A, key: 'CON-101', name: 'A', level: 'architecture' }, { id: B, key: 'CON-102', name: 'B', level: 'architecture' }],
          thresholds: { samePrinciple: 0.8, sameMean: 0.6, minimumDistinct: 2 },
          architectures: [{ representative: A, members: [A] }, { representative: B, members: [B] }],
          distinctCount: 2, variants: [], unclassified: [], pairs: [{ a: A, b: B, similarity: 0.1, fieldsCompared: 5, principleSimilarity: 0, verdict: 'distinct' }], minimum: 2, verdict: 'diverse', findings: [],
        }
      }
    })
    const out = (await action('conceptualize.assess_diversity').run({ conceptIds: [A, B] }, ctx({ concepts }))) as { data: { verdict: string; distinctArchitectures: number; architectures: string[][] }; summary: string }
    expect(calls[0].url).toContain(`conceptIds=${A}%2C${B}`)
    expect(out.data).toMatchObject({ verdict: 'diverse', distinctArchitectures: 2, architectures: [['CON-101 A'], ['CON-102 B']] })
    expect(out.summary).toBe('2 distinct architecture(s) among 2 alternative(s): diverse')
    await expect(action('conceptualize.assess_diversity').run({}, ctx({ concepts }))).rejects.toThrow(/Say which alternatives to compare/)
  })

  it('evaluate_readiness returns the label, the level and the unmet items per activity, and refuses an unknown activity', async () => {
    const { calls, concepts } = server((c) => (c.method === 'GET' && c.url.startsWith(`${BASE}/readiness`) ? readiness() : undefined))
    const out = (await action('conceptualize.evaluate_readiness').run({ activity: 'architecture-concepts' }, ctx({ concepts }))) as { data: { level: string; provisional: boolean; advisory: boolean; label: string }; summary: string }
    expect(calls[0].url).toContain('activity=architecture-concepts')
    expect(out.data).toMatchObject({ level: 'exploratory', provisional: true, advisory: true })
    expect(out.summary).toMatch(/^Provisional: readiness is Exploratory/)
    await expect(action('conceptualize.evaluate_readiness').run({ activity: 'nonsense' }, ctx({ concepts }))).rejects.toThrow(/activity must be one of/)
  })
})

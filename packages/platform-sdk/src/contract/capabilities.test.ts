import { describe, expect, it } from 'vitest'
import { availability, checkPrerequisite, implementationState, type AvailabilityContext, type CapabilityEntry, type EngineeringObject } from '../index'

const base: CapabilityEntry = { id: 'demo.a', module: 'demo', surface: 'toolbar', label: 'A', effect: 'view', status: 'implemented', coverage: 'none' }
const bound: CapabilityEntry = { ...base, toolbarItem: 'a', verifiedBy: ['packages/x/src/a.test.ts::does a'] }

const object = (id: string, type: EngineeringObject['type']): EngineeringObject => ({ id, type, name: id, revision: 1 }) as EngineeringObject

function ctx(over: Partial<AvailabilityContext> = {}): AvailabilityContext {
  return {
    context: { projectId: 'P1', configurationId: 'c', modelRevision: 1, selectedIds: [], scenarioId: 's', pinned: false, workspaceConfigurationId: 'c' },
    selection: [],
    services: {},
    entitlements: ['tool:demo'],
    connections: { aiAccount: true, api: true },
    ...over,
  }
}

describe('implementationState', () => {
  it('is planned without any binding, whatever else the entry carries', () => {
    expect(implementationState(base)).toBe('planned')
    expect(implementationState({ ...base, verifiedBy: ['a.test.ts::x'], limitations: ['none really'], aiOperations: [], apiOperations: [] })).toBe('planned')
  })

  it.each<[string, Partial<CapabilityEntry>]>([
    ['toolbar item', { toolbarItem: 'a' }],
    ['assistant operation', { aiOperations: ['demo.run'] }],
    ['API operation', { apiOperations: ['runDemo'] }],
  ])('is partial when bound by a %s but not verified', (_name, binding) => {
    expect(implementationState({ ...base, ...binding })).toBe('partial')
  })

  it('is partial when bound and verified but limited', () => {
    expect(implementationState({ ...bound, limitations: ['geometry only'] })).toBe('partial')
  })

  it('is partial when the evidence list is empty', () => {
    expect(implementationState({ ...bound, verifiedBy: [] })).toBe('partial')
  })

  it('is implemented when bound, verified and without limitations', () => {
    expect(implementationState(bound)).toBe('implemented')
    expect(implementationState({ ...bound, limitations: [] })).toBe('implemented')
  })
})

describe('availability', () => {
  it('is available for a bound entry without prerequisites', () => {
    expect(availability(bound, ctx())).toEqual({ available: true })
  })

  it('is unavailable with a reason for a planned entry, whatever the context', () => {
    const planned: CapabilityEntry = { ...base, prerequisites: [{ kind: 'project' }] }
    const a = availability(planned, ctx())
    expect(a.available).toBe(false)
    expect(a.reason).toMatch(/planned/i)
  })

  it('checks the project', () => {
    const e = { ...bound, prerequisites: [{ kind: 'project' as const }] }
    expect(availability(e, ctx()).available).toBe(true)
    const none = ctx()
    none.context.projectId = ''
    expect(availability(e, none)).toEqual({ available: false, reason: 'Open a project first' })
  })

  it('checks the entitlement, from the prerequisite or the entry', () => {
    expect(availability({ ...bound, prerequisites: [{ kind: 'entitlement', id: 'tool:demo' }] }, ctx()).available).toBe(true)
    expect(availability({ ...bound, prerequisites: [{ kind: 'entitlement', id: 'tool:other' }] }, ctx()).available).toBe(false)
    expect(availability({ ...bound, entitlement: 'tool:other', prerequisites: [{ kind: 'entitlement' }] }, ctx()).available).toBe(false)
    expect(availability({ ...bound, entitlement: 'tool:demo', prerequisites: [{ kind: 'entitlement' }] }, ctx()).available).toBe(true)
    expect(availability({ ...bound, prerequisites: [{ kind: 'entitlement' }] }, ctx()).available).toBe(true)
  })

  it('checks a platform service', () => {
    const e = { ...bound, prerequisites: [{ kind: 'service' as const, service: 'help' as const }] }
    expect(availability(e, ctx()).available).toBe(false)
    expect(availability(e, ctx({ services: { help: {} as never } })).available).toBe(true)
  })

  it('checks the AI account and API connections', () => {
    const ai = { ...bound, prerequisites: [{ kind: 'connection' as const, to: 'ai-account' as const }] }
    const api = { ...bound, prerequisites: [{ kind: 'connection' as const, to: 'api' as const }] }
    const offline = ctx({ connections: { aiAccount: false, api: false } })
    expect(availability(ai, offline).reason).toMatch(/AI account/)
    expect(availability(api, offline).reason).toMatch(/API/)
    expect(availability(ai, ctx({ connections: { aiAccount: true, api: false } })).available).toBe(true)
    expect(availability(api, ctx({ connections: { aiAccount: true, api: false } })).available).toBe(false)
  })

  it('checks the selection: count and types', () => {
    const one = { ...bound, prerequisites: [{ kind: 'selection' as const }] }
    expect(availability(one, ctx()).available).toBe(false)
    expect(availability(one, ctx({ selection: [object('R1', 'requirement')] })).available).toBe(true)

    const typed = { ...bound, prerequisites: [{ kind: 'selection' as const, types: ['requirement' as const] }] }
    expect(availability(typed, ctx({ selection: [object('P1', 'part')] })).reason).toMatch(/requirement/)
    expect(availability(typed, ctx({ selection: [object('P1', 'part'), object('R1', 'requirement')] })).available).toBe(true)

    const range = { ...bound, prerequisites: [{ kind: 'selection' as const, min: 2, max: 3 }] }
    expect(availability(range, ctx({ selection: [object('A', 'part')] })).available).toBe(false)
    expect(availability(range, ctx({ selection: [object('A', 'part'), object('B', 'part')] })).available).toBe(true)
    expect(availability(range, ctx({ selection: ['A', 'B', 'C', 'D'].map((i) => object(i, 'part')) })).reason).toMatch(/at most 3/)
  })

  it('uses the module state, with the module reason first and the prerequisite text as fallback', () => {
    const e = { ...bound, prerequisites: [{ kind: 'module-state' as const, id: 'doc-open', text: 'Open a document first' }] }
    expect(availability(e, ctx()).available).toBe(true)
    expect(availability(e, ctx({ moduleState: { 'doc-open': { available: true } } })).available).toBe(true)
    expect(availability(e, ctx({ moduleState: { 'doc-open': { available: false } } }))).toEqual({ available: false, reason: 'Open a document first' })
    expect(availability(e, ctx({ moduleState: { 'doc-open': { available: false, reason: 'Document is read-only' } } })).reason).toBe('Document is read-only')
  })

  it('reports the first unmet prerequisite', () => {
    const e = { ...bound, prerequisites: [{ kind: 'project' as const }, { kind: 'connection' as const, to: 'api' as const }] }
    expect(availability(e, ctx({ connections: { aiAccount: true, api: false } })).reason).toMatch(/API/)
  })

  it('exposes single prerequisite checks for contextual tabs', () => {
    expect(checkPrerequisite({ kind: 'selection', types: ['part'] }, ctx({ selection: [object('P', 'part')] })).available).toBe(true)
  })
})

import { DemoRepository, PROJECT_ID, changeImpact, compareWithBaseline, outputFreshness, type StorageLike } from '@ews/model-service'
import { readVerificationRecord, verificationArtifact, verificationState } from '@ews/tool-requirements'
import { SDK_VERSION, isSdkCompatible } from '@ews/platform-sdk'
import { defineTool } from '@ews/platform-sdk/react'
import { lazy } from 'react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getToolApi } from './api'
import { PLANS, canOpenTool, toolAccess, useEntitlements } from './entitlements'
import { getRejectedTools, getTool, getTools, registerTool, toolName } from './registry'
import { restoreViewState, useWorkspaceStore } from './store'
import './tools'

function memoryStorage(): StorageLike {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

const ws = () => useWorkspaceStore.getState()
const setPlan = (id: string) => useEntitlements.getState().setPlan(id)

beforeAll(async () => {
  setPlan('all')
  await ws().initialize({
    repository: new DemoRepository({ storage: memoryStorage(), latencyMs: [0, 0] }),
    projectId: PROJECT_ID,
    tools: getTools().map((t) => ({ id: t.id, initialViewState: t.initialViewState })),
    defaultOpenToolIds: ['requirements', 'sysml', 'cad'],
  })
})

beforeEach(() => setPlan('all'))

describe('tool catalogue', () => {
  it('contains exactly Requirements, SysML, CAD and the SysML Modeler; Analysis and Verification are retired', () => {
    expect(getTools().map((t) => t.id)).toEqual(['requirements', 'sysml', 'cad', 'sysml-modeler'])
    expect(getTool('analysis')).toBeUndefined()
    expect(getTool('verification')).toBeUndefined()
    // Their saved data keeps a readable source name.
    expect(toolName('analysis')).toBe('Analysis (retired)')
  })

  it('every tool declares a versioned contract and a namespaced assistant contribution', () => {
    for (const tool of getTools()) {
      expect(tool.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(isSdkCompatible(tool.sdkVersion)).toBe(true)
      // The SysML Modeler shares the SysML entitlement during development (sysml-program-contracts.md §1).
      expect(tool.entitlement).toBe(tool.id === 'sysml-modeler' ? 'tool:sysml' : `tool:${tool.id}`)
      for (const action of tool.assistant?.actions ?? []) expect(action.name.startsWith(`${tool.id}.`)).toBe(true)
    }
  })

  it('does not load a tool built for another SDK major version', () => {
    const ok = registerTool(
      defineTool({
        id: 'future-tool',
        name: 'Future tool',
        description: '',
        category: 'Design',
        icon: 'tools',
        version: '1.0.0',
        sdkVersion: '^2.0.0',
        entitlement: 'tool:future-tool',
        supportedObjectTypes: [],
        view: lazy(async () => ({ default: () => null })),
        initialViewState: {},
        toolbar: () => [],
      }),
    )
    expect(ok).toBe(false)
    expect(getTool('future-tool')).toBeUndefined()
    expect(getRejectedTools()[0].reason).toContain(SDK_VERSION)
  })
})

describe('SDK version compatibility', () => {
  it('follows semver caret ranges', () => {
    expect(isSdkCompatible('^1.0.0', '1.0.0')).toBe(true)
    expect(isSdkCompatible('^1.0.0', '1.3.2')).toBe(true)
    expect(isSdkCompatible('^1.2.0', '1.1.9')).toBe(false)
    expect(isSdkCompatible('^1.0.0', '2.0.0')).toBe(false)
    expect(isSdkCompatible('1.0.0', '1.0.1')).toBe(false)
    expect(isSdkCompatible('not a version', '1.0.0')).toBe(false)
  })
})

describe('subscriptions', () => {
  it('provides the three demonstration plans', () => {
    // The full plan also includes Conceptualize (SDK 1.5).
    expect(PLANS.map((p) => p.entitlements.length)).toEqual([1, 2, 4])
  })

  it('Requirements only: Requirements opens, SysML and CAD are refused with an explanation', () => {
    setPlan('requirements')
    expect(canOpenTool('requirements')).toBe(true)
    for (const id of ['sysml', 'cad']) {
      const access = toolAccess(id)
      expect(access.ok).toBe(false)
      if (!access.ok) {
        expect(access.code).toBe('not-entitled')
        expect(access.reason).toContain('nothing has been deleted')
      }
    }
  })

  it('every navigation path goes through the same check (store, tool API)', () => {
    setPlan('requirements')
    ws().activateTool('requirements')
    expect(ws().activateTool('cad')).toMatchObject({ ok: false, code: 'not-entitled' })
    expect(ws().activeToolId).toBe('requirements')
    // A tool asking the platform to open another one is refused the same way.
    expect(getToolApi('requirements').openTool('sysml')).toMatchObject({ ok: false })
    expect(ws().activeToolId).toBe('requirements')
  })

  it('Requirements and SysML: CAD stays locked', () => {
    setPlan('requirements-sysml')
    expect(ws().activateTool('sysml').ok).toBe(true)
    expect(ws().activateTool('cad').ok).toBe(false)
  })

  it('All tools: every tool opens', () => {
    for (const id of ['requirements', 'sysml', 'cad']) expect(ws().activateTool(id).ok).toBe(true)
  })

  it('keeps open tabs and data when access is lost, and restores access without losing anything', async () => {
    ws().activateTool('cad')
    const before = ws().model!.objects.filter((o) => o.type === 'cad-representation').length
    setPlan('requirements')
    expect(ws().openToolIds).toContain('cad') // the tab stays and explains
    ws().focusTab('cad')
    expect(ws().activeToolId).toBe('cad') // shows the locked notice, not the tool
    expect(ws().model!.objects.filter((o) => o.type === 'cad-representation')).toHaveLength(before)
    setPlan('all')
    expect(ws().activateTool('cad').ok).toBe(true)
  })
})

describe('shared context across tools', () => {
  it('keeps selection, configuration, scenario and revision when switching tools', () => {
    ws().select(['ROD-120'])
    ws().setScenario('SCN-MAX')
    const before = { ...ws().context, revision: ws().model!.revision }
    for (const id of ['cad', 'requirements', 'sysml']) {
      ws().activateTool(id)
      const ctx = getToolApi(id).getContext()
      expect(ctx).toMatchObject({ selectedIds: ['ROD-120'], scenarioId: 'SCN-MAX', configurationId: before.configurationId, modelRevision: before.revision })
    }
  })

  it('keeps view state private to each tool and view instance', () => {
    getToolApi<{ hidden: string[] }>('cad').updateViewState({ hidden: ['CAD-130'] })
    expect(getToolApi<{ hidden: string[] }>('cad').getViewState().hidden).toEqual(['CAD-130'])
    expect(getToolApi<{ hidden: string[] }>('cad', 'w1:cad').getViewState().hidden).toEqual([])
  })

  it('sees a requirement edit made by one tool in every other tool through the common repository', async () => {
    const req = ws().model!.get('REQ-001')!
    await getToolApi('requirements').submitChanges(
      [{ kind: 'update-properties', targetId: 'REQ-001', baseRevision: req.revision, properties: { statement: 'Edited statement.' } }],
      'Edited REQ-001',
    )
    expect(getToolApi('sysml').getModel().get('REQ-001')!.properties.statement).toBe('Edited statement.')
    expect(getToolApi('cad').getModel().get('REQ-001')!.properties.statement).toBe('Edited statement.')
  })

  it('records the producing tool, objects, input revision and schema version with saved artifacts', async () => {
    const api = getToolApi('cad')
    const saved = await api.saveArtifact({
      kind: 'cad-representation',
      schemaVersion: 1,
      title: 'Snapshot',
      objectIds: ['ROD-120', 'CAD-120'],
      inputs: [{ id: 'CAD-120', revision: api.getModel().revisionOf('CAD-120')! }],
      scenarioId: null,
      completion: 'complete',
      result: [],
      summary: 'test',
    })
    expect(saved).toMatchObject({ toolId: 'cad', schemaVersion: 1, inputRevision: api.getModel().revision, configurationId: ws().context.configurationId })
    expect(api.getArtifacts({ objectId: 'ROD-120' }).map((a) => a.id)).toContain(saved.id)
  })
})

describe('module ownership through the tool API', () => {
  it('refuses a Requirements tool edit to CAD-owned dimensions; the CAD tool may make it', async () => {
    const rod = ws().model!.get('ROD-120')!
    const change = { kind: 'update-properties' as const, targetId: 'ROD-120', baseRevision: rod.revision, properties: { diameter: { value: 26, unit: 'mm' } } }
    await expect(getToolApi('requirements').submitChanges([change], 'Rod diameter')).rejects.toMatchObject({ code: 'forbidden' })
    expect(ws().model!.get('ROD-120')!.revision).toBe(rod.revision)
    await getToolApi('cad').submitChanges([change], 'Rod diameter')
    expect(ws().model!.get('ROD-120')!.properties.diameter).toEqual({ value: 26, unit: 'mm' })
  })

  it('refuses a SysML tool edit to a requirement statement', async () => {
    const req = ws().model!.get('REQ-002')!
    await expect(
      getToolApi('sysml').submitChanges([{ kind: 'update-properties', targetId: 'REQ-002', baseRevision: req.revision, properties: { statement: 'x' } }], 'x'),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })
})

describe('end-to-end cross-module workflow (architecture vision phase 1)', () => {
  it('CAD change, verification pinned to requirement revision and baseline, requirement change exposes stale evidence', async () => {
    const model = () => ws().model!
    // 1. CAD changes a delegated dimension of the rod.
    const rod = model().get('ROD-120')!
    await getToolApi('cad').submitChanges(
      [{ kind: 'update-properties', targetId: 'ROD-120', baseRevision: rod.revision, properties: { effectiveLength: { value: 610, unit: 'mm' } } }],
      'Lengthened rod',
    )
    // 2. Baseline the configured article.
    const baseline = await ws().createBaseline('Design review 1')
    const req = model().get('REQ-001')!
    expect(baseline.objects).toContainEqual({ id: 'REQ-001', revision: req.revision })

    // 3. Requirements records a passing verification against the exact revision and baseline.
    const api = getToolApi('requirements')
    const saved = await api.saveArtifact(
      verificationArtifact({
        requirement: req,
        components: model().linkedObjects('REQ-001', 'allocated-to', 'out'),
        method: 'Test',
        outcome: 'pass',
        procedure: 'TP-12 run 1',
        baselineId: baseline.id,
      }),
    )
    const view = () => readVerificationRecord({ ...ws().outputs.find((o) => o.id === saved.id)!, freshness: outputFreshness(saved, model()) }, 'REQ-001')
    expect(view()).toMatchObject({ requirementRevision: req.revision, baselineId: baseline.id, procedure: 'TP-12 run 1', configurationId: 'CFG-BASE', stale: false })
    expect(verificationState([view()])).toBe('verified')

    // 4. The requirement changes; the record is untouched but now stale.
    await api.submitChanges(
      [{ kind: 'update-properties', targetId: 'REQ-001', baseRevision: req.revision, properties: { statement: 'The rod shall carry 12 kN.' } }],
      'Raised load',
    )
    expect(verificationState([view()])).toBe('stale')
    expect(view().staleReasons.join()).toContain('REQ-001')
    expect(view().requirementRevision).toBe(req.revision)
    expect((await api.getObjectRevision('REQ-001', req.revision))?.snapshot).toMatchObject({ properties: { statement: req.properties.statement } })

    // 5. The baseline comparison shows the requirement changed; change impact lists the record and baseline.
    const diff = compareWithBaseline(baseline, model())
    expect(diff.changed.map((c) => c.id)).toContain('REQ-001')
    const impact = changeImpact(model(), ws().outputs, ws().baselines, 'REQ-001')
    expect(impact.referencingArtifacts.map((a) => a.id)).toContain(saved.id)
    expect(impact.dependentArtifacts.map((a) => a.id)).toContain(saved.id)
    expect(impact.baselines.map((b) => b.id)).toContain(baseline.id)
  })
})

describe('restoring view state saved by an earlier tool version', () => {
  it('fills fields the tool added since, and keeps the saved choices', () => {
    const initial = { search: '', statuses: [] as string[], columns: ['key'], page: 'table' }
    expect(restoreViewState({ search: 'load', showTrace: true }, initial)).toEqual({ search: 'load', statuses: [], columns: ['key'], page: 'table', showTrace: true })
    expect(restoreViewState(null, initial)).toBe(null)
    expect(restoreViewState([1], initial)).toEqual([1])
  })
})

import { DemoRepository, PROJECT_ID, type StorageLike } from '@ews/model-service'
import { SDK_VERSION, isSdkCompatible } from '@ews/platform-sdk'
import { defineTool } from '@ews/platform-sdk/react'
import { lazy } from 'react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getToolApi } from './api'
import { PLANS, canOpenTool, toolAccess, useEntitlements } from './entitlements'
import { getRejectedTools, getTool, getTools, registerTool, toolName } from './registry'
import { useWorkspaceStore } from './store'
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
  it('contains exactly Requirements, SysML and CAD; Analysis and Verification are retired', () => {
    expect(getTools().map((t) => t.id)).toEqual(['requirements', 'sysml', 'cad'])
    expect(getTool('analysis')).toBeUndefined()
    expect(getTool('verification')).toBeUndefined()
    // Their saved data keeps a readable source name.
    expect(toolName('analysis')).toBe('Analysis (retired)')
  })

  it('every tool declares a versioned contract and a namespaced assistant contribution', () => {
    for (const tool of getTools()) {
      expect(tool.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(isSdkCompatible(tool.sdkVersion)).toBe(true)
      expect(tool.entitlement).toBe(`tool:${tool.id}`)
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
    expect(PLANS.map((p) => p.entitlements.length)).toEqual([1, 2, 3])
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

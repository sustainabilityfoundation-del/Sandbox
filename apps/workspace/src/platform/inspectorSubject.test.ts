import { DemoRepository, PROJECT_ID, type StorageLike } from '@ews/model-service'
import { beforeAll, describe, expect, it } from 'vitest'
import { getToolApi } from './api'
import { useEntitlements } from './entitlements'
import { getTools } from './registry'
import { activeSubjectViewId, useWorkspaceStore } from './store'
import './tools'

function memoryStorage(): StorageLike {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

const ws = () => useWorkspaceStore.getState()

beforeAll(async () => {
  useEntitlements.getState().setPlan('all')
  await ws().initialize({
    repository: new DemoRepository({ storage: memoryStorage(), latencyMs: [0, 0] }),
    projectId: PROJECT_ID,
    tools: getTools().map((t) => ({ id: t.id, initialViewState: t.initialViewState })),
    defaultOpenToolIds: ['conceptualize'],
  })
})

describe('Inspector subjects (SDK 1.16)', () => {
  const subject = { id: 'c-1', key: 'CST-001', kind: 'Constraint', title: 'Mass limit', sections: [{ title: 'Bound', fields: [{ label: 'Bound', value: 'm <= 12 kg' }] }] }

  it('keeps a tool record per view, clears it on null, and drops it when a model object is selected', () => {
    const api = getToolApi('conceptualize')
    api.setInspectorSubject!(subject)
    expect(ws().inspectorSubjects.conceptualize?.key).toBe('CST-001')
    api.setInspectorSubject!(null)
    expect(ws().inspectorSubjects.conceptualize).toBeUndefined()
    api.setInspectorSubject!(subject)
    ws().select([])
    expect(ws().inspectorSubjects.conceptualize).toBeDefined()
    const id = ws().model!.objects[0]?.id
    expect(id).toBeTruthy()
    ws().select([id])
    expect(ws().inspectorSubjects).toEqual({})
  })

  it('finds the subject of a secondary view of the active tool, and removes every view of a tool when it closes', () => {
    ws().activateTool('conceptualize')
    getToolApi('conceptualize', 'split:conceptualize').setInspectorSubject!(subject)
    expect(activeSubjectViewId(ws())).toBe('split:conceptualize')
    getToolApi('conceptualize').setInspectorSubject!({ ...subject, key: 'CST-002' })
    expect(activeSubjectViewId(ws())).toBe('conceptualize')
    ws().closeTool('conceptualize')
    expect(ws().inspectorSubjects).toEqual({})
  })
})

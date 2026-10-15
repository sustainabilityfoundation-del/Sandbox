import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateSettingDefinitions, type SettingDefinition } from '@ews/platform-sdk'
import { PLATFORM_SETTINGS } from './platformSettings'
import { effectiveValue, registerDefinitions, saveSettings, useSettingsState, workspaceSettings } from './store'

const access: SettingDefinition = { id: 'ai.access.requirements', label: 'Requirements', description: 'd', scope: 'user', type: 'enum', options: ['off', 'read', 'propose'].map((v) => ({ value: v, label: v })), default: 'propose', ceiling: 'ai.ceiling.requirements' }
const ceiling: SettingDefinition = { ...access, id: 'ai.ceiling.requirements', scope: 'project', ceiling: undefined, requiresPermission: 'administrator' }

afterEach(() => vi.unstubAllGlobals())

describe('workspace settings', () => {
  it('Platform page definitions are valid and namespaced', () => {
    expect(validateSettingDefinitions(PLATFORM_SETTINGS.map((s) => s.definition))).toEqual([])
    expect(PLATFORM_SETTINGS.every((s) => s.definition.id.startsWith('platform.'))).toBe(true)
  })

  it('Platform settings edit the same state as the header controls', () => {
    const theme = PLATFORM_SETTINGS.find((s) => s.definition.id === 'platform.appearance.theme')!
    theme.binding.set('dark')
    expect(theme.binding.get()).toBe('dark')
    theme.binding.set('system')
    expect(theme.binding.get()).toBe('system')
  })

  it('serves effective values to tools (SDK ToolApi.settings): defaults, stored values, clamped to project limits', () => {
    registerDefinitions([access, ceiling])
    expect(workspaceSettings.get('ai.access.requirements')).toBe('propose')
    expect(workspaceSettings.get('unknown.setting.id')).toBeUndefined()
    useSettingsState.setState({ project: { values: { 'ai.ceiling.requirements': 'read' }, etag: '"p:1"' } })
    expect(effectiveValue(useSettingsState.getState(), 'ai.access.requirements')).toBe('read')
    useSettingsState.setState({ user: { values: { 'ai.access.requirements': 'off' }, etag: '"u:1"' } })
    expect(workspaceSettings.get('ai.access.requirements')).toBe('off')
    let notified = 0
    const stop = workspaceSettings.subscribe(() => notified++)
    useSettingsState.setState({ user: { values: {}, etag: '"u:2"' } })
    stop()
    expect(notified).toBe(1)
  })

  it('saves with If-Match and keeps the server’s new ETag; surfaces the server’s refusal', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (JSON.parse(String(init.body)).values['ai.access.requirements'] === 'all') return new Response(JSON.stringify({ error: { code: 'invalid', message: 'Some values were not accepted; nothing was changed.', details: { fields: { 'ai.access.requirements': 'must be one of off, read, propose' } } } }), { status: 422 })
      return new Response(JSON.stringify({ values: { 'ai.access.requirements': 'read' }, etag: '"user:eli:3"' }), { status: 200 })
    })
    useSettingsState.setState({ user: { values: {}, etag: '"user:eli:2"' } })
    await saveSettings('user', { 'ai.access.requirements': 'read' })
    expect((calls[0].init.headers as Record<string, string>)['If-Match']).toBe('"user:eli:2"')
    expect((calls[0].init.headers as Record<string, string>)['X-Dev-User']).toBeTruthy()
    expect(useSettingsState.getState().user.etag).toBe('"user:eli:3"')
    await expect(saveSettings('user', { 'ai.access.requirements': 'all' })).rejects.toMatchObject({ status: 422, details: { fields: { 'ai.access.requirements': expect.any(String) } } })
  })
})

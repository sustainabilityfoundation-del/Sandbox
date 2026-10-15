import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { Badge, Button, Dialog, EmptyState, Notice, SearchField, Select } from '@ews/design-system'
import type { SettingDefinition, SettingValue } from '@ews/platform-sdk'
import { getTools } from '../platform/registry'
import { DEFAULT_LAYOUTS, useWorkspaceStore } from '../platform/store'
import { useHelpCentre } from '../help/workspaceHelp'
import { ApiError } from './api'
import { AiSettingsPage } from './AiSettingsPage'
import { PLATFORM_PAGE, PLATFORM_SETTINGS, type LocalSetting } from './platformSettings'
import { SettingField } from './SettingField'
import { effectiveValue, loadSettings, saveSettings, storedValue, useServerPages, useSettingsState } from './store'
import './settings.css'

/** Settings centre UI state; `?settings=<page-id>` opens a page directly. */
export const useSettingsCentre = create<{ isOpen: boolean; pageId: string; query: string; show: (pageId?: string) => void; setQuery: (q: string) => void; close: () => void }>()((set) => ({
  isOpen: false,
  pageId: PLATFORM_PAGE.id,
  query: '',
  show: (pageId) => set((s) => ({ isOpen: true, pageId: pageId ?? s.pageId, query: '' })),
  setQuery: (query) => set({ query }),
  close: () => set({ isOpen: false }),
}))

interface PageEntry {
  id: string
  title: string
  group: 'Platform' | 'AI' | 'Modules'
  definitions: SettingDefinition[]
}

/** Pages: Platform, AI and reasoning, then one per module that contributes definitions (none: absent). */
function usePages(): PageEntry[] {
  const definitions = useSettingsState((s) => s.definitions)
  const serverPages = useServerPages()
  return useMemo(() => {
    const ai = serverPages.pages.find((p) => p.id === 'ai')
    const pages: PageEntry[] = [
      { id: PLATFORM_PAGE.id, title: PLATFORM_PAGE.title, group: 'Platform', definitions: PLATFORM_SETTINGS.map((s) => s.definition) },
      { id: 'ai', title: ai?.title ?? 'AI and reasoning', group: 'AI', definitions: Object.values(definitions).filter((d) => serverPages.pageOf[d.id] === 'ai') },
    ]
    for (const tool of getTools()) {
      if (!tool.settings?.definitions.length) continue
      pages.push({ id: tool.settings.page.id, title: tool.settings.page.title, group: 'Modules', definitions: tool.settings.definitions })
    }
    return pages
  }, [definitions, serverPages])
}

function syncUrl(pageId: string | null) {
  try {
    const url = new URL(location.href)
    if (pageId) url.searchParams.set('settings', pageId)
    else url.searchParams.delete('settings')
    url.searchParams.delete('ai-connect')
    history.replaceState(history.state, '', url)
  } catch {
    /* not a browser */
  }
}

export function SettingsCentre() {
  const { isOpen, pageId, query, show, setQuery, close } = useSettingsCentre()
  const pages = usePages()
  const status = useSettingsState((s) => s.status)

  // Deep link: ?settings=<page-id> (also used when a provider sign-in returns).
  useEffect(() => {
    const page = new URLSearchParams(location.search).get('settings')
    if (page) show(page)
  }, [show])
  useEffect(() => {
    if (isOpen) {
      syncUrl(pageId)
      if (status === 'idle') void loadSettings()
    } else syncUrl(null)
  }, [isOpen, pageId, status])

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return pages.flatMap((p) => p.definitions.filter((d) => `${d.label} ${d.description} ${d.group ?? ''}`.toLowerCase().includes(q)).map((d) => ({ page: p, d })))
  }, [query, pages])
  const page = pages.find((p) => p.id === pageId)

  return (
    <Dialog title="Settings" isOpen={isOpen} onOpenChange={(open) => !open && close()} size="lg">
      <div className="ws-settings" data-testid="settings-centre">
        <nav className="ws-settings-nav" aria-label="Settings pages">
          <SearchField label="Search settings" placeholder="Search settings" value={query} onChange={setQuery} />
          {query.trim() ? (
            <ul className="ws-settings-list" aria-label="Matching settings" data-testid="settings-results">
              {hits.length === 0 && <li className="text-fg-3">No setting matches “{query}”.</li>}
              {hits.slice(0, 30).map(({ page: p, d }) => (
                <li key={d.id}>
                  <a href={`?settings=${p.id}`} className="ws-help-link" onClick={(e) => (e.preventDefault(), show(p.id), setQuery(''))}>
                    {d.label}
                  </a>
                  <span className="text-ui-xs text-fg-3"> · {p.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            (['Platform', 'AI', 'Modules'] as const).map((group) => {
              const list = pages.filter((p) => p.group === group)
              if (!list.length) return null
              return (
                <section key={group} aria-label={group}>
                  <h3 className="ws-settings-navh">{group === 'AI' ? 'AI' : group}</h3>
                  <ul className="ws-settings-list">
                    {list.map((p) => (
                      <li key={p.id}>
                        <a href={`?settings=${p.id}`} className="ws-help-link" aria-current={p.id === pageId ? 'page' : undefined} data-settings-page={p.id} onClick={(e) => (e.preventDefault(), show(p.id))}>
                          {p.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })
          )}
        </nav>
        <article className="ws-settings-page" aria-live="polite" data-settings-current={page?.id ?? ''}>
          {!page ? (
            <EmptyState icon="settings" title="Choose a settings page">
              Settings page “{pageId}” is not available. Modules without settings do not have a page.
            </EmptyState>
          ) : page.id === PLATFORM_PAGE.id ? (
            <PlatformPage />
          ) : page.id === 'ai' ? (
            <AiSettingsPage definitions={page.definitions} />
          ) : (
            <ServerDefinitionsPage title={page.title} definitions={page.definitions} />
          )}
        </article>
      </div>
    </Dialog>
  )
}

// ---- Platform ------------------------------------------------------------------------------------

function LocalField({ s }: { s: LocalSetting }) {
  const value = useSyncExternalStore(s.binding.subscribe, s.binding.get)
  return <SettingField definition={s.definition} value={value} onChange={(v) => s.binding.set(v)} />
}

function PlatformPage() {
  const layout = useWorkspaceStore((s) => s.layout)
  const layoutClass = useWorkspaceStore((s) => s.layoutClass)
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const detached = useWorkspaceStore((s) => s.detachedViews)
  const forget = useWorkspaceStore((s) => s.forgetDetached)
  const groups = [...new Set(PLATFORM_SETTINGS.map((s) => s.definition.group))]
  return (
    <div className="ws-settings-body" data-testid="settings-platform">
      <header>
        <h2 className="ws-settings-title">Platform</h2>
        <p className="ws-settings-intro">Preferences of this browser, shared with its other workspace windows. The header menus (Display and layout, Requirements service, Subscription) change the same values.</p>
      </header>
      {groups.map((g) => (
        <section key={g} className="ws-settings-group" aria-label={g}>
          <h3 className="ws-settings-h">{g}</h3>
          {PLATFORM_SETTINGS.filter((s) => s.definition.group === g).map((s) => (
            <LocalField key={s.definition.id} s={s} />
          ))}
        </section>
      ))}
      <section className="ws-settings-group" aria-label="Layout and windows" data-help-id="platform.settings">
        <h3 className="ws-settings-h">Layout and windows</h3>
        <p className="ws-setting-help">Layout for {layoutClass === 'spacious' ? 'wide' : 'narrow'} screens. Panel sizes are also adjustable by dragging or in Display and layout.</p>
        <Select
          label="Second view (split)"
          value={layout.split?.toolId ?? 'off'}
          onChange={(v) => setLayout({ split: v === 'off' ? null : { toolId: v, ratio: layout.split?.ratio ?? 0.5 } })}
          options={[{ id: 'off', label: 'Off' }, ...getTools().filter((t) => !t.singleInstance).map((t) => ({ id: t.id, label: t.name }))]}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outlined" icon="reset" onPress={() => setLayout(DEFAULT_LAYOUTS[layoutClass])}>
            Reset layout
          </Button>
          <Button size="sm" variant="outlined" icon="windows" isDisabled={!detached.length} onPress={() => detached.forEach((d) => forget(d.windowId))}>
            Forget remembered windows ({detached.length})
          </Button>
        </div>
      </section>
    </div>
  )
}

// ---- generic server-backed page --------------------------------------------------------------------

/** Renders server-stored definitions grouped by `group`, saving each change (If-Match) and showing the server's verdict. */
export function DefinitionList({ definitions, readOnly }: { definitions: SettingDefinition[]; readOnly?: boolean }) {
  const state = useSettingsState()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const groups = [...new Set(definitions.map((d) => d.group ?? ''))]
  const save = async (d: SettingDefinition, value: SettingValue) => {
    setNotice(null)
    try {
      await saveSettings(d.scope, { [d.id]: value })
      setErrors((e) => ({ ...e, [d.id]: '' }))
    } catch (e) {
      if (e instanceof ApiError && e.details?.fields) setErrors((x) => ({ ...x, ...(e.details!.fields as Record<string, string>) }))
      else setNotice(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <>
      {notice && (
        <Notice tone="warning" title="Not saved">
          {notice}
        </Notice>
      )}
      {groups.map((g) => (
        <section key={g} className="ws-settings-group" aria-label={g || 'Settings'}>
          {g && <h3 className="ws-settings-h">{g}</h3>}
          {definitions
            .filter((d) => (d.group ?? '') === g)
            .map((d) => {
              const stored = storedValue(state, d)
              const effective = effectiveValue(state, d.id)
              const ceiling = d.ceiling ? state.definitions[d.ceiling] : undefined
              const ceilingValue = ceiling ? storedValue(state, ceiling) : undefined
              const limited = ceiling && effective !== stored
              const ceilingNote = ceiling && (limited || ceilingValue !== ceiling.default) ? `Project limit: ${labelOf(ceiling, ceilingValue ?? null)}${limited ? ` (your choice ${labelOf(d, stored)} is narrowed to it)` : ''}.` : undefined
              const projectLocked = d.scope === 'project' && !state.canEditProject
              return <SettingField key={d.id} definition={d} value={effective ?? null} onChange={(v) => void save(d, v)} isDisabled={readOnly || projectLocked || state.status !== 'ready'} ceilingNote={ceilingNote} error={errors[d.id] || undefined} />
            })}
        </section>
      ))}
    </>
  )
}

export function labelOf(d: SettingDefinition, v: SettingValue): string {
  if (d.type === 'enum') return d.options.find((o) => o.value === v)?.label ?? String(v)
  if (d.type === 'boolean') return v ? 'on' : 'off'
  if (d.type === 'number') return `${v}${d.unit ? ` ${d.unit}` : ''}`
  return String(v ?? '')
}

function ServerDefinitionsPage({ title, definitions }: { title: string; definitions: SettingDefinition[] }) {
  const status = useSettingsState((s) => s.status)
  const error = useSettingsState((s) => s.error)
  return (
    <div className="ws-settings-body">
      <h2 className="ws-settings-title">{title}</h2>
      {status === 'unavailable' && (
        <Notice tone="warning" title="Settings service not available">
          {error} Defaults apply.
        </Notice>
      )}
      <DefinitionList definitions={definitions} />
      <Badge>Stored on the settings service</Badge>
    </div>
  )
}

/** Opens help for a settings topic from inside the Settings centre. */
export function openHelp(topicId: string) {
  useSettingsCentre.getState().close()
  useHelpCentre.getState().show(topicId)
}

import { AppIcon, Menu, MenuItem, MenuSection, type IconName } from '@ews/design-system'
import { resolvedTheme, usePreferences } from '@ews/design-system/preferences'
import type { EngineeringObject } from '@ews/model-service'
import { TOOL_CATEGORIES } from '@ews/platform-sdk'
import type { AnyToolDefinition } from '@ews/platform-sdk/react'
import { useMemo } from 'react'
import { Autocomplete, Dialog, Input, Modal, ModalOverlay, SearchField, useFilter } from 'react-aria-components'
import { getToolApi, openToolOrExplain, sharedContextOf } from '../platform/api'
import { PLANS, toolAccess, useEntitlements } from '../platform/entitlements'
import { getTool, getTools } from '../platform/registry'
import { useWorkspaceStore } from '../platform/store'
import { toolIdOfView } from '../platform/views'
import { openInSeparateWindow, restoreWorkspaceWindows } from '../session/windows'
import { useSimulatedFailures } from './WorkArea'
import { useBaselineDialog } from './Baselines'
import { useCapabilitiesDialog } from './CapabilitiesDialog'
import { useCoverageDialog } from './CoverageDialog'

interface Command {
  key: string
  label: string
  icon?: IconName
  description?: string
  keywords?: string
  isDisabled?: boolean
  locked?: boolean
  run: () => void
}

/**
 * Searchable command palette (Ctrl/Cmd+K or the Commands button). Tools come
 * from the registry: favourites, recent tools and every tool by category, with
 * tools outside the subscription shown locked and explained. Commands include
 * the active tool's toolbar actions and registered commands, and workspace
 * actions.
 */
export function CommandPalette({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const { contains } = useFilter({ sensitivity: 'base' })
  const state = useWorkspaceStore()
  const plan = useEntitlements((s) => s.plan)
  const theme = resolvedTheme(usePreferences((s) => s.theme))
  const density = usePreferences((s) => s.density)
  const tools = getTools()
  const active = getTool(state.activeToolId)
  const activeAccess = toolAccess(active?.id)

  const sections = useMemo(() => {
    const toolCommand = (t: AnyToolDefinition, prefix: string): Command => {
      const access = toolAccess(t.id)
      return {
        key: `${prefix}:${t.id}`,
        label: t.name,
        icon: access.ok ? t.icon : 'locked',
        description: access.ok ? t.description : `Locked: not in your subscription (${plan.name}). Your ${t.name} data is kept.`,
        keywords: `${t.category} ${t.description}`,
        isDisabled: !access.ok,
        locked: !access.ok,
        run: () => openToolOrExplain(t.id),
      }
    }
    const byId = (id: string) => tools.find((t) => t.id === id)
    const favourites = state.favorites.map(byId).filter((t) => !!t).map((t) => toolCommand(t, 'fav'))
    const recent = state.recents.map(byId).filter((t) => !!t).slice(0, 4).map((t) => toolCommand(t, 'recent'))
    const categories = TOOL_CATEGORIES.map((category) => ({
      title: category,
      items: tools.filter((t) => t.category === category).map((t) => toolCommand(t, 'tool')),
    })).filter((s) => s.items.length)

    const layout = state.layout
    const workspace: Command[] = [
      { key: 'ws:tree', label: layout.treeOpen ? 'Hide product tree' : 'Show product tree', icon: 'panel-left', run: () => state.setLayout({ treeOpen: !layout.treeOpen }) },
      { key: 'ws:inspector', label: layout.inspectorOpen ? 'Hide inspector' : 'Show inspector', icon: 'panel-right', run: () => state.setLayout({ inspectorOpen: !layout.inspectorOpen }) },
      { key: 'ws:chat', label: 'Open ChatGPT', icon: 'assistant', run: () => state.setLayout({ activityOpen: true, dockTab: 'assistant' }) },
      { key: 'ws:activity', label: 'Open Activity', icon: 'history', run: () => state.setLayout({ activityOpen: true, dockTab: 'activity' }) },
      {
        key: 'ws:favourite',
        label: active && state.favorites.includes(active.id) ? `Remove ${active.name} from favourites` : `Add ${active?.name ?? 'tool'} to favourites`,
        icon: 'favorite',
        isDisabled: !active,
        run: () => active && state.toggleFavorite(active.id),
      },
      { key: 'ws:close', label: `Close ${active?.name ?? 'tool'}`, icon: 'close', isDisabled: !active, run: () => active && state.closeTool(active.id) },
      {
        key: 'ws:win-tool',
        label: `Open ${active?.name ?? 'tool'} in separate window`,
        icon: 'open-window',
        isDisabled: !active || !activeAccess.ok,
        run: () => active && openInSeparateWindow('tool', active.id),
      },
      { key: 'ws:win-inspector', label: 'Open inspector in separate window', icon: 'open-window', run: () => openInSeparateWindow('inspector') },
      { key: 'ws:win-chat', label: 'Open ChatGPT in separate window', icon: 'open-window', run: () => openInSeparateWindow('assistant') },
      { key: 'ws:baseline-create', label: 'Create baseline…', icon: 'baseline', description: 'Pin the exact current definition', run: () => useBaselineDialog.getState().open('create') },
      { key: 'ws:baseline-compare', label: 'Compare with a baseline…', icon: 'baseline', isDisabled: state.baselines.length === 0, run: () => useBaselineDialog.getState().open('compare') },
      { key: 'ws:ai-coverage', label: 'AI capability coverage', icon: 'assistant', description: 'What the assistant can and cannot do', run: () => useCoverageDialog.getState().setOpen(true) },
      { key: 'ws:about', label: 'About this platform: capabilities and roadmap', icon: 'info', run: () => useCapabilitiesDialog.getState().setOpen(true) },
      { key: 'ws:restore', label: 'Restore workspace windows', icon: 'reset', isDisabled: state.detachedViews.length === 0, run: () => restoreWorkspaceWindows() },
      { key: 'ws:theme', label: theme === 'dark' ? 'Use light theme' : 'Use dark theme', icon: theme === 'dark' ? 'theme-light' : 'theme-dark', run: () => usePreferences.getState().setTheme(theme === 'dark' ? 'light' : 'dark') },
      {
        key: 'ws:density',
        label: density === 'compact' ? 'Use comfortable density' : 'Use compact density',
        icon: density === 'compact' ? 'density-comfortable' : 'density-compact',
        run: () => usePreferences.getState().setDensity(density === 'compact' ? 'comfortable' : 'compact'),
      },
    ]

    const subscription: Command[] = PLANS.map((p) => ({
      key: `plan:${p.id}`,
      label: `Demo subscription: ${p.name}`,
      icon: 'subscription',
      description: p.id === plan.id ? 'Current subscription' : p.description,
      isDisabled: p.id === plan.id,
      run: () => useEntitlements.getState().setPlan(p.id),
    }))

    const diagnostics: Command[] = active
      ? [
          {
            key: 'diag:fail',
            label: `Simulate a rendering failure in ${active.name}`,
            icon: 'bug',
            description: 'Demo: the failure is contained to this view',
            isDisabled: !activeAccess.ok,
            run: () => useSimulatedFailures.getState().fail(active.id),
          },
        ]
      : []

    // The active tool's toolbar contribution and registered commands, if the subscription includes it.
    let toolCommands: Command[] = []
    if (active && activeAccess.ok && state.model) {
      const viewId = active.id
      const context = sharedContextOf(state, viewId)
      const selection = context.selectedIds.map((id) => state.model!.get(id)).filter((o): o is EngineeringObject => !!o)
      const viewState = state.viewStates[viewId] ?? state.initialViewStates[toolIdOfView(viewId)]
      toolCommands = [
        ...active.toolbar({ api: getToolApi(active.id, viewId), viewState, context, model: state.model, selection }).flatMap((item) =>
          item.type === 'button'
            ? [
                {
                  key: `cmd:${item.id}`,
                  label: `${active.name}: ${item.label}`,
                  icon: item.icon,
                  description: item.illustrative ? 'Illustrative in this mockup' : item.title,
                  isDisabled: item.disabled,
                  run: item.onClick,
                } satisfies Command,
              ]
            : [],
        ),
        ...(state.commands[viewId] ?? []).map(
          (c): Command => ({ key: `reg:${c.id}`, label: c.label, icon: c.icon, description: c.description, isDisabled: c.disabled, run: c.run }),
        ),
      ]
    }
    return { favourites, recent, categories, workspace, toolCommands, subscription, diagnostics }
  }, [state, tools, active, activeAccess.ok, theme, density, plan])

  const all = [
    ...sections.favourites,
    ...sections.recent,
    ...sections.categories.flatMap((c) => c.items),
    ...sections.toolCommands,
    ...sections.workspace,
    ...sections.subscription,
    ...sections.diagnostics,
  ]

  const renderItem = (c: Command) => (
    <MenuItem
      key={c.key}
      id={c.key}
      icon={c.icon}
      isDisabled={c.isDisabled}
      textValue={`${c.label} ${c.keywords ?? ''}`}
      description={c.description}
      trailing={
        c.locked ? (
          <AppIcon name="locked" size={16} className="text-fg-3" label="Locked" />
        ) : c.key.startsWith('fav:') ? (
          <AppIcon name="favorite" filled size={16} className="text-favorite" label="Favourite" />
        ) : undefined
      }
    >
      {c.label}
    </MenuItem>
  )

  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className="ws-scrim fixed inset-0 z-[180] flex items-start justify-center bg-scrim pt-[10vh] max-sm:pt-0">
      <Modal className="ws-dialog flex max-h-[76dvh] w-[min(640px,calc(100vw-24px))] flex-col overflow-hidden rounded-sheet bg-surface shadow-3 max-sm:h-[var(--visual-viewport-height,100dvh)] max-sm:max-h-none max-sm:w-full max-sm:rounded-none">
        <Dialog aria-label="Tools and commands" className="ws-launcher flex min-h-0 flex-1 flex-col outline-none">
          {/* One Escape always closes the palette, even when a hovered result holds virtual focus. */}
          <div
            className="contents"
            onKeyDownCapture={(e) => {
              if (e.key !== 'Escape') return
              e.preventDefault()
              e.stopPropagation()
              onOpenChange(false)
            }}
          >
            <Autocomplete filter={contains}>
              <SearchField aria-label="Search tools and commands" autoFocus className="flex items-center gap-3 border-b border-line px-4">
                <AppIcon name="search" size={20} className="text-fg-3" />
                <Input
                  placeholder={`Search ${tools.length} tools and commands`}
                  className="h-14 min-w-0 flex-1 bg-transparent text-title text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:hidden pointer-coarse:text-[16px]"
                />
                <kbd className="ws-kbd">Esc</kbd>
              </SearchField>
              <Menu
                aria-label="Tools and commands"
                className="ws-launcher-list min-h-0 flex-1 overflow-auto p-2"
                onAction={(key) => {
                  all.find((c) => c.key === key)?.run()
                  onOpenChange(false)
                }}
                renderEmptyState={() => <div className="px-4 py-6 text-center text-ui-sm text-fg-3">No tools or commands match.</div>}
              >
                {sections.favourites.length > 0 && <MenuSection title="Favourites">{sections.favourites.map(renderItem)}</MenuSection>}
                {sections.recent.length > 0 && <MenuSection title="Recent">{sections.recent.map(renderItem)}</MenuSection>}
                {sections.categories.map((c) => (
                  <MenuSection key={c.title} title={`Tools · ${c.title}`}>
                    {c.items.map(renderItem)}
                  </MenuSection>
                ))}
                {sections.toolCommands.length > 0 && <MenuSection title={`${active?.name} commands`}>{sections.toolCommands.map(renderItem)}</MenuSection>}
                <MenuSection title="Workspace">{sections.workspace.map(renderItem)}</MenuSection>
                <MenuSection title={`Subscription (demo) · ${plan.name}`}>{sections.subscription.map(renderItem)}</MenuSection>
                {sections.diagnostics.length > 0 && <MenuSection title="Diagnostics (demo)">{sections.diagnostics.map(renderItem)}</MenuSection>}
              </Menu>
            </Autocomplete>
          </div>
          <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-ui-xs text-fg-3">
            <span>↑ ↓ move</span>
            <span>Enter run</span>
            <span>Esc close</span>
            <span>Ctrl/Cmd K toggle</span>
          </footer>
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}

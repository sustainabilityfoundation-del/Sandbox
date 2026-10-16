import type { Key } from 'react-aria-components'
import { useConversation } from '../assistant/conversation'
import { DEFAULT_LAYOUTS, useWorkspaceStore, type Layout } from '../platform/store'
import { openInSeparateWindow } from '../session/windows'
import { IconButton, ResizeHandle, Sheet, Spinner, Tab, TabList, TabPanel, Tabs, cx } from '@ews/design-system'
import { ActivityView, latestActivityText } from './ActivityPanel'
import { AssistantPanel } from './assistant/AssistantPanel'
import { dockAssistant } from './layout/presets'
import { PANEL_LIMITS, useViewportSize, type ViewportMode } from './layout/viewport'
import { ValidationView, useValidationSummary } from './ValidationPanel'

type DockTab = Layout['dockTab']

function DockTabs({ open, assistantInDock, desktop, onCollapse, onClose }: { open: boolean; assistantInDock: boolean; desktop: boolean; onCollapse?: () => void; onClose?: () => void }) {
  const stored = useWorkspaceStore((s) => s.layout.dockTab)
  const tab = !assistantInDock && stored === 'assistant' ? 'activity' : stored
  const activity = useWorkspaceStore((s) => s.activity)
  const running = useConversation((s) => s.running !== null)
  const pending = useConversation((s) => Object.values(s.proposals).filter((p) => p.status === 'pending' || p.status === 'conflict').length)
  const serviceName = useConversation((s) => s.service?.info.name)
  const serviceKind = useConversation((s) => s.service?.info.kind)
  const { stale, writeError } = useValidationSummary()
  const issues = stale.length + (writeError ? 1 : 0)

  return (
    <header className="ws-dock-header">
      {onCollapse && (
        <IconButton
          label={open ? 'Collapse bottom panel' : 'Expand bottom panel'}
          icon={open ? 'chevron-down' : 'chevron-up'}
          size="sm"
          aria-expanded={open}
          onPress={onCollapse}
          className={cx('ws-dock-collapse', open && 'is-open')}
        />
      )}
      <TabList aria-label="Bottom panel" className="ws-dock-tabs">
        {assistantInDock && (
          <Tab id="assistant" data-dock-tab="assistant" className="ws-dock-tab">
            AI Assistant
            {serviceKind !== 'remote' && (
              <span className="ws-dock-demo" title={`${serviceName ?? 'Assistant'} (not connected to an AI model; connect in Settings → AI and reasoning)`}>
                Demo
              </span>
            )}
            {running && <Spinner size={14} label="Assistant working" />}
            {pending > 0 && (
              <span className="ws-dock-count" title={`${pending} change preview(s) awaiting review`} aria-label={`${pending} awaiting review`}>
                {pending}
              </span>
            )}
          </Tab>
        )}
        <Tab id="activity" data-dock-tab="activity" className="ws-dock-tab">
          Activity <span className="text-fg-3">{activity.length}</span>
        </Tab>
        <Tab id="validation" data-dock-tab="validation" className="ws-dock-tab">
          Validation
          {issues > 0 && (
            <span className="ws-dock-count is-warning" aria-label={`${issues} issue${issues === 1 ? '' : 's'}`}>
              {issues}
            </span>
          )}
        </Tab>
      </TabList>
      {!open && tab === 'activity' && <span className="ws-dock-latest text-fg-3">{latestActivityText(activity[0])}</span>}
      <span className="flex-1" />
      {tab === 'assistant' && open && desktop && (
        <IconButton label="Dock the assistant on the right" icon="dock-right" size="sm" onPress={() => dockAssistant('right')} />
      )}
      {tab === 'assistant' && open && (
        <IconButton label="Open the assistant in a separate window" icon="open-window" size="sm" onPress={() => openInSeparateWindow('assistant')} />
      )}
      {onClose && <IconButton label="Close panel" icon="close" onPress={onClose} />}
    </header>
  )
}

/**
 * Bottom panel with Activity, Validation and (when docked at the bottom) the assistant. On tablets and desktops it
 * is a collapsible, resizable panel; on phones it is a full-height sheet opened from the bottom navigation. The
 * conversation draft lives in the conversation store, so it survives the sheet closing and layout changes.
 */
export function BottomDock({ mode, assistantInDock = true }: { mode: ViewportMode; assistantInDock?: boolean }) {
  const layout = useWorkspaceStore((s) => s.layout)
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const layoutClass = useWorkspaceStore((s) => s.layoutClass)
  const { height: viewportHeight } = useViewportSize()
  const { activityOpen: open, dockHeight } = layout
  const tab: DockTab = !assistantInDock && layout.dockTab === 'assistant' ? 'activity' : layout.dockTab
  const maxHeight = Math.round(viewportHeight * PANEL_LIMITS.dock.share)

  // Selecting a tab switches and opens the dock; only the collapse button closes it.
  const choose = (key: Key) => setLayout({ dockTab: key as DockTab, activityOpen: true, ...(key === 'assistant' ? { assistantOpen: true } : {}) })

  const panels = (
    <>
      {assistantInDock && (
        <TabPanel id="assistant" shouldForceMount className="ws-dock-view">
          <AssistantPanel />
        </TabPanel>
      )}
      <TabPanel id="activity" shouldForceMount className="ws-dock-view">
        <ActivityView />
      </TabPanel>
      <TabPanel id="validation" shouldForceMount className="ws-dock-view">
        <ValidationView />
      </TabPanel>
    </>
  )

  if (mode === 'phone') {
    return (
      <Sheet
        title={tab === 'assistant' ? 'Assistant' : tab === 'validation' ? 'Validation' : 'Activity'}
        isOpen={open}
        onOpenChange={(o) => setLayout({ activityOpen: o })}
        // The dock tabs (with their own Close button) are the sheet header.
        header={() => null}
      >
        <Tabs selectedKey={tab} onSelectionChange={choose} className="ws-dock is-sheet flex min-h-0 flex-1 flex-col">
          <DockTabs open assistantInDock desktop={false} onClose={() => setLayout({ activityOpen: false })} />
          <div className="ws-dock-body">{panels}</div>
        </Tabs>
      </Sheet>
    )
  }

  return (
    <section className={cx('ws-dock', open && 'is-open')} aria-label="Bottom panel">
      {open && (
        <ResizeHandle
          orientation="horizontal"
          label="Resize bottom panel"
          value={Math.min(dockHeight, maxHeight)}
          min={PANEL_LIMITS.dock.min}
          max={maxHeight}
          invert
          onChange={(h) => setLayout({ dockHeight: h })}
          onReset={() => setLayout({ dockHeight: DEFAULT_LAYOUTS[layoutClass].dockHeight })}
          className="ws-dock-resize"
        />
      )}
      <Tabs selectedKey={tab} onSelectionChange={choose} className="flex min-h-0 flex-col">
        <DockTabs open={open} assistantInDock={assistantInDock} desktop={mode === 'desktop'} onCollapse={() => setLayout({ activityOpen: !open })} />
        <div className="ws-dock-body" hidden={!open} style={{ height: Math.min(dockHeight, maxHeight) }}>
          {panels}
        </div>
      </Tabs>
    </section>
  )
}

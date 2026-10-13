import { useConversation } from '../assistant/conversation'
import { IconButton } from '../sdk/controls'
import { Icons } from '../sdk/icons'
import { DEFAULT_LAYOUTS, useWorkspaceStore } from '../sdk/store'
import { ActivityView, latestActivityText } from './ActivityPanel'
import { AssistantPanel } from './assistant/AssistantPanel'
import { PANEL_LIMITS, useViewportSize, type ViewportMode } from './layout/viewport'
import { ResizeHandle, cx } from './primitives'
import { openInSeparateWindow } from '../session/windows'

/**
 * Bottom dock with Activity and ChatGPT. On tablets and desktops it is a
 * collapsible, resizable panel; on phones it is a full-screen sheet opened
 * from the bottom navigation. It stays mounted in every mode, so the
 * conversation draft and scroll position survive layout changes.
 */
export function BottomDock({ mode }: { mode: ViewportMode }) {
  const layout = useWorkspaceStore((s) => s.layout)
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const layoutClass = useWorkspaceStore((s) => s.layoutClass)
  const activity = useWorkspaceStore((s) => s.activity)
  const running = useConversation((s) => s.running !== null)
  const pending = useConversation((s) => Object.values(s.proposals).filter((p) => p.status === 'pending' || p.status === 'conflict').length)
  const serviceName = useConversation((s) => s.service?.info.name)
  const { height: viewportHeight } = useViewportSize()
  const { activityOpen: open, dockTab: tab, dockHeight } = layout
  const sheet = mode === 'phone'
  const maxHeight = Math.round(viewportHeight * PANEL_LIMITS.dock.share)

  // Tabs switch and open the dock; only the chevron (or Close) collapses it.
  const choose = (next: typeof tab) => setLayout({ dockTab: next, activityOpen: true })

  return (
    <section
      className={cx('ws-dock', open && 'is-open', sheet && 'is-sheet')}
      aria-label="Bottom panel"
      role={sheet && open ? 'dialog' : undefined}
      aria-modal={sheet && open ? true : undefined}
      inert={sheet && !open}
      aria-hidden={sheet && !open ? true : undefined}
    >
      {open && !sheet && (
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
      <header className="ws-dock-header">
        {!sheet && (
          <button
            type="button"
            className="ws-dock-collapse"
            onClick={() => setLayout({ activityOpen: !open })}
            aria-expanded={open}
            aria-label={open ? 'Collapse panel' : 'Expand panel'}
          >
            <Icons.chevron width={12} height={12} className={open ? 'is-open' : ''} />
          </button>
        )}
        <div className="ws-dock-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'activity'}
            className="ws-dock-tab"
            onClick={() => choose('activity')}
            data-dock-tab="activity"
          >
            Activity <span className="ws-muted">{activity.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'assistant'}
            className="ws-dock-tab"
            onClick={() => choose('assistant')}
            data-dock-tab="assistant"
          >
            ChatGPT
            <span className="ws-dock-demo" title={`${serviceName ?? 'Assistant'} (not connected to ChatGPT)`}>
              Demo
            </span>
            {running && <span className="ws-spinner ws-spinner-small" aria-label="Assistant working" />}
            {pending > 0 && (
              <span className="ws-dock-count" title={`${pending} change preview(s) awaiting review`}>
                {pending}
              </span>
            )}
          </button>
        </div>
        {!open && tab === 'activity' && <span className="ws-dock-latest ws-muted">{latestActivityText(activity[0])}</span>}
        <span className="flex-1" />
        {tab === 'assistant' && open && (
          <IconButton label="Open ChatGPT in separate window" icon={Icons.external} size="sm" onClick={() => openInSeparateWindow('assistant')} />
        )}
        {sheet && <IconButton label="Close panel" icon={Icons.close} onClick={() => setLayout({ activityOpen: false })} />}
      </header>
      <div
        className="ws-dock-body"
        hidden={!open}
        style={sheet ? undefined : { height: Math.min(dockHeight, maxHeight) }}
      >
        <div className="ws-dock-view" hidden={tab !== 'activity'}>
          <ActivityView />
        </div>
        <div className="ws-dock-view" hidden={tab !== 'assistant'}>
          <AssistantPanel />
        </div>
      </div>
    </section>
  )
}

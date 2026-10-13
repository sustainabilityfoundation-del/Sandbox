import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useConversation } from '../assistant/conversation'
import { useWorkspaceStore } from '../sdk/store'
import { Icons } from '../sdk/icons'
import { ActivityView, latestActivityText } from './ActivityPanel'
import { AssistantPanel } from './assistant/AssistantPanel'

const MIN_HEIGHT = 140

/** Collapsible, resizable bottom dock hosting Activity and the ChatGPT panel. */
export function BottomDock() {
  const layout = useWorkspaceStore((s) => s.layout)
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const activity = useWorkspaceStore((s) => s.activity)
  const running = useConversation((s) => s.running !== null)
  const pending = useConversation((s) => Object.values(s.proposals).filter((p) => p.status === 'pending' || p.status === 'conflict').length)
  const serviceName = useConversation((s) => s.service?.info.name)
  const drag = useRef<{ y: number; height: number } | null>(null)
  const { activityOpen: open, dockTab: tab, dockHeight } = layout

  // Tabs switch and open the dock; only the chevron collapses it.
  const choose = (next: typeof tab) => setLayout({ dockTab: next, activityOpen: true })

  const onResizeStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, height: dockHeight }
  }
  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const max = Math.round(window.innerHeight * 0.7)
    const height = Math.min(max, Math.max(MIN_HEIGHT, drag.current.height + (drag.current.y - e.clientY)))
    setLayout({ dockHeight: height })
  }

  return (
    <section className={`ws-dock${open ? ' is-open' : ''}`} aria-label="Bottom dock">
      {open && (
        <div
          className="ws-dock-resize"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize panel"
          title="Drag to resize"
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        />
      )}
      <header className="ws-dock-header">
        <button
          type="button"
          className="ws-dock-collapse"
          onClick={() => setLayout({ activityOpen: !open })}
          aria-expanded={open}
          aria-label={open ? 'Collapse panel' : 'Expand panel'}
        >
          <Icons.chevron width={12} height={12} className={open ? 'is-open' : ''} />
        </button>
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
            {pending > 0 && <span className="ws-dock-count" title={`${pending} change preview(s) awaiting review`}>{pending}</span>}
          </button>
        </div>
        {!open && tab === 'activity' && <span className="ws-dock-latest ws-muted">{latestActivityText(activity[0])}</span>}
      </header>
      {open && (
        <div className="ws-dock-body" style={{ height: dockHeight }}>
          {tab === 'activity' ? <ActivityView /> : <AssistantPanel />}
        </div>
      )}
    </section>
  )
}

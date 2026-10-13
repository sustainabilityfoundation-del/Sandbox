import { useState } from 'react'
import type { ActivityKind } from '../domain/types'
import { useWorkspaceStore } from '../sdk/store'
import { Icons } from '../sdk/icons'
import { formatTime } from '../sdk/ui'
import { getTool } from '../tools/registry'

const KIND_LABEL: Record<ActivityKind, string> = {
  change: 'Change',
  save: 'Save',
  run: 'Run',
  review: 'Review',
  info: 'Info',
  error: 'Error',
}

const FILTERS: { id: 'all' | ActivityKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'save', label: 'Saves' },
  { id: 'run', label: 'Runs' },
  { id: 'change', label: 'Changes' },
  { id: 'review', label: 'Reviews' },
  { id: 'error', label: 'Errors' },
]

export function ActivityPanel() {
  const activity = useWorkspaceStore((s) => s.activity)
  const open = useWorkspaceStore((s) => s.layout.activityOpen)
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const model = useWorkspaceStore((s) => s.model)!
  const select = useWorkspaceStore((s) => s.select)
  const [filter, setFilter] = useState<'all' | ActivityKind>('all')
  const visible = filter === 'all' ? activity : activity.filter((a) => a.kind === filter)

  return (
    <section className={`ws-activity${open ? ' is-open' : ''}`} aria-label="Activity">
      <header className="ws-activity-header">
        <button
          type="button"
          className="ws-activity-toggle"
          onClick={() => setLayout({ activityOpen: !open })}
          aria-expanded={open}
        >
          <Icons.chevron width={12} height={12} className={open ? 'is-open' : ''} />
          Activity
          <span className="ws-muted">{activity.length}</span>
        </button>
        {!open && activity[0] && (
          <span className="ws-activity-latest ws-muted">
            {formatTime(activity[0].at)} · {activity[0].message}
          </span>
        )}
        {open && (
          <div className="ws-segmented ws-segmented-small" role="group" aria-label="Filter activity">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        )}
      </header>
      {open && (
        <div className="ws-activity-list" role="log">
          {visible.length === 0 && <p className="ws-muted">No activity.</p>}
          {visible.map((a) => (
            <div key={a.id} className={`ws-activity-row is-${a.kind}`}>
              <span className="ws-activity-time">{formatTime(a.at)}</span>
              <span className={`ws-activity-kind is-${a.kind}`}>{KIND_LABEL[a.kind]}</span>
              <span className="ws-activity-tool">{a.toolId ? (getTool(a.toolId)?.name ?? a.toolId) : 'Workspace'}</span>
              <span className="ws-activity-msg">{a.message}</span>
              <span className="ws-activity-objs">
                {a.objectIds
                  .filter((id) => model.get(id))
                  .slice(0, 3)
                  .map((id) => (
                    <button key={id} type="button" className="ws-link ws-mono" onClick={() => select([id])}>
                      {id}
                    </button>
                  ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

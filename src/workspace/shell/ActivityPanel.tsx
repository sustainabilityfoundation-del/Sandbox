import { useState } from 'react'
import { useConversation } from '../assistant/conversation'
import type { ActivityEntry, ActivityKind } from '../domain/types'
import { useWorkspaceStore } from '../sdk/store'
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

/** Activity sources that aren't registered tools. */
const OTHER_SOURCES: Record<string, string> = { assistant: 'ChatGPT panel' }

export function sourceName(toolId: string | undefined): string {
  if (!toolId) return 'Workspace'
  return getTool(toolId)?.name ?? OTHER_SOURCES[toolId] ?? toolId
}

export function latestActivityText(entry: ActivityEntry | undefined): string {
  return entry ? `${formatTime(entry.at)} · ${entry.message}` : ''
}

export function ActivityView() {
  const activity = useWorkspaceStore((s) => s.activity)
  const model = useWorkspaceStore((s) => s.model)!
  const select = useWorkspaceStore((s) => s.select)
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const focusMessage = useConversation((s) => s.focusMessage)
  const conversationId = useConversation((s) => s.conversationId)
  const [filter, setFilter] = useState<'all' | ActivityKind>('all')
  const visible = filter === 'all' ? activity : activity.filter((a) => a.kind === filter)

  return (
    <div className="ws-activity-view">
      <div className="ws-activity-filters">
        <div className="ws-segmented ws-segmented-small" role="group" aria-label="Filter activity">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="ws-activity-list" role="log">
        {visible.length === 0 && <p className="ws-muted">No activity.</p>}
        {visible.map((a) => (
          <div key={a.id} className={`ws-activity-row is-${a.kind}`}>
            <span className="ws-activity-time">{formatTime(a.at)}</span>
            <span className={`ws-activity-kind is-${a.kind}`}>{KIND_LABEL[a.kind]}</span>
            <span className="ws-activity-tool">{sourceName(a.toolId)}</span>
            <span className="ws-activity-msg">
              {a.message}
              {a.source && (
                <button
                  type="button"
                  className="ws-activity-source"
                  title={
                    a.source.conversationId === conversationId
                      ? 'Show in the conversation'
                      : `From conversation ${a.source.conversationId}, which is no longer open`
                  }
                  disabled={a.source.conversationId !== conversationId}
                  onClick={() => {
                    setLayout({ activityOpen: true, dockTab: 'assistant' })
                    focusMessage(a.source!.messageId)
                  }}
                >
                  {a.source.label}
                </button>
              )}
            </span>
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
    </div>
  )
}

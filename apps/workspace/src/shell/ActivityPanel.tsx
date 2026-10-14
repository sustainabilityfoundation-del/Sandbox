import { useState } from 'react'
import { useConversation } from '../assistant/conversation'
import type { ActivityEntry, ActivityKind } from '@ews/model-service'
import { useWorkspaceStore } from '../platform/store'
import { formatTime } from '@ews/platform-sdk/react'
import { toolName } from '../platform/registry'
import { Button, SegmentedControl } from '@ews/design-system'

const KIND_LABEL: Record<ActivityKind, string> = {
  change: 'Change',
  save: 'Save',
  run: 'Run',
  review: 'Review',
  baseline: 'Baseline',
  info: 'Info',
  error: 'Error',
}

const FILTERS: { value: 'all' | ActivityKind; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'save', label: 'Saves' },
  { value: 'baseline', label: 'Baselines' },
  { value: 'change', label: 'Changes' },
  { value: 'review', label: 'Reviews' },
  { value: 'error', label: 'Errors' },
]

/** Source of an activity entry: a tool (including retired ones), ChatGPT or the workspace. */
export function sourceName(toolId: string | undefined): string {
  return toolName(toolId)
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
        <SegmentedControl label="Filter activity" size="sm" options={FILTERS} value={filter} onChange={setFilter} />
      </div>
      <div className="ws-activity-list" role="log">
        {visible.length === 0 && <p className="p-2 text-fg-3">No activity.</p>}
        {visible.map((a) => (
          <div key={a.id} className={`ws-activity-row is-${a.kind}`}>
            <span className="ws-activity-time">{formatTime(a.at)}</span>
            <span className={`ws-activity-kind is-${a.kind}`}>{KIND_LABEL[a.kind]}</span>
            <span className="ws-activity-tool">{sourceName(a.toolId)}</span>
            <span className="ws-activity-msg" title={a.message}>
              {a.message}
            </span>
            <span className="ws-activity-objs">
              {/* Kept out of the truncated message so it is always visible and clickable. */}
              {a.source && (
                <Button
                  size="sm"
                  variant="text"
                  icon="assistant"
                  className="ws-activity-source"
                  aria-label={
                    a.source.conversationId === conversationId
                      ? `${a.source.label}: show in the conversation`
                      : `${a.source.label}: from conversation ${a.source.conversationId}, which is no longer open`
                  }
                  isDisabled={a.source.conversationId !== conversationId}
                  onPress={() => {
                    setLayout({ activityOpen: true, dockTab: 'assistant' })
                    focusMessage(a.source!.messageId)
                  }}
                >
                  {a.source.label}
                </Button>
              )}
              {a.objectIds
                .filter((id) => model.get(id))
                .slice(0, 3)
                .map((id) => (
                  <Button key={id} size="sm" variant="text" className="font-mono" onPress={() => select([id])}>
                    {id}
                  </Button>
                ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

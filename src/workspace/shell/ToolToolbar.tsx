import { useMemo, type ReactNode } from 'react'
import type { EngineeringObject } from '../domain/types'
import { getToolApi, sharedContextOf } from '../sdk/api'
import { useWorkspaceStore } from '../sdk/store'
import type { ToolDefinition, ToolbarItem } from '../sdk/toolTypes'
import { toolIdOfView } from '../sdk/views'

/**
 * Renders a tool's toolbar contribution for one view instance, in the shared
 * style. In narrow containers, buttons with icons collapse to icon-only (their
 * label stays as the accessible name) and the row scrolls horizontally.
 */
export function ToolToolbar({
  tool,
  viewId = tool.id,
  trailing,
}: {
  tool: ToolDefinition<unknown>
  viewId?: string
  trailing?: ReactNode
}) {
  const state = useWorkspaceStore()
  const viewState = state.viewStates[viewId] ?? state.initialViewStates[toolIdOfView(viewId)]
  const model = state.model!
  const context = sharedContextOf(state, viewId)
  const selection = useMemo(
    () => context.selectedIds.map((id) => model.get(id)).filter((o): o is EngineeringObject => !!o),
    [context.selectedIds, model],
  )
  const items = tool.toolbar({ api: getToolApi(tool.id, viewId), viewState, context, model, selection })
  const hasIllustrative = items.some((i) => i.type === 'button' && i.illustrative)

  return (
    <div className="ws-toolbar-row">
      <div className="ws-toolbar" role="toolbar" aria-label={`${tool.name} toolbar`}>
        {items.map((item) => (
          <ToolbarControl key={item.id} item={item} />
        ))}
        {hasIllustrative && (
          <span className="ws-toolbar-legend" title="Controls marked with a dotted underline are illustrative in this mockup">
            <span className="ws-illustrative-sample">Dotted</span> = illustrative
          </span>
        )}
      </div>
      {trailing && <div className="ws-toolbar-trailing">{trailing}</div>}
    </div>
  )
}

function ToolbarControl({ item }: { item: ToolbarItem }) {
  switch (item.type) {
    case 'separator':
      return <span className="ws-toolbar-sep" aria-hidden="true" />
    case 'text':
      return <span className={`ws-toolbar-text${item.tone ? ` is-${item.tone}` : ''}`}>{item.text}</span>
    case 'select':
      return (
        <label className="ws-toolbar-select" title={item.title}>
          <span className="ws-tbtn-label">{item.label}</span>
          <select value={item.value} onChange={(e) => item.onChange(e.target.value)} disabled={item.disabled} aria-label={item.label}>
            {item.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )
    case 'button': {
      const Icon = item.icon
      const classes = [
        'ws-tbtn',
        Icon ? 'has-icon' : '',
        item.primary ? 'is-primary' : '',
        item.illustrative ? 'is-illustrative' : '',
        item.busy ? 'is-busy' : '',
      ].join(' ')
      return (
        <button
          type="button"
          className={classes}
          onClick={item.onClick}
          disabled={item.disabled}
          aria-pressed={item.active === undefined ? undefined : item.active}
          aria-label={item.label}
          title={item.illustrative ? `${item.title ?? item.label} (illustrative in this mockup)` : (item.title ?? item.label)}
          data-toolbar-id={item.id}
        >
          {item.busy ? <span className="ws-spinner ws-spinner-small" aria-hidden="true" /> : Icon && <Icon width={15} height={15} aria-hidden="true" />}
          <span className="ws-tbtn-label" aria-hidden="true">
            {item.label}
          </span>
        </button>
      )
    }
  }
}

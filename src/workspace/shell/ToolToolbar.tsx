import { useMemo } from 'react'
import type { EngineeringObject } from '../domain/types'
import { getToolApi, sharedContextOf } from '../sdk/api'
import { useWorkspaceStore } from '../sdk/store'
import type { ToolDefinition, ToolbarItem } from '../sdk/toolTypes'

/** Renders the active tool's toolbar contribution in a consistent style. */
export function ToolToolbar({ tool }: { tool: ToolDefinition<unknown> }) {
  const state = useWorkspaceStore()
  const viewState = state.viewStates[tool.id] ?? state.initialViewStates[tool.id]
  const model = state.model!
  const context = sharedContextOf(state)
  const selection = useMemo(
    () => state.context.selectedIds.map((id) => model.get(id)).filter((o): o is EngineeringObject => !!o),
    [state.context.selectedIds, model],
  )
  const items = tool.toolbar({ api: getToolApi(tool.id), viewState, context, model, selection })
  const hasIllustrative = items.some((i) => i.type === 'button' && i.illustrative)

  return (
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
          <span>{item.label}</span>
          <select value={item.value} onChange={(e) => item.onChange(e.target.value)} disabled={item.disabled}>
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
          title={item.illustrative ? `${item.title ?? item.label} (illustrative in this mockup)` : item.title}
          data-toolbar-id={item.id}
        >
          {item.busy ? <span className="ws-spinner ws-spinner-small" aria-hidden="true" /> : Icon && <Icon width={14} height={14} />}
          <span>{item.label}</span>
        </button>
      )
    }
  }
}

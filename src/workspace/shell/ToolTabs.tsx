import { useWorkspaceStore } from '../sdk/store'
import { Icons } from '../sdk/icons'
import { getTool } from '../tools/registry'

export function ToolTabs({ onOpenLauncher }: { onOpenLauncher: () => void }) {
  const openToolIds = useWorkspaceStore((s) => s.openToolIds)
  const activeToolId = useWorkspaceStore((s) => s.activeToolId)
  const activateTool = useWorkspaceStore((s) => s.activateTool)
  const closeTool = useWorkspaceStore((s) => s.closeTool)

  return (
    <div className="ws-tabs" role="tablist" aria-label="Open tools">
      {openToolIds.map((id) => {
        const tool = getTool(id)
        if (!tool) return null
        const Icon = tool.icon
        const active = id === activeToolId
        return (
          <div key={id} className={`ws-tab${active ? ' is-active' : ''}`}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className="ws-tab-main"
              onClick={() => activateTool(id)}
              data-tool-id={id}
            >
              <Icon width={14} height={14} />
              <span>{tool.name}</span>
            </button>
            <button
              type="button"
              className="ws-tab-close"
              aria-label={`Close ${tool.name}`}
              onClick={() => closeTool(id)}
              disabled={openToolIds.length === 1}
            >
              <Icons.close width={11} height={11} />
            </button>
          </div>
        )
      })}
      <button type="button" className="ws-tab-add" onClick={onOpenLauncher} title="Open tool launcher (Ctrl+K)">
        <Icons.grid width={14} height={14} />
        <span>Tools</span>
        <kbd>Ctrl K</kbd>
      </button>
    </div>
  )
}

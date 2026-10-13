import { Component, Suspense, useState, type ErrorInfo, type ReactNode } from 'react'
import type { EngineeringObject } from '../domain/types'
import { ToolScope } from '../sdk/hooks'
import { useWorkspaceStore } from '../sdk/store'
import type { ToolDefinition } from '../sdk/toolTypes'
import { Notice } from '../sdk/ui'
import { getTool, getTools } from '../tools/registry'

class ToolErrorBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Tool "${this.props.name}" crashed`, error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="ws-tool-error">
          <Notice tone="danger" title={`${this.props.name} failed to load`}>
            {this.state.error.message}
          </Notice>
        </div>
      )
    }
    return this.props.children
  }
}

const TYPE_LABEL: Record<string, string> = {
  assembly: 'assembly',
  part: 'part',
  requirement: 'requirement',
  procedure: 'verification procedure',
}

/** Explains, without changing the selection, when a tool can't show what is selected. */
function UnsupportedSelectionNotice({ tool }: { tool: ToolDefinition<unknown> }) {
  const model = useWorkspaceStore((s) => s.model)!
  const selectedIds = useWorkspaceStore((s) => s.context.selectedIds)
  const activateTool = useWorkspaceStore((s) => s.activateTool)
  const unsupported = selectedIds
    .map((id) => model.get(id))
    .filter((o): o is EngineeringObject => !!o && !tool.supportedObjectTypes.includes(o.type))
  if (!unsupported.length) return null

  const types = [...new Set(unsupported.map((o) => o.type))]
  const alternatives = getTools().filter((t) => t.id !== tool.id && types.every((type) => t.supportedObjectTypes.includes(type)))
  return (
    <div className="ws-unsupported">
      <Notice
        tone="info"
        title={`${tool.name} can't display ${unsupported.map((o) => `${o.id} ${o.name}`).join(', ')}`}
        actions={alternatives.slice(0, 3).map((t) => (
          <button key={t.id} type="button" className="ws-button ws-button-small" onClick={() => activateTool(t.id)}>
            Open in {t.name}
          </button>
        ))}
      >
        It is a {types.map((t) => TYPE_LABEL[t] ?? t).join(' / ')}, which this tool doesn't show. The selection is kept.
      </Notice>
    </div>
  )
}

/**
 * Hosts tool views from the registry. Views load on demand; tools that declare
 * keepMounted stay mounted (hidden) after first use.
 */
export function WorkArea() {
  const activeToolId = useWorkspaceStore((s) => s.activeToolId)
  const openToolIds = useWorkspaceStore((s) => s.openToolIds)
  const [visited, setVisited] = useState<Set<string>>(() => new Set())

  if (activeToolId && !visited.has(activeToolId)) {
    setVisited(new Set(visited).add(activeToolId))
  }

  const mounted = openToolIds.filter(
    (id) => id === activeToolId || (getTool(id)?.keepMounted && visited.has(id)),
  )
  const active = getTool(activeToolId)

  return (
    <div className="ws-work">
      {active && <UnsupportedSelectionNotice tool={active} />}
      {!active && <div className="ws-work-empty">No tool open. Press Ctrl+K to open the tool launcher.</div>}
      {mounted.map((id) => {
        const tool = getTool(id)!
        const View = tool.view
        const isActive = id === activeToolId
        return (
          <div key={id} className="ws-tool-host" hidden={!isActive} data-tool={id}>
            <ToolScope toolId={id} active={isActive}>
              <ToolErrorBoundary name={tool.name}>
                <Suspense
                  fallback={
                    <div className="ws-tool-loading">
                      <span className="ws-spinner" aria-hidden="true" /> Loading {tool.name}…
                    </div>
                  }
                >
                  <View />
                </Suspense>
              </ToolErrorBoundary>
            </ToolScope>
          </div>
        )
      })}
    </div>
  )
}

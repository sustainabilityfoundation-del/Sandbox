import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'
import type { EngineeringObject } from '../domain/types'
import { sharedContextOf } from '../sdk/api'
import { Button, IconButton, Spinner } from '../sdk/controls'
import { ToolScope } from '../sdk/hooks'
import { Icons } from '../sdk/icons'
import { useWorkspaceStore } from '../sdk/store'
import type { ToolDefinition } from '../sdk/toolTypes'
import { Notice } from '../sdk/ui'
import { getTools } from '../tools/registry'
import { openInSeparateWindow } from '../session/windows'
import { windowInfo } from '../session/windowSession'

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
export function UnsupportedSelectionNotice({ tool, viewId = tool.id }: { tool: ToolDefinition<unknown>; viewId?: string }) {
  const model = useWorkspaceStore((s) => s.model)!
  const selectedIds = useWorkspaceStore((s) => sharedContextOf(s, viewId).selectedIds)
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
        actions={
          windowInfo.role === 'main'
            ? alternatives.slice(0, 3).map((t) => (
                <Button key={t.id} size="sm" onClick={() => activateTool(t.id)}>
                  Open in {t.name}
                </Button>
              ))
            : undefined
        }
      >
        It is a {types.map((t) => TYPE_LABEL[t] ?? t).join(' / ')}, which this tool doesn't show. The selection is kept.
      </Notice>
    </div>
  )
}

/**
 * Follow / Pin control for a view instance, plus "Open in separate window".
 * A pinned view keeps its objects (and the configuration it was pinned in) for
 * comparison while the workspace selection moves on.
 */
export function ViewControls({
  viewId,
  detach,
  extra,
}: {
  viewId: string
  /** What "Open in separate window" opens; omitted inside detached windows. */
  detach?: { kind: 'tool' | 'inspector' | 'assistant'; toolId?: string }
  extra?: ReactNode
}) {
  const model = useWorkspaceStore((s) => s.model)!
  const pin = useWorkspaceStore((s) => s.views[viewId]?.pin ?? null)
  const context = useWorkspaceStore((s) => s.context)
  const setPin = useWorkspaceStore((s) => s.setPin)
  const configDiffers = pin && pin.configurationId !== context.configurationId

  return (
    <div className="ws-view-controls">
      {pin ? (
        <>
          <span className="ws-pin-badge" title="This view keeps its objects while the workspace selection changes">
            <Icons.pin width={13} height={13} aria-hidden="true" />
            Pinned: {pin.ids.length ? pin.ids.map((id) => model.get(id)?.id ?? id).join(', ') : 'nothing'}
          </span>
          {configDiffers && (
            <span className="ws-config-diff" title={`Workspace is in ${context.configurationId}`}>
              {pin.configurationId} ≠ workspace {context.configurationId}
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={() => setPin(viewId, null)}>
            Follow workspace
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          icon={Icons.pin}
          onClick={() => setPin(viewId, { ids: context.selectedIds, configurationId: context.configurationId })}
          disabled={context.selectedIds.length === 0}
          title={context.selectedIds.length ? 'Keep showing the current selection in this view' : 'Select an object to pin it'}
        >
          Pin
        </Button>
      )}
      {extra}
      {detach && (
        <IconButton
          label="Open in separate window"
          icon={Icons.external}
          size="sm"
          onClick={() => openInSeparateWindow(detach.kind, detach.toolId)}
        />
      )}
    </div>
  )
}

/** Mounts a tool view for one view instance, loading it on demand. */
export function ToolViewHost({
  tool,
  viewId = tool.id,
  active,
  hidden = false,
}: {
  tool: ToolDefinition<unknown>
  viewId?: string
  active: boolean
  hidden?: boolean
}) {
  const View = tool.view
  return (
    <div className="ws-tool-host" hidden={hidden} data-tool={tool.id} data-view-id={viewId}>
      <ToolScope toolId={tool.id} viewId={viewId} active={active}>
        <ToolErrorBoundary name={tool.name}>
          <Suspense
            fallback={
              <div className="ws-tool-loading">
                <Spinner /> Loading {tool.name}…
              </div>
            }
          >
            <View />
          </Suspense>
        </ToolErrorBoundary>
      </ToolScope>
    </div>
  )
}

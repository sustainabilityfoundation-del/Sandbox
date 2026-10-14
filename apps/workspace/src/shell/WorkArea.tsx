import { Badge, Button, EmptyState, IconButton, LoadingState, Notice, ToggleButton } from '@ews/design-system'
import { displayId, type EngineeringObject } from '@ews/model-service'
import { OBJECT_TYPE_LABEL } from '@ews/platform-sdk/react'
import { ToolScope, type AnyToolDefinition } from '@ews/platform-sdk/react'
import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { create } from 'zustand'
import { openToolOrExplain, sharedContextOf } from '../platform/api'
import { PLANS, canOpenTool, useEntitlements } from '../platform/entitlements'
import { getTools } from '../platform/registry'
import { useWorkspaceStore } from '../platform/store'
import { openInSeparateWindow } from '../session/windows'
import { windowInfo } from '../session/windowSession'

/**
 * Demo control: view instances asked to fail on their next render, to show
 * that a tool failure is contained ("Simulate a tool rendering failure" in the
 * command palette).
 */
export const useSimulatedFailures = create<{ views: Set<string>; fail: (viewId: string) => void; clear: (viewId: string) => void }>()((set) => ({
  views: new Set(),
  fail: (viewId) => set((s) => ({ views: new Set(s.views).add(viewId) })),
  clear: (viewId) =>
    set((s) => {
      const views = new Set(s.views)
      views.delete(viewId)
      return { views }
    }),
}))

function SimulatedFailure({ viewId, children }: { viewId: string; children: ReactNode }) {
  const failing = useSimulatedFailures((s) => s.views.has(viewId))
  if (failing) throw new Error('Simulated rendering failure (demo). The rest of the workspace keeps working.')
  return <>{children}</>
}

class ToolErrorBoundary extends Component<{ name: string; viewId: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Tool "${this.props.name}" failed to render`, error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-4" data-tool-error={this.props.viewId}>
          <Notice
            tone="danger"
            title={`${this.props.name} stopped working`}
            actions={
              <Button
                size="sm"
                variant="outlined"
                icon="reset"
                onPress={() => {
                  useSimulatedFailures.getState().clear(this.props.viewId)
                  this.setState({ error: null })
                }}
              >
                Reload tool
              </Button>
            }
          >
            {this.state.error.message} Other tools, the inspector, Activity and ChatGPT are not affected, and saved work is in the repository.
          </Notice>
        </div>
      )
    }
    return this.props.children
  }
}

/** Shown instead of a tool the subscription doesn't include. Data is never deleted. */
export function LockedToolNotice({ tool }: { tool: AnyToolDefinition }) {
  const plan = useEntitlements((s) => s.plan)
  const plansWithTool = PLANS.filter((p) => p.entitlements.includes(tool.entitlement)).map((p) => p.name)
  return (
    <div className="ws-locked" data-locked-tool={tool.id}>
      <EmptyState icon="locked" title={`${tool.name} is not in your subscription`}>
        Your subscription ({plan.name}) doesn’t include {tool.name}. Everything created with it is kept: it still appears in the
        product tree, inspector and Activity, and becomes editable again when the subscription includes the tool. Available in:{' '}
        {plansWithTool.join(', ')}.
      </EmptyState>
    </div>
  )
}

/** Explains, without changing the selection, when a tool can't show what is selected. */
export function UnsupportedSelectionNotice({ tool, viewId = tool.id }: { tool: AnyToolDefinition; viewId?: string }) {
  const model = useWorkspaceStore((s) => s.model)!
  const selectedIds = useWorkspaceStore((s) => sharedContextOf(s, viewId).selectedIds)
  const unsupported = selectedIds
    .map((id) => model.get(id))
    .filter((o): o is EngineeringObject => !!o && !tool.supportedObjectTypes.includes(o.type))
  if (!unsupported.length) return null

  const types = [...new Set(unsupported.map((o) => o.type))]
  const alternatives = getTools().filter((t) => t.id !== tool.id && canOpenTool(t.id) && types.every((type) => t.supportedObjectTypes.includes(type)))
  return (
    <div className="ws-unsupported">
      <Notice
        tone="info"
        title={`${tool.name} can't display ${unsupported.map((o) => `${displayId(o)} ${o.name}`).join(', ')}`}
        actions={
          windowInfo.role === 'main'
            ? alternatives.slice(0, 3).map((t) => (
                <Button key={t.id} size="sm" variant="outlined" onPress={() => openToolOrExplain(t.id)}>
                  Open in {t.name}
                </Button>
              ))
            : undefined
        }
      >
        It is a {types.map((t) => OBJECT_TYPE_LABEL[t].toLowerCase()).join(' / ')}, which this tool doesn't show. The selection is kept.
      </Notice>
    </div>
  )
}

/**
 * Follow / Pin for a view instance, plus "Open in separate window". A pinned
 * view keeps its objects (and the configuration it was pinned in) while the
 * workspace selection moves on.
 */
export function ViewControls({
  viewId,
  detach,
}: {
  viewId: string
  /** What "Open in separate window" opens; omitted inside detached windows. */
  detach?: { kind: 'tool' | 'inspector' | 'assistant'; toolId?: string }
}) {
  const model = useWorkspaceStore((s) => s.model)!
  const pin = useWorkspaceStore((s) => s.views[viewId]?.pin ?? null)
  const context = useWorkspaceStore((s) => s.context)
  const setPin = useWorkspaceStore((s) => s.setPin)
  const configDiffers = pin && pin.configurationId !== context.configurationId

  return (
    <div className="ws-view-controls">
      {pin && (
        <Badge tone="info" icon="pin" title="This view keeps its objects while the workspace selection changes" className="ws-pin-badge">
          Pinned: {pin.ids.length ? pin.ids.map((id) => model.get(id)?.id ?? id).join(', ') : 'nothing'}
        </Badge>
      )}
      {configDiffers && (
        <Badge tone="warning" icon="warning" title={`The workspace is now in ${context.configurationId}`} className="ws-config-diff">
          {pin.configurationId} ≠ workspace {context.configurationId}
        </Badge>
      )}
      <ToggleButton
        size="sm"
        icon="pin"
        isSelected={!!pin}
        isDisabled={!pin && context.selectedIds.length === 0}
        onChange={(pinned) => setPin(viewId, pinned ? { ids: context.selectedIds, configurationId: context.configurationId } : null)}
        aria-label={pin ? 'Follow workspace selection' : 'Pin this view to the current selection'}
      >
        <span className="ws-pin-label">{pin ? 'Follow' : 'Pin'}</span>
      </ToggleButton>
      {detach && (
        <IconButton label="Open in separate window" icon="open-window" size="sm" onPress={() => openInSeparateWindow(detach.kind, detach.toolId)} />
      )}
    </div>
  )
}

/**
 * Mounts a tool view for one view instance, loading it on demand. Checks the
 * subscription at render time too, so a tool that loses its entitlement while
 * open (in any window) is replaced by an explanation.
 */
export function ToolViewHost({ tool, viewId = tool.id, active }: { tool: AnyToolDefinition; viewId?: string; active: boolean }) {
  const entitled = useEntitlements((s) => s.has(tool.entitlement))
  if (!entitled) return <LockedToolNotice tool={tool} />
  const View = tool.view
  return (
    <div className="ws-tool-host" data-tool={tool.id} data-view-id={viewId}>
      <ToolScope toolId={tool.id} viewId={viewId} active={active}>
        <ToolErrorBoundary name={tool.name} viewId={viewId}>
          <Suspense fallback={<LoadingState label={`Loading ${tool.name}…`} />}>
            <SimulatedFailure viewId={viewId}>
              <View />
            </SimulatedFailure>
          </Suspense>
        </ToolErrorBoundary>
      </ToolScope>
    </div>
  )
}


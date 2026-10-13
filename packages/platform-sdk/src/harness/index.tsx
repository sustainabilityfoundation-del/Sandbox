import {
  AppIcon,
  Badge,
  Button,
  ComboBox,
  EmptyState,
  LoadingState,
  Notice,
  SegmentedControl,
  Select,
  ToggleButton,
  Toaster,
  Toolbar,
  ToolbarSeparator,
  cx,
} from '@ews/design-system'
import { initPreferences, resolvedTheme, usePreferences } from '@ews/design-system/preferences'
import type { EngineeringObject } from '@ews/model-service'
import { Component, StrictMode, Suspense, useEffect, useMemo, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { useStore } from 'zustand'
import { SDK_VERSION, isSdkCompatible } from '../contract/version'
import type { AnyToolDefinition } from '../react/defineTool'
import { PlatformHostProvider, ToolScope } from '../react/host'
import { formatTime, iconForType } from '../react/ui'
import { createMockHost, type MockHost } from './mockHost'

export { createMockHost, type MockHost } from './mockHost'

const VIEW_ID = 'harness'

class ViewBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Tool view crashed in the harness', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-4">
          <Notice tone="danger" title="The tool view failed to render" actions={<Button size="sm" variant="outlined" icon="reset" onPress={() => this.setState({ error: null })}>Try again</Button>}>
            {this.state.error.message}
          </Notice>
        </div>
      )
    }
    return this.props.children
  }
}

/** A plain rendering of the tool's toolbar contribution (the workspace adds overflow handling). */
function HarnessToolbar({ tool, host }: { tool: AnyToolDefinition; host: MockHost }) {
  const state = useStore(host.store)
  const model = state.model!
  const api = host.getToolApi(tool.id, VIEW_ID)
  const context = host.getContext(VIEW_ID)
  const selection = context.selectedIds.map((id) => model.get(id)).filter((o): o is EngineeringObject => !!o)
  const items = tool.toolbar({ api, viewState: host.getViewState(VIEW_ID, tool.id), context, model, selection })
  return (
    <Toolbar aria-label={`${tool.name} toolbar`} className="flex flex-wrap items-center gap-1 border-b border-line bg-surface px-2 py-1">
      {items.map((item) => {
        if (item.type === 'separator') return <ToolbarSeparator key={item.id} />
        if (item.type === 'text') return <span key={item.id} className="px-2 text-ui-sm text-fg-3">{item.text}</span>
        if (item.type === 'select') {
          return (
            <Select
              key={item.id}
              ariaLabel={item.label}
              size="sm"
              value={item.value}
              isDisabled={item.disabled}
              onChange={item.onChange}
              options={item.options.map((o) => ({ id: o.value, label: o.label }))}
            />
          )
        }
        return item.active !== undefined && !item.primary ? (
          <ToggleButton key={item.id} size="sm" icon={item.icon} isSelected={item.active} isDisabled={item.disabled} onChange={() => item.onClick()} data-toolbar-id={item.id}>
            <span className={cx(item.illustrative && 'underline decoration-dotted underline-offset-4')}>{item.label}</span>
          </ToggleButton>
        ) : (
          <Button key={item.id} size="sm" variant={item.primary ? 'filled' : 'quiet'} icon={item.icon} isPending={item.busy} isDisabled={item.disabled} onPress={item.onClick} data-toolbar-id={item.id}>
            <span className={cx(item.illustrative && 'underline decoration-dotted underline-offset-4')}>{item.label}</span>
          </Button>
        )
      })}
    </Toolbar>
  )
}

function SidePanel({ host }: { host: MockHost }) {
  const state = useStore(host.store)
  const model = state.model!
  const selected = state.context.selectedIds.map((id) => model.get(id)).filter((o): o is EngineeringObject => !!o)
  const commands = state.commands[VIEW_ID] ?? []
  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-auto border-l border-line bg-surface p-3 text-ui-sm" aria-label="Harness inspector">
      <section>
        <h2 className="m-0 mb-2 text-ui-xs font-medium text-fg-3">Shared selection (mock host)</h2>
        {selected.length === 0 ? (
          <p className="m-0 text-fg-3">Nothing selected.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {selected.map((o) => (
              <li key={o.id} className="flex items-center gap-2">
                <AppIcon name={iconForType(o.type)} size="sm" />
                <span className="font-mono">{o.id}</span> {o.name}
                <span className="text-fg-3">rev {o.revision}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="m-0 mb-2 text-ui-xs font-medium text-fg-3">Registered commands</h2>
        {commands.length === 0 ? (
          <p className="m-0 text-fg-3">None.</p>
        ) : (
          <div className="flex flex-col items-start gap-1">
            {commands.map((c) => (
              <Button key={c.id} size="sm" variant="text" icon={c.icon} isDisabled={c.disabled} onPress={c.run}>
                {c.label}
              </Button>
            ))}
          </div>
        )}
      </section>
      {state.openRequests.length > 0 && (
        <Notice tone="info" title="Open tool requested">
          The harness hosts one tool. Requested: {state.openRequests.join(', ')}.
        </Notice>
      )}
      <section className="min-h-0">
        <h2 className="m-0 mb-2 text-ui-xs font-medium text-fg-3">Activity (model rev {model.revision})</h2>
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Activity">
          {state.activity.slice(0, 12).map((a) => (
            <li key={a.id} className="border-b border-line pb-1.5">
              <div className="text-ui-xs text-fg-3">{formatTime(a.at)} · {a.kind}</div>
              <div>{a.message}</div>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  )
}

function Harness({ tool, host }: { tool: AnyToolDefinition; host: MockHost }) {
  const state = useStore(host.store)
  const theme = usePreferences((s) => s.theme)
  const compatible = isSdkCompatible(tool.sdkVersion)
  useEffect(() => {
    void host.load()
  }, [host])
  const objects = useMemo(() => state.model?.objects ?? [], [state.model])

  if (state.status === 'loading') return <LoadingState label="Loading sample data…" />
  if (state.status === 'error' || !state.model) return <Notice tone="danger" title="Could not load sample data">{state.error}</Notice>
  const View = tool.view
  const snapshot = state.model.snapshot

  return (
    <div className="grid h-dvh grid-rows-[auto_auto_auto_minmax(0,1fr)] bg-bg text-fg">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-3 py-2">
        <AppIcon name={tool.icon} size="lg" className="text-accent" />
        <div className="mr-auto">
          <h1 className="m-0 text-title font-medium">{tool.name}: standalone harness</h1>
          <div className="text-ui-xs text-fg-3">
            {tool.id} v{tool.version} · built for SDK {tool.sdkVersion}, harness SDK {SDK_VERSION} · entitlement {tool.entitlement} (not enforced here)
          </div>
        </div>
        <Badge tone="warning" icon="warning">Mock platform host · sample data</Badge>
        <SegmentedControl
          label="Theme"
          size="sm"
          value={resolvedTheme(theme)}
          onChange={(t) => usePreferences.getState().setTheme(t)}
          options={[
            { value: 'light', label: 'Light', icon: 'theme-light' },
            { value: 'dark', label: 'Dark', icon: 'theme-dark' },
          ]}
        />
        <Button size="sm" variant="outlined" icon="reset" onPress={() => void host.resetSampleData()}>
          Reset sample data
        </Button>
      </header>
      <div className="flex flex-wrap items-end gap-3 border-b border-line bg-surface-2 px-3 py-2" role="group" aria-label="Simulated platform context">
        <Select label="Configuration" size="sm" value={state.context.configurationId} onChange={host.setConfiguration} options={snapshot.configurations.map((c) => ({ id: c.id, label: c.name }))} />
        <Select label="Scenario" size="sm" value={state.context.scenarioId} onChange={host.setScenario} options={snapshot.scenarios.map((s) => ({ id: s.id, label: s.name }))} />
        <ComboBox
          label="Select an object (as another tool would)"
          placeholder="ID or name"
          options={objects.map((o) => ({ id: o.id, label: `${o.id} ${o.name}`, description: o.type, icon: iconForType(o.type) }))}
          onSelect={(o) => host.select([String(o.id)], '')}
          className="min-w-64"
        />
        <Button size="sm" variant="text" icon="close" onPress={() => host.select([], '')} isDisabled={!state.context.selectedIds.length}>
          Clear selection
        </Button>
      </div>
      {compatible ? <HarnessToolbar tool={tool} host={host} /> : <div />}
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_300px] max-md:grid-cols-1">
        <main className="ws-tool-host flex min-h-0 flex-col overflow-hidden bg-surface-2">
          {compatible ? (
            <ToolScope toolId={tool.id} viewId={VIEW_ID} active>
              <ViewBoundary>
                <Suspense fallback={<LoadingState label={`Loading ${tool.name}…`} />}>
                  <View />
                </Suspense>
              </ViewBoundary>
            </ToolScope>
          ) : (
            <EmptyState icon="error" title="Incompatible SDK version">
              {tool.name} needs SDK {tool.sdkVersion}; this harness provides {SDK_VERSION}.
            </EmptyState>
          )}
        </main>
        <SidePanel host={host} />
      </div>
      <Toaster />
    </div>
  )
}

/** Renders a tool in the standalone development harness. Call from the harness entry (harness/main.tsx). */
export function mountHarness(tool: AnyToolDefinition, element: HTMLElement = document.getElementById('root')!): MockHost {
  initPreferences()
  const host = createMockHost(tool)
  createRoot(element).render(
    <StrictMode>
      <PlatformHostProvider host={host}>
        <Harness tool={tool} host={host} />
      </PlatformHostProvider>
    </StrictMode>,
  )
  return host
}

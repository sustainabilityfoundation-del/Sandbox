import '../modeler.css'
import { Badge, Button, EmptyState, LoadingState, Notice, SegmentedControl, Select } from '@ews/design-system'
import { isKindOf, semanticsOf, type Model } from '@ews/sysml-core'
import { useSharedContext } from '@ews/platform-sdk/react'
import { useMemo } from 'react'
import { actionFlowContext, actionFlowView, stateTransitionContext, stateTransitionView } from '../projection/behavior'
import { generalView, interconnectionContext, interconnectionView } from '../projection/graph'
import { ModelBrowser } from './Browser'
import { Diagram } from './Diagram'
import { ConnectDialog, CreateDialog, ProjectDialog } from './Dialogs'
import { useSession, useViewState } from './hooks'
import { Inspector } from './Inspector'
import { HistoryPanel, ValidationPanel } from './Panels'
import { TextEditor } from './TextEditor'
import { CoverageView, MatrixView } from './Matrix'

/** Namespace the General View and the text editor show by default: the first package. */
function defaultRoot(model: Model): string {
  const s = semanticsOf(model)
  return s.ownedMembers(model.rootId).find((m) => isKindOf(m['@type'], 'Package'))?.['@id'] ?? model.rootId
}

/** Nearest package or definition owning an element (text editing and General View roots). */
function namespaceRootOf(model: Model, id: string | null): string | null {
  if (!id) return null
  const s = semanticsOf(model)
  let cur: string | undefined = id
  for (let k = 0; cur && k < 50; k++) {
    const el = s.get(cur)
    if (!el) return null
    if (cur === model.rootId || isKindOf(el['@type'], 'Package') || isKindOf(el['@type'], 'Definition')) return model.isLibrary(cur) ? null : cur
    cur = s.owner(cur)?.['@id']
  }
  return null
}

export default function ModelerView() {
  const { session, state } = useSession()
  const { projectId: platformProjectId } = useSharedContext()
  const [vs, update] = useViewState()
  const model = state.model

  const root = useMemo(() => {
    if (!model) return null
    if (vs.rootId && model.has(vs.rootId)) return vs.rootId
    return defaultRoot(model)
  }, [model, vs.rootId])
  const icRoot = useMemo(() => {
    if (!model) return null
    const fromRoot = vs.rootId ? interconnectionContext(model, vs.rootId) : undefined
    const fromSel = vs.selectedId ? interconnectionContext(model, vs.selectedId) : undefined
    return fromRoot ?? fromSel ?? null
  }, [model, vs.rootId, vs.selectedId])
  /** Context of the behaviour views: from the shown root, then the selection, then the first one in the model. */
  const behaviourRoot = useMemo(() => {
    if (!model || (vs.view !== 'action-flow' && vs.view !== 'state-transition')) return null
    const find = vs.view === 'action-flow' ? actionFlowContext : stateTransitionContext
    const fromRoot = vs.rootId ? find(model, vs.rootId) : undefined
    const fromSel = vs.selectedId ? find(model, vs.selectedId) : undefined
    if (fromRoot ?? fromSel) return (fromRoot ?? fromSel)!
    const kind = vs.view === 'action-flow' ? 'ActionDefinition' : 'StateDefinition'
    for (const el of model.elements()) if (!model.isLibrary(el['@id']) && el['@type'] === kind && find(model, el['@id']) === el['@id']) return el['@id']
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, vs.rootId, vs.selectedId, vs.view, state.revision])
  const graph = useMemo(() => {
    if (!model || !root) return null
    if (vs.view === 'interconnection') return icRoot ? interconnectionView(model, icRoot) : null
    if (vs.view === 'action-flow') return behaviourRoot ? actionFlowView(model, behaviourRoot) : null
    if (vs.view === 'state-transition') return behaviourRoot ? stateTransitionView(model, behaviourRoot) : null
    return generalView(model, root)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, root, icRoot, behaviourRoot, vs.view, state.revision])

  if (!session) return <Notice tone="danger" title="System Model is not configured">The host did not provide a SysML client.</Notice>
  if (state.status === 'idle' || state.status === 'loading') return <LoadingState label="Loading the SysML model" />
  if (state.status === 'error')
    return (
      <div className="smod-pad">
        <Notice tone="danger" title="The SysML model could not be loaded" actions={<Button size="sm" icon="reset" onPress={() => void session.open(platformProjectId)}>Retry</Button>}>
          {state.error} {session.client.mode === 'api' ? 'Check that the API is running (npm run dev:api) and that your user has the SysML entitlement and project membership.' : ''}
        </Notice>
      </div>
    )
  if (state.status === 'empty' || !model)
    return (
      <div className="smod-pad">
        <EmptyState
          icon="sysml"
          title="This project has no SysML model yet"
          action={
            <div className="smod-empty-actions" data-help-id="sysml-modeler.start">
              <Button variant="filled" icon="add" onPress={() => void session.ensureProject().catch(() => update({ dialog: { kind: 'project' } }))}>Start modelling</Button>
              <Button variant="text" onPress={() => update({ dialog: { kind: 'project' } })}>New SysML project…</Button>
            </div>
          }
        >
          Nothing is created until you start. Start modelling creates a versioned SysML model with an empty package; every change is a commit you can inspect and undo.
        </EmptyState>
        <ProjectDialog session={session} />
      </div>
    )

  const s = semanticsOf(model)
  const textRoot = namespaceRootOf(model, vs.selectedId) ?? root ?? model.rootId
  const rootLabel = (id: string | null) => (!id ? '' : id === model.rootId ? 'model root' : (s.qualifiedName(id) ?? s.label(id)))

  return (
    <div className="smod-root" data-pane={vs.pane}>
      <div className="smod-statusbar">
        {state.projects.length > 1 ? (
          <Select ariaLabel="SysML project" size="sm" value={state.project!.id} onChange={(id) => void session.open(state.project!.platformProjectId, id)} options={state.projects.map((p) => ({ id: p.id, label: p.name }))} />
        ) : (
          <strong className="smod-project">{state.project?.name}</strong>
        )}
        <Select ariaLabel="Branch" size="sm" value={state.branch!.id} onChange={(id) => void session.switchBranch(id)} options={state.branches.map((b) => ({ id: b.id, label: `branch ${b.name}` }))} />
        <Badge tone="neutral" icon="history">{`commit #${state.commits[0]?.number ?? '?'}`}</Badge>
        <Badge tone={session.client.mode === 'api' ? 'success' : 'warning'}>{session.client.mode === 'api' ? 'API (PostgreSQL)' : 'Local (this browser)'}</Badge>
        {state.busy && <Badge tone="info" icon="spinner" spin>Saving</Badge>}
        <span className="smod-spacer" />
        <Badge tone="neutral">SysML v2 subset · not a conformance claim</Badge>
      </div>
      <div className="smod-panes">
      <SegmentedControl
        label="Pane"
        size="sm"
        value={vs.pane}
        onChange={(pane) => update({ pane })}
        options={[
          { value: 'browser', label: 'Browser', icon: 'tree' },
          { value: 'view', label: 'View', icon: 'sysml-block' },
          { value: 'properties', label: 'Properties', icon: 'tune' },
        ]}
      />
      </div>
      <aside className="smod-left" aria-label="Model browser">
        <ModelBrowser model={model} revision={state.revision} />
      </aside>
      <main className="smod-center" aria-label="View">
        {vs.tab === 'diagram' && graph && (
          <Diagram
            graph={graph}
            mode={vs.view}
            revision={state.revision}
            title={rootLabel(vs.view === 'interconnection' ? icRoot : vs.view === 'general' ? root : behaviourRoot)}
            onOpen={(id) => {
              const el = model.get(id)
              if (!el) return
              if (vs.view === 'general' && (isKindOf(el['@type'], 'Package') || isKindOf(el['@type'], 'Definition'))) update({ rootId: id, selectedId: id })
              else if (interconnectionContext(model, id)) update({ rootId: interconnectionContext(model, id)!, view: 'interconnection', selectedId: id })
            }}
            onUp={vs.view === 'general' && root && root !== model.rootId ? () => update({ rootId: s.owningNamespace(root)?.['@id'] ?? model.rootId }) : undefined}
          />
        )}
        {vs.tab === 'diagram' && !graph && vs.view === 'interconnection' && (
          <EmptyState icon="relationship" title="Choose a part definition">The Interconnection View shows the parts, ports and connections inside a part definition or part usage. Select one in the browser and choose Interconnection.</EmptyState>
        )}
        {vs.tab === 'diagram' && !graph && vs.view === 'action-flow' && (
          <EmptyState icon="procedure" title="No action to show">The Action Flow View shows the actions, successions and flows inside an action definition or action usage. Add one in the text editor (action usages and “first a then b;”) or select one in the browser.</EmptyState>
        )}
        {vs.tab === 'diagram' && !graph && vs.view === 'state-transition' && (
          <EmptyState icon="sync" title="No state machine to show">The State Transition View shows the states and transitions inside a state definition or state usage. Add one or select one in the browser.</EmptyState>
        )}
        {vs.tab === 'text' && <TextEditor session={session} model={model} namespaceId={textRoot} revision={state.revision} />}
        {vs.tab === 'validation' && <ValidationPanel session={session} state={state} model={model} />}
        {vs.tab === 'history' && <HistoryPanel session={session} state={state} />}
        {vs.tab === 'matrix' && <MatrixView model={model} scopeId={root ?? model.rootId} connectContext={icRoot} revision={state.revision} />}
        {vs.tab === 'coverage' && <CoverageView model={model} scopeId={root ?? model.rootId} revision={state.revision} />}
      </main>
      <aside className="smod-right" aria-label="Properties">
        <Inspector session={session} model={model} />
      </aside>
      <CreateDialog session={session} model={model} />
      <ConnectDialog session={session} model={model} />
      <ProjectDialog session={session} />
    </div>
  )
}

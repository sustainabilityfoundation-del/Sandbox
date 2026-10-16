import { defineTool, type ClientModule, type ModuleHostEnv, type ToolDefinition } from '@ews/platform-sdk/react'
import { createHttpSysmlClient, createLocalSysmlClient, type StorageLike, type SysmlClient } from '@ews/sysml-client'
import { lazy } from 'react'
import pkg from '../package.json'
import { sysmlModelerAssistant } from './assistant'
import { SYSML_MODELER_CAPABILITIES } from './capabilities'
import { sysmlModelerHelp } from './help'
import { useToasts } from '@ews/design-system'
import { configureClient, message, sessionFor } from './session'
import { INITIAL_VIEW_STATE, type ModelerViewState } from './state'

export type { ModelerViewState } from './state'

/**
 * The SysML Modeler's client module (docs/specifications/module-registration.md, M3): its manifest (capability entries) and its
 * tool. The workspace lists it in `INSTALLED_MODULES`; API mode follows the Requirements service mode (API → /api/sysml/v1 as the
 * development user; demo → explicit in-browser repository).
 */
export function sysmlModelerModule(): ClientModule {
  return {
    manifest: { schemaVersion: 1, id: 'sysml-modeler', name: 'SysML Modeler', capabilities: SYSML_MODELER_CAPABILITIES, entitlement: 'tool:sysml' },
    tool: (env: ModuleHostEnv) => createSysmlModelerTool(env.requirementsMode === 'demo' ? { mode: 'local' } : { mode: 'api', baseUrl: '/api/sysml/v1', devUser: env.devUser }),
  }
}
export { generalView, interconnectionView, connectableEnds } from './projection/graph'
export { actionFlowContext, actionFlowView, stateTransitionContext, stateTransitionView } from './projection/behavior'

export interface SysmlModelerOptions {
  /** 'api': the SysML service at `baseUrl` (default /api/sysml/v1). 'local': in-browser repository (explicit; never a fallback). */
  mode?: 'api' | 'local'
  baseUrl?: string
  /** Development identity (X-Dev-User) for API mode. */
  devUser?: string
  /** Local mode: storage for the in-browser repository (default: memory only). */
  storage?: StorageLike
  /** A ready client (tests, hosts with their own wiring). Overrides mode. */
  client?: SysmlClient
}

/**
 * The SysML Modeler tool (ID `sysml-modeler`, contracts §1). Until the SDK offers a SysML service
 * (change request CR-SYSML-01), the host creates the tool with the client configuration it wants.
 */
export function createSysmlModelerTool(options: SysmlModelerOptions = {}): ToolDefinition<ModelerViewState> {
  const client = options.client ?? (options.mode === 'local' ? createLocalSysmlClient({ seed: true, storage: options.storage }) : createHttpSysmlClient({ baseUrl: options.baseUrl ?? '/api/sysml/v1', devUser: options.devUser }))
  configureClient(client)
  return defineTool<ModelerViewState>({
    id: 'sysml-modeler',
    name: 'SysML Modeler',
    description: 'SysML v2 modeling (supported subset): model browser, textual notation editor, General and Interconnection views, properties, validation, versioned history with undo, and AI operations on the same typed commands.',
    category: 'Systems engineering',
    icon: 'sysml',
    version: pkg.version,
    sdkVersion: '^1.5.0',
    entitlement: 'tool:sysml',
    supportedObjectTypes: [],
    view: lazy(() => import('./view/ModelerView')),
    initialViewState: INITIAL_VIEW_STATE,
    assistant: sysmlModelerAssistant,
    help: sysmlModelerHelp,
    keepMounted: true,
    toolbar: ({ api, viewState, context }) => {
      const session = sessionFor(context.projectId)
      const state = session?.getState()
      const ready = state?.status === 'ready'
      const reverted = new Set(state?.commits.map((c) => c.source.revertedCommitId).filter(Boolean))
      const last = state?.commits.find((c) => c.number > 1 && c.source.kind !== 'revert' && !c.source.revertedCommitId && !reverted.has(c.id))
      return [
        {
          type: 'button',
          id: 'add',
          label: 'Add',
          icon: 'add',
          primary: true,
          priority: 'primary',
          disabled: !ready && state?.status !== 'empty',
          title: ready ? 'Add an element to the selected namespace' : state?.status === 'empty' ? 'Start modelling: creates the SysML model of this project, then adds an element' : 'No model is loaded',
          onClick: () => {
            const openCreate = () => api.updateViewState((vs) => ({ ...vs, dialog: { kind: 'create', ownerId: vs.selectedId } }))
            if (ready) openCreate()
            else if (session && state?.status === 'empty') void session.ensureProject().then(openCreate, (e) => useToasts.getState().push({ tone: 'danger', title: `Could not start the model: ${message(e)}` }))
          },
        },
        {
          type: 'button',
          id: 'connect',
          label: 'Connect',
          icon: 'connect',
          disabled: !ready || viewState.view !== 'interconnection' || !viewState.rootId,
          title: viewState.view === 'interconnection' ? 'Connect two parts or ports of the shown definition' : 'Open an Interconnection View to connect parts',
          onClick: () => viewState.rootId && api.updateViewState({ dialog: { kind: 'connect', contextId: viewState.rootId }, tab: 'diagram' }),
        },
        { type: 'separator', id: 'sep-1' },
        { type: 'button', id: 'general', label: 'General', icon: 'sysml-block', active: viewState.tab === 'diagram' && viewState.view === 'general', title: 'SysML v2 General View of the selected namespace', onClick: () => api.updateViewState({ tab: 'diagram', view: 'general', pane: 'view' }) },
        { type: 'button', id: 'interconnection', label: 'Interconnection', icon: 'relationship', active: viewState.tab === 'diagram' && viewState.view === 'interconnection', title: 'SysML v2 Interconnection View: parts, ports and connections of a part definition', onClick: () => api.updateViewState((vs) => ({ ...vs, tab: 'diagram', view: 'interconnection', pane: 'view' })) },
        { type: 'button', id: 'action-flow', label: 'Action flow', icon: 'procedure', active: viewState.tab === 'diagram' && viewState.view === 'action-flow', title: 'SysML v2 Action Flow View: actions, successions and flows of an action definition or usage', onClick: () => api.updateViewState({ tab: 'diagram', view: 'action-flow', pane: 'view' }) },
        { type: 'button', id: 'state-transition', label: 'States', icon: 'sync', active: viewState.tab === 'diagram' && viewState.view === 'state-transition', title: 'SysML v2 State Transition View: states and transitions of a state definition or usage', onClick: () => api.updateViewState({ tab: 'diagram', view: 'state-transition', pane: 'view' }) },
        { type: 'button', id: 'text', label: 'Text', icon: 'text', active: viewState.tab === 'text', title: 'Edit the selected namespace as SysML v2 textual notation', onClick: () => api.updateViewState({ tab: 'text', pane: 'view' }) },
        { type: 'button', id: 'matrix', label: 'Matrix', icon: 'trace', active: viewState.tab === 'matrix', title: 'Relationship matrices: satisfy, allocate, connect', onClick: () => api.updateViewState({ tab: 'matrix', pane: 'view' }) },
        { type: 'button', id: 'coverage', label: 'Coverage', icon: 'requirement', active: viewState.tab === 'coverage', title: 'Requirement coverage: satisfied and verified requirements, gaps', onClick: () => api.updateViewState({ tab: 'coverage', pane: 'view' }) },
        { type: 'separator', id: 'sep-2' },
        { type: 'button', id: 'validate', label: 'Validate', icon: 'check', priority: 'primary', active: viewState.tab === 'validation', title: 'Validation results of the current model', onClick: () => api.updateViewState({ tab: 'validation', pane: 'view' }) },
        { type: 'button', id: 'history', label: 'History', icon: 'history', active: viewState.tab === 'history', title: 'Commits with provenance; undo', onClick: () => api.updateViewState({ tab: 'history', pane: 'view' }) },
        {
          type: 'button',
          id: 'undo',
          label: 'Undo',
          icon: 'undo',
          disabled: !ready || !last || !!state?.busy,
          title: last ? `Undo commit ${last.number}: ${last.summary}` : 'Nothing to undo',
          onClick: () =>
            last &&
            session &&
            void session.revert(last.id).then(
              (out) => useToasts.getState().push({ tone: 'success', title: out.summaryText }),
              (e) => useToasts.getState().push({ tone: 'danger', title: `Undo refused: ${message(e)}` }),
            ),
        },
      ]
    },
  })
}

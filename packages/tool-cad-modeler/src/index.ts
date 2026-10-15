import { useToasts } from '@ews/design-system'
import { defineTool, type ToolDefinition } from '@ews/platform-sdk/react'
import { lazy } from 'react'
import pkg from '../package.json'
import { cadModelerAssistant } from './assistant'
import { cadModelerHelp } from './help'
import { createHttpCadClient, createLocalCadClient, type CadClient } from '@ews/cad-client'
import { createWorkerKernel } from '@ews/cad-kernel/worker-client'
import { chooseFile } from './files'
// Imported here (not only by the lazy view) so the deep link is captured before the workspace removes ?tool=.
import './deepLink'
export { cadDeepLinkParams, parseCadDeepLink, type CadDeepLink } from './deepLink'
import { cadSession, setDefaultKernelFactory } from './session'
import { INITIAL_VIEW_STATE, type CadModelerViewState } from './viewState'
import { CAD_SETTINGS } from './settings'
export { CAD_SETTINGS, CAD_SETTING_DEFINITIONS, CAD_SETTING_IDS } from './settings'

export type { CadModelerViewState } from './viewState'
/** For platform-level workflow tests: the window's CAD session (documents, kernel, files). */
export { cadSession } from './session'

// Browsers: the geometric kernel runs in a Web Worker, created on first use (tests configure their own).
setDefaultKernelFactory(() => createWorkerKernel())

const fail = (title: string, e: unknown) => useToasts.getState().push({ tone: 'danger', title, body: e instanceof Error ? e.message : String(e) })

const docOf = (vs: CadModelerViewState) => cadSession.document(vs.documentId)

/**
 * CAD Modeler (ADR-0020): parametric part modeling on an exact B-rep kernel (Open CASCADE in a Web
 * Worker). Every toolbar action and dialog runs typed commands from @ews/cad-core, the same ones the
 * assistant proposes. Separate from the mock CAD tool (`cad`) during Phases 0–1 (contracts §1).
 */
export interface CadModelerOptions {
  /**
   * Where documents are stored besides files: 'api' (the CAD document service, /api/cad/v1), 'local'
   * (an explicit in-browser store, labelled) or 'files' (default: files only).
   */
  mode?: 'api' | 'local' | 'files'
  baseUrl?: string
  /** Development identity (X-Dev-User) in API mode. */
  devUser?: string
  client?: CadClient
}

export function createCadModelerTool(options: CadModelerOptions = {}): ToolDefinition<CadModelerViewState> {
  const client = options.client ?? (options.mode === 'api' ? createHttpCadClient({ baseUrl: options.baseUrl ?? '/api/cad/v1', devUser: options.devUser }) : options.mode === 'local' ? createLocalCadClient() : null)
  cadSession.configureStore(client)
  return defineTool<CadModelerViewState>({
  id: 'cad-modeler',
  name: 'CAD Modeler',
  description: 'Parametric part modeling: constrained sketches, extrude and revolve, parameters and regeneration on an exact B-rep kernel; native open format and STEP AP242 export.',
  category: 'Design',
  icon: 'cad',
  version: pkg.version,
  sdkVersion: '^1.5.0',
  // Same subscription as the mock CAD tool (docs/specifications/cad-program-contracts.md §1).
  entitlement: 'tool:cad',
  supportedObjectTypes: ['part', 'assembly'],
  view: lazy(() => import('./CadModelerView')),
  initialViewState: INITIAL_VIEW_STATE,
  assistant: cadModelerAssistant,
  help: cadModelerHelp,
  settings: CAD_SETTINGS,
  keepMounted: true,
  toolbar: ({ api, viewState, context }) => {
    const s = viewState.status
    const run = (title: string, fn: () => Promise<unknown> | unknown) => async () => {
      try {
        await fn()
      } catch (e) {
        fail(title, e)
      }
    }
    return [
      {
        type: 'button',
        id: 'new',
        label: 'New',
        icon: 'add',
        title: 'New document with one part',
        onClick: run('Cannot create a document', async () => {
          const d = await cadSession.newDocument()
          api.updateViewState({ documentId: d.id, editing: { kind: 'new-sketch' }, selection: [], tab: 'edit' })
        }),
      },
      {
        type: 'button',
        id: 'open',
        label: 'Open',
        icon: 'artifact',
        title: client ? 'Open a document of this project, or a native .ewscad file' : 'Open a native .ewscad file (other formats are identified and explained)',
        onClick: () => (client ? api.updateViewState({ dialog: 'open' }) : chooseFile(api)),
      },
      {
        type: 'button',
        id: 'save',
        label: 'Save',
        icon: client ? 'repository' : 'save',
        priority: 'primary',
        disabled: !s.hasDoc,
        title: client
          ? `Save a new revision in project ${context?.projectId ?? 'the current project'} (${client.mode === 'api' ? 'CAD service' : 'local store in this browser tab'})`
          : s.dirty
            ? 'Save the parametric model as .ewscad (unsaved changes)'
            : 'Save the parametric model as .ewscad',
        onClick: run('Cannot save', async () => {
          if (!client) return cadSession.save(viewState.documentId)
          const projectId = api.getContext().projectId
          const r = await cadSession.saveToStore(projectId, viewState.documentId)
          useToasts.getState().push({ tone: 'success', title: r.unchanged ? 'No changes to save' : `Saved revision ${r.revision}`, body: `Project ${projectId}${client.mode === 'local' ? ' (local store in this browser tab)' : ''}.` })
        }),
      },
      {
        type: 'button',
        id: 'download',
        label: 'Save file',
        icon: 'save',
        disabled: !s.hasDoc,
        title: 'Download the parametric model as an open .ewscad file',
        onClick: run('Cannot save the file', () => cadSession.save(viewState.documentId)),
      },
      { type: 'separator', id: 'sep-1' },
      {
        type: 'button',
        id: 'sketch',
        label: 'Sketch',
        icon: 'edit',
        priority: 'primary',
        disabled: !s.hasDoc,
        active: viewState.editing?.kind === 'sketch' || viewState.editing?.kind === 'new-sketch',
        title: 'Create a sketch on a plane',
        onClick: () => api.updateViewState({ editing: { kind: 'new-sketch' }, tab: 'edit' }),
      },
      {
        type: 'button',
        id: 'extrude',
        label: 'Extrude',
        icon: 'arrow-right',
        priority: 'primary',
        disabled: !s.hasDoc,
        active: viewState.editing?.kind === 'extrude',
        title: 'Extrude a closed sketch profile (new body, join or cut)',
        onClick: () => api.updateViewState({ editing: { kind: 'extrude' }, tab: 'edit' }),
      },
      {
        type: 'button',
        id: 'revolve',
        label: 'Revolve',
        icon: 'sync',
        disabled: !s.hasDoc,
        active: viewState.editing?.kind === 'revolve',
        title: 'Revolve a closed sketch profile about an axis',
        onClick: () => api.updateViewState({ editing: { kind: 'revolve' }, tab: 'edit' }),
      },
      {
        type: 'button',
        id: 'fillet',
        label: 'Fillet',
        icon: 'tune',
        disabled: !s.hasBody,
        active: viewState.editing?.kind === 'fillet',
        title: 'Round edges of a body (edges chosen by stable name)',
        onClick: () => api.updateViewState({ editing: { kind: 'fillet' }, tab: 'edit' }),
      },
      {
        type: 'button',
        id: 'chamfer',
        label: 'Chamfer',
        icon: 'dimensions',
        disabled: !s.hasBody,
        active: viewState.editing?.kind === 'chamfer',
        title: 'Bevel edges of a body',
        onClick: () => api.updateViewState({ editing: { kind: 'chamfer' }, tab: 'edit' }),
      },
      {
        type: 'button',
        id: 'pattern',
        label: 'Pattern',
        icon: 'windows',
        active: viewState.editing?.kind === 'pattern-linear',
        disabled: !s.hasBody,
        title: 'Repeat an extrude or revolve (for example a pocket) along a direction',
        onClick: () => api.updateViewState({ editing: { kind: 'pattern-linear' }, tab: 'edit' }),
      },
      {
        type: 'button',
        id: 'datum',
        label: 'Datum plane',
        icon: 'split',
        disabled: !s.hasDoc,
        active: viewState.editing?.kind === 'datum-plane',
        title: 'Reference plane offset from a standard plane, another datum plane or a planar face',
        onClick: () => api.updateViewState({ editing: { kind: 'datum-plane' }, tab: 'edit' }),
      },
      { type: 'separator', id: 'sep-2' },
      { type: 'button', id: 'undo', label: 'Undo', icon: 'undo', disabled: !s.canUndo, title: 'Undo the last change (Ctrl+Z)', onClick: run('Cannot undo', () => docOf(viewState)?.engine.undo()) },
      { type: 'button', id: 'redo', label: 'Redo', icon: 'reset', disabled: !s.canRedo, title: 'Redo (Ctrl+Y)', onClick: run('Cannot redo', () => docOf(viewState)?.engine.redo()) },
      { type: 'button', id: 'fit', label: 'Fit', icon: 'fit', title: 'Fit the model in the view (F)', onClick: () => api.updateViewState({ viewRequest: { kind: 'fit', seq: Date.now() } }) },
      {
        type: 'button',
        id: 'export-step',
        label: 'Export STEP',
        icon: 'open-window',
        disabled: !s.hasBody,
        title: 'Export exact geometry as STEP AP242',
        onClick: run('STEP export failed', async () => {
          const r = await cadSession.exportStep(viewState.documentId)
          useToasts.getState().push({ tone: r.inspection.valid ? 'success' : 'warning', title: `Exported ${r.file.name}`, body: `${r.inspection.applicationProtocol}, ${r.inspection.entities.MANIFOLD_SOLID_BREP} solid(s), ${r.inspection.entities.ADVANCED_FACE} faces, ${r.inspection.lengthUnit ?? 'unknown unit'}.` })
          api.updateViewState({ tab: 'diagnostics' })
        }),
      },
    ]
  },
  })
}

/** The CAD Modeler with files only (tests, hosts without the CAD service). The workspace uses createCadModelerTool. */
export const cadModelerTool = createCadModelerTool()

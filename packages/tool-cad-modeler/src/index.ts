import { useToasts } from '@ews/design-system'
import type { ToolApi } from '@ews/platform-sdk'
import { defineTool } from '@ews/platform-sdk/react'
import { lazy } from 'react'
import pkg from '../package.json'
import { cadModelerAssistant } from './assistant'
import { cadModelerHelp } from './help'
import { createWorkerKernel } from '@ews/cad-kernel/worker-client'
import { cadSession, setDefaultKernelFactory } from './session'
import { INITIAL_VIEW_STATE, type CadModelerViewState } from './viewState'

export type { CadModelerViewState } from './viewState'
/** For platform-level workflow tests: the window's CAD session (documents, kernel, files). */
export { cadSession } from './session'

// Browsers: the geometric kernel runs in a Web Worker, created on first use (tests configure their own).
setDefaultKernelFactory(() => createWorkerKernel())

const fail = (title: string, e: unknown) => useToasts.getState().push({ tone: 'danger', title, body: e instanceof Error ? e.message : String(e) })

const docOf = (vs: CadModelerViewState) => cadSession.document(vs.documentId)

/** Opens a native file chosen by the user (a file picker created on demand, no visible input). */
function chooseFile(api: ToolApi<CadModelerViewState>) {
  if (typeof document === 'undefined') return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.ewscad,.json,.step,.stp,.iges,.igs,.stl,.3mf,.sldprt,.ipt,.catpart,.prt,.x_t,.jt,.3dm,.fcstd,application/json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const d = await cadSession.openText(await file.text(), file.name)
      api.updateViewState({ documentId: d.id, editing: null, selection: [], tab: 'model', viewRequest: { kind: 'fit', seq: Date.now() } })
      useToasts.getState().push({ tone: 'success', title: `Opened ${file.name}`, body: `Version ${d.engine.document.version}, regenerated from the native model.` })
    } catch (e) {
      fail(`Cannot open ${file.name}`, e)
    }
  }
  input.click()
}

/**
 * CAD Modeler (ADR-0020): parametric part modeling on an exact B-rep kernel (Open CASCADE in a Web
 * Worker). Every toolbar action and dialog runs typed commands from @ews/cad-core, the same ones the
 * assistant proposes. Separate from the mock CAD tool (`cad`) during Phases 0–1 (contracts §1).
 */
export const cadModelerTool = defineTool<CadModelerViewState>({
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
  keepMounted: true,
  toolbar: ({ api, viewState }) => {
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
      { type: 'button', id: 'open', label: 'Open', icon: 'artifact', title: 'Open a native .ewscad file (other formats are identified and explained)', onClick: () => chooseFile(api) },
      {
        type: 'button',
        id: 'save',
        label: 'Save',
        icon: 'save',
        priority: 'primary',
        disabled: !s.hasDoc,
        title: s.dirty ? 'Save the parametric model as .ewscad (unsaved changes)' : 'Save the parametric model as .ewscad',
        onClick: run('Cannot save', () => cadSession.save(viewState.documentId)),
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

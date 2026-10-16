import { cadHelp } from './help'
import { defineTool } from '@ews/platform-sdk/react'
import { lazy } from 'react'
import pkg from '../package.json'
import { cadAssistant } from './assistant'
import { FIT_CAMERA, INITIAL_VIEW_STATE, type CadViewState } from './domain'

export type { CadViewState } from './domain'

const zoomBy = (factor: number) => (vs: CadViewState): CadViewState => ({
  ...vs,
  camera: { ...vs.camera, zoom: Math.min(8, Math.max(0.5, vs.camera.zoom * factor)) },
})

/** CAD: a mock, parametric side elevation of the actuator assembly. Not a CAD kernel. */
export const cadTool = defineTool<CadViewState>({
  id: 'cad',
  name: 'CAD',
  description: 'Mock assembly geometry: select parts, pan, zoom, visibility and a few editable demonstration dimensions.',
  category: 'Design',
  icon: 'cad',
  version: pkg.version,
  sdkVersion: '^1.0.0',
  entitlement: 'tool:cad',
  supportedObjectTypes: ['assembly', 'part', 'cad-representation', 'requirement'],
  view: lazy(() => import('./CadView')),
  initialViewState: INITIAL_VIEW_STATE,
  assistant: cadAssistant,
  help: cadHelp,
  toolbar: ({ api, viewState }) => [
    {
      type: 'button',
      id: 'select',
      label: 'Select',
      icon: 'select',
      priority: 'primary',
      active: viewState.mode === 'select',
      title: 'Click or tap parts to select them in every tool',
      onClick: () => api.updateViewState({ mode: 'select' }),
    },
    {
      type: 'button',
      id: 'pan',
      label: 'Pan',
      icon: 'pan',
      active: viewState.mode === 'pan',
      title: 'Drag to pan (dragging also pans in Select mode); scroll or pinch to zoom',
      onClick: () => api.updateViewState({ mode: 'pan' }),
    },
    { type: 'button', id: 'zoom-in', label: 'Zoom in', icon: 'zoom-in', onClick: () => api.updateViewState(zoomBy(1.25)) },
    { type: 'button', id: 'zoom-out', label: 'Zoom out', icon: 'zoom-out', onClick: () => api.updateViewState(zoomBy(0.8)) },
    {
      type: 'button',
      id: 'fit',
      label: 'Fit',
      icon: 'fit',
      priority: 'primary',
      title: 'Fit the whole assembly',
      onClick: () => api.updateViewState({ camera: FIT_CAMERA }),
    },
    { type: 'separator', id: 'sep-1' },
    {
      type: 'button',
      id: 'dimensions',
      label: 'Dimensions',
      icon: 'dimensions',
      priority: 'primary',
      active: viewState.panel === 'dimensions',
      title: 'Show and edit the demonstration dimensions of the selected part',
      onClick: () => api.updateViewState((vs) => ({ ...vs, panel: vs.panel === 'dimensions' ? null : 'dimensions' })),
    },
    {
      type: 'button',
      id: 'visibility',
      label: 'Visibility',
      icon: 'visibility',
      active: viewState.panel === 'visibility',
      title: 'Show or hide parts in this view',
      onClick: () => api.updateViewState((vs) => ({ ...vs, panel: vs.panel === 'visibility' ? null : 'visibility' })),
    },
  ],
})

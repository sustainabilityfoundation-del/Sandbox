import { lazy } from 'react'
import { Icons, defineTool } from '../../sdk'

export interface Camera {
  cx: number
  cy: number
  zoom: number
}

export interface GeometryViewState {
  camera: Camera
  mode: 'select' | 'pan' | 'measure'
  section: boolean
  showLabels: boolean
}

export const FIT_CAMERA: Camera = { cx: 500, cy: 170, zoom: 1 }

export const geometryTool = defineTool<GeometryViewState>({
  id: 'geometry',
  name: 'Geometry',
  description: 'Assembly layout. Click components to select them across all tools.',
  icon: Icons.geometry,
  category: 'Design',
  supportedObjectTypes: ['assembly', 'part'],
  view: lazy(() => import('./GeometryView')),
  initialViewState: { camera: FIT_CAMERA, mode: 'select', section: false, showLabels: true },
  toolbar: ({ api, viewState }) => [
    {
      type: 'button',
      id: 'select',
      label: 'Select',
      icon: Icons.pointer,
      active: viewState.mode === 'select',
      onClick: () => api.updateViewState({ mode: 'select' }),
      title: 'Click components to select them',
    },
    {
      type: 'button',
      id: 'pan',
      label: 'Pan',
      icon: Icons.hand,
      active: viewState.mode === 'pan',
      onClick: () => api.updateViewState({ mode: 'pan' }),
      title: 'Drag to pan; scroll to zoom in any mode',
    },
    {
      type: 'button',
      id: 'zoom-in',
      label: 'Zoom in',
      icon: Icons.zoomIn,
      onClick: () => api.updateViewState((vs) => ({ ...vs, camera: { ...vs.camera, zoom: Math.min(8, vs.camera.zoom * 1.25) } })),
    },
    {
      type: 'button',
      id: 'zoom-out',
      label: 'Zoom out',
      icon: Icons.zoomOut,
      onClick: () => api.updateViewState((vs) => ({ ...vs, camera: { ...vs.camera, zoom: Math.max(0.5, vs.camera.zoom / 1.25) } })),
    },
    {
      type: 'button',
      id: 'fit',
      label: 'Fit',
      icon: Icons.fit,
      onClick: () => api.updateViewState({ camera: FIT_CAMERA }),
      title: 'Fit the whole assembly',
    },
    { type: 'separator', id: 'sep-1' },
    {
      type: 'button',
      id: 'section',
      label: 'Section',
      icon: Icons.section,
      active: viewState.section,
      illustrative: true,
      onClick: () => api.updateViewState((vs) => ({ ...vs, section: !vs.section })),
    },
    {
      type: 'button',
      id: 'measure',
      label: 'Measure',
      icon: Icons.ruler,
      active: viewState.mode === 'measure',
      illustrative: true,
      onClick: () => api.updateViewState((vs) => ({ ...vs, mode: vs.mode === 'measure' ? 'select' : 'measure' })),
    },
    { type: 'separator', id: 'sep-2' },
    {
      type: 'button',
      id: 'labels',
      label: 'Labels',
      active: viewState.showLabels,
      onClick: () => api.updateViewState((vs) => ({ ...vs, showLabels: !vs.showLabels })),
    },
  ],
})

import { lazy } from 'react'
import { Icons, defineTool } from '../../sdk'
import { bridge, type ModelViewerViewState } from './bridge'

/**
 * The standalone GLB viewer, registered as a workspace tool. Its view (and
 * three.js) loads only when the tool is first opened.
 */
export const modelViewerTool = defineTool<ModelViewerViewState>({
  id: 'model-viewer',
  name: '3D Model Viewer',
  description: 'Inspect GLB models exported from SolidWorks. Nodes named with object IDs link to the digital twin.',
  icon: Icons.viewer3d,
  category: 'Design',
  supportedObjectTypes: ['assembly', 'part'],
  view: lazy(() => import('./ModelViewerView')),
  keepMounted: true,
  singleInstance: true, // the embedded viewer uses one store per window
  initialViewState: { fileName: null, loading: false, displayMode: 'solid', showGrid: true, treeOpen: true },
  toolbar: ({ viewState }) => {
    const hasModel = viewState.fileName !== null
    const call = (fn: (b: NonNullable<typeof bridge.current>) => void) => () => bridge.current && fn(bridge.current)
    return [
      { type: 'button', id: 'open', label: 'Open GLB', icon: Icons.open, onClick: call((b) => b.openFile()), disabled: viewState.loading },
      {
        type: 'button',
        id: 'actuator',
        label: 'Load ACT-100 model',
        onClick: call((b) => b.loadActuator()),
        disabled: viewState.loading,
        title: 'Load the sample actuator GLB, whose nodes are linked to the digital twin',
      },
      { type: 'separator', id: 'sep-1' },
      { type: 'button', id: 'fit', label: 'Fit', icon: Icons.fit, disabled: !hasModel, onClick: call((b) => b.requestView('fit')) },
      { type: 'button', id: 'reset', label: 'Reset', icon: Icons.reset, disabled: !hasModel, onClick: call((b) => b.requestView('reset')) },
      {
        type: 'select',
        id: 'view',
        label: 'View',
        value: '',
        disabled: !hasModel,
        options: [
          { value: '', label: 'Standard view…' },
          { value: 'front', label: 'Front' },
          { value: 'back', label: 'Back' },
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
          { value: 'top', label: 'Top' },
          { value: 'bottom', label: 'Bottom' },
          { value: 'iso', label: 'Isometric' },
        ],
        onChange: (value) => value && bridge.current?.requestView(value as 'front'),
      },
      { type: 'separator', id: 'sep-2' },
      {
        type: 'button',
        id: 'solid',
        label: 'Solid',
        active: viewState.displayMode === 'solid',
        disabled: !hasModel,
        onClick: call((b) => b.setDisplayMode('solid')),
      },
      {
        type: 'button',
        id: 'wireframe',
        label: 'Wireframe',
        icon: Icons.wireframe,
        active: viewState.displayMode === 'wireframe',
        disabled: !hasModel,
        onClick: call((b) => b.setDisplayMode('wireframe')),
      },
      { type: 'button', id: 'grid', label: 'Grid', icon: Icons.grid, active: viewState.showGrid, disabled: !hasModel, onClick: call((b) => b.toggleGrid()) },
      { type: 'button', id: 'tree', label: 'Node tree', icon: Icons.panelLeft, active: viewState.treeOpen, onClick: call((b) => b.toggleTree()) },
    ]
  },
})

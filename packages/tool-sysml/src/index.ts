import { defineTool } from '@ews/platform-sdk/react'
import { lazy } from 'react'
import pkg from '../package.json'
import { sysmlAssistant } from './assistant'
import { INITIAL_VIEW_STATE, type SysmlViewState } from './domain'

export type { SysmlViewState } from './domain'

/** SysML Modeling: a small editable diagram of parts, requirement usages and connections. */
export const sysmlTool = defineTool<SysmlViewState>({
  id: 'sysml',
  name: 'SysML',
  description: 'Small SysML diagram: parts, requirement usages, connections and satisfy links, with illustrative text notation.',
  category: 'Systems engineering',
  icon: 'sysml',
  version: pkg.version,
  sdkVersion: '^1.0.0',
  entitlement: 'tool:sysml',
  supportedObjectTypes: ['sysml-element', 'assembly', 'part', 'requirement'],
  view: lazy(() => import('./SysmlView')),
  initialViewState: INITIAL_VIEW_STATE,
  assistant: sysmlAssistant,
  toolbar: ({ api, viewState, selection }) => {
    const selected = selection[0]
    return [
      {
        type: 'button',
        id: 'select',
        label: 'Select',
        icon: 'select',
        active: viewState.dialog === null,
        title: 'Click or tap elements to select them in every tool',
        onClick: () => api.updateViewState({ dialog: null }),
      },
      {
        type: 'button',
        id: 'add-part',
        label: 'Add Part',
        icon: 'add',
        priority: 'primary',
        onClick: () =>
          api.updateViewState({ dialog: { kind: 'add-part', representsId: selected && (selected.type === 'part' || selected.type === 'assembly') ? selected.id : undefined } }),
      },
      {
        type: 'button',
        id: 'add-requirement',
        label: 'Add Requirement Reference',
        icon: 'requirement',
        onClick: () => api.updateViewState({ dialog: { kind: 'add-requirement', requirementId: selected?.type === 'requirement' ? selected.id : undefined } }),
      },
      {
        type: 'button',
        id: 'connect',
        label: 'Connect',
        icon: 'connect',
        priority: 'primary',
        title: 'Connect two parts, or a part to a requirement usage (satisfy)',
        onClick: () => api.updateViewState({ dialog: { kind: 'connect', fromId: selected?.type === 'sysml-element' ? selected.id : undefined } }),
      },
      { type: 'separator', id: 'sep-1' },
      { type: 'button', id: 'fit', label: 'Fit', icon: 'fit', onClick: () => api.updateViewState({ camera: { panX: 0, panY: 0, zoom: 1 } }) },
      {
        type: 'button',
        id: 'text',
        label: 'Text',
        icon: 'text',
        active: viewState.showText,
        title: 'Show the illustrative SysML v2-style text generated from the model',
        onClick: () => api.updateViewState((vs) => ({ ...vs, showText: !vs.showText })),
      },
    ]
  },
})

import { defineTool } from '@ews/platform-sdk/react'
import { lazy } from 'react'
import { conceptsAssistant } from './assistant'
import { conceptualizeHelp } from './help'
import { INITIAL_VIEW_STATE, type ConceptualizeViewState } from './domain'
import pkg from '../package.json'

export type { ConceptualizeViewState } from './domain'
export { conceptsDemo } from './assistant'
export { generateExploration } from './ai/generator'
export { registerReferencePort } from './references'

/**
 * Conceptualize: Concepts (implementation-independent engineering ideas), their decomposition,
 * alternatives, trade studies, decisions and ConceptImplementations. Data lives in the Conceptualize
 * service (`ToolApi.services.concepts`, PostgreSQL-backed API, or an explicitly chosen demo adapter).
 */
export const conceptualizeTool = defineTool<ConceptualizeViewState>({
  id: 'conceptualize',
  name: 'Conceptualize',
  description: 'Concept exploration: ideas, decomposition, alternatives, trade studies, design decisions and links to their implementations.',
  category: 'Conceptual design',
  icon: 'category',
  version: pkg.version,
  sdkVersion: '^1.5.0',
  entitlement: 'tool:conceptualize',
  supportedObjectTypes: ['assembly', 'part', 'sysml-element', 'cad-representation', 'requirement'],
  view: lazy(() => import('./ConceptualizeView')),
  initialViewState: INITIAL_VIEW_STATE,
  assistant: conceptsAssistant,
  help: conceptualizeHelp,
  toolbar: ({ api, viewState }) => {
    const service = api.services.concepts
    const readOnly = !service || service.mode === 'demo' || !!viewState.readOnly
    const why = !service ? 'The Conceptualize service is not available in this host' : service.mode === 'demo' ? 'Editing needs API mode' : viewState.readOnly ? 'Your role is read-only in this project' : undefined
    const open = viewState.conceptId
    return [
      { type: 'button', id: 'new', label: 'New concept', icon: 'add', primary: true, priority: 'primary', disabled: readOnly, title: why ?? 'Create a Concept from a natural-language description', onClick: () => api.updateViewState({ dialog: 'new' }) },
      { type: 'button', id: 'child', label: 'Add child', icon: 'tree', disabled: readOnly || !open, title: why ?? (open ? 'Add a child Concept (decomposition)' : 'Open a Concept first'), onClick: () => api.updateViewState({ dialog: 'child' }) },
      { type: 'button', id: 'branch', label: 'Branch', icon: 'split', disabled: readOnly || !open, title: why ?? (open ? 'Branch the open Concept into a new alternative' : 'Open a Concept first'), onClick: () => api.updateViewState({ dialog: 'branch' }) },
      { type: 'button', id: 'alternatives', label: 'Alternatives', icon: 'swap', active: viewState.page === 'alternatives', disabled: !service || service.mode === 'demo', title: (!service || service.mode === 'demo' ? why : undefined) ?? 'Compare alternatives side by side', onClick: () => api.updateViewState({ page: 'alternatives' }) },
      {
        type: 'button',
        id: 'graph',
        label: 'Graph',
        icon: 'relationship',
        active: viewState.explorerMode === 'graph',
        disabled: !service || service.mode === 'demo',
        title: (!service || service.mode === 'demo' ? why : undefined) ?? 'Show relationships as a graph',
        onClick: () => api.updateViewState((vs) => ({ ...vs, page: 'explorer', explorerMode: vs.explorerMode === 'graph' ? 'tree' : 'graph' })),
      },
    ]
  },
})

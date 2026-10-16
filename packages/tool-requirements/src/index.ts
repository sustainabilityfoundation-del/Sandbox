import { defineTool, type ClientModule } from '@ews/platform-sdk/react'
import { lazy } from 'react'
import { requirementsAssistant } from './assistant'
import { REQUIREMENTS_CAPABILITIES } from './capabilities'
import { requirementsHelp } from './help'
import { INITIAL_VIEW_STATE, type RequirementsViewState } from './domain'
import pkg from '../package.json'

export type { RequirementsViewState, VerificationOutcome, VerificationRecordView, VerificationState } from './domain'
/** Verification record helpers, exported for platform-level workflow tests. */
export { VERIFICATION_RECORD, readVerificationRecord, verificationArtifact, verificationState } from './domain'

/**
 * Requirements Management. Canonical requirements live in the Requirements service
 * (`ToolApi.services.requirements`, PostgreSQL-backed API, or an explicitly chosen demo adapter);
 * the shared twin provides components, SysML references and verification records.
 */
export const requirementsTool = defineTool<RequirementsViewState>({
  id: 'requirements',
  name: 'Requirements',
  description: 'Requirements collections, search and filters, lifecycle and reviews, traceability, baselines, quality assistance and ReqIF exchange.',
  category: 'Requirements',
  icon: 'requirements',
  version: pkg.version,
  sdkVersion: '^1.2.0',
  entitlement: 'tool:requirements',
  supportedObjectTypes: ['requirement', 'assembly', 'part', 'sysml-element', 'cad-representation'],
  view: lazy(() => import('./RequirementsView')),
  initialViewState: INITIAL_VIEW_STATE,
  assistant: requirementsAssistant,
  help: requirementsHelp,
  toolbar: ({ api, viewState }) => {
    const service = api.services.requirements
    const unavailable = !service ? 'The Requirements service is not available in this host' : undefined
    const demo = service?.mode === 'demo'
    const open = viewState.editor && viewState.editor.requirementId !== 'new' ? viewState.editor.requirementId : null
    return [
      {
        type: 'button',
        id: 'add',
        label: 'Add',
        icon: 'add',
        primary: true,
        priority: 'primary',
        disabled: !service || demo || !!viewState.baselineId,
        title: unavailable ?? (demo ? 'Creating requirements needs API mode' : viewState.baselineId ? 'Leave the baseline view to add requirements' : 'Add a requirement'),
        onClick: () => api.updateViewState({ page: 'table', editor: { requirementId: 'new', focus: 'details', tab: 'details' } }),
      },
      {
        type: 'button',
        id: 'filter',
        label: 'Filter',
        icon: 'filter',
        active: viewState.filterMode === 'selection',
        disabled: !service || demo,
        title: unavailable ?? 'Show only requirements allocated to the selected component',
        onClick: () => api.updateViewState((vs) => ({ ...vs, filterMode: vs.filterMode === 'selection' ? 'all' : 'selection' })),
      },
      {
        type: 'button',
        id: 'allocate',
        label: 'Trace',
        icon: 'allocate',
        disabled: !open,
        title: open ? 'Relationships and allocation of the open requirement' : 'Open a requirement to edit its relationships',
        onClick: () => open && api.updateViewState({ page: 'table', editor: { requirementId: open, focus: 'allocation', tab: 'relationships' } }),
      },
      {
        type: 'button',
        id: 'trace',
        label: 'SysML column',
        icon: 'trace',
        active: viewState.showTrace,
        disabled: !service || demo,
        title: 'Show the SysML requirement usages that reference each requirement',
        onClick: () => api.updateViewState((vs) => ({ ...vs, showTrace: !vs.showTrace, columns: vs.columns.includes('trace') ? vs.columns : [...vs.columns, 'trace'] })),
      },
    ]
  },
})

/**
 * Requirements' client module (docs/specifications/module-registration.md, M6): its manifest (capability entries, default-open
 * flag) and its tool. The tool does not depend on the host environment: the service mode comes from `ToolApi.services.requirements`.
 */
export function requirementsModule(): ClientModule {
  return {
    manifest: { schemaVersion: 1, id: 'requirements', name: 'Requirements', capabilities: REQUIREMENTS_CAPABILITIES, entitlement: 'tool:requirements', defaultOpen: true },
    tool: () => requirementsTool,
  }
}

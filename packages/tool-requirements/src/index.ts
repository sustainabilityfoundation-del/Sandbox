import { isComponent } from '@ews/platform-sdk'
import { defineTool } from '@ews/platform-sdk/react'
import { lazy } from 'react'
import { requirementsAssistant } from './assistant'
import { INITIAL_VIEW_STATE, selectedRequirementIds, type RequirementsViewState } from './domain'
import pkg from '../package.json'

export type { RequirementsViewState, VerificationOutcome, VerificationRecordView, VerificationState } from './domain'
/** Verification record helpers, exported for platform-level workflow tests. */
export { VERIFICATION_RECORD, readVerificationRecord, verificationArtifact, verificationState } from './domain'

/** Requirements Management: requirement statements, rationale, status and allocation to components. */
export const requirementsTool = defineTool<RequirementsViewState>({
  id: 'requirements',
  name: 'Requirements',
  description: 'Requirements table, search and filters; statements, rationale, status and allocation to components.',
  category: 'Requirements',
  icon: 'requirements',
  version: pkg.version,
  sdkVersion: '^1.1.0',
  entitlement: 'tool:requirements',
  supportedObjectTypes: ['requirement', 'assembly', 'part', 'sysml-element', 'cad-representation'],
  view: lazy(() => import('./RequirementsView')),
  initialViewState: INITIAL_VIEW_STATE,
  assistant: requirementsAssistant,
  toolbar: ({ api, viewState, model, selection }) => {
    const requirementId = selectedRequirementIds(model, selection.map((o) => o.id))[0]
    const component = selection.find(isComponent)
    const edit = (focus: 'details' | 'allocation') =>
      requirementId && api.updateViewState({ editor: { requirementId, focus, tab: 'details' } })
    return [
      {
        type: 'button',
        id: 'add',
        label: 'Add',
        icon: 'add',
        priority: 'primary',
        title: component ? `Add a requirement allocated to ${component.name}` : 'Add a requirement',
        onClick: async () => {
          const { createdIds } = await api.submitChanges(
            [
              {
                kind: 'add-object',
                idPrefix: 'REQ',
                ref: '$req',
                object: {
                  type: 'requirement',
                  name: 'New requirement',
                  properties: { statement: 'The actuator shall …', rationale: '', status: 'draft', verificationMethods: [] },
                },
              },
              ...(component ? [{ kind: 'add-relationship' as const, relationship: { type: 'allocated-to' as const, from: '$req', to: component.id } }] : []),
            ],
            component ? `Added requirement allocated to ${component.id}` : 'Added requirement',
          )
          const id = createdIds[0]
          if (!id) return
          api.select([id])
          api.updateViewState({ editor: { requirementId: id, focus: 'details', tab: 'details' } })
        },
      },
      {
        type: 'button',
        id: 'edit',
        label: 'Edit',
        icon: 'edit',
        priority: 'primary',
        disabled: !requirementId,
        title: requirementId ? `Edit ${requirementId}` : 'Select a requirement to edit it',
        onClick: () => edit('details'),
      },
      {
        type: 'button',
        id: 'filter',
        label: 'Filter',
        icon: 'filter',
        active: viewState.filterMode === 'selection',
        title: 'Show only requirements allocated to the selected component',
        onClick: () => api.updateViewState((vs) => ({ ...vs, filterMode: vs.filterMode === 'selection' ? 'all' : 'selection' })),
      },
      {
        type: 'button',
        id: 'allocate',
        label: 'Allocate',
        icon: 'allocate',
        disabled: !requirementId,
        title: requirementId ? `Change the components ${requirementId} is allocated to` : 'Select a requirement to allocate it',
        onClick: () => edit('allocation'),
      },
      {
        type: 'button',
        id: 'trace',
        label: 'Trace',
        icon: 'trace',
        active: viewState.showTrace,
        title: 'Show SysML references and the representations of allocated components',
        onClick: () => api.updateViewState((vs) => ({ ...vs, showTrace: !vs.showTrace })),
      },
    ]
  },
})

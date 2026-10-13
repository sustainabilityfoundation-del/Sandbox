import { lazy } from 'react'
import { Icons, defineTool, isComponent } from '../../sdk'

export interface RequirementsViewState {
  /** 'selection': only requirements allocated to the selected (or last selected) component. */
  filterMode: 'all' | 'selection'
  /** Last component used for filtering, kept when a requirement itself is selected. */
  filterComponentId: string | null
  complianceFilter: 'all' | 'not-assessed' | 'compliant' | 'non-compliant'
  showTrace: boolean
  editor: { requirementId: string; focus: 'details' | 'allocation' } | null
}

export const requirementsTool = defineTool<RequirementsViewState>({
  id: 'requirements',
  name: 'Requirements',
  description: 'Requirement statements, allocation to components, verification methods and compliance.',
  icon: Icons.requirement,
  category: 'Requirements',
  supportedObjectTypes: ['requirement', 'assembly', 'part'],
  view: lazy(() => import('./RequirementsView')),
  initialViewState: {
    filterMode: 'selection',
    filterComponentId: null,
    complianceFilter: 'all',
    showTrace: false,
    editor: null,
  },
  toolbar: ({ api, viewState, selection }) => {
    const requirement = selection.find((o) => o.type === 'requirement')
    const component = selection.find(isComponent)
    return [
      {
        type: 'button',
        id: 'add',
        label: 'Add',
        icon: Icons.plus,
        onClick: async () => {
          const { createdIds } = await api.submitChanges(
            [
              {
                kind: 'add-object',
                idPrefix: 'REQ',
                object: {
                  type: 'requirement',
                  name: 'New requirement',
                  properties: { statement: 'The actuator shall …', verificationMethods: [], compliance: 'not-assessed' },
                },
              },
            ],
            'Added requirement',
          )
          const id = createdIds[0]
          if (!id) return
          if (component) {
            await api.submitChanges(
              [{ kind: 'add-relationship', relationship: { type: 'allocated-to', from: id, to: component.id } }],
              `Allocated ${id} to ${component.id}`,
            )
          }
          api.select([id])
          api.updateViewState({ editor: { requirementId: id, focus: 'details' } })
        },
        title: component ? `Add a requirement allocated to ${component.name}` : 'Add a requirement',
      },
      {
        type: 'button',
        id: 'edit',
        label: 'Edit',
        icon: Icons.edit,
        disabled: !requirement,
        title: requirement ? `Edit ${requirement.id}` : 'Select a requirement to edit it',
        onClick: () => requirement && api.updateViewState({ editor: { requirementId: requirement.id, focus: 'details' } }),
      },
      {
        type: 'button',
        id: 'filter',
        label: 'Filter',
        icon: Icons.filter,
        active: viewState.filterMode === 'selection',
        title: 'Show only requirements allocated to the selected component',
        onClick: () =>
          api.updateViewState((vs) => ({ ...vs, filterMode: vs.filterMode === 'selection' ? 'all' : 'selection' })),
      },
      {
        type: 'button',
        id: 'link',
        label: 'Link',
        icon: Icons.link,
        disabled: !requirement,
        title: requirement ? `Change the components ${requirement.id} is allocated to` : 'Select a requirement to link it',
        onClick: () =>
          requirement && api.updateViewState({ editor: { requirementId: requirement.id, focus: 'allocation' } }),
      },
      {
        type: 'button',
        id: 'trace',
        label: 'Trace',
        icon: Icons.trace,
        active: viewState.showTrace,
        title: 'Show verification procedures and evidence for each requirement',
        onClick: () => api.updateViewState((vs) => ({ ...vs, showTrace: !vs.showTrace })),
      },
    ]
  },
})

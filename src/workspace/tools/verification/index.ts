import { lazy } from 'react'
import { Icons, defineTool } from '../../sdk'

export interface VerificationViewState {
  /** Procedure shown in the detail panel (tool-local; doesn't change the shared selection). */
  procedureId: string | null
  tab: 'details' | 'trace'
  panel: 'none' | 'record' | 'link'
  reviewMode: boolean
  addNoticeShown: boolean
  /** Show all procedures instead of those related to the shared selection. */
  showAll: boolean
}

export const verificationTool = defineTool<VerificationViewState>({
  id: 'verification',
  name: 'Verification',
  description: 'Verification procedures, recorded results and linked evidence, with traceability.',
  icon: Icons.procedure,
  category: 'Verification',
  supportedObjectTypes: ['procedure', 'requirement', 'assembly', 'part'],
  view: lazy(() => import('./VerificationView')),
  initialViewState: {
    procedureId: null,
    tab: 'details',
    panel: 'none',
    reviewMode: false,
    addNoticeShown: false,
    showAll: false,
  },
  toolbar: ({ api, viewState }) => {
    const hasProcedure = viewState.procedureId !== null
    return [
      {
        type: 'button',
        id: 'add-procedure',
        label: 'Add Procedure',
        icon: Icons.plus,
        illustrative: true,
        active: viewState.addNoticeShown,
        onClick: () => api.updateViewState((vs) => ({ ...vs, addNoticeShown: !vs.addNoticeShown })),
      },
      {
        type: 'button',
        id: 'record',
        label: 'Record Result',
        icon: Icons.clipboard,
        disabled: !hasProcedure,
        active: viewState.panel === 'record',
        onClick: () =>
          api.updateViewState((vs) => ({ ...vs, tab: 'details', panel: vs.panel === 'record' ? 'none' : 'record' })),
      },
      {
        type: 'button',
        id: 'link',
        label: 'Link Evidence',
        icon: Icons.link,
        disabled: !hasProcedure,
        active: viewState.panel === 'link',
        onClick: () =>
          api.updateViewState((vs) => ({ ...vs, tab: 'details', panel: vs.panel === 'link' ? 'none' : 'link' })),
      },
      {
        type: 'button',
        id: 'review',
        label: 'Review',
        icon: Icons.review,
        disabled: !hasProcedure,
        active: viewState.reviewMode,
        title: 'Show review actions on evidence',
        onClick: () => api.updateViewState((vs) => ({ ...vs, tab: 'details', reviewMode: !vs.reviewMode })),
      },
      { type: 'separator', id: 'sep' },
      {
        type: 'button',
        id: 'trace',
        label: 'Traceability',
        icon: Icons.trace,
        disabled: !hasProcedure,
        active: viewState.tab === 'trace',
        onClick: () => api.updateViewState((vs) => ({ ...vs, tab: vs.tab === 'trace' ? 'details' : 'trace' })),
      },
    ]
  },
})

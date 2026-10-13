import { lazy } from 'react'
import { Icons, defineTool } from '../../sdk'
import { isAssessable } from './assessment'
import { saveRun, startRun, type AnalysisViewState } from './run'

export const analysisTool = defineTool<AnalysisViewState>({
  id: 'analysis',
  name: 'Analysis',
  description: 'Structural assessment of components under the active load case (demo calculation).',
  icon: Icons.analysis,
  category: 'Analysis',
  supportedObjectTypes: ['part'],
  view: lazy(() => import('./AnalysisView')),
  initialViewState: { inputsOpen: true, compareOpen: false, run: null },
  toolbar: ({ api, viewState, context, model, selection }) => {
    const target = selection.find(isAssessable)
    const run = viewState.run
    const running = run?.status === 'running'
    const canSave = run?.status === 'done' && !run.savedOutputId
    return [
      {
        type: 'select',
        id: 'scenario',
        label: 'Scenario',
        value: context.scenarioId,
        options: model.snapshot.scenarios.map((s) => ({ value: s.id, label: s.name })),
        onChange: (id) => api.setScenario(id),
        title: 'Active load case (shared with all tools)',
      },
      {
        type: 'button',
        id: 'inputs',
        label: 'Inputs',
        icon: Icons.sliders,
        active: viewState.inputsOpen,
        onClick: () => api.updateViewState((vs) => ({ ...vs, inputsOpen: !vs.inputsOpen })),
      },
      {
        type: 'button',
        id: 'run',
        label: running ? 'Running…' : 'Run',
        icon: Icons.play,
        primary: true,
        busy: running,
        disabled: !target || running,
        title: target ? `Run assessment for ${target.name}` : 'Select an assessable part (the rod) to run',
        onClick: () => void startRun(api),
      },
      {
        type: 'button',
        id: 'compare',
        label: 'Compare',
        icon: Icons.compare,
        active: viewState.compareOpen,
        onClick: () => api.updateViewState((vs) => ({ ...vs, compareOpen: !vs.compareOpen })),
      },
      {
        type: 'button',
        id: 'save',
        label: run?.savedOutputId ? `Saved ${run.savedOutputId}` : 'Save Result',
        icon: Icons.save,
        disabled: !canSave,
        title: canSave ? 'Save this result to the repository' : 'Run an assessment first',
        onClick: () => void saveRun(api),
      },
    ]
  },
})

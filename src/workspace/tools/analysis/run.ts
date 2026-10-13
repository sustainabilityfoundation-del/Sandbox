import type { InputRef, ToolApi } from '../../sdk'
import { assess, isAssessable, readInputs, resultEntries, type AssessmentInputs, type AssessmentResult } from './assessment'

/** Everything a run depends on, captured when it starts. */
export interface CapturedContext {
  runId: string
  startedAt: string
  configurationId: string
  scenarioId: string
  objectId: string
  modelRevision: number
  inputs: InputRef[]
  values: AssessmentInputs
}

export interface RunState {
  status: 'running' | 'done' | 'failed'
  captured: CapturedContext
  result?: AssessmentResult
  savedOutputId?: string
  error?: string
}

export interface AnalysisViewState {
  inputsOpen: boolean
  compareOpen: boolean
  run: RunState | null
}

/** Runs in this page session; a 'running' state without an entry here was interrupted by a reload. */
export const inFlightRuns = new Set<string>()

const SIMULATED_DURATION_MS = 1600

/**
 * Starts an assessment for the selected component and active scenario. The
 * context is captured up front, so switching tools, scenario or configuration
 * while it runs cannot change what the result refers to.
 */
export async function startRun(api: ToolApi<AnalysisViewState>): Promise<void> {
  const context = api.getContext()
  const model = api.getModel()
  const object = context.selectedIds.map(model.get).find(isAssessable)
  const scenario = model.scenario(context.scenarioId)
  if (!object || !scenario) return

  const read = readInputs(object, scenario)
  if (!read.inputs) {
    api.log(`Cannot run assessment: missing ${read.missing.join(', ')}`, { kind: 'error', objectIds: [object.id] })
    return
  }

  const captured: CapturedContext = {
    runId: `run-${Date.now().toString(36)}`,
    startedAt: new Date().toISOString(),
    configurationId: context.configurationId,
    scenarioId: scenario.id,
    objectId: object.id,
    modelRevision: model.revision,
    inputs: [
      { id: object.id, revision: object.revision },
      { id: scenario.id, revision: scenario.revision },
    ],
    values: read.inputs,
  }

  inFlightRuns.add(captured.runId)
  api.updateViewState((vs) => ({ ...vs, run: { status: 'running', captured } }))
  api.log(`Assessment started: ${object.id} ${object.name}, ${scenario.name}`, { kind: 'run', objectIds: [object.id] })

  await new Promise((resolve) => setTimeout(resolve, SIMULATED_DURATION_MS))

  const result = assess(captured.values)
  inFlightRuns.delete(captured.runId)
  // Only update if this is still the latest run.
  api.updateViewState((vs) =>
    vs.run?.captured.runId === captured.runId ? { ...vs, run: { status: 'done', captured, result } } : vs,
  )
  api.log(
    `Assessment complete: ${object.id}, ${scenario.name}, margin ${result.margin >= 0 ? '+' : ''}${result.margin.toFixed(2)} (unsaved)`,
    { kind: 'run', objectIds: [object.id] },
  )
}

/** Saves the finished run as an output under the context captured at run start. */
export async function saveRun(api: ToolApi<AnalysisViewState>): Promise<void> {
  const run = api.getViewState().run
  if (!run || run.status !== 'done' || !run.result || run.savedOutputId) return
  const { captured, result } = run
  const model = api.getModel()

  try {
    const output = await api.saveOutput({
      toolId: api.toolId,
      kind: 'structural-assessment',
      title: `${model.nameOf(captured.objectId)} buckling assessment`,
      configurationId: captured.configurationId,
      scenarioId: captured.scenarioId,
      inputRevision: captured.modelRevision,
      objectIds: [captured.objectId],
      inputs: captured.inputs,
      completion: 'complete',
      result: resultEntries(result),
      summary: `Margin of safety ${result.margin >= 0 ? '+' : ''}${result.margin.toFixed(2)} (demo calculation)`,
    })
    api.updateViewState((vs) =>
      vs.run?.captured.runId === captured.runId ? { ...vs, run: { ...vs.run, savedOutputId: output.id, error: undefined } } : vs,
    )
  } catch (error) {
    api.updateViewState((vs) =>
      vs.run?.captured.runId === captured.runId
        ? { ...vs, run: { ...vs.run, error: error instanceof Error ? error.message : String(error) } }
        : vs,
    )
  }
}

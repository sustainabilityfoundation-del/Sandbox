import type { ActivitySource, InputRef, OutputRecord, ToolApi } from '../../sdk'
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
  /** Set when the run was requested from somewhere other than the toolbar. */
  origin?: string
}

export interface AnalysisViewState {
  inputsOpen: boolean
  compareOpen: boolean
  run: RunState | null
}

/** What to assess. The caller decides where these come from (toolbar, conversation, …). */
export interface RunRequest {
  objectId: string
  scenarioId: string
  configurationId: string
}

export interface RunOptions {
  /** Save the result as an output as soon as the run completes. */
  autoSave?: boolean
  /** Provenance recorded in Activity, e.g. a conversation message. */
  source?: ActivitySource
}

export interface RunOutcome {
  captured: CapturedContext
  result: AssessmentResult
  output?: OutputRecord
}

/** Runs in this page session; a 'running' state without an entry here was interrupted by a reload. */
export const inFlightRuns = new Set<string>()

const SIMULATED_DURATION_MS = 1600

/** Validates a run request against the current model and captures its inputs. */
export function captureRun(
  api: ToolApi<AnalysisViewState>,
  request: RunRequest,
): { captured: CapturedContext; error?: undefined } | { captured?: undefined; error: string } {
  const model = api.getModel()
  const object = model.get(request.objectId)
  const scenario = model.scenario(request.scenarioId)
  if (!object) return { error: `${request.objectId} does not exist.` }
  if (!isAssessable(object)) return { error: `No structural assessment is defined for ${object.id} ${object.name}.` }
  if (!scenario) return { error: `Scenario ${request.scenarioId} does not exist.` }
  if (!model.snapshot.configurations.some((c) => c.id === request.configurationId)) {
    return { error: `Configuration ${request.configurationId} does not exist.` }
  }
  const read = readInputs(object, scenario)
  if (!read.inputs) return { error: `Missing inputs: ${read.missing.join(', ')}.` }

  return {
    captured: {
      runId: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      startedAt: new Date().toISOString(),
      configurationId: request.configurationId,
      scenarioId: scenario.id,
      objectId: object.id,
      modelRevision: model.revision,
      inputs: [
        { id: object.id, revision: object.revision },
        { id: scenario.id, revision: scenario.revision },
      ],
      values: read.inputs,
    },
  }
}

/** Saves a finished run as an output under the context captured at run start. */
async function saveCaptured(
  api: ToolApi<AnalysisViewState>,
  captured: CapturedContext,
  result: AssessmentResult,
  source?: ActivitySource,
): Promise<OutputRecord> {
  const model = api.getModel()
  return api.saveOutput(
    {
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
    },
    { source },
  )
}

/**
 * Executes a captured run. The context was fixed when it was captured, so
 * switching tools, scenario, configuration or selection meanwhile cannot change
 * what the result refers to. The Analysis view shows the run either way.
 */
export async function executeRun(
  api: ToolApi<AnalysisViewState>,
  captured: CapturedContext,
  options: RunOptions = {},
): Promise<RunOutcome> {
  const model = api.getModel()
  const label = `${captured.objectId} ${model.nameOf(captured.objectId)}, ${model.nameOf(captured.scenarioId)}`
  const origin = options.source?.label

  inFlightRuns.add(captured.runId)
  api.updateViewState((vs) => ({ ...vs, run: { status: 'running', captured, origin } }))
  api.log(`Assessment started: ${label}${origin ? ` (${origin})` : ''}`, {
    kind: 'run',
    objectIds: [captured.objectId],
    source: options.source,
  })

  await new Promise((resolve) => setTimeout(resolve, SIMULATED_DURATION_MS))

  const result = assess(captured.values)
  inFlightRuns.delete(captured.runId)
  const isLatest = (vs?: AnalysisViewState) => vs?.run?.captured.runId === captured.runId
  api.updateViewState((vs) => (isLatest(vs) ? { ...vs, run: { status: 'done', captured, result, origin } } : vs))
  api.log(
    `Assessment complete: ${label}, margin ${result.margin >= 0 ? '+' : ''}${result.margin.toFixed(2)}${options.autoSave ? '' : ' (unsaved)'}`,
    { kind: 'run', objectIds: [captured.objectId], source: options.source },
  )

  if (!options.autoSave) return { captured, result }
  const output = await saveCaptured(api, captured, result, options.source)
  api.updateViewState((vs) => (isLatest(vs) && vs.run ? { ...vs, run: { ...vs.run, savedOutputId: output.id } } : vs))
  return { captured, result, output }
}

/** Toolbar Run: assesses the selected part under the active scenario and configuration. */
export async function startRun(api: ToolApi<AnalysisViewState>): Promise<void> {
  const context = api.getContext()
  const model = api.getModel()
  const object = context.selectedIds.map(model.get).find(isAssessable)
  if (!object) return
  const capture = captureRun(api, {
    objectId: object.id,
    scenarioId: context.scenarioId,
    configurationId: context.configurationId,
  })
  if (capture.error !== undefined) {
    api.log(`Cannot run assessment: ${capture.error}`, { kind: 'error', objectIds: [object.id] })
    return
  }
  await executeRun(api, capture.captured)
}

/** Toolbar Save Result: saves the finished run under its captured context. */
export async function saveRun(api: ToolApi<AnalysisViewState>): Promise<void> {
  const run = api.getViewState().run
  if (!run || run.status !== 'done' || !run.result || run.savedOutputId) return
  const { captured, result } = run
  try {
    const output = await saveCaptured(api, captured, result)
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

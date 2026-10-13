import './analysis.css'
import { useState } from 'react'
import {
  Badge,
  DemoTag,
  FreshnessBadge,
  Notice,
  ObjectRef,
  Panel,
  ReviewBadge,
  formatNumber,
  formatTime,
  formatValue,
  isQuantity,
  useModel,
  useOutputs,
  useSelection,
  useSharedContext,
  useToolApi,
  useToolViewState,
  useUnsavedChanges,
  Button,
  TextInput,
  type EngineeringObject,
  type OutputView,
  type Scenario,
} from '../../sdk'
import { INPUT_SOURCES, isAssessable, type AssessmentResult } from './assessment'
import { inFlightRuns, saveRun, type AnalysisViewState, type RunState } from './run'

function resultValue(output: OutputView, key: string): number | undefined {
  const value = output.result.find((r) => r.key === key)?.value
  return typeof value === 'number' ? value : undefined
}

function MarginBadge({ margin }: { margin: number }) {
  return (
    <Badge tone={margin < 0 ? 'danger' : margin < 0.15 ? 'warning' : 'success'}>
      MS {margin >= 0 ? '+' : ''}
      {margin.toFixed(2)}
    </Badge>
  )
}

/** Horizontal bar chart: operating load against allowable and critical load. */
function LoadChart({ result }: { result: AssessmentResult }) {
  const max = Math.max(result.criticalLoadKN, result.operatingLoadKN) * 1.08
  const x = (kn: number) => 10 + (kn / max) * 460
  const over = result.operatingLoadKN > result.allowableLoadKN
  return (
    <svg className="an-chart" viewBox="0 0 480 116" role="img" aria-label="Operating load compared with allowable load">
      <rect x="10" y="22" width="460" height="26" className="an-track" />
      <rect x="10" y="22" width={x(result.allowableLoadKN) - 10} height="26" className="an-allowable" />
      <rect x="10" y="30" width={x(result.operatingLoadKN) - 10} height="10" className={over ? 'an-load is-over' : 'an-load'} />
      <line x1={x(result.allowableLoadKN)} x2={x(result.allowableLoadKN)} y1="14" y2="56" className="an-mark" />
      <line x1={x(result.criticalLoadKN)} x2={x(result.criticalLoadKN)} y1="14" y2="56" className="an-mark is-critical" />
      <text x={x(result.allowableLoadKN)} y="10" textAnchor="middle">
        Allowable {formatNumber(result.allowableLoadKN)} kN
      </text>
      <text x={x(result.criticalLoadKN)} y="70" textAnchor="end">
        Critical {formatNumber(result.criticalLoadKN)} kN
      </text>
      <text x={Math.max(x(result.operatingLoadKN), 60)} y="70" textAnchor="end" className="an-load-label">
        Operating {formatNumber(result.operatingLoadKN)} kN
      </text>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={10 + f * 460} x2={10 + f * 460} y1="84" y2="90" className="an-tick" />
          <text x={10 + f * 460} y="104" textAnchor="middle" className="an-axis">
            {formatNumber(max * f, 2)}
          </text>
        </g>
      ))}
      <text x="470" y="116" textAnchor="end" className="an-axis">
        kN
      </text>
    </svg>
  )
}

function InputsPanel({ object, scenario }: { object: EngineeringObject; scenario: Scenario }) {
  const api = useToolApi()
  const operating = scenario.properties.operatingLoad
  const [draft, setDraft] = useState(isQuantity(operating) ? String(operating.value) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = isQuantity(operating) ? operating.value : NaN
  const parsed = Number(draft)
  const valid = draft.trim() !== '' && Number.isFinite(parsed) && parsed > 0
  const changed = valid && parsed !== current
  useUnsavedChanges(changed && !busy)

  const apply = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.submitChanges(
        [
          {
            kind: 'update-properties',
            targetId: scenario.id,
            baseRevision: scenario.revision,
            properties: { operatingLoad: { value: parsed, unit: 'kN' } },
          },
        ],
        `Changed ${scenario.name} operating load ${formatNumber(current)} → ${formatNumber(parsed)} kN`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Inputs" className="an-inputs">
      <table className="ws-table ws-table-compact">
        <thead>
          <tr>
            <th>Input</th>
            <th>Value</th>
            <th>Source</th>
            <th>Rev</th>
          </tr>
        </thead>
        <tbody>
          {INPUT_SOURCES.map((input) => {
            const holder = input.source === 'scenario' ? scenario : object
            return (
              <tr key={input.key}>
                <td>{input.label}</td>
                <td>
                  {input.key === 'operatingLoadKN' ? (
                    <form
                      className="an-edit"
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (changed) void apply()
                      }}
                    >
                      <TextInput
                        aria-label="Operating load in kN"
                        inputMode="decimal"
                        className="an-load-input"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                      <span>kN</span>
                      <Button type="submit" size="sm" disabled={!changed} busy={busy}>
                        {busy ? 'Saving…' : 'Apply'}
                      </Button>
                    </form>
                  ) : (
                    formatValue(holder.properties[input.property])
                  )}
                </td>
                <td className="ws-mono ws-muted">
                  {holder.id}.{input.property}
                </td>
                <td className="ws-muted">{holder.revision}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {error && (
        <Notice tone="danger" title="Change rejected">
          {error}
        </Notice>
      )}
      <p className="ws-hint">
        The operating load belongs to the scenario, so changing it affects every tool and marks results that used the
        old value as potentially stale.
      </p>
    </Panel>
  )
}

function RunPanel({ run }: { run: RunState }) {
  const api = useToolApi<AnalysisViewState>()
  const model = useModel()
  const context = useSharedContext()
  const { captured, result } = run
  const interrupted = run.status === 'running' && !inFlightRuns.has(captured.runId)
  const scenario = model.scenario(captured.scenarioId)
  const configuration = model.snapshot.configurations.find((c) => c.id === captured.configurationId)
  const changedInputs = captured.inputs.filter((i) => model.revisionOf(i.id) !== i.revision)
  const object = model.get(captured.objectId)

  return (
    <Panel
      title="Latest run"
      className="an-run"
      actions={
        run.status === 'done' && !run.savedOutputId ? (
          <Button size="sm" variant="primary" onClick={() => void saveRun(api)}>
            Save result
          </Button>
        ) : run.savedOutputId ? (
          <Badge tone="success">Saved as {run.savedOutputId}</Badge>
        ) : null
      }
    >
      <dl className="an-captured">
        <div>
          <dt>Component</dt>
          <dd>{object ? <ObjectRef object={object} /> : captured.objectId}</dd>
        </div>
        <div>
          <dt>Scenario</dt>
          <dd>{scenario?.name ?? captured.scenarioId}</dd>
        </div>
        <div>
          <dt>Configuration</dt>
          <dd>{configuration?.name ?? captured.configurationId}</dd>
        </div>
        <div>
          <dt>Model rev</dt>
          <dd>{captured.modelRevision}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{formatTime(captured.startedAt)}</dd>
        </div>
        {run.origin && (
          <div>
            <dt>Requested from</dt>
            <dd>{run.origin}</dd>
          </div>
        )}
      </dl>

      {(captured.scenarioId !== context.scenarioId || captured.configurationId !== context.configurationId) && (
        <Notice tone="info" title="This run used the context captured when it started">
          It is for {scenario?.name} in {configuration?.name}, which differs from the active context. Saving keeps it
          under the captured scenario and configuration.
        </Notice>
      )}
      {changedInputs.length > 0 && (
        <Notice tone="warning" title="Inputs changed since this run started">
          {changedInputs.map((i) => model.nameOf(i.id)).join(', ')} changed. A saved result would be marked potentially
          stale; run again to use current inputs.
        </Notice>
      )}
      {run.error && (
        <Notice tone="danger" title="Save failed">
          {run.error}
        </Notice>
      )}

      {run.status === 'running' && !interrupted && (
        <div className="an-running">
          <span className="ws-spinner" aria-hidden="true" /> Running demo calculation… You can switch tools; the result
          will keep this context.
        </div>
      )}
      {interrupted && (
        <Notice tone="warning" title="Run interrupted">
          The page was reloaded before this run finished. Run it again.
        </Notice>
      )}
      {run.status === 'done' && result && (
        <div className="an-result">
          <div className="an-result-head">
            <MarginBadge margin={result.margin} />
            <span>
              {result.margin >= 0
                ? 'Operating load is within the allowable load.'
                : 'Operating load exceeds the allowable load.'}
            </span>
          </div>
          <table className="ws-table ws-table-compact an-values">
            <tbody>
              <tr>
                <td>Operating load</td>
                <td>{formatNumber(result.operatingLoadKN)} kN</td>
              </tr>
              <tr>
                <td>Critical buckling load P<sub>cr</sub></td>
                <td>{formatNumber(result.criticalLoadKN)} kN</td>
              </tr>
              <tr>
                <td>Allowable load P<sub>cr</sub> / n</td>
                <td>{formatNumber(result.allowableLoadKN)} kN</td>
              </tr>
              <tr>
                <td>Margin of safety</td>
                <td>{result.margin.toFixed(3)}</td>
              </tr>
              <tr>
                <td>Utilisation</td>
                <td>{result.utilisationPct.toFixed(1)} %</td>
              </tr>
            </tbody>
          </table>
          <LoadChart result={result} />
        </div>
      )}
    </Panel>
  )
}

function SavedResults({ object, scenarioId }: { object: EngineeringObject; scenarioId: string }) {
  const model = useModel()
  const forScenario = useOutputs({ objectId: object.id, toolId: 'analysis', scenarioId })
  const all = useOutputs({ objectId: object.id, toolId: 'analysis' })
  const others = all.length - forScenario.length
  return (
    <Panel title={`Saved results: ${model.scenario(scenarioId)?.name}`} className="an-saved">
      {forScenario.length === 0 ? (
        <p className="ws-muted">No saved results for this component and scenario in this configuration.</p>
      ) : (
        <ul className="ws-output-list">
          {forScenario.map((o) => (
            <li key={o.id} className={o.freshness.stale ? 'is-stale' : ''}>
              <div className="ws-output-head">
                <span className="ws-mono">{o.id}</span>
                <span>{o.summary}</span>
              </div>
              <div className="ws-output-meta">
                <FreshnessBadge freshness={o.freshness} />
                <ReviewBadge status={o.reviewStatus} />
                <span>Model rev {o.inputRevision}</span>
                <span>{formatTime(o.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {others > 0 && (
        <p className="ws-hint">
          {others} result{others === 1 ? '' : 's'} for other scenarios are listed in the inspector and Compare.
        </p>
      )}
    </Panel>
  )
}

function ComparePanel({ object, run }: { object: EngineeringObject; run: RunState | null }) {
  const model = useModel()
  const outputs = useOutputs({ objectId: object.id, toolId: 'analysis' })
  const unsaved = run?.status === 'done' && run.result && !run.savedOutputId && run.captured.objectId === object.id
  return (
    <Panel title="Compare" className="an-compare">
      <table className="ws-table ws-table-compact">
        <thead>
          <tr>
            <th>Result</th>
            <th>Scenario</th>
            <th>Operating</th>
            <th>Allowable</th>
            <th>Margin</th>
            <th>Rev</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {unsaved && run?.result && (
            <tr>
              <td>
                <em>Unsaved run</em>
              </td>
              <td>{model.scenario(run.captured.scenarioId)?.name}</td>
              <td>{formatNumber(run.result.operatingLoadKN)} kN</td>
              <td>{formatNumber(run.result.allowableLoadKN)} kN</td>
              <td>{run.result.margin.toFixed(3)}</td>
              <td>{run.captured.modelRevision}</td>
              <td>
                <Badge tone="info">Not saved</Badge>
              </td>
            </tr>
          )}
          {outputs.map((o) => (
            <tr key={o.id} className={o.freshness.stale ? 'is-stale' : ''}>
              <td className="ws-mono">{o.id}</td>
              <td>{model.scenario(o.scenarioId)?.name ?? '—'}</td>
              <td>{formatNumber(resultValue(o, 'operatingLoad') ?? NaN)} kN</td>
              <td>{formatNumber(resultValue(o, 'allowableLoad') ?? NaN)} kN</td>
              <td>{(resultValue(o, 'margin') ?? NaN).toFixed(3)}</td>
              <td>{o.inputRevision}</td>
              <td>
                <FreshnessBadge freshness={o.freshness} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

export default function AnalysisView() {
  const model = useModel()
  const context = useSharedContext()
  const { selectedObjects, select } = useSelection()
  const [viewState] = useToolViewState<AnalysisViewState>()
  const target = selectedObjects.find(isAssessable)
  const scenario = model.scenario(context.scenarioId)
  const rod = model.objects.find(isAssessable)

  return (
    <div className="an-root">
      <div className="an-intro">
        <div>
          <h2>Rod buckling assessment</h2>
          <p className="ws-muted">
            Euler column buckling: P<sub>cr</sub> = π²EI / (KL)², allowable = P<sub>cr</sub> / n, margin = allowable /
            operating − 1.
          </p>
        </div>
        <DemoTag>Demo calculation, not for engineering use</DemoTag>
      </div>

      {/* Non-part selections are already explained by the workspace; this covers parts without an assessment. */}
      {!target && (selectedObjects.length === 0 || selectedObjects.some((o) => o.type === 'part')) && (
        <Notice
          tone="info"
          title={
            selectedObjects.length
              ? `No structural assessment is defined for ${selectedObjects.map((o) => `${o.id} ${o.name}`).join(', ')}`
              : 'Nothing selected'
          }
          actions={
            rod && (
              <Button size="sm" onClick={() => select([rod.id])}>
                Select {rod.name}
              </Button>
            )
          }
        >
          In this demo the assessment applies to the rod ({rod?.id}). The current selection is kept.
        </Notice>
      )}

      <div className="an-grid">
        <div className="an-col">
          {target && scenario && viewState.inputsOpen && <InputsPanel key={`${target.id}-${scenario.id}-${scenario.revision}`} object={target} scenario={scenario} />}
          {target && <SavedResults object={target} scenarioId={context.scenarioId} />}
        </div>
        <div className="an-col">
          {viewState.run ? (
            <RunPanel run={viewState.run} />
          ) : (
            target && (
              <Panel title="Latest run">
                <p className="ws-muted">Choose a scenario and press Run in the toolbar.</p>
              </Panel>
            )
          )}
          {target && viewState.compareOpen && <ComparePanel object={target} run={viewState.run} />}
        </div>
      </div>
    </div>
  )
}

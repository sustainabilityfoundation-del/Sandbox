import './verification.css'
import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  ComplianceBadge,
  FreshnessBadge,
  Notice,
  ObjectRef,
  Panel,
  ReviewBadge,
  formatTime,
  isComponent,
  useModel,
  useOutputs,
  useRestoredScroll,
  useSelection,
  useSharedContext,
  useToolApi,
  useToolViewState,
  useUnsavedChanges,
  Button,
  Field,
  SegmentedControl,
  Select,
  TextInput,
  type EngineeringObject,
  type ModelIndex,
  type OutputView,
  type ReviewStatus,
  type Tone,
} from '../../sdk'
import type { VerificationViewState } from './index'

/** Procedures related to the shared selection (directly, via requirements, or via sub-components). */
function relevantProcedures(selection: EngineeringObject[], model: ModelIndex): Set<string> {
  const ids = new Set<string>()
  for (const object of selection) {
    if (object.type === 'procedure') ids.add(object.id)
    if (object.type === 'requirement') model.linked(object.id, 'verifies', 'in').forEach((id) => ids.add(id))
    if (isComponent(object)) {
      const scope = [object.id, ...model.childrenOf(object.id).map((c) => c.id)]
      for (const id of scope) model.linked(id, 'tests', 'in').forEach((p) => ids.add(p))
    }
  }
  return ids
}

interface ProcedureStatus {
  evidence: OutputView[]
  linkedIds: Set<string>
  analysis: { label: string; tone: Tone }
  test: { label: string; tone: Tone; output?: OutputView }
  review: { label: string; tone: Tone }
}

function useProcedureStatus(procedure: EngineeringObject): ProcedureStatus {
  const model = useModel()
  const outputs = useOutputs()
  return useMemo(() => {
    const linkedIds = new Set(model.linked(procedure.id, 'evidence-for', 'in'))
    const evidence = outputs.filter(
      (o) => linkedIds.has(o.id) || (o.kind === 'test-result' && o.objectIds.includes(procedure.id)),
    )

    const analyses = evidence.filter((o) => o.kind === 'structural-assessment' && o.completion === 'complete')
    const analysis: ProcedureStatus['analysis'] =
      analyses.length === 0
        ? { label: 'No analysis evidence', tone: 'neutral' }
        : analyses.some((o) => !o.freshness.stale)
          ? { label: 'Complete', tone: 'success' }
          : { label: 'Complete, potentially stale', tone: 'warning' }

    const tests = evidence.filter((o) => o.kind === 'test-result')
    const latest = tests[0]
    const outcome = latest?.result.find((r) => r.key === 'outcome')?.value
    const test: ProcedureStatus['test'] = !latest
      ? { label: 'Not recorded', tone: 'neutral' }
      : {
          label: `${String(outcome)}${latest.freshness.stale ? ', potentially stale' : ''}`,
          tone: latest.freshness.stale ? 'warning' : outcome === 'Pass' ? 'success' : 'danger',
          output: latest,
        }

    const approved = evidence.filter((o) => o.reviewStatus === 'approved').length
    const rejected = evidence.some((o) => o.reviewStatus === 'rejected')
    const review: ProcedureStatus['review'] =
      evidence.length === 0
        ? { label: 'Nothing to review', tone: 'neutral' }
        : {
            label: `${approved} of ${evidence.length} approved`,
            tone: rejected ? 'danger' : approved === evidence.length ? 'success' : 'info',
          }

    return { evidence, linkedIds, analysis, test, review }
  }, [model, outputs, procedure.id])
}

function RecordResultForm({ procedure, onDone }: { procedure: EngineeringObject; onDone: () => void }) {
  const api = useToolApi()
  const model = useModel()
  const context = useSharedContext()
  const scenario = model.scenario(context.scenarioId)
  const defaultUnit = procedure.id === 'VP-002' ? 's' : 'kN'
  const [outcome, setOutcome] = useState<'Pass' | 'Fail'>('Pass')
  const [measured, setMeasured] = useState('')
  const [unit, setUnit] = useState(defaultUnit)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const value = Number(measured)
  const valid = measured.trim() !== '' && Number.isFinite(value) && unit.trim() !== ''
  useUnsavedChanges(!busy && (measured.trim() !== '' || notes.trim() !== ''))

  const save = async () => {
    const requirements = model.linked(procedure.id, 'verifies', 'out')
    const components = model.linked(procedure.id, 'tests', 'out')
    setBusy(true)
    setError(null)
    try {
      await api.saveOutput({
        toolId: api.toolId,
        kind: 'test-result',
        title: `${procedure.name} result`,
        objectIds: [procedure.id, ...requirements, ...components],
        inputs: [procedure.id, ...components, context.scenarioId].map((id) => ({
          id,
          revision: model.revisionOf(id) ?? 0,
        })),
        completion: 'complete',
        result: [
          { key: 'outcome', label: 'Outcome', value: outcome },
          { key: 'measured', label: 'Measured value', value, unit: unit.trim() },
          ...(notes.trim() ? [{ key: 'notes', label: 'Notes', value: notes.trim() }] : []),
        ],
        summary: `${outcome}: ${value} ${unit.trim()} measured (mock test record)`,
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Record test result" className="vp-form">
      <p className="ws-hint">
        Recorded for <strong>{scenario?.name}</strong> in the active configuration. This is a mock record; no test
        equipment is involved.
      </p>
      <div className="vp-form-grid">
        <Field label="Outcome">
          {(id) => (
            <Select id={id} value={outcome} onChange={(e) => setOutcome(e.target.value as 'Pass' | 'Fail')}>
              <option>Pass</option>
              <option>Fail</option>
            </Select>
          )}
        </Field>
        <Field label="Measured value">
          {(id) => (
            <TextInput id={id} inputMode="decimal" value={measured} onChange={(e) => setMeasured(e.target.value)} placeholder="e.g. 12.4" />
          )}
        </Field>
        <Field label="Unit">{(id) => <TextInput id={id} value={unit} onChange={(e) => setUnit(e.target.value)} />}</Field>
        <Field label="Notes" className="vp-notes">
          {(id) => <TextInput id={id} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />}
        </Field>
      </div>
      {error && (
        <Notice tone="danger" title="Could not save">
          {error}
        </Notice>
      )}
      <div className="vp-form-actions">
        <Button onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={!valid} busy={busy}>
          {busy ? 'Saving…' : 'Save result'}
        </Button>
      </div>
    </Panel>
  )
}

function LinkEvidencePanel({ procedure, status, onDone }: { procedure: EngineeringObject; status: ProcedureStatus; onDone: () => void }) {
  const api = useToolApi()
  const model = useModel()
  const outputs = useOutputs()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scope = new Set([...model.linked(procedure.id, 'tests', 'out'), ...model.linked(procedure.id, 'verifies', 'out')])
  const evidenceIds = new Set(status.evidence.map((o) => o.id))
  const candidates = outputs.filter((o) => !evidenceIds.has(o.id) && o.objectIds.some((id) => scope.has(id)))

  const link = async (output: OutputView) => {
    setBusy(output.id)
    setError(null)
    try {
      await api.submitChanges(
        [{ kind: 'add-relationship', relationship: { type: 'evidence-for', from: output.id, to: procedure.id } }],
        `Linked ${output.id} as evidence for ${procedure.id}`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel
      title="Link evidence"
      className="vp-link"
      actions={
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      }
    >
      <p className="ws-hint">Saved outputs in this configuration for the components and requirements this procedure covers.</p>
      {candidates.length === 0 ? (
        <p className="ws-muted">No unlinked outputs available. Save an analysis result for a covered component first.</p>
      ) : (
        <ul className="ws-output-list">
          {candidates.map((o) => (
            <li key={o.id} className={o.freshness.stale ? 'is-stale' : ''}>
              <div className="ws-output-head">
                <span className="ws-mono">{o.id}</span>
                <span>{o.title}</span>
                <Button size="sm" variant="primary" onClick={() => void link(o)} disabled={busy !== null} busy={busy === o.id}>
                  {busy === o.id ? 'Linking…' : 'Link as evidence'}
                </Button>
              </div>
              <div className="ws-output-meta">
                <span>{o.summary}</span>
                <span>{model.scenario(o.scenarioId)?.name}</span>
                <FreshnessBadge freshness={o.freshness} />
                <ReviewBadge status={o.reviewStatus} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <Notice tone="danger" title="Could not link">
          {error}
        </Notice>
      )}
    </Panel>
  )
}

function EvidenceList({ procedure, status, reviewMode }: { procedure: EngineeringObject; status: ProcedureStatus; reviewMode: boolean }) {
  const api = useToolApi()
  const model = useModel()
  const [error, setError] = useState<string | null>(null)

  const review = (output: OutputView, next: ReviewStatus) =>
    api.setReviewStatus(output.id, next).catch((e) => setError(e instanceof Error ? e.message : String(e)))

  const unlink = async (output: OutputView) => {
    const rel = model.findRelationship('evidence-for', output.id, procedure.id)
    if (!rel) return
    await api
      .submitChanges([{ kind: 'remove-relationship', relationshipId: rel.id }], `Unlinked ${output.id} from ${procedure.id}`)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }

  if (status.evidence.length === 0) return <p className="ws-muted">No evidence recorded or linked yet.</p>

  return (
    <>
      <ul className="ws-output-list">
        {status.evidence.map((o) => (
          <li key={o.id} className={o.freshness.stale ? 'is-stale' : ''} data-output-id={o.id}>
            <div className="ws-output-head">
              <span className="ws-mono">{o.id}</span>
              <span>{o.title}</span>
              <Badge tone="neutral">{o.kind === 'test-result' ? 'Test record' : 'Analysis'}</Badge>
            </div>
            <div className="ws-output-meta">
              <span>{o.summary}</span>
              <span>{model.scenario(o.scenarioId)?.name}</span>
              <span>Model rev {o.inputRevision}</span>
              <span>{formatTime(o.createdAt)}</span>
            </div>
            <div className="ws-output-meta">
              <FreshnessBadge freshness={o.freshness} />
              <ReviewBadge status={o.reviewStatus} />
              {status.linkedIds.has(o.id) && (
                <Button size="sm" variant="ghost" onClick={() => void unlink(o)}>
                  Unlink
                </Button>
              )}
            </div>
            {reviewMode && (
              <div className="vp-review-actions">
                <span className="ws-muted">Review:</span>
                <Button size="sm" onClick={() => void review(o, 'in-review')} disabled={o.reviewStatus === 'in-review'}>
                  Submit for review
                </Button>
                <Button size="sm" onClick={() => void review(o, 'approved')} disabled={o.reviewStatus === 'approved'}>
                  Approve
                </Button>
                <Button size="sm" onClick={() => void review(o, 'rejected')} disabled={o.reviewStatus === 'rejected'}>
                  Reject
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <Notice tone="danger" title="Action failed">
          {error}
        </Notice>
      )}
    </>
  )
}

function StatusRow({ procedure, status }: { procedure: EngineeringObject; status: ProcedureStatus }) {
  const model = useModel()
  const requirements = model.linkedObjects(procedure.id, 'verifies', 'out')
  return (
    <div className="vp-statuses" aria-label="Separate status indicators">
      <div>
        <span className="vp-status-label">Analysis completion</span>
        <Badge tone={status.analysis.tone}>{status.analysis.label}</Badge>
      </div>
      <div>
        <span className="vp-status-label">Test result</span>
        <Badge tone={status.test.tone}>{status.test.label}</Badge>
      </div>
      <div>
        <span className="vp-status-label">Requirement compliance</span>
        <span className="vp-status-values">
          {requirements.map((r) => (
            <span key={r.id} title={`${r.id} ${r.name} (set in Requirements)`}>
              <span className="ws-mono">{r.id}</span> <ComplianceBadge value={r.properties.compliance} />
            </span>
          ))}
        </span>
      </div>
      <div>
        <span className="vp-status-label">Review approval</span>
        <Badge tone={status.review.tone}>{status.review.label}</Badge>
      </div>
    </div>
  )
}

function TraceView({ procedure, status }: { procedure: EngineeringObject; status: ProcedureStatus }) {
  const model = useModel()
  const requirements = model.linkedObjects(procedure.id, 'verifies', 'out')
  const components = model.linkedObjects(procedure.id, 'tests', 'out')
  return (
    <div className="vp-trace" aria-label="Traceability">
      <div className="vp-trace-col">
        <h4>Requirements</h4>
        {requirements.map((r) => (
          <div key={r.id} className="vp-trace-node">
            <ObjectRef object={r} />
            <ComplianceBadge value={r.properties.compliance} />
          </div>
        ))}
      </div>
      <div className="vp-trace-arrow" aria-hidden="true">
        →
      </div>
      <div className="vp-trace-col">
        <h4>Components</h4>
        {components.map((c) => (
          <div key={c.id} className="vp-trace-node">
            <ObjectRef object={c} />
            <span className="ws-muted">rev {c.revision}</span>
          </div>
        ))}
      </div>
      <div className="vp-trace-arrow" aria-hidden="true">
        →
      </div>
      <div className="vp-trace-col">
        <h4>Procedure</h4>
        <div className="vp-trace-node">
          <ObjectRef object={procedure} />
          <span className="ws-muted">{String(procedure.properties.method ?? '')}</span>
        </div>
      </div>
      <div className="vp-trace-arrow" aria-hidden="true">
        →
      </div>
      <div className="vp-trace-col">
        <h4>Evidence</h4>
        {status.evidence.length === 0 && <span className="ws-muted">None</span>}
        {status.evidence.map((o) => (
          <div key={o.id} className={`vp-trace-node${o.freshness.stale ? ' is-stale' : ''}`}>
            <span className="ws-mono">{o.id}</span>
            <span>{o.title}</span>
            <span className="ws-muted">
              {model.scenario(o.scenarioId)?.name} · rev {o.inputRevision}
            </span>
            <span className="vp-trace-badges">
              <FreshnessBadge freshness={o.freshness} />
              <ReviewBadge status={o.reviewStatus} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProcedureDetail({ procedure, viewState }: { procedure: EngineeringObject; viewState: VerificationViewState }) {
  const api = useToolApi<VerificationViewState>()
  const model = useModel()
  const status = useProcedureStatus(procedure)
  const steps = Array.isArray(procedure.properties.steps) ? procedure.properties.steps : []
  const close = () => api.updateViewState({ panel: 'none' })

  return (
    <div className="vp-detail">
      <header className="vp-detail-header">
        <div>
          <h2>
            <span className="ws-mono">{procedure.id}</span> {procedure.name}
          </h2>
          <span className="ws-muted">
            {String(procedure.properties.method ?? '')} · rev {procedure.revision}
          </span>
        </div>
        <SegmentedControl
          label="Procedure view"
          role="tablist"
          value={viewState.tab}
          onChange={(tab) => api.updateViewState({ tab })}
          options={[
            { value: 'details', label: 'Details' },
            { value: 'trace', label: 'Traceability' },
          ]}
        />
      </header>

      <StatusRow procedure={procedure} status={status} />

      {viewState.tab === 'trace' ? (
        <TraceView procedure={procedure} status={status} />
      ) : (
        <div className="vp-detail-grid">
          <div>
            {viewState.panel === 'record' && <RecordResultForm procedure={procedure} onDone={close} />}
            {viewState.panel === 'link' && <LinkEvidencePanel procedure={procedure} status={status} onDone={close} />}
            <Panel title={`Evidence (${status.evidence.length})`}>
              <EvidenceList procedure={procedure} status={status} reviewMode={viewState.reviewMode} />
            </Panel>
          </div>
          <Panel title="Procedure">
            <dl className="vp-props">
              <dt>Verifies</dt>
              <dd className="ws-refs">
                {model.linkedObjects(procedure.id, 'verifies', 'out').map((r) => (
                  <ObjectRef key={r.id} object={r} />
                ))}
              </dd>
              <dt>Tests</dt>
              <dd className="ws-refs">
                {model.linkedObjects(procedure.id, 'tests', 'out').map((c) => (
                  <ObjectRef key={c.id} object={c} />
                ))}
              </dd>
              <dt>Acceptance criteria</dt>
              <dd>{String(procedure.properties.acceptanceCriteria ?? '—')}</dd>
              <dt>Steps</dt>
              <dd>
                <ol className="vp-steps">
                  {steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </dd>
            </dl>
          </Panel>
        </div>
      )}
    </div>
  )
}

function ProcedureRow({ procedure, active, onOpen }: { procedure: EngineeringObject; active: boolean; onOpen: () => void }) {
  const model = useModel()
  const status = useProcedureStatus(procedure)
  return (
    <tr className={active ? 'is-selected' : ''} onClick={onOpen} aria-selected={active}>
      <td className="ws-mono vp-cell-id" data-label="ID">{procedure.id}</td>
      <td data-label="Procedure">{procedure.name}</td>
      <td className="ws-mono" data-label="Verifies">{model.linked(procedure.id, 'verifies', 'out').join(', ')}</td>
      <td className="ws-mono" data-label="Tests">{model.linked(procedure.id, 'tests', 'out').join(', ')}</td>
      <td data-label="Latest test result">
        <Badge tone={status.test.tone}>{status.test.label}</Badge>
      </td>
      <td data-label="Evidence">{status.evidence.length}</td>
    </tr>
  )
}

export default function VerificationView() {
  const model = useModel()
  const { selectedObjects } = useSelection()
  const [viewState, setViewState] = useToolViewState<VerificationViewState>()
  const scrollRef = useRestoredScroll<HTMLDivElement>('procedures')

  const procedures = model.objects.filter((o) => o.type === 'procedure')
  const related = relevantProcedures(selectedObjects, model)
  const filtered = !viewState.showAll && selectedObjects.length > 0
  const visible = filtered ? procedures.filter((p) => related.has(p.id)) : procedures
  const active = visible.find((p) => p.id === viewState.procedureId) ?? visible[0]

  // Keep the detail panel pointing at a visible procedure (tool-local; the shared selection is untouched).
  useEffect(() => {
    const id = active?.id ?? null
    if (id !== viewState.procedureId) setViewState({ procedureId: id })
  }, [active?.id, viewState.procedureId, setViewState])

  return (
    <div className="vp-root">
      {viewState.addNoticeShown && (
        <Notice
          tone="info"
          title="Add Procedure is illustrative"
          actions={
            <Button size="sm" onClick={() => setViewState({ addNoticeShown: false })}>
              Dismiss
            </Button>
          }
        >
          Authoring new procedures is not implemented in this mockup.
        </Notice>
      )}

      <div className="vp-list">
        <div className="req-filterbar">
          {filtered ? (
            <span>
              Procedures related to {selectedObjects.map((o) => <ObjectRef key={o.id} object={o} />)}
              <Button size="sm" variant="ghost" onClick={() => setViewState({ showAll: true })}>
                Show all
              </Button>
            </span>
          ) : (
            <span>
              All procedures
              {selectedObjects.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setViewState({ showAll: false })}>
                  Only related to selection
                </Button>
              )}
            </span>
          )}
        </div>
        <div className="ws-table-wrap" ref={scrollRef}>
          <table className="ws-table">
            <thead>
              <tr>
                <th className="vp-col-id">ID</th>
                <th>Procedure</th>
                <th className="vp-col-verifies">Verifies</th>
                <th className="vp-col-tests">Tests</th>
                <th className="vp-col-result">Latest test result</th>
                <th className="vp-col-evidence">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <ProcedureRow key={p.id} procedure={p} active={p.id === active?.id} onOpen={() => setViewState({ procedureId: p.id })} />
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="ws-empty-row">
                    No verification procedures cover the current selection.{' '}
                    <Button size="sm" variant="ghost" onClick={() => setViewState({ showAll: true })}>
                      Show all procedures
                    </Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {active && <ProcedureDetail key={active.id} procedure={active} viewState={viewState} />}
    </div>
  )
}

import { Badge, Button, LoadingState, Notice, SegmentedControl, useToasts } from '@ews/design-system'
import { formatTime } from '@ews/platform-sdk/react'
import type { ValidationReport } from '@ews/sysml-client'
import { RULES, semanticsOf, type Model } from '@ews/sysml-core'
import { useEffect, useState } from 'react'
import { message, type ModelerSession, type SessionState } from '../session'
import { DiagnosticList } from './common'
import { useViewState } from './hooks'

/** Validation results of the loaded commit; selecting a problem selects its element. */
export function ValidationPanel({ session, state, model }: { session: ModelerSession; state: SessionState; model: Model }) {
  const [, update] = useViewState()
  const [report, setReport] = useState<ValidationReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [severity, setSeverity] = useState<'all' | 'error' | 'warning' | 'info'>('all')
  useEffect(() => {
    let alive = true
    setReport(null)
    if (!state.project || !state.headCommitId) return
    session.client.validation(state.project.id, state.headCommitId).then(
      (r) => alive && setReport(r),
      (e) => alive && setError(message(e)),
    )
    return () => {
      alive = false
    }
  }, [session, state.project, state.headCommitId])
  const s = semanticsOf(model)
  if (error) return <Notice tone="danger" title="Validation failed">{error}</Notice>
  if (!report) return <LoadingState label="Validating" />
  const shown = report.diagnostics.filter((d) => severity === 'all' || d.severity === severity)
  return (
    <div className="smod-panel" data-help-id="sysml-modeler.validation">
      <div className="smod-panel-bar">
        <Badge tone={report.counts.error ? 'danger' : 'success'} icon={report.counts.error ? 'error' : 'success'}>{`${report.counts.error} error${report.counts.error === 1 ? '' : 's'}`}</Badge>
        <Badge tone={report.counts.warning ? 'warning' : 'neutral'} icon="warning">{`${report.counts.warning} warning${report.counts.warning === 1 ? '' : 's'}`}</Badge>
        <span className="smod-muted">Commit #{state.commits.find((c) => c.id === report.commitId)?.number ?? '?'} · {RULES.length} rules</span>
        <span className="smod-spacer" />
        <SegmentedControl label="Severity" size="sm" value={severity} onChange={setSeverity} options={[{ value: 'all', label: 'All' }, { value: 'error', label: 'Errors' }, { value: 'warning', label: 'Warnings' }, { value: 'info', label: 'Info' }]} />
      </div>
      {shown.length === 0 ? (
        <Notice tone="success" title="No problems">The model passes the validation rules of this version (see Help › Validation for what is and is not checked).</Notice>
      ) : (
        <DiagnosticList diagnostics={shown} labelOf={(id) => s.label(id)} onSelect={(d) => d.elementId && update({ selectedId: d.elementId, pane: 'properties' })} />
      )}
    </div>
  )
}

const SOURCE_LABEL: Record<string, string> = { user: 'person', assistant: 'AI assistant', import: 'import', api: 'API', revert: 'undo', seed: 'seed' }

/** Commit history with provenance; any commit can be undone (compensating commit) unless later commits changed the same elements. */
export function HistoryPanel({ session, state }: { session: ModelerSession; state: SessionState }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reverted = new Set(state.commits.map((c) => c.source.revertedCommitId).filter(Boolean))
  return (
    <div className="smod-panel" data-help-id="sysml-modeler.history">
      <div className="smod-panel-bar">
        <strong>Branch {state.branch?.name}</strong>
        <span className="smod-muted">{state.commits.length} recent commits · head #{state.commits[0]?.number}</span>
      </div>
      {error && <Notice tone="danger" title="Undo refused">{error}</Notice>}
      <ol className="smod-history">
        {state.commits.map((c) => (
          <li key={c.id} className="smod-commit">
            <div className="smod-commit-head">
              <strong>#{c.number}</strong>
              <span className="smod-commit-summary">{c.description || c.summary}</span>
            </div>
            <div className="smod-commit-meta">
              <Badge tone={c.source.kind === 'assistant' ? 'info' : 'neutral'} icon={c.source.kind === 'assistant' ? 'assistant' : undefined}>{SOURCE_LABEL[c.source.kind] ?? c.source.kind}</Badge>
              <span>{c.actor}</span>
              <span>{formatTime(c.created)}</span>
              <span>{c.changeCount} element version{c.changeCount === 1 ? '' : 's'}</span>
              {c.source.proposalId && <span className="smod-mono">proposal {c.source.proposalId}</span>}
              {reverted.has(c.id) && <Badge tone="warning">undone</Badge>}
            </div>
            {c.summary && c.summary !== c.description && <div className="smod-muted">{c.summary}</div>}
            {c.number > 1 && !reverted.has(c.id) && (
              <Button
                size="sm"
                variant="text"
                icon="undo"
                isPending={busy === c.id}
                onPress={async () => {
                  setBusy(c.id)
                  setError(null)
                  try {
                    const out = await session.revert(c.id)
                    useToasts.getState().push({ tone: 'success', title: out.summaryText })
                  } catch (e) {
                    setError(message(e))
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                Undo
              </Button>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

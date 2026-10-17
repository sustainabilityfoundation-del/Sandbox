import { Badge, Button, EmptyState, Notice, Spinner } from '@ews/design-system'
import { formatTime } from '@ews/platform-sdk/react'
import type { CheckBound, CheckReport, CheckResult, CheckStatus } from '../checks'
import type { CheckPanelState } from '../checkStore'
import { fmtNum } from './common'

const STATUS: Record<CheckStatus, { tone: 'success' | 'danger' | 'warning'; icon: 'success' | 'error' | 'warning'; label: string }> = {
  satisfied: { tone: 'success', icon: 'success', label: 'Pass' },
  violated: { tone: 'danger', icon: 'error', label: 'Fail' },
  'not-checkable': { tone: 'warning', icon: 'warning', label: 'Not checkable' },
}

/** The bound as a short phrase, for example "<= 5 mm" or "between 2 and 4 mm". */
export function describeBound(b: CheckBound): string {
  const u = b.unit ? ` ${b.unit}` : ''
  if (b.operator === 'in-range') return `between ${b.min ?? '-inf'} and ${b.max ?? 'inf'}${u}`
  return `${b.operator} ${b.value ?? '—'}${u}`
}

const short = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const isValidity = (r: CheckResult) => r.checkId.startsWith('solid-valid:')

/**
 * Result of "Check against constraints" (cad-modeler.check on the open document). Every row shows what was measured, the
 * measured value with its unit, the bound with the constraint's stable ID (CST-nnn), pass or fail and where the value comes from
 * (kernel or model). Items that cannot be checked say why. Nothing here changes the model.
 */
export function CheckPanel({ check, onRun, canRun, stale }: { check: CheckPanelState | undefined; onRun: () => void; canRun: boolean; stale?: boolean }) {
  return (
    <section className="cadm-section" aria-label="Constraint check" data-help-id="cad-modeler.check" data-testid="check-panel">
      <h4 className="cadm-subtitle">Check against constraints</h4>
      <p className="cadm-hint">Measures the regenerated model and compares it with the bounds of the design constraints its parameters are bound to. Read-only; bounds are read from Conceptualize, never typed here.</p>
      <div className="cadm-actions">
        <Button size="sm" variant="outlined" icon="verification" isDisabled={!canRun || check?.state === 'running'} onPress={onRun}>
          {check?.state === 'done' || check?.state === 'error' ? 'Check again' : 'Check against constraints'}
        </Button>
      </div>
      {!check && <p className="cadm-muted">Not run yet. Use Check against constraints in the toolbar or here.</p>}
      {check?.state === 'running' && (
        <p className="cadm-muted" role="status">
          <Spinner size={14} /> Measuring the model…
        </p>
      )}
      {check?.state === 'error' && (
        <Notice tone="danger" title="The check could not run">
          {check.message}
        </Notice>
      )}
      {check?.state === 'done' && stale && (
        <Notice tone="warning" title="Outdated, run again">
          The model changed after this check (it measured model v{check.report.modelVersion}). The results below no longer describe the current model.
        </Notice>
      )}
      {check?.state === 'done' && <Report report={check.report} at={check.at} stale={!!stale} />}
    </section>
  )
}

function Report({ report, at, stale }: { report: CheckReport; at: string; stale: boolean }) {
  const s = report.summary
  const measures = report.results.filter((r) => !isValidity(r))
  const validity = report.results.filter(isValidity)
  return (
    <div className="cadm-check" data-stale={stale ? 'true' : undefined}>
      <p className="cadm-hint" data-testid="check-summary" role="status" aria-live="polite">
        “{report.documentTitle}”{report.documentRevision ? ` revision ${report.documentRevision}` : ' (not stored in the project)'}, model v{report.modelVersion}, {report.kernel.name} {report.kernel.version}. Checked {formatTime(at)}.{stale ? ' Outdated.' : ''}
      </p>
      <div className="cadm-check-summary">
        <Badge tone={stale ? 'neutral' : 'success'} icon="success">{s.satisfied} pass{stale ? ' (outdated)' : ''}</Badge>
        <Badge tone={s.violated ? 'danger' : 'neutral'} icon="error">{s.violated} fail</Badge>
        <Badge tone={s['not-checkable'] ? 'warning' : 'neutral'} icon="warning">{s['not-checkable']} not checkable</Badge>
      </div>
      {measures.length === 0 ? (
        <EmptyState icon="link" title="No parameter is bound to a design constraint">
          Nothing was compared with a bound. Bind a parameter to a Conceptualize constraint (Model tab, Parameters), or start the part from a Conceptualize CAD handoff, then check again.
        </EmptyState>
      ) : (
        <ul className="cadm-check-list" aria-label="Checked measures">
          {measures.map((r) => (
            <ResultRow key={r.checkId} r={r} />
          ))}
        </ul>
      )}
      {validity.length > 0 && (
        <ul className="cadm-check-list" aria-label="Solid validity">
          {validity.map((r) => (
            <ResultRow key={r.checkId} r={r} />
          ))}
        </ul>
      )}
      {report.assumptions.length > 0 && (
        <Notice tone="info" title="Assumptions and limits">
          {report.assumptions.map((a, i) => (
            <span key={i} className="cadm-block">{a}</span>
          ))}
        </Notice>
      )}
      <p className="cadm-hint">Results report geometry and values only; they make no claim of structural adequacy, safety or compliance.</p>
    </div>
  )
}

function ResultRow({ r }: { r: CheckResult }) {
  const st = STATUS[r.status]
  return (
    <li className="cadm-check-item" data-testid="check-result" data-status={r.status} data-check-id={r.checkId}>
      <div className="cadm-check-head">
        <span className="cadm-check-name">{r.binding ? r.binding.parameter : r.quantity}</span>
        <Badge tone={st.tone} icon={st.icon}>{st.label}</Badge>
      </div>
      <dl className="cadm-props">
        {r.binding && (
          <>
            <dt>Measure</dt>
            <dd>{r.quantity}</dd>
          </>
        )}
        {r.measured && (
          <>
            <dt>Measured</dt>
            <dd className="cadm-mono" data-testid="check-measured">{fmtNum(r.measured.value, 4)} {r.measured.unit}</dd>
          </>
        )}
        {r.bound && (
          <>
            <dt>Bound</dt>
            <dd data-testid="check-bound">
              <span className="cadm-mono">{r.bound.key}</span> <span className="cadm-mono">{describeBound(r.bound)}</span> (revision {r.bound.constraint.revision}
              {r.bound.latestRevision > r.bound.constraint.revision ? `, latest ${r.bound.latestRevision}` : ''}, {r.bound.strength}). <span className="cadm-muted">{short(r.bound.statement)}</span>
            </dd>
          </>
        )}
        {r.reason && (
          <>
            <dt>Reason</dt>
            <dd data-testid="check-reason">{r.reason}</dd>
          </>
        )}
        <dt>Source</dt>
        <dd data-testid="check-provenance">
          {r.provenance ? (
            <>
              <Badge tone={r.provenance.source === 'kernel' ? 'info' : 'neutral'}>{r.provenance.source === 'kernel' ? 'Kernel' : 'Model'}</Badge> <span className="cadm-muted">{r.provenance.measuredOn}</span>
            </>
          ) : (
            <span className="cadm-muted">{r.method}</span>
          )}
        </dd>
      </dl>
    </li>
  )
}

import { AppIcon, Badge, cx } from '@ews/design-system'
import type { TransactionOutcome } from '@ews/sysml-client'
import type { Diagnostic } from '@ews/sysml-core'

/** Shared presentation of diagnostics and change sets (editor, dialogs, panels). */

export function severityIcon(s: Diagnostic['severity']) {
  return s === 'error' ? ('error' as const) : s === 'warning' ? ('warning' as const) : ('info' as const)
}

export function DiagnosticList({ diagnostics, onSelect, labelOf }: { diagnostics: Diagnostic[]; onSelect?: (d: Diagnostic) => void; labelOf?: (id: string) => string }) {
  if (!diagnostics.length) return null
  return (
    <ul className="smod-diags" aria-label="Problems">
      {diagnostics.slice(0, 300).map((d, k) => (
        <li key={`${d.ruleId}-${k}`}>
          <div
            className={cx('smod-diag', `is-${d.severity}`, onSelect && 'is-clickable')}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            onClick={() => onSelect?.(d)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect && (e.preventDefault(), onSelect(d))}
          >
            <AppIcon name={severityIcon(d.severity)} size={16} />
            <span className="smod-diag-text">
              {d.range ? <span className="smod-mono">{`${d.range.start.line}:${d.range.start.column} `}</span> : null}
              {d.message}
              {d.elementId && labelOf && !d.range ? <span className="smod-muted"> — {labelOf(d.elementId)}</span> : null}
            </span>
            <span className="smod-diag-rule">{d.ruleId}</span>
          </div>
        </li>
      ))}
      {diagnostics.length > 300 && <li className="smod-muted">{diagnostics.length - 300} more not shown.</li>}
    </ul>
  )
}

const KIND_TONE = { created: 'success', updated: 'info', deleted: 'danger' } as const

export function ChangeList({ outcome }: { outcome: TransactionOutcome }) {
  return (
    <section className="smod-changes" aria-label={outcome.dryRun ? 'Preview of changes' : 'Applied changes'}>
      <header>
        <strong>{outcome.dryRun ? 'Preview (nothing written yet)' : `Committed as #${outcome.commit?.number ?? '?'}`}</strong>
        {outcome.rebased && <Badge tone="info">Applied on the latest version</Badge>}
        <span className="smod-muted">{outcome.changes.length} element version{outcome.changes.length === 1 ? '' : 's'}</span>
      </header>
      {outcome.summary.length ? (
        <ul>
          {outcome.summary.map((i) => (
            <li key={`${i.kind}-${i.id}`}>
              <Badge tone={KIND_TONE[i.kind as keyof typeof KIND_TONE] ?? 'neutral'}>{i.kind}</Badge> <span className="smod-mono">{i.label}</span> <span className="smod-muted">{i.metaclass}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="smod-muted">No element changes.</p>
      )}
      {outcome.diagnostics.introduced.length > 0 && (
        <>
          <strong>Problems this change introduces</strong>
          <DiagnosticList diagnostics={outcome.diagnostics.introduced} />
        </>
      )}
      {outcome.diagnostics.resolved.length > 0 && <p className="smod-muted">Resolves {outcome.diagnostics.resolved.length} existing problem{outcome.diagnostics.resolved.length === 1 ? '' : 's'}.</p>}
    </section>
  )
}

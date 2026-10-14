import { Badge, Button, LoadingState, Notice, TextField, type Tone } from '@ews/design-system'
import type { QualityFinding, Requirement } from '@ews/requirements-client'
import { useState } from 'react'
import { useModuleData, useResource } from '../data'
import { ApiErrorNotice } from './common'

const CLASS_LABEL: Record<QualityFinding['class'], { label: string; tone: Tone; hint: string }> = {
  validation: { label: 'Validation', tone: 'danger', hint: 'Deterministic check of recorded data against your conventions' },
  heuristic: { label: 'Heuristic', tone: 'warning', hint: 'Text pattern that often indicates a problem; may be wrong' },
  assistant: { label: 'Assistant review', tone: 'info', hint: 'Optional review requested through the assistant' },
}

function FindingItem({ f, onDismiss, canDismiss }: { f: QualityFinding; onDismiss: (reason: string) => Promise<void>; canDismiss: boolean }) {
  const [dismissing, setDismissing] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const c = CLASS_LABEL[f.class]
  return (
    <li className="req-finding" data-rule={f.ruleId} data-dismissed={f.dismissal ? '' : undefined}>
      <div className="req-finding-head">
        <span title={c.hint}>
          <Badge tone={f.dismissal ? 'neutral' : c.tone}>{c.label}</Badge>
        </span>
        <strong>{f.message}</strong>
      </div>
      <p className="m-0 text-fg-2">{f.explanation}</p>
      <p className="m-0">
        <span className="text-fg-3">Proposed improvement: </span>
        {f.suggestion}
      </p>
      {f.reference && <p className="m-0 text-ui-xs text-fg-3">Basis: {f.reference}</p>}
      {f.dismissal ? (
        <p className="m-0 text-ui-xs text-fg-3">
          Dismissed by {f.dismissal.by}: {f.dismissal.reason}
        </p>
      ) : (
        canDismiss &&
        !(f.class === 'validation' && f.severity === 'error') &&
        (dismissing ? (
          <div className="req-decide">
            <TextField label="Why does this not apply?" value={reason} onChange={setReason} autoFocus />
            <div className="req-actions-row">
              <Button
                size="sm"
                variant="outlined"
                isDisabled={!reason.trim()}
                isPending={busy}
                onPress={async () => {
                  setBusy(true)
                  setError(null)
                  try {
                    await onDismiss(reason)
                  } catch (e) {
                    setError(e)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Dismiss with reason
              </Button>
              <Button size="sm" variant="text" onPress={() => setDismissing(false)}>
                Cancel
              </Button>
            </div>
            {error ? <ApiErrorNotice error={error} title="Not dismissed" /> : null}
          </div>
        ) : (
          <Button size="sm" variant="text" onPress={() => setDismissing(true)}>
            Dismiss…
          </Button>
        ))
      )}
    </li>
  )
}

/** Findings for one revision. Nothing is rewritten or approved automatically. */
export function QualityTab({ r, readOnly }: { r: Requirement; readOnly: boolean }) {
  const { client, can, invalidate } = useModuleData()
  const report = useResource(() => client.quality(r.id, r.baselineId ? r.revision : undefined), [client, r.id, r.revision])
  if (report.error) return <ApiErrorNotice error={new Error(report.error)} title="Could not run the checks" onRetry={report.reload} />
  if (!report.data) return <LoadingState label="Checking…" />
  const open = report.data.findings.filter((f) => !f.dismissal)
  const dismissed = report.data.findings.filter((f) => f.dismissal)
  const dismiss = async (f: QualityFinding, reason: string) => {
    await client.dismiss(r.id, { revision: report.data!.revision, ruleId: f.ruleId, fingerprint: f.fingerprint, reason })
    invalidate()
  }
  return (
    <div className="flex flex-col gap-3">
      <Notice tone="info">{report.data.disclaimer}</Notice>
      {open.length === 0 && <p className="m-0 text-fg-2">No open findings for revision {report.data.revision}.</p>}
      <ul className="req-findings" aria-label={`Quality findings for ${r.key}`}>
        {open.map((f) => (
          <FindingItem key={f.fingerprint} f={f} canDismiss={!readOnly && can('dismiss-finding')} onDismiss={(reason) => dismiss(f, reason)} />
        ))}
      </ul>
      {dismissed.length > 0 && (
        <details>
          <summary>{dismissed.length} dismissed for this revision</summary>
          <ul className="req-findings">
            {dismissed.map((f) => (
              <FindingItem key={f.fingerprint} f={f} canDismiss={false} onDismiss={async () => undefined} />
            ))}
          </ul>
        </details>
      )}
      <p className="ws-hint m-0">Dismissals apply to revision {report.data.revision}; a new revision is checked again.</p>
    </div>
  )
}

/** Project overview of open findings and the configurable writing conventions. */
export function QualityView({ collectionId, onOpen }: { collectionId: string | null; onOpen: (id: string) => void }) {
  const { client, can, invalidate } = useModuleData()
  const summary = useResource(() => client.qualitySummary(collectionId ?? undefined), [client, collectionId])
  const conventions = useResource(() => client.conventions(), [client])
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const saveConventions = async () => {
    setError(null)
    try {
      const parsed = JSON.parse(editing!)
      await client.putConventions(parsed, conventions.data!.revision)
      setEditing(null)
      invalidate()
    } catch (e) {
      setError(e instanceof SyntaxError ? new Error(`Not valid JSON: ${e.message}`) : e)
    }
  }
  return (
    <div className="req-page">
      <h3 className="req-page-title">Quality assistance</h3>
      {summary.data && <Notice tone="info">{summary.data.disclaimer}</Notice>}
      {summary.error && <ApiErrorNotice error={new Error(summary.error)} title="Could not run the checks" onRetry={summary.reload} />}
      {!summary.data && summary.loading && <LoadingState label="Checking requirements…" />}
      {summary.data && (
        <>
          <p className="m-0">
            {summary.data.requirementsChecked} requirements checked; {summary.data.items.length} with open findings.
          </p>
          <div className="req-rule-counts">
            {Object.entries(summary.data.byRule)
              .sort((a, b) => b[1] - a[1])
              .map(([rule, n]) => (
                <Badge key={rule} tone={rule.startsWith('validation') ? 'danger' : 'warning'}>
                  {rule.replace(/^(validation|heuristic)\./, '')}: {n}
                </Badge>
              ))}
          </div>
          <ul className="req-quality-list">
            {summary.data.items.map((i) => (
              <li key={i.requirementId}>
                <Button size="sm" variant="text" onPress={() => onOpen(i.requirementId)}>
                  <span className="font-mono">{i.key}</span> {i.title}
                </Button>
                <span className="text-fg-3">
                  {i.open} open{i.dismissed ? `, ${i.dismissed} dismissed` : ''} · {i.topRules.join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h4 className="req-subhead">Writing conventions</h4>
      <p className="ws-hint m-0">
        Configurable per project: obligation verbs, vague and ambiguous terms, units, required fields and expected traceability. “shall” is not enforced unless you turn on requireObligationVerb.
      </p>
      {conventions.data && !editing && (
        <>
          <pre className="req-json">{JSON.stringify(conventions.data.settings, null, 2)}</pre>
          {can('edit-conventions') && (
            <Button size="sm" variant="outlined" icon="edit" onPress={() => setEditing(JSON.stringify(conventions.data!.settings, null, 2))}>
              Edit conventions
            </Button>
          )}
        </>
      )}
      {editing !== null && (
        <>
          <TextField label="Conventions (JSON)" multiline rows={16} value={editing} onChange={setEditing} inputClassName="font-mono" />
          <div className="req-actions-row">
            <Button variant="filled" icon="save" onPress={() => void saveConventions()}>
              Save conventions
            </Button>
            <Button variant="text" onPress={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </>
      )}
      {error ? <ApiErrorNotice error={error} title="Conventions not saved" /> : null}
    </div>
  )
}

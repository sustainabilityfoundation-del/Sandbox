import { Badge, Button, LoadingState, Notice, Select, TextField } from '@ews/design-system'
import { useToolViewState } from '@ews/platform-sdk/react'
import type { CalculationInput, CalculationModel, CalculationQualifications, EvaluateResult, Evidence } from '@ews/conceptualize-client'
import { useState } from 'react'
import { checkStatusLabel, limitsText, rangeLabel, sampledWithinLabel, STATUS_TONE } from '../calcLabels'
import { useModuleData, useResource } from '../data'
import { BASIS, formatDate, formatQuantity, type ConceptualizeViewState } from '../domain'
import { ApiErrorNotice, BasisBadge, ProvenanceBadge, Section } from './common'

/**
 * Calculation models (CR-C8) in the inspector: definition, validation, read-only evaluation and recording a
 * result as evidence. Results and checks are shown with the C11 vocabulary; a reproducible result never reads as
 * verified, and a range is never shown as satisfied unless proven.
 */

function useRun() {
  const { invalidate } = useModuleData()
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    setBusy(true)
    try {
      const r = await fn()
      invalidate()
      return r
    } catch (e) {
      setError(e)
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { error, busy, run }
}

const VALIDATION_TONE = { unvalidated: 'warning', validated: 'success', deprecated: 'neutral' } as const

/** Outputs, checks, validity and limits of a calculation (shared by evaluation results and evidence). */
export function QualificationsView({ q }: { q: CalculationQualifications }) {
  return (
    <div className="con-stack" data-help-id="conceptualize.calculation.qualifications">
      <ul className="con-rel-list">
        {q.outputs.map((o) => (
          <li key={o.symbol}>
            <span>
              {o.symbol} = <strong>{formatQuantity({ value: o.value, unit: o.unit })}</strong>
            </span>
            <Badge tone="neutral">{rangeLabel(o.range, o.unit)}</Badge>
            {sampledWithinLabel(o.range, o.unit) && <span className="con-muted">{sampledWithinLabel(o.range, o.unit)}</span>}
          </li>
        ))}
      </ul>
      {q.checks.length > 0 && (
        <ul className="con-rel-list">
          {q.checks.map((c) => (
            <li key={c.relationId}>
              <code>{c.text}</code>
              <Badge tone={STATUS_TONE[c.status]}>{checkStatusLabel(c.status, c.statusBasis)}</Badge>
              <span className="con-muted">nominal margin {formatQuantity({ value: c.margin, unit: c.unit })}</span>
            </li>
          ))}
        </ul>
      )}
      {(q.validity.violated.length > 0 || q.validity.uncertain.length > 0) && (
        <Notice tone="warning" title="Model validity conditions">
          {q.validity.violated.length > 0 && <span>Violated: {q.validity.violated.join('; ')}. </span>}
          {q.validity.uncertain.length > 0 && <span>Not proven: {q.validity.uncertain.join('; ')}.</span>}
        </Notice>
      )}
      <p className="con-muted" data-help-id="conceptualize.calculation.limits">
        {limitsText(q.limits)}
      </p>
    </div>
  )
}

/** The verified calculation of an evidence record. */
export function CalculationEvidence({ e }: { e: Evidence }) {
  if (!e.calculation || !e.qualifications) return null
  return (
    <div className="con-stack" data-help-id="conceptualize.calculation.evidence">
      <p className="con-muted">
        Calculation model revision {e.calculation.modelRevision}
        {e.calculation.verification ? `, reproduced by the service with engine ${e.calculation.verification.engineVersion} on ${formatDate(e.calculation.verification.verifiedAt)}` : ''}
        {e.qualificationsSource === 'computed-on-read' ? ' (qualifications computed on read)' : ''}.
      </p>
      <QualificationsView q={e.qualifications} />
    </div>
  )
}

function EvaluatePanel({ m }: { m: CalculationModel }) {
  const { client, can } = useModuleData()
  const inputs = m.parameters.filter((p) => p.role === 'input' || p.role === 'design-variable')
  const [values, setValues] = useState<Record<string, { value: string; min: string; max: string; unit: string }>>(() => Object.fromEntries(inputs.map((p) => [p.symbol, { value: p.value?.toString() ?? '', min: p.min?.toString() ?? '', max: p.max?.toString() ?? '', unit: p.unit }])))
  const [uncertainty, setUncertainty] = useState<'point' | 'interval'>('point')
  const [result, setResult] = useState<EvaluateResult | null>(null)
  const [subject, setSubject] = useState<string | null>(null)
  const [recorded, setRecorded] = useState<string | null>(null)
  const graph = useResource(() => client.graph(), [client])
  const { error, busy, run } = useRun()
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s))
  const body = () => {
    const out: Record<string, CalculationInput> = {}
    for (const p of inputs) {
      const v = values[p.symbol]
      const value = num(v.value)
      const min = num(v.min)
      const max = num(v.max)
      // Empty fields fall back to the parameter's default binding or value on the server.
      if (value === undefined && min === undefined && max === undefined) continue
      out[p.symbol] = { value: value ?? null, ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}), unit: v.unit || p.unit }
    }
    return out
  }
  return (
    <Section title="Evaluate" helpId="conceptualize.calculation.evaluate">
      <p className="con-muted">Read-only. Empty inputs use the parameter's binding (for example an Assumption's value) or its default value.</p>
      <div className="con-form">
        {inputs.map((p) => (
          <div key={p.symbol} className="con-statement-edit">
            <span className="con-grow">
              <code>{p.symbol}</code> {p.name}
              {p.defaultBinding && <span className="con-muted"> (bound: {p.defaultBinding.property})</span>}
            </span>
            <TextField aria-label={`${p.symbol} value`} placeholder="value" value={values[p.symbol].value} onChange={(v) => setValues((x) => ({ ...x, [p.symbol]: { ...x[p.symbol], value: v } }))} className="con-num" />
            <TextField aria-label={`${p.symbol} min`} placeholder="min" value={values[p.symbol].min} onChange={(v) => setValues((x) => ({ ...x, [p.symbol]: { ...x[p.symbol], min: v } }))} className="con-num" />
            <TextField aria-label={`${p.symbol} max`} placeholder="max" value={values[p.symbol].max} onChange={(v) => setValues((x) => ({ ...x, [p.symbol]: { ...x[p.symbol], max: v } }))} className="con-num" />
            <TextField aria-label={`${p.symbol} unit`} placeholder="unit" value={values[p.symbol].unit} onChange={(v) => setValues((x) => ({ ...x, [p.symbol]: { ...x[p.symbol], unit: v } }))} className="con-num" />
          </div>
        ))}
        <div className="con-inline-form">
          <Select label="Uncertainty" size="sm" value={uncertainty} onChange={(v) => setUncertainty(v as 'point' | 'interval')} options={[{ id: 'point', label: 'Point (nominal values)' }, { id: 'interval', label: 'Interval (input ranges)' }]} />
          <Button size="sm" variant="filled" icon="run" isPending={busy} onPress={() => void run(async () => (setRecorded(null), setResult(await client.evaluateCalculation(m.id, { revision: m.revision, inputs: body(), uncertainty }))))}>
            Evaluate
          </Button>
        </div>
      </div>
      {result && (
        <div className="con-stack">
          <div className="con-row">
            <BasisBadge basis={result.basis} />
            <span className="con-muted">{result.basis === 'estimate' ? 'Estimate: the model is an unvalidated AI hypothesis or an input is an AI hypothesis.' : 'Calculated from this model revision and these inputs; not a verification.'}</span>
          </div>
          {result.warnings.length > 0 && <Notice tone="warning">{result.warnings.join(' ')}</Notice>}
          <QualificationsView q={result.qualifications} />
          {can('author') && (
            <div className="con-inline-form" data-help-id="conceptualize.calculation.record">
              <Select label="Evidence for" size="sm" value={subject} placeholder="Choose a Concept" onChange={setSubject} options={(graph.data?.nodes ?? []).map((n) => ({ id: n.id, label: `${n.key} ${n.name}` }))} />
              <Button
                size="sm"
                variant="outlined"
                icon="save"
                isPending={busy}
                isDisabled={!subject}
                onPress={() =>
                  void run(async () => {
                    const ev = await client.createEvidence({ subjects: [{ module: 'conceptualize', type: 'concept', id: subject! }], kind: 'calculation', title: `${m.key} ${m.name}`, basis: result.basis, calculation: { modelId: m.id, modelRevision: m.revision, manifest: result.manifest } })
                    setRecorded(ev.key)
                  })
                }
              >
                Record as evidence ({BASIS[result.basis].label})
              </Button>
              {recorded && <Badge tone="info">Recorded {recorded}; the service reproduced the calculation</Badge>}
            </div>
          )}
        </div>
      )}
      {error ? <ApiErrorNotice error={error} /> : null}
    </Section>
  )
}

export function CalculationDetail({ m }: { m: CalculationModel }) {
  const { client, can } = useModuleData()
  const [, setState] = useToolViewState<ConceptualizeViewState>()
  const revisions = useResource(() => client.calculationModelRevisions(m.id), [client, m.id, m.revision])
  const [reason, setReason] = useState('')
  const { error, busy, run } = useRun()
  return (
    <div className="con-stack" data-help-id="conceptualize.knowledge.calculation">
      <header className="con-workspace-head">
        <div>
          <span className="con-key">{m.key}</span>
          <h3>{m.name}</h3>
        </div>
        <div className="con-row">
          <Badge tone={VALIDATION_TONE[m.validationStatus]} title="Validation is a reviewer's record; a reproducible result does not validate the model">
            {m.validationStatus}
          </Badge>
          <BasisBadge basis={m.basis} />
          {m.libraryId && <Badge tone="neutral">library {m.libraryId}</Badge>}
          <span className="con-muted">rev {m.revision}</span>
          <ProvenanceBadge provenance={m.provenance} />
          <Button size="sm" variant="text" icon="close" onPress={() => setState({ record: null })}>
            Close
          </Button>
        </div>
      </header>
      {m.description && <p className="con-description">{m.description}</p>}
      <Section title="Parameters">
        <ul className="con-rel-list">
          {m.parameters.map((p) => (
            <li key={p.symbol}>
              <code>{p.symbol}</code> {p.name} <Badge tone="neutral">{p.role}</Badge> <span className="con-muted">{p.unit}</span>
              {p.value !== undefined && <span className="con-muted">= {formatQuantity({ value: p.value, unit: p.unit })}</span>}
              {p.defaultBinding && <span className="con-muted">bound to {p.defaultBinding.ref.module === 'conceptualize' ? `${(p.defaultBinding.ref as { type: string }).type} ${p.defaultBinding.ref.id.slice(0, 8)}` : p.defaultBinding.ref.id} ({p.defaultBinding.property})</span>}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Relations">
        <ul className="con-statements">
          {m.relations.map((r) => (
            <li key={r.id}>
              <code>{r.expression}</code> <Badge tone="neutral">{r.kind}</Badge>
              {r.description && <span className="con-muted">{r.description}</span>}
            </li>
          ))}
        </ul>
        {m.validity && (
          <p className="con-muted">
            Valid when: {m.validity.conditions.join(', ')}. {m.validity.text}
          </p>
        )}
      </Section>
      <EvaluatePanel m={m} />
      {(can('decide') || can('author')) && (
        <Section title="Validation" helpId="conceptualize.calculation.validation">
          <p className="con-muted">Validation records that a person reviewed the model for this kind of design. A new revision is unvalidated again.</p>
          <div className="con-inline-form">
            <TextField label="Reason (recorded)" value={reason} onChange={setReason} />
            {can('decide') && m.validationStatus !== 'validated' && (
              <Button size="sm" variant="outlined" icon="approved" isPending={busy} isDisabled={!reason.trim()} onPress={() => void run(async () => (await client.setCalculationValidation(m.id, 'validated', { reason: reason.trim(), expectedRevision: m.revision }), setReason('')))}>
                Validate
              </Button>
            )}
            {m.validationStatus !== 'deprecated' && (
              <Button size="sm" variant="outlined" icon="archive" isPending={busy} isDisabled={!reason.trim()} onPress={() => void run(async () => (await client.setCalculationValidation(m.id, 'deprecated', { reason: reason.trim(), expectedRevision: m.revision }), setReason('')))}>
                Deprecate
              </Button>
            )}
          </div>
          {error ? <ApiErrorNotice error={error} /> : null}
        </Section>
      )}
      <Section title="Revisions (immutable)">
        {!revisions.data ? (
          <LoadingState label="Loading revisions" />
        ) : (
          <ul className="con-history">
            {revisions.data.map((r) => (
              <li key={r.revision}>
                <strong>Revision {r.revision}</strong> <span className="con-muted">{formatDate(r.createdAt)} by {r.createdBy}</span> <ProvenanceBadge provenance={r.provenance} />
                {r.changeReason && <span className="con-muted"> — {r.changeReason}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

/** Creates a model from the engine library (Explorer, Calculations). */
export function NewCalculationForm() {
  const { client, can } = useModuleData()
  const [, setState] = useToolViewState<ConceptualizeViewState>()
  const lib = useResource(() => client.calculationLibrary(), [client])
  const [entry, setEntry] = useState<string | null>(null)
  const { error, busy, run } = useRun()
  if (!can('author')) return null
  return (
    <div className="con-inline-form" data-help-id="conceptualize.calculation.create">
      <Select label="New model from the library" size="sm" value={entry} placeholder="Choose a library model" onChange={setEntry} options={(lib.data ?? []).map((e) => ({ id: e.id, label: e.title }))} />
      <Button size="sm" variant="outlined" icon="add" isPending={busy} isDisabled={!entry} onPress={() => void run(async () => { const m = await client.createCalculationModel({ fromLibrary: entry! }); setState({ record: { type: 'calculation', id: m.id }, conceptId: null }) })}>
        Create model
      </Button>
      {entry && lib.data && <p className="con-muted">Starts unvalidated (AI-hypothesis library entry). Sources: {lib.data.find((e) => e.id === entry)?.sources.map((s) => s.citation).join('; ')}</p>}
      {error ? <ApiErrorNotice error={error} /> : null}
    </div>
  )
}

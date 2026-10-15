import { Button, IconButton, Notice, Select, TextField } from '@ews/design-system'
import type { Concept, Evidence, EvidenceKind, NamedQuantity, VerificationStatus } from '@ews/conceptualize-client'
import { useState } from 'react'
import { useModuleData } from '../data'
import { ApiErrorNotice } from './common'

const KINDS: EvidenceKind[] = ['calculation', 'analysis', 'simulation', 'test', 'review', 'reference', 'estimate']

interface Row {
  name: string
  value: string
  unit: string
}

function QuantityRows({ label, rows, onChange }: { label: string; rows: Row[]; onChange: (rows: Row[]) => void }) {
  const set = (i: number, p: Partial<Row>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))
  return (
    <fieldset className="con-fieldset">
      <legend>{label}</legend>
      {rows.map((r, i) => (
        <div key={i} className="con-inline-form">
          <TextField aria-label={`${label} name`} placeholder="name" value={r.name} onChange={(name) => set(i, { name })} className="con-num" />
          <TextField aria-label={`${label} value`} placeholder="value" value={r.value} onChange={(value) => set(i, { value })} className="con-num" />
          <TextField aria-label={`${label} unit`} placeholder="unit" value={r.unit} onChange={(unit) => set(i, { unit })} className="con-num" />
          <IconButton size="sm" label={`Remove ${label.toLowerCase()} row`} icon="close" onPress={() => onChange(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button size="sm" variant="text" icon="add" onPress={() => onChange([...rows, { name: '', value: '', unit: '' }])}>
        Add
      </Button>
    </fieldset>
  )
}

const toQ = (rows: Row[]): NamedQuantity[] => rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), value: r.value.trim() === '' ? null : Number(r.value), unit: r.unit.trim() || '-' }))

/**
 * Records evidence: a preliminary estimate (method, inputs, outputs with units, assumptions) or verified
 * evidence, which must reference the authoritative result in its owning module.
 */
export function EvidenceForm({ concept, onDone }: { concept: Concept; onDone: () => void }) {
  const { client, invalidate } = useModuleData()
  const [kind, setKind] = useState<EvidenceKind>('calculation')
  const [basis, setBasis] = useState<'estimate' | 'assumption' | 'evidence'>('estimate')
  const [title, setTitle] = useState('')
  const [method, setMethod] = useState('')
  const [summary, setSummary] = useState('')
  const [inputs, setInputs] = useState<Row[]>([{ name: '', value: '', unit: '' }])
  const [outputs, setOutputs] = useState<Row[]>([{ name: '', value: '', unit: '' }])
  const [assumptions, setAssumptions] = useState('')
  const [artifactModule, setArtifactModule] = useState<'twin' | 'analysis' | 'external'>('twin')
  const [artifactId, setArtifactId] = useState('')
  const [error, setError] = useState<unknown>(null)
  const save = async () => {
    setError(null)
    try {
      await client.createEvidence({
        conceptId: concept.id,
        kind,
        basis,
        title: title.trim(),
        summary: summary.trim() || undefined,
        method: method.trim() || undefined,
        inputs: toQ(inputs),
        outputs: toQ(outputs),
        assumptions: assumptions.split('\n').map((a) => a.trim()).filter(Boolean),
        ...(artifactId.trim() ? { artifact: { module: artifactModule, id: artifactId.trim(), kind: artifactModule === 'analysis' ? 'analysis-result' : undefined } } : {}),
      })
      invalidate()
      onDone()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <div className="con-form con-card" data-help-id="conceptualize.evidence">
      <div className="con-form-grid">
        <Select label="Kind" value={kind} onChange={(k) => setKind(k as EvidenceKind)} options={KINDS.map((k) => ({ id: k, label: k }))} />
        <Select label="Basis" value={basis} onChange={(b) => setBasis(b as typeof basis)} options={[{ id: 'estimate', label: 'Preliminary estimate' }, { id: 'assumption', label: 'Assumption' }, { id: 'evidence', label: 'Verified evidence (needs a referenced result)' }]} />
      </div>
      <TextField label="Title" value={title} onChange={setTitle} />
      <TextField label="Method or formula" placeholder="e.g. T = F·l / (2π·η)" value={method} onChange={setMethod} />
      <QuantityRows label="Inputs" rows={inputs} onChange={setInputs} />
      <QuantityRows label="Outputs" rows={outputs} onChange={setOutputs} />
      <TextField label="Assumptions (one per line)" multiline rows={2} value={assumptions} onChange={setAssumptions} />
      <TextField label="Summary" multiline rows={2} value={summary} onChange={setSummary} />
      <div className="con-inline-form">
        <Select label="Result reference" size="sm" value={artifactModule} onChange={(m) => setArtifactModule(m as typeof artifactModule)} options={[{ id: 'twin', label: 'Saved result (OUT-…)' }, { id: 'analysis', label: 'Analysis (test adapter)' }, { id: 'external', label: 'External document' }]} />
        <TextField label="Result ID or URL" value={artifactId} onChange={setArtifactId} />
      </div>
      {basis === 'evidence' && <Notice tone="info">Verified evidence must reference the authoritative result; units are checked by the server.</Notice>}
      {error ? <ApiErrorNotice error={error} /> : null}
      <div className="con-row">
        <Button variant="filled" icon="save" isDisabled={!title.trim()} onPress={() => void save()}>
          Record evidence
        </Button>
        <Button variant="text" onPress={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** Verification status (reviewer or administrator), backed by verified evidence records. */
export function VerificationControl({ concept, evidence }: { concept: Concept; evidence: Evidence[] }) {
  const { client, invalidate, can } = useModuleData()
  const [status, setStatus] = useState<VerificationStatus>(concept.verificationStatus)
  const [picked, setPicked] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  if (!can('decide')) return null
  const verified = evidence.filter((e) => e.basis === 'evidence')
  const apply = async () => {
    setError(null)
    try {
      await client.changeVerificationStatus(concept.id, status, picked ? [picked] : [], { expectedRevision: concept.revision, reason: `Set to ${status}` })
      invalidate()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <div className="con-inline-form" data-help-id="conceptualize.maturity.change">
      <Select label="Verification status" size="sm" value={status} onChange={(s) => setStatus(s as VerificationStatus)} options={['not-verified', 'partially-verified', 'verified', 'failed'].map((s) => ({ id: s, label: s }))} />
      <Select label="Verified evidence" size="sm" value={picked} placeholder={verified.length ? 'Choose evidence' : 'No verified evidence'} onChange={setPicked} options={verified.map((e) => ({ id: e.id, label: `${e.key} ${e.title}` }))} isDisabled={!verified.length} />
      <Button size="sm" variant="outlined" isDisabled={status === concept.verificationStatus} onPress={() => void apply()}>
        Set verification status
      </Button>
      {error ? <ApiErrorNotice error={error} /> : null}
    </div>
  )
}

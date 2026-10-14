import { Badge, Button, Notice, Select, TextField, type Tone } from '@ews/design-system'
import { readRequirement, type EngineeringObject } from '@ews/platform-sdk'
import { formatTime, useArtifacts, useBaselines, useModel, useSharedContext, useToolApi, useUnsavedChanges } from '@ews/platform-sdk/react'
import { useMemo, useState } from 'react'
import {
  VERIFICATION_METHODS,
  VERIFICATION_RECORD,
  eligibleBaselines,
  readVerificationRecord,
  verificationArtifact,
  verificationState,
  type VerificationOutcome,
  type VerificationRecordView,
  type VerificationState,
} from './domain'

export const STATE_LABEL: Record<VerificationState, { label: string; tone: Tone }> = {
  'not-verified': { label: 'Not verified', tone: 'neutral' },
  verified: { label: 'Verified', tone: 'success' },
  stale: { label: 'Stale evidence', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
  inconclusive: { label: 'Inconclusive', tone: 'info' },
}

/** Verification records per requirement ID, newest first. */
export function useVerificationRecords(): Map<string, VerificationRecordView[]> {
  const artifacts = useArtifacts({ kind: VERIFICATION_RECORD.kind })
  return useMemo(() => {
    const byRequirement = new Map<string, VerificationRecordView[]>()
    for (const a of artifacts) {
      for (const ref of a.references ?? []) {
        if (ref.role !== 'verifies') continue
        byRequirement.set(ref.id, [...(byRequirement.get(ref.id) ?? []), readVerificationRecord(a, ref.id)])
      }
    }
    return byRequirement
  }, [artifacts])
}

export function VerificationStateBadge({ records }: { records: VerificationRecordView[] | undefined }) {
  const state = verificationState(records ?? [])
  const { label, tone } = STATE_LABEL[state]
  return (
    <span data-verification-state={state} title={state === 'stale' ? records?.[0]?.staleReasons.join('; ') : undefined}>
      <Badge tone={tone}>{label}</Badge>
    </span>
  )
}

const OUTCOMES: { id: VerificationOutcome; label: string }[] = [
  { id: 'pass', label: 'Pass' },
  { id: 'fail', label: 'Fail' },
  { id: 'inconclusive', label: 'Inconclusive' },
]

function RecordForm({ requirement, onDone }: { requirement: EngineeringObject; onDone: () => void }) {
  const api = useToolApi()
  const model = useModel()
  const { configurationId } = useSharedContext()
  const baselines = useBaselines()
  const allocated = model.linked(requirement.id, 'allocated-to', 'out')
  const evidence = useArtifacts().filter(
    (a) => a.kind !== VERIFICATION_RECORD.kind && a.objectIds.some((id) => id === requirement.id || allocated.includes(id)),
  )
  const declared = readRequirement(requirement).verificationMethods
  const [method, setMethod] = useState(declared[0] ?? 'Test')
  const [outcome, setOutcome] = useState<VerificationOutcome>('pass')
  const [procedure, setProcedure] = useState('')
  const [baselineId, setBaselineId] = useState('none')
  const [evidenceId, setEvidenceId] = useState('none')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useUnsavedChanges(procedure.trim() !== '' && !saving)

  const options = eligibleBaselines(baselines, requirement, configurationId)
  const excluded = options.filter((o) => o.reason)
  const save = async () => {
    if (!procedure.trim()) {
      setError('Name the procedure or run that produced this result.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.saveArtifact(
        verificationArtifact({
          requirement,
          components: model.linkedObjects(requirement.id, 'allocated-to', 'out'),
          method,
          outcome,
          procedure,
          baselineId: baselineId === 'none' ? undefined : baselineId,
          evidenceId: evidenceId === 'none' ? undefined : evidenceId,
        }),
      )
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="req-form" aria-label="Record verification result">
      <p className="ws-hint m-0">
        Records a result against {requirement.id} rev {requirement.revision} in {configurationId}. Records are never edited; a later change to the
        requirement or an allocated component marks the record stale.
      </p>
      <Select
        label="Method"
        value={method}
        onChange={setMethod}
        options={VERIFICATION_METHODS.map((m) => ({ id: m, label: declared.includes(m) ? m : `${m} (not declared)` }))}
      />
      <Select label="Outcome" value={outcome} onChange={(v) => setOutcome(v as VerificationOutcome)} options={OUTCOMES} />
      <TextField label="Procedure / run" value={procedure} onChange={setProcedure} isRequired description="For example a test procedure ID and run number." />
      <Select
        label="Baseline (configured article)"
        value={baselineId}
        onChange={setBaselineId}
        options={[
          { id: 'none', label: `None, working ${configurationId}` },
          ...options.filter((o) => !o.reason).map(({ baseline }) => ({ id: baseline.id, label: `${baseline.id} ${baseline.name}` })),
        ]}
        description={excluded.length ? `Not offered: ${excluded.map((o) => `${o.baseline.id} (${o.reason})`).join(', ')}.` : undefined}
      />
      <Select
        label="Evidence artifact"
        value={evidenceId}
        onChange={setEvidenceId}
        options={[{ id: 'none', label: 'None' }, ...evidence.map((a) => ({ id: a.id, label: `${a.id} ${a.title}${a.freshness.stale ? ' (stale)' : ''}` }))]}
      />
      {error && (
        <Notice tone="danger" title="Could not record">
          {error}
        </Notice>
      )}
      <div className="req-form-actions">
        <span className="flex-1" />
        <Button variant="text" onPress={onDone} isDisabled={saving}>
          Cancel
        </Button>
        <Button variant="filled" icon="verification" onPress={() => void save()} isPending={saving}>
          Record result
        </Button>
      </div>
    </div>
  )
}

/** The statement as it was at the verified revision, fetched on request. */
function VerifiedText({ requirement, record }: { requirement: EngineeringObject; record: VerificationRecordView }) {
  const api = useToolApi()
  const [text, setText] = useState<string | null | undefined>(undefined)
  const revision = record.requirementRevision
  if (revision === undefined || revision === requirement.revision) return null
  if (text === undefined) {
    return (
      <Button
        size="sm"
        variant="text"
        onPress={async () => {
          const pinned = await api.getObjectRevision(requirement.id, revision)
          const snapshot = pinned?.snapshot as { properties?: Record<string, unknown> } | undefined
          setText(snapshot ? String(snapshot.properties?.statement ?? '') : null)
        }}
      >
        Show verified statement
      </Button>
    )
  }
  return (
    <blockquote className="req-verified-text">
      <span className="text-ui-xs text-fg-3">Rev {revision}: </span>
      {text ?? 'That revision is not available.'}
    </blockquote>
  )
}

export function Verification({ requirement, records }: { requirement: EngineeringObject; records: VerificationRecordView[] }) {
  const model = useModel()
  const [recording, setRecording] = useState(false)
  if (recording) return <RecordForm requirement={requirement} onDone={() => setRecording(false)} />
  return (
    <div className="flex flex-col gap-3" data-testid="verification">
      <div className="flex flex-wrap items-center gap-2">
        <VerificationStateBadge records={records} />
        <span className="flex-1" />
        <Button size="sm" variant="outlined" icon="verification" onPress={() => setRecording(true)}>
          Record result
        </Button>
      </div>
      {!records.length && <p className="m-0 text-fg-3">No recorded results for {requirement.id}.</p>}
      {!model.linked(requirement.id, 'allocated-to', 'out').length && (
        <p className="ws-hint m-0">Not allocated to a component: a record pins only the requirement revision.</p>
      )}
      {records.length > 0 && (
        <ol className="req-verification" aria-label={`Verification records for ${requirement.id}`}>
          {records.map((r) => (
            <li key={r.id} data-record-id={r.id} data-stale={r.stale || undefined}>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={r.outcome === 'pass' ? 'success' : r.outcome === 'fail' ? 'danger' : 'info'}>{OUTCOMES.find((o) => o.id === r.outcome)?.label}</Badge>
                <span className="font-medium">{r.method}</span>
                <span className="text-fg-2">{r.procedure}</span>
                {r.stale && <Badge tone="warning">Stale</Badge>}
              </div>
              <div className="text-ui-xs text-fg-3">
                {r.id} · {formatTime(r.createdAt)} · verified {requirement.id} rev {r.requirementRevision ?? '?'} · {r.configurationId}
                {r.baselineId ? ` · baseline ${r.baselineId}` : ''}
                {r.evidenceId ? ` · evidence ${r.evidenceId}` : ''}
              </div>
              {r.stale && (
                <ul className="req-stale-reasons">
                  {r.staleReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
              <VerifiedText requirement={requirement} record={r} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

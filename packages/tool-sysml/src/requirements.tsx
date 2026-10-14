import { Badge, Button, ComboBox, Notice, StatusBadge, TextField } from '@ews/design-system'
import { RequirementsServiceError, displayId, type EngineeringObject, type ModelIndex, type RequirementSummary, type ToolApi } from '@ews/platform-sdk'
import { useModel, usePlatformServices, useSharedContext, useToolApi, useUnsavedChanges } from '@ews/platform-sdk/react'
import { useEffect, useRef, useState } from 'react'
import { createRequirementChanges } from './domain'

/**
 * Requirements in SysML through the Requirements service (SDK contract only).
 *
 * SysML stores a requirement usage (`sysml-element`, kind requirement) with a `references` link to
 * the canonical requirement ID. It never stores the requirement's text: titles and statements are
 * read from the service (or the platform's read-time projection of it) and edited through
 * `services.requirements.update` with the same validation as the Requirements tool.
 */

export const WAIT_FOR_MODEL_MS = 10_000

/**
 * Waits until an object is in the platform's model. A requirement created through the service
 * reaches the shared model only after the platform rereads its projection on the change event;
 * links to it are refused until then.
 */
export async function waitForObject(getModel: () => ModelIndex, id: string, timeoutMs = WAIT_FOR_MODEL_MS, intervalMs = 100): Promise<EngineeringObject | undefined> {
  const end = Date.now() + timeoutMs
  for (;;) {
    const found = getModel().get(id)
    if (found) return found
    if (Date.now() >= end) return undefined
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

export function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Requirements of the model that no SysML usage references yet, labelled by key. */
export function unreferencedRequirements(model: ModelIndex): EngineeringObject[] {
  return model.objects
    .filter((o) => o.type === 'requirement' && !model.linkedObjects(o.id, 'references', 'in').some((e) => e.type === 'sysml-element'))
    .sort((a, b) => displayId(a).localeCompare(displayId(b), undefined, { numeric: true }))
}

// ---- place an existing requirement ---------------------------------------------------------------

export function PlaceExisting({ preselect, onDone }: { preselect?: string; onDone: (usageId: string) => void }) {
  const api = useToolApi()
  const model = useModel()
  const available = unreferencedRequirements(model)
  const initial = preselect ? model.get(preselect) : undefined
  const [choice, setChoice] = useState<EngineeringObject | undefined>(initial && available.some((r) => r.id === initial.id) ? initial : undefined)
  const [query, setQuery] = useState(initial ? `${displayId(initial)} ${initial.name}` : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    if (!choice) return
    setBusy(true)
    setError(null)
    try {
      const { createdIds } = await api.submitChanges(createRequirementChanges(choice), `Referenced ${displayId(choice)} in the SysML model`)
      onDone(createdIds[0])
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  if (!available.length) return <p className="m-0">Every requirement is already referenced in the SysML model.</p>
  return (
    <form className="sysml-form" onSubmit={(e) => (e.preventDefault(), void submit())}>
      <ComboBox
        label="Requirement"
        placeholder="Search key or title"
        inputValue={query}
        onInputChange={setQuery}
        options={available.map((r) => ({ id: r.id, label: `${displayId(r)} ${r.name}`, description: String(r.properties.status ?? '') }))}
        onSelect={(o) => setChoice(model.get(o.id))}
      />
      {choice && (
        <p className="m-0 sysml-canonical-text">
          <strong>{displayId(choice)}</strong> {typeof choice.properties.statement === 'string' ? choice.properties.statement : ''}
        </p>
      )}
      <p className="ws-hint m-0">The usage references the canonical requirement; its text stays in Requirements.</p>
      {error && <Notice tone="danger" title="Not added">{error}</Notice>}
      <div className="sysml-form-actions">
        <Button variant="filled" icon="link" type="submit" isPending={busy} isDisabled={!choice}>
          Add reference
        </Button>
      </div>
    </form>
  )
}

// ---- create a requirement from SysML ------------------------------------------------------------------

type Step = { state: 'idle' } | { state: 'creating' } | { state: 'waiting'; created: RequirementSummary } | { state: 'linking'; created: RequirementSummary }

export function CreateNew({ onDone }: { onDone: (usageId: string) => void }) {
  const api = useToolApi()
  const { requirements } = usePlatformServices()
  const { projectId } = useSharedContext()
  const [title, setTitle] = useState('')
  const [statement, setStatement] = useState('')
  const [step, setStep] = useState<Step>({ state: 'idle' })
  const [error, setError] = useState<string | null>(null)
  // One key per draft: a retry after a lost response returns the same requirement, never a duplicate.
  const key = useRef(newIdempotencyKey())
  const created = useRef<RequirementSummary | null>(null)
  useUnsavedChanges(!!(title || statement) && step.state === 'idle')

  if (!requirements) {
    return (
      <Notice tone="info" title="Creating requirements needs the Requirements service">
        This host provides no Requirements service, or your subscription includes neither Requirements nor SysML access to it. Nothing is created locally.
      </Notice>
    )
  }

  const submit = async () => {
    setError(null)
    try {
      let summary = created.current
      if (!summary) {
        setStep({ state: 'creating' })
        summary = await requirements.create({ projectId, title: title.trim(), statement: statement.trim(), type: 'functional' }, { idempotencyKey: key.current, reason: 'Created from SysML' })
        created.current = summary
      }
      setStep({ state: 'waiting', created: summary })
      const object = await waitForObject(() => api.getModel(), summary.id)
      if (!object) {
        setStep({ state: 'idle' })
        setError(`${summary.key} was created in Requirements but is not in this model yet, so the SysML usage could not be added. Try “Add usage” again in a moment; the requirement will not be created twice.`)
        return
      }
      setStep({ state: 'linking', created: summary })
      const { createdIds } = await api.submitChanges(createRequirementChanges(object), `Created ${summary.key} from SysML and referenced it`)
      onDone(createdIds[0])
    } catch (e) {
      setStep({ state: 'idle' })
      setError(e instanceof RequirementsServiceError && e.code === 'invalid' && e.details?.fields ? `${e.message} ${Object.entries(e.details.fields).map(([k, v]) => `${k}: ${v}`).join('; ')}` : message(e))
    }
  }
  const busy = step.state !== 'idle'
  const done = created.current
  return (
    <form className="sysml-form" onSubmit={(e) => (e.preventDefault(), void submit())}>
      <TextField label="Title" value={title} onChange={setTitle} autoFocus isReadOnly={!!done} />
      <TextField label="Statement" multiline rows={3} value={statement} onChange={setStatement} isReadOnly={!!done} description="Stored by the Requirements service as a draft; SysML keeps only a reference." />
      {done && (
        <Notice tone="info" title={`${done.key} created in Requirements`}>
          {step.state === 'waiting' ? 'Waiting for it to appear in the model…' : step.state === 'linking' ? 'Adding the SysML usage…' : 'The SysML usage still needs to be added.'}
        </Notice>
      )}
      {error && <Notice tone="danger" title={done ? 'Usage not added yet' : 'Not created'}>{error} Your input is kept.</Notice>}
      <div className="sysml-form-actions">
        {busy && <StatusBadge status="saving" />}
        <Button variant="filled" icon="add" type="submit" isPending={busy} isDisabled={!title.trim() || !statement.trim()}>
          {done ? 'Add usage' : 'Create requirement and add usage'}
        </Button>
      </div>
    </form>
  )
}

// ---- canonical requirement of a usage: show, edit, navigate ------------------------------------------

export function RequirementUsagePanel({ usage }: { usage: EngineeringObject }) {
  const api = useToolApi()
  const model = useModel()
  const { requirements } = usePlatformServices()
  const { projectId, configurationId } = useSharedContext()
  const target = model.linkedObjects(usage.id, 'references', 'out')[0]
  const [summary, setSummary] = useState<RequirementSummary | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  // Reread when the projected requirement changes (the platform refreshes it on committed changes).
  const projectedRevision = target?.revision
  useEffect(() => {
    if (!requirements || !target) return
    let alive = true
    setLoadError(null)
    requirements.get(target.id, { projectId, configurationId }).then(
      (r) => alive && setSummary(r ?? null),
      (e) => alive && (setSummary(undefined), setLoadError(message(e))),
    )
    return () => {
      alive = false
    }
  }, [requirements, target?.id, projectedRevision, projectId, configurationId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!target) return <p className="text-fg-3 m-0">This usage references no requirement.</p>
  const openInRequirements = () => {
    api.select([target.id])
    const res = api.openTool('requirements')
    if (!res.ok) setLoadError(res.reason)
  }
  return (
    <section className="sysml-canonical" aria-label={`Requirement ${displayId(target)}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono">{displayId(target)}</span>
        {summary && <Badge tone="neutral">{summary.status}</Badge>}
        {summary && <span className="text-ui-xs text-fg-3">rev {summary.revision}</span>}
        <span className="flex-1" />
        <Button size="sm" variant="text" icon="requirements" onPress={openInRequirements}>
          Open in Requirements
        </Button>
      </div>
      {!requirements && (
        <Notice tone="info" title="Requirements service not available">
          The canonical text cannot be read or edited here (no service in this host, or not entitled). SysML stores no copy of it.
        </Notice>
      )}
      {loadError && <Notice tone="danger" title="Could not read the requirement">{loadError} No stored copy is shown instead.</Notice>}
      {requirements && summary === null && <Notice tone="info">{displayId(target)} does not apply to configuration {configurationId}, or is no longer available.</Notice>}
      {summary && !editing && (
        <>
          <div className="font-medium">{summary.title}</div>
          <p className="m-0 sysml-canonical-text">{summary.statement}</p>
          <div className="flex items-center gap-2">
            <span className="text-ui-xs text-fg-3">Canonical text from Requirements</span>
            <span className="flex-1" />
            <Button size="sm" variant="tonal" icon="edit" onPress={() => setEditing(true)} isDisabled={summary.archived || summary.status === 'retired'}>
              Edit text
            </Button>
          </div>
        </>
      )}
      {summary && editing && <EditCanonical summary={summary} api={api} onDone={(r) => (setSummary(r), setEditing(false))} onCancel={() => setEditing(false)} />}
    </section>
  )
}

function EditCanonical({ summary, api, onDone, onCancel }: { summary: RequirementSummary; api: ToolApi; onDone: (r: RequirementSummary) => void; onCancel: () => void }) {
  const { requirements } = usePlatformServices()
  const [base, setBase] = useState(summary)
  const [title, setTitle] = useState(summary.title)
  const [statement, setStatement] = useState(summary.statement)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; current?: number } | null>(null)
  const dirty = title !== base.title || statement !== base.statement
  useUnsavedChanges(dirty && !busy)
  const save = async () => {
    if (!requirements) return
    setBusy(true)
    setError(null)
    try {
      const patch: { title?: string; statement?: string } = {}
      if (title !== base.title) patch.title = title
      if (statement !== base.statement) patch.statement = statement
      const r = await requirements.update(base.id, patch, { expectedRevision: base.revision, projectId: base.projectId, reason: reason.trim() || 'Edited in SysML' })
      api.log(`Edited ${r.key} from SysML (rev ${base.revision} → ${r.revision})`, { kind: 'change', objectIds: [r.id] })
      onDone(r)
    } catch (e) {
      if (e instanceof RequirementsServiceError && e.code === 'conflict') {
        setError({ text: `${base.key} was changed by someone else (now revision ${e.details?.currentRevision ?? '?'}); you edited revision ${base.revision}. Nothing was overwritten.`, current: e.details?.currentRevision })
      } else if (e instanceof RequirementsServiceError && e.code === 'invalid' && e.details?.fields) {
        setError({ text: `${e.message} ${Object.entries(e.details.fields).map(([k, v]) => `${k}: ${v}`).join('; ')}` })
      } else setError({ text: message(e) })
    } finally {
      setBusy(false)
    }
  }
  const loadLatest = async () => {
    const latest = await requirements?.get(base.id, { projectId: base.projectId }).catch(() => undefined)
    if (latest) {
      setBase(latest) // keep the typed text; the next save is based on the latest revision
      setError(null)
    }
  }
  return (
    <form className="sysml-form" onSubmit={(e) => (e.preventDefault(), void save())}>
      <TextField label="Title" value={title} onChange={setTitle} />
      <TextField label="Statement" multiline rows={4} value={statement} onChange={setStatement} />
      <TextField label="Reason for the change" value={reason} onChange={setReason} />
      {(base.status === 'approved' || base.status === 'in-review') && dirty && (
        <Notice tone="info">Saving creates a new draft revision of {base.key}; the approval stays with revision {base.revision}.</Notice>
      )}
      {error && (
        <Notice
          tone={error.current ? 'warning' : 'danger'}
          title={error.current ? 'Someone else changed this first' : 'Not saved'}
          actions={
            error.current ? (
              <Button size="sm" variant="outlined" icon="sync" onPress={() => void loadLatest()}>
                Load latest (keep my edits)
              </Button>
            ) : undefined
          }
        >
          {error.text} Your input is kept.
        </Notice>
      )}
      <div className="sysml-form-actions">
        {busy ? <StatusBadge status="saving" /> : dirty ? <StatusBadge status="unsaved" /> : <span className="text-ui-xs text-fg-3">Based on rev {base.revision}</span>}
        <span className="flex-1" />
        <Button size="sm" variant="text" onPress={onCancel} isDisabled={busy}>
          Cancel
        </Button>
        <Button size="sm" variant="filled" icon="save" type="submit" isPending={busy} isDisabled={!dirty || !title.trim()}>
          Save in Requirements
        </Button>
      </div>
    </form>
  )
}

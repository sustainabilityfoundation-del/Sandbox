import { Button, Checkbox, CheckboxGroup, Notice, Select, StatusBadge, TextField } from '@ews/design-system'
import { useModel, useUnsavedChanges } from '@ews/platform-sdk/react'
import { REQUIREMENT_ORIGINS, newIdempotencyKey, type AttributeDefinition, type AttributeValue, type Requirement, type RequirementCreate } from '@ews/requirements-client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useModuleData } from '../data'
import { ApiErrorNotice, METHOD_LABEL, RichText } from './common'

interface Draft {
  title: string
  statement: string
  rationale: string
  type: string
  source: string
  owner: string
  priority: string
  verificationMethods: string[]
  acceptanceCriteria: string
  applicability: string[]
  attributes: Record<string, AttributeValue>
  /** '' = not recorded. */
  origin: string
  /** New derived requirements only: key or ID of the parent requirement. */
  derivesFrom: string
  reason: string
}

const fromRequirement = (r: Requirement | null, defaultType: string): Draft => ({
  title: r?.title ?? '',
  statement: r?.statement ?? '',
  rationale: r?.rationale ?? '',
  type: r?.type ?? defaultType,
  source: r?.source ?? '',
  owner: r?.owner ?? '',
  priority: r?.priority ?? '',
  verificationMethods: r?.verificationMethods ?? [],
  acceptanceCriteria: r?.acceptanceCriteria ?? '',
  applicability: r?.applicability ?? [],
  attributes: { ...(r?.attributes ?? {}) },
  origin: r?.origin ?? '',
  derivesFrom: '',
  reason: '',
})

function AttributeField({ def, value, onChange, readOnly }: { def: AttributeDefinition; value: AttributeValue | undefined; onChange: (v: AttributeValue) => void; readOnly: boolean }) {
  const label = `${def.name}${def.required ? ' (required)' : ''}`
  switch (def.dataType) {
    case 'enumeration': {
      const options = def.enumValues.filter((v) => !v.archived)
      const selected = Array.isArray(value) ? value : []
      return def.multiValued ? (
        <CheckboxGroup label={label} value={selected} onChange={(v) => onChange(v)} isDisabled={readOnly}>
          {options.map((o) => (
            <Checkbox key={o.key} value={o.key}>
              {o.label}
            </Checkbox>
          ))}
        </CheckboxGroup>
      ) : (
        <Select
          label={label}
          value={selected[0] ?? '__none'}
          isDisabled={readOnly}
          onChange={(v) => onChange(v === '__none' ? null : [v])}
          options={[{ id: '__none', label: 'Not set' }, ...options.map((o) => ({ id: o.key, label: o.label }))]}
        />
      )
    }
    case 'boolean':
      return (
        <Checkbox isSelected={value === true} onChange={(v) => onChange(v)} isDisabled={readOnly}>
          {label}
        </Checkbox>
      )
    case 'integer':
    case 'real':
      return (
        <TextField
          label={label}
          inputMode="decimal"
          value={value === null || value === undefined ? '' : String(value)}
          isReadOnly={readOnly}
          onChange={(v) => onChange(v.trim() === '' ? null : Number.isNaN(Number(v)) ? (v as unknown as number) : Number(v))}
          description={[def.minValue !== null ? `min ${def.minValue}` : '', def.maxValue !== null ? `max ${def.maxValue}` : ''].filter(Boolean).join(', ') || undefined}
        />
      )
    default:
      return <TextField label={label} value={typeof value === 'string' ? value : ''} isReadOnly={readOnly} multiline={def.dataType === 'xhtml'} onChange={(v) => onChange(v === '' ? null : v)} description={def.dataType === 'date' ? 'YYYY-MM-DD' : def.description || undefined} />
  }
}

/**
 * Edits canonical fields with an expected revision. A failed save keeps every field; a revision
 * conflict offers to load the latest revision while keeping the edits. New requirements keep one
 * idempotency key across retries, so a retry after a lost response cannot create a duplicate.
 */
export function RequirementEditor({
  requirement,
  definitions,
  requirementTypes,
  readOnly,
  collectionId,
  onSaved,
  onCancel,
}: {
  requirement: Requirement | null
  definitions: AttributeDefinition[]
  requirementTypes: string[]
  readOnly: boolean
  collectionId?: string | null
  onSaved: (r: Requirement) => void
  onCancel: () => void
}) {
  const { client, invalidate, can } = useModuleData()
  const model = useModel()
  const configurations = model.snapshot.configurations
  const defaultType = requirementTypes.includes('functional') ? 'functional' : (requirementTypes[0] ?? 'functional')
  const [base, setBase] = useState<Requirement | null>(requirement)
  const [draft, setDraft] = useState<Draft>(() => fromRequirement(requirement, defaultType))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const createKey = useRef(newIdempotencyKey())
  const original = useMemo(() => fromRequirement(base, defaultType), [base, defaultType])
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const dirty = JSON.stringify({ ...draft, reason: '' }) !== JSON.stringify({ ...original, reason: '' })
  useUnsavedChanges(dirty && !saving)
  // A committed change from elsewhere: adopt it when nothing is being edited; otherwise keep the
  // user's draft and say that a newer revision exists (saving would be refused with a conflict).
  useEffect(() => {
    if (requirement && base && requirement.id === base.id && requirement.revision > base.revision && !dirty && !saving) {
      setBase(requirement)
      setDraft(fromRequirement(requirement, defaultType))
    }
  }, [requirement, base, dirty, saving, defaultType])
  const newer = requirement && base && requirement.revision > base.revision
  const fullModule = can('author') // nia (SysML-only) edits canonical fields only through SysML

  const payload = (): RequirementCreate => ({
    title: draft.title,
    statement: draft.statement,
    rationale: draft.rationale,
    type: draft.type,
    source: draft.source,
    owner: draft.owner.trim() || null,
    priority: (draft.priority || null) as RequirementCreate['priority'],
    verificationMethods: draft.verificationMethods,
    acceptanceCriteria: draft.acceptanceCriteria,
    applicability: draft.applicability,
    attributes: draft.attributes,
    origin: (draft.origin || null) as RequirementCreate['origin'],
  })

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      let saved: Requirement
      if (!base) {
        // A derived requirement names its parent (key or ID); the server creates the derives-from link.
        const parent = draft.origin === 'derived' && draft.derivesFrom.trim() ? draft.derivesFrom.trim() : ''
        const derivesFrom = parent ? (/^[0-9a-f-]{36}$/i.test(parent) ? parent : (await client.resolve(parent)).id) : undefined
        saved = await client.create({ ...payload(), derivesFrom, collectionId: collectionId ?? undefined, reason: draft.reason || undefined }, createKey.current)
      } else {
        const changed: Record<string, unknown> = {}
        const p = payload() as unknown as Record<string, unknown>
        const o = { ...fromRequirement(base, defaultType) } as unknown as Record<string, unknown>
        for (const k of Object.keys(p)) {
          const before = k === 'owner' ? base.owner : k === 'priority' ? base.priority : k === 'origin' ? base.origin : o[k]
          if (JSON.stringify(p[k]) !== JSON.stringify(before)) changed[k] = p[k]
        }
        if (changed.attributes) {
          // Send removed values as null so they are cleared.
          const attrs = { ...(changed.attributes as Record<string, AttributeValue>) }
          for (const k of Object.keys(base.attributes)) if (!(k in attrs) || attrs[k] === undefined) attrs[k] = null
          changed.attributes = attrs
        }
        saved = await client.update(base.id, changed, { expectedRevision: base.revision, reason: draft.reason || undefined })
      }
      invalidate()
      setBase(saved)
      setDraft(fromRequirement(saved, defaultType))
      onSaved(saved)
    } catch (e) {
      setError(e) // every field stays as typed
    } finally {
      setSaving(false)
    }
  }

  const loadLatest = async () => {
    if (!base) return
    try {
      const latest = await client.getRequirement(base.id)
      setBase(latest) // the draft keeps the user's edits; the next save is based on the latest revision
      setError(null)
    } catch (e) {
      setError(e)
    }
  }

  const titleError = draft.title.trim() ? undefined : 'A title is required'
  return (
    <form
      className="req-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!readOnly && !titleError) void save()
      }}
    >
      {readOnly && base?.statementXhtml && (
        <div className="req-readonly-block">
          <div className="text-ui-xs text-fg-3">Statement (rich text from import, sanitised)</div>
          <RichText xhtml={base.statementXhtml} fallback={base.statement} />
        </div>
      )}
      <TextField label="Title" value={draft.title} onChange={(v) => set('title', v)} isReadOnly={readOnly} autoFocus={!base && !readOnly} errorMessage={dirty || !base ? titleError : undefined} />
      <div data-help-id="requirements.requirement.statement">
        <TextField label="Statement (normative text)" multiline rows={4} value={draft.statement} onChange={(v) => set('statement', v)} isReadOnly={readOnly} description={base?.statementXhtml && !readOnly ? 'Editing replaces the imported rich text with plain text.' : undefined} />
      </div>
      <TextField label="Rationale" multiline rows={3} value={draft.rationale} onChange={(v) => set('rationale', v)} isReadOnly={readOnly} description="Why the requirement exists, including assumptions. Kept separate from the statement." />
      <div className="req-form-grid">
        <Select label="Type" value={draft.type} isDisabled={readOnly} onChange={(v) => set('type', v)} options={requirementTypes.map((t) => ({ id: t, label: t }))} />
        <Select
          label="Priority"
          value={draft.priority || '__none'}
          isDisabled={readOnly || !fullModule}
          onChange={(v) => set('priority', v === '__none' ? '' : v)}
          options={[
            { id: '__none', label: 'Not set' },
            { id: 'high', label: 'High' },
            { id: 'medium', label: 'Medium' },
            { id: 'low', label: 'Low' },
          ]}
        />
        <TextField label="Owner" value={draft.owner} onChange={(v) => set('owner', v)} isReadOnly={readOnly || !fullModule} />
        <TextField label="Source" value={draft.source} onChange={(v) => set('source', v)} isReadOnly={readOnly || !fullModule} description="Stakeholder, document or clause" />
        <div data-help-id="requirements.requirement.origin">
          <Select
            label="Origin"
            value={draft.origin || '__none'}
            isDisabled={readOnly || !fullModule}
            onChange={(v) => set('origin', v === '__none' ? '' : v)}
            description="User constraint, an AI-proposed choice you accepted, or derived from another requirement"
            options={[{ id: '__none', label: 'Not recorded' }, ...REQUIREMENT_ORIGINS.map((o) => ({ id: o.id, label: o.label }))]}
          />
        </div>
        {!base && draft.origin === 'derived' && (
          <TextField label="Derived from (key)" value={draft.derivesFrom} onChange={(v) => set('derivesFrom', v)} isReadOnly={readOnly} description="Creates a derives-from link to this requirement, e.g. REQ-001" />
        )}
      </div>
      <CheckboxGroup label="Verification methods" value={draft.verificationMethods} onChange={(v) => set('verificationMethods', v)} isDisabled={readOnly || !fullModule}>
        {Object.entries(METHOD_LABEL).map(([id, label]) => (
          <Checkbox key={id} value={id}>
            {label}
          </Checkbox>
        ))}
      </CheckboxGroup>
      <TextField label="Acceptance criteria" multiline rows={3} value={draft.acceptanceCriteria} onChange={(v) => set('acceptanceCriteria', v)} isReadOnly={readOnly || !fullModule} description="How verification will show the requirement is met. Results are recorded separately." />
      <CheckboxGroup label="Applies to configurations (none selected = all)" value={draft.applicability} onChange={(v) => set('applicability', v)} isDisabled={readOnly || !fullModule}>
        {configurations.map((c) => (
          <Checkbox key={c.id} value={c.id}>
            {c.name}
          </Checkbox>
        ))}
      </CheckboxGroup>
      {definitions.filter((d) => !d.archived).length > 0 && (
        <fieldset className="req-fieldset">
          <legend>Attributes</legend>
          {definitions
            .filter((d) => !d.archived)
            .map((d) => (
              <AttributeField key={d.id} def={d} value={draft.attributes[d.id]} readOnly={readOnly || !fullModule} onChange={(v) => setDraft((x) => ({ ...x, attributes: { ...x.attributes, [d.id]: v } }))} />
            ))}
        </fieldset>
      )}
      {!readOnly && <TextField label="Reason for this change" value={draft.reason} onChange={(v) => set('reason', v)} description="Recorded in the change history with your name and the time." />}
      {base && (base.status === 'approved' || base.status === 'in-review') && !readOnly && dirty && (
        <Notice tone="info">Saving creates revision {base.revision + 1} as a draft. The approval (or open review) stays with revision {base.revision}.</Notice>
      )}
      {newer && !error && (
        <Notice tone="warning" title="A newer revision exists" actions={<Button size="sm" variant="outlined" icon="sync" onPress={() => void loadLatest()}>Load latest (keep my edits)</Button>}>
          {requirement!.key} is now at revision {requirement!.revision} (by {requirement!.revisionCreatedBy}); you are editing revision {base!.revision}. Saving now would be refused.
        </Notice>
      )}
      {error ? <ApiErrorNotice error={error} onRetry={() => void save()} onReload={() => void loadLatest()} /> : null}
      {!readOnly && (
        <div className="req-form-actions">
          {saving ? <StatusBadge status="saving" /> : dirty ? <StatusBadge status="unsaved" /> : base ? <span className="text-ui-xs text-fg-3">Revision {base.revision}</span> : null}
          <span className="flex-1" />
          <Button variant="text" onPress={onCancel} isDisabled={saving}>
            {dirty ? 'Discard' : 'Close'}
          </Button>
          <Button data-help-id="requirements.requirement.save" variant="filled" icon="save" type="submit" isPending={saving} isDisabled={!!titleError || (!dirty && !!base)}>
            {base ? 'Save revision' : 'Create requirement'}
          </Button>
        </div>
      )}
    </form>
  )
}

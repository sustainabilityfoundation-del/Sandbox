import { Button, Dialog, EmptyState, MenuButton, MenuItem, Notice, Select, TextField, useToasts } from '@ews/design-system'
import { compareWithBaseline, formatValue, propertyLabel, type Baseline, type EngineeringObject, type PropertyValue, type Scenario } from '@ews/model-service'
import { ObjectRef, formatTime } from '@ews/platform-sdk/react'
import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { useWorkspaceStore } from '../platform/store'

/** Which baseline dialog is open; the palette and the header menu both use it. */
export const useBaselineDialog = create<{ mode: 'create' | 'compare' | null; open: (mode: 'create' | 'compare') => void; close: () => void }>()((set) => ({
  mode: null,
  open: (mode) => set({ mode }),
  close: () => set({ mode: null }),
}))

function CreateBaseline({ onDone }: { onDone: () => void }) {
  const configurationId = useWorkspaceStore((s) => s.context.configurationId)
  const model = useWorkspaceStore((s) => s.model)!
  const createBaseline = useWorkspaceStore((s) => s.createBaseline)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const configuration = model.snapshot.configurations.find((c) => c.id === configurationId)

  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const baseline = await createBaseline(name.trim(), description.trim())
      useToasts.getState().push({ tone: 'success', title: `${baseline.id} created`, body: `${baseline.name} pins model rev ${baseline.modelRevision}.` })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), void save())}>
      <p className="m-0 text-fg-2">
        A baseline pins the exact revision of every object, scenario and relationship in the project at model rev {model.revision}, for{' '}
        <strong>{configuration?.name ?? configurationId}</strong>. Later edits never change it; compare it with the working model at any time.
      </p>
      <TextField label="Name" value={name} onChange={setName} autoFocus placeholder="e.g. Preliminary design review" />
      <TextField label="Description (optional)" multiline rows={2} value={description} onChange={setDescription} />
      {error && <Notice tone="danger" title="Not created">{error} Your input is kept.</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="text" onPress={onDone} isDisabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="filled" icon="baseline" isDisabled={!name.trim()} isPending={busy}>
          Create baseline
        </Button>
      </div>
    </form>
  )
}

type Holder = { name: string; properties: Record<string, PropertyValue> }

/** Property-level differences between the pinned revision and the current one. */
function PropertyDiff({ id, pinned, current }: { id: string; pinned: number; current: number }) {
  const repository = useWorkspaceStore((s) => s.repository)
  const projectId = useWorkspaceStore((s) => s.context.projectId)
  const model = useWorkspaceStore((s) => s.model)!
  const [before, setBefore] = useState<Holder | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    repository
      ?.getRevision(projectId, id, pinned)
      .then((r) => live && setBefore(r.snapshot as EngineeringObject | Scenario))
      .catch(() => live && setBefore(null))
    return () => {
      live = false
    }
  }, [repository, projectId, id, pinned])
  const after: Holder | undefined = model.get(id) ?? model.scenario(id)
  if (before === undefined) return <span className="text-fg-3">Reading rev {pinned}…</span>
  if (!before || !after) return <span className="text-fg-3">rev {pinned} → {current}</span>
  const keys = [...new Set([...Object.keys(before.properties), ...Object.keys(after.properties)])].filter(
    (k) => JSON.stringify(before.properties[k]) !== JSON.stringify(after.properties[k]),
  )
  return (
    <ul className="m-0 list-none p-0 text-ui-sm">
      <li className="text-fg-3">
        rev {pinned} → {current}
      </li>
      {before.name !== after.name && (
        <li>
          Name: <s className="text-fg-3">{before.name}</s> → {after.name}
        </li>
      )}
      {keys.map((k) => (
        <li key={k}>
          {propertyLabel(k)}: <s className="text-fg-3">{formatValue(before.properties[k])}</s> → {formatValue(after.properties[k])}
        </li>
      ))}
    </ul>
  )
}

function CompareBaseline() {
  const baselines = useWorkspaceStore((s) => s.baselines)
  const model = useWorkspaceStore((s) => s.model)!
  const [id, setId] = useState<string>(baselines[baselines.length - 1]?.id ?? '')
  const baseline: Baseline | undefined = baselines.find((b) => b.id === id)
  const diff = useMemo(() => (baseline ? compareWithBaseline(baseline, model) : null), [baseline, model])
  const ref = (objectId: string) => {
    const o = model.get(objectId)
    return o ? <ObjectRef object={o} /> : <span className="font-mono">{objectId}</span>
  }
  if (!baselines.length) {
    return (
      <EmptyState icon="baseline" title="No baselines yet">
        Create a baseline to pin the current engineering definition.
      </EmptyState>
    )
  }
  return (
    <div className="flex flex-col gap-4" data-testid="baseline-compare">
      <Select
        label="Baseline"
        value={id}
        onChange={setId}
        options={baselines.map((b) => ({ id: b.id, label: `${b.id} ${b.name}`, description: `model rev ${b.modelRevision} · ${formatTime(b.createdAt)}` }))}
      />
      {baseline && diff && (
        <>
          <p className="m-0 text-fg-2">
            {baseline.id} pins model rev {baseline.modelRevision} ({baseline.objects.length} objects, {baseline.relationships.length} relationships) in{' '}
            {baseline.configurationId}. The working model is at rev {model.revision}.
            {baseline.description && <> {baseline.description}</>}
          </p>
          {diff.identical ? (
            <Notice tone="success" title="No differences">
              The working model still matches this baseline.
            </Notice>
          ) : (
            <dl className="ws-baseline-diff">
              {diff.changed.length > 0 && (
                <div>
                  <dt>Changed since the baseline ({diff.changed.length})</dt>
                  {diff.changed.map((c) => (
                    <dd key={c.id} data-changed-id={c.id}>
                      {ref(c.id)}
                      <PropertyDiff id={c.id} pinned={c.pinned} current={c.current} />
                    </dd>
                  ))}
                </div>
              )}
              {diff.added.length > 0 && (
                <div>
                  <dt>Added ({diff.added.length})</dt>
                  <dd className="ws-refs">{diff.added.map((a) => <span key={a}>{ref(a)}</span>)}</dd>
                </div>
              )}
              {diff.removed.length > 0 && (
                <div>
                  <dt>Removed ({diff.removed.length})</dt>
                  <dd className="ws-refs">{diff.removed.map((r) => <span key={r} className="font-mono">{r}</span>)}</dd>
                </div>
              )}
              {(diff.relationshipsAdded.length > 0 || diff.relationshipsRemoved.length > 0) && (
                <div>
                  <dt>Relationships</dt>
                  {diff.relationshipsAdded.map((r) => (
                    <dd key={r.id}>
                      Added: <span className="font-mono">{r.from}</span> {r.type} <span className="font-mono">{r.to}</span>
                    </dd>
                  ))}
                  {diff.relationshipsRemoved.map((r) => (
                    <dd key={r.id}>
                      Removed: <span className="font-mono">{r.from}</span> {r.type} <span className="font-mono">{r.to}</span>
                    </dd>
                  ))}
                </div>
              )}
            </dl>
          )}
        </>
      )}
    </div>
  )
}

/** Dialog for creating and comparing baselines. */
export function BaselineDialog() {
  const mode = useBaselineDialog((s) => s.mode)
  const close = useBaselineDialog((s) => s.close)
  return (
    <Dialog title={mode === 'create' ? 'Create baseline' : 'Compare with a baseline'} isOpen={mode !== null} onOpenChange={(open) => !open && close()} size="lg">
      {mode === 'create' ? <CreateBaseline onDone={close} /> : <CompareBaseline />}
    </Dialog>
  )
}

/** Header menu: configuration control (minimal baselines). */
export function BaselinesMenu({ compact }: { compact: boolean }) {
  const count = useWorkspaceStore((s) => s.baselines.length)
  const open = useBaselineDialog((s) => s.open)
  return (
    <MenuButton
      label="Baselines"
      icon="baseline"
      text={compact ? undefined : 'Baselines'}
      onAction={(key) => open(key === 'create' ? 'create' : 'compare')}
    >
      <MenuItem id="create" icon="add" description="Pin the exact current definition">
        Create baseline…
      </MenuItem>
      <MenuItem id="compare" icon="conflict" isDisabled={count === 0} description={count ? `${count} baseline${count === 1 ? '' : 's'}` : 'No baselines yet'}>
        Compare with a baseline…
      </MenuItem>
    </MenuButton>
  )
}

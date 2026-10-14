import { Badge, Button, Checkbox, CheckboxGroup, LoadingState, Notice, SegmentedControl, Select, TextField, ToggleButton } from '@ews/design-system'
import { useModel, useSharedContext } from '@ews/platform-sdk/react'
import type { BulkOperation, BulkResult, RelationshipType, Requirement, SavedView } from '@ews/requirements-client'
import { useState } from 'react'
import type { RequirementsViewState } from '../domain'
import { useModuleData, useResource } from '../data'
import { ApiErrorNotice, RELATION_LABEL, formatDate } from './common'

// ---- traceability matrix ---------------------------------------------------------------------------

export function MatrixView({ collectionId, baselineId, onOpen }: { collectionId: string | null; baselineId: string | null; onOpen: (id: string) => void }) {
  const { client } = useModuleData()
  const model = useModel()
  const [columns, setColumns] = useState<'components' | 'requirements'>('components')
  const [types, setTypes] = useState<RelationshipType[]>(['allocated-to'])
  const matrix = useResource(() => client.traceMatrix({ collectionId: collectionId ?? undefined, baselineId: baselineId ?? undefined, columns, types }), [client, collectionId, baselineId, columns, types.join()])
  const cell = new Map((matrix.data?.cells ?? []).map((c) => [`${c.row}|${c.column}`, c.types]))
  const reqTypes: RelationshipType[] = ['derives-from', 'decomposes', 'depends-on']
  return (
    <div className="req-page">
      <h3 className="req-page-title">Traceability matrix</h3>
      <div className="req-filterbar">
        <SegmentedControl
          label="Columns"
          size="sm"
          value={columns}
          onChange={(v) => {
            setColumns(v)
            setTypes(v === 'components' ? ['allocated-to'] : reqTypes)
          }}
          options={[
            { value: 'components', label: 'Components (allocation)' },
            { value: 'requirements', label: 'Requirements' },
          ]}
        />
        {columns === 'requirements' && (
          <CheckboxGroup label="Relationship types" value={types} onChange={(v) => setTypes(v as RelationshipType[])}>
            {reqTypes.map((t) => (
              <Checkbox key={t} value={t}>
                {RELATION_LABEL[t].out}
              </Checkbox>
            ))}
          </CheckboxGroup>
        )}
      </div>
      {matrix.error && <ApiErrorNotice error={new Error(matrix.error)} title="Could not build the matrix" onRetry={matrix.reload} />}
      {!matrix.data && matrix.loading && <LoadingState label="Building matrix…" />}
      {matrix.data && (
        <div className="req-matrix-wrap">
          <table className="req-matrix" aria-label="Traceability matrix">
            <thead>
              <tr>
                <th scope="col">Requirement</th>
                {matrix.data.columns.map((c) => (
                  <th key={c.id} scope="col" title={model.get(c.id)?.name ?? c.label}>
                    <span className="font-mono">{c.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.data.rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <Button size="sm" variant="text" onPress={() => onOpen(r.id)}>
                      <span className="font-mono">{r.key}</span> {r.title}
                    </Button>
                  </th>
                  {matrix.data!.columns.map((c) => {
                    const t = cell.get(`${r.id}|${c.id}`)
                    return (
                      <td key={c.id} data-linked={t ? '' : undefined}>
                        {t ? t.map((x) => <Badge key={x} tone="info">{x === 'allocated-to' ? 'allocated' : x}</Badge>) : <span className="sr-only">none</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {matrix.data.columns.length === 0 && <p className="text-fg-3">No relationships of the chosen types.</p>}
          {matrix.data.truncated && <Notice tone="info">Showing the first 200 requirements; narrow the scope with a collection.</Notice>}
          <p className="ws-hint">Rows are lower-level requirements (the from end); a mark means the row is related to the column. Allocation is a design decision, not a satisfaction claim.</p>
        </div>
      )}
    </div>
  )
}

// ---- baselines ---------------------------------------------------------------------------------------

export function BaselinesView({ current, onOpenBaseline, collectionId }: { current: string | null; onOpenBaseline: (id: string | null) => void; collectionId: string | null }) {
  const { client, can, invalidate } = useModuleData()
  const { configurationId } = useSharedContext()
  const baselines = useResource(() => client.baselines(), [client])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scoped, setScoped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [compare, setCompare] = useState<{ from: string; to: string } | null>(null)
  const cmp = useResource(compare ? () => client.compareBaseline(compare.from, compare.to) : null, [client, compare?.from, compare?.to])
  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      await client.createBaseline({ name, description, configurationId, collectionIds: scoped && collectionId ? [collectionId] : undefined })
      setName('')
      setDescription('')
      invalidate()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="req-page">
      <h3 className="req-page-title">Requirements baselines</h3>
      <p className="ws-hint m-0">A baseline pins requirement revisions, relationship revisions and collection structure. It never changes. Platform (twin) baselines are separate.</p>
      {baselines.error && <ApiErrorNotice error={new Error(baselines.error)} title="Could not load baselines" onRetry={baselines.reload} />}
      <ul className="req-baselines">
        {baselines.data?.map((b) => (
          <li key={b.id} data-current={b.id === current ? '' : undefined}>
            <div>
              <strong>{b.name}</strong> <span className="text-fg-3">{b.description}</span>
            </div>
            <div className="text-ui-xs text-fg-3">
              {b.requirementCount} requirements · {b.relationshipCount} relationships · {b.configurationId ?? 'all configurations'} · {b.createdBy} · {formatDate(b.createdAt)}
            </div>
            <div className="req-actions-row">
              <Button size="sm" variant={b.id === current ? 'filled' : 'outlined'} icon="baseline" onPress={() => onOpenBaseline(b.id === current ? null : b.id)}>
                {b.id === current ? 'Viewing (back to working)' : 'View as of this baseline'}
              </Button>
              <Button size="sm" variant="text" onPress={() => setCompare({ from: b.id, to: 'working' })}>
                Compare with working state
              </Button>
              {(baselines.data?.length ?? 0) > 1 && (
                <Select
                  ariaLabel={`Compare ${b.name} with`}
                  size="sm"
                  value={null}
                  placeholder="Compare with baseline…"
                  onChange={(to) => setCompare({ from: b.id, to })}
                  options={baselines.data!.filter((x) => x.id !== b.id).map((x) => ({ id: x.id, label: x.name }))}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
      {baselines.data?.length === 0 && <p className="m-0 text-fg-3">No baselines yet.</p>}
      {compare && cmp.data && (
        <section className="req-compare-result">
          <h4 className="req-subhead">Differences</h4>
          <ul className="req-rel-list">
            {cmp.data.requirements
              .filter((x) => x.change !== 'unchanged')
              .map((x) => (
                <li key={x.id}>
                  <Badge tone={x.change === 'added' ? 'success' : x.change === 'removed' ? 'danger' : 'warning'}>{x.change}</Badge> <span className="font-mono">{x.key}</span>{' '}
                  {x.change === 'changed' ? `rev ${x.fromRevision} → ${x.toRevision}: ${x.fields.join(', ')}` : ''}
                </li>
              ))}
            {cmp.data.relationships.map((x) => (
              <li key={x.id}>
                <Badge tone={x.change === 'added' ? 'success' : 'danger'}>{x.change}</Badge> {x.type} link
              </li>
            ))}
            {cmp.data.structure.map((x, i) => (
              <li key={i}>
                <Badge tone="neutral">structure {x.change}</Badge> {x.detail}
              </li>
            ))}
          </ul>
          {cmp.data.requirements.every((x) => x.change === 'unchanged') && !cmp.data.relationships.length && !cmp.data.structure.length && <p className="m-0">No differences.</p>}
          <Button size="sm" variant="text" onPress={() => setCompare(null)}>
            Close comparison
          </Button>
        </section>
      )}
      {can('create-baseline') ? (
        <fieldset className="req-fieldset">
          <legend>Create baseline</legend>
          <TextField label="Name" value={name} onChange={setName} />
          <TextField label="Description" value={description} onChange={setDescription} />
          <p className="ws-hint m-0">Configuration: {configurationId} (from the shared context).</p>
          {collectionId && (
            <ToggleButton size="sm" isSelected={scoped} onChange={setScoped}>
              Only the selected collection
            </ToggleButton>
          )}
          <Button variant="filled" icon="baseline" isDisabled={!name.trim()} isPending={busy} onPress={() => void create()}>
            Create baseline
          </Button>
        </fieldset>
      ) : (
        <p className="ws-hint m-0">Reviewers and administrators create baselines.</p>
      )}
      {error ? <ApiErrorNotice error={error} title="The baseline was not created" /> : null}
    </div>
  )
}

// ---- bulk operations -------------------------------------------------------------------------------------

export function BulkBar({ selected, rows, onDone, requirementTypes }: { selected: Set<string>; rows: Requirement[]; onDone: () => void; requirementTypes: string[] }) {
  const { client, invalidate } = useModuleData()
  const collections = useResource(() => client.collections(), [client])
  const [action, setAction] = useState('owner')
  const [value, setValue] = useState('')
  const [atomic, setAtomic] = useState(true)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)
  const [error, setError] = useState<unknown>(null)
  const items = rows.filter((r) => selected.has(r.id))
  const run = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    const ops: BulkOperation[] = items.map((r) => {
      const base = { requirementId: r.id, expectedRevision: r.revision }
      switch (action) {
        case 'owner':
          return { ...base, set: { owner: value.trim() || null } }
        case 'priority':
          return { ...base, set: { priority: (value || null) as 'high' | null } }
        case 'type':
          return { ...base, set: { type: value } }
        case 'collection':
          return { ...base, addToCollectionId: value }
        case 'archive':
          return { ...base, archive: true }
        default:
          return { ...base, transition: action as BulkOperation['transition'] }
      }
    })
    try {
      setResult(await client.bulk(ops, { atomic, reason: reason || undefined }))
      invalidate()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  const outcomes = result?.outcomes ?? ((error as { details?: { outcomes?: BulkResult['outcomes'] } })?.details?.outcomes ?? null)
  return (
    <section className="req-bulk" aria-label="Bulk operation">
      <strong>{items.length} selected</strong>
      <Select
        label="Change"
        size="sm"
        value={action}
        onChange={(v) => (setAction(v), setValue(''))}
        options={[
          { id: 'owner', label: 'Set owner' },
          { id: 'priority', label: 'Set priority' },
          { id: 'type', label: 'Set type' },
          { id: 'collection', label: 'Add to collection' },
          { id: 'request-review', label: 'Request review' },
          { id: 'archive', label: 'Archive' },
        ]}
      />
      {action === 'owner' && <TextField label="Owner" value={value} onChange={setValue} />}
      {action === 'priority' && <Select label="Priority" size="sm" value={value || null} onChange={setValue} options={[{ id: 'high', label: 'High' }, { id: 'medium', label: 'Medium' }, { id: 'low', label: 'Low' }]} />}
      {action === 'type' && <Select label="Type" size="sm" value={value || null} onChange={setValue} options={requirementTypes.map((t) => ({ id: t, label: t }))} />}
      {action === 'collection' && <Select label="Collection" size="sm" value={value || null} onChange={setValue} options={(collections.data ?? []).map((c) => ({ id: c.id, label: c.name }))} />}
      <TextField label="Reason" value={reason} onChange={setReason} />
      <ToggleButton size="sm" isSelected={atomic} onChange={setAtomic}>
        All or nothing
      </ToggleButton>
      <Button variant="filled" size="sm" isPending={busy} isDisabled={!items.length || (['priority', 'type', 'collection'].includes(action) && !value)} onPress={() => void run()}>
        Apply to {items.length}
      </Button>
      <Button variant="text" size="sm" onPress={onDone}>
        Done
      </Button>
      <p className="ws-hint m-0 w-full">
        {atomic ? 'All or nothing: if any item fails (for example because it changed meanwhile), nothing is changed.' : 'Per item: each requirement is changed separately; failures are listed.'} Each item is checked against the revision you see.
      </p>
      {error && !outcomes ? <ApiErrorNotice error={error} title="Nothing was changed" /> : null}
      {outcomes && (
        <ul className="req-outcomes">
          {outcomes.map((o) => {
            const r = rows.find((x) => x.id === o.requirementId)
            return (
              <li key={o.requirementId}>
                <Badge tone={o.ok ? 'success' : 'danger'}>{o.ok ? 'done' : (o.error?.code ?? 'failed')}</Badge> <span className="font-mono">{r?.key}</span> {o.ok ? `rev ${o.revision}` : o.error?.message}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ---- saved views ---------------------------------------------------------------------------------------------


export function SavedViews({ state, setState }: { state: RequirementsViewState; setState: (u: Partial<RequirementsViewState>) => void }) {
  const { client, can, invalidate, permissions } = useModuleData()
  const views = useResource(() => client.views(), [client])
  const [name, setName] = useState<string | null>(null)
  const [shared, setShared] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const apply = (v: SavedView) => {
    const d = v.definition as Record<string, unknown>
    setState({
      savedViewId: v.id,
      search: (d.text as string) ?? '',
      statuses: (d.status as string[]) ?? [],
      types: (d.type as string[]) ?? [],
      collectionId: (d.collectionId as string) ?? null,
      includeArchived: !!d.includeArchived,
      ...(Array.isArray(d.columns) ? { columns: d.columns as RequirementsViewState['columns'] } : {}),
      sort: (d.sort as RequirementsViewState['sort']) ?? 'key',
    })
  }
  const save = async () => {
    setError(null)
    const definition: Record<string, unknown> = { text: state.search || undefined, status: state.statuses, type: state.types, collectionId: state.collectionId ?? undefined, includeArchived: state.includeArchived, columns: state.columns, sort: state.sort }
    for (const k of Object.keys(definition)) if (definition[k] === undefined) delete definition[k]
    try {
      const v = await client.saveView({ name: name!, shared, definition })
      setName(null)
      invalidate()
      setState({ savedViewId: v.id })
    } catch (e) {
      setError(e)
    }
  }
  return (
    <div className="req-views">
      <Select
        ariaLabel="Saved view"
        size="sm"
        value={state.savedViewId}
        placeholder="Saved views"
        onChange={(id) => {
          const v = views.data?.find((x) => x.id === id)
          if (v) apply(v)
        }}
        options={(views.data ?? []).map((v) => ({ id: v.id, label: v.name, description: v.shared ? `shared by ${v.owner}` : 'personal' }))}
      />
      {name === null ? (
        <Button size="sm" variant="text" icon="save" onPress={() => setName('')}>
          Save view
        </Button>
      ) : (
        <form
          className="req-inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <TextField label="View name" value={name} onChange={setName} autoFocus />
          {can('save-shared-view') && (
            <ToggleButton size="sm" isSelected={shared} onChange={setShared}>
              Share with project
            </ToggleButton>
          )}
          <Button size="sm" variant="filled" type="submit" isDisabled={!name.trim()}>
            Save
          </Button>
          <Button size="sm" variant="text" onPress={() => setName(null)}>
            Cancel
          </Button>
        </form>
      )}
      {state.savedViewId && views.data?.find((v) => v.id === state.savedViewId)?.owner === permissions?.userId && (
        <Button
          size="sm"
          variant="text"
          onPress={async () => {
            const v = views.data!.find((x) => x.id === state.savedViewId)!
            try {
              await client.deleteView(v.id, v.revision)
              setState({ savedViewId: null })
              invalidate()
            } catch (e) {
              setError(e)
            }
          }}
        >
          Delete view
        </Button>
      )}
      {error ? <ApiErrorNotice error={error} title="The view was not saved" /> : null}
    </div>
  )
}

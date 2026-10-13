import './requirements.css'
import {
  Badge,
  Button,
  Cell,
  Checkbox,
  CheckboxGroup,
  Column,
  EmptyState,
  Notice,
  Row,
  SearchField,
  Select,
  StatusBadge,
  Tab,
  TabList,
  TabPanel,
  Table,
  TableBody,
  TableHeader,
  Tabs,
  TextField,
} from '@ews/design-system'
import {
  REQUIREMENT_STATUSES,
  isComponent,
  readRequirement,
  representationsOf,
  type EngineeringObject,
  type ModelChange,
  type RequirementStatus,
} from '@ews/platform-sdk'
import {
  ObjectRef,
  RequirementStatusBadge,
  formatTime,
  useActivity,
  useModel,
  useRestoredScroll,
  useSelection,
  useToolApi,
  useToolCommand,
  useToolViewState,
  useUnsavedChanges,
} from '@ews/platform-sdk/react'
import { useEffect, useMemo, useState } from 'react'
import {
  VERIFICATION_METHODS,
  filterRequirements,
  selectedComponent,
  selectedRequirementIds,
  sysmlTrace,
  type RequirementsViewState,
} from './domain'

const RELATIONSHIP_LABEL: Record<string, string> = {
  'allocated-to': 'Allocated to',
  references: 'Referenced by SysML element',
  verifies: 'Verified by (retired Verification data)',
}

function RequirementEditor({
  requirement,
  focus,
  onClose,
}: {
  requirement: EngineeringObject
  focus: 'details' | 'allocation'
  onClose: () => void
}) {
  const api = useToolApi()
  const model = useModel()
  const components = model.objects.filter(isComponent)
  const current = readRequirement(requirement)
  const currentAllocation = model.linked(requirement.id, 'allocated-to', 'out')

  const [title, setTitle] = useState(current.title)
  const [statement, setStatement] = useState(current.statement)
  const [rationale, setRationale] = useState(current.rationale)
  const [status, setStatus] = useState<RequirementStatus>(current.status)
  const [methods, setMethods] = useState<string[]>(current.verificationMethods)
  const [allocation, setAllocation] = useState<string[]>(currentAllocation)
  const [baseRevision] = useState(requirement.revision)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty =
    title !== current.title ||
    statement !== current.statement ||
    rationale !== current.rationale ||
    status !== current.status ||
    !current.statusSet ||
    methods.join() !== current.verificationMethods.join() ||
    [...allocation].sort().join() !== [...currentAllocation].sort().join()
  useUnsavedChanges(dirty && !saving)

  const save = async () => {
    const changes: ModelChange[] = [
      {
        kind: 'update-properties',
        targetId: requirement.id,
        baseRevision,
        name: title.trim() || requirement.name,
        properties: { statement: statement.trim(), rationale: rationale.trim(), status, verificationMethods: methods },
      },
    ]
    for (const id of allocation.filter((a) => !currentAllocation.includes(a))) {
      changes.push({ kind: 'add-relationship', relationship: { type: 'allocated-to', from: requirement.id, to: id } })
    }
    for (const id of currentAllocation.filter((a) => !allocation.includes(a))) {
      const rel = model.findRelationship('allocated-to', requirement.id, id)
      if (rel) changes.push({ kind: 'remove-relationship', relationshipId: rel.id })
    }
    setSaving(true)
    setError(null)
    try {
      await api.submitChanges(changes, `Edited ${requirement.id} ${title.trim() || requirement.name}`)
      onClose()
    } catch (e) {
      // Everything the user typed stays in the form.
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="req-form">
      <TextField label="Title" value={title} onChange={setTitle} autoFocus={focus === 'details'} />
      <TextField label="Statement" multiline rows={4} value={statement} onChange={setStatement} />
      <TextField label="Rationale" multiline rows={3} value={rationale} onChange={setRationale} description="Why the requirement exists; kept with the requirement for review." />
      <Select
        label="Status"
        value={status}
        onChange={(v) => setStatus(v as RequirementStatus)}
        options={REQUIREMENT_STATUSES.map((s) => ({ id: s.id, label: s.label }))}
      />
      {!current.statusSet && (
        <p className="ws-hint m-0">This requirement was saved before status existed. Saving records the status shown.</p>
      )}
      <CheckboxGroup label="Verification methods" value={methods} onChange={setMethods}>
        {VERIFICATION_METHODS.map((m) => (
          <Checkbox key={m} value={m}>
            {m}
          </Checkbox>
        ))}
      </CheckboxGroup>
      <CheckboxGroup
        label="Allocated to components"
        orientation="vertical"
        value={allocation}
        onChange={setAllocation}
        className={focus === 'allocation' ? 'req-focused' : undefined}
      >
        {components.map((c, i) => (
          <Checkbox key={c.id} value={c.id} autoFocus={focus === 'allocation' && i === 0}>
            <span className="font-mono">{c.id}</span> {c.name}
          </Checkbox>
        ))}
      </CheckboxGroup>
      {error && (
        <Notice
          tone="danger"
          title="Could not save"
          actions={
            <Button size="sm" variant="outlined" icon="reset" onPress={() => void save()}>
              Try again
            </Button>
          }
        >
          {error} Your edits are kept.
        </Notice>
      )}
      <div className="req-form-actions">
        {saving ? <StatusBadge status="saving" /> : dirty ? <StatusBadge status="unsaved" /> : <span className="text-ui-xs text-fg-3">Based on rev {baseRevision}</span>}
        <span className="flex-1" />
        <Button variant="text" onPress={onClose} isDisabled={saving}>
          Cancel
        </Button>
        <Button variant="filled" icon="save" onPress={() => void save()} isPending={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

function Relationships({ requirement }: { requirement: EngineeringObject }) {
  const model = useModel()
  const rels = model.relationshipsOf(requirement.id)
  const groups = new Map<string, EngineeringObject[]>()
  for (const r of rels) {
    const otherId = r.from === requirement.id ? r.to : r.from
    const other = model.get(otherId)
    if (!other) continue
    const label = RELATIONSHIP_LABEL[r.type] ?? r.type
    groups.set(label, [...(groups.get(label) ?? []), other])
  }
  const { satisfiedBy } = sysmlTrace(model, requirement.id)
  if (satisfiedBy.length) groups.set('Satisfied by (SysML)', satisfiedBy)
  if (!groups.size) return <p className="text-fg-3">No relationships yet. Use Allocate to link components.</p>
  return (
    <dl className="req-rels">
      {[...groups].map(([label, objects]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className="ws-refs">
            {objects.map((o) => (
              <ObjectRef key={o.id} object={o} />
            ))}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function History({ requirement }: { requirement: EngineeringObject }) {
  const activity = useActivity(requirement.id)
  if (!activity.length) return <p className="text-fg-3">No recorded activity for {requirement.id}.</p>
  return (
    <ol className="req-history" aria-label={`Activity for ${requirement.id}`}>
      {activity.map((a) => (
        <li key={a.id}>
          <span className="text-ui-xs text-fg-3">{formatTime(a.at)}</span>
          <span>{a.message}</span>
        </li>
      ))}
    </ol>
  )
}

function DetailPanel({ requirement, state, setState }: { requirement: EngineeringObject; state: NonNullable<RequirementsViewState['editor']>; setState: (u: Partial<RequirementsViewState>) => void }) {
  const r = readRequirement(requirement)
  const close = () => setState({ editor: null })
  return (
    <section className="req-detail" aria-label={`${requirement.id} details`}>
      <header className="req-detail-header">
        <h3>
          <span className="font-mono">{requirement.id}</span> {r.title}
        </h3>
        <RequirementStatusBadge status={r.status} unset={!r.statusSet} />
      </header>
      <Tabs selectedKey={state.tab} onSelectionChange={(tab) => setState({ editor: { ...state, tab: tab as typeof state.tab } })} className="flex min-h-0 flex-1 flex-col">
        <TabList aria-label="Requirement detail" className="px-2">
          <Tab id="details">Edit</Tab>
          <Tab id="relationships">Relationships</Tab>
          <Tab id="history">History</Tab>
        </TabList>
        <TabPanel id="details" className="req-detail-body">
          <RequirementEditor key={`${requirement.id}-${state.focus}`} requirement={requirement} focus={state.focus} onClose={close} />
        </TabPanel>
        <TabPanel id="relationships" className="req-detail-body">
          <Relationships requirement={requirement} />
        </TabPanel>
        <TabPanel id="history" className="req-detail-body">
          <History requirement={requirement} />
        </TabPanel>
      </Tabs>
    </section>
  )
}

function TraceCell({ requirement }: { requirement: EngineeringObject }) {
  const model = useModel()
  const { references } = sysmlTrace(model, requirement.id)
  const cad = model.linked(requirement.id, 'allocated-to', 'out').flatMap((c) => representationsOf(model, c, 'cad'))
  if (!references.length && !cad.length) return <span className="text-fg-3">None</span>
  return (
    <div className="ws-refs">
      {references.map((o) => (
        <ObjectRef key={o.id} object={o} showName={false} />
      ))}
      {cad.map((o) => (
        <ObjectRef key={o.id} object={o} showName={false} />
      ))}
    </div>
  )
}

export default function RequirementsView() {
  const api = useToolApi<RequirementsViewState>()
  const model = useModel()
  const { selectedIds, select } = useSelection()
  const [viewState, setViewState] = useToolViewState<RequirementsViewState>()
  const scrollRef = useRestoredScroll<HTMLDivElement>('table')

  const component = selectedComponent(model, selectedIds)
  // Remember the component the filter refers to, so selecting a requirement doesn't empty the list.
  useEffect(() => {
    if (component && component.id !== viewState.filterComponentId) setViewState({ filterComponentId: component.id })
  }, [component, viewState.filterComponentId, setViewState])

  const { visible, total, component: filterComponent } = useMemo(
    () => filterRequirements(model, viewState, selectedIds),
    [model, viewState, selectedIds],
  )
  const highlighted = selectedRequirementIds(model, selectedIds)
  const editing = viewState.editor ? model.get(viewState.editor.requirementId) : undefined
  const filtersActive = viewState.search !== '' || viewState.statusFilter !== 'all' || viewState.filterMode === 'selection'

  useToolCommand(
    filtersActive
      ? { id: 'requirements.clear-filters', label: 'Requirements: clear search and filters', icon: 'filter', run: () => setViewState({ search: '', statusFilter: 'all', filterMode: 'all' }) }
      : null,
  )

  return (
    <div className={`req-root${editing ? ' has-detail' : ''}`}>
      <div className="req-main">
        <div className="req-filterbar">
          <SearchField
            label="Search requirements"
            placeholder="Search ID, title, statement, rationale"
            value={viewState.search}
            onChange={(search) => setViewState({ search })}
            className="req-search"
          />
          <div className="req-status-filter">
            <Select
              label="Status"
              size="sm"
              value={viewState.statusFilter}
              onChange={(v) => setViewState({ statusFilter: v as RequirementsViewState['statusFilter'] })}
              options={[{ id: 'all', label: 'All' }, ...REQUIREMENT_STATUSES.map((s) => ({ id: s.id, label: s.label }))]}
            />
            <span className="text-fg-3" aria-live="polite">
              {visible.length} of {total}
            </span>
          </div>
        </div>
        <div className="req-scope">
          {viewState.filterMode === 'selection' && filterComponent ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              Allocated to <ObjectRef object={filterComponent} />
              {filterComponent.type === 'assembly' && <span className="text-fg-3">(including sub-components)</span>}
              {selectedIds.some((id) => model.get(id) && model.get(id)!.type !== filterComponent.type && model.get(id)!.type !== 'requirement') && (
                <Badge tone="info" icon="relationship">via its representation</Badge>
              )}
              <Button size="sm" variant="text" onPress={() => setViewState({ filterMode: 'all' })}>
                Show all
              </Button>
            </span>
          ) : viewState.filterMode === 'selection' ? (
            <span className="text-fg-3">Select a component (or its SysML or CAD representation) to filter by allocation. Showing all requirements.</span>
          ) : (
            <span>All requirements</span>
          )}
        </div>

        <div className="ws-table-wrap" ref={scrollRef}>
          <Table
            aria-label="Requirements"
            cards
            className="req-table"
            selectionMode="single"
            selectionBehavior="replace"
            escapeKeyBehavior="none"
            selectedKeys={highlighted.filter((id) => visible.some((r) => r.id === id))}
            onSelectionChange={(keys) => select(keys === 'all' ? [] : [...keys].map(String))}
            onRowAction={(key) => api.updateViewState({ editor: { requirementId: String(key), focus: 'details', tab: 'details' } })}
          >
            <TableHeader>
              <Column isRowHeader className="req-col-id">
                ID
              </Column>
              <Column>Requirement</Column>
              <Column className="req-col-status">Status</Column>
              <Column className="req-col-alloc">Allocated to</Column>
              {viewState.showTrace && <Column className="req-col-trace">Trace (SysML, CAD)</Column>}
            </TableHeader>
            <TableBody
              renderEmptyState={() => (
                <EmptyState icon="search" title="No requirements match">
                  Change the search or filters, or choose Show all.
                </EmptyState>
              )}
            >
              {visible.map((o) => {
                const r = readRequirement(o)
                const allocated = model.linkedObjects(r.id, 'allocated-to', 'out')
                return (
                  <Row key={r.id} id={r.id} textValue={`${r.id} ${r.title}`} data-object-id={r.id}>
                    <Cell title className="font-mono req-cell-id">
                      {r.id}
                    </Cell>
                    <Cell label="Requirement" wide>
                      <div className="req-title">{r.title}</div>
                      <div className="req-statement">{r.statement}</div>
                      {r.rationale && <div className="req-rationale">Rationale: {r.rationale}</div>}
                    </Cell>
                    <Cell label="Status">
                      <RequirementStatusBadge status={r.status} unset={!r.statusSet} />
                    </Cell>
                    <Cell label="Allocated to">
                      <div className="ws-refs">
                        {allocated.length ? allocated.map((c) => <ObjectRef key={c.id} object={c} />) : <span className="text-fg-3">Unallocated</span>}
                      </div>
                    </Cell>
                    {viewState.showTrace && (
                      <Cell label="Trace">
                        <TraceCell requirement={o} />
                      </Cell>
                    )}
                  </Row>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <p className="ws-hint">Select a row to select the requirement in every tool. Double-click or press Enter to edit.</p>
      </div>

      {editing && viewState.editor && <DetailPanel requirement={editing} state={viewState.editor} setState={setViewState} />}
    </div>
  )
}

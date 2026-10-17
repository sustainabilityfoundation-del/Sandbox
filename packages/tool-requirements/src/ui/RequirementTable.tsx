import {
  Badge,
  Button,
  Cell,
  Checkbox,
  CheckboxGroup,
  Column,
  EmptyState,
  LoadingState,
  PopoverButton,
  Row,
  SearchField,
  Select,
  Table,
  TableBody,
  TableHeader,
  ToggleButton,
} from '@ews/design-system'
import type { EngineeringObject } from '@ews/platform-sdk'
import { ObjectRef, useModel, useRestoredScroll } from '@ews/platform-sdk/react'
import { REQUIREMENT_ORIGINS, type Requirement, type Relationship } from '@ews/requirements-client'
import { useEffect, useMemo, useState } from 'react'
import { TABLE_COLUMNS, type RequirementsViewState, type TableColumn } from '../domain'
import { useModuleData, useResource } from '../data'
import { VerificationStateBadge } from '../Verification'
import type { VerificationRecordView } from '../domain'
import { ApiErrorNotice, LifecycleBadge, PRIORITY_LABEL, formatDate } from './common'

const COLUMN_LABEL: Record<TableColumn, string> = {
  key: 'ID',
  title: 'Requirement',
  status: 'Lifecycle',
  type: 'Type',
  priority: 'Priority',
  owner: 'Owner',
  allocation: 'Allocated to',
  verification: 'Verification',
  origin: 'Origin',
  updated: 'Updated',
  trace: 'SysML trace',
}

export interface TableProps {
  state: RequirementsViewState
  setState: (u: Partial<RequirementsViewState>) => void
  /** Twin component filter (selected component and its sub-components). */
  allocatedTo: string[] | null
  highlightedId: string | null
  onOpen: (r: Requirement) => void
  onSelect: (r: Requirement | null) => void
  bulkSelection: Set<string>
  setBulkSelection: (s: Set<string>) => void
  verification: Map<string, VerificationRecordView[]>
  requirementTypes: string[]
  /** Called with the rows currently loaded (for bulk operations). */
  onRows?: (rows: Requirement[]) => void
}

/** Twin object for a requirement: by canonical ID, else by legacy twin ID (until the twin is migrated). */
export function twinObjectFor(model: ReturnType<typeof useModel>, r: { id: string; legacyIds: string[] }): EngineeringObject | undefined {
  return model.get(r.id) ?? r.legacyIds.map((l) => model.get(l)).find((o) => o?.type === 'requirement')
}

export function RequirementTable(p: TableProps) {
  const { client } = useModuleData()
  const model = useModel()
  const { state, setState } = p
  const scrollRef = useRestoredScroll<HTMLDivElement>('table')
  const [search, setSearch] = useState(state.search)
  const [pages, setPages] = useState<Requirement[][]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<unknown>(null)

  // Debounce the search text into the private view state.
  useEffect(() => {
    const t = setTimeout(() => search !== state.search && setState({ search }), 250)
    return () => clearTimeout(t)
  }, [search, state.search, setState])

  const query = useMemo(
    () => ({
      text: state.search || undefined,
      status: state.statuses.length ? (state.statuses as Requirement['status'][]) : undefined,
      type: state.types.length ? state.types : undefined,
      collectionId: state.collectionId ?? undefined,
      includeArchived: state.includeArchived || undefined,
      baselineId: state.baselineId ?? undefined,
      allocatedTo: p.allocatedTo?.join(',') || undefined,
      sort: state.sort,
      limit: 50,
    }),
    [state.search, state.statuses, state.types, state.collectionId, state.includeArchived, state.baselineId, state.sort, p.allocatedTo],
  )
  const first = useResource(() => client.list(query), [client, JSON.stringify(query)])
  useEffect(() => {
    if (first.data) {
      setPages([first.data.items])
      setCursor(first.data.nextCursor)
      setMoreError(null)
    }
  }, [first.data])
  const rows = useMemo(() => pages.flat(), [pages])
  useEffect(() => p.onRows?.(rows), [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  const allocations = useResource(() => client.listRelationships({ type: 'allocated-to', baselineId: state.baselineId ?? undefined, limit: 20000 }), [client, state.baselineId])
  const allocatedBy = useMemo(() => {
    const m = new Map<string, Relationship[]>()
    for (const r of allocations.data ?? []) m.set(r.fromId, [...(m.get(r.fromId) ?? []), r])
    return m
  }, [allocations.data])

  const loadMore = async () => {
    if (!cursor) return
    setLoadingMore(true)
    setMoreError(null)
    try {
      const next = await client.list({ ...query, cursor })
      setPages((ps) => [...ps, next.items])
      setCursor(next.nextCursor)
    } catch (e) {
      setMoreError(e)
    } finally {
      setLoadingMore(false)
    }
  }

  const cols = state.columns.filter((c) => c !== 'trace' || state.showTrace)
  const show = (c: TableColumn) => cols.includes(c)
  const filtersActive = !!(state.search || state.statuses.length || state.types.length || state.includeArchived)

  return (
    <div className="req-table-area">
      <div className="req-filterbar" role="search">
        <SearchField label="Search requirements" placeholder="Search key, title, statement, rationale, source" value={search} onChange={setSearch} className="req-search" />
        <PopoverButton label="Lifecycle filter" text={state.statuses.length ? `Lifecycle (${state.statuses.length})` : 'Lifecycle'} icon="filter" title="Lifecycle status">
          <CheckboxGroup label="Show requirements that are" orientation="vertical" value={state.statuses} onChange={(statuses) => setState({ statuses })}>
            <Checkbox value="draft">Draft</Checkbox>
            <Checkbox value="in-review">In review</Checkbox>
            <Checkbox value="approved">Approved</Checkbox>
            <Checkbox value="retired">Retired</Checkbox>
          </CheckboxGroup>
        </PopoverButton>
        <Select
          ariaLabel="Type"
          size="sm"
          className="req-type-filter"
          value={state.types[0] ?? 'all'}
          onChange={(v) => setState({ types: v === 'all' ? [] : [v] })}
          options={[{ id: 'all', label: 'All types' }, ...p.requirementTypes.map((t) => ({ id: t, label: t }))]}
        />
        <ToggleButton size="sm" icon="archive" isSelected={state.includeArchived} onChange={(includeArchived) => setState({ includeArchived })}>
          Archived
        </ToggleButton>
        <Select
          ariaLabel="Sort"
          size="sm"
          value={state.sort}
          onChange={(v) => setState({ sort: v as 'key' | '-updated' })}
          options={[
            { id: 'key', label: 'Sort by ID' },
            { id: '-updated', label: 'Recently revised' },
          ]}
        />
        <PopoverButton label="Columns" text="Columns" icon="tune" title="Columns">
          <CheckboxGroup label="Visible columns" orientation="vertical" value={state.columns} onChange={(columns) => setState({ columns: (TABLE_COLUMNS as readonly string[]).filter((c) => columns.includes(c) || c === 'key') as TableColumn[] })}>
            {TABLE_COLUMNS.map((c) => (
              <Checkbox key={c} value={c} isDisabled={c === 'key'}>
                {COLUMN_LABEL[c]}
              </Checkbox>
            ))}
          </CheckboxGroup>
        </PopoverButton>
        <span className="req-count" aria-live="polite">
          {first.data ? `${rows.length} of ${first.data.total ?? rows.length}` : ''}
          {first.loading && first.data ? ' · updating…' : ''}
        </span>
        {filtersActive && (
          <Button size="sm" variant="text" onPress={() => (setSearch(''), setState({ search: '', statuses: [], types: [], includeArchived: false }))}>
            Clear filters
          </Button>
        )}
      </div>

      {first.error && <ApiErrorNotice error={new Error(first.error)} title="Could not load requirements" onRetry={first.reload} />}
      {!first.data && first.loading && <LoadingState label="Loading requirements…" />}
      {first.data && (
        <div className="ws-table-wrap" ref={scrollRef}>
          <Table
            aria-label="Requirements"
            cards
            className="req-table"
            selectionMode={state.bulk ? 'multiple' : 'single'}
            selectionBehavior={state.bulk ? 'toggle' : 'replace'}
            escapeKeyBehavior="none"
            selectedKeys={state.bulk ? [...p.bulkSelection] : p.highlightedId && rows.some((r) => r.id === p.highlightedId) ? [p.highlightedId] : []}
            onSelectionChange={(keys) => {
              if (state.bulk) p.setBulkSelection(new Set(keys === 'all' ? rows.map((r) => r.id) : [...keys].map(String)))
              else {
                const id = keys === 'all' ? null : ([...keys][0] as string | undefined)
                p.onSelect(rows.find((r) => r.id === id) ?? null)
              }
            }}
            onRowAction={(key) => {
              const r = rows.find((x) => x.id === key)
              if (r) p.onOpen(r)
            }}
          >
            <TableHeader>
              {state.bulk && <Column className="req-col-check">Select</Column>}
              <Column isRowHeader className="req-col-id">
                ID
              </Column>
              {show('title') && <Column>Requirement</Column>}
              {show('status') && <Column className="req-col-status">Lifecycle</Column>}
              {show('type') && <Column className="req-col-type">Type</Column>}
              {show('priority') && <Column className="req-col-small">Priority</Column>}
              {show('owner') && <Column className="req-col-small">Owner</Column>}
              {show('allocation') && <Column className="req-col-alloc">Allocated to</Column>}
              {show('verification') && <Column className="req-col-verification">Verification</Column>}
              {show('origin') && <Column className="req-col-small">Origin</Column>}
              {show('updated') && <Column className="req-col-updated">Revision</Column>}
              {show('trace') && <Column className="req-col-trace">SysML trace</Column>}
            </TableHeader>
            <TableBody
              renderEmptyState={() => (
                <EmptyState icon="search" title="No requirements match">
                  {p.allocatedTo ? 'Nothing is allocated to the selected component. Choose Show all, or change the filters.' : 'Change the search or filters.'}
                </EmptyState>
              )}
            >
              {rows.map((r) => {
                const twin = twinObjectFor(model, r)
                const alloc = (allocatedBy.get(r.id) ?? []).map((a) => model.get(a.toTwinId ?? '') ?? a.toTwinId!)
                const refs = twin ? model.linkedObjects(twin.id, 'references', 'in').filter((o) => o.type === 'sysml-element') : []
                return (
                  <Row key={r.id} id={r.id} textValue={`${r.key} ${r.title}`} data-requirement-id={r.id} data-req-key={r.key}>
                    {state.bulk && (
                      <Cell label="Select">
                        <Checkbox slot="selection">Select {r.key}</Checkbox>
                      </Cell>
                    )}
                    <Cell title className="font-mono req-cell-id">
                      {r.key}
                    </Cell>
                    {show('title') && (
                      <Cell label="Requirement" wide>
                        <div className="req-title">{r.title}</div>
                        <div className="req-statement">{r.statement}</div>
                      </Cell>
                    )}
                    {show('status') && (
                      <Cell label="Lifecycle">
                        <LifecycleBadge status={r.status} archived={r.archived} />
                      </Cell>
                    )}
                    {show('type') && <Cell label="Type">{r.type}</Cell>}
                    {show('priority') && <Cell label="Priority">{r.priority ? PRIORITY_LABEL[r.priority] : <span className="text-fg-3">—</span>}</Cell>}
                    {show('owner') && <Cell label="Owner">{r.owner ?? <span className="text-fg-3">—</span>}</Cell>}
                    {show('allocation') && (
                      <Cell label="Allocated to">
                        <div className="ws-refs">
                          {alloc.length ? alloc.map((o) => (typeof o === 'string' ? <Badge key={o}>{o}</Badge> : <ObjectRef key={o.id} object={o} />)) : <span className="text-fg-3">Unallocated</span>}
                        </div>
                      </Cell>
                    )}
                    {show('verification') && (
                      <Cell label="Verification">
                        {twin ? <VerificationStateBadge records={p.verification.get(twin.id)} /> : <span className="text-fg-3" title="Verification records live in the shared twin; this requirement has no twin object yet">No twin record</span>}
                      </Cell>
                    )}
                    {show('origin') && (
                      <Cell label="Origin">
                        {r.origin ? (REQUIREMENT_ORIGINS.find((o) => o.id === r.origin)?.label ?? r.origin) : <span className="text-fg-3" title="Not recorded for this requirement; origin is never guessed">Unknown</span>}
                      </Cell>
                    )}
                    {show('updated') && (
                      <Cell label="Revision">
                        <span title={formatDate(r.revisionCreatedAt)}>
                          rev {r.revision} · {r.revisionCreatedBy}
                        </span>
                      </Cell>
                    )}
                    {show('trace') && (
                      <Cell label="SysML trace">
                        <div className="ws-refs">{refs.length ? refs.map((o) => <ObjectRef key={o.id} object={o} showName={false} />) : <span className="text-fg-3">None</span>}</div>
                      </Cell>
                    )}
                  </Row>
                )
              })}
            </TableBody>
          </Table>
          {moreError ? <ApiErrorNotice error={moreError} title="Could not load more" onRetry={() => void loadMore()} /> : null}
          {cursor && (
            <div className="req-load-more">
              <Button variant="outlined" icon="chevron-down" isPending={loadingMore} onPress={() => void loadMore()}>
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

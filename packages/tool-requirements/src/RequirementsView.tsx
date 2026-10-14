import './requirements.css'
import { Badge, Button, EmptyState, Notice, SegmentedControl, Select, Table, TableBody, TableHeader, Column, Row, Cell, SearchField, TextField, LoadingState } from '@ews/design-system'
import type { RequirementSummary, RequirementsService } from '@ews/platform-sdk'
import {
  ObjectRef,
  usePlatformServices,
  useModel,
  useSelection,
  useSharedContext,
  useToolApi,
  useToolCommand,
  useToolViewState,
  useUnsavedChanges,
} from '@ews/platform-sdk/react'
import { getModuleClient, type Requirement } from '@ews/requirements-client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { selectedComponent, selectedRequirementIds, type RequirementsPage, type RequirementsViewState } from './domain'
import { ModuleDataProvider, useModuleData, useResource } from './data'
import { setAssistantConnection, updateProposal, useProposals, type AssistantProposal } from './proposals'
import { useVerificationRecords } from './Verification'
import { CollectionsPanel } from './ui/Collections'
import { ApiErrorNotice, LifecycleBadge, formatDate } from './ui/common'
import { DetailPanel } from './ui/DetailPanel'
import { ExchangeView } from './ui/Exchange'
import { BaselinesView, BulkBar, MatrixView, SavedViews } from './ui/Pages'
import { QualityTab, QualityView } from './ui/Quality'
import { RequirementTable } from './ui/RequirementTable'

// ---- assistant proposals (API mode) -------------------------------------------------------------

function ProposalCard({ p }: { p: AssistantProposal }) {
  const { client, invalidate } = useModuleData()
  const api = useToolApi()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const apply = async () => {
    setBusy(true)
    setError(null)
    try {
      const patch = Object.fromEntries(p.changes.map((c) => [c.field, c.proposed]))
      const r = await client.update(p.requirementId, patch, { expectedRevision: p.expectedRevision, reason: `Assistant proposal ${p.id}` })
      updateProposal(p.id, { status: 'applied', appliedRevision: r.revision })
      api.log(`Applied assistant proposal ${p.id} to ${p.key} (rev ${p.expectedRevision} → ${r.revision})`, { kind: 'change', source: { kind: 'conversation', conversationId: p.id } as never })
      invalidate()
    } catch (e) {
      setError(e)
      updateProposal(p.id, { status: 'failed', error: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  const undo = async () => {
    setBusy(true)
    setError(null)
    try {
      const patch = Object.fromEntries(p.changes.map((c) => [c.field, c.current]))
      const r = await client.update(p.requirementId, patch, { expectedRevision: p.appliedRevision!, reason: `Undo assistant proposal ${p.id}` })
      updateProposal(p.id, { status: 'undone' })
      api.log(`Undid assistant proposal ${p.id} on ${p.key} (new rev ${r.revision})`, { kind: 'change' })
      invalidate()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="req-proposal" aria-label={`Assistant proposal for ${p.key}`}>
      <div className="req-finding-head">
        <Badge tone="info" icon="assistant">
          Assistant proposal
        </Badge>
        <strong>
          {p.key}, based on revision {p.expectedRevision}
        </strong>
        <Badge tone={p.status === 'applied' ? 'success' : p.status === 'failed' ? 'danger' : 'neutral'}>{p.status}</Badge>
      </div>
      {p.changes.map((c) => (
        <div key={c.field} className="req-proposal-change">
          <span className="text-fg-3">{c.field}</span>
          <del>{c.current || '(empty)'}</del>
          <ins>{c.proposed}</ins>
        </div>
      ))}
      <div className="req-actions-row">
        {(p.status === 'pending' || p.status === 'failed') && (
          <>
            <Button size="sm" variant="filled" isPending={busy} onPress={() => void apply()}>
              Apply
            </Button>
            <Button size="sm" variant="text" onPress={() => updateProposal(p.id, { status: 'rejected' })}>
              Reject
            </Button>
          </>
        )}
        {p.status === 'applied' && (
          <Button size="sm" variant="outlined" icon="undo" isPending={busy} onPress={() => void undo()}>
            Undo
          </Button>
        )}
      </div>
      {error ? <ApiErrorNotice error={error} title="The proposal was not applied" /> : null}
    </section>
  )
}

// ---- API mode ------------------------------------------------------------------------------------

const PAGES: { value: RequirementsPage; label: string }[] = [
  { value: 'table', label: 'Requirements' },
  { value: 'matrix', label: 'Matrix' },
  { value: 'baselines', label: 'Baselines' },
  { value: 'quality', label: 'Quality' },
  { value: 'exchange', label: 'Import / export' },
]

function ApiView() {
  const { client, projectId, permissions, permissionsError, lastEvent, can } = useModuleData()
  const model = useModel()
  const { selectedIds, select } = useSelection()
  const [state, setState] = useToolViewState<RequirementsViewState>()
  const verification = useVerificationRecords()
  const proposals = useProposals().filter((p) => p.status !== 'rejected' && p.status !== 'undone')
  const [bulkSelection, setBulkSelection] = useState<Set<string>>(new Set())
  const [rows, setRows] = useState<Requirement[]>([])
  const definitions = useResource(() => client.attributeDefinitions(), [client])
  const conventions = useResource(() => client.conventions(), [client])
  const baseline = useResource(state.baselineId ? () => client.baselines().then((bs) => bs.find((b) => b.id === state.baselineId)) : null, [client, state.baselineId])
  const requirementTypes = (conventions.data?.settings.requirementTypes as string[] | undefined) ?? ['functional']

  useEffect(() => {
    setAssistantConnection({ client, projectId })
    return () => setAssistantConnection(null)
  }, [client, projectId])

  // Selection made in other tools: a component (or its representation) filters by allocation.
  const component = selectedComponent(model, selectedIds)
  useEffect(() => {
    if (component && component.id !== state.filterComponentId) setState({ filterComponentId: component.id })
  }, [component, state.filterComponentId, setState])
  const filterComponent = component ?? (state.filterComponentId ? model.get(state.filterComponentId) : undefined)
  const allocatedTo = useMemo(
    () => (state.filterMode === 'selection' && filterComponent ? [filterComponent.id, ...model.childrenOf(filterComponent.id).map((c) => c.id)] : null),
    [state.filterMode, filterComponent, model],
  )
  // A selected requirement (legacy twin ID or UUID) or SysML usage highlights its row.
  const legacy = selectedRequirementIds(model, selectedIds)[0] ?? selectedIds.find((id) => /^[0-9a-f-]{36}$/i.test(id))
  const highlighted = useResource(legacy ? () => (/^[0-9a-f-]{36}$/i.test(legacy) ? Promise.resolve(legacy) : client.resolve(legacy).then((r) => r.id, () => null)) : null, [client, legacy])

  const open = useCallback((id: string) => setState({ editor: { requirementId: id, focus: 'details', tab: state.editor?.tab ?? 'details' } }), [setState, state.editor?.tab])
  const selectRequirement = useCallback(
    (r: Requirement | null) => {
      if (!r) return select([])
      // Select the twin object other tools know: the canonical ID once projected, else the legacy twin ID.
      const twinId = model.get(r.id) ? r.id : (r.legacyIds.find((l) => model.get(l)) ?? r.id)
      select([twinId])
    },
    [model, select],
  )
  useToolCommand({ id: 'requirements.new', label: 'Requirements: new requirement', icon: 'add', disabled: !can('author'), run: () => setState({ editor: { requirementId: 'new', focus: 'details', tab: 'details' } }) })

  const editing = state.editor?.requirementId ?? null
  return (
    <div className="req-shell">
      <div className="req-topbar">
        <div className="req-pages-wide">
          <SegmentedControl label="Requirements page" size="sm" value={state.page} onChange={(page) => setState({ page })} options={PAGES} />
        </div>
        <div className="req-pages-narrow">
          <Select ariaLabel="Requirements page" size="sm" value={state.page} onChange={(page) => setState({ page: page as RequirementsPage })} options={PAGES.map((p) => ({ id: p.value, label: p.label }))} />
        </div>
        <span className="flex-1" />
        {permissions && (
          <span className="text-ui-xs text-fg-3" title={permissions.permissions.join(', ')}>
            {permissions.userId} · {permissions.role ?? 'no role'}
            {!permissions.fullModule && ' · SysML entitlement only'}
          </span>
        )}
        {lastEvent && <span className="text-ui-xs text-fg-3">Last change {formatDate(lastEvent.occurredAt)} by {lastEvent.actor}</span>}
      </div>
      {permissionsError && <ApiErrorNotice error={new Error(permissionsError)} title="The Requirements service refused the request" />}
      {state.baselineId && (
        <Notice tone="warning" title={`Historical view: baseline “${baseline.data?.name ?? '…'}”`} actions={<Button size="sm" variant="outlined" onPress={() => setState({ baselineId: null })}>Back to working state</Button>}>
          Read-only. Shows the revisions, relationships and structure pinned on {formatDate(baseline.data?.createdAt)}; later changes are not shown.
        </Notice>
      )}
      {proposals.map((p) => (
        <ProposalCard key={p.id} p={p} />
      ))}
      {state.page === 'table' && (
        <div className={`req-root${editing ? ' has-detail' : ''}`}>
          <CollectionsPanel
            collectionId={state.collectionId}
            setCollectionId={(collectionId) => setState({ collectionId })}
            baselineId={state.baselineId}
            openRequirementId={editing}
            onOpen={open}
            selectedRequirementId={editing && editing !== 'new' ? editing : null}
          />
          <div className="req-main">
            <div className="req-scope">
              {state.filterMode === 'selection' && filterComponent ? (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  Allocated to <ObjectRef object={filterComponent} />
                  {filterComponent.type === 'assembly' && <span className="text-fg-3">(including sub-components)</span>}
                  <Button size="sm" variant="text" onPress={() => setState({ filterMode: 'all' })}>
                    Show all
                  </Button>
                </span>
              ) : (
                <span className="text-fg-3">{state.filterMode === 'selection' ? 'Select a component (or its SysML or CAD representation) to filter by allocation.' : 'All requirements'}</span>
              )}
              <span className="flex-1" />
              <SavedViews state={state} setState={setState} />
              {can('author') && !state.baselineId && (
                <Button size="sm" variant={state.bulk ? 'filled' : 'text'} onPress={() => (setState({ bulk: !state.bulk }), setBulkSelection(new Set()))}>
                  {state.bulk ? 'Exit bulk edit' : 'Bulk edit'}
                </Button>
              )}
            </div>
            {state.bulk && <BulkBar selected={bulkSelection} rows={rows} requirementTypes={requirementTypes} onDone={() => (setState({ bulk: false }), setBulkSelection(new Set()))} />}
            <RequirementTable
              state={state}
              setState={setState}
              allocatedTo={allocatedTo}
              highlightedId={highlighted.data ?? (editing !== 'new' ? editing : null)}
              onOpen={(r) => open(r.id)}
              onSelect={(r) => {
                selectRequirement(r)
                if (r && state.editor) open(r.id)
              }}
              bulkSelection={bulkSelection}
              setBulkSelection={setBulkSelection}
              verification={verification}
              requirementTypes={requirementTypes}
              onRows={setRows}
            />
            <p className="ws-hint">Select a row to select the requirement in every tool; press Enter or double-click to open it.</p>
          </div>
          {editing && state.editor && (
            <DetailPanel
              requirementId={editing}
              tab={state.editor.tab}
              setTab={(tab) => setState({ editor: { ...state.editor!, tab } })}
              onClose={() => setState({ editor: null })}
              onSaved={(r) => (setState({ editor: { requirementId: r.id, focus: 'details', tab: 'details' } }), selectRequirement(r))}
              definitions={definitions.data ?? []}
              requirementTypes={requirementTypes}
              baselineId={state.baselineId}
              collectionId={state.collectionId}
              verification={verification}
              quality={(r, readOnly) => <QualityTab r={r} readOnly={readOnly} />}
            />
          )}
        </div>
      )}
      {state.page === 'matrix' && <MatrixView collectionId={state.collectionId} baselineId={state.baselineId} onOpen={(id) => setState({ page: 'table', editor: { requirementId: id, focus: 'details', tab: 'relationships' } })} />}
      {state.page === 'baselines' && <BaselinesView current={state.baselineId} collectionId={state.collectionId} onOpenBaseline={(baselineId) => setState({ baselineId, page: baselineId ? 'table' : 'baselines', editor: null })} />}
      {state.page === 'quality' && <QualityView collectionId={state.collectionId} onOpen={(id) => setState({ page: 'table', editor: { requirementId: id, focus: 'details', tab: 'quality' } })} />}
      {state.page === 'exchange' && <ExchangeView collectionId={state.collectionId} baselineId={state.baselineId} />}
    </div>
  )
}

// ---- demo mode (SDK contract only) ---------------------------------------------------------------

function DemoEditor({ service, r, onDone }: { service: RequirementsService; r: RequirementSummary; onDone: () => void }) {
  const [title, setTitle] = useState(r.title)
  const [statement, setStatement] = useState(r.statement)
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const dirty = title !== r.title || statement !== r.statement
  useUnsavedChanges(dirty && !saving)
  return (
    <div className="req-form">
      <TextField label="Title" value={title} onChange={setTitle} />
      <TextField label="Statement" multiline rows={4} value={statement} onChange={setStatement} />
      {error ? <ApiErrorNotice error={error} onRetry={() => undefined} /> : null}
      <div className="req-form-actions">
        <span className="flex-1" />
        <Button variant="text" onPress={onDone}>
          Close
        </Button>
        <Button
          variant="filled"
          icon="save"
          isPending={saving}
          isDisabled={!dirty}
          onPress={async () => {
            setSaving(true)
            setError(null)
            try {
              await service.update(r.id, { title, statement }, { expectedRevision: r.revision })
              onDone()
            } catch (e) {
              setError(e)
            } finally {
              setSaving(false)
            }
          }}
        >
          Save revision
        </Button>
      </div>
    </div>
  )
}

function DemoView({ service }: { service: RequirementsService }) {
  const { projectId } = useSharedContext()
  const [text, setText] = useState('')
  const [items, setItems] = useState<RequirementSummary[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [open, setOpen] = useState<RequirementSummary | null>(null)
  const [version, setVersion] = useState(0)
  useEffect(() => service.subscribe(projectId, () => setVersion((v) => v + 1)), [service, projectId])
  useEffect(() => {
    service.list({ projectId, text: text || undefined, limit: 200 }).then((p) => (setItems(p.items), setError(null)), setError)
  }, [service, projectId, text, version])
  return (
    <div className="req-shell">
      <Notice tone="warning" title="Demo mode (explicitly chosen)">
        In-browser demo data through the SDK contract only. Collections, reviews, baselines, quality checks and ReqIF exchange need API mode. Nothing here is saved to PostgreSQL.
      </Notice>
      <div className={`req-root${open ? ' has-detail' : ''}`}>
        <div className="req-main">
          <div className="req-filterbar">
            <SearchField label="Search requirements" placeholder="Search key, title, statement" value={text} onChange={setText} className="req-search" />
          </div>
          {error ? <ApiErrorNotice error={error} title="Could not load requirements" /> : null}
          {!items && !error && <LoadingState label="Loading…" />}
          {items && (
            <div className="ws-table-wrap">
              <Table aria-label="Requirements (demo)" cards className="req-table" selectionMode="single" onRowAction={(k) => setOpen(items.find((i) => i.id === k) ?? null)}>
                <TableHeader>
                  <Column isRowHeader className="req-col-id">
                    ID
                  </Column>
                  <Column>Requirement</Column>
                  <Column className="req-col-status">Lifecycle</Column>
                </TableHeader>
                <TableBody renderEmptyState={() => <EmptyState icon="search" title="No requirements match" />}>
                  {items.map((r) => (
                    <Row key={r.id} id={r.id} textValue={`${r.key} ${r.title}`}>
                      <Cell title className="font-mono">
                        {r.key}
                      </Cell>
                      <Cell label="Requirement" wide>
                        <div className="req-title">{r.title}</div>
                        <div className="req-statement">{r.statement}</div>
                      </Cell>
                      <Cell label="Lifecycle">
                        <LifecycleBadge status={r.status} archived={r.archived} />
                      </Cell>
                    </Row>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        {open && (
          <section className="req-detail" aria-label={`${open.key} details`}>
            <header className="req-detail-header">
              <h3>
                <span className="font-mono">{open.key}</span> {open.title}
              </h3>
              <span className="text-ui-xs text-fg-3">rev {open.revision}</span>
            </header>
            <div className="req-detail-body">
              <DemoEditor key={`${open.id}-${open.revision}`} service={service} r={open} onDone={() => setOpen(null)} />
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// ---- root -----------------------------------------------------------------------------------------

export default function RequirementsView() {
  const { requirements } = usePlatformServices()
  const { projectId } = useSharedContext()
  const client = useMemo(() => getModuleClient(requirements, projectId), [requirements, projectId])
  if (!requirements) {
    return (
      <EmptyState icon="requirements" title="The Requirements service is not available here">
        This host provides no Requirements service, or your subscription does not include it. Requirements are stored by the Requirements API; nothing is shown in its place.
      </EmptyState>
    )
  }
  if (!client) return <DemoView service={requirements} />
  return (
    <ModuleDataProvider client={client} service={requirements} projectId={projectId}>
      <ApiView />
    </ModuleDataProvider>
  )
}

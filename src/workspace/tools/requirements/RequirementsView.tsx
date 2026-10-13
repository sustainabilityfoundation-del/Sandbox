import './requirements.css'
import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  Field,
  FieldGroup,
  Select,
  TextArea,
  TextInput,
  useUnsavedChanges,
  COMPLIANCE_LABEL,
  ComplianceBadge,
  Notice,
  ObjectRef,
  isComponent,
  useModel,
  useOutputs,
  useRestoredScroll,
  useSelection,
  useToolApi,
  useToolViewState,
  type EngineeringObject,
  type ModelChange,
  type ModelIndex,
} from '../../sdk'
import type { RequirementsViewState } from './index'

const METHODS = ['Analysis', 'Test', 'Inspection', 'Demonstration']

function methodsOf(requirement: EngineeringObject): string[] {
  const value = requirement.properties.verificationMethods
  return Array.isArray(value) ? value : []
}

/** Requirements allocated to a component or to any of its sub-components. */
function allocatedTo(requirement: EngineeringObject, componentId: string, model: ModelIndex): boolean {
  const allocated = model.linked(requirement.id, 'allocated-to', 'out')
  const scope = new Set([componentId, ...model.childrenOf(componentId).map((c) => c.id)])
  return allocated.some((id) => scope.has(id))
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
  const currentAllocation = model.linked(requirement.id, 'allocated-to', 'out')

  const [name, setName] = useState(requirement.name)
  const [statement, setStatement] = useState(String(requirement.properties.statement ?? ''))
  const [methods, setMethods] = useState<string[]>(methodsOf(requirement))
  const [compliance, setCompliance] = useState(String(requirement.properties.compliance ?? 'not-assessed'))
  const [allocation, setAllocation] = useState<string[]>(currentAllocation)
  const [baseRevision] = useState(requirement.revision)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  const save = async () => {
    const changes: ModelChange[] = [
      {
        kind: 'update-properties',
        targetId: requirement.id,
        baseRevision,
        name: name.trim() || requirement.name,
        properties: { statement: statement.trim(), verificationMethods: methods, compliance },
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
      await api.submitChanges(changes, `Edited ${requirement.id} ${name.trim() || requirement.name}`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const dirty =
    name !== requirement.name ||
    statement !== String(requirement.properties.statement ?? '') ||
    compliance !== String(requirement.properties.compliance ?? 'not-assessed') ||
    methods.join() !== methodsOf(requirement).join() ||
    allocation.join() !== currentAllocation.join()
  useUnsavedChanges(dirty && !saving)

  return (
    <div className="req-editor" role="dialog" aria-label={`Edit ${requirement.id}`}>
      <header className="req-editor-header">
        <h3>
          Edit <span className="ws-mono">{requirement.id}</span>
        </h3>
        <span className="ws-muted">Based on rev {baseRevision}</span>
      </header>
      <div className="req-editor-body">
        <Field label="Title">
          {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} autoFocus={focus === 'details'} />}
        </Field>
        <Field label="Statement">
          {(id) => <TextArea id={id} rows={4} value={statement} onChange={(e) => setStatement(e.target.value)} />}
        </Field>
        <FieldGroup legend="Verification methods">
          <div className="ws-checks">
            {METHODS.map((m) => (
              <Checkbox key={m} label={m} checked={methods.includes(m)} onChange={() => setMethods(toggle(methods, m))} />
            ))}
          </div>
        </FieldGroup>
        <Field label="Compliance status">
          {(id) => (
            <Select id={id} value={compliance} onChange={(e) => setCompliance(e.target.value)}>
              {Object.entries(COMPLIANCE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <FieldGroup legend="Allocated to components" className={focus === 'allocation' ? 'req-focused' : undefined}>
          <div className="ws-checks ws-checks-column">
            {components.map((c) => (
              <Checkbox
                key={c.id}
                checked={allocation.includes(c.id)}
                onChange={() => setAllocation(toggle(allocation, c.id))}
                autoFocus={focus === 'allocation' && c === components[0]}
                label={
                  <>
                    <span className="ws-mono">{c.id}</span> {c.name}
                  </>
                }
              />
            ))}
          </div>
        </FieldGroup>
        {error && <Notice tone="danger" title="Could not save">{error}</Notice>}
      </div>
      <footer className="req-editor-footer">
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} busy={saving}>
          {saving ? 'Saving…' : 'Save to repository'}
        </Button>
      </footer>
    </div>
  )
}

/** Outputs that trace to a requirement: evidence for its procedures, or records naming it. */
function useRequirementOutputs(requirement: EngineeringObject) {
  const model = useModel()
  const outputs = useOutputs()
  const procedures = model.linkedObjects(requirement.id, 'verifies', 'in')
  const evidence = new Set(procedures.flatMap((p) => model.linked(p.id, 'evidence-for', 'in')))
  const linkedOutputs = outputs.filter(
    (o) => evidence.has(o.id) || o.objectIds.includes(requirement.id) || procedures.some((p) => o.objectIds.includes(p.id)),
  )
  return { procedures, linkedOutputs, stale: linkedOutputs.filter((o) => o.freshness.stale).length }
}

function StaleEvidenceBadge({ requirement }: { requirement: EngineeringObject }) {
  const { stale } = useRequirementOutputs(requirement)
  if (!stale) return null
  return (
    <Badge tone="warning" title="Evidence or results for this requirement used inputs that have since changed">
      {stale} stale result{stale === 1 ? '' : 's'}
    </Badge>
  )
}

function TraceCells({ requirement }: { requirement: EngineeringObject }) {
  const { procedures, linkedOutputs, stale } = useRequirementOutputs(requirement)
  return (
    <>
      <td data-label="Verified by">
        {procedures.length ? (
          <div className="ws-refs">
            {procedures.map((p) => (
              <ObjectRef key={p.id} object={p} showName={false} />
            ))}
          </div>
        ) : (
          <span className="ws-muted">None</span>
        )}
      </td>
      <td data-label="Evidence">
        {linkedOutputs.length ? (
          <span>
            {linkedOutputs.length} output{linkedOutputs.length === 1 ? '' : 's'}
            {stale > 0 && (
              <>
                {' '}
                <Badge tone="warning">{stale} stale</Badge>
              </>
            )}
          </span>
        ) : (
          <span className="ws-muted">None</span>
        )}
      </td>
    </>
  )
}

export default function RequirementsView() {
  const api = useToolApi<RequirementsViewState>()
  const model = useModel()
  const { selectedIds, selectedObjects, select } = useSelection()
  const [viewState, setViewState] = useToolViewState<RequirementsViewState>()
  const scrollRef = useRestoredScroll<HTMLDivElement>('table')

  const selectedComponent = selectedObjects.find(isComponent)

  // Remember the component the filter refers to, so selecting a requirement doesn't empty the list.
  useEffect(() => {
    if (selectedComponent && selectedComponent.id !== viewState.filterComponentId) {
      setViewState({ filterComponentId: selectedComponent.id })
    }
  }, [selectedComponent, viewState.filterComponentId, setViewState])

  const filterComponent = model.get(selectedComponent?.id ?? viewState.filterComponentId ?? '')
  const requirements = model.objects.filter((o) => o.type === 'requirement')
  const visible = useMemo(
    () =>
      requirements.filter(
        (r) =>
          (viewState.filterMode === 'all' || !filterComponent || allocatedTo(r, filterComponent.id, model)) &&
          (viewState.complianceFilter === 'all' || r.properties.compliance === viewState.complianceFilter),
      ),
    [requirements, viewState.filterMode, viewState.complianceFilter, filterComponent, model],
  )
  const editing = viewState.editor ? model.get(viewState.editor.requirementId) : undefined

  return (
    <div className={`req-root${editing ? ' has-editor' : ''}`}>
      <div className="req-main">
        <div className="req-filterbar">
          {viewState.filterMode === 'selection' && filterComponent ? (
            <span>
              Allocated to <ObjectRef object={filterComponent} />
              {filterComponent.type === 'assembly' && <span className="ws-muted"> (including sub-components)</span>}
              <Button size="sm" variant="ghost" onClick={() => setViewState({ filterMode: 'all' })}>
                Show all
              </Button>
            </span>
          ) : viewState.filterMode === 'selection' ? (
            <span className="ws-muted">Select a component to filter by allocation. Showing all requirements.</span>
          ) : (
            <span>All requirements</span>
          )}
          <label className="req-status-filter">
            Status
            <Select
              value={viewState.complianceFilter}
              onChange={(e) => setViewState({ complianceFilter: e.target.value as RequirementsViewState['complianceFilter'] })}
            >
              <option value="all">All</option>
              {Object.entries(COMPLIANCE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <span className="ws-muted">
            {visible.length} of {requirements.length}
          </span>
        </div>

        <div className="ws-table-wrap" ref={scrollRef}>
          <table className="ws-table req-table">
            <thead>
              <tr>
                <th className="req-col-id">ID</th>
                <th>Statement</th>
                <th className="req-col-alloc">Allocated to</th>
                <th className="req-col-method">Verification</th>
                <th className="req-col-status">Compliance</th>
                {viewState.showTrace && <th className="req-col-trace">Verified by</th>}
                {viewState.showTrace && <th className="req-col-trace">Evidence</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const allocated = model.linkedObjects(r.id, 'allocated-to', 'out')
                const selected = selectedIds.includes(r.id)
                return (
                  <tr
                    key={r.id}
                    className={selected ? 'is-selected' : ''}
                    onClick={() => select([r.id])}
                    onDoubleClick={() => api.updateViewState({ editor: { requirementId: r.id, focus: 'details' } })}
                    aria-selected={selected}
                  >
                    <td className="ws-mono req-cell-id" data-label="ID">{r.id}</td>
                    <td data-label="Statement">
                      <div className="req-title">{r.name}</div>
                      <div className="req-statement">{String(r.properties.statement ?? '')}</div>
                    </td>
                    <td data-label="Allocated to">
                      <div className="ws-refs">
                        {allocated.length ? (
                          allocated.map((c) => <ObjectRef key={c.id} object={c} />)
                        ) : (
                          <span className="ws-muted">Unallocated</span>
                        )}
                      </div>
                    </td>
                    <td data-label="Verification">{methodsOf(r).join(', ') || <span className="ws-muted">—</span>}</td>
                    <td data-label="Compliance">
                      <div className="req-status">
                        <ComplianceBadge value={r.properties.compliance} />
                        <StaleEvidenceBadge requirement={r} />
                      </div>
                    </td>
                    {viewState.showTrace && <TraceCells requirement={r} />}
                  </tr>
                )
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={viewState.showTrace ? 7 : 5} className="ws-empty-row">
                    No requirements match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="ws-hint">Click a row to select the requirement. Double-click or use Edit to change it.</p>
      </div>

      {editing && viewState.editor && (
        <RequirementEditor
          key={`${editing.id}-${viewState.editor.focus}`}
          requirement={editing}
          focus={viewState.editor.focus}
          onClose={() => setViewState({ editor: null })}
        />
      )}
    </div>
  )
}

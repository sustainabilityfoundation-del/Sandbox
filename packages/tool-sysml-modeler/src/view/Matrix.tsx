import { Badge, Button, Checkbox, EmptyState, Notice, SegmentedControl } from '@ews/design-system'
import type { RequirementSummary } from '@ews/platform-sdk'
import { usePlatformServices, useSharedContext } from '@ews/platform-sdk/react'
import { relationshipMatrix, requirementCoverage, semanticsOf, type CoverageStatus, type Model } from '@ews/sysml-core'
import { useEffect, useMemo, useState } from 'react'
import { useViewState } from './hooks'
import { useManagedRequirements } from './ImportRequirements'

/**
 * Grid views (BL-016, BL-021): relationship matrices and requirement coverage, computed from the
 * model on every change. Selecting a cell, row or column selects the element in Properties.
 */

const MATRIX_HELP: Record<'satisfy' | 'allocate' | 'connect', string> = {
  satisfy: 'Requirements (rows) and the features that satisfy them (columns). Empty rows are requirements no design element satisfies.',
  allocate: 'Allocation sources (rows, e.g. functions) and targets (columns, e.g. parts).',
  connect: 'Parts of the definition shown in the Interconnection View, and the connections, interfaces, flows and bindings between them.',
}

const SHORT: Record<string, string> = { SatisfyRequirementUsage: 'satisfy', AllocationUsage: 'allocate', ConnectionUsage: 'conn', InterfaceUsage: 'intf', FlowUsage: 'flow', BindingConnectorAsUsage: 'bind' }

export function MatrixView({ model, scopeId, connectContext, revision }: { model: Model; scopeId: string; connectContext: string | null; revision: number }) {
  const [vs, update] = useViewState()
  const s = semanticsOf(model)
  const kind = vs.matrix
  const scope = kind === 'connect' ? connectContext : scopeId
  const mx = useMemo(() => (scope ? relationshipMatrix(model, kind, scope) : null), [model, kind, scope, revision])
  const select = (id: string) => update({ selectedId: id, pane: 'properties' })
  const managed = useManagedRequirements(kind === 'satisfy')
  const openImport = () => update({ dialog: { kind: 'import-requirements' } })
  const managedCount = Array.isArray(managed.items) ? managed.items.length : 0
  return (
    <div className="smod-panel" data-help-id="sysml-modeler.matrix">
      <div className="smod-panel-bar">
        <SegmentedControl label="Matrix" size="sm" value={kind} onChange={(m) => update({ matrix: m })} options={[{ value: 'satisfy', label: 'Satisfy' }, { value: 'allocate', label: 'Allocate' }, { value: 'connect', label: 'Connect' }]} />
        <span className="smod-muted">{scope ? `Scope: ${scope === model.rootId ? 'model root' : (s.qualifiedName(scope) ?? s.label(scope))}` : ''}</span>
        <Badge tone="info">Grid view (projection)</Badge>
        {kind === 'satisfy' && (
          <>
            <span className="smod-spacer" />
            <Button size="sm" icon="requirement" onPress={openImport} isDisabled={managed.items === null} data-help-id="sysml-modeler.import-requirements" aria-describedby="smod-import-reason">Bring in managed requirements</Button>
            {managed.items === null && <span id="smod-import-reason" className="smod-muted" role="note" title="Needs the Requirements service">Needs the Requirements service, which is not available here.</span>}
          </>
        )}
      </div>
      <p className="smod-muted">{MATRIX_HELP[kind]}</p>
      {!mx && <EmptyState icon="relationship" title="Choose a part definition">The connection matrix shows the parts of a part definition. Select one (or one of its usages) in the browser.</EmptyState>}
      {mx && mx.rows.length === 0 && kind === 'satisfy' && (
        <EmptyState
          icon="requirement"
          title="No requirements in the model yet"
          action={
            managed.items === null ? (
              <Button icon="requirement" isDisabled aria-describedby="smod-import-reason-empty">Bring in managed requirements</Button>
            ) : (
              <Button variant="filled" icon="requirement" onPress={openImport} data-help-id="sysml-modeler.import-requirements">Bring in managed requirements</Button>
            )
          }
        >
          Managed requirements appear here once they are brought into the System Model.{managedCount ? ` This project has ${managedCount} managed requirement${managedCount === 1 ? '' : 's'}.` : ''}
          {managed.items === null && <span id="smod-import-reason-empty" title="Needs the Requirements service"> The Requirements service is not available here, so they cannot be listed or brought in.</span>}
        </EmptyState>
      )}
      {mx && (mx.rows.length === 0 ? (
        kind === 'satisfy' ? null : <EmptyState icon="relationship" title="Nothing to show">There are no {kind === 'allocate' ? 'allocations' : 'connections'} in this scope.</EmptyState>
      ) : (
        <div className="smod-matrix-scroll">
          <table className="smod-matrix" aria-label={`${kind} matrix`}>
            <thead>
              <tr>
                <th scope="col" className="smod-matrix-corner">{kind === 'satisfy' ? 'Requirement \\ satisfied by' : kind === 'allocate' ? 'Allocated \\ to' : 'Part \\ part'}</th>
                {mx.cols.map((c) => (
                  <th key={c.key} scope="col" className="smod-matrix-col">
                    <Button size="sm" variant="text" onPress={() => select(c.elementId)}>{c.displayId ?? c.label}</Button>{c.title && <span className="smod-muted smod-matrix-title">{c.title}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mx.rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row" className="smod-matrix-row">
                    <Button size="sm" variant="text" onPress={() => select(r.elementId)}>{r.displayId ?? r.label}</Button>{r.title && <span className="smod-muted smod-matrix-title">{r.title}</span>}
                  </th>
                  {mx.cols.map((c) => {
                    const cell = mx.cells.find((x) => x.row === r.key && x.col === c.key)
                    return (
                      <td key={c.key} className={cell ? 'is-filled' : undefined}>
                        {cell?.relationships.map((rel) => (
                          <Button key={rel.id} size="sm" variant="tonal" aria-label={`${SHORT[rel.metaclass] ?? rel.metaclass} ${r.displayId ?? r.label} – ${c.displayId ?? c.label}`} onPress={() => select(rel.id)}>
                            {SHORT[rel.metaclass] ?? rel.label}
                          </Button>
                        ))}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {mx?.notes.map((n) => <Notice key={n} tone="neutral">{n}</Notice>)}
    </div>
  )
}

const STATUS: Record<CoverageStatus, { tone: 'success' | 'info' | 'warning' | 'danger'; label: string }> = {
  'satisfied-and-verified': { tone: 'success', label: 'satisfied and verified' },
  satisfied: { tone: 'info', label: 'satisfied, not verified' },
  verified: { tone: 'warning', label: 'verified, not satisfied' },
  'not-covered': { tone: 'danger', label: 'not covered' },
}

export function CoverageView({ model, scopeId, revision }: { model: Model; scopeId: string; revision: number }) {
  const [vs, update] = useViewState()
  const { requirements } = usePlatformServices()
  const { projectId, configurationId } = useSharedContext()
  const report = useMemo(() => requirementCoverage(model, scopeId), [model, scopeId, revision])
  const [managed, setManaged] = useState<Record<string, RequirementSummary | null>>({})
  useEffect(() => {
    let alive = true
    const ids = [...new Set(report.requirements.map((r) => r.managed?.requirementId).filter((x): x is string => !!x))]
    if (!requirements || !ids.length) return
    Promise.all(ids.map((id) => requirements.get(id, { projectId, configurationId }).then((r) => [id, r ?? null] as const, () => [id, null] as const))).then((pairs) => alive && setManaged(Object.fromEntries(pairs)))
    return () => {
      alive = false
    }
  }, [report, requirements, projectId, configurationId])
  const s = semanticsOf(model)
  const shown = report.requirements.filter((r) => !vs.coverageGapsOnly || r.status !== 'satisfied-and-verified')
  return (
    <div className="smod-panel" data-help-id="sysml-modeler.coverage">
      <div className="smod-panel-bar">
        <Badge tone="neutral">{`${report.counts.total} requirements`}</Badge>
        <Badge tone="success">{`${report.counts['satisfied-and-verified']} satisfied and verified`}</Badge>
        <Badge tone="info">{`${report.counts.satisfied} satisfied only`}</Badge>
        <Badge tone="warning">{`${report.counts.verified} verified only`}</Badge>
        <Badge tone="danger">{`${report.counts['not-covered']} not covered`}</Badge>
        <Badge tone="neutral">{`${report.counts.linkedToManaged} linked to managed requirements`}</Badge>
        <span className="smod-spacer" />
        <Checkbox isSelected={vs.coverageGapsOnly} onChange={(v) => update({ coverageGapsOnly: v })}>Only gaps</Checkbox>
      </div>
      <p className="smod-muted">Scope: {scopeId === model.rootId ? 'model root' : (s.qualifiedName(scopeId) ?? s.label(scopeId))}. “Satisfied” is a modelled claim (satisfy … by …); “verified” means a verification case’s objective verifies the requirement. Neither is test evidence: results are recorded in Requirements Management.</p>
      {shown.length === 0 ? (
        <EmptyState icon="requirement" title={report.counts.total ? 'No gaps' : 'No requirements in this scope'} />
      ) : (
        <div className="smod-matrix-scroll">
          <table className="smod-matrix smod-coverage" aria-label="Requirement coverage">
            <thead>
              <tr>
                <th scope="col">Requirement</th>
                <th scope="col">Managed requirement</th>
                <th scope="col">Satisfied by</th>
                <th scope="col">Verified by</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const m = r.managed?.requirementId ? managed[r.managed.requirementId] : undefined
                return (
                  <tr key={r.id}>
                    <th scope="row">
                      <Button size="sm" variant="text" onPress={() => update({ selectedId: r.id, pane: 'properties' })}>{`${r.shortName ? `<${r.shortName}> ` : ''}${r.label}`}</Button>
                    </th>
                    <td>{r.managed?.requirementId ? (m ? `${m.key} rev ${r.managed.revision ?? 'latest'}${r.managed.revision && m.revision > r.managed.revision ? ` (rev ${m.revision} exists)` : ''}` : `linked (rev ${r.managed.revision ?? 'latest'})`) : <span className="smod-muted">not linked</span>}</td>
                    <td>{r.satisfiedBy.map((x) => <Button key={x.relationshipId} size="sm" variant="text" onPress={() => update({ selectedId: x.relationshipId, pane: 'properties' })}>{x.label}</Button>)}</td>
                    <td>{r.verifiedBy.map((x) => <Button key={x.caseId} size="sm" variant="text" onPress={() => update({ selectedId: x.caseId, pane: 'properties' })}>{x.label}</Button>)}</td>
                    <td><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

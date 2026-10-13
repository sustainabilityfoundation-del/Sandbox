import { useMemo } from 'react'
import { outputFreshness } from '../domain/freshness'
import type { EngineeringObject } from '../domain/types'
import { formatValue, propertyLabel } from '../domain/units'
import { selectInView, sharedContextOf } from '../sdk/api'
import { useWorkspaceStore } from '../sdk/store'
import { iconForType } from '../sdk/icons'
import { Badge, ComplianceBadge, FreshnessBadge, ObjectRef, ReviewBadge, formatTime } from '../sdk/ui'
import { getTool } from '../tools/registry'
import { ViewControls } from './WorkArea'

const HIDDEN_PROPS = new Set(['statement', 'compliance', 'steps'])

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="ws-insp-section">
      <h3>
        {title}
        {count !== undefined && <span className="ws-muted"> {count}</span>}
      </h3>
      {children}
    </section>
  )
}

function Outputs({ object, configurationId }: { object: EngineeringObject; configurationId: string }) {
  const model = useWorkspaceStore((s) => s.model)!
  const allOutputs = useWorkspaceStore((s) => s.outputs)
  const configuration = model.snapshot.configurations.find((c) => c.id === configurationId)

  const { outputs, hidden } = useMemo(() => {
    const related = allOutputs.filter((o) => o.objectIds.includes(object.id))
    const inConfig = related
      .filter((o) => o.configurationId === configurationId)
      .map((o) => ({ ...o, freshness: outputFreshness(o, model) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { outputs: inConfig, hidden: related.length - inConfig.length }
  }, [allOutputs, object.id, configurationId, model])

  return (
    <Section title="Saved outputs" count={outputs.length}>
      {outputs.length === 0 && <p className="ws-muted">No outputs saved for this object in {configuration?.name}.</p>}
      <ul className="ws-insp-outputs">
        {outputs.map((o) => (
          <li key={o.id} className={o.freshness.stale ? 'is-stale' : ''} data-output-id={o.id}>
            <div className="ws-insp-output-head">
              <span className="ws-mono">{o.id}</span>
              <span className="ws-insp-output-title">{o.title}</span>
            </div>
            <div className="ws-insp-output-summary">{o.summary}</div>
            <dl className="ws-insp-output-meta">
              <dt>Tool</dt>
              <dd>{getTool(o.toolId)?.name ?? o.toolId}</dd>
              <dt>Scenario</dt>
              <dd>{model.scenario(o.scenarioId)?.name ?? '—'}</dd>
              <dt>Config</dt>
              <dd>{o.configurationId}</dd>
              <dt>Input rev</dt>
              <dd>{o.inputRevision}</dd>
              <dt>Saved</dt>
              <dd>{formatTime(o.createdAt)}</dd>
            </dl>
            {o.result.length > 0 && (
              <table className="ws-insp-result">
                <tbody>
                  {o.result.slice(0, 5).map((r) => (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td>
                        {String(r.value)}
                        {r.unit && r.unit !== '-' ? ` ${r.unit}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="ws-insp-badges">
              <FreshnessBadge freshness={o.freshness} />
              <ReviewBadge status={o.reviewStatus} />
            </div>
            {o.freshness.stale && (
              <ul className="ws-stale-reasons">
                {o.freshness.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="ws-hint">
          {hidden} output{hidden === 1 ? '' : 's'} saved under other configurations {hidden === 1 ? 'is' : 'are'} not shown.
        </p>
      )}
    </Section>
  )
}

function Links({ object }: { object: EngineeringObject }) {
  const model = useWorkspaceStore((s) => s.model)!
  const refs = (objects: EngineeringObject[]) =>
    objects.length ? (
      <div className="ws-insp-links">
        {objects.map((o) => (
          <div key={o.id} className="ws-insp-link">
            <ObjectRef object={o} />
            {o.type === 'requirement' && <ComplianceBadge value={o.properties.compliance} />}
          </div>
        ))}
      </div>
    ) : (
      <p className="ws-muted">None</p>
    )

  if (object.type === 'requirement') {
    return (
      <>
        <Section title="Allocated components">{refs(model.linkedObjects(object.id, 'allocated-to', 'out'))}</Section>
        <Section title="Verified by">{refs(model.linkedObjects(object.id, 'verifies', 'in'))}</Section>
      </>
    )
  }
  if (object.type === 'procedure') {
    return (
      <>
        <Section title="Linked requirements">{refs(model.linkedObjects(object.id, 'verifies', 'out'))}</Section>
        <Section title="Tests components">{refs(model.linkedObjects(object.id, 'tests', 'out'))}</Section>
      </>
    )
  }
  const requirements = model.linkedObjects(object.id, 'allocated-to', 'in')
  return <Section title="Linked requirements" count={requirements.length}>{refs(requirements)}</Section>
}

function ObjectDetails({ object, configurationId }: { object: EngineeringObject; configurationId: string }) {
  const model = useWorkspaceStore((s) => s.model)!
  const Icon = iconForType(object.type)
  const parent = object.parentId ? model.get(object.parentId) : undefined
  const props = Object.entries(object.properties).filter(([key]) => !HIDDEN_PROPS.has(key))

  return (
    <div className="ws-insp-object" data-inspected-id={object.id}>
      <header className="ws-insp-head">
        <Icon width={18} height={18} />
        <div>
          <div className="ws-insp-title">{object.name}</div>
          <div className="ws-insp-sub">
            <span className="ws-mono">{object.id}</span> · {object.type} · rev {object.revision}
          </div>
        </div>
      </header>

      {typeof object.properties.statement === 'string' && (
        <p className="ws-insp-statement">{object.properties.statement}</p>
      )}
      {object.type === 'requirement' && (
        <div className="ws-insp-badges">
          <ComplianceBadge value={object.properties.compliance} />
        </div>
      )}

      <Section title="Properties">
        <dl className="ws-props">
          {parent && (
            <>
              <dt>Parent</dt>
              <dd>
                <ObjectRef object={parent} />
              </dd>
            </>
          )}
          {props.map(([key, value]) => (
            <div key={key} className="ws-prop">
              <dt>{propertyLabel(key)}</dt>
              <dd>{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Links object={object} />
      <Outputs object={object} configurationId={configurationId} />
    </div>
  )
}

/**
 * Shared inspector. Each inspector (side panel, drawer or detached window) is a
 * view instance, so it can follow the workspace selection or be pinned.
 */
export function Inspector({
  viewId = 'inspector',
  detachable = true,
}: {
  viewId?: string
  /** Offer "Open in separate window" (not inside a detached inspector). */
  detachable?: boolean
}) {
  const model = useWorkspaceStore((s) => s.model)!
  const selectedIds = useWorkspaceStore((s) => sharedContextOf(s, viewId).selectedIds)
  const configurationId = useWorkspaceStore((s) => sharedContextOf(s, viewId).configurationId)
  const objects = selectedIds.map((id) => model.get(id)).filter((o): o is EngineeringObject => !!o)

  return (
    <div className="ws-inspector" data-view-id={viewId}>
      <div className="ws-inspector-bar">
        <ViewControls viewId={viewId} detach={detachable ? { kind: 'inspector' } : undefined} />
        {objects.length > 0 && (
          <button type="button" className="ws-link" onClick={() => selectInView(viewId, [])}>
            Clear selection
          </button>
        )}
      </div>
      <div className="ws-inspector-body">
        {objects.length === 0 && (
          <p className="ws-muted ws-insp-empty">
            Nothing selected. Select an object in the product tree or any tool to see its properties, linked requirements
            and saved outputs.
          </p>
        )}
        {objects.length > 1 && (
          <div className="ws-insp-multi">
            <Badge tone="info">{objects.length} objects selected</Badge>
            <div className="ws-insp-links">
              {objects.map((o) => (
                <ObjectRef key={o.id} object={o} />
              ))}
            </div>
          </div>
        )}
        {objects.length === 1 && <ObjectDetails object={objects[0]} configurationId={configurationId} />}
      </div>
    </div>
  )
}

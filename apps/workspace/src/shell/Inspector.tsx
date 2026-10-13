import { AppIcon, Badge, Button, EmptyState } from '@ews/design-system'
import {
  formatValue,
  outputFreshness,
  propertyLabel,
  readCadRepresentation,
  readRequirement,
  readSysmlElement,
  representationsOf,
  type EngineeringObject,
  type RelationshipType,
} from '@ews/model-service'
import { FreshnessBadge, OBJECT_TYPE_LABEL, ObjectRef, RequirementStatusBadge, ReviewBadge, formatTime, iconForType } from '@ews/platform-sdk/react'
import { useMemo, type ReactNode } from 'react'
import { selectInView, sharedContextOf } from '../platform/api'
import { RETIRED_TOOLS, toolName } from '../platform/registry'
import { useWorkspaceStore } from '../platform/store'
import { ViewControls } from './WorkArea'

/** Properties shown in their own sections instead of the generic property list. */
const SPECIAL_PROPS = new Set(['statement', 'rationale', 'status', 'compliance', 'steps', 'kind', 'shape'])

/** How a relationship reads from each end. */
const RELATIONSHIP_LABEL: Record<RelationshipType, { out: string; in: string }> = {
  'allocated-to': { out: 'Allocated to', in: 'Allocated requirements' },
  represents: { out: 'Represents', in: 'Represented by' },
  references: { out: 'References', in: 'Referenced by' },
  connects: { out: 'Connects to', in: 'Connected from' },
  satisfies: { out: 'Satisfies', in: 'Satisfied by' },
  verifies: { out: 'Verifies (retired Verification data)', in: 'Verified by (retired Verification data)' },
  tests: { out: 'Tests (retired Verification data)', in: 'Tested by (retired Verification data)' },
  'evidence-for': { out: 'Evidence for (retired)', in: 'Evidence (retired)' },
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="ws-insp-section">
      <h3>
        {title}
        {count !== undefined && <span className="text-fg-3"> {count}</span>}
      </h3>
      {children}
    </section>
  )
}

function Artifacts({ object, configurationId }: { object: EngineeringObject; configurationId: string }) {
  const model = useWorkspaceStore((s) => s.model)!
  const allOutputs = useWorkspaceStore((s) => s.outputs)
  const configuration = model.snapshot.configurations.find((c) => c.id === configurationId)

  const { artifacts, hidden } = useMemo(() => {
    const related = allOutputs.filter((o) => o.objectIds.includes(object.id))
    const inConfig = related
      .filter((o) => o.configurationId === configurationId)
      .map((o) => ({ ...o, freshness: outputFreshness(o, model) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { artifacts: inConfig, hidden: related.length - inConfig.length }
  }, [allOutputs, object.id, configurationId, model])

  return (
    <Section title="Saved artifacts" count={artifacts.length}>
      {artifacts.length === 0 && <p className="text-fg-3">No artifacts saved for this object in {configuration?.name}.</p>}
      <ul className="ws-insp-outputs">
        {artifacts.map((o) => (
          <li key={o.id} className={o.freshness.stale ? 'is-stale' : ''} data-output-id={o.id}>
            <div className="ws-insp-output-head">
              <span className="font-mono">{o.id}</span>
              <span className="ws-insp-output-title">{o.title}</span>
            </div>
            <div className="ws-insp-output-summary">{o.summary}</div>
            <dl className="ws-insp-output-meta">
              <dt>Tool</dt>
              <dd>{toolName(o.toolId)}</dd>
              <dt>Config</dt>
              <dd>{o.configurationId}</dd>
              {o.scenarioId && (
                <>
                  <dt>Scenario</dt>
                  <dd>{model.scenario(o.scenarioId)?.name ?? o.scenarioId}</dd>
                </>
              )}
              <dt>Input rev</dt>
              <dd>{o.inputRevision}</dd>
              <dt>Schema</dt>
              <dd>
                {o.kind} v{o.schemaVersion}
              </dd>
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
              {RETIRED_TOOLS[o.toolId] && (
                <Badge tone="neutral" icon="archive" title="Saved by a tool that is no longer in the catalogue; kept read-only">
                  Retired tool
                </Badge>
              )}
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
          {hidden} artifact{hidden === 1 ? '' : 's'} saved under other configurations {hidden === 1 ? 'is' : 'are'} not shown.
        </p>
      )}
    </Section>
  )
}

/** Every explicit relationship of the object, grouped by type and direction. */
function Relationships({ object }: { object: EngineeringObject }) {
  const model = useWorkspaceStore((s) => s.model)!
  const groups = new Map<string, EngineeringObject[]>()
  for (const r of model.relationshipsOf(object.id)) {
    const outgoing = r.from === object.id
    const other = model.get(outgoing ? r.to : r.from)
    if (!other) continue
    const label = RELATIONSHIP_LABEL[r.type]?.[outgoing ? 'out' : 'in'] ?? r.type
    groups.set(label, [...(groups.get(label) ?? []), other])
  }
  if (!groups.size) {
    return (
      <Section title="Relationships">
        <p className="text-fg-3">None</p>
      </Section>
    )
  }
  return (
    <>
      {[...groups].map(([label, objects]) => (
        <Section key={label} title={label} count={objects.length}>
          <div className="ws-insp-links">
            {objects.map((o) => (
              <ObjectRef key={o.id} object={o} />
            ))}
          </div>
        </Section>
      ))}
    </>
  )
}

/** For physical components: which SysML and CAD representations exist (explicit links only). */
function Representations({ object }: { object: EngineeringObject }) {
  const model = useWorkspaceStore((s) => s.model)!
  if (object.type !== 'assembly' && object.type !== 'part') return null
  const sysml = representationsOf(model, object.id, 'sysml')
  const cad = representationsOf(model, object.id, 'cad')
  return (
    <Section title="Representations">
      <dl className="ws-props">
        <div className="ws-prop">
          <dt>SysML</dt>
          <dd>{sysml.length ? sysml.map((o) => <ObjectRef key={o.id} object={o} />) : <span className="text-fg-3">None</span>}</dd>
        </div>
        <div className="ws-prop">
          <dt>CAD</dt>
          <dd>{cad.length ? cad.map((o) => <ObjectRef key={o.id} object={o} />) : <span className="text-fg-3">None</span>}</dd>
        </div>
      </dl>
    </Section>
  )
}

function TypeSpecific({ object }: { object: EngineeringObject }) {
  if (object.type === 'requirement') {
    const r = readRequirement(object)
    return (
      <>
        <p className="ws-insp-statement">{r.statement}</p>
        {r.rationale && <p className="ws-insp-rationale">Rationale: {r.rationale}</p>}
        <div className="ws-insp-badges">
          <RequirementStatusBadge status={r.status} unset={!r.statusSet} />
        </div>
      </>
    )
  }
  if (object.type === 'sysml-element') {
    const e = readSysmlElement(object)
    return (
      <div className="ws-insp-badges">
        <Badge tone="info" icon="sysml-element">
          {e.kind === 'part' ? (e.ownerId ? 'Part usage' : 'Part definition') : 'Requirement usage'}
          {e.typeName ? ` : ${e.typeName}` : ''}
        </Badge>
      </div>
    )
  }
  if (object.type === 'cad-representation') {
    const c = readCadRepresentation(object)
    return (
      <div className="ws-insp-badges">
        <Badge tone="warning" icon="warning">
          Mock geometry ({c.shape || 'unknown shape'})
        </Badge>
      </div>
    )
  }
  if (object.type === 'procedure') {
    return (
      <div className="ws-insp-badges">
        <Badge tone="neutral" icon="archive">
          Saved by the retired Verification tool; read-only
        </Badge>
      </div>
    )
  }
  return null
}

function ObjectDetails({ object, configurationId }: { object: EngineeringObject; configurationId: string }) {
  const model = useWorkspaceStore((s) => s.model)!
  const parent = object.parentId ? model.get(object.parentId) : undefined
  const props = Object.entries(object.properties).filter(([key]) => !SPECIAL_PROPS.has(key))

  return (
    <div className="ws-insp-object" data-inspected-id={object.id}>
      <header className="ws-insp-head">
        <AppIcon name={iconForType(object.type)} size="md" />
        <div>
          <div className="ws-insp-title">{object.name}</div>
          <div className="ws-insp-sub">
            <span className="font-mono">{object.id}</span> · {OBJECT_TYPE_LABEL[object.type]} · rev {object.revision}
          </div>
        </div>
      </header>
      <TypeSpecific object={object} />
      <Section title="Properties">
        <dl className="ws-props">
          {parent && (
            <div className="ws-prop">
              <dt>{object.type === 'sysml-element' ? 'Nested in' : 'Parent'}</dt>
              <dd>
                <ObjectRef object={parent} />
              </dd>
            </div>
          )}
          {props.map(([key, value]) => (
            <div key={key} className="ws-prop">
              <dt>{propertyLabel(key)}</dt>
              <dd>{formatValue(value)}</dd>
            </div>
          ))}
          {!parent && !props.length && <p className="text-fg-3">No further properties.</p>}
        </dl>
      </Section>
      <Representations object={object} />
      <Relationships object={object} />
      <Artifacts object={object} configurationId={configurationId} />
    </div>
  )
}

/**
 * Shared inspector. Each inspector (side panel, drawer or detached window) is a
 * view instance, so it can follow the workspace selection or be pinned. It is
 * platform UI: it shows every entity type, whichever tools the subscription
 * includes.
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
          <Button size="sm" variant="text" icon="close" onPress={() => selectInView(viewId, [])}>
            Clear selection
          </Button>
        )}
      </div>
      <div className="ws-inspector-body">
        {objects.length === 0 && (
          <EmptyState icon="info" title="Nothing selected">
            Select an object in the product tree or any tool to see its properties, representations, relationships and saved artifacts.
          </EmptyState>
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

import { AppIcon, Badge, Button, CollapsibleSection, EmptyState, Tab, TabList, TabPanel, Tabs } from '@ews/design-system'
import { create } from 'zustand'
import {
  ARTIFACT_OWNER,
  changeImpact,
  formatValue,
  outputFreshness,
  propertyLabel,
  readCadRepresentation,
  readRequirement,
  readSysmlElement,
  representationsOf,
  type EngineeringObject,
  type ObjectRevision,
  type RelationshipType,
  displayId,
} from '@ews/model-service'
import { FreshnessBadge, OBJECT_TYPE_LABEL, ObjectRef, RequirementStatusBadge, ReviewBadge, formatTime, iconForType } from '@ews/platform-sdk/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { selectInView, sharedContextOf } from '../platform/api'
import { RETIRED_TOOLS, toolName } from '../platform/registry'
import { useWorkspaceStore } from '../platform/store'
import { workspaceServices } from '../platform/services'
import type { ArtifactModule, InspectorSubject } from '@ews/platform-sdk'
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

/** A collapsible inspector section (open by default); the inspector shows only what applies to the selection. */
function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <CollapsibleSection title={title} count={count} className="ws-insp-section">
      {children}
    </CollapsibleSection>
  )
}

/** The inspector's tab (per window), so links such as "show saved output" can reveal their section. */
export const useInspectorTab = create<{ tab: InspectorTab; setTab: (tab: InspectorTab) => void }>()((set) => ({
  tab: 'properties',
  setTab: (tab) => set({ tab }),
}))
export type InspectorTab = 'properties' | 'traceability' | 'history'

/** Validation status of the selected object from real data: saved evidence that became potentially stale. */
function ValidationStatus({ object, configurationId }: { object: EngineeringObject; configurationId: string }) {
  const model = useWorkspaceStore((s) => s.model)!
  const outputs = useWorkspaceStore((s) => s.outputs)
  const stale = useMemo(
    () => outputs.filter((o) => o.configurationId === configurationId && o.objectIds.includes(object.id) && outputFreshness(o, model).stale).length,
    [outputs, configurationId, object.id, model],
  )
  return stale ? (
    <Badge tone="warning" icon="stale" title="Saved artifacts for this object whose inputs changed since they were saved">
      {stale} potentially stale artifact{stale === 1 ? '' : 's'}
    </Badge>
  ) : (
    <Badge tone="neutral" icon="success" title="No saved artifact for this object is potentially stale">
      Evidence current
    </Badge>
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

/** What a change to this object would affect (traceability and change impact). */
/** ArtifactRef.module for a twin object (contracts §3, docs/specifications/conceptualize-contracts.md). */
function artifactModuleOf(type: EngineeringObject['type']): ArtifactModule {
  return type === 'requirement' ? 'requirements' : type === 'sysml-element' ? 'sysml' : type === 'cad-representation' ? 'cad' : 'twin'
}

/** Concepts this object realizes, through Conceptualize implementations (SDK 1.5). Hidden without the service. */
function ConceptsSection({ object }: { object: EngineeringObject }) {
  const projectId = useWorkspaceStore((s) => s.context.projectId)
  const concepts = workspaceServices.concepts
  const [state, setState] = useState<{ items: { name: string; key: string; maturity: string; implementation: string }[] } | { error: string } | null>(null)
  useEffect(() => {
    if (!concepts) return
    let live = true
    setState(null)
    concepts
      .conceptsForArtifact({ module: artifactModuleOf(object.type), id: object.id }, { projectId })
      .then((found) => live && setState({ items: found.map((f) => ({ name: f.concept.name, key: f.concept.key, maturity: f.concept.maturity, implementation: f.implementation.name })) }))
      .catch((e: unknown) => live && setState({ error: e instanceof Error ? e.message : String(e) }))
    return () => {
      live = false
    }
  }, [concepts, object.id, object.type, object.revision, projectId])
  if (!concepts) return null
  return (
    <Section title="Concepts" count={state && 'items' in state ? state.items.length : undefined}>
      {state === null ? (
        <p className="text-fg-3">Loading…</p>
      ) : 'error' in state ? (
        <p className="text-fg-3">Concepts are not available: {state.error}</p>
      ) : state.items.length === 0 ? (
        <p className="text-fg-3">{displayId(object)} does not realize a Concept yet.</p>
      ) : (
        <ul className="ws-impact" data-testid="inspector-concepts">
          {state.items.map((c) => (
            <li key={c.key + c.implementation}>
              <span className="font-mono">{c.key}</span> {c.name} <Badge>{c.maturity}</Badge>
              <span className="text-ui-xs text-fg-3"> via {c.implementation}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function ChangeImpactSection({ object }: { object: EngineeringObject }) {
  const model = useWorkspaceStore((s) => s.model)!
  const outputs = useWorkspaceStore((s) => s.outputs)
  const baselines = useWorkspaceStore((s) => s.baselines)
  const impact = useMemo(() => changeImpact(model, outputs, baselines, object.id), [model, outputs, baselines, object.id])
  const nothing = !impact.dependentArtifacts.length && !impact.referencingArtifacts.length && !impact.baselines.length
  return (
    <Section title="Change impact">
      {nothing ? (
        <p className="text-fg-3">No saved evidence or baseline depends on {displayId(object)}.</p>
      ) : (
        <ul className="ws-impact" data-testid="change-impact">
          {impact.dependentArtifacts.length > 0 && (
            <li>
              <AppIcon name="stale" size="sm" />
              <span>
                Changing it marks {impact.dependentArtifacts.length} saved artifact{impact.dependentArtifacts.length === 1 ? '' : 's'} potentially stale:{' '}
                {impact.dependentArtifacts.map((a) => a.id).join(', ')}
              </span>
            </li>
          )}
          {impact.referencingArtifacts.length > 0 && (
            <li>
              <AppIcon name="verification" size="sm" />
              <span>
                {impact.referencingArtifacts.map((a) => a.id).join(', ')} reference an exact revision; they keep it and never follow later edits.
              </span>
            </li>
          )}
          {impact.baselines.length > 0 && (
            <li>
              <AppIcon name="baseline" size="sm" />
              <span>Pinned in {impact.baselines.map((b) => `${b.id} ${b.name} (rev ${b.revision})`).join(', ')}.</span>
            </li>
          )}
        </ul>
      )}
    </Section>
  )
}

/** Immutable revision history (audit record) of the object. */
function RevisionHistory({ object }: { object: EngineeringObject }) {
  const external = useWorkspaceStore((s) => s.projection?.objects.some((o) => o.id === object.id) ?? false)
  if (external) {
    return (
      <Section title="Revision history">
        <p className="text-fg-3" data-testid="revision-history">
          Rev {object.revision}. The Requirements service keeps this requirement's revisions, with actor, time and reason. Open it in Requirements
          (History tab) to compare revisions.
        </p>
      </Section>
    )
  }
  return <TwinRevisionHistory object={object} />
}

function TwinRevisionHistory({ object }: { object: EngineeringObject }) {
  const repository = useWorkspaceStore((s) => s.repository)
  const projectId = useWorkspaceStore((s) => s.context.projectId)
  const [history, setHistory] = useState<ObjectRevision[] | null>(null)
  useEffect(() => {
    let live = true
    setHistory(null)
    repository
      ?.listHistory(projectId, object.id)
      .then((h) => live && setHistory(h))
      .catch(() => live && setHistory([]))
    return () => {
      live = false
    }
  }, [repository, projectId, object.id, object.revision])
  return (
    <Section title="Revision history" count={history?.length}>
      {history === null ? (
        <p className="text-fg-3">Loading…</p>
      ) : (
        <ol className="ws-history" data-testid="revision-history">
          {history.slice(0, 8).map((h) => (
            <li key={h.revision}>
              <span className="font-mono">rev {h.revision}</span>
              <span className="text-fg-3">
                {formatTime(h.changedAt)} · {h.changedBy === 'import' ? 'recorded at import' : toolName(h.changedBy)}
              </span>
              <span>{h.summary}</span>
            </li>
          ))}
        </ol>
      )}
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

/** Contextual tabs; every panel stays mounted (hidden when inactive) so links and searches find their content. */
function InspectorTabs({ properties, traceability, history }: { properties: ReactNode; traceability: ReactNode; history: ReactNode }) {
  const tab = useInspectorTab((s) => s.tab)
  const setTab = useInspectorTab((s) => s.setTab)
  return (
    <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as InspectorTab)} className="ws-insp-tabs">
      <TabList aria-label="Inspector sections" className="ws-insp-tablist">
        <Tab id="properties">Properties</Tab>
        <Tab id="traceability">Traceability</Tab>
        <Tab id="history">History</Tab>
      </TabList>
      <TabPanel id="properties" shouldForceMount className="ws-insp-panel">
        {properties}
      </TabPanel>
      <TabPanel id="traceability" shouldForceMount className="ws-insp-panel">
        {traceability}
      </TabPanel>
      <TabPanel id="history" shouldForceMount className="ws-insp-panel">
        {history}
      </TabPanel>
    </Tabs>
  )
}

function ObjectDetails({ object, configurationId }: { object: EngineeringObject; configurationId: string }) {
  const model = useWorkspaceStore((s) => s.model)!
  const parent = object.parentId ? model.get(object.parentId) : undefined
  const props = Object.entries(object.properties).filter(([key]) => !SPECIAL_PROPS.has(key))

  return (
    <div className="ws-insp-object" data-inspected-id={object.id}>
      <header className="ws-insp-head">
        <span className="ws-insp-glyph" aria-hidden="true">
          <AppIcon name={iconForType(object.type)} size="md" />
        </span>
        <div className="min-w-0">
          <div className="ws-insp-title">{object.name}</div>
          <div className="ws-insp-type">{OBJECT_TYPE_LABEL[object.type]}</div>
          <div className="ws-insp-sub">
            <span className="font-mono">{displayId(object)}</span> · rev {object.revision} · owned by {ARTIFACT_OWNER[object.type] === 'product' ? 'product structure' : toolName(ARTIFACT_OWNER[object.type])}
          </div>
        </div>
      </header>
      <div className="ws-insp-status">
        <ValidationStatus object={object} configurationId={configurationId} />
      </div>
      <TypeSpecific object={object} />
      <InspectorTabs
        properties={
          <>
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
      <Artifacts object={object} configurationId={configurationId} />
          </>
        }
        traceability={
          <>
            <Relationships object={object} />
            <ConceptsSection object={object} />
            <ChangeImpactSection object={object} />
          </>
        }
        history={<RevisionHistory object={object} />}
      />
    </div>
  )
}

/** A record a tool contributed through `ToolApi.setInspectorSubject` (SDK 1.16): data rendered here with design-system parts. */
function SubjectDetails({ subject }: { subject: InspectorSubject }) {
  return (
    <div className="ws-insp-object" data-inspected-id={subject.id} data-inspected-key={subject.key}>
      <header className="ws-insp-head">
        <div className="min-w-0">
          <div className="ws-insp-title">{subject.title}</div>
          <div className="ws-insp-type">{subject.kind}</div>
          <div className="ws-insp-sub">
            <span className="font-mono" data-testid="inspector-subject-key">
              {subject.key}
            </span>
          </div>
        </div>
      </header>
      {subject.badges && subject.badges.length > 0 && (
        <div className="ws-insp-status">
          {subject.badges.map((b) => (
            <Badge key={b.label} tone={b.tone ?? 'neutral'}>
              {b.label}
            </Badge>
          ))}
        </div>
      )}
      {subject.sections.map((section) => (
        <Section key={section.title} title={section.title}>
          <dl className="ws-props">
            {section.fields.map((f) => (
              <div key={f.label} className="ws-prop">
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ))}
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
  // A record the active tool contributed (SDK 1.16) wins over the model selection; only the main inspector follows it.
  const activeToolId = useWorkspaceStore((s) => s.activeToolId)
  const subject = useWorkspaceStore((s) => (viewId === 'inspector' && s.activeToolId ? s.inspectorSubjects[s.activeToolId] : undefined))
  const setSubject = useWorkspaceStore((s) => s.setInspectorSubject)

  if (subject) {
    return (
      <div className="ws-inspector" data-view-id={viewId}>
        <div className="ws-inspector-bar">
          <ViewControls viewId={viewId} detach={detachable ? { kind: 'inspector' } : undefined} />
          <Button size="sm" variant="text" icon="close" onPress={() => activeToolId && setSubject(activeToolId, null)}>
            Clear selection
          </Button>
        </div>
        <div className="ws-inspector-body">
          <SubjectDetails subject={subject} />
        </div>
      </div>
    )
  }

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

import './conceptualize.css'
import { Badge, EmptyState, LoadingState, Notice, SegmentedControl } from '@ews/design-system'
import type { ConceptSummary, ConceptsService, InspectorSubject } from '@ews/platform-sdk'
import { useInspectorSubject, usePlatformServices, useSharedContext, useToolViewState } from '@ews/platform-sdk/react'
import { getConceptsModuleClient } from '@ews/conceptualize-client'
import { useEffect, useState } from 'react'
import { ModuleDataProvider, useModuleData, useResource } from './data'
import type { ConceptPage, ConceptualizeViewState } from './domain'
import { assumptionSubject, calculationSubject, conceptSubject, constraintSubject, functionSubject } from './inspectorSubjects'
import { AlternativesPage } from './ui/Alternatives'
import { VisualComparisonPage } from './ui/Visual'
import { CollaborationPage } from './ui/Collaboration'
import { MaturityBadge } from './ui/common'
import { BranchDialog, NewConceptDialog } from './ui/Dialogs'
import { ExplorerPanel } from './ui/Explorer'
import { IntegrationPage } from './ui/Integration'
import { DesignRecordPanel } from './ui/Knowledge'
import { ConceptWorkspace } from './ui/Workspace'

const PAGES: { value: ConceptPage; label: string }[] = [
  { value: 'explorer', label: 'Explorer' },
  { value: 'alternatives', label: 'Alternatives' },
  { value: 'visual', label: 'Visual comparison' },
  { value: 'integration', label: 'Integration' },
  { value: 'ai', label: 'AI collaboration' },
]

function Dialogs() {
  const { client } = useModuleData()
  const [state] = useToolViewState<ConceptualizeViewState>()
  const open = useResource(state.dialog && state.dialog !== 'new' && state.conceptId ? () => client.concept(state.conceptId!) : null, [client, state.dialog, state.conceptId])
  if (state.dialog === 'new') return <NewConceptDialog />
  if (state.dialog === 'child' && open.data) return <NewConceptDialog parent={open.data} />
  if (state.dialog === 'branch' && open.data) return <BranchDialog concept={open.data} />
  return null
}

/**
 * Keeps the workspace Inspector on the open Concept, Function, Constraint or Assumption (SDK 1.16). The Alternative
 * Explorer publishes its set itself; this component is only mounted on the Explorer page.
 */
function ExplorerInspector() {
  const { client } = useModuleData()
  const [state] = useToolViewState<ConceptualizeViewState>()
  const rec = state.record
  const subject = useResource<InspectorSubject | null>(
    rec
      ? async () =>
          rec.type === 'function'
            ? functionSubject(await client.function(rec.id))
            : rec.type === 'constraint'
              ? constraintSubject(await client.constraint(rec.id))
              : rec.type === 'calculation'
                ? calculationSubject(await client.calculationModel(rec.id))
                : assumptionSubject(await client.assumption(rec.id))
      : state.conceptId
        ? async () => conceptSubject(await client.concept(state.conceptId!))
        : null,
    [client, rec?.type, rec?.id, state.conceptId],
  )
  const wanted = rec?.id ?? state.conceptId
  // Never show the previous record while the next one loads.
  useInspectorSubject(wanted && subject.data?.id === wanted ? subject.data : null)
  return null
}

function ApiView() {
  const { client, permissions, permissionsError } = useModuleData()
  const [state, setState] = useToolViewState<ConceptualizeViewState>()
  const graph = useResource(() => client.graph(), [client])
  const readOnly = !!permissions && !permissions.permissions.includes('author')
  useEffect(() => {
    if (permissions && state.readOnly !== readOnly) setState({ readOnly })
  }, [permissions, readOnly, state.readOnly, setState])
  return (
    <div className="con-shell">
      <div className="con-topbar">
        <SegmentedControl label="Conceptualize page" size="sm" value={state.page} onChange={(page) => setState({ page })} options={PAGES} />
        {permissions && <Badge tone="neutral" title={`Permissions: ${permissions.permissions.join(', ')}`}>{permissions.role}</Badge>}
        {permissions && !permissions.permissions.includes('author') && <Badge tone="info">Read only</Badge>}
      </div>
      {permissionsError && <Notice tone="danger" title="The Conceptualize service is not reachable">{permissionsError}</Notice>}
      {graph.error && <Notice tone="danger" title="Concepts could not be loaded">{graph.error}</Notice>}
      {state.page === 'explorer' && (
        <div className={`con-root${state.conceptId || state.record ? ' has-detail' : ''}`}>
          <ExplorerInspector />
          <ExplorerPanel graph={graph.data} loading={graph.loading} />
          {state.conceptId && <ConceptWorkspace graph={graph.data} />}
          {!state.conceptId && state.record && <DesignRecordPanel />}
        </div>
      )}
      {state.page === 'alternatives' && <AlternativesPage />}
      {state.page === 'visual' && <VisualComparisonPage />}
      {state.page === 'integration' && <IntegrationPage />}
      {state.page === 'ai' && <CollaborationPage />}
      <Dialogs />
    </div>
  )
}

/** Demo mode: the SDK read contract only (explicitly chosen; never a fallback for a failing API). */
function DemoView({ service, projectId }: { service: ConceptsService; projectId: string }) {
  const [items, setItems] = useState<ConceptSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    service.list({ projectId, limit: 200 }).then((p) => setItems(p.items), (e) => setError(e instanceof Error ? e.message : String(e)))
  }, [service, projectId])
  return (
    <div className="con-shell">
      <Notice tone="warning" title="Demo data (in the browser)">
        Conceptualize runs on example data chosen in the service settings. Creating and editing Concepts, alternatives, trade studies and the assistant's proposals need API mode.
      </Notice>
      {error && <Notice tone="danger">{error}</Notice>}
      {!items && !error && <LoadingState label="Loading Concepts" />}
      <ul className="con-results">
        {(items ?? []).map((c) => (
          <li key={c.id}>
            <span className="con-key">{c.key}</span> {c.name} <MaturityBadge maturity={c.maturity} /> <span className="con-muted">{c.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ConceptualizeView() {
  const services = usePlatformServices()
  const { projectId } = useSharedContext()
  const service = services.concepts
  if (!service) return <EmptyState icon="info" title="Conceptualize is not available">The Conceptualize service is not provided by this host or your subscription does not include it.</EmptyState>
  const client = getConceptsModuleClient(service, projectId)
  if (service.mode === 'demo' || !client) return <DemoView service={service} projectId={projectId} />
  return (
    <ModuleDataProvider client={client} service={service} projectId={projectId}>
      <ApiView />
    </ModuleDataProvider>
  )
}

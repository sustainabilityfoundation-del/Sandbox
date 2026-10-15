import './conceptualize.css'
import { Badge, EmptyState, LoadingState, Notice, SegmentedControl } from '@ews/design-system'
import type { ConceptSummary, ConceptsService } from '@ews/platform-sdk'
import { usePlatformServices, useSharedContext, useToolViewState } from '@ews/platform-sdk/react'
import { getConceptsModuleClient } from '@ews/conceptualize-client'
import { useEffect, useState } from 'react'
import { ModuleDataProvider, useModuleData, useResource } from './data'
import type { ConceptPage, ConceptualizeViewState } from './domain'
import { AlternativesPage } from './ui/Alternatives'
import { CollaborationPage } from './ui/Collaboration'
import { MaturityBadge } from './ui/common'
import { BranchDialog, NewConceptDialog } from './ui/Dialogs'
import { ExplorerPanel } from './ui/Explorer'
import { IntegrationPage } from './ui/Integration'
import { ConceptWorkspace } from './ui/Workspace'

const PAGES: { value: ConceptPage; label: string }[] = [
  { value: 'explorer', label: 'Explorer' },
  { value: 'alternatives', label: 'Alternatives' },
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
        <div className={`con-root${state.conceptId ? ' has-detail' : ''}`}>
          <ExplorerPanel graph={graph.data} loading={graph.loading} />
          {state.conceptId && <ConceptWorkspace graph={graph.data} />}
        </div>
      )}
      {state.page === 'alternatives' && <AlternativesPage />}
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

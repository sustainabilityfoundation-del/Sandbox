import { createMemoryFilesService, type CadService, type ConceptsService, type PlatformServices, ProjectsService, RequirementsService, SysmlModelService } from '@ews/platform-sdk'
import { createHttpProjectsService } from '@ews/projects-client'
import { createDemoConceptsService, createHttpConceptsService, getConceptsModuleClient } from '@ews/conceptualize-client'
import { createDemoRequirementsService, createHttpRequirementsService } from '@ews/requirements-client'
import { createHttpSysmlClient, createSysmlModelService } from '@ews/sysml-client'
import { createWorkspaceCadService } from '@ews/tool-cad-modeler'
import { registerVisualizationPort } from '@ews/tool-conceptualize'
import { createVisualizationClient } from '@ews/visualization-client'
import { create } from 'zustand'
import { workspaceHelp } from '../help/workspaceHelp'

/**
 * Platform services offered to tools (SDK 1.2), see
 * docs/specifications/requirements-contracts.md §4 and §10.
 *
 * The Requirements service talks to the application backend (services/api,
 * proxied at /api). The browser never reaches PostgreSQL and holds no
 * credentials. Demo mode is an explicit choice; an API failure never switches
 * to it.
 */

export type RequirementsMode = 'api' | 'demo'

/** Development identities seeded by services/api (contracts §6). Production uses OIDC instead. */
export const DEV_USERS = [
  { id: 'ada', label: 'ada — administrator' },
  { id: 'rui', label: 'rui — reviewer' },
  { id: 'eli', label: 'eli — editor' },
  { id: 'rho', label: 'rho — reader' },
  { id: 'nia', label: 'nia — editor, SysML and CAD only' },
] as const

export interface ServiceSettings {
  requirementsMode: RequirementsMode
  devUser: string
}

const KEY = 'ews.services.v1'
const DEFAULTS: ServiceSettings = { requirementsMode: 'api', devUser: 'eli' }

function readSettings(): ServiceSettings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    const parsed = raw ? (JSON.parse(raw) as Partial<ServiceSettings>) : {}
    return {
      requirementsMode: parsed.requirementsMode === 'demo' ? 'demo' : 'api',
      devUser: DEV_USERS.some((u) => u.id === parsed.devUser) ? parsed.devUser! : DEFAULTS.devUser,
    }
  } catch {
    return DEFAULTS
  }
}

export type StreamStatus = 'idle' | 'connecting' | 'open' | 'retrying'

/** Connection state of the Requirements event stream, for the header. */
export const useServiceStatus = create<{ stream: StreamStatus; streamError?: string }>()(() => ({ stream: 'idle' }))

/** Settings this window was started with. Changing them reloads every window (services are built once). */
export const serviceSettings: ServiceSettings = readSettings()

function createRequirements(settings: ServiceSettings): RequirementsService {
  if (settings.requirementsMode === 'demo') return createDemoRequirementsService({ latencyMs: 80 })
  return createHttpRequirementsService({
    baseUrl: '/api/requirements/v1',
    devUser: settings.devUser,
    onStreamStatus: (_projectId, stream, streamError) => useServiceStatus.setState({ stream, streamError }),
  })
}

/** Conceptualize (SDK 1.5) follows the same service settings: API mode and development user, or explicit demo data. */
function createConcepts(settings: ServiceSettings): ConceptsService {
  if (settings.requirementsMode === 'demo') return createDemoConceptsService({ latencyMs: 80 })
  return createHttpConceptsService({ baseUrl: '/api/concepts/v1', devUser: settings.devUser })
}

/**
 * System Model read service (SDK 1.8). API mode only: in demo mode the System Model keeps its own in-browser
 * repository, which other modules cannot read, so the service is absent ("module unavailable").
 */
function createSysml(settings: ServiceSettings): SysmlModelService | undefined {
  if (settings.requirementsMode === 'demo') return undefined
  return createSysmlModelService(createHttpSysmlClient({ baseUrl: '/api/sysml/v1', devUser: settings.devUser }))
}

/** Project Management (SDK 1.7) needs the API; in explicit demo mode there is no project registry (the example project only). */
function createProjects(settings: ServiceSettings): ProjectsService | undefined {
  if (settings.requirementsMode === 'demo') return undefined
  return createHttpProjectsService({ baseUrl: '/api/projects/v1', devUser: settings.devUser })
}

/** CAD Modeler read service (SDK 1.8): regenerates stored revisions in the shared kernel worker. API mode only. */
function createCad(settings: ServiceSettings): CadService | undefined {
  if (settings.requirementsMode === 'demo') return undefined
  return createWorkspaceCadService({ baseUrl: '/api/cad/v1', devUser: settings.devUser })
}

export const workspaceServices: PlatformServices = {
  cad: createCad(serviceSettings),
  requirements: createRequirements(serviceSettings),
  help: workspaceHelp,
  concepts: createConcepts(serviceSettings),
  sysml: createSysml(serviceSettings),
  projects: createProjects(serviceSettings),
  files: createMemoryFilesService(),
}

// SDK 1.9 ConceptsService members (definition, handoffs, revision staleness) delegate to the Conceptualize module
// client behind the HTTP service (same service object, so getConceptsModuleClient keeps working). Demo mode has no
// module client: the members then answer "not found" (undefined / empty).
{
  const concepts = workspaceServices.concepts
  if (concepts) {
    const client = (projectId: string) => getConceptsModuleClient(concepts, projectId)
    const notFound = (e: unknown) => ((e as { status?: number }).status === 404 ? undefined : Promise.reject(e))
    Object.assign(concepts, {
      getDefinition: async (id, { projectId, revision }) => {
        const c = client(projectId)
        if (!c) return undefined
        const concept = await c.concept(id, revision).then((x) => x, notFound)
        const d = concept?.definition
        if (!d) return undefined
        return {
          intent: d.intent,
          components: d.components.map((x) => ({ id: x.id, name: x.name, kind: x.kind, basis: x.basis })),
          interfaces: d.interfaces.map((x) => ({ id: x.id, name: x.name, kind: x.kind, between: x.between, parameterIds: x.parameterIds })),
          parameters: d.parameters.map((x) => ({ id: x.id, symbol: x.symbol, name: x.name, value: x.value, min: x.min, max: x.max, unit: x.unit, basis: x.basis, componentId: x.componentId, constraintId: x.constraintId })),
        }
      },
      getHandoff: async (id, { projectId }) => {
        const c = client(projectId)
        return c ? c.handoff(id).then((h) => h as never, notFound) : undefined
      },
      listHandoffs: async (conceptId, { projectId }) => {
        const c = client(projectId)
        return c ? c.handoffs(conceptId).then((h) => h as never, () => [] as never) : []
      },
      revisionStaleness: async (conceptId, revision, { projectId, purpose }) => {
        const c = client(projectId)
        return c ? c.revisionStaleness(conceptId, revision, purpose ?? 'downstream').then((x) => x as never, notFound) : undefined
      },
    } satisfies Pick<ConceptsService, 'getDefinition' | 'getHandoff' | 'listHandoffs' | 'revisionStaleness'>)
  }
}

// Concept illustrations go through the visualization service (API mode). The service refuses with a reason when no
// image provider is usable (images are off by default; Sign in with ChatGPT cannot generate images); structured
// layouts never need it.
if (serviceSettings.requirementsMode === 'api') {
  registerVisualizationPort(createVisualizationClient({ baseUrl: '/api/visualization/v1', devUser: serviceSettings.devUser }))
}

/** Saves new settings and reloads; other windows follow through the storage event below. */
export function saveServiceSettings(next: ServiceSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Without storage the change cannot persist; reload would restore the old settings.
    return
  }
  window.location.reload()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) window.location.reload()
  })
}

/** Whether the backend answers; used for the header status only. */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch('/api/health')
    return response.ok
  } catch {
    return false
  }
}

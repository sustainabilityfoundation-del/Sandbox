import type { CadService, ConceptsService, PlatformServices, ProjectsService, RequirementsService, SysmlModelService } from '@ews/platform-sdk'
import { createHttpProjectsService } from '@ews/projects-client'
import { createDemoConceptsService, createHttpConceptsService, getConceptsModuleClient } from '@ews/conceptualize-client'
import { createDemoRequirementsService, createHttpRequirementsService } from '@ews/requirements-client'
import { createHttpSysmlClient, createSysmlModelService } from '@ews/sysml-client'
import { configureConceptHandoffs, createWorkspaceCadService } from '@ews/tool-cad-modeler'
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
 * SysML Modeler read service (SDK 1.8). API mode only: in demo mode the SysML Modeler keeps its own in-browser
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
}

// Interim until SDK 1.9 adds ConceptsService.getHandoff / revisionStaleness: the CAD Modeler reads Conceptualize's
// CAD handoff packages and concept revision staleness through the Conceptualize module client. Remove this block
// when the SDK members exist (the CAD Modeler prefers them automatically).
{
  const concepts = workspaceServices.concepts
  const sdk19 = concepts as (ConceptsService & { getHandoff?: unknown; revisionStaleness?: unknown }) | undefined
  if (concepts && !(sdk19?.getHandoff && sdk19?.revisionStaleness)) {
    const client = (projectId: string) => getConceptsModuleClient(concepts, projectId)
    const notFound = (e: unknown) => ((e as { status?: number }).status === 404 ? undefined : Promise.reject(e))
    configureConceptHandoffs({
      getHandoff: async (id, { projectId }) => (client(projectId) ? client(projectId)!.handoff(id).then((h) => h as never, notFound) : undefined),
      revisionStaleness: async (conceptId, revision, { projectId, purpose }) => (client(projectId) ? client(projectId)!.revisionStaleness(conceptId, revision, purpose ?? 'downstream').then((x) => x as never, notFound) : undefined),
    })
  }
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

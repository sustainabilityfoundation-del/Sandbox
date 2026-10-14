import type { PlatformServices, RequirementsService } from '@ews/platform-sdk'
import { createDemoRequirementsService, createHttpRequirementsService } from '@ews/requirements-client'
import { create } from 'zustand'

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

export const workspaceServices: PlatformServices = { requirements: createRequirements(serviceSettings) }

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

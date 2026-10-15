import { create } from 'zustand'
import { ASSISTANT_API, ApiError, api, backendInUse } from '../settings/api'
import { useSettingsState } from '../settings/store'
import { DemoAssistantService } from './DemoAssistantService'
import { RemoteAssistantService } from './RemoteAssistantService'
import { useConversation } from './conversation'
import { serviceSettings } from '../platform/services'
import { usePolicyView, type PolicyView } from './aiPolicy'

export type { PolicyView }

/**
 * The person's AI account connection as the browser sees it: status only (provider, method, "key ending
 * …", account e-mail, model), never a credential. The conversation uses the connected backend when a
 * connection is active, otherwise the labelled demo assistant.
 */

export type ProviderMethod =
  | { id: string; kind: 'api-key'; label: string; keyLabel: string; help: string; keyUrl?: string }
  | { id: string; kind: 'oauth'; label: string; buttonLabel: string; help: string; manageUsageUrl?: string; available: boolean }

export interface ProviderInfo {
  id: string
  name: string
  description: string
  defaultModel: string
  methods: ProviderMethod[]
}

export interface ConnectionStatus {
  id: string
  provider: string
  method: string
  account: string
  keyLast4?: string
  model: string
  status: 'active' | 'needs-sign-in' | 'plan-usage-disabled'
  connectedAt: string
  lastValidatedAt?: string
}

interface AiConnectionState {
  status: 'idle' | 'loading' | 'ready' | 'unavailable'
  error?: string
  providers: ProviderInfo[]
  connection: ConnectionStatus | null
  policy: PolicyView | null
  refresh: () => Promise<void>
}

export const useAiConnection = create<AiConnectionState>()((set) => ({
  status: 'idle',
  providers: [],
  connection: null,
  policy: null,
  refresh: async () => {
    if (!backendInUse()) {
      usePolicyView.setState({ view: null })
      set({ status: 'unavailable', error: 'Demo mode: the assistant backend is not used. Switch Service mode to API in Settings → Platform to connect an AI account.', connection: null, policy: null })
      applyService(null)
      return
    }
    set((s) => ({ status: s.status === 'ready' ? 'ready' : 'loading' }))
    const projectId = useSettingsState.getState().projectId
    try {
      const [providers, connection, policy] = await Promise.all([
        api<{ providers: ProviderInfo[] }>('GET', `${ASSISTANT_API}/providers`),
        api<{ connection: ConnectionStatus | null }>('GET', `${ASSISTANT_API}/connection`),
        api<PolicyView>('GET', `${ASSISTANT_API}/policy?projectId=${encodeURIComponent(projectId)}`),
      ])
      set({ status: 'ready', error: undefined, providers: providers.body.providers, connection: connection.body.connection, policy: policy.body })
      usePolicyView.setState({ view: policy.body })
      applyService(connection.body.connection)
    } catch (e) {
      set({ status: 'unavailable', error: e instanceof ApiError && e.status === 404 ? 'The assistant API is not available on this backend (EWS_ASSISTANT_KEY is required in production).' : e instanceof Error ? e.message : String(e) })
      applyService(null)
    }
  },
}))

const projectQuery = () => `projectId=${encodeURIComponent(useSettingsState.getState().projectId)}`

export async function connectApiKey(provider: string, method: string, apiKey: string): Promise<ConnectionStatus> {
  const r = await api<{ connection: ConnectionStatus }>('POST', `${ASSISTANT_API}/connection/api-key?${projectQuery()}`, { provider, method, apiKey })
  await useAiConnection.getState().refresh()
  return r.body.connection
}

/** Opens the provider's sign-in in a new tab; resolves when the connection appears (or the attempt ends). */
export async function startSignIn(provider: string, method: string): Promise<void> {
  const returnTo = `${location.origin}${location.pathname}`
  const r = await api<{ authorizationUrl: string }>('POST', `${ASSISTANT_API}/connection/oauth/start?${projectQuery()}`, { provider, method, returnTo })
  const opened = window.open(r.body.authorizationUrl, '_blank', 'noopener')
  if (!opened) location.assign(r.body.authorizationUrl)
}

export async function disconnect(): Promise<{ revoked?: boolean }> {
  const r = await api<{ disconnected: boolean; revoked?: boolean }>('DELETE', `${ASSISTANT_API}/connection?${projectQuery()}`)
  await useAiConnection.getState().refresh()
  return r.body
}

export async function listModels(): Promise<{ current: string; models: { id: string; label: string }[] }> {
  return (await api<{ current: string; models: { id: string; label: string }[] }>('GET', `${ASSISTANT_API}/connection/models`)).body
}

export async function chooseModel(model: string): Promise<void> {
  await api('PUT', `${ASSISTANT_API}/connection/model`, { model })
  await useAiConnection.getState().refresh()
}

export async function testConnection(): Promise<{ latencyMs: number; models: number }> {
  return (await api<{ ok: true; latencyMs: number; models: number }>('POST', `${ASSISTANT_API}/connection/test`)).body
}

export interface AuditRecord {
  id: number
  at: string
  provider: string
  method: string | null
  model: string | null
  purpose: string
  toolsOffered: number
  toolsCalled: string[]
  toolsRefused: string[]
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number | null
  outcome: string
  errorCode: string | null
  promptStored: boolean
}

export async function auditRecords(limit = 30): Promise<AuditRecord[]> {
  return (await api<{ records: AuditRecord[] }>('GET', `${ASSISTANT_API}/audit?limit=${limit}`)).body.records
}

/** What would be sent with a request (built by the server; nothing is sent to the provider). */
export async function previewRequest(request: unknown) {
  return (await api<{ provider: string | null; model: string | null; instructions: string; messages: { type: string; role?: string; text?: string; name?: string }[]; tools: string[]; removedTools: { name: string; reason: string }[] }>('POST', `${ASSISTANT_API}/preview`, request)).body
}

// ---- the conversation's service -------------------------------------------------------------------

const demo = new DemoAssistantService()
let connected: RemoteAssistantService | undefined
let connectedKey = ''

function applyService(connection: ConnectionStatus | null) {
  const conversation = useConversation.getState()
  if (connection?.status === 'active') {
    const provider = useAiConnection.getState().providers.find((p) => p.id === connection.provider)
    const key = `${connection.id}|${connection.model}`
    if (!connected || connectedKey !== key) {
      connected = new RemoteAssistantService(`${ASSISTANT_API}/respond`, {
        headers: () => ({ 'X-Dev-User': serviceSettings.devUser }),
        info: {
          name: connection.provider === 'openai' ? 'ChatGPT' : (provider?.name ?? connection.provider),
          kind: 'remote',
          description: `Connected: ${provider?.name ?? connection.provider}, model ${connection.model}, ${connection.method === 'chatgpt' ? 'using your ChatGPT plan' : connection.account}.`,
          model: connection.model,
          method: connection.method,
        },
      })
      connectedKey = key
    }
    if (conversation.service !== connected) conversation.configure(connected)
  } else if (conversation.service !== demo) {
    connected = undefined
    connectedKey = ''
    conversation.configure(demo)
  }
}

/**
 * Starts with the demo assistant and switches to the connected backend once the connection is known.
 * Rechecks when the window regains focus (a sign-in finishes in another tab) and after settings change.
 */
export function startAssistantConnection(): void {
  useConversation.getState().configure(demo)
  void useAiConnection.getState().refresh()
  if (typeof window === 'undefined') return
  window.addEventListener('focus', () => void useAiConnection.getState().refresh())
  window.addEventListener('ews-settings-saved', () => void useAiConnection.getState().refresh())
  window.addEventListener('message', (e) => {
    if ((e.data as { type?: string })?.type === 'ews-ai-connect') void useAiConnection.getState().refresh()
  })
}


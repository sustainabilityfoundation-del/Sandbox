import { ProviderError, type AssistantProvider, type ProviderCredential, type ProviderModel } from '../providers/types'
import type { ProviderRegistry } from '../providers/registry'
import { DEVELOPER_PROVIDERS } from './runtime'

/**
 * Developer accounts: provider keys configured in the server environment (development mode). A key is held in server memory
 * only. It is validated with the provider's model list (a free call). An invalid key marks its account invalid and never
 * stops the server. A provider with a key but no registered adapter is reported as "adapter pending" and never called.
 */

export type DeveloperAccountState = 'valid' | 'invalid' | 'unreachable' | 'unchecked' | 'adapter-pending' | 'not-configured'

export interface DeveloperAccountView {
  provider: string
  name: string
  configured: boolean
  /** Last four characters of the key, for recognition only. */
  keyLast4: string | null
  state: DeveloperAccountState
  message: string
  checkedAt: string | null
  models: ProviderModel[]
}

interface Entry {
  provider: string
  name: string
  apiKey: string | null
  state: DeveloperAccountState
  message: string
  checkedAt: string | null
  models: ProviderModel[]
  validating?: Promise<void>
}

const MESSAGES: Record<DeveloperAccountState, string> = {
  valid: 'The key was accepted by the provider.',
  invalid: 'The provider did not accept this key.',
  unreachable: 'The provider could not be reached; the key was not checked.',
  unchecked: 'The key has not been checked yet.',
  'adapter-pending': 'A key is configured, but this provider’s adapter is not available yet. It is never called.',
  'not-configured': 'No key is configured for this provider.',
}

export class DeveloperAccounts {
  private readonly entries = new Map<string, Entry>()

  constructor(
    keys: Record<string, string>,
    private readonly providers: ProviderRegistry,
    private readonly o: { timeoutMs?: number; now?: () => Date; log?: { warn: (obj: unknown, msg?: string) => void } } = {},
  ) {
    for (const p of DEVELOPER_PROVIDERS) {
      const apiKey = keys[p.id]?.trim() || null
      this.entries.set(p.id, { provider: p.id, name: p.name, apiKey, state: apiKey ? (this.providers.get(p.id) ? 'unchecked' : 'adapter-pending') : 'not-configured', message: '', checkedAt: null, models: [] })
    }
  }

  private view(e: Entry): DeveloperAccountView {
    return { provider: e.provider, name: e.name, configured: !!e.apiKey, keyLast4: e.apiKey ? e.apiKey.slice(-4) : null, state: e.state, message: e.message || MESSAGES[e.state], checkedAt: e.checkedAt, models: e.models.map((m) => ({ id: m.id, label: m.label })) }
  }

  /** The accounts as the status endpoint shows them: never the key. */
  list(): DeveloperAccountView[] {
    return [...this.entries.values()].map((e) => this.view(e))
  }

  get(provider: string): DeveloperAccountView | undefined {
    const e = this.entries.get(provider)
    return e ? this.view(e) : undefined
  }

  /** The provider adapter of a configured and valid account, and its credential for one request. */
  usable(provider: string): { provider: AssistantProvider; credential: ProviderCredential } | undefined {
    const e = this.entries.get(provider)
    const adapter = this.providers.get(provider)
    if (!e?.apiKey || e.state !== 'valid' || !adapter) return undefined
    return { provider: adapter, credential: { kind: 'api-key', apiKey: e.apiKey } }
  }

  /** Validates one account with the provider's model list. */
  validate(provider: string): Promise<DeveloperAccountView> {
    const e = this.entries.get(provider)
    if (!e) return Promise.reject(new Error(`Unknown provider ${provider}.`))
    if (!e.validating) e.validating = this.run(e).finally(() => (e.validating = undefined))
    return e.validating.then(() => this.view(e))
  }

  async validateAll(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((id) => this.validate(id).catch(() => undefined)))
  }

  /** Validates accounts that were never checked (first use), so a request does not need a separate call first. */
  async ensureValidated(): Promise<void> {
    await Promise.all([...this.entries.values()].filter((e) => e.state === 'unchecked').map((e) => this.validate(e.provider).catch(() => undefined)))
  }

  private async run(e: Entry): Promise<void> {
    const adapter = this.providers.get(e.provider)
    const stamp = () => (this.o.now?.() ?? new Date()).toISOString()
    if (!e.apiKey) {
      e.state = 'not-configured'
      e.message = ''
      return
    }
    if (!adapter) {
      e.state = 'adapter-pending'
      e.message = ''
      e.checkedAt = null
      return
    }
    const method = adapter.methods.find((m) => m.kind === 'api-key')
    try {
      const { models } = await adapter.validateCredential({ kind: 'api-key', apiKey: e.apiKey }, method?.id ?? 'api-key', AbortSignal.timeout(this.o.timeoutMs ?? 20_000))
      e.state = 'valid'
      e.message = ''
      e.models = models
    } catch (error) {
      const kind = error instanceof ProviderError ? error.kind : 'unavailable'
      e.state = kind === 'invalid-credential' || kind === 'not-permitted' ? 'invalid' : 'unreachable'
      // ProviderError messages never contain credentials; anything else is replaced by a fixed text.
      e.message = error instanceof ProviderError ? error.message : MESSAGES.unreachable
      e.models = []
      this.o.log?.warn({ provider: e.provider, state: e.state }, 'developer key validation failed')
    }
    e.checkedAt = stamp()
  }
}

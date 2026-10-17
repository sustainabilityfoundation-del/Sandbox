import type { Pool } from 'pg'
import type { SettingValue } from '@ews/platform-sdk'
import { CredentialVault } from './crypto'
import { OAuthError, authorizationUrl, exchangeCode, loopbackRedirect, newAttemptSecrets, refreshTokens, revokeRefreshToken, validateIdToken } from './oauth'
import { randomUUID } from 'node:crypto'
import { AssistantError } from './errors'
import { DeveloperAccounts } from './gateway/accounts'
import { Gateway, type GatewayResult, type UserConnectionHandle } from './gateway/gateway'
import { PgMetering, type Metering } from './gateway/metering'
import { DEFAULT_AI_RUNTIME, type AiRuntimeConfig } from './gateway/runtime'
import { UsageLedger } from './ledger'
import { RoutingError, type Evaluation } from './orchestrator/route'
import { ROUTING_MODES, routingFromSettings, type RoutingSettings } from './orchestrator/settings'
import { isPriced } from './pricing'
import { DEFAULT_POLICY, OPERATION_CLASSES, type AiPolicy, type Policy } from './policy'
import type { ProviderRegistry } from './providers/registry'
import { ProviderError, type AssistantProvider, type AuthMethod, type ProviderCredential, type ProviderMessage, type ProviderTool, type RespondOutput } from './providers/types'
import { AssistantStore, publicStatus, type ConnectionRow, type ConnectionStatus } from './store'
import { ForgedResultError, INSTRUCTIONS, prepareRequest, screenCalls, signCall, type ResponseMeta, type WireRequest, type WireResponse } from './wire'

export interface Principal {
  userId: string
  entitlements: string[]
}

/** How the assistant reads the person's AI settings and records the connection reference (injected by the host). */
export interface SettingsAccess {
  effective: (userId: string, projectId: string) => Promise<Record<string, SettingValue>>
  /** Writes the `ai.connection.active` secret reference (owner: assistant). */
  setConnectionReference: (userId: string, projectId: string, reference: string | null) => Promise<void>
}

export { AssistantError }

const PROVIDER_STATUS: Record<ProviderError['kind'], number> = {
  'invalid-credential': 502,
  'not-permitted': 502,
  'rate-limit': 429,
  'usage-limit': 429,
  'insufficient-quota': 429,
  timeout: 504,
  unavailable: 502,
  'bad-request': 502,
  'model-not-found': 502,
  // New kinds (AI infrastructure A); the gateway (increment C) maps them properly.
  cancelled: 499,
  'content-filtered': 422,
  'context-too-long': 413,
}

function providerFailure(e: unknown): AssistantError {
  if (e instanceof AssistantError) return e
  if (e instanceof ProviderError) return new AssistantError(`provider-${e.kind}`, e.message, PROVIDER_STATUS[e.kind], { kind: e.kind, ...(e.providerCode ? { providerCode: e.providerCode } : {}) })
  return new AssistantError('provider-unavailable', 'The AI provider could not be reached.', 502, { kind: 'unavailable' })
}

export interface AssistantBackendOptions {
  pool: Pool
  vault: CredentialVault
  providers: ProviderRegistry
  settings: SettingsAccess
  /** Membership check for the project a request concerns. */
  roleOf: (userId: string, projectId: string) => Promise<string | null>
  /** Origin at which the person's browser reaches this API directly (OAuth loopback redirect), e.g. http://127.0.0.1:8801. */
  publicOrigin?: string
  fetch?: typeof fetch
  /** AI modules and operation catalogue in force (createPolicy with the modules the host collected). Default: the platform's own. */
  policy?: Policy
  log?: { warn: (obj: unknown, msg?: string) => void }
  /**
   * AI runtime (mode, developer keys, budget; ADR-0080), read from the environment by the host (`readAiConfig`). Default:
   * `user` mode, i.e. only the person's own connection (the behaviour before the gateway).
   */
  ai?: Partial<AiRuntimeConfig>
  /** Replace the usage ledger access (tests that check the fail-safe without a database). */
  metering?: Metering
  /** Waits between attempts to write an end event (tests). */
  retryDelaysMs?: number[]
}

/**
 * The provider-neutral assistant backend. Used by the HTTP plugin (browser respond loop) and usable directly
 * by server-side callers (`complete`, for example the design reasoning layer's model gateway), with the same
 * connection, policy limits and audit.
 */
export class AssistantBackend {
  readonly store: AssistantStore
  private readonly doFetch: typeof fetch
  private readonly rules: Policy
  private readonly refreshing = new Map<string, Promise<ConnectionRow>>()
  readonly runtime: AiRuntimeConfig
  /** Developer accounts (development mode): provider keys from the server environment. */
  readonly accounts: DeveloperAccounts
  /** The single dispatch point for model requests. */
  readonly gateway: Gateway

  constructor(private readonly o: AssistantBackendOptions) {
    this.store = new AssistantStore(o.pool, o.vault)
    this.doFetch = o.fetch ?? fetch
    this.rules = o.policy ?? DEFAULT_POLICY
    this.runtime = { ...DEFAULT_AI_RUNTIME, ...o.ai, developerKeys: o.ai?.mode === 'development' ? (o.ai.developerKeys ?? {}) : {} }
    this.accounts = new DeveloperAccounts(this.runtime.developerKeys, o.providers, { log: o.log })
    this.gateway = new Gateway({ providers: o.providers, accounts: this.accounts, metering: o.metering ?? new PgMetering(o.pool), runtime: this.runtime, log: o.log, retryDelaysMs: o.retryDelaysMs })
    // Validate developer keys in the background: an invalid key marks its account invalid and never stops the server.
    if (this.runtime.mode === 'development') void this.accounts.validateAll().catch(() => undefined)
  }

  // ---- providers and connection -----------------------------------------------------------------------

  providers() {
    return this.o.providers.list().map((p) => ({
      id: p.id,
      name: p.displayName,
      description: p.description,
      defaultModel: p.defaultModel,
      methods: p.methods.map((m) => (m.kind === 'api-key' ? { id: m.id, kind: m.kind, label: m.label, keyLabel: m.keyLabel, help: m.help, keyUrl: m.keyUrl } : { id: m.id, kind: m.kind, label: m.label, buttonLabel: m.buttonLabel, help: m.help, manageUsageUrl: m.manageUsageUrl, available: !!this.redirectUri(m) })),
    }))
  }

  private redirectUri(m: AuthMethod): string | null {
    if (m.kind !== 'oauth' || !this.o.publicOrigin) return null
    return m.oauth.loopbackOnly ? loopbackRedirect(this.o.publicOrigin, m.oauth.callbackPath) : `${this.o.publicOrigin.replace(/\/$/, '')}${m.oauth.callbackPath}`
  }

  /** Mock mode disables every real source: connecting a real account would only reach it for validation, so it is refused. */
  private refuseRealAccountInMock(provider: string) {
    if (this.runtime.mode === 'mock' && provider !== 'fake') throw new AssistantError('mock-mode', 'This server runs in mock mode: real AI accounts are disabled and nothing is sent to a provider. Set EWS_AI_MODE=development with a provider key to use real models.', 409)
  }

  private async member(userId: string, projectId: string) {
    if (!(await this.o.roleOf(userId, projectId))) throw new AssistantError('forbidden', `You are not a member of project ${projectId}.`, 403)
  }

  async status(userId: string): Promise<ConnectionStatus | null> {
    const row = await this.store.connection(userId)
    return row ? publicStatus(row) : null
  }

  private pickModel(provider: AssistantProvider, models: { id: string }[], requested?: string): string {
    if (requested) {
      if (models.length && !models.some((m) => m.id === requested)) throw new AssistantError('invalid', `Model “${requested}” is not available to this account.`, 422, { fields: { model: 'not in the account’s model list' } })
      return requested
    }
    return models.some((m) => m.id === provider.defaultModel) || !models.length ? provider.defaultModel : models[0].id
  }

  async connectApiKey(principal: Principal, projectId: string, input: { provider: string; method?: string; apiKey: string; model?: string }): Promise<ConnectionStatus> {
    await this.member(principal.userId, projectId)
    this.refuseRealAccountInMock(input.provider)
    const found = this.o.providers.method(input.provider, input.method ?? 'api-key')
    if (!found || found.method.kind !== 'api-key') throw new AssistantError('invalid', `Provider “${input.provider}” has no API key connection.`, 422)
    const apiKey = String(input.apiKey ?? '').trim()
    if (!apiKey || (found.method.keyPattern && !found.method.keyPattern.test(apiKey))) throw new AssistantError('invalid', `This does not look like a valid ${found.method.keyLabel}. Nothing was stored.`, 422, { fields: { apiKey: 'unexpected format' } })
    let models
    try {
      ;({ models } = await found.provider.validateCredential({ kind: 'api-key', apiKey }, found.method.id, AbortSignal.timeout(20_000)))
    } catch (e) {
      const err = providerFailure(e)
      throw new AssistantError(err.code, `${err.message} Nothing was stored.`, err.status === 502 && (e as ProviderError).kind === 'invalid-credential' ? 422 : err.status, err.details)
    }
    const row = await this.store.saveConnection({
      userId: principal.userId,
      provider: found.provider.id,
      method: found.method.id,
      accountLabel: `${found.provider.displayName}, key ending ${apiKey.slice(-4)}`,
      keyLast4: apiKey.slice(-4),
      secret: { kind: 'api-key', apiKey },
      model: this.pickModel(found.provider, models, input.model),
    })
    await this.o.settings.setConnectionReference(principal.userId, projectId, `assistant:${row.id}`)
    return publicStatus(row)
  }

  /** Starts a provider sign-in; returns the URL the browser opens. */
  async startOAuth(principal: Principal, projectId: string, input: { provider: string; method: string; returnTo?: string }): Promise<{ authorizationUrl: string }> {
    await this.member(principal.userId, projectId)
    this.refuseRealAccountInMock(input.provider)
    const found = this.o.providers.method(input.provider, input.method)
    if (!found || found.method.kind !== 'oauth') throw new AssistantError('invalid', `Provider “${input.provider}” has no sign-in method “${input.method}”.`, 422)
    const redirectUri = this.redirectUri(found.method)
    if (!redirectUri) throw new AssistantError('not-available', `${found.method.label} works only when this application runs locally (its server at http://127.0.0.1). Use an API key instead.`, 409)
    const cfg = found.method.oauth
    const registration = await this.store.registration(principal.userId, found.provider.id)
    const { state, nonce, verifier } = newAttemptSecrets()
    const clientId = registration?.client_id ?? cfg.registrationClientId
    await this.store.saveAttempt({ state, userId: principal.userId, provider: found.provider.id, method: found.method.id, verifier, nonce, redirectUri, returnTo: safeReturnTo(input.returnTo), clientId })
    return {
      authorizationUrl: authorizationUrl(cfg, { clientId, firstRegistration: !registration, hostId: await this.store.hostId(), redirectUri, state, nonce, verifier, idTokenHint: registration?.id_token, loginHint: registration?.account_email ?? undefined }),
    }
  }

  /** Handles the OAuth callback; returns the page outcome. Never throws secrets into messages. */
  async completeOAuth(query: Record<string, string | undefined>, projectId = 'PRJ-ACT100'): Promise<{ ok: boolean; message: string; returnTo: string }> {
    const attempt = query.state ? await this.store.takeAttempt(query.state) : undefined
    if (!attempt) return { ok: false, message: 'This sign-in link expired or was already used. Start again from Settings → AI and reasoning.', returnTo: safeReturnTo(undefined) }
    const found = this.o.providers.method(attempt.provider, attempt.method)
    if (!found || found.method.kind !== 'oauth') return { ok: false, message: 'The provider is no longer available.', returnTo: attempt.returnTo }
    const cfg = found.method.oauth
    if (query.error) return { ok: false, message: query.error === 'access_denied' ? 'Sign-in was cancelled; nothing was connected.' : `The provider reported an error (${query.error}); nothing was connected.`, returnTo: attempt.returnTo }
    if (!query.code) return { ok: false, message: 'The provider returned no authorization code.', returnTo: attempt.returnTo }
    const firstRegistration = attempt.clientId === cfg.registrationClientId
    const clientId = firstRegistration ? query.client_id : attempt.clientId
    if (!clientId || clientId === cfg.registrationClientId) return { ok: false, message: 'Registration did not complete (no client ID returned). Try again.', returnTo: attempt.returnTo }
    if (!firstRegistration && query.client_id && query.client_id !== attempt.clientId) return { ok: false, message: 'The sign-in returned a different app registration; nothing was changed.', returnTo: attempt.returnTo }
    try {
      const tokens = await exchangeCode(this.doFetch, cfg, { clientId, code: query.code, verifier: attempt.verifier, redirectUri: attempt.redirectUri })
      if (!tokens.idToken) throw new OAuthError('no-id-token', 'The provider returned no identity token.')
      const claims = await validateIdToken(this.doFetch, cfg, tokens.idToken, { clientId, nonce: attempt.nonce })
      const previous = await this.store.registration(attempt.userId, found.provider.id)
      if (previous && !firstRegistration && previous.account_subject !== claims.sub) throw new OAuthError('account-mismatch', 'You signed in with a different account than the one registered; nothing was changed.')
      await this.store.saveRegistration(attempt.userId, found.provider.id, claims.sub, claims.email, clientId, tokens.idToken)
      const planEnabled = tokens.scopes.includes(cfg.requiredScope)
      let models: { id: string }[] = []
      if (planEnabled) {
        try {
          models = await found.provider.listModels({ kind: 'oauth', accessToken: tokens.accessToken }, found.method.id, AbortSignal.timeout(20_000))
        } catch {
          models = []
        }
      }
      const row = await this.store.saveConnection({
        userId: attempt.userId,
        provider: found.provider.id,
        method: found.method.id,
        accountLabel: `ChatGPT account ${claims.email ?? claims.name ?? ''}`.trim(),
        accountSubject: claims.sub,
        clientId,
        scopes: tokens.scopes,
        secret: { kind: 'oauth', accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
        accessExpiresAt: tokens.expiresAt,
        model: this.pickModel(found.provider, models),
        status: planEnabled ? 'active' : 'plan-usage-disabled',
      })
      await this.o.settings.setConnectionReference(attempt.userId, projectId, `assistant:${row.id}`).catch(() => undefined)
      return { ok: true, message: planEnabled ? `Connected as ${claims.email ?? 'your ChatGPT account'}.` : 'Signed in, but ChatGPT plan usage was not granted. Enable it by signing in again and allowing plan usage, or connect an API key.', returnTo: attempt.returnTo }
    } catch (e) {
      const message = e instanceof OAuthError ? e.message : 'The sign-in could not be completed.'
      this.o.log?.warn({ code: e instanceof OAuthError ? e.code : 'error' }, 'oauth callback failed')
      return { ok: false, message: `${message} Nothing was connected.`, returnTo: attempt.returnTo }
    }
  }

  /** Decrypted credential for one request; refreshes OAuth access tokens near expiry (serialized). */
  private async credential(row: ConnectionRow): Promise<ProviderCredential> {
    let current = row
    if (current.method !== 'api-key' && current.access_expires_at && current.access_expires_at.getTime() < Date.now() + 120_000) {
      current = await this.refresh(current)
    }
    const secret = this.store.secretOf(current)
    return secret.kind === 'api-key' ? { kind: 'api-key', apiKey: secret.apiKey } : { kind: 'oauth', accessToken: secret.accessToken }
  }

  private refresh(row: ConnectionRow): Promise<ConnectionRow> {
    const pending = this.refreshing.get(row.id)
    if (pending) return pending
    const run = (async () => {
      const found = this.o.providers.method(row.provider, row.method)
      const secret = this.store.secretOf(row)
      if (!found || found.method.kind !== 'oauth' || secret.kind !== 'oauth' || !secret.refreshToken || !row.client_id) throw new ProviderError('invalid-credential', 'Your sign-in expired. Sign in again in Settings → AI and reasoning.')
      try {
        const tokens = await refreshTokens(this.doFetch, found.method.oauth, { clientId: row.client_id, refreshToken: secret.refreshToken })
        return await this.store.updateSecret(row, { ...secret, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }, tokens.expiresAt, tokens.scopes.length ? tokens.scopes : undefined)
      } catch (e) {
        if (e instanceof OAuthError && /invalid_grant|invalid_refresh_token|token_expired|refresh_token/.test(e.code)) {
          await this.store.setStatus(row.id, 'needs-sign-in')
          throw new ProviderError('invalid-credential', 'Your ChatGPT sign-in has expired or was revoked. Sign in again in Settings → AI and reasoning.')
        }
        throw new ProviderError('unavailable', 'The sign-in could not be renewed right now. Try again shortly.')
      }
    })()
    this.refreshing.set(row.id, run)
    return run.finally(() => this.refreshing.delete(row.id))
  }

  private async active(userId: string): Promise<{ row: ConnectionRow; provider: AssistantProvider }> {
    const row = await this.store.connection(userId)
    if (!row) throw new AssistantError('not-connected', 'No AI account is connected. Connect one in Settings → AI and reasoning.', 409)
    const provider = this.o.providers.get(row.provider)
    if (!provider) throw new AssistantError('provider-unavailable', `The provider of your connection (${row.provider}) is not available on this server.`, 409)
    if (row.status === 'needs-sign-in') throw new AssistantError('provider-invalid-credential', 'Your sign-in expired. Sign in again in Settings → AI and reasoning.', 409, { kind: 'invalid-credential' })
    if (row.status === 'plan-usage-disabled') throw new AssistantError('plan-usage-disabled', 'ChatGPT plan usage is not enabled for this sign-in. Sign in again and allow plan usage, or connect an API key.', 409)
    return { row, provider }
  }

  async models(userId: string) {
    const { row, provider } = await this.active(userId)
    try {
      return { current: row.model, models: await provider.listModels(await this.credential(row), row.method, AbortSignal.timeout(20_000)) }
    } catch (e) {
      throw providerFailure(e)
    }
  }

  async setModel(userId: string, model: string): Promise<ConnectionStatus> {
    const { models } = await this.models(userId)
    if (!models.some((m) => m.id === model)) throw new AssistantError('invalid', `Model “${model}” is not available to this account.`, 422, { fields: { model: 'not available' } })
    return publicStatus((await this.store.setModel(userId, model))!)
  }

  async test(userId: string): Promise<{ ok: true; latencyMs: number; models: number }> {
    const { row, provider } = await this.active(userId)
    const started = Date.now()
    try {
      const { models } = await provider.validateCredential(await this.credential(row), row.method, AbortSignal.timeout(20_000))
      await this.store.setStatus(row.id, 'active', true)
      return { ok: true, latencyMs: Date.now() - started, models: models.length }
    } catch (e) {
      throw providerFailure(e)
    }
  }

  /** Revokes (OAuth) and deletes the connection; the issued client registration is kept for a later sign-in. */
  async disconnect(userId: string, projectId: string): Promise<{ disconnected: boolean; revoked?: boolean }> {
    const row = await this.store.connection(userId)
    if (!row) return { disconnected: false }
    let revoked: boolean | undefined
    const found = this.o.providers.method(row.provider, row.method)
    if (found?.method.kind === 'oauth' && row.client_id) {
      const secret = this.store.secretOf(row)
      if (secret.kind === 'oauth' && secret.refreshToken) revoked = await revokeRefreshToken(this.doFetch, found.method.oauth, { clientId: row.client_id, refreshToken: secret.refreshToken })
    }
    await this.store.deleteConnection(userId)
    await this.o.settings.setConnectionReference(userId, projectId, null).catch(() => undefined)
    return { disconnected: true, ...(revoked === undefined ? {} : { revoked }) }
  }

  // ---- image generation credential port (services/visualization) ----------------------------------------

  /**
   * What the person may use for image generation (the visualization service's ImageAccessPort). The connection is
   * described without its secret; `credential()` decrypts it for one adapter call at run time. The settings are the
   * person's effective values within the project limits. A dedicated image-only credential (purpose 'images') can be
   * added later without changing this shape.
   */
  async imageAccess(userId: string, projectId: string) {
    const values = await this.o.settings.effective(userId, projectId)
    // Mock mode disables every real source, the person's connection included (ADR-0080): only a fake-provider connection (the
    // scripted test provider, which the fake image adapter accepts) is honoured.
    const mock = this.runtime.mode === 'mock'
    const found = await this.store.connection(userId)
    const row = mock && found?.provider !== 'fake' ? undefined : found
    const usable = !!row && row.status !== 'needs-sign-in' && row.status !== 'plan-usage-disabled' && !!this.o.providers.get(row.provider)
    const quality = values['ai.images.quality']
    return {
      connection: usable ? { provider: row!.provider, method: row!.method, purpose: 'assistant' as const } : null,
      enabled: values['ai.images.enabled'] === true,
      quality: (quality === 'low' || quality === 'high' ? quality : 'medium') as 'low' | 'medium' | 'high',
      dailyLimit: Number(values['ai.images.daily-limit'] ?? 20),
      credential: async () => {
        const current = await this.store.connection(userId)
        if (!current || (mock && current.provider !== 'fake')) throw new ProviderError('invalid-credential', 'No AI account is connected any more.')
        return this.credential(current)
      },
    }
  }

  // ---- policy, preview, respond ---------------------------------------------------------------------

  async policy(principal: Principal, projectId: string): Promise<AiPolicy> {
    await this.member(principal.userId, projectId)
    return this.rules.policyFromSettings(await this.o.settings.effective(principal.userId, projectId))
  }

  async policyView(principal: Principal, projectId: string) {
    const policy = await this.policy(principal, projectId)
    return {
      policy,
      modules: this.rules.modules.map((m) => ({ id: m.id, label: m.label, description: m.description, prefixes: m.prefixes, names: m.names ?? [], entitlement: m.entitlement ?? null, entitled: !m.entitlement || principal.entitlements.includes(m.entitlement) })),
      entitlements: principal.entitlements,
      operationClasses: OPERATION_CLASSES,
      catalogue: this.rules.catalogue,
    }
  }

  /** Exactly what would be sent to the provider for this request (nothing is sent). */
  async preview(principal: Principal, request: WireRequest) {
    const policy = await this.policy(principal, request.turn.context.projectId)
    const prepared = this.prepare(principal, request, policy)
    const row = await this.store.connection(principal.userId)
    return {
      provider: row?.provider ?? null,
      model: row?.model ?? null,
      instructions: prepared.instructions,
      messages: prepared.messages,
      tools: prepared.tools.map((t) => t.name),
      removedTools: prepared.removed,
      limits: policy.limits,
      sharing: policy.sharing,
    }
  }

  private prepare(principal: Principal, request: WireRequest, policy: AiPolicy) {
    try {
      return prepareRequest(request, policy, principal.entitlements, this.o.vault, principal.userId, this.rules)
    } catch (e) {
      if (e instanceof ForgedResultError) throw new AssistantError('forged-tool-result', e.message, 403)
      throw e
    }
  }

  // ---- routing options, developer status and usage ----------------------------------------------------------

  private listing(evals: Evaluation[], automatic: Evaluation[]) {
    const auto = new Map(automatic.map((e) => [`${e.candidate.accountId}|${e.candidate.model}`, e]))
    return evals.map((e) => {
      const c = e.candidate
      const a = auto.get(`${c.accountId}|${c.model}`)
      return {
        provider: c.provider,
        providerName: c.providerLabel,
        model: c.model,
        label: c.label,
        source: c.source,
        billing: c.billing,
        simulated: c.simulated,
        chatgptPlan: c.chatgptPlan,
        known: c.known,
        ...(c.tier ? { tier: c.tier } : {}),
        /** Selectable in Manual mode. */
        available: e.eligible,
        /** Eligible for the automatic modes. */
        automatic: !!a?.eligible,
        priced: !!e.record && isPriced(e.record),
        verified: e.record?.verified ?? false,
        ...(e.reason ? { reason: e.reason } : {}),
        ...(e.eligible && a && !a.eligible && a.reason ? { reason: a.reason } : {}),
      }
    })
  }

  /** All models the person could use, each with whether it is selectable (Manual) or eligible (automatic), and why not. */
  async routingOptions(principal: Principal, projectId: string) {
    const { routing } = await this.settingsOf(principal, projectId)
    const { handle } = await this.connectionHandle(principal.userId)
    const base = { needTools: true, estimatedInputTokens: 2000, maxOutputTokens: 4000, disallowedProviders: routing.disallowedProviders }
    const manual = await this.gateway.options(handle, { ...base, mode: 'manual' })
    const automatic = await this.gateway.options(handle, { ...base, mode: routing.mode === 'manual' ? 'balanced' : routing.mode, remainingBudget: undefined })
    return {
      aiMode: this.runtime.mode,
      mode: routing.mode,
      modes: ROUTING_MODES.map((m) => ({ value: m.value, label: m.label, description: m.description })),
      disallowedProviders: [...routing.disallowedProviders],
      contextMode: routing.contextMode,
      models: this.listing(manual, automatic),
    }
  }

  /** Developer mode status for the developer panel: providers, last four key characters, validation, models, mode, budget. Never a key. */
  async developerStatus(principal: Principal) {
    if (this.runtime.mode === 'user') throw new AssistantError('not-available', 'Developer and mock modes are not active on this server.', 404)
    void principal
    const base = { needTools: true, estimatedInputTokens: 2000, maxOutputTokens: 4000 }
    const manual = await this.gateway.options(undefined, { ...base, mode: 'manual' })
    const automatic = await this.gateway.options(undefined, { ...base, mode: 'balanced' })
    const rows = this.listing(manual, automatic)
    const budget = this.runtime.mode === 'development' ? await this.gateway.budget().catch(() => null) : null
    return {
      mode: this.runtime.mode,
      billing: this.runtime.billing,
      defaultOptimization: this.runtime.defaultOptimization,
      allowUnverifiedPricing: this.runtime.allowUnverifiedPricing,
      budget,
      meteringDegraded: this.gateway.degraded,
      providers: this.runtime.mode === 'development' ? this.accounts.list().map((a) => ({ ...a, models: rows.filter((r) => r.provider === a.provider) })) : [],
      personas: this.runtime.mode === 'mock' ? rows.filter((r) => r.simulated) : [],
    }
  }

  /** Validates one developer key with the provider's model list (a free call). */
  async validateDeveloperProvider(principal: Principal, provider: string) {
    if (this.runtime.mode !== 'development') throw new AssistantError('not-available', 'Developer keys are used in development mode only.', 404)
    void principal
    if (!this.accounts.get(provider)) throw new AssistantError('not-found', `Unknown provider “${provider}”.`, 404)
    const account = await this.accounts.validate(provider)
    return { provider: account }
  }

  /** The person's own usage from the ledger: one conversation, or by month (real and simulated apart). */
  async usage(principal: Principal, q: { conversationId?: string; period?: 'month' | 'day' }) {
    if (!q.conversationId && !q.period) throw new AssistantError('invalid', 'Give conversationId or period (month or day).', 400)
    const ledger = new UsageLedger(this.o.pool)
    const run = async (simulated: boolean) =>
      (await ledger.aggregate(q.conversationId ? { groupBy: 'conversation', conversationId: q.conversationId, userId: principal.userId, simulated } : { groupBy: 'period', period: q.period, userId: principal.userId, simulated })).map((r) => ({ ...r, simulated }))
    return {
      ...(q.conversationId ? { conversationId: q.conversationId } : { period: q.period }),
      note: 'Costs are estimates from the pricing in force when the request ran, not provider invoices.',
      usage: [...(await run(false)), ...(await run(true))],
      ...(this.runtime.mode === 'development' ? { budget: await this.gateway.budget().catch(() => null) } : {}),
    }
  }

  // ---- model dispatch through the gateway ------------------------------------------------------------------

  /** Effective settings of the person in a project (membership checked): the policy and the routing choices come from them. */
  private async settingsOf(principal: Principal, projectId: string) {
    await this.member(principal.userId, projectId)
    const values = await this.o.settings.effective(principal.userId, projectId)
    return { values, policy: this.rules.policyFromSettings(values), routing: routingFromSettings(values, this.runtime.defaultOptimization) }
  }

  /**
   * The person's own connection as a model source. Mock mode ignores it entirely (it never even reads it), so a test or
   * demonstration run can never reach a person's AI account. An unusable connection is reported as `problem`, which is
   * shown only when nothing else can serve the request.
   */
  private async connectionHandle(userId: string): Promise<{ handle?: UserConnectionHandle; problem?: AssistantError }> {
    if (this.runtime.mode === 'mock') return {}
    const row = await this.store.connection(userId)
    if (!row) return {}
    if (!this.o.providers.get(row.provider)) return { problem: new AssistantError('provider-unavailable', `The provider of your connection (${row.provider}) is not available on this server.`, 409) }
    if (row.status === 'needs-sign-in') return { problem: new AssistantError('provider-invalid-credential', 'Your sign-in expired. Sign in again in Settings → AI and reasoning.', 409, { kind: 'invalid-credential' }) }
    if (row.status === 'plan-usage-disabled') return { problem: new AssistantError('plan-usage-disabled', 'ChatGPT plan usage is not enabled for this sign-in. Sign in again and allow plan usage, or connect an API key.', 409) }
    return { handle: { id: row.id, provider: row.provider, method: row.method, model: row.model, credential: () => this.credential(row) } }
  }

  private notConnected(): AssistantError {
    return new AssistantError(
      'not-connected',
      this.runtime.mode === 'development'
        ? 'No AI model is available. Set a provider key in the server environment (see .env.example), or connect an account in Settings → AI and reasoning.'
        : 'No AI account is connected. Connect one in Settings → AI and reasoning.',
      409,
    )
  }

  /** One gateway call for a person: routing settings, their connection, stickiness and attribution. */
  private async dispatch(
    principal: Principal,
    s: { routing: RoutingSettings; connection: { handle?: UserConnectionHandle; problem?: AssistantError } },
    c: { projectId: string; conversationId?: string; operationId: string; workflowId: string; manual?: { provider?: string; model?: string }; input: Parameters<Gateway['call']>[0]['input']; signal: AbortSignal; cancelSignal?: AbortSignal },
  ): Promise<GatewayResult> {
    try {
      return await this.gateway.call({
        userId: principal.userId,
        projectId: c.projectId,
        conversationId: c.conversationId,
        operationId: c.operationId,
        workflowId: c.workflowId,
        routing: { mode: s.routing.mode, disallowedProviders: s.routing.disallowedProviders, manual: c.manual },
        userConnection: s.connection.handle,
        input: c.input,
        signal: c.signal,
        cancelSignal: c.cancelSignal,
        stickyKey: c.conversationId ? `c:${principal.userId}:${c.conversationId}` : `t:${principal.userId}:${c.projectId}`,
        stickyTtlMs: c.conversationId ? undefined : 15 * 60_000,
      })
    } catch (e) {
      // Nothing could serve the request: say why the person's own connection was not usable, or that nothing is connected.
      if (e instanceof RoutingError && e.code === 'no-model-available' && this.runtime.mode !== 'mock') {
        if (s.connection.problem) throw s.connection.problem
        if (!s.connection.handle) throw this.notConnected()
      }
      throw e
    }
  }

  private async audited<T>(
    principal: Principal,
    track: { target?: { provider: string; method: string; model: string } },
    extra: { projectId?: string; purpose?: string; toolsOffered: number; prompt?: unknown },
    run: () => Promise<{ value: T; output?: RespondOutput; called: string[]; refused: string[]; outcome: 'answer' | 'tool-calls' | 'refused' }>,
  ): Promise<T> {
    const started = Date.now()
    const target = () => track.target ?? { provider: 'none', method: 'none', model: 'none' }
    try {
      const r = await run()
      await this.store
        .audit({ userId: principal.userId, projectId: extra.projectId, provider: target().provider, method: target().method, model: r.output?.model ?? target().model, purpose: extra.purpose, toolsOffered: extra.toolsOffered, toolsCalled: r.called, toolsRefused: r.refused, inputTokens: r.output?.usage?.inputTokens, outputTokens: r.output?.usage?.outputTokens, latencyMs: Date.now() - started, outcome: r.outcome, prompt: extra.prompt })
        .catch((e) => this.o.log?.warn({ err: (e as Error).message }, 'audit write failed'))
      return r.value
    } catch (e) {
      const err = providerFailure(e)
      await this.store
        .audit({ userId: principal.userId, projectId: extra.projectId, provider: target().provider, method: target().method, model: target().model, purpose: extra.purpose, toolsOffered: extra.toolsOffered, toolsCalled: [], toolsRefused: [], latencyMs: Date.now() - started, outcome: 'error', errorCode: err.code, prompt: extra.prompt })
        .catch(() => undefined)
      throw err
    }
  }

  /** One step of the browser's tool-calling loop. */
  async respond(principal: Principal, request: WireRequest, clientSignal?: AbortSignal): Promise<WireResponse> {
    const projectId = request.turn.context.projectId
    const { policy, routing } = await this.settingsOf(principal, projectId)
    const prepared = this.prepare(principal, request, policy)
    const connection = await this.connectionHandle(principal.userId)
    const signal = clientSignal ? AbortSignal.any([clientSignal, AbortSignal.timeout(policy.limits.timeoutSeconds * 1000)]) : AbortSignal.timeout(policy.limits.timeoutSeconds * 1000)
    const meta = (res: GatewayResult, refused: { name: string; reason: string }[]): ResponseMeta => ({ provider: res.target.provider, model: res.output.model ?? res.target.model, method: res.target.method, ...(refused.length ? { refused } : {}), usage: res.usage, routing: res.routing, cost: res.cost })
    const prompt = policy.storePrompts ? { instructions: prepared.instructions, messages: prepared.messages, tools: prepared.tools.map((t) => t.name) } : undefined
    const track: { target?: { provider: string; method: string; model: string } } = {}
    const workflowId = randomUUID()

    return this.audited<WireResponse>(principal, track, { projectId, toolsOffered: prepared.tools.length, prompt }, async () => {
      let messages: ProviderMessage[] = prepared.messages
      const refusedAll: { name: string; reason: string }[] = []
      let last: GatewayResult | undefined
      // A model that only requests refused operations is told so and asked again (at most twice).
      for (let round = 0; round < 3; round++) {
        last = await this.dispatch(principal, { routing, connection }, {
          projectId,
          conversationId: request.turn.conversationId,
          operationId: 'assistant.respond',
          workflowId,
          manual: request.routing,
          input: { instructions: prepared.instructions, messages, tools: prepared.tools, maxOutputTokens: policy.limits.outputTokens },
          signal,
          cancelSignal: clientSignal,
        })
        track.target = last.target
        const out = last.output
        if (out.type === 'final') return { value: { type: 'final', text: out.text, meta: meta(last, refusedAll) }, output: out, called: [], refused: refusedAll.map((r) => r.name), outcome: 'answer' }
        const { allowed, refused } = screenCalls(out, prepared.tools, policy, principal.entitlements, Math.max(0, policy.limits.toolCalls - prepared.callsSoFar), this.rules)
        refusedAll.push(...refused.map((r) => ({ name: r.name, reason: r.reason })))
        if (allowed.length) {
          return {
            value: { type: 'tool_calls', calls: allowed.map((c) => ({ id: signCall(this.o.vault, principal.userId, c.callId, c.name, c.arguments), name: c.name, arguments: c.arguments })), meta: meta(last, refusedAll) },
            output: out,
            called: allowed.map((c) => c.name),
            refused: refusedAll.map((r) => r.name),
            outcome: 'tool-calls',
          }
        }
        messages = [...messages, ...refused.flatMap((c): ProviderMessage[] => [
          { type: 'tool_call', callId: c.callId, name: c.name, arguments: c.arguments },
          { type: 'tool_result', callId: c.callId, name: c.name, output: JSON.stringify({ ok: false, errorCode: 'not-allowed', error: `Refused by the platform: ${c.reason} Nothing was run.` }) },
        ])]
      }
      const text = `The model asked only for operations your AI settings or subscription do not allow (${[...new Set(refusedAll.map((r) => r.name))].join(', ')}). Nothing was run. You can change what the assistant may do in Settings → AI and reasoning.`
      return { value: { type: 'final', text, meta: meta(last!, refusedAll) }, output: last!.output, called: [], refused: refusedAll.map((r) => r.name), outcome: 'refused' }
    })
  }

  /**
   * Server-side model access (for example the design reasoning layer's model gateway): the person's routing choices, the same
   * limits, metering and audit, no tools unless given. Tools are screened like browser calls.
   */
  async complete(principal: Principal, input: { projectId: string; purpose: string; instructions?: string; messages: ProviderMessage[]; tools?: ProviderTool[]; conversationId?: string; workflowId?: string }, signal?: AbortSignal): Promise<RespondOutput> {
    const { policy, routing } = await this.settingsOf(principal, input.projectId)
    const connection = await this.connectionHandle(principal.userId)
    const tools = (input.tools ?? []).filter((t) => screenCalls({ type: 'tool_calls', calls: [{ callId: 'x', name: t.name, arguments: {} }] }, [t], policy, principal.entitlements, 1, this.rules).allowed.length)
    const timeout = AbortSignal.timeout(policy.limits.timeoutSeconds * 1000)
    const track: { target?: { provider: string; method: string; model: string } } = {}
    return this.audited<RespondOutput>(principal, track, { projectId: input.projectId, purpose: input.purpose, toolsOffered: tools.length, prompt: policy.storePrompts ? input : undefined }, async () => {
      const res = await this.dispatch(principal, { routing, connection }, {
        projectId: input.projectId,
        conversationId: input.conversationId,
        operationId: `assistant.complete.${input.purpose}`.slice(0, 120),
        workflowId: input.workflowId ?? randomUUID(),
        input: { instructions: input.instructions ?? INSTRUCTIONS, messages: input.messages, tools, maxOutputTokens: policy.limits.outputTokens },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        cancelSignal: signal,
      })
      track.target = res.target
      const out = res.output
      if (out.type === 'final') return { value: out, output: out, called: [], refused: [], outcome: 'answer' }
      const { allowed, refused } = screenCalls(out, tools, policy, principal.entitlements, policy.limits.toolCalls, this.rules)
      return { value: { ...out, calls: allowed }, output: out, called: allowed.map((c) => c.name), refused: refused.map((r) => r.name), outcome: allowed.length ? 'tool-calls' : 'refused' }
    })
  }
}

/** Return addresses after sign-in: only the local workspace (never an arbitrary site). */
export function safeReturnTo(value: string | undefined): string {
  const fallback = 'http://localhost:5173/workspace/?settings=ai'
  if (!value) return fallback
  try {
    const u = new URL(value)
    if ((u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.pathname.startsWith('/workspace')) return u.toString()
  } catch {
    /* fall back */
  }
  return fallback
}

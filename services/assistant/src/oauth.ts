import { createPublicKey, createVerify, type JsonWebKey } from 'node:crypto'
import { pkceChallenge, randomToken } from './crypto'
import type { OAuthConfig } from './providers/types'

/**
 * OAuth 2.0 authorization code flow with PKCE for provider sign-in (Sign in with ChatGPT, open-source /
 * locally run apps: https://developers.openai.com/siwc/token-sharing-open-source/sign-in). The verifier,
 * nonce and tokens stay on the server; the browser only follows redirects. Tokens are never put in URLs.
 */

export interface TokenSet {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresAt?: Date
  scopes: string[]
}

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'OAuthError'
  }
}

export function authorizationUrl(cfg: OAuthConfig, p: { clientId: string; firstRegistration: boolean; hostId: string; redirectUri: string; state: string; nonce: string; verifier: string; idTokenHint?: string; loginHint?: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    response_type: 'code',
    redirect_uri: p.redirectUri,
    scope: cfg.scopes.join(' '),
    state: p.state,
    nonce: p.nonce,
    code_challenge_method: 'S256',
    code_challenge: pkceChallenge(p.verifier),
    ext_agent_host_id: p.hostId,
  })
  if (cfg.resource) q.set('resource', cfg.resource)
  if (p.firstRegistration) q.set('agent_name_hint', cfg.agentName)
  if (p.idTokenHint) q.set('id_token_hint', p.idTokenHint)
  if (p.loginHint) q.set('login_hint', p.loginHint)
  return `${cfg.authorizationEndpoint}?${q.toString()}`
}

export const newAttemptSecrets = () => ({ state: randomToken(24), nonce: randomToken(24), verifier: randomToken(48) })

function tokenSet(body: { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number; scope?: string }): TokenSet {
  if (!body.access_token) throw new OAuthError('no-token', 'The provider returned no access token.')
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    idToken: body.id_token,
    expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : undefined,
    scopes: (body.scope ?? '').split(/\s+/).filter(Boolean),
  }
}

async function postForm(doFetch: typeof fetch, url: string, form: Record<string, string>): Promise<Response> {
  return doFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(form).toString(), signal: AbortSignal.timeout(20_000) })
}

async function oauthFailure(response: Response): Promise<OAuthError> {
  let code = `http-${response.status}`
  try {
    const b = (await response.json()) as { error?: string | { code?: string }; error_description?: string }
    code = typeof b.error === 'string' ? b.error : (b.error?.code ?? code)
  } catch {
    /* no body */
  }
  return new OAuthError(code, `The provider refused the sign-in (${code}).`)
}

export async function exchangeCode(doFetch: typeof fetch, cfg: OAuthConfig, p: { clientId: string; code: string; verifier: string; redirectUri: string }): Promise<TokenSet> {
  const response = await postForm(doFetch, cfg.tokenEndpoint, { grant_type: 'authorization_code', client_id: p.clientId, code: p.code, code_verifier: p.verifier, redirect_uri: p.redirectUri, ...(cfg.resource ? { resource: cfg.resource } : {}) })
  if (!response.ok) throw await oauthFailure(response)
  return tokenSet(await response.json())
}

export async function refreshTokens(doFetch: typeof fetch, cfg: OAuthConfig, p: { clientId: string; refreshToken: string }): Promise<TokenSet> {
  // Omit scope to keep the grant (Accounts and sessions, "Refreshing tokens").
  const response = await postForm(doFetch, cfg.tokenEndpoint, { grant_type: 'refresh_token', client_id: p.clientId, refresh_token: p.refreshToken, ...(cfg.resource ? { resource: cfg.resource } : {}) })
  if (!response.ok) throw await oauthFailure(response)
  const set = tokenSet(await response.json())
  return { ...set, refreshToken: set.refreshToken ?? p.refreshToken }
}

/** Ends the renewable session. Returns whether the provider confirmed (an empty 200). */
export async function revokeRefreshToken(doFetch: typeof fetch, cfg: OAuthConfig, p: { clientId: string; refreshToken: string }): Promise<boolean> {
  if (!cfg.revocationEndpoint) return false
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await postForm(doFetch, cfg.revocationEndpoint, { token: p.refreshToken, token_type_hint: 'refresh_token', client_id: p.clientId })
      if (r.ok) return true
      if (r.status < 500) return false
    } catch {
      /* retry */
    }
    await new Promise((res) => setTimeout(res, 300 * (attempt + 1)))
  }
  return false
}

// ---- ID token validation (RS256 against the published JWKS) -------------------------------------------

let jwksCache: { uri: string; at: number; keys: (JsonWebKey & { kid?: string })[] } | undefined

const b64json = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))

export interface IdClaims {
  sub: string
  email?: string
  name?: string
}

export async function validateIdToken(doFetch: typeof fetch, cfg: OAuthConfig, idToken: string, expected: { clientId: string; nonce: string }): Promise<IdClaims> {
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new OAuthError('invalid-id-token', 'The sign-in returned a malformed identity token.')
  const header = b64json(parts[0]) as { alg?: string; kid?: string }
  if (header.alg !== 'RS256') throw new OAuthError('invalid-id-token', 'The identity token uses an unexpected signature algorithm.')
  if (!jwksCache || jwksCache.uri !== cfg.jwksUri || Date.now() - jwksCache.at > 3_600_000 || !jwksCache.keys.some((k) => k.kid === header.kid)) {
    const r = await doFetch(cfg.jwksUri, { signal: AbortSignal.timeout(15_000) })
    if (!r.ok) throw new OAuthError('jwks-unavailable', 'The provider’s signing keys could not be loaded.')
    jwksCache = { uri: cfg.jwksUri, at: Date.now(), keys: ((await r.json()) as { keys: (JsonWebKey & { kid?: string })[] }).keys ?? [] }
  }
  const jwk = jwksCache.keys.find((k) => k.kid === header.kid) ?? (jwksCache.keys.length === 1 ? jwksCache.keys[0] : undefined)
  if (!jwk) throw new OAuthError('invalid-id-token', 'The identity token was signed with an unknown key.')
  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${parts[0]}.${parts[1]}`)
  if (!verifier.verify(createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw new OAuthError('invalid-id-token', 'The identity token signature is not valid.')
  const claims = b64json(parts[1]) as { iss?: string; aud?: string | string[]; exp?: number; nonce?: string; sub?: string; email?: string; name?: string }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (claims.iss !== cfg.issuer) throw new OAuthError('invalid-id-token', 'The identity token has an unexpected issuer.')
  if (!audiences.includes(expected.clientId)) throw new OAuthError('invalid-id-token', 'The identity token was issued for another client.')
  if (!claims.exp || claims.exp * 1000 < Date.now() - 60_000) throw new OAuthError('invalid-id-token', 'The identity token has expired.')
  if (claims.nonce !== expected.nonce) throw new OAuthError('invalid-id-token', 'The identity token does not belong to this sign-in attempt.')
  if (!claims.sub) throw new OAuthError('invalid-id-token', 'The identity token has no subject.')
  return { sub: claims.sub, email: claims.email, name: claims.name }
}

/** Only http://127.0.0.1:<port> redirect URIs (loopback flows; never `localhost`). */
export function loopbackRedirect(apiOrigin: string, path: string): string | null {
  try {
    const u = new URL(apiOrigin)
    if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1') return null
    return `http://127.0.0.1:${u.port || '80'}${path}`
  } catch {
    return null
  }
}

/** Test hook: forget cached signing keys. */
export function resetJwksCache() {
  jwksCache = undefined
}

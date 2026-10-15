import { createSign, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { authorizationUrl, loopbackRedirect, newAttemptSecrets, resetJwksCache, validateIdToken } from './oauth'
import { pkceChallenge } from './crypto'
import { createOpenAIProvider } from './providers/openai'

const method = createOpenAIProvider({ chatgptSignIn: true }).methods[0]
if (method.kind !== 'oauth') throw new Error('expected oauth')
const cfg = method.oauth

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }
const jwksFetch = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as unknown as typeof fetch

function idToken(claims: Record<string, unknown>) {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const head = enc({ alg: 'RS256', kid: 'k1', typ: 'JWT' })
  const body = enc(claims)
  const s = createSign('RSA-SHA256')
  s.update(`${head}.${body}`)
  return `${head}.${body}.${s.sign(privateKey).toString('base64url')}`
}

describe('Sign in with ChatGPT (OAuth, PKCE)', () => {
  it('builds the documented authorization request', () => {
    const { state, nonce, verifier } = newAttemptSecrets()
    const url = new URL(authorizationUrl(cfg, { clientId: 'dynamic_agent_client', firstRegistration: true, hostId: 'urn:uuid:1', redirectUri: 'http://127.0.0.1:8801/auth/callback', state, nonce, verifier }))
    expect(url.origin + url.pathname).toBe('https://auth.openai.com/api/accounts/authorize')
    const q = url.searchParams
    expect(q.get('client_id')).toBe('dynamic_agent_client')
    expect(q.get('agent_name_hint')).toBe('Engineering Workspace')
    expect(q.get('ext_agent_host_id')).toBe('urn:uuid:1')
    expect(q.get('scope')).toBe('openid profile email offline_access resource.invoke chatgpt.tokens.use.direct')
    expect(q.get('resource')).toBe('https://api.openai.com/v1')
    expect(q.get('code_challenge_method')).toBe('S256')
    expect(q.get('code_challenge')).toBe(pkceChallenge(verifier))
    expect(q.get('response_type')).toBe('code')
    const again = new URL(authorizationUrl(cfg, { clientId: 'oaiapp_1', firstRegistration: false, hostId: 'urn:uuid:1', redirectUri: 'http://127.0.0.1:8801/auth/callback', state, nonce, verifier, idTokenHint: 'tok' }))
    expect(again.searchParams.get('agent_name_hint')).toBeNull()
    expect(again.searchParams.get('id_token_hint')).toBe('tok')
  })

  it('uses loopback redirects on 127.0.0.1 only', () => {
    expect(loopbackRedirect('http://127.0.0.1:8801', '/auth/callback')).toBe('http://127.0.0.1:8801/auth/callback')
    expect(loopbackRedirect('http://localhost:8801', '/auth/callback')).toBeNull()
    expect(loopbackRedirect('https://example.com', '/auth/callback')).toBeNull()
  })

  it('validates the ID token signature, issuer, audience, expiry and nonce', async () => {
    resetJwksCache()
    const good = { iss: 'https://auth.openai.com', aud: 'oaiapp_1', exp: Math.floor(Date.now() / 1000) + 600, nonce: 'n1', sub: 'user-1', email: 'owner@example.com' }
    await expect(validateIdToken(jwksFetch, cfg, idToken(good), { clientId: 'oaiapp_1', nonce: 'n1' })).resolves.toMatchObject({ sub: 'user-1', email: 'owner@example.com' })
    await expect(validateIdToken(jwksFetch, cfg, idToken(good), { clientId: 'oaiapp_2', nonce: 'n1' })).rejects.toThrow(/another client/)
    await expect(validateIdToken(jwksFetch, cfg, idToken(good), { clientId: 'oaiapp_1', nonce: 'n2' })).rejects.toThrow(/attempt/)
    await expect(validateIdToken(jwksFetch, cfg, idToken({ ...good, iss: 'https://evil' }), { clientId: 'oaiapp_1', nonce: 'n1' })).rejects.toThrow(/issuer/)
    await expect(validateIdToken(jwksFetch, cfg, idToken({ ...good, exp: 1 }), { clientId: 'oaiapp_1', nonce: 'n1' })).rejects.toThrow(/expired/)
    const forged = idToken(good).split('.')
    forged[1] = Buffer.from(JSON.stringify({ ...good, sub: 'attacker' })).toString('base64url')
    await expect(validateIdToken(jwksFetch, cfg, forged.join('.'), { clientId: 'oaiapp_1', nonce: 'n1' })).rejects.toThrow(/signature/)
  })
})

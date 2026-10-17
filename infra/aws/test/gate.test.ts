import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GATE_FUNCTION_FILE } from '../lib/edge-stack'

// Runs functions/gate.js (the CloudFront Function) with a fake Key Value Store: the `import cf from 'cloudfront'` line is replaced
// by a stub and require('crypto') is Node's. The password used here exists only in this test.
type Reply = { statusCode?: number; headers?: Record<string, { value: string }>; uri?: string }
function load(kvValue: string | undefined | 'throw') {
  let source = readFileSync(GATE_FUNCTION_FILE, 'utf8')
  source = source.replace("import cf from 'cloudfront'", 'const cf = __cf')
  const cf = { kvs: () => ({ get: async () => { if (kvValue === 'throw') throw new Error('KeyNotFound'); if (kvValue === undefined) throw new Error('KeyNotFound'); return kvValue } }) }
  const factory = new Function('__cf', 'require', `${source}\nreturn handler`)
  return factory(cf, (name: string) => { if (name !== 'crypto') throw new Error(name); return { createHash } }) as (e: unknown) => Promise<Reply>
}
const entry = (salt: string, user: string, password: string) => `${salt}$${createHash('sha256').update(salt + Buffer.from(`${user}:${password}`).toString('base64')).digest('hex')}`
const basic = (user: string, password: string) => ({ authorization: { value: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` } })
const req = (uri: string, headers: Record<string, { value: string }> = {}) => ({ request: { uri, method: 'GET', headers, querystring: {}, cookies: {} } })

describe('gate.js', () => {
  const good = entry('0a1b2c3d4e5f6071', 'ews', 'a long test passphrase')

  it('fails closed with 503 when the store has no entry', async () => {
    expect((await load(undefined)({ ...req('/workspace/', basic('ews', 'x')) })).statusCode).toBe(503)
    expect((await load('')(req('/'))).statusCode).toBe(503)
    expect((await load('garbage')(req('/'))).statusCode).toBe(503)
  })

  it('challenges a request without credentials, and rejects a wrong password', async () => {
    const h = load(good)
    const r = await h(req('/workspace/'))
    expect(r.statusCode).toBe(401)
    expect(r.headers?.['www-authenticate']?.value).toMatch(/^Basic realm=/)
    expect((await h(req('/workspace/', basic('ews', 'wrong passphrase')))).statusCode).toBe(401)
    expect((await h(req('/api/health', basic('other', 'a long test passphrase')))).statusCode).toBe(401)
    expect((await h(req('/workspace/', { authorization: { value: 'Bearer abc' } }))).statusCode).toBe(401)
  })

  it('accepts the right credential, and either of two entries during a rotation', async () => {
    const next = entry('ffeeddccbbaa9988', 'ews', 'the next passphrase')
    const h = load(`${good}\n${next}`)
    expect((await h(req('/workspace/index.html', basic('ews', 'a long test passphrase')))).uri).toBe('/workspace/index.html')
    expect((await h(req('/workspace/index.html', basic('ews', 'the next passphrase')))).uri).toBe('/workspace/index.html')
    expect((await h(req('/workspace/index.html', basic('ews', 'a third one')))).statusCode).toBe(401)
  })

  it('redirects / to /workspace/ and routes single-page paths after the gate', async () => {
    const h = load(good)
    const auth = basic('ews', 'a long test passphrase')
    const root = await h(req('/', auth))
    expect(root.statusCode).toBe(302)
    expect(root.headers?.location?.value).toBe('/workspace/')
    expect((await h(req('/', {}))).statusCode).toBe(401) // the redirect is behind the gate too
    expect((await h(req('/workspace', auth))).headers?.location?.value).toBe('/workspace/')
    expect((await h(req('/viewer', auth))).headers?.location?.value).toBe('/viewer/')
    expect((await h(req('/workspace/', auth))).uri).toBe('/workspace/index.html')
    expect((await h(req('/viewer/', auth))).uri).toBe('/viewer/index.html')
    expect((await h(req('/workspace/some/route', auth))).uri).toBe('/workspace/index.html')
    expect((await h(req('/workspace/assets/app-1a2b.js', auth))).uri).toBe('/workspace/assets/app-1a2b.js')
    expect((await h(req('/api/platform/v1/me', auth))).uri).toBe('/api/platform/v1/me')
  })

  it('contains no credential or hash', () => {
    const source = readFileSync(GATE_FUNCTION_FILE, 'utf8')
    expect(source).not.toMatch(/[0-9a-f]{32,}/i)
  })
})

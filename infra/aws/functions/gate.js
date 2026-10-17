// CloudFront Function (viewer request, runtime cloudfront-js-2.0): the dev site's shared password gate and URL routing.
//
// The credential never appears in this file or in the CloudFormation template. The Key Value Store `ews-dev-gate` holds one key,
// `gate`, whose value is one or more entries separated by a newline or a comma. Each entry is `<salt>$<sha256 hex>`, where the hash
// is SHA-256 over <salt> followed by the base64 text a browser sends after "Basic " (the base64 of "user:password").
// `npm run gate:hash` (infra/aws/scripts/gate-hash.mjs) prints an entry without echoing the password. Two entries may exist at
// once, which allows a rotation without an outage. With no entry the gate fails closed (503).
//
// After the gate: "/" redirects to /workspace/ (owner decision 1); a path ending in "/" gets index.html; extension-less paths under
// /workspace or /viewer fall back to that application's index.html (single-page apps); /api/* passes through unchanged.
import cf from 'cloudfront'
const crypto = require('crypto')
const kvs = cf.kvs()

function reply(status, description, body, extraHeaders) {
  const headers = { 'cache-control': { value: 'no-store' }, 'content-type': { value: 'text/plain; charset=utf-8' } }
  for (const k in extraHeaders || {}) headers[k] = { value: extraHeaders[k] }
  return { statusCode: status, statusDescription: description, headers, body: { encoding: 'text', data: body } }
}

function redirect(location) {
  return { statusCode: 302, statusDescription: 'Found', headers: { location: { value: location }, 'cache-control': { value: 'no-store' } } }
}

function same(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function handler(event) {
  const request = event.request

  let entries = ''
  try {
    entries = await kvs.get('gate')
  } catch (e) {
    entries = ''
  }
  const list = String(entries || '').split(/[\n,]/).map((s) => s.trim()).filter((s) => s.indexOf('$') > 0)
  if (list.length === 0) return reply(503, 'Service Unavailable', 'The access gate is not configured.')

  const header = request.headers.authorization
  const value = header && header.value ? header.value : ''
  if (value.slice(0, 6).toLowerCase() !== 'basic ') return reply(401, 'Unauthorized', 'Authentication required.', { 'www-authenticate': 'Basic realm="EWS dev", charset="UTF-8"' })
  const supplied = value.slice(6).trim()

  let ok = false
  for (const entry of list) {
    const at = entry.indexOf('$')
    const salt = entry.slice(0, at)
    const expected = entry.slice(at + 1).toLowerCase()
    const actual = crypto.createHash('sha256').update(salt + supplied).digest('hex')
    if (same(actual, expected)) ok = true
  }
  if (!ok) return reply(401, 'Unauthorized', 'Authentication required.', { 'www-authenticate': 'Basic realm="EWS dev", charset="UTF-8"' })

  const uri = request.uri
  if (uri === '/') return redirect('/workspace/')
  if (uri === '/workspace' || uri === '/viewer') return redirect(uri + '/')
  if (uri.indexOf('/api/') === 0) return request
  if (uri.charAt(uri.length - 1) === '/') {
    request.uri = uri + 'index.html'
    return request
  }
  const last = uri.slice(uri.lastIndexOf('/') + 1)
  if (last.indexOf('.') < 0) {
    if (uri.indexOf('/workspace/') === 0) request.uri = '/workspace/index.html'
    else if (uri.indexOf('/viewer/') === 0) request.uri = '/viewer/index.html'
  }
  return request
}

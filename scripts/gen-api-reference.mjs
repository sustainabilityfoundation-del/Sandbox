/** Generate references from the actual host's OpenAPI routes, without an HTTP listener.
 * Visualization's route registry is private to its plugin, so use the same disposable
 * embedded database / in-process host approach as services/api/test for all services.
 */
import { register } from 'tsx/esm/api'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'

register()
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)
const output = join(root, 'docs/reference')
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0
const escape = (value) => String(value ?? '').replace(/\|/g, '&#124;').replace(/[\r\n]+/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'])

function dereference(value, document) {
  if (!value?.$ref?.startsWith('#/')) return value
  return value.$ref.slice(2).split('/').reduce((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], document) ?? value
}

function schemaName(schema) {
  if (!schema) return 'unspecified'
  if (schema.$ref) return schema.$ref.split('/').at(-1)
  if (schema.title || schema.$id) return schema.title ?? schema.$id
  if (schema.items) return `array<${schemaName(schema.items)}>`
  for (const union of ['oneOf', 'anyOf', 'allOf']) {
    if (schema[union]) return `${union}(${schema[union].map(schemaName).sort(compare).join(', ')})`
  }
  return `${Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type ?? 'schema'} (inline)`
}

function contentNames(value, document) {
  const resolved = dereference(value, document)
  const content = resolved?.content ?? {}
  return Object.keys(content).sort(compare).map(type => `${type}: ${schemaName(content[type].schema)}`).join('; ') || 'none'
}

function render(document) {
  if (!document.info?.title || !document.paths) throw new Error('Invalid OpenAPI document')
  const groups = new Map()
  for (const path of Object.keys(document.paths).sort(compare)) {
    const item = dereference(document.paths[path], document)
    for (const method of Object.keys(item).filter(key => methods.has(key)).sort(compare)) {
      const operation = item[method]
      for (const tag of [...new Set(operation.tags?.length ? operation.tags : ['Untagged'])].sort(compare)) {
        if (!groups.has(tag)) groups.set(tag, [])
        const responses = Object.keys(operation.responses ?? {}).sort(compare).map(status => `${status}: ${contentNames(operation.responses[status], document)}`).join('; ')
        groups.get(tag).push(`| ${method.toUpperCase()} | ${escape(path)} | ${escape(operation.operationId || 'not specified')} | ${escape(operation.summary || '')} | ${escape(contentNames(operation.requestBody, document))} | ${escape(responses || 'not specified')} |`)
      }
    }
  }
  if (!groups.size) throw new Error(`${document.info.title}: no operations`)
  const lines = ['Generated from OpenAPI by scripts/gen-api-reference.mjs; do not edit', '', `# ${escape(document.info.title)}`, '', `Base path: ${(document.servers ?? []).map(server => escape(server.url)).sort(compare).join(', ') || '/'}`, '']
  for (const tag of [...groups.keys()].sort(compare)) {
    lines.push(`## ${escape(tag)}`, '', '| Method | Path | operationId | Summary | Request body schema | Response schemas |', '| --- | --- | --- | --- | --- | --- |', ...groups.get(tag), '')
  }
  return lines.join('\n')
}

async function freePort() {
  const socket = createServer()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const port = socket.address().port
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()))
  return port
}

// No environment connection URLs, persisted credentials or real provider adapters.
const denyFetch = async () => { throw new Error('External requests disabled during API reference generation') }
globalThis.fetch = denyFetch
const [{ default: pg }, { startEmbedded, ensureDatabase }, { buildServer, prepareDatabase }, { memoryObjectStorage }, { ProviderRegistry }, { AdapterRegistry }] = await Promise.all([
  import('pg'), import('../services/api/src/database.ts'), import('../services/api/src/server.ts'),
  import('@ews/requirements-service'), import('@ews/assistant-service'), import('@ews/visualization-service'),
])
const directory = await mkdtemp(join(tmpdir(), 'ews-api-reference-'))
let embedded, pool, server
// Preserve failures despite embedded-postgres's async exit hook (same guard as DB tests).
process.on('beforeExit', () => {
  const code = process.exitCode
  if (code) process.once('exit', () => { process.exitCode = code })
})
try {
  embedded = await startEmbedded({ port: await freePort(), dataDir: join(directory, 'data'), user: 'postgres', password: 'docs-local-only', persistent: false }, () => {})
  await ensureDatabase(embedded.adminUrl, 'api_reference')
  const url = new URL(embedded.adminUrl)
  url.pathname = '/api_reference'
  pool = new pg.Pool({ connectionString: url.toString() })
  await prepareDatabase(pool, { seed: false })
  server = await buildServer({ pool, storage: memoryObjectStorage(), production: false,
    assistant: { providers: new ProviderRegistry(), fetch: denyFetch },
    visualization: { adapters: new AdapterRegistry({ production: false }), fetch: denyFetch },
  })
  // Read the host's registrations so adding a hosted OpenAPI endpoint cannot silently be omitted.
  const source = await readFile(join(root, 'services/api/src/server.ts'), 'utf8')
  const registrations = [...source.matchAll(/registerApiDocs\(app, \{ path: `\$\{(\w+)\}\/docs`/g)].map(match => match[1])
  const modules = await Promise.all(['requirements', 'conceptualize', 'sysml', 'cad', 'projects', 'settings', 'assistant', 'visualization'].map(name => import(`@ews/${name}-service`)))
  const exports = Object.assign({}, ...modules)
  // Requirements and Conceptualize both export a BASE_PATH; use the host's exact alias.
  exports.BASE_PATH = modules[0].BASE_PATH
  const documents = []
  for (const constant of [...new Set(registrations)].sort(compare)) {
    const base = exports[constant]
    if (typeof base !== 'string') throw new Error(`Missing base path export: ${constant}`)
    const response = await server.app.inject({ method: 'GET', url: `${base}/openapi.json` })
    if (response.statusCode !== 200) throw new Error(`${base}: OpenAPI returned ${response.statusCode}`)
    const document = response.json()
    const filename = `${base.split('/').filter(Boolean).slice(1, -1).join('-')}.md`
    documents.push({ filename, text: render(document) })
  }
  if (!documents.length) throw new Error('No hosted OpenAPI registrations found')
  if (new Set(documents.map(doc => doc.filename)).size !== documents.length) throw new Error('Duplicate output filenames')
  await mkdir(output, { recursive: true })
  for (const document of documents.sort((a, b) => compare(a.filename, b.filename))) {
    await writeFile(join(output, document.filename), document.text)
    console.log(`Generated docs/reference/${document.filename}`)
  }
} catch (error) {
  process.exitCode = 1
  console.error(error)
} finally {
  try { await server?.close() }
  finally {
    try { await pool?.end() }
    finally {
      try { await embedded?.stop() }
      finally { await rm(directory, { recursive: true, force: true }) }
    }
  }
}

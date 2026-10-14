// npm run req:reqif:schemas — downloads the official ReqIF schemas (OMG) and the W3C schemas they
// import into .data/reqif-schemas/ (gitignored). The OMG licence allows building software on the
// specification but not reposting it, so the files are not committed. Checksums are pinned in
// packages/reqif/schemas.lock.json; a changed upstream file is refused.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..', '..', '..')
const out = resolve(repo, process.env.REQIF_SCHEMA_DIR ?? '.data/reqif-schemas')
const lockFile = join(here, '..', 'schemas.lock.json')
const ROOT = 'https://www.omg.org/spec/ReqIF/20110401/reqif.xsd'

const lock: Record<string, { file: string; sha256: string }> = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, 'utf8')).files : {}
const seen = new Map<string, string>() // url -> local file name

function localName(url: string): string {
  const base = url.split('/').pop()!
  // Unique per URL (two different xml.xsd versions exist); flat directory for xmllint.
  return url.includes('omg.org') ? `omg-${url.split('/').slice(-2).join('-')}` : url.includes('xhtml-modularization') ? base : `w3-${url.split('/').slice(-3).join('-')}`
}

async function fetchSchema(url: string): Promise<string> {
  const norm = url.replace(/^http:/, 'https:')
  if (seen.has(norm)) return seen.get(norm)!
  const file = localName(norm)
  seen.set(norm, file)
  const res = await fetch(norm, { headers: { 'User-Agent': 'ews-reqif-schema-fetch (engineering platform; build-time schema download)' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`${norm}: HTTP ${res.status}`)
  const text = (await res.text()).replace(/\r\n/g, '\n')
  const sha256 = createHash('sha256').update(text).digest('hex')
  const pinned = lock[norm]
  if (pinned && pinned.sha256 !== sha256) throw new Error(`${norm} changed upstream (sha256 ${sha256}, pinned ${pinned.sha256}). Review it, then update schemas.lock.json.`)
  lock[norm] = { file, sha256 }
  // Rewrite schemaLocation references (outside comments) to local files, fetching them first.
  const withoutComments = text.replace(/<!--[\s\S]*?-->/g, '')
  const refs = [...withoutComments.matchAll(/schemaLocation="([^"]+)"/g)].map((m) => m[1])
  let rewritten = text
  for (const ref of new Set(refs)) {
    const abs = new URL(ref, norm).toString()
    const local = await fetchSchema(abs)
    rewritten = rewritten.split(`schemaLocation="${ref}"`).join(`schemaLocation="${local}"`)
  }
  writeFileSync(join(out, file), rewritten)
  console.log(`${file}  ${sha256.slice(0, 16)}…  ${norm}`)
  return file
}

mkdirSync(out, { recursive: true })
const root = await fetchSchema(ROOT)
writeFileSync(lockFile, JSON.stringify({ note: 'SHA-256 of downloaded schema files (CRLF normalised). Files are fetched by npm run req:reqif:schemas and are not committed.', root, files: Object.fromEntries(Object.entries(lock).sort()) }, null, 2) + '\n')
console.log(`\n${seen.size} schema files in ${out}; entry point ${root}`)

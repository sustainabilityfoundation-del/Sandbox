/**
 * Fetches the official SysML v2 release corpus (examples, training models, standard library) for the
 * official-corpus conformance harness (packages/sysml-core/test/official.test.ts).
 *
 *   npx tsx packages/sysml-core/scripts/fetch-official.ts [tag]
 *
 * Only release tags 2026-04 and later are accepted: from 2026-04 the KerML/SysML models in
 * Systems-Modeling/SysML-v2-Release are licensed EPL-2.0; earlier tags are LGPL-3.0 and must not be
 * used. Files land in <repo>/.data/sysml-release/<tag>/ (git-ignored) and are never committed.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'

const REPO = 'Systems-Modeling/SysML-v2-Release'
const MIN_TAG = '2026-04'
const TAG_PATTERN = /^(\d{4})-(\d{2})(?:\.(\d+))?$/
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/** Compares release tags of the form YYYY-MM or YYYY-MM.N. */
function compareTags(a: string, b: string): number {
  const pa = TAG_PATTERN.exec(a)
  const pb = TAG_PATTERN.exec(b)
  if (!pa || !pb) throw new Error(`Not a release tag: ${!pa ? a : b}`)
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i] ?? 0) - Number(pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

async function listTags(): Promise<string[]> {
  const tags: string[] = []
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/tags?per_page=100&page=${page}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'sysml-core-fetch-official' } })
    if (!res.ok) throw new Error(`GitHub API returned ${res.status} ${res.statusText} when listing tags.`)
    const body = (await res.json()) as Array<{ name?: unknown }>
    for (const t of body) if (typeof t.name === 'string' && TAG_PATTERN.test(t.name)) tags.push(t.name)
    if (body.length < 100) break
  }
  return tags.sort(compareTags)
}

/** Maps an archive path (without the top-level folder) to its output path, or undefined to skip it. */
function selectPath(rel: string, libraryDirs: Set<string>): string | undefined {
  if (rel.endsWith('/')) return undefined
  if (/^(LICENSE|README)[^/]*$/i.test(rel)) return rel
  if (rel.startsWith('sysml/src/examples/') || rel.startsWith('sysml/src/training/')) return rel
  for (const lib of libraryDirs) if (rel.startsWith(`${lib}/`)) return rel
  return undefined
}

async function main(): Promise<void> {
  const requested = process.argv[2]
  if (requested !== undefined && !TAG_PATTERN.test(requested)) throw new Error(`“${requested}” is not a release tag (expected YYYY-MM or YYYY-MM.N).`)
  if (requested !== undefined && compareTags(requested, MIN_TAG) < 0) {
    throw new Error(`Refusing tag ${requested}: releases before ${MIN_TAG} of ${REPO} are licensed LGPL-3.0, which this project does not accept. From ${MIN_TAG} the KerML/SysML models are licensed EPL-2.0; use a tag ${MIN_TAG} or later.`)
  }
  const tags = await listTags()
  const eligible = tags.filter((t) => compareTags(t, MIN_TAG) >= 0)
  const tag = requested ?? eligible.at(-1)
  if (!tag) throw new Error(`No release tag ${MIN_TAG} or later found in ${REPO}.`)
  if (!tags.includes(tag)) throw new Error(`Tag ${tag} does not exist in ${REPO} (known eligible tags: ${eligible.join(', ')}).`)

  const url = `https://codeload.github.com/${REPO}/zip/refs/tags/${tag}`
  console.log(`Downloading ${url} …`)
  const res = await fetch(url, { headers: { 'User-Agent': 'sysml-core-fetch-official' } })
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`)
  const zip = new Uint8Array(await res.arrayBuffer())
  console.log(`Downloaded ${(zip.length / 1e6).toFixed(1)} MB.`)

  // First pass: list entries (no decompression) to find the top-level folder and library folders.
  const names: string[] = []
  unzipSync(zip, { filter: (f) => (names.push(f.name), false) })
  const top = names[0]?.split('/')[0]
  if (!top) throw new Error('Empty archive.')
  const rels = names.filter((n) => n.startsWith(`${top}/`)).map((n) => n.slice(top.length + 1))
  const libraryDirs = new Set<string>()
  for (const r of rels) {
    const first = r.split('/')[0]
    if (/library/i.test(first) && r.includes('/') && r.endsWith('.sysml')) libraryDirs.add(first)
  }
  if (libraryDirs.size === 0) throw new Error(`No library folder found at the top level of the archive (top-level entries: ${[...new Set(rels.map((r) => r.split('/')[0]))].join(', ')}).`)

  const files = unzipSync(zip, { filter: (f) => f.name.startsWith(`${top}/`) && selectPath(f.name.slice(top.length + 1), libraryDirs) !== undefined })
  const outDir = join(repoRoot, '.data', 'sysml-release', tag)
  rmSync(outDir, { recursive: true, force: true })
  const counts: Record<string, { files: number; sysml: number; kerml: number }> = {}
  let readme = ''
  for (const [name, data] of Object.entries(files)) {
    const rel = name.slice(top.length + 1)
    const target = join(outDir, ...rel.split('/'))
    if (!target.startsWith(outDir)) throw new Error(`Unsafe archive path: ${name}`)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, data)
    if (/^README[^/]*\.md$/i.test(rel)) readme += new TextDecoder().decode(data) + '\n'
    const group = rel.startsWith('sysml/src/examples/') ? 'examples' : rel.startsWith('sysml/src/training/') ? 'training' : rel.includes('/') ? rel.split('/')[0] : 'root'
    const c = (counts[group] ??= { files: 0, sysml: 0, kerml: 0 })
    c.files++
    if (rel.endsWith('.sysml')) c.sysml++
    if (rel.endsWith('.kerml')) c.kerml++
  }

  const licenceLines = readme.split(/\r?\n/).filter((l) => /licen[cs]|EPL|Eclipse Public|LGPL|copyright/i.test(l)).map((l) => l.trim()).filter(Boolean)
  if (!licenceLines.some((l) => /EPL|Eclipse Public/i.test(l))) console.warn('WARNING: the README does not mention EPL-2.0; check the licence before using these files.')
  const manifest = { tag, repository: `https://github.com/${REPO}`, url, retrievedAt: new Date().toISOString(), licenceStatement: licenceLines, libraryFolders: [...libraryDirs], counts }
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`Extracted ${Object.keys(files).length} files into ${outDir}`)
  console.log(JSON.stringify(counts, null, 2))
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

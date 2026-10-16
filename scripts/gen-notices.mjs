// Generates apps/workspace/public/THIRD_PARTY_NOTICES.txt (shipped as dist/workspace/THIRD_PARTY_NOTICES.txt).
//
//   npm run notices           write the file
//   npm run notices -- --check   fail if the committed file is out of date
//
// Which packages ship to the browser is decided from the real production build of @ews/workspace
// (vite build, nothing written): every node_modules package whose modules or assets end up in an
// output chunk, plus the dependency closure of the packages that run inside the CAD kernel worker
// (the worker is built separately by Vite, so its modules are not listed in the main bundle).
// Licence and NOTICE texts are copied verbatim from the installed package files; nothing is written
// from memory. A package without a licence file stops the script (add a documented override below).
// The hand-written replicad / Open CASCADE section lives in scripts/notices/replicad-occt.txt and is
// emitted unchanged at the top.
import { build } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outFile = path.join(repo, 'apps/workspace/public/THIRD_PARTY_NOTICES.txt')
const baseFile = path.join(repo, 'scripts/notices/replicad-occt.txt')
const WORKER_ROOTS = ['replicad'] // runs in packages/cad-kernel's worker
const COVERED_BY_BASE = new Set(['replicad', 'replicad-opencascadejs']) // section kept as written
const EOL = '\r\n'

const readPkg = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))

// 1. Packages in the production bundle.
const wsRoot = path.join(repo, 'apps/workspace')
const result = await build({
  root: wsRoot,
  configFile: path.join(wsRoot, 'vite.config.ts'),
  logLevel: 'silent',
  build: { write: false, outDir: path.join(repo, 'node_modules/.cache/notices-build') },
})
const dirs = new Map() // package name -> directory
const found = (id) => {
  const norm = id.replace(/\\/g, '/')
  const i = norm.lastIndexOf('/node_modules/')
  const rel = i >= 0 ? norm.slice(i + '/node_modules/'.length) : norm.startsWith('../') ? norm.replace(/^(\.\.\/)+/, '') : ''
  const m = rel.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)\//) // relative ids such as ../../node_modules/x/...
  const name = m ? m[1] : (rel.match(/^((?:@[^/]+\/)?[^/]+)\//) ?? [])[1]
  if (!name || (i < 0 && !m)) return
  const dir = path.join(repo, 'node_modules', name)
  if (fs.existsSync(path.join(dir, 'package.json'))) dirs.set(name, dir)
}
for (const o of (Array.isArray(result) ? result : [result]).flatMap((r) => r.output)) {
  for (const id of o.type === 'chunk' ? Object.keys(o.modules) : (o.originalFileNames ?? [])) found(id)
}
// 2. Worker closure.
const locate = (name, from) => {
  for (let d = from; ; d = path.dirname(d)) {
    const c = path.join(d, 'node_modules', name)
    if (fs.existsSync(path.join(c, 'package.json'))) return c
    if (path.dirname(d) === d) throw new Error(`package not found: ${name}`)
  }
}
const seen = new Set()
const addClosure = (name, from = repo) => {
  const dir = locate(name, from)
  if (seen.has(dir)) return
  seen.add(dir)
  dirs.set(name, dir)
  for (const dep of Object.keys(readPkg(dir).dependencies ?? {})) addClosure(dep, dir)
}
for (const r of WORKER_ROOTS) addClosure(r)
for (const n of [...dirs.keys()]) if (n.startsWith('@ews/') || n.startsWith('@types/')) dirs.delete(n) // own code; type-only packages

// 3. Collect licence data.
const LIC_FILE = /^(licen[cs]e|copying|unlicense)([-._].*)?$/i
const NOTICE_FILE = /^notice(\..*)?$/i
const pkgs = []
const problems = []
const declaredOnly = []
for (const [name, dir] of [...dirs].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (COVERED_BY_BASE.has(name)) continue
  const pj = readPkg(dir)
  const files = fs.readdirSync(dir)
  const lic = files.filter((f) => LIC_FILE.test(f)).map((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim())
  const notices = files.filter((f) => NOTICE_FILE.test(f)).map((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim())
  const spdx = typeof pj.license === 'string' ? pj.license : (pj.license?.type ?? 'UNKNOWN')
  if (!lic.length) {
    // Only a declared licence (package.json) and no text: acceptable for permissive licences, listed apart.
    if (/^(MIT|ISC)$/.test(spdx)) declaredOnly.push({ name, version: pj.version, spdx, author: typeof pj.author === 'string' ? pj.author : (pj.author?.name ?? '') })
    else problems.push(`${name}@${pj.version}: no licence file in the package`)
    continue
  }
  const repoUrl = (typeof pj.repository === 'string' ? pj.repository : pj.repository?.url ?? pj.homepage ?? '').replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://')
  pkgs.push({ name, version: pj.version, spdx, lic: lic.join('\n\n'), notices, repoUrl })
}
if (problems.length) {
  console.error('Cannot generate notices:\n  ' + problems.join('\n  '))
  process.exit(1)
}

// Group by licence family, then by identical licence text (full text, so every copyright line is kept).
const copyrightRe = /^\s*(Copyright\b(?! notice)|\(c\)\s|©)/
const family = (s) => {
  if (/^EPL-2\.0/.test(s)) return 'EPL-2.0'
  if (/^Apache-2\.0$/.test(s)) return 'Apache-2.0'
  if (/^OFL-1\.1$/.test(s)) return 'OFL-1.1'
  return s
}
const groups = new Map() // family -> Map(bodyKey -> {body, pkgs})
for (const p of pkgs) {
  const fam = family(p.spdx)
  const body = p.lic
  p.cr = p.lic.split('\n').filter((l) => copyrightRe.test(l)).map((l) => l.trim())
  const key = fam === 'OFL-1.1' || fam === 'EPL-2.0' ? p.name : body.replace(/\s+/g, ' ')
  if (!groups.has(fam)) groups.set(fam, new Map())
  const g = groups.get(fam)
  if (!g.has(key)) g.set(key, { body: body, pkgs: [] })
  g.get(key).pkgs.push(p)
}

const rule = (c, n) => c.repeat(n)
const out = []
const w = (s = '') => out.push(s)
const list = (ps) => ps.forEach((p) => w(`  ${p.name} ${p.version}${p.repoUrl ? `  (${p.repoUrl})` : ''}`))
const counts = {}

w()
w()
w(rule('=', 72))
w('THIRD-PARTY NOTICES: OTHER COMPONENTS OF THE WORKSPACE BUILD')
w(rule('=', 72))
w()
w('Generated by scripts/gen-notices.mjs (npm run notices) from the packages that the production')
w('build of the workspace ships to the browser. Licence and NOTICE texts are copied from the')
w('installed package files. Development and build tools, server-side packages and test tools are')
w('not part of the build and are not listed.')
w()
w('Summary')
w('-------')
const order = ['EPL-2.0', 'Apache-2.0', 'OFL-1.1', 'ISC', 'MIT']
const fams = [...groups.keys()].sort((a, b) => (order.indexOf(a) + 100) % 100 - (order.indexOf(b) + 100) % 100 || a.localeCompare(b))
for (const f of fams) {
  const n = [...groups.get(f).values()].reduce((a, g) => a + g.pkgs.length, 0)
  counts[f] = n
  w(`  ${f}: ${n} package${n === 1 ? '' : 's'} (${[...groups.get(f).values()].flatMap((g) => g.pkgs.map((p) => p.name)).join(', ')})`)
}
w()

if (groups.has('EPL-2.0')) {
  w(rule('=', 72))
  w('ECLIPSE PUBLIC LICENSE 2.0')
  w(rule('=', 72))
  for (const g of groups.get('EPL-2.0').values()) {
    for (const p of g.pkgs) {
      w()
      w(`${p.name} ${p.version}: Eclipse Layout Kernel compiled to JavaScript. Licence: ${p.spdx}; this application uses it under`)
      w('the Eclipse Public License 2.0. The code is distributed unmodified, as the file')
      w('assets/elk-worker.min-*.js (a Web Worker used for automatic diagram layout).')
      w(`Source code of the package: ${p.repoUrl || 'see the package'} and`)
      w('https://www.npmjs.com/package/elkjs (version ' + p.version + '); the Eclipse Layout Kernel (Java) source is at')
      w('https://github.com/eclipse-elk/elk. The EPL-2.0 text is also at https://www.eclipse.org/legal/epl-2.0/.')
      w('You may obtain the corresponding source from those locations. The licence file of the package follows.')
      w()
      w(g.body)
      w()
    }
  }
}

if (groups.has('Apache-2.0')) {
  w(rule('=', 72))
  w('APACHE LICENSE 2.0, AND NOTICE FILES')
  w(rule('=', 72))
  w()
  w('Packages (the full licence text follows; each package is distributed unmodified):')
  const aps = [...groups.get('Apache-2.0').values()]
  for (const g of aps) list(g.pkgs)
  const seenText = new Set()
  for (const g of aps) {
    const key = g.body.replace(/\s+/g, ' ')
    if (seenText.has(key)) continue
    seenText.add(key)
    w()
    w(`Licence text (from ${g.pkgs.map((p) => p.name).join(', ')}):`)
    w()
    w(g.body)
  }
  const withNotice = aps.flatMap((g) => g.pkgs).filter((p) => p.notices.length)
  w()
  w(withNotice.length ? 'NOTICE files shipped by these packages follow.' : 'None of these packages ships a NOTICE file (checked in the installed packages), so there is no NOTICE text to reproduce.')
  for (const p of withNotice) {
    p.notices.forEach((n, i) => {
      w()
      w(`NOTICE file of ${p.name} ${p.version}${p.notices.length > 1 ? ` (${i + 1})` : ''}:`)
      w(rule('-', 40))
      w(n)
    })
  }
  w()
}

if (groups.has('OFL-1.1')) {
  w(rule('=', 72))
  w('SIL OPEN FONT LICENSE 1.1 (fonts)')
  w(rule('=', 72))
  w()
  w('The IBM Plex typefaces are bundled as woff/woff2 files from the @fontsource packages, unmodified.')
  w('The fonts are not sold on their own. Upstream: https://github.com/IBM/plex and https://github.com/fontsource/font-files.')
  for (const g of groups.get('OFL-1.1').values()) {
    for (const p of g.pkgs) {
      w()
      w(`${p.name} ${p.version}`)
      w(rule('-', 40))
      w(g.body)
    }
  }
  w()
}

for (const fam of ['ISC', 'MIT']) {
  if (!groups.has(fam)) continue
  w(rule('=', 72))
  w(`${fam === 'ISC' ? 'ISC LICENCE' : 'MIT LICENCE'}`)
  w(rule('=', 72))
  for (const g of groups.get(fam).values()) {
    w()
    w('Packages and their copyright notices:')
    for (const p of g.pkgs) {
      w(`  ${p.name} ${p.version}${p.repoUrl ? `  (${p.repoUrl})` : ''}`)
      for (const c of p.cr) w(`      ${c}`)
    }
    w()
    w(g.body)
    w()
  }
}
if (declaredOnly.length) {
  w(rule('=', 72))
  w('PACKAGES WITH A DECLARED LICENCE ONLY')
  w(rule('=', 72))
  w()
  w('These packages ship no licence file; the licence below is the one declared in their package.json.')
  for (const p of declaredOnly) w(`  ${p.name} ${p.version}: ${p.spdx}${p.author ? ` (author: ${p.author})` : ''}`)
  w()
}
for (const f of Object.keys(groups.size ? Object.fromEntries(groups) : {})) if (!order.includes(f)) console.warn(`Note: licence family ${f} is not one of the usual set; review it.`)

const base = fs.readFileSync(baseFile, 'utf8')
const text = base.replace(/\s+$/, '') + EOL + out.join('\n').replace(/\r?\n/g, EOL) + EOL

if (process.argv.includes('--check')) {
  const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : ''
  if (current !== text) {
    console.error('THIRD_PARTY_NOTICES.txt is out of date: run `npm run notices`.')
    process.exit(1)
  }
  console.log('THIRD_PARTY_NOTICES.txt is current.')
} else {
  fs.writeFileSync(outFile, text)
  console.log(`Wrote ${path.relative(repo, outFile)}: ${pkgs.length} packages (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}) plus the replicad/OCCT section.`)
}

// Dependency register and licence policy (ADR-0073). Pure functions over package-lock.json
// (lockfileVersion 3) and docs/dependencies/policy.json; no third-party dependencies.

export const CATEGORIES = ['preferred', 'conditional', 'restricted', 'commercial', 'prohibited', 'unknown']

// Strategy §2: preferred = MIT, BSD, Apache 2.0. Other permissive licences with the same obligations
// (notice only) are included; anything not listed is "unknown" and must be classified by a human.
const PREFERRED = new Set([
  'MIT', 'MIT-0', 'ISC', '0BSD', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'Unlicense', 'CC0-1.0',
  'BlueOak-1.0.0', 'Zlib', 'PostgreSQL', 'Python-2.0', 'AFL-2.1', 'AFL-3.0',
])
// Conditional per strategy §2 (LGPL, MPL, EPL) plus font and attribution licences that need a notice.
const CONDITIONAL_PREFIXES = ['LGPL-', 'MPL-', 'EPL-', 'CDDL-', 'OFL-', 'CC-BY-', 'EUPL-']
const RESTRICTED_PREFIXES = ['GPL-', 'AGPL-']
const PROHIBITED_IDS = new Set(['SSPL-1.0', 'Commons-Clause'])
const COMMERCIAL_IDS = new Set(['UNLICENSED', 'BUSL-1.1', 'Elastic-2.0', 'Proprietary'])

const RANK = { preferred: 0, conditional: 1, commercial: 2, restricted: 3, prohibited: 4, unknown: 5 }

/** Category of a single SPDX licence identifier (a trailing "+" is accepted). */
export function classifyId(raw) {
  const id = String(raw ?? '').trim().replace(/\+$/, '')
  if (!id) return 'unknown'
  if (PROHIBITED_IDS.has(id) || id.startsWith('CC-BY-NC')) return 'prohibited'
  if (COMMERCIAL_IDS.has(id) || /^SEE LICEN[CS]E/i.test(id)) return 'commercial'
  if (PREFERRED.has(id)) return 'preferred'
  if (id === 'LGPL' || id === 'GPL' || id === 'AGPL') return id === 'LGPL' ? 'conditional' : 'restricted'
  if (id.startsWith('LGPL-')) return 'conditional'
  if (RESTRICTED_PREFIXES.some((p) => id.startsWith(p))) return 'restricted'
  if (CONDITIONAL_PREFIXES.some((p) => id.startsWith(p))) return 'conditional'
  return 'unknown'
}

function tokenize(expr) {
  return expr.match(/\(|\)|[^\s()]+/g) ?? []
}

/**
 * Category of an SPDX expression. "A OR B" takes the least restrictive choice, "A AND B" the most
 * restrictive; "WITH" exceptions are ignored (the base licence decides). Malformed input is unknown.
 */
export function classifyExpression(expr) {
  if (typeof expr !== 'string' || !expr.trim()) return 'unknown'
  if (/^SEE LICEN[CS]E/i.test(expr.trim())) return 'commercial'
  const tokens = tokenize(expr.trim())
  let pos = 0
  const worse = (a, b) => (RANK[a] >= RANK[b] ? a : b)
  const better = (a, b) => (RANK[a] <= RANK[b] ? a : b)
  function parseOr() {
    let v = parseAnd()
    while (tokens[pos]?.toUpperCase() === 'OR') {
      pos++
      v = better(v, parseAnd())
    }
    return v
  }
  function parseAnd() {
    let v = parseAtom()
    while (tokens[pos]?.toUpperCase() === 'AND') {
      pos++
      v = worse(v, parseAtom())
    }
    return v
  }
  function parseAtom() {
    const t = tokens[pos++]
    if (t === undefined) throw new Error('unexpected end')
    if (t === '(') {
      const v = parseOr()
      if (tokens[pos++] !== ')') throw new Error('missing )')
      return v
    }
    if (tokens[pos]?.toUpperCase() === 'WITH') pos += 2
    return classifyId(t)
  }
  try {
    const v = parseOr()
    return pos === tokens.length ? v : 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Lockfile "license" may be a string or (legacy) an object/array. */
export function licenseString(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(licenseString).filter(Boolean).join(' OR ') || null
  if (value && typeof value === 'object' && typeof value.type === 'string') return value.type
  return null
}

function packageNameFromPath(p) {
  const i = p.lastIndexOf('node_modules/')
  return i < 0 ? null : p.slice(i + 'node_modules/'.length)
}

/** Resolve dependency `name` as seen from lockfile package path `from` (Node resolution over the lockfile tree). */
function resolveDep(packages, from, name) {
  let base = from
  for (;;) {
    const candidate = (base ? base + '/' : '') + 'node_modules/' + name
    if (packages[candidate]) return candidate
    if (!base) return null
    const i = base.lastIndexOf('/node_modules/')
    base = i >= 0 ? base.slice(0, i) : ''
  }
}

function matchPolicy(policy, name, version) {
  const entries = policy.packages ?? {}
  if (entries[`${name}@${version}`]) return entries[`${name}@${version}`]
  if (entries[name]) return entries[name]
  for (const key of Object.keys(entries).sort()) {
    if (key.endsWith('*') && name.startsWith(key.slice(0, -1))) return entries[key]
  }
  return null
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const sortedUnique = (values) => [...new Set(values)].sort(cmp)

/**
 * Build the register from a parsed package-lock.json and parsed policy.json.
 * Deterministic: sorted, no timestamps, nothing read from node_modules or the network.
 */
export function buildRegister(lock, policy = {}) {
  const packages = lock.packages ?? {}
  // Workspaces: lockfile entries outside node_modules (apps/x, packages/y) plus the root.
  const workspacePaths = Object.keys(packages).filter((p) => p && !p.includes('node_modules/'))
  const nameByWorkspacePath = new Map([['', packages['']?.name ?? 'root']])
  for (const [p, e] of Object.entries(packages)) {
    if (e.link && e.resolved) nameByWorkspacePath.set(e.resolved, packageNameFromPath(p))
  }
  for (const p of workspacePaths) if (!nameByWorkspacePath.has(p)) nameByWorkspacePath.set(p, packages[p].name ?? p)

  const consumers = new Map() // lock path -> { runtime, dev, direct } sets of workspace names
  const touch = (target) => {
    if (!consumers.has(target)) consumers.set(target, { runtime: new Set(), dev: new Set(), direct: new Set() })
    return consumers.get(target)
  }

  function walk(workspace, from, scope, visited, direct) {
    const entry = packages[from]
    const keys = direct && scope === 'dev' ? ['devDependencies'] : ['dependencies', 'optionalDependencies', 'peerDependencies']
    for (const key of keys) {
      for (const dep of Object.keys(entry[key] ?? {})) {
        let target = resolveDep(packages, from, dep)
        if (!target) continue // optional or peer dependency that is not installed
        if (packages[target].link) target = packages[target].resolved
        if (!packages[target]) continue
        const c = touch(target)
        if (direct) c.direct.add(workspace)
        c[scope].add(workspace)
        const mark = `${scope}:${target}`
        if (visited.has(mark)) continue
        visited.add(mark)
        walk(workspace, target, scope, visited, false)
      }
    }
  }
  for (const wp of ['', ...workspacePaths.sort()]) {
    if (!packages[wp]) continue
    const wname = nameByWorkspacePath.get(wp)
    walk(wname, wp, 'runtime', new Set(), true)
    walk(wname, wp, 'dev', new Set(), true)
  }

  const workspacePathByName = new Map([...nameByWorkspacePath].map(([p, n]) => [n, p]))
  const out = []
  for (const [p, e] of Object.entries(packages)) {
    if (!p || e.link || !p.includes('node_modules/')) continue
    const name = packageNameFromPath(p)
    const version = e.version ?? null
    const license = licenseString(e.license)
    const c = consumers.get(p)
    const runtime = c ? c.runtime : new Set()
    const dev = c ? c.dev : new Set()
    const scope = runtime.size > 0 ? 'runtime' : 'dev'
    const pol = matchPolicy(policy, name, version) ?? {}
    let distribution = pol.distribution
    if (!distribution) {
      if (scope !== 'runtime') distribution = 'dev-only'
      else {
        const paths = [...runtime].map((n) => workspacePathByName.get(n) ?? '')
        distribution = paths.every((w) => w.startsWith('services/') || w.startsWith('tests/')) ? 'server' : 'browser-or-shared'
      }
    }
    const category = pol.licenseCategory ?? classifyExpression(license)
    out.push({
      name,
      version,
      license: license ?? 'UNKNOWN',
      licenseCategory: category,
      direct: Boolean(c && c.direct.size > 0),
      scope,
      directIn: sortedUnique(c ? [...c.direct] : []),
      workspaces: sortedUnique([...runtime, ...dev]),
      distribution,
      repository: pol.repository ?? null,
      registry: `https://www.npmjs.com/package/${name}/v/${version}`,
      lockPath: p,
      approval: pol.status ?? (category === 'preferred' ? 'not-required' : 'unreviewed'),
      adr: pol.adr ?? null,
      obligations: pol.obligations ?? null,
      localModifications: pol.localModifications ?? 'none',
      notes: pol.notes ?? null,
    })
  }
  out.sort((a, b) => cmp(a.name, b.name) || cmp(a.version, b.version) || cmp(a.lockPath, b.lockPath))
  return { schema: 'faber.dependency-register/1', source: 'package-lock.json', packageCount: out.length, packages: out }
}

/** One package per line keeps diffs reviewable. */
export function serializeRegister(register) {
  const { packages, ...head } = register
  const headJson = JSON.stringify(head, null, 2).replace(/\n}$/, '')
  return `${headJson},\n  "packages": [\n${packages.map((p) => '    ' + JSON.stringify(p)).join(',\n')}\n  ]\n}\n`
}

export function countByCategory(register) {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]))
  for (const p of register.packages) counts[p.licenseCategory] = (counts[p.licenseCategory] ?? 0) + 1
  return counts
}

/**
 * Apply the licence policy to a register.
 * preferred: pass. conditional: pass if status is reviewed or approved. restricted, commercial, prohibited,
 * unknown: pass only if approved. A status starting with "pending" passes (never for prohibited) and is
 * reported on every run, so an open owner decision stays visible without blocking unrelated work.
 */
export function checkRegister(register) {
  const failures = []
  const pending = []
  const reviewed = []
  for (const p of register.packages) {
    const cat = p.licenseCategory
    const row = { name: p.name, version: p.version, license: p.license, category: cat, status: p.approval, scope: p.scope, adr: p.adr, notes: p.notes }
    if (cat === 'preferred') continue
    if (p.approval === 'approved' || (p.approval === 'reviewed' && cat === 'conditional')) reviewed.push(row)
    else if (typeof p.approval === 'string' && p.approval.startsWith('pending') && cat !== 'prohibited') pending.push(row)
    else failures.push({ ...row, reason: `${cat} licence "${p.license}" is not ${cat === 'conditional' ? 'reviewed' : 'approved'} in docs/dependencies/policy.json` })
  }
  return { failures, pending, reviewed }
}

import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildRegister, checkRegister, classifyExpression, serializeRegister } from './deps.mjs'

const root = path.resolve(import.meta.dirname, '..', '..')

function lockWith(extra) {
  return {
    lockfileVersion: 3,
    packages: {
      '': { name: 'root', workspaces: ['packages/*'], devDependencies: { 'dev-tool': '1' } },
      'node_modules/@ews/app': { resolved: 'packages/app', link: true },
      'packages/app': { version: '1.0.0', dependencies: { good: '1', ...Object.fromEntries(Object.keys(extra).map((n) => [n, '1'])) } },
      'node_modules/good': { version: '1.0.0', license: 'MIT' },
      'node_modules/dev-tool': { version: '1.0.0', license: 'MIT', dev: true },
      ...Object.fromEntries(Object.entries(extra).map(([n, license]) => [`node_modules/${n}`, { version: '1.0.0', ...(license ? { license } : {}) }])),
    },
  }
}

describe('classifyExpression', () => {
  it.each([
    ['MIT', 'preferred'],
    ['Apache-2.0', 'preferred'],
    ['(MIT OR CC0-1.0)', 'preferred'],
    ['(AFL-2.1 OR BSD-3-Clause)', 'preferred'],
    ['LGPL-2.1-only', 'conditional'],
    ['MPL-2.0', 'conditional'],
    ['EPL-2.0 OR GPL-3.0-or-later', 'conditional'],
    ['GPL-3.0-only', 'restricted'],
    ['AGPL-3.0-or-later', 'restricted'],
    ['MIT AND GPL-2.0-only', 'restricted'],
    ['GPL-2.0-only WITH Classpath-exception-2.0', 'restricted'],
    ['SEE LICENSE IN LICENSE.md', 'commercial'],
    ['SSPL-1.0', 'prohibited'],
    ['Made-Up-1.0', 'unknown'],
    ['', 'unknown'],
    ['MIT OR', 'unknown'],
  ])('%s -> %s', (expr, category) => {
    expect(classifyExpression(expr)).toBe(category)
  })
})

describe('licence policy check', () => {
  it('passes a clean tree', () => {
    const r = buildRegister(lockWith({}), {})
    expect(checkRegister(r).failures).toEqual([])
  })

  it('fails on a GPL entry that is not approved, passes once it is approved in policy', () => {
    const lock = lockWith({ 'gpl-lib': 'GPL-3.0-only' })
    const failing = checkRegister(buildRegister(lock, {}))
    expect(failing.failures.map((f) => f.name)).toEqual(['gpl-lib'])
    const approved = checkRegister(buildRegister(lock, { packages: { 'gpl-lib': { status: 'approved' } } }))
    expect(approved.failures).toEqual([])
    expect(approved.reviewed.map((f) => f.name)).toEqual(['gpl-lib'])
  })

  it('fails on unknown licences, even when "reviewed" (reviewed only covers conditional licences)', () => {
    const lock = lockWith({ mystery: undefined })
    expect(checkRegister(buildRegister(lock, {})).failures.map((f) => f.name)).toEqual(['mystery'])
    expect(checkRegister(buildRegister(lock, { packages: { mystery: { status: 'reviewed' } } })).failures).toHaveLength(1)
  })

  it('requires review for conditional licences and reports pending ones', () => {
    const lock = lockWith({ 'lgpl-lib': 'LGPL-2.1-only' })
    expect(checkRegister(buildRegister(lock, {})).failures).toHaveLength(1)
    expect(checkRegister(buildRegister(lock, { packages: { 'lgpl-lib': { status: 'reviewed' } } })).failures).toEqual([])
    const pending = checkRegister(buildRegister(lock, { packages: { 'lgpl-lib': { status: 'pending owner decision (ADR-0021)' } } }))
    expect(pending.failures).toEqual([])
    expect(pending.pending.map((p) => p.name)).toEqual(['lgpl-lib'])
  })

  it('never lets a prohibited licence pass as pending', () => {
    const lock = lockWith({ bad: 'SSPL-1.0' })
    expect(checkRegister(buildRegister(lock, { packages: { bad: { status: 'pending' } } })).failures).toHaveLength(1)
  })

  it('exits non-zero from the CLI on a GPL fixture and zero on the repository lockfile', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'deps-fixture-'))
    try {
      const lockFile = path.join(dir, 'package-lock.json')
      const policyFile = path.join(dir, 'policy.json')
      writeFileSync(lockFile, JSON.stringify(lockWith({ 'gpl-lib': 'GPL-3.0-only' })))
      writeFileSync(policyFile, '{}')
      const bad = spawnSync(process.execPath, [path.join(root, 'scripts/deps-check.mjs'), '--lock', lockFile, '--policy', policyFile], { encoding: 'utf8' })
      expect(bad.status).toBe(1)
      expect(bad.stderr).toContain('gpl-lib')
      const good = spawnSync(process.execPath, [path.join(root, 'scripts/deps-check.mjs')], { encoding: 'utf8' })
      expect(good.status).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('register', () => {
  it('is deterministic, sorted and records direct/transitive and workspace consumers', () => {
    const lock = lockWith({ zeta: 'MIT', alpha: 'ISC' })
    const a = serializeRegister(buildRegister(lock, {}))
    const b = serializeRegister(buildRegister(structuredClone(lock), {}))
    expect(a).toBe(b)
    const reg = JSON.parse(a)
    expect(reg.packages.map((p) => p.name)).toEqual(['alpha', 'dev-tool', 'good', 'zeta'])
    const good = reg.packages.find((p) => p.name === 'good')
    expect(good).toMatchObject({ direct: true, scope: 'runtime', directIn: ['@ews/app'], distribution: 'browser-or-shared' })
    expect(reg.packages.find((p) => p.name === 'dev-tool')).toMatchObject({ scope: 'dev', distribution: 'dev-only', directIn: ['root'] })
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  it('the committed register matches the lockfile and policy', () => {
    const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
    const policy = JSON.parse(readFileSync(path.join(root, 'docs/dependencies/policy.json'), 'utf8'))
    expect(readFileSync(path.join(root, 'docs/dependencies/register.json'), 'utf8')).toBe(serializeRegister(buildRegister(lock, policy)))
  })
})

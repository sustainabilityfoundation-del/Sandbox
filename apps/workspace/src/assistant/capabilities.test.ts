import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getTools } from '../platform/registry'
import { assistantContributions } from './contributions'
import '../platform/tools'
import { INSTALLED_MODULES, collect } from '../platform/installedModules'
import { PLATFORM_CAPABILITIES, PLATFORM_OPERATION_ENTRIES, kindOf, mergeCapabilities, summarize } from './capabilities'
import { honestyProblems, operationProblems, surfaceProblems, toolbarProblems } from './capabilityChecks'
import { PLATFORM_TOOLS } from './toolSpecs'

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.ts$/.test(name) ? [path] : []
  })
}

/** The inventory is derived from the installed modules' manifests plus the platform-owned entries (module-registration.md). */
const CAPABILITIES = mergeCapabilities(PLATFORM_CAPABILITIES, collect().capabilities)

describe('AI capability inventory', () => {
  it('has unique IDs', () => {
    const ids = CAPABILITIES.map((c) => c.id)
    expect(ids.length).toBe(new Set(ids).size)
  })

  it('lists every toolbar item of every tool', () => {
    expect(getTools().length).toBeGreaterThan(5)
    expect(toolbarProblems(getTools(), CAPABILITIES)).toEqual([])
  })

  it('accounts for every assistant operation, and maps only to operations that exist', () => {
    const existing = new Set([...PLATFORM_TOOLS.map((t) => t.name), ...assistantContributions().flatMap((t) => t.assistant.actions.map((a) => a.name))])
    expect(operationProblems(existing, CAPABILITIES)).toEqual([])
    expect([...PLATFORM_OPERATION_ENTRIES].sort()).toEqual(PLATFORM_TOOLS.map((t) => t.name).sort())
  })

  it('accounts for every Requirements API operation', () => {
    const root = resolve(__dirname, '../../../../services/requirements/src')
    const operationIds = new Set(files(root).flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/operationId: '([A-Za-z]+)'/g)].map((m) => m[1])))
    expect(operationIds.size).toBeGreaterThan(40)
    const listed = new Set(CAPABILITIES.flatMap((c) => c.apiOperations ?? []))
    expect([...operationIds].filter((id) => !listed.has(id))).toEqual([])
    expect([...listed].filter((id) => !operationIds.has(id))).toEqual([])
  })

  it('declares consistent command surfaces: references resolve, shortcuts are unique and not reserved, no splitOf cycles, inventory modules reachable from menus', () => {
    expect(surfaceProblems(INSTALLED_MODULES.map((m) => m.manifest))).toEqual([])
    // The rules bite: a manifest with a dangling menu reference, a reserved shortcut, a split cycle and an unreachable entry.
    const entry = (id: string, extra: object = {}) => ({ id, module: 'bad', surface: 'toolbar' as const, label: id, effect: 'view' as const, status: 'implemented' as const, coverage: 'none' as const, ...extra })
    const bad = {
      schemaVersion: 1 as const,
      id: 'bad',
      name: 'Bad',
      inventory: 1 as const,
      commandLayout: { tabs: [{ id: 't', label: 'T', groups: [{ id: 'g', label: 'G' }] }], menus: [{ id: 'm', label: 'M', items: [{ kind: 'group' as const, tab: 't', group: 'nope' }] }] },
      capabilities: [
        entry('bad.a', { placement: { tab: 't', group: 'g', order: 1, splitOf: 'bad.b' }, shortcut: 'F1' }),
        entry('bad.b', { placement: { tab: 't', group: 'g', order: 2, splitOf: 'bad.a' } }),
      ],
    }
    const problems = surfaceProblems([bad])
    expect(problems).toEqual(expect.arrayContaining([expect.stringMatching(/unknown group "t\/nope"/), expect.stringMatching(/reserved shortcut "F1"/), expect.stringMatching(/splitOf cycle/), expect.stringMatching(/bad\.a is not reachable/)]))
  })

  it('is honest: coverage claims name operations, mock features are not "implemented"', () => {
    expect(honestyProblems(CAPABILITIES)).toEqual([])
    // A connected account answers with a real model; quality is not evaluated, so never "implemented".
    expect(CAPABILITIES.find((c) => c.id === 'assistant.conversation')?.status).toBe('experimental')
  })

  it('summarizes coverage over the whole inventory, not only exposed operations', () => {
    const s = summarize(CAPABILITIES)
    expect(s.total).toBe(CAPABILITIES.length)
    expect(Object.values(s.byCoverage).reduce((a, b) => a + b, 0)).toBe(s.total)
    expect(s.coveredShare).toBeGreaterThan(0)
    expect(s.coveredShare).toBeLessThan(1)
  })

  it('measures engineering-operation coverage and view-control coverage separately', () => {
    const s = summarize(CAPABILITIES)
    expect(s.engineering.total + s.view.total).toBe(s.total)
    expect(s.engineering.total).toBeGreaterThan(0)
    expect(s.view.total).toBeGreaterThan(0)
    expect(CAPABILITIES.filter((c) => kindOf(c) === 'view').every((c) => c.effect === 'view')).toBe(true)
    // Engineering coverage is reported on its own; view controls cannot raise it.
    expect(s.engineering.coveredShare).toBe(summarize(CAPABILITIES.filter((c) => kindOf(c) === 'engineering')).coveredShare)
  })
})

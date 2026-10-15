import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ToolApi } from '@ews/platform-sdk'
import { sampleModel } from '@ews/platform-sdk/testing'
import { describe, expect, it } from 'vitest'
import { getTools } from '../platform/registry'
import { assistantContributions } from './contributions'
import '../platform/tools'
import { CAPABILITIES, PLATFORM_OPERATION_ENTRIES, kindOf, summarize } from './capabilities'
import { PLATFORM_TOOLS } from './toolSpecs'

/** A tool API stand-in: toolbars only read from it while building their items. */
function stubApi(): ToolApi<unknown> {
  return new Proxy({ services: {}, toolId: 'stub', viewId: 'stub' } as unknown as ToolApi<unknown>, {
    get: (target, key) => (key in target ? (target as unknown as Record<string | symbol, unknown>)[key] : () => undefined),
  })
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.ts$/.test(name) ? [path] : []
  })
}

const aiOperations = new Set(CAPABILITIES.flatMap((c) => c.aiOperations ?? []))

describe('AI capability inventory', () => {
  it('has unique IDs', () => {
    const ids = CAPABILITIES.map((c) => c.id)
    expect(ids.length).toBe(new Set(ids).size)
  })

  it('lists every toolbar item of every tool', () => {
    const model = sampleModel()
    for (const tool of getTools()) {
      const items = tool.toolbar({
        api: stubApi(),
        viewState: tool.initialViewState,
        context: { projectId: model.snapshot.project.id, configurationId: 'CFG-BASE', scenarioId: 'SCN-NOM', selectedIds: [], modelRevision: model.revision } as never,
        model,
        selection: [],
      })
      const ids = items.filter((i) => i.type !== 'separator').map((i) => i.id)
      const listed = CAPABILITIES.filter((c) => c.module === tool.id && c.toolbarItem).map((c) => c.toolbarItem)
      expect({ tool: tool.id, missing: ids.filter((id) => !listed.includes(id)) }).toEqual({ tool: tool.id, missing: [] })
      expect({ tool: tool.id, stale: listed.filter((id) => !ids.includes(id!)) }).toEqual({ tool: tool.id, stale: [] })
    }
  })

  it('accounts for every assistant operation, and maps only to operations that exist', () => {
    const existing = new Set([...PLATFORM_TOOLS.map((t) => t.name), ...assistantContributions().flatMap((t) => t.assistant.actions.map((a) => a.name))])
    expect([...existing].filter((name) => !aiOperations.has(name))).toEqual([])
    expect([...aiOperations].filter((name) => !existing.has(name))).toEqual([])
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

  it('is honest: coverage claims name operations, mock features are not "implemented"', () => {
    for (const c of CAPABILITIES) {
      if (c.coverage === 'shared' || c.coverage === 'equivalent' || c.coverage === 'partial') expect({ id: c.id, ops: c.aiOperations?.length ?? 0 }).not.toEqual({ id: c.id, ops: 0 })
      if (c.coverage === 'partial' || c.coverage === 'restricted') expect({ id: c.id, note: !!c.note }).toEqual({ id: c.id, note: true })
    }
    expect(CAPABILITIES.filter((c) => c.module === 'cad').every((c) => c.status !== 'implemented')).toBe(true)
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

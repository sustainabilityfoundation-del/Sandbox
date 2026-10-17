import { surfaceProblems as moduleSurfaceProblems, type CapabilityEntry, type ModuleManifest, type ToolApi } from '@ews/platform-sdk'
import type { AnyToolDefinition } from '@ews/platform-sdk/react'
import { sampleModel } from '@ews/platform-sdk/testing'

/**
 * The capability-inventory checks (module-registration.md). capabilities.test.ts runs them on the real registry and the
 * proof test in platform/installedModules.test.ts runs the same functions on a collected list, so there is one definition
 * of what a complete, honest inventory is. Each returns a list of problems; an empty list passes.
 */

/** A tool API stand-in: toolbars only read from it while building their items. */
export function stubToolApi(): ToolApi<unknown> {
  return new Proxy({ services: {}, toolId: 'stub', viewId: 'stub' } as unknown as ToolApi<unknown>, {
    get: (target, key) => (key in target ? (target as unknown as Record<string | symbol, unknown>)[key] : () => undefined),
  })
}

/** Every toolbar item of every tool is listed in the inventory, and every listed toolbar item exists. */
export function toolbarProblems(tools: readonly AnyToolDefinition[], inventory: readonly CapabilityEntry[]): string[] {
  const model = sampleModel()
  const problems: string[] = []
  for (const tool of tools) {
    const items = tool.toolbar({
      api: stubToolApi(),
      viewState: tool.initialViewState,
      context: { projectId: model.snapshot.project.id, configurationId: 'CFG-BASE', scenarioId: 'SCN-NOM', selectedIds: [], modelRevision: model.revision } as never,
      model,
      selection: [],
    })
    const ids = items.filter((i) => i.type !== 'separator').map((i) => i.id)
    const listed = inventory.filter((c) => c.module === tool.id && c.toolbarItem).map((c) => c.toolbarItem!)
    for (const id of ids.filter((i) => !listed.includes(i))) problems.push(`${tool.id}: toolbar item "${id}" is not in the inventory`)
    for (const id of listed.filter((i) => !ids.includes(i))) problems.push(`${tool.id}: inventory lists toolbar item "${id}" that does not exist`)
  }
  return problems
}

/** Every existing assistant operation is accounted for by an entry, and entries name only operations that exist. */
export function operationProblems(existing: Iterable<string>, inventory: readonly CapabilityEntry[]): string[] {
  const names = new Set(existing)
  const mapped = new Set(inventory.flatMap((c) => c.aiOperations ?? []))
  return [
    ...[...names].filter((n) => !mapped.has(n)).map((n) => `operation "${n}" has no inventory entry`),
    ...[...mapped].filter((n) => !names.has(n)).map((n) => `inventory names operation "${n}" that does not exist`),
  ]
}

/**
 * The command surfaces of every manifest are consistent (SDK 1.14, capability-registry.md Amendment CT-2c): menu and
 * palette references resolve, shortcuts are unique and none is reserved (Ctrl+K, F1, F10), `splitOf` has no cycles, and
 * every entry of a module with `inventory: 1` is reachable from at least one menu. The rules live in the SDK
 * (`surfaceProblems` per manifest); this runs them over the installed list.
 */
export function surfaceProblems(manifests: readonly ModuleManifest[]): string[] {
  return manifests.flatMap((m) => moduleSurfaceProblems(m))
}

/** Coverage claims name operations, and partial or restricted coverage explains itself. */
export function honestyProblems(inventory: readonly CapabilityEntry[]): string[] {
  const problems: string[] = []
  for (const c of inventory) {
    if ((c.coverage === 'shared' || c.coverage === 'equivalent' || c.coverage === 'partial') && !(c.aiOperations?.length ?? 0)) problems.push(`${c.id}: coverage "${c.coverage}" names no operation`)
    if ((c.coverage === 'partial' || c.coverage === 'restricted') && !c.note) problems.push(`${c.id}: coverage "${c.coverage}" has no note`)
    if (c.module === 'cad' && c.status === 'implemented') problems.push(`${c.id}: the mock CAD tool is labelled implemented`)
  }
  return problems
}

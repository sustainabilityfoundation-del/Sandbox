import type { MenuDef, MenuNode } from './capabilities'
import type { CapabilityEntry, ModuleManifest } from './modules'

/**
 * Pure checks of a module's command surfaces (SDK 1.14, capability-registry.md Amendment CT-2c). The workspace runs
 * them over every installed manifest in `npm run check` (apps/workspace/src/assistant/capabilityChecks.ts). Each
 * returns a list of problems; an empty list passes. Framework-free.
 */

/** Shortcuts the shell keeps for itself: the command palette, help and the menu bar. */
export const RESERVED_SHORTCUTS = ['Control+K', 'F1', 'F10'] as const

const MODIFIERS = ['control', 'alt', 'shift', 'meta']

/** A canonical form of an `aria-keyshortcuts` chord: "Ctrl+shift+e" and "Shift+Control+E" compare equal. */
export function normalizeShortcut(shortcut: string): string {
  const parts = shortcut
    .trim()
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => (p === 'ctrl' ? 'control' : p === 'cmd' || p === 'command' ? 'meta' : p))
  const mods = parts.filter((p) => MODIFIERS.includes(p)).sort((a, b) => MODIFIERS.indexOf(a) - MODIFIERS.indexOf(b))
  const keys = parts.filter((p) => !MODIFIERS.includes(p))
  return [...mods, ...keys].join('+')
}

const RESERVED = new Set(RESERVED_SHORTCUTS.map(normalizeShortcut))

type Layout = NonNullable<ModuleManifest['commandLayout']>
type Manifest = Pick<ModuleManifest, 'id' | 'capabilities' | 'commandLayout' | 'inventory'>

function walk(nodes: MenuNode[], visit: (node: MenuNode, path: string) => void, path = ''): void {
  nodes.forEach((n, i) => {
    const here = `${path}/${i}`
    visit(n, here)
    if (n.kind === 'submenu') walk(n.items, visit, here)
  })
}

/** The default menus a host builds when `menus` is absent: one per tab, its groups as sections. */
export function defaultMenus(layout: Layout): MenuDef[] {
  return layout.tabs.map((t) => ({ id: t.id, label: t.label, items: t.groups.map((g): MenuNode => ({ kind: 'group', tab: t.id, group: g.id })) }))
}

/**
 * Every reference resolves: menu nodes name existing tabs, groups, palettes, context sets and entries; surface placements
 * name existing palettes, palette groups and context sets; ribbon placements name existing tabs and groups; `splitOf`
 * names an entry of the same group.
 */
export function referenceProblems(manifest: Manifest): string[] {
  const problems: string[] = []
  const layout = manifest.commandLayout
  const entries = manifest.capabilities ?? []
  const m = manifest.id
  if (!layout) {
    for (const e of entries) {
      if (e.placement) problems.push(`${m}: ${e.id} has a placement but the module has no commandLayout`)
      if (e.placements?.length) problems.push(`${m}: ${e.id} has surface placements but the module has no commandLayout`)
    }
    return problems
  }
  const groups = new Set(layout.tabs.flatMap((t) => t.groups.map((g) => `${t.id}/${g.id}`)))
  const palettes = new Map((layout.palettes ?? []).map((p) => [p.id, new Set(p.groups.map((g) => g.id))]))
  const sets = new Set((layout.contextSets ?? []).map((s) => s.id))
  const byId = new Map(entries.map((e) => [e.id, e]))

  for (const e of entries) {
    const p = e.placement
    if (p) {
      if (!groups.has(`${p.tab}/${p.group}`)) problems.push(`${m}: ${e.id} is placed in unknown group "${p.tab}/${p.group}"`)
      if (p.splitOf !== undefined) {
        const parent = byId.get(p.splitOf)
        if (!parent) problems.push(`${m}: ${e.id} is a split child of unknown entry "${p.splitOf}"`)
        else if (parent.placement?.tab !== p.tab || parent.placement?.group !== p.group) problems.push(`${m}: ${e.id} is a split child of "${p.splitOf}", which is not in group "${p.tab}/${p.group}"`)
      }
    }
    for (const s of e.placements ?? []) {
      if (s.surface === 'palette') {
        const groupIds = palettes.get(s.palette)
        if (!groupIds) problems.push(`${m}: ${e.id} is placed on unknown palette "${s.palette}"`)
        else if (!groupIds.has(s.group)) problems.push(`${m}: ${e.id} is placed in unknown group "${s.group}" of palette "${s.palette}"`)
      } else if (s.surface === 'context' && !sets.has(s.set)) problems.push(`${m}: ${e.id} is placed in unknown context set "${s.set}"`)
    }
  }

  const menus = layout.menus ?? []
  const menuIds = new Set<string>()
  for (const menu of menus) {
    if (menuIds.has(menu.id)) problems.push(`${m}: menu "${menu.id}" is defined twice`)
    menuIds.add(menu.id)
    walk(menu.items, (n, path) => {
      const at = `menu "${menu.id}"${path}`
      switch (n.kind) {
        case 'group':
          if (!groups.has(`${n.tab}/${n.group}`)) problems.push(`${m}: ${at} names unknown group "${n.tab}/${n.group}"`)
          break
        case 'palette':
          if (!palettes.has(n.palette)) problems.push(`${m}: ${at} names unknown palette "${n.palette}"`)
          break
        case 'context':
          if (!sets.has(n.set)) problems.push(`${m}: ${at} names unknown context set "${n.set}"`)
          break
        case 'command':
          if (!byId.has(n.id)) problems.push(`${m}: ${at} names unknown entry "${n.id}"`)
          break
      }
    })
  }
  return problems
}

/** Shortcuts are unique within the module (they bind for the active tool) and none is reserved (Ctrl+K, F1, F10). */
export function shortcutProblems(manifest: Pick<Manifest, 'id' | 'capabilities'>): string[] {
  const problems: string[] = []
  const seen = new Map<string, string>()
  for (const e of manifest.capabilities ?? []) {
    if (!e.shortcut) continue
    const key = normalizeShortcut(e.shortcut)
    if (!key) {
      problems.push(`${manifest.id}: ${e.id} has an empty shortcut`)
      continue
    }
    if (RESERVED.has(key)) problems.push(`${manifest.id}: ${e.id} uses the reserved shortcut "${e.shortcut}"`)
    const other = seen.get(key)
    if (other) problems.push(`${manifest.id}: ${e.id} and ${other} share the shortcut "${e.shortcut}"`)
    else seen.set(key, e.id)
  }
  return problems
}

/** `splitOf` chains neither cycle nor nest: a split child is not itself a split parent. */
export function splitProblems(manifest: Pick<Manifest, 'id' | 'capabilities'>): string[] {
  const problems: string[] = []
  const entries = manifest.capabilities ?? []
  const byId = new Map(entries.map((e) => [e.id, e]))
  const reported = new Set<string>()
  for (const e of entries) {
    const parentId = e.placement?.splitOf
    if (parentId === undefined) continue
    if (parentId === e.id) {
      problems.push(`${manifest.id}: ${e.id} is a split child of itself`)
      continue
    }
    // Follow the chain; a chain that returns to a visited entry is a cycle (reported once per cycle).
    const chain = [e.id]
    let cycled = false
    let current = byId.get(parentId)
    while (current?.placement?.splitOf !== undefined) {
      if (chain.includes(current.id)) {
        cycled = true
        const cycle = [...chain.slice(chain.indexOf(current.id)), current.id]
        const key = [...new Set(cycle)].sort().join()
        if (!reported.has(key)) {
          reported.add(key)
          problems.push(`${manifest.id}: splitOf cycle ${cycle.join(' -> ')}`)
        }
        break
      }
      chain.push(current.id)
      current = byId.get(current.placement.splitOf)
    }
    const parent = byId.get(parentId)
    if (!cycled && parent?.placement?.splitOf !== undefined) problems.push(`${manifest.id}: ${e.id} is a split child of ${parentId}, which is itself a split child (children do not nest)`)
  }
  return problems
}

/** Entry IDs listed by a set of menus (explicit or default): groups list their placed entries, palettes and sets their members. */
export function menuReachable(manifest: Pick<Manifest, 'capabilities' | 'commandLayout'>): Set<string> {
  const reachable = new Set<string>()
  const layout = manifest.commandLayout
  if (!layout) return reachable
  const entries = manifest.capabilities ?? []
  const inGroup = (tab: string, group: string) => entries.filter((e) => e.placement?.tab === tab && e.placement.group === group)
  const inPalette = (palette: string) => entries.filter((e) => e.placements?.some((p) => p.surface === 'palette' && p.palette === palette))
  const inSet = (set: string) => entries.filter((e) => e.placements?.some((p) => p.surface === 'context' && p.set === set))
  for (const menu of layout.menus ?? defaultMenus(layout)) {
    walk(menu.items, (n) => {
      switch (n.kind) {
        case 'group':
          for (const e of inGroup(n.tab, n.group)) reachable.add(e.id)
          break
        case 'palette':
          for (const e of inPalette(n.palette)) reachable.add(e.id)
          break
        case 'context':
          for (const e of inSet(n.set)) reachable.add(e.id)
          break
        case 'command':
          reachable.add(n.id)
          break
      }
    })
  }
  return reachable
}

/** An entry that is meant to be shown in the UI: it has a toolbar binding or a placement (ribbon, palette, context or quick). */
function isMenuSurfaced(e: CapabilityEntry): boolean {
  return !!(e.toolbarItem || e.placement || e.placements?.length)
}

/**
 * For a module with `inventory: 1`: every entry with a toolbar binding or a placement is reachable from at least one
 * menu. Entries without either (assistant-only, API-only, header and panel-surface entries) are exempt.
 */
export function reachabilityProblems(manifest: Manifest): string[] {
  if (manifest.inventory !== 1) return []
  const entries = (manifest.capabilities ?? []).filter(isMenuSurfaced)
  if (!manifest.commandLayout) return entries.length ? [`${manifest.id}: inventory 1 but no commandLayout, so no entry is reachable from a menu`] : []
  const reachable = menuReachable(manifest)
  return entries.filter((e: CapabilityEntry) => !reachable.has(e.id)).map((e) => `${manifest.id}: ${e.id} is not reachable from any menu`)
}

/** All surface checks of one manifest. */
export function surfaceProblems(manifest: Manifest): string[] {
  return [...referenceProblems(manifest), ...shortcutProblems(manifest), ...splitProblems(manifest), ...reachabilityProblems(manifest)]
}

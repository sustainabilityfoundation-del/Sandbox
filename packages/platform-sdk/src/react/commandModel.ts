import type { CommandBarCommand, CommandBarEntry, CommandBarGroup, CommandBarTab, CommandSessionField, MenuBarMenu, MenuBarNode, ToolPaletteGroup } from '@ews/design-system'
import { availability, checkPrerequisite, implementationState, type AvailabilityContext, type ContextSetDef, type MenuDef, type MenuNode, type PaletteDef, type PanelDef, type Prerequisite } from '../contract/capabilities'
import type { CapabilityEntry, ModuleManifest } from '../contract/modules'
import type { CommandSession, ToolRuntime, ToolbarItem } from '../contract/tool'

/**
 * The command model (docs/specifications/capability-registry.md §4 and Amendment CT-2c): the registry's hierarchy,
 * metadata and implementation state merged with the tool's runtime `ToolbarItem[]` (handlers, active, busy) and
 * `ToolRuntime` (contexts, session, panels), projected onto every surface the design system renders: the ribbon
 * (`tabs`), the main menu (`menus`), the quick-access segment (`quick`), palettes, context sets, the session strip and
 * panels. The design system renders the projections without importing the SDK.
 *
 * One state per entry: a command object is computed once per build and shared by every surface, so a planned entry
 * has no `onInvoke` anywhere (ribbon, menu, palette, context set, split child, quick bar). The static part (which entry
 * sits where) is indexed once per manifest and entry list (a WeakMap keyed by the manifest); a build computes states
 * only.
 */

export const FALLBACK_GROUP_ID = 'unregistered'

export interface CommandModelPalette {
  id: string
  label: string
  groups: ToolPaletteGroup[]
  /** Whether the palette's `when` holds now; an inactive palette is not shown. */
  active: boolean
  reason?: string
}

export interface CommandModelContextSet {
  id: string
  label: string
  commands: CommandBarEntry[]
  /** Whether every `when` prerequisite holds now (the floating set and the context menu show only active sets). */
  active: boolean
  reason?: string
}

export interface CommandModelPanel {
  id: string
  role: PanelDef['role']
  label: string
  side: PanelDef['side']
  helpId?: string
  open: boolean
  /** Absent when the tool has not reported the panel in `ToolRuntime.panels`: the host cannot open it. */
  toggle?: () => void
}

/** The open session as the design system's `CommandSessionStrip` takes it. */
export interface CommandModelSession {
  capabilityId: string
  title: string
  fields: CommandSessionField[]
  preview?: { on: boolean; onChange: (on: boolean) => void }
  onOk: () => void
  okUnavailableReason?: string
  onCancel: () => void
}

export interface CommandModel {
  tabs: CommandBarTab[]
  /** IDs of runtime items that have no registry entry. They are shown in the fallback group, never dropped. */
  unregistered: string[]
  /** True when the registry placed at least one command (a layout and entries with placements). False: a flat bar, as before the registry. */
  registry: boolean
  /** Main menus (SDK 1.14): the layout's `menus`, or one per tab with its groups as sections. Empty without registry data. */
  menus: MenuBarMenu[]
  /** The quick-access segment: entries with a `quick` surface placement, in order. */
  quick: CommandBarCommand[]
  palettes: CommandModelPalette[]
  contextSets: CommandModelContextSet[]
  /** The open command session, or null. A session for a planned entry is refused (see `sessionRefused`). */
  session: CommandModelSession | null
  /** Set when the tool reported a session the host refused. */
  sessionRefused?: { capabilityId: string; reason: string }
  panels: CommandModelPanel[]
}

type ButtonItem = Extract<ToolbarItem, { type: 'button' }>
type LayoutManifest = Pick<ModuleManifest, 'id' | 'name' | 'commandLayout'>

/** Limitation shown for a bound entry on the known evidence-gap list that has no limitations of its own. */
export const EVIDENCE_GAP_TEXT = 'Implemented; test evidence not yet linked'
/** Reason every other command carries while a command session is open. */
export const SESSION_OPEN_TEXT = 'Finish or cancel the current edit'
const NOT_AVAILABLE = 'Not available right now'
const PANEL_PREFIX = 'panel:'

/** An empty model: what a host without a model provides to the hooks. */
export const EMPTY_COMMAND_MODEL: CommandModel = { tabs: [], unregistered: [], registry: false, menus: [], quick: [], palettes: [], contextSets: [], session: null, panels: [] }

// ---- Static index: once per manifest and entry list ------------------------------------------------

interface IndexedGroup {
  id: string
  label: string
  icon?: CommandBarGroup['icon']
  exclusive?: boolean
  /** Members in order, split children excluded (they hang off their parent). */
  members: CapabilityEntry[]
}
interface IndexedTab {
  id: string
  label: string
  contextual?: Prerequisite
  groups: IndexedGroup[]
}
interface IndexedPalette {
  def: PaletteDef
  groups: { def: PaletteDef['groups'][number]; members: CapabilityEntry[] }[]
}
interface StaticIndex {
  entries: CapabilityEntry[]
  byId: Map<string, CapabilityEntry>
  byItem: Map<string, CapabilityEntry>
  /** Entry IDs placed on any surface (their runtime items never fall back to the "Other" group). */
  placedIds: Set<string>
  tabs: IndexedTab[]
  groupsByKey: Map<string, IndexedGroup>
  /** Split children by parent ID, in order. */
  splitChildren: Map<string, CapabilityEntry[]>
  quick: CapabilityEntry[]
  palettes: IndexedPalette[]
  contextSets: { def: ContextSetDef; members: CapabilityEntry[] }[]
  menus: MenuDef[]
  panels: PanelDef[]
}

const indexes = new WeakMap<object, StaticIndex>()

const byOrder = <T>(order: (e: T) => number) => (a: T, b: T) => order(a) - order(b)

function buildIndex(layout: NonNullable<LayoutManifest['commandLayout']>, entries: CapabilityEntry[]): StaticIndex {
  const byId = new Map(entries.map((e) => [e.id, e]))
  const byItem = new Map<string, CapabilityEntry>()
  for (const e of entries) if (e.toolbarItem) byItem.set(e.toolbarItem, e)
  const placedIds = new Set<string>()
  const groupsByKey = new Map<string, IndexedGroup>()
  const tabs: IndexedTab[] = layout.tabs.map((t) => ({
    id: t.id,
    label: t.label,
    contextual: t.contextual,
    groups: t.groups.map((g) => {
      const group: IndexedGroup = { id: g.id, label: g.label, icon: g.icon, exclusive: g.exclusive, members: [] }
      groupsByKey.set(`${t.id}/${g.id}`, group)
      return group
    }),
  }))

  // Ribbon placements. A split child whose parent is in the same group (and is not itself a child) hangs off the parent;
  // any other child is a plain member, so a dangling or circular `splitOf` never hides a command (the checks report it).
  const splitChildren = new Map<string, CapabilityEntry[]>()
  const placed = entries
    .flatMap((e) => {
      const p = e.placement
      return p && groupsByKey.has(`${p.tab}/${p.group}`) ? [{ e, p }] : []
    })
    .sort(byOrder((x) => x.p.order))
  const placementOf = new Map(placed.map((x) => [x.e, x.p]))
  const isChildOf = (x: (typeof placed)[number], parentId: string | undefined): boolean => {
    if (!parentId) return false
    const parent = byId.get(parentId)
    const pp = parent && placementOf.get(parent)
    return !!pp && parent !== x.e && !pp.splitOf && pp.tab === x.p.tab && pp.group === x.p.group
  }
  for (const x of placed) {
    placedIds.add(x.e.id)
    const parentId = x.p.splitOf
    if (isChildOf(x, parentId)) {
      const list = splitChildren.get(parentId!) ?? []
      list.push(x.e)
      splitChildren.set(parentId!, list)
    } else groupsByKey.get(`${x.p.tab}/${x.p.group}`)!.members.push(x.e)
  }

  // Surface placements.
  const quick: { e: CapabilityEntry; order: number }[] = []
  const paletteMembers = new Map<string, { e: CapabilityEntry; order: number }[]>()
  const setMembers = new Map<string, { e: CapabilityEntry; order: number }[]>()
  for (const e of entries) {
    for (const p of e.placements ?? []) {
      const key = p.surface === 'palette' ? `${p.palette}/${p.group}` : p.surface === 'context' ? p.set : ''
      const list = p.surface === 'quick' ? quick : p.surface === 'palette' ? paletteMembers : setMembers
      if (Array.isArray(list)) list.push({ e, order: p.order })
      else {
        const l = list.get(key) ?? []
        l.push({ e, order: p.order })
        list.set(key, l)
      }
      placedIds.add(e.id)
    }
  }
  const sorted = (list: { e: CapabilityEntry; order: number }[] | undefined) => (list ?? []).sort(byOrder((x) => x.order)).map((x) => x.e)
  const palettes: IndexedPalette[] = (layout.palettes ?? []).map((def) => ({ def, groups: def.groups.map((g) => ({ def: g, members: sorted(paletteMembers.get(`${def.id}/${g.id}`)) })) }))
  const contextSets = (layout.contextSets ?? []).map((def) => ({ def, members: sorted(setMembers.get(def.id)) }))

  // Default menus: one per tab, its groups as sections.
  const menus: MenuDef[] = layout.menus ?? layout.tabs.map((t) => ({ id: t.id, label: t.label, items: t.groups.map((g): MenuNode => ({ kind: 'group', tab: t.id, group: g.id })) }))

  return { entries, byId, byItem, placedIds, tabs, groupsByKey, splitChildren, quick: sorted(quick), palettes, contextSets, menus, panels: layout.panels ?? [] }
}

/** The index of a manifest (keyed by its object identity, so hosts keep the manifest object stable) and entry list. */
function indexFor(manifest: LayoutManifest, layout: NonNullable<LayoutManifest['commandLayout']>, entries: CapabilityEntry[]): StaticIndex {
  const cached = indexes.get(manifest)
  if (cached && cached.entries === entries) return cached
  const built = buildIndex(layout, entries)
  indexes.set(manifest, built)
  return built
}

// ---- Per-build state --------------------------------------------------------------------------------

interface Build {
  ctx: AvailabilityContext
  evidenceGaps?: ReadonlySet<string>
  itemById: Map<string, ToolbarItem>
  /** Commands by entry ID (or item ID for unregistered items): one object per command, shared by every surface. */
  commands: Map<string, CommandBarCommand>
  index?: StaticIndex
  /** True while an accepted session is open: every other command is unavailable. */
  sessionOpen: boolean
}

function baseState(entry: CapabilityEntry | undefined, item: ButtonItem | undefined, b: Build): CommandBarCommand['state'] {
  if (entry && implementationState(entry) === 'planned') {
    return { kind: 'planned', info: { status: 'Planned', backlog: entry.backlog ?? [], helpId: entry.helpId } }
  }
  if (!item) {
    // Registered and bound, but the tool shows no such control now (or binds it to another surface only).
    return { kind: 'unavailable', reason: 'Not offered in this view' }
  }
  if (item.disabled) return { kind: 'unavailable', reason: item.unavailableReason ?? item.title ?? NOT_AVAILABLE, active: item.active }
  if (b.sessionOpen) return { kind: 'unavailable', reason: SESSION_OPEN_TEXT, active: item.active }
  if (entry) {
    const a = availability(entry, b.ctx)
    if (!a.available) return { kind: 'unavailable', reason: a.reason ?? NOT_AVAILABLE, active: item.active }
    if (implementationState(entry) === 'partial') {
      const limitation = entry.limitations?.length ? entry.limitations.join('; ') : b.evidenceGaps?.has(entry.id) ? EVIDENCE_GAP_TEXT : 'not yet verified by tests'
      return { kind: 'partial', limitation, onInvoke: item.onClick, active: item.active, busy: item.busy }
    }
  }
  return { kind: 'ready', onInvoke: item.onClick, active: item.active, busy: item.busy }
}

/** The command for an entry (and its runtime item, if any), computed once per build. */
function commandFor(entry: CapabilityEntry | undefined, item: ButtonItem | undefined, b: Build): CommandBarCommand {
  const id = entry?.id ?? item!.id
  const cached = b.commands.get(id)
  if (cached) return cached
  const children = entry && b.index?.splitChildren.get(entry.id)
  const command: CommandBarCommand = {
    id,
    label: item?.label ?? entry?.label ?? item?.id ?? '',
    icon: item?.icon ?? entry?.icon,
    mode: item?.mode ?? entry?.mode,
    description: entry?.description ?? item?.title ?? '',
    shortcut: entry?.shortcut,
    helpId: entry?.helpId,
    priority: item?.priority ?? entry?.placement?.priority,
    primary: item?.primary,
    illustrative: item?.illustrative,
    testId: item?.id ?? entry?.toolbarItem,
    state: baseState(entry, item, b),
  }
  if (children?.length) command.split = children.map((c) => commandForEntry(c, b))
  b.commands.set(id, command)
  return command
}

function itemOf(entry: CapabilityEntry, b: Build): ButtonItem | undefined {
  const item = entry.toolbarItem ? b.itemById.get(entry.toolbarItem) : undefined
  return item?.type === 'button' ? item : undefined
}

function commandForEntry(entry: CapabilityEntry, b: Build): CommandBarCommand {
  return commandFor(entry, itemOf(entry, b), b)
}

/** A runtime item as a bar entry: a command for a button, a control otherwise. */
function entryFor(item: ToolbarItem, entry: CapabilityEntry | undefined, b: Build): CommandBarEntry {
  switch (item.type) {
    case 'separator':
      return { type: 'separator', id: item.id }
    case 'text':
      return { type: 'text', id: item.id, text: item.text, tone: item.tone }
    case 'select': {
      const blocked = entry ? availability(entry, b.ctx) : { available: true }
      return { type: 'select', id: item.id, label: item.label, value: item.value, options: item.options, onChange: item.onChange, isDisabled: item.disabled || !blocked.available || b.sessionOpen }
    }
    case 'number': {
      const blocked = entry ? availability(entry, b.ctx) : { available: true }
      return { type: 'number', id: item.id, label: item.label, value: item.value, unit: item.unit, min: item.min, max: item.max, step: item.step, onChange: item.onChange, isDisabled: item.disabled || !blocked.available || b.sessionOpen }
    }
    case 'button':
      return commandFor(entry, item, b)
  }
}

/** A ribbon entry for a placed registry entry: its runtime control when it has one, else the command from the entry alone. */
function ribbonEntry(entry: CapabilityEntry, b: Build): CommandBarEntry {
  const item = entry.toolbarItem ? b.itemById.get(entry.toolbarItem) : undefined
  return item ? entryFor(item, entry, b) : commandFor(entry, undefined, b)
}

function sessionField(item: ToolbarItem): CommandSessionField | null {
  switch (item.type) {
    case 'number':
      return { type: 'number', id: item.id, label: item.label, value: item.value, unit: item.unit, min: item.min, max: item.max, step: item.step, onChange: item.onChange, isDisabled: item.disabled }
    case 'select':
      return { type: 'select', id: item.id, label: item.label, value: item.value, options: item.options, onChange: item.onChange, isDisabled: item.disabled }
    case 'text':
      return { type: 'text', id: item.id, text: item.text, tone: item.tone }
    default:
      return null
  }
}

/** The session as the strip takes it, or the refusal: a planned entry (or, with a registry, an unregistered one) never gets a session. */
function projectSession(session: CommandSession | null | undefined, entries: CapabilityEntry[], index: StaticIndex | undefined): Pick<CommandModel, 'session' | 'sessionRefused'> {
  if (!session) return { session: null }
  const entry = index ? index.byId.get(session.capabilityId) : entries.find((e) => e.id === session.capabilityId)
  const refuse = (reason: string) => ({ session: null, sessionRefused: { capabilityId: session.capabilityId, reason } })
  if (entry && implementationState(entry) === 'planned') return refuse('Planned: not implemented yet')
  if (!entry && index) return refuse('Not a registered capability')
  const { capabilityId, title, preview, onOk, okUnavailableReason, onCancel } = session
  return { session: { capabilityId, title, fields: session.fields.map(sessionField).filter((f): f is CommandSessionField => f !== null), preview, onOk, okUnavailableReason, onCancel } }
}

function projectPanels(defs: PanelDef[], runtime: ToolRuntime | undefined): CommandModelPanel[] {
  return defs.map((p) => {
    const state = runtime?.panels?.[p.id]
    return { id: p.id, role: p.role, label: p.label, side: p.side, helpId: p.helpId, open: state ? state.open : !!p.defaultOpen, toggle: state?.toggle }
  })
}

function panelCommand(panel: CommandModelPanel, b: Build): CommandBarCommand {
  const id = `${PANEL_PREFIX}${panel.id}`
  const cached = b.commands.get(id)
  if (cached) return cached
  const toggle = panel.toggle
  const command: CommandBarCommand = {
    id,
    label: panel.label,
    mode: 'toggle',
    description: `Show or hide the ${panel.label.toLowerCase()} panel`,
    helpId: panel.helpId,
    state: toggle ? { kind: 'ready', onInvoke: toggle, active: panel.open } : { kind: 'unavailable', reason: 'Not offered in this view', active: panel.open },
  }
  b.commands.set(id, command)
  return command
}

// ---- Menus -----------------------------------------------------------------------------------------

/** Every command of a ribbon group in order, split children listed after their parent (menus list every entry). */
function groupCommands(group: IndexedGroup, index: StaticIndex, b: Build): CommandBarCommand[] {
  return group.members.flatMap((e) => [commandForEntry(e, b), ...(index.splitChildren.get(e.id) ?? []).map((c) => commandForEntry(c, b))])
}

/** The menu header of a group: its label and the "n of m available" count (U13; the same rule as the design system's `groupCounts`). */
function sectionTitle(label: string, commands: CommandBarCommand[]): string {
  const available = commands.filter((c) => c.state.kind === 'ready' || c.state.kind === 'partial').length
  return `${label} (${available} of ${commands.length} available)`
}

function menuNodes(nodes: MenuNode[], index: StaticIndex, b: Build, panels: CommandModelPanel[], path: string): MenuBarNode[] {
  const out: MenuBarNode[] = []
  nodes.forEach((n, i) => {
    const nodeId = `${path}/${i}`
    switch (n.kind) {
      case 'group': {
        const group = index.groupsByKey.get(`${n.tab}/${n.group}`)
        if (!group) return
        const commands = groupCommands(group, index, b)
        out.push({ kind: 'section', id: `${nodeId}:${n.tab}/${n.group}`, title: sectionTitle(group.label, commands), items: commands.map((command) => ({ kind: 'command', command })) })
        return
      }
      case 'palette': {
        const palette = index.palettes.find((p) => p.def.id === n.palette)
        if (!palette) return
        out.push({
          kind: 'submenu',
          id: `${nodeId}:palette/${n.palette}`,
          label: palette.def.label,
          items: palette.groups.map((g) => ({ kind: 'section', id: `${nodeId}:palette/${n.palette}/${g.def.id}`, title: g.def.label, items: g.members.map((e) => ({ kind: 'command', command: commandForEntry(e, b) })) })),
        })
        return
      }
      case 'context': {
        const set = index.contextSets.find((s) => s.def.id === n.set)
        if (!set) return
        const commands = set.members.map((e) => commandForEntry(e, b))
        out.push({ kind: 'section', id: `${nodeId}:context/${n.set}`, title: sectionTitle(set.def.label, commands), items: commands.map((command) => ({ kind: 'command', command })) })
        return
      }
      case 'command': {
        const entry = index.byId.get(n.id)
        if (entry) out.push({ kind: 'command', command: commandForEntry(entry, b) })
        return
      }
      case 'submenu':
        out.push({ kind: 'submenu', id: `${nodeId}:submenu`, label: n.label, mnemonic: n.mnemonic, items: menuNodes(n.items, index, b, panels, nodeId) })
        return
      case 'panels':
        if (panels.length) out.push({ kind: 'section', id: `${nodeId}:panels`, title: 'Panels', items: panels.map((p) => ({ kind: 'command', command: panelCommand(p, b), checked: p.open })) })
        return
      case 'separator':
        out.push({ kind: 'separator', id: `${nodeId}:separator` })
        return
    }
  })
  return out
}

// ---- Build -----------------------------------------------------------------------------------------

/**
 * Builds the model. With a `commandLayout` and entries that have placements, commands are grouped by tab and
 * group in registry order, planned entries appear (without a handler), and runtime items without an entry go to a
 * fallback group in the first tab and are listed in `unregistered`; menus, the quick segment, palettes, context sets
 * and panels are projected from the same commands. Without registry data the result is one flat, unlabelled group
 * in the runtime order and every other surface is empty, so a tool without a manifest renders as before.
 *
 * `runtime` (SDK 1.14) supplies the contexts that hold now (merged into `availCtx.contexts` when that is unset), the
 * open session and panel state. While an accepted session is open every other command is unavailable.
 */
export function buildCommandModel(
  manifest: LayoutManifest | undefined,
  entries: CapabilityEntry[],
  items: ToolbarItem[],
  availCtx: AvailabilityContext,
  /** IDs of bound entries without test evidence (the known gap list): they stay partial, with a neutral limitation text. */
  evidenceGaps?: ReadonlySet<string>,
  runtime?: ToolRuntime,
): CommandModel {
  const ctx = runtime?.contexts && !availCtx.contexts ? { ...availCtx, contexts: runtime.contexts } : availCtx
  const layout = manifest?.commandLayout
  const index = manifest && layout ? indexFor(manifest, layout, entries) : undefined
  const registry = !!index && index.placedIds.size > 0
  const { session, sessionRefused } = projectSession(runtime?.session, entries, registry ? index : undefined)
  const b: Build = { ctx, evidenceGaps, itemById: new Map(items.map((i) => [i.id, i])), commands: new Map(), index: registry ? index : undefined, sessionOpen: session !== null }

  if (!index || !registry) {
    const byItem = new Map<string, CapabilityEntry>()
    for (const e of entries) if (e.toolbarItem) byItem.set(e.toolbarItem, e)
    const flat: CommandBarEntry[] = items.map((item) => entryFor(item, byItem.get(item.id), b))
    return {
      ...EMPTY_COMMAND_MODEL,
      tabs: [{ id: 'main', label: manifest?.name ?? 'Tools', groups: [{ id: 'main', label: '', commands: flat }] }],
      session,
      ...(sessionRefused ? { sessionRefused } : {}),
    }
  }

  const used = new Set<string>()
  const tabs: CommandBarTab[] = []
  for (const tab of index.tabs) {
    if (tab.contextual && !checkPrerequisite(tab.contextual, ctx).available) continue
    const groups: CommandBarGroup[] = []
    for (const g of tab.groups) {
      const commands = g.members.map((e) => {
        if (e.toolbarItem) used.add(e.toolbarItem)
        const children = index.splitChildren.get(e.id) ?? []
        for (const c of children) if (c.toolbarItem) used.add(c.toolbarItem)
        const own = ribbonEntry(e, b)
        // A select or number control has no split menu: its children would be lost, so they follow it as normal commands.
        const parentItem = e.toolbarItem ? b.itemById.get(e.toolbarItem) : undefined
        return parentItem && (parentItem.type === 'select' || parentItem.type === 'number') ? [own, ...children.map((c) => ribbonEntry(c, b))] : [own]
      }).flat()
      if (commands.length > 0) groups.push({ id: g.id, label: g.label, icon: g.icon, exclusive: g.exclusive, counts: true, commands })
    }
    tabs.push({ id: tab.id, label: tab.label, groups })
  }

  // Items of entries placed on any surface (also a hidden contextual tab) are registered, just not in the ribbon now.
  for (const e of entries) if (e.toolbarItem && index.placedIds.has(e.id)) used.add(e.toolbarItem)
  const leftovers = items.filter((i) => i.type !== 'separator' && !used.has(i.id))
  const unregistered = leftovers.filter((i) => i.type !== 'text' && !index.byItem.has(i.id)).map((i) => i.id)
  // Items whose entry exists but has no placement also land in the fallback group (they are registered, so not reported as unregistered).
  if (leftovers.length > 0) {
    const group: CommandBarGroup = { id: FALLBACK_GROUP_ID, label: 'Other', commands: leftovers.map((i) => entryFor(i, index.byItem.get(i.id), b)) }
    // Runtime items are never dropped: with no visible tab (all contextual and hidden) the fallback group gets a tab of its own.
    if (tabs.length > 0) tabs[0] = { ...tabs[0], groups: [...tabs[0].groups, group] }
    else tabs.push({ id: 'main', label: manifest?.name ?? 'Tools', groups: [group] })
  }

  const panels = projectPanels(index.panels, runtime)
  const menus: MenuBarMenu[] = index.menus.map((m) => ({ id: m.id, label: m.label, mnemonic: m.mnemonic, items: menuNodes(m.items, index, b, panels, m.id) }))
  const quick = layout?.quick ? index.quick.map((e) => commandForEntry(e, b)) : []
  const palettes: CommandModelPalette[] = index.palettes.map((p) => {
    const when = p.def.when ? checkPrerequisite(p.def.when, ctx) : { available: true }
    return {
      id: p.def.id,
      label: p.def.label,
      active: when.available,
      ...(when.available ? {} : { reason: when.reason }),
      groups: p.groups.map((g) => ({ id: g.def.id, label: g.def.label, icon: g.def.icon, collapsed: g.def.collapsed, commands: g.members.map((e) => commandForEntry(e, b)) })),
    }
  })
  const contextSets: CommandModelContextSet[] = index.contextSets.map((s) => {
    const unmet = s.def.when.map((p) => checkPrerequisite(p, ctx)).find((a) => !a.available)
    return { id: s.def.id, label: s.def.label, active: !unmet, ...(unmet ? { reason: unmet.reason } : {}), commands: s.members.map((e) => commandForEntry(e, b)) }
  })

  return { registry: true, tabs, unregistered, menus, quick, palettes, contextSets, session, ...(sessionRefused ? { sessionRefused } : {}), panels }
}

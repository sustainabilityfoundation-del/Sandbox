import type { CommandBarCommand, CommandBarEntry, CommandBarGroup, CommandBarTab } from '@ews/design-system'
import { availability, checkPrerequisite, implementationState, type AvailabilityContext } from '../contract/capabilities'
import type { CapabilityEntry, ModuleManifest } from '../contract/modules'
import type { ToolbarItem } from '../contract/tool'

/**
 * The command model (docs/specifications/capability-registry.md §4): the registry's hierarchy, metadata and
 * implementation state merged with the tool's runtime `ToolbarItem[]` (handlers, active, busy). The design
 * system's `CommandBar` renders it without importing the SDK.
 */

export const FALLBACK_GROUP_ID = 'unregistered'

export interface CommandModel {
  tabs: CommandBarTab[]
  /** IDs of runtime items that have no registry entry. They are shown in the fallback group, never dropped. */
  unregistered: string[]
  /** True when the registry placed at least one command (a layout and entries with placements). False: a flat bar, as before the registry. */
  registry: boolean
}

type ButtonItem = Extract<ToolbarItem, { type: 'button' }>

/** Limitation shown for a bound entry on the known evidence-gap list that has no limitations of its own. */
export const EVIDENCE_GAP_TEXT = 'Implemented; test evidence not yet linked'
const NOT_AVAILABLE = 'Not available right now'

function commandFor(entry: CapabilityEntry | undefined, item: ButtonItem | undefined, ctx: AvailabilityContext, evidenceGaps?: ReadonlySet<string>): CommandBarCommand {
  const label = item?.label ?? entry?.label ?? item?.id ?? ''
  const base = {
    id: entry?.id ?? item!.id,
    label,
    icon: item?.icon ?? entry?.icon,
    description: entry?.description ?? item?.title ?? '',
    helpId: entry?.helpId,
    priority: item?.priority ?? entry?.placement?.priority,
    primary: item?.primary,
    illustrative: item?.illustrative,
    testId: item?.id ?? entry?.toolbarItem,
  } satisfies Omit<CommandBarCommand, 'state'>

  if (entry && implementationState(entry) === 'planned') {
    return { ...base, state: { kind: 'planned', info: { status: 'Planned', backlog: entry.backlog ?? [], helpId: entry.helpId } } }
  }
  if (!item) {
    // Registered and bound, but the tool shows no such control now (or binds it to another surface only).
    return { ...base, state: { kind: 'unavailable', reason: 'Not offered in this view' } }
  }
  if (item.disabled) {
    return { ...base, state: { kind: 'unavailable', reason: item.unavailableReason ?? item.title ?? NOT_AVAILABLE, active: item.active } }
  }
  if (entry) {
    const a = availability(entry, ctx)
    if (!a.available) return { ...base, state: { kind: 'unavailable', reason: a.reason ?? NOT_AVAILABLE, active: item.active } }
    if (implementationState(entry) === 'partial') {
      const limitation = entry.limitations?.length ? entry.limitations.join('; ') : evidenceGaps?.has(entry.id) ? EVIDENCE_GAP_TEXT : 'not yet verified by tests'
      return { ...base, state: { kind: 'partial', limitation, onInvoke: item.onClick, active: item.active, busy: item.busy } }
    }
  }
  return { ...base, state: { kind: 'ready', onInvoke: item.onClick, active: item.active, busy: item.busy } }
}

function entryFor(item: ToolbarItem, ctx: AvailabilityContext, entry: CapabilityEntry | undefined, evidenceGaps?: ReadonlySet<string>): CommandBarEntry {
  switch (item.type) {
    case 'separator':
      return { type: 'separator', id: item.id }
    case 'text':
      return { type: 'text', id: item.id, text: item.text, tone: item.tone }
    case 'select': {
      const blocked = entry ? availability(entry, ctx) : { available: true }
      return { type: 'select', id: item.id, label: item.label, value: item.value, options: item.options, onChange: item.onChange, isDisabled: item.disabled || !blocked.available }
    }
    case 'button':
      return commandFor(entry, item, ctx, evidenceGaps)
  }
}

/**
 * Builds the model. With a `commandLayout` and entries that have placements, commands are grouped by tab and
 * group in registry order, planned entries appear (without a handler), and runtime items without an entry go to a
 * fallback group in the first tab and are listed in `unregistered`. Without registry data the result is one flat,
 * unlabelled group in the runtime order, so a tool without a manifest renders as before.
 */
export function buildCommandModel(
  manifest: Pick<ModuleManifest, 'id' | 'name' | 'commandLayout'> | undefined,
  entries: CapabilityEntry[],
  items: ToolbarItem[],
  availCtx: AvailabilityContext,
  /** IDs of bound entries without test evidence (the known gap list): they stay partial, with a neutral limitation text. */
  evidenceGaps?: ReadonlySet<string>,
): CommandModel {
  const byItem = new Map<string, CapabilityEntry>()
  for (const e of entries) if (e.toolbarItem) byItem.set(e.toolbarItem, e)
  const layout = manifest?.commandLayout
  const placed = entries.filter((e) => e.placement && layout?.tabs.some((t) => t.id === e.placement!.tab && t.groups.some((g) => g.id === e.placement!.group)))

  if (!layout || placed.length === 0) {
    const flat: CommandBarEntry[] = items.map((item) => entryFor(item, availCtx, byItem.get(item.id), evidenceGaps))
    return {
      registry: false,
      unregistered: [],
      tabs: [{ id: 'main', label: manifest?.name ?? 'Tools', groups: [{ id: 'main', label: '', commands: flat }] }],
    }
  }

  const itemById = new Map(items.map((i) => [i.id, i]))
  const used = new Set<string>()
  const tabs: CommandBarTab[] = []
  for (const tab of layout.tabs) {
    if (tab.contextual && !checkPrerequisite(tab.contextual, availCtx).available) {
      // A hidden contextual tab keeps its items out of the fallback group: they are registered, just not relevant now.
      for (const e of placed) if (e.placement!.tab === tab.id && e.toolbarItem) used.add(e.toolbarItem)
      continue
    }
    const groups: CommandBarGroup[] = tab.groups.map((g) => {
      const members = placed.filter((e) => e.placement!.tab === tab.id && e.placement!.group === g.id).sort((a, b) => a.placement!.order - b.placement!.order)
      const commands = members.map((e) => {
        const item = e.toolbarItem ? itemById.get(e.toolbarItem) : undefined
        if (!item) return commandFor(e, undefined, availCtx, evidenceGaps)
        used.add(item.id)
        return entryFor(item, availCtx, e, evidenceGaps)
      })
      return { id: g.id, label: g.label, icon: g.icon, commands }
    })
    tabs.push({ id: tab.id, label: tab.label, groups: groups.filter((g) => g.commands.length > 0) })
  }

  const leftovers = items.filter((i) => i.type !== 'separator' && !used.has(i.id))
  const unregistered = leftovers.filter((i) => i.type !== 'text' && !byItem.has(i.id)).map((i) => i.id)
  // Items whose entry exists but has no placement also land in the fallback group (they are registered, so not reported as unregistered).
  if (leftovers.length > 0) {
    const group: CommandBarGroup = { id: FALLBACK_GROUP_ID, label: 'Other', commands: leftovers.map((i) => entryFor(i, availCtx, byItem.get(i.id), evidenceGaps)) }
    // Runtime items are never dropped: with no visible tab (all contextual and hidden) the fallback group gets a tab of its own.
    if (tabs.length > 0) tabs[0] = { ...tabs[0], groups: [...tabs[0].groups, group] }
    else tabs.push({ id: 'main', label: manifest?.name ?? 'Tools', groups: [group] })
  }
  return { registry: true, tabs, unregistered }
}

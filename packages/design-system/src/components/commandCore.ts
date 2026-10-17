import type { CommandBarCommand, CommandBarEntry, CommandBarGroup } from './CommandBar'

/*
 * Framework-free rules shared by every command surface (ribbon, menus, palettes, context sets, split buttons, the
 * session strip). One place decides what pressing a command does, so a planned or unavailable command can never run
 * on any surface: not by type (no `onInvoke`), and not at runtime (this check reads the state kind, not the handler).
 */

export function isCommand(e: CommandBarEntry): e is CommandBarCommand {
  return e.type === undefined || e.type === 'command'
}

/**
 * Pressing a command. A ready or partial command is invoked; anything else calls `explain` (the host opens the
 * non-modal explanation) and nothing runs. Returns true when the command was invoked.
 */
export function activateCommand(command: CommandBarCommand, explain: (command: CommandBarCommand) => void): boolean {
  const { state } = command
  if (state.kind === 'ready' || state.kind === 'partial') {
    state.onInvoke()
    return true
  }
  explain(command)
  return false
}

/** The same command, running `after` once it was invoked (close a sheet after a choice). Planned and unavailable stay as they are. */
export function withAfterInvoke(command: CommandBarCommand, after: () => void): CommandBarCommand {
  const { state } = command
  if (state.kind === 'ready' || state.kind === 'partial') {
    return { ...command, state: { ...state, onInvoke: () => { state.onInvoke(); after() } } }
  }
  return command
}

/** The state in a few words for a menu row or list description (undefined for a ready command). */
export function commandStateText(c: CommandBarCommand): string | undefined {
  switch (c.state.kind) {
    case 'planned':
      return 'Planned'
    case 'partial':
      return `Partial: ${c.state.limitation}`
    case 'unavailable':
      return c.state.reason
    case 'ready':
      return undefined
  }
}

export interface GroupCounts {
  available: number
  total: number
}

/** Counts of a group's commands: ready and partial ones are available. Separators, selects and text are not counted. */
export function groupCounts(group: CommandBarGroup): GroupCounts {
  const commands = group.commands.filter(isCommand)
  return { available: commands.filter((c) => c.state.kind === 'ready' || c.state.kind === 'partial').length, total: commands.length }
}

/** "2 of 5 available", or undefined when the group does not show counts. */
export function groupCountText(group: CommandBarGroup): string | undefined {
  if (!group.counts) return undefined
  const { available, total } = typeof group.counts === 'object' ? group.counts : groupCounts(group)
  return `${available} of ${total} available`
}

/** A group with commands that are all planned: it renders as one muted group button ("0 of 6"). */
export function isAllPlanned(group: CommandBarGroup): boolean {
  const commands = group.commands.filter(isCommand)
  return group.label !== '' && commands.length > 0 && commands.every((c) => c.state.kind === 'planned') && group.commands.every((e) => isCommand(e) || e.type === 'separator')
}

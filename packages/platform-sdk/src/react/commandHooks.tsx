import { createContext, useContext, type ReactNode } from 'react'
import { EMPTY_COMMAND_MODEL, type CommandModel, type CommandModelContextSet, type CommandModelPalette } from './commandModel'

/*
 * Command-surface hooks for tool views (SDK 1.14, capability-registry.md Amendment CT-2c). The host builds the command
 * model once per render (`buildCommandModel`) and provides it around the tool view; the tool renders its palettes and
 * context sets from it with the design system's `ToolPalette` and `ContextCommands`. The host renders the menu bar,
 * quick bar, ribbon and session strip itself.
 *
 * A host that provides no model (an older workspace) yields the empty model, so a tool's palette simply renders nothing.
 */

const CommandModelContext = createContext<CommandModel>(EMPTY_COMMAND_MODEL)

/** Provided by the host around each tool view with the model it built for that view. */
export function CommandModelProvider({ model, children }: { model: CommandModel; children: ReactNode }) {
  return <CommandModelContext.Provider value={model}>{children}</CommandModelContext.Provider>
}

/** The command model of this view: every surface's commands with their states. */
export function useCommandModel(): CommandModel {
  return useContext(CommandModelContext)
}

/**
 * A palette to render with `ToolPalette`: the one with `id`, or the first one, if it applies now (its `when` holds).
 * Null when there is none or it does not apply.
 */
export function usePalette(id?: string): CommandModelPalette | null {
  const { palettes } = useCommandModel()
  const palette = id === undefined ? palettes.find((p) => p.active) : palettes.find((p) => p.id === id)
  return palette && palette.active ? palette : null
}

/** A context set to render with `ContextCommands`, when every one of its `when` prerequisites holds now; null otherwise. */
export function useContextSet(id: string): CommandModelContextSet | null {
  const { contextSets } = useCommandModel()
  const set = contextSets.find((s) => s.id === id)
  return set && set.active ? set : null
}

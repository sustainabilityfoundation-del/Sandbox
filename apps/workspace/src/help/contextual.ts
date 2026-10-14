import type { HelpContext } from '@ews/platform-sdk'
import { useWorkspaceStore } from '../platform/store'
import { workspaceHelp } from './workspaceHelp'

/**
 * Context for F1: the focused (or last pointed-at) control's help ID, the active tool and the
 * selected object. The Help Service picks the most specific topic and falls back gracefully.
 */
export function currentHelpContext(target: Element | null = document.activeElement): HelpContext {
  const state = useWorkspaceStore.getState()
  const control = (target?.closest?.('[data-help-id]') as HTMLElement | null)?.dataset.helpId
  // A control inside a tool view belongs to that tool; otherwise the active tool.
  const host = target?.closest?.('[data-tool]') as HTMLElement | null
  const moduleId = host?.dataset.tool ?? state.activeToolId ?? undefined
  const selected = state.context.selectedIds[0]
  const objectType = selected ? state.model?.get(selected)?.type : undefined
  return { control, moduleId, objectType }
}

/** Opens the Help Centre at the best topic for the current context. */
export function openContextualHelp(target?: Element | null): void {
  const ctx = currentHelpContext(target ?? document.activeElement)
  // A control's own mapping wins; without one, prefer the tool over the selected object.
  const best = workspaceHelp.contextual(ctx.control ? ctx : { moduleId: ctx.moduleId, objectType: ctx.moduleId ? undefined : ctx.objectType })[0]
    ?? workspaceHelp.contextual({ objectType: ctx.objectType })[0]
  workspaceHelp.open(best?.topic.id)
}

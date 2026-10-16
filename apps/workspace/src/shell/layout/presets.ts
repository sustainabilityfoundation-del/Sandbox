import type { IconName } from '@ews/design-system'
import { DEFAULT_LAYOUTS, useWorkspaceStore, type Layout } from '../../platform/store'

/**
 * Workspace presets (brief §5). A preset is a set of layout preferences; applying one never touches engineering
 * data or view state, and the person can adjust everything afterwards (the layout then reads "Custom").
 */
export type PresetId = 'engineering' | 'ai-assisted' | 'review'

export const PRESETS: Record<PresetId, { label: string; description: string; icon: IconName; layout: Partial<Layout> }> = {
  engineering: {
    label: 'Engineering',
    description: 'Explorer, large canvas and inspector; assistant collapsed',
    icon: 'layout',
    layout: { treeOpen: true, inspectorOpen: true, assistantOpen: false, activityOpen: false, dockTab: 'activity' },
  },
  'ai-assisted': {
    label: 'AI-assisted',
    description: 'Explorer, canvas and the assistant expanded on the right',
    icon: 'assistant',
    layout: { treeOpen: true, inspectorOpen: false, assistantOpen: true, assistantDock: 'right', activityOpen: false, dockTab: 'activity' },
  },
  review: {
    label: 'Review',
    description: 'Large canvas with traceability (inspector) and validation panels',
    icon: 'validate',
    layout: { treeOpen: false, inspectorOpen: true, assistantOpen: false, activityOpen: true, dockTab: 'validation' },
  },
}

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[]

/** The preset the current layout matches, or null (custom). */
export function currentPreset(layout: Layout): PresetId | null {
  return PRESET_IDS.find((id) => Object.entries(PRESETS[id].layout).every(([k, v]) => layout[k as keyof Layout] === v)) ?? null
}

/** Applies a preset to the current layout class (sizes keep the person's own values). */
export function applyPreset(id: PresetId): void {
  useWorkspaceStore.getState().setLayout({ ...PRESETS[id].layout, canvasMaximized: false })
}

/** Restores the default layout for the current layout class (sizes included). */
export function restoreDefaultLayout(): void {
  const { layoutClass, setLayout } = useWorkspaceStore.getState()
  setLayout({ ...DEFAULT_LAYOUTS[layoutClass] })
}

/** Whether the assistant is docked as a right-hand column (desktop layouts only). */
export function assistantOnRight(layout: Layout, desktop: boolean): boolean {
  return desktop && layout.assistantDock === 'right'
}

/**
 * Shows the assistant wherever it is docked (right column, or the bottom panel's Assistant tab). Opening is
 * idempotent: it never closes an open assistant (the panel's own collapse button does that).
 */
export function showAssistant(): void {
  const { layout, layoutClass, setLayout } = useWorkspaceStore.getState()
  if (layoutClass === 'spacious' && layout.assistantDock === 'right') {
    // Below 1700 px, three side panels would crush the canvas: the assistant takes the inspector's place (the
    // AI-assisted arrangement). Reopen the inspector at any time; nothing else changes.
    const narrow = typeof window !== 'undefined' && window.innerWidth < 1700
    setLayout({ assistantOpen: true, canvasMaximized: false, ...(narrow && !layout.assistantOpen && layout.treeOpen ? { inspectorOpen: false } : {}) })
  }
  else setLayout({ activityOpen: true, dockTab: 'assistant', assistantOpen: true, canvasMaximized: false })
}

/** Shows a bottom-panel tab (Activity, Validation). */
export function showDockTab(tab: Exclude<Layout['dockTab'], 'assistant'>): void {
  useWorkspaceStore.getState().setLayout({ activityOpen: true, dockTab: tab, canvasMaximized: false })
}

/** Moves the assistant between the right column and the bottom panel, keeping it open. */
export function dockAssistant(dock: Layout['assistantDock']): void {
  const { setLayout } = useWorkspaceStore.getState()
  if (dock === 'right') setLayout({ assistantDock: 'right', assistantOpen: true, dockTab: 'activity' })
  else setLayout({ assistantDock: 'bottom', assistantOpen: true, activityOpen: true, dockTab: 'assistant' })
}

import type { IconName } from '@ews/design-system'
import { DEFAULT_LAYOUTS, useWorkspaceStore, type Layout } from '../../platform/store'

/**
 * Workspace presets (brief §5). A preset is a set of layout preferences; applying one never touches engineering
 * data or view state, and the person can adjust everything afterwards (the layout then reads "Custom").
 */
export type PresetId = 'engineering' | 'ai-assisted' | 'review'

export const PRESETS: Record<PresetId, { label: string; description: string; icon: IconName; layout: Partial<Layout>; /** The right-hand tab the preset shows (not part of preset recognition: switching tabs keeps the preset). */ rightTab?: Layout['rightTab'] }> = {
  engineering: {
    label: 'Engineering',
    description: 'Explorer, large canvas and inspector; assistant collapsed',
    icon: 'layout',
    rightTab: 'inspector',
    layout: { treeOpen: true, inspectorOpen: true, assistantOpen: false, activityOpen: false, dockTab: 'activity' },
  },
  'ai-assisted': {
    label: 'AI-assisted',
    description: 'Explorer, canvas and the assistant expanded on the right',
    icon: 'assistant',
    rightTab: 'assistant',
    layout: { treeOpen: true, inspectorOpen: false, assistantOpen: true, assistantDock: 'right', activityOpen: false, dockTab: 'activity' },
  },
  review: {
    label: 'Review',
    description: 'Large canvas with traceability (inspector) and validation panels',
    icon: 'validate',
    rightTab: 'inspector',
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
  const { layout, rightTab } = PRESETS[id]
  useWorkspaceStore.getState().setLayout({ ...layout, ...(rightTab ? { rightTab } : {}), canvasMaximized: false })
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
 * The right-hand area holds the Inspector and, when the assistant is docked on the right, the AI Assistant as tabs of
 * one panel (owner decision 16 October 2026). It is open when either panel's flag is set; closing it clears both.
 */
export function rightAreaOpen(layout: Layout, desktop: boolean): boolean {
  return assistantOnRight(layout, desktop) ? layout.inspectorOpen || layout.assistantOpen : layout.inspectorOpen
}

/** The tab the right-hand area shows (the Inspector is the only content unless the assistant is docked there). */
export function rightTabShown(layout: Layout, desktop: boolean): Layout['rightTab'] {
  return assistantOnRight(layout, desktop) ? layout.rightTab : 'inspector'
}

/** Whether the Inspector is on screen now (drawer open, or the right-hand area open on its tab). */
export function inspectorVisible(layout: Layout, desktop: boolean): boolean {
  return rightAreaOpen(layout, desktop) && rightTabShown(layout, desktop) === 'inspector' && !(desktop && layout.canvasMaximized)
}

/** Whether the assistant is on screen now in the right-hand area. */
export function assistantVisibleRight(layout: Layout, desktop: boolean): boolean {
  return assistantOnRight(layout, desktop) && rightAreaOpen(layout, desktop) && layout.rightTab === 'assistant' && !layout.canvasMaximized
}

/** Shows the Inspector (selecting its tab when it shares the right-hand panel with the assistant). Idempotent. */
export function showInspector(): void {
  useWorkspaceStore.getState().setLayout({ inspectorOpen: true, rightTab: 'inspector', canvasMaximized: false })
}

/** Closes the right-hand area (both tabs). */
export function hideRightArea(): void {
  useWorkspaceStore.getState().setLayout({ inspectorOpen: false, assistantOpen: false })
}

/**
 * Shows the assistant wherever it is docked (its tab in the right-hand panel, or the bottom panel's Assistant tab).
 * Opening is idempotent: it never closes an open assistant (the panel's own hide button does that).
 */
export function showAssistant(): void {
  const { layout, layoutClass, setLayout } = useWorkspaceStore.getState()
  if (layoutClass === 'spacious' && layout.assistantDock === 'right') setLayout({ assistantOpen: true, rightTab: 'assistant', canvasMaximized: false })
  else setLayout({ activityOpen: true, dockTab: 'assistant', assistantOpen: true, canvasMaximized: false })
}

/** Shows a bottom-panel tab (Activity, Validation). */
export function showDockTab(tab: Exclude<Layout['dockTab'], 'assistant'>): void {
  useWorkspaceStore.getState().setLayout({ activityOpen: true, dockTab: tab, canvasMaximized: false })
}

/** Moves the assistant between the right column and the bottom panel, keeping it open. */
export function dockAssistant(dock: Layout['assistantDock']): void {
  const { setLayout } = useWorkspaceStore.getState()
  if (dock === 'right') setLayout({ assistantDock: 'right', assistantOpen: true, rightTab: 'assistant', dockTab: 'activity' })
  else setLayout({ assistantDock: 'bottom', assistantOpen: true, activityOpen: true, dockTab: 'assistant' })
}

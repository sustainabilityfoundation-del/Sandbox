import { useEffect, useSyncExternalStore } from 'react'
import type { Layout } from '../../platform/store'

/**
 * Layout modes chosen from the space available, never from device names or
 * the user agent:
 *   phone   – narrow (< 640 px wide) or very short (< 480 px high, e.g. a phone in landscape)
 *   tablet  – medium width: the active tool gets the space; tree and inspector are drawers
 *   desktop – wide (≥ 1100 px): side panels, bottom dock and optional split view
 */
export type ViewportMode = 'phone' | 'tablet' | 'desktop'

export function modeFor(width: number, height: number): ViewportMode {
  if (width < 640 || height < 480) return 'phone'
  if (width < 1100) return 'tablet'
  return 'desktop'
}

function subscribe(onChange: () => void) {
  window.addEventListener('resize', onChange)
  window.addEventListener('orientationchange', onChange)
  return () => {
    window.removeEventListener('resize', onChange)
    window.removeEventListener('orientationchange', onChange)
  }
}

const snapshot = () => modeFor(window.innerWidth, window.innerHeight)

export function useViewportMode(): ViewportMode {
  return useSyncExternalStore(subscribe, snapshot, () => 'desktop')
}

const sizeSnapshot = () => `${window.innerWidth}x${window.innerHeight}`

/** Re-renders on any viewport size change (used to clamp panel sizes). */
export function useViewportSize(): { width: number; height: number } {
  const key = useSyncExternalStore(subscribe, sizeSnapshot, () => '1280x800')
  const [width, height] = key.split('x').map(Number)
  return { width, height }
}

/**
 * Publishes the visual viewport height as --ws-vvh, so sheets can stay above
 * an on-screen keyboard on browsers that overlay it instead of resizing.
 */
export function useVisualViewportHeight(): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => document.documentElement.style.setProperty('--ws-vvh', `${Math.round(vv.height)}px`)
    update()
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [])
}

export const PANEL_LIMITS = {
  tree: { min: 200, max: 520, share: 0.4 },
  inspector: { min: 240, max: 560, share: 0.45 },
  dock: { min: 140, share: 0.7 },
  split: { min: 0.25, max: 0.75 },
}

/** Keeps restored or dragged sizes usable in the current viewport. */
export function clampLayout(layout: Layout, width: number, height: number): Layout {
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))
  return {
    ...layout,
    treeWidth: Math.floor(clamp(layout.treeWidth, PANEL_LIMITS.tree.min, Math.min(PANEL_LIMITS.tree.max, width * PANEL_LIMITS.tree.share))),
    inspectorWidth: Math.floor(
      clamp(layout.inspectorWidth, PANEL_LIMITS.inspector.min, Math.min(PANEL_LIMITS.inspector.max, width * PANEL_LIMITS.inspector.share)),
    ),
    dockHeight: Math.floor(clamp(layout.dockHeight, PANEL_LIMITS.dock.min, height * PANEL_LIMITS.dock.share)),
    split: layout.split
      ? { ...layout.split, ratio: clamp(layout.split.ratio, PANEL_LIMITS.split.min, PANEL_LIMITS.split.max) }
      : null,
  }
}

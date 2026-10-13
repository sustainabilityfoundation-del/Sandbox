import { useEffect } from 'react'
import { useViewerStore } from '../state/viewerStore'

/** F: fit · W: toggle wireframe · H: hide selected · Esc: clear selection. */
export function useKeyboardShortcuts(enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return

      const state = useViewerStore.getState()
      if (!state.model) return

      switch (e.key) {
        case 'f':
        case 'F':
          state.requestView('fit')
          break
        case 'w':
        case 'W':
          state.setDisplayMode(state.displayMode === 'solid' ? 'wireframe' : 'solid')
          break
        case 'h':
        case 'H':
          if (state.selectedId) {
            state.toggleHidden(state.selectedId)
            state.select(null)
          }
          break
        case 'Escape':
          state.select(null)
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}

import { useEffect } from 'react'
import { useViewerStore } from '../state/viewerStore'

/** F: fit · W: toggle wireframe · H: hide selected · Esc: clear selection. */
export function useKeyboardShortcuts(enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
      const target = e.target as HTMLElement | null
      // Never while typing (fields, ChatGPT, comboboxes) or while a dialog, sheet or menu is open.
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="searchbox"], [role="textbox"], [role="menu"]')) return
      if (document.querySelector('[aria-modal="true"]')) return

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

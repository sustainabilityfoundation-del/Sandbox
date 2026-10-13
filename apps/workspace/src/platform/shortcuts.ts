/**
 * Keyboard shortcut scoping. Single-key engineering shortcuts must never fire
 * while the user is typing (forms, ChatGPT, search, comboboxes) or while a
 * modal dialog is open.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  return !!el.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="searchbox"], [role="textbox"]')
}

/** Whether a modal overlay (dialog, drawer, sheet, command palette) is open. */
export function isModalOpen(): boolean {
  return typeof document !== 'undefined' && !!document.querySelector('[role="dialog"][aria-modal="true"]')
}

/** Shortcut guard for single-key engineering commands. */
export function shouldHandleShortcut(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  return !isTypingTarget(event.target) && !isModalOpen()
}

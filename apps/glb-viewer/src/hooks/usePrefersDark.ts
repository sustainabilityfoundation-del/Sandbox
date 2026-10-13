import { useSyncExternalStore } from 'react'

const query = '(prefers-color-scheme: dark)'

/**
 * Whether the page is in dark mode. Follows an explicit theme set on <html
 * data-theme> (the workspace's preference), otherwise the OS setting.
 */
function isDark(): boolean {
  const theme = document.documentElement.dataset.theme
  if (theme === 'dark' || theme === 'light') return theme === 'dark'
  return window.matchMedia(query).matches
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(query)
  media.addEventListener('change', onChange)
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => {
    media.removeEventListener('change', onChange)
    observer.disconnect()
  }
}

export function usePrefersDark(): boolean {
  return useSyncExternalStore(subscribe, isDark)
}

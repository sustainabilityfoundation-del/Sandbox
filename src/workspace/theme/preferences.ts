import { create } from 'zustand'
import { broadcast } from '../session/windowSession'

/**
 * Appearance preferences: theme and density. Stored in the browser, applied to
 * <html data-theme data-density>, and shared with the other workspace windows.
 * Styling is entirely token-driven, so changing these never touches engineering
 * state.
 */

export type ThemePreference = 'system' | 'light' | 'dark'
export type DensityPreference = 'comfortable' | 'compact'

interface Preferences {
  theme: ThemePreference
  density: DensityPreference
}

const KEY = 'ews.preferences.v1'
const DEFAULTS: Preferences = { theme: 'system', density: 'comfortable' }

function read(): Preferences {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<Preferences>) : {}
    return {
      theme: ['system', 'light', 'dark'].includes(parsed.theme as string) ? (parsed.theme as ThemePreference) : DEFAULTS.theme,
      density: ['comfortable', 'compact'].includes(parsed.density as string) ? (parsed.density as DensityPreference) : DEFAULTS.density,
    }
  } catch {
    return DEFAULTS
  }
}

const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

export function resolvedTheme(theme: ThemePreference): 'light' | 'dark' {
  if (theme === 'system') return darkQuery?.matches ? 'dark' : 'light'
  return theme
}

function apply({ theme, density }: Preferences) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = resolvedTheme(theme)
  root.dataset.density = density
}

interface PreferencesState extends Preferences {
  setTheme: (theme: ThemePreference) => void
  setDensity: (density: DensityPreference) => void
  /** Rereads preferences changed in another window. */
  reload: () => void
}

export const usePreferences = create<PreferencesState>()((set, get) => {
  const save = (next: Preferences) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
    apply(next)
    broadcast({ type: 'preferences' })
  }
  const initial = typeof window !== 'undefined' ? read() : DEFAULTS
  return {
    ...initial,
    setTheme: (theme) => {
      set({ theme })
      save({ theme, density: get().density })
    },
    setDensity: (density) => {
      set({ density })
      save({ theme: get().theme, density })
    },
    reload: () => {
      const next = read()
      set(next)
      apply(next)
    },
  }
})

/** Applies stored preferences before the first render, and follows OS theme changes. */
export function initPreferences(): void {
  apply(usePreferences.getState())
  darkQuery?.addEventListener('change', () => apply(usePreferences.getState()))
}

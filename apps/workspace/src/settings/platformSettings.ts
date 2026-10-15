import type { SettingDefinition, SettingValue } from '@ews/platform-sdk'
import { usePreferences, type DensityPreference, type ThemePreference } from '@ews/design-system/preferences'
import { PLANS, useEntitlements } from '../platform/entitlements'
import { DEV_USERS, saveServiceSettings, serviceSettings, type RequirementsMode } from '../platform/services'

/**
 * The Platform page: preferences that already exist in the header (Display and layout, Requirements
 * service, demo subscription). They stay where they are; this page edits the SAME state, so both places
 * always agree. They are this browser's preferences (stored locally, shared with its other windows),
 * not values on the settings service.
 */
export interface LocalBinding {
  get: () => SettingValue
  set: (value: SettingValue) => void
  subscribe: (listener: () => void) => () => void
  /** Explanation shown before a change that reloads every window. */
  reloads?: boolean
}

export interface LocalSetting {
  definition: SettingDefinition
  binding: LocalBinding
}

const noSubscribe = () => () => undefined

export const PLATFORM_PAGE = { id: 'platform', title: 'Platform' }

export const PLATFORM_SETTINGS: LocalSetting[] = [
  {
    definition: {
      id: 'platform.appearance.theme',
      label: 'Theme',
      description: 'System follows your operating system. Also in the header: Display and layout.',
      helpId: 'platform.settings',
      scope: 'user',
      type: 'enum',
      options: [
        { value: 'system', label: 'System' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
      default: 'system',
      group: 'Appearance',
    },
    binding: { get: () => usePreferences.getState().theme, set: (v) => usePreferences.getState().setTheme(v as ThemePreference), subscribe: (l) => usePreferences.subscribe(l) },
  },
  {
    definition: {
      id: 'platform.appearance.density',
      label: 'Density',
      description: 'Compact shows more rows; on touch screens controls stay at least 44 px.',
      helpId: 'platform.settings',
      scope: 'user',
      type: 'enum',
      options: [
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'compact', label: 'Compact' },
      ],
      default: 'comfortable',
      group: 'Appearance',
    },
    binding: { get: () => usePreferences.getState().density, set: (v) => usePreferences.getState().setDensity(v as DensityPreference), subscribe: (l) => usePreferences.subscribe(l) },
  },
  {
    definition: {
      id: 'platform.services.mode',
      label: 'Service mode',
      description: 'API uses the application backend (PostgreSQL); Demo uses sample data in this browser only. Changing it reloads every window.',
      helpId: 'platform.settings',
      scope: 'user',
      type: 'enum',
      options: [
        { value: 'api', label: 'API (PostgreSQL)' },
        { value: 'demo', label: 'Demo (in this browser)' },
      ],
      default: 'api',
      group: 'Services',
    },
    binding: { get: () => serviceSettings.requirementsMode, set: (v) => saveServiceSettings({ ...serviceSettings, requirementsMode: v as RequirementsMode }), subscribe: noSubscribe, reloads: true },
  },
  {
    definition: {
      id: 'platform.services.dev-user',
      label: 'Development user',
      description: 'The identity sent to the backend in development. Production uses single sign-on. Changing it reloads every window.',
      helpId: 'platform.settings',
      scope: 'user',
      type: 'enum',
      options: DEV_USERS.map((u) => ({ value: u.id, label: u.label })),
      default: 'eli',
      group: 'Services',
    },
    binding: { get: () => serviceSettings.devUser, set: (v) => saveServiceSettings({ ...serviceSettings, devUser: String(v) }), subscribe: noSubscribe, reloads: true },
  },
  {
    definition: {
      id: 'platform.subscription.plan',
      label: 'Subscription (demo)',
      description: 'Prototype only: this choice shapes the interface in the browser. The backend checks your real entitlements on every request.',
      helpId: 'platform.subscriptions',
      scope: 'user',
      type: 'enum',
      options: PLANS.map((p) => ({ value: p.id, label: p.name, description: p.description })),
      default: 'all',
      group: 'Subscription',
    },
    binding: { get: () => useEntitlements.getState().plan.id, set: (v) => useEntitlements.getState().setPlan(String(v)), subscribe: (l) => useEntitlements.subscribe(l) },
  },
]

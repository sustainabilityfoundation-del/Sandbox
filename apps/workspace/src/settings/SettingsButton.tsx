import { IconButton } from '@ews/design-system'
import { SettingsCentre, useSettingsCentre } from './SettingsCentre'

/** Header button beside the Help menu: opens the Settings centre (also via ?settings=<page-id>). */
export function SettingsButton() {
  return (
    <span data-help-id="platform.header.settings">
      <IconButton label="Settings" icon="settings" onPress={() => useSettingsCentre.getState().show()} className="text-header-fg" />
      <SettingsCentre />
    </span>
  )
}

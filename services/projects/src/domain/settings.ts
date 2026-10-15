import { checkSettingValue, type SettingDefinition } from '@ews/platform-sdk'

export type { SettingDefinition }

/** Checks a value against its definition (the SDK rule the settings service applies on the server). */
export const checkProjectSetting = (def: SettingDefinition, value: unknown): string | null => checkSettingValue(def, value)

/**
 * Project settings definitions (CR-PM-SET-1). The host registers them with the settings service
 * (`settingsRegistry.register(PROJECT_SETTINGS_PAGE, PROJECT_SETTING_DEFINITIONS)`); values live there, never here.
 * Module enablement settings (`projects.modules.<module>.enabled`) are generated per installed module.
 */
export const PROJECT_SETTINGS_PAGE = { id: 'projects', title: 'Project' }

const admin = { scope: 'project' as const, requiresPermission: 'administrator' as const }

export const PROJECT_SETTING_DEFINITIONS: SettingDefinition[] = [
  { ...admin, id: 'projects.units.system', group: 'Units', type: 'enum', label: 'Unit system', description: 'Preferred unit system for the project. Values are always stored with their units; this sets defaults for entry and display.', helpId: 'projects.settings.units', default: 'si', options: [{ value: 'si', label: 'SI' }, { value: 'imperial', label: 'Imperial (US customary)' }, { value: 'mixed', label: 'Mixed (as entered)' }] },
  { ...admin, id: 'projects.units.length', group: 'Units', type: 'enum', label: 'Length', description: 'Default length unit.', helpId: 'projects.settings.units', default: 'mm', options: ['mm', 'm', 'in', 'ft'].map((v) => ({ value: v, label: v })) },
  { ...admin, id: 'projects.units.mass', group: 'Units', type: 'enum', label: 'Mass', description: 'Default mass unit.', helpId: 'projects.settings.units', default: 'kg', options: ['kg', 'g', 'lb'].map((v) => ({ value: v, label: v })) },
  { ...admin, id: 'projects.units.force', group: 'Units', type: 'enum', label: 'Force', description: 'Default force unit.', helpId: 'projects.settings.units', default: 'N', options: ['N', 'kN', 'lbf'].map((v) => ({ value: v, label: v })) },
  { ...admin, id: 'projects.units.temperature', group: 'Units', type: 'enum', label: 'Temperature', description: 'Default temperature unit.', helpId: 'projects.settings.units', default: 'degC', options: [{ value: 'degC', label: '°C' }, { value: 'K', label: 'K' }, { value: 'degF', label: '°F' }] },
  { ...admin, id: 'projects.conventions.coordinate-system', group: 'Conventions', type: 'enum', label: 'Coordinate system', description: 'Global coordinate convention for models and drawings.', helpId: 'projects.settings.conventions', default: 'right-handed-z-up', options: [{ value: 'right-handed-z-up', label: 'Right-handed, Z up' }, { value: 'right-handed-y-up', label: 'Right-handed, Y up' }] },
  { ...admin, id: 'projects.conventions.drawing-projection', group: 'Conventions', type: 'enum', label: 'Drawing projection', description: 'Orthographic projection method for drawings.', helpId: 'projects.settings.conventions', default: 'first-angle', options: [{ value: 'first-angle', label: 'First angle (ISO E)' }, { value: 'third-angle', label: 'Third angle (ISO A)' }] },
  { ...admin, id: 'projects.standards.applicable', group: 'Standards', type: 'string', label: 'Applicable standards', description: 'Standards and editions that apply to the project, comma-separated (for example "ISO 26262:2018, IEC 61508:2010"). Selecting a standard records applicability only; it does not establish compliance.', helpId: 'projects.settings.standards', default: '', maxLength: 1000 },
  { ...admin, id: 'projects.standards.tolerancing', group: 'Standards', type: 'string', label: 'General tolerancing', description: 'General tolerance standard and class, for example "ISO 2768-mK".', helpId: 'projects.settings.standards', default: '', maxLength: 200 },
  { ...admin, id: 'projects.retention.deleted-days', group: 'Lifecycle', type: 'number', label: 'Retention of a deleted project', description: 'Days a deleted project stays restorable. Module data is never deleted by Project Management.', helpId: 'projects.lifecycle.delete', default: 30, min: 7, max: 3650, integer: true, unit: 'd' },
]

/** One enablement setting per installed module (disabling never deletes data). */
export function moduleEnablementDefinitions(modules: { id: string; name: string }[]): SettingDefinition[] {
  return modules.map((m) => ({ ...admin, id: `projects.modules.${m.id}.enabled`, group: 'Modules', type: 'boolean' as const, label: m.name, description: `Show ${m.name} in this project. Turning it off hides it and never deletes its data.`, helpId: 'projects.settings.modules', default: true }))
}

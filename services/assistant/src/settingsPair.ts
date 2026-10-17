import type { SettingDefinition, SettingValue } from '@ews/platform-sdk'

export interface PairInput {
  id: string
  ceilingId: string
  ceilingDefault: SettingValue
  label: string
  description: string
  group: string
  [key: string]: unknown
}

/** A user setting and the project ceiling (administrator) that bounds it. */
export function pair(base: PairInput): SettingDefinition[] {
  const { ceilingId, ceilingDefault, ...rest } = base
  const user = { ...rest, scope: 'user', ceiling: ceilingId } as SettingDefinition
  const ceiling = { ...rest, id: ceilingId, label: `${rest.label} (project limit)`, description: `Upper limit for everyone in the project: ${rest.description}`, scope: 'project', requiresPermission: 'administrator', default: ceilingDefault, group: `Project limits: ${rest.group}` } as SettingDefinition
  return [user, ceiling]
}

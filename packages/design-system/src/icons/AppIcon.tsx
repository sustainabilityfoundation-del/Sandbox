import type { IconWeight } from '@phosphor-icons/react'
import type { SVGProps } from 'react'
import type { IconName } from './names'
import { ICON_REGISTRY } from './registry'

/** Shared icon sizes (px), matching the type scale. */
export const ICON_SIZE = { xs: 14, sm: 16, md: 20, lg: 24, xl: 32 } as const
export type IconSize = keyof typeof ICON_SIZE | number

export interface AppIconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'ref' | 'children'> {
  name: IconName
  size?: IconSize
  /**
   * Accessible label. Without one the icon is decorative (aria-hidden); put
   * the accessible name on the interactive control instead.
   */
  label?: string
  /** Selected or active state: the filled variant. */
  filled?: boolean
  /** Override the default weight (duotone for tools and objects, regular for actions). */
  weight?: IconWeight
}

/**
 * The one icon component. Colour comes from currentColor, so icons follow the
 * text colour tokens of their context.
 */
export function AppIcon({ name, size = 'md', label, filled, weight, className, ...rest }: AppIconProps) {
  const entry = ICON_REGISTRY[name]
  const Glyph = entry.icon
  const px = typeof size === 'number' ? size : ICON_SIZE[size]
  return (
    <Glyph
      size={px}
      weight={weight ?? (filled ? 'fill' : entry.weight)}
      mirrored={entry.mirrored}
      color="currentColor"
      className={['ws-icon flex-none', className].filter(Boolean).join(' ')}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
      {...(rest as object)}
    />
  )
}

/** Alias kept for components written against the earlier name. */
export const Icon = AppIcon

import type { SVGProps } from 'react'
import type { IconName } from './names'
import { ICON_REGISTRY, type IconWeight } from './registry'

export type { IconWeight }

/**
 * Shared icon sizes (px). Standards: 16 in dense toolbars, trees and menus (`sm`), 18–20 in primary
 * navigation (`nav`, `md`).
 */
export const ICON_SIZE = { xs: 14, sm: 16, nav: 18, md: 20, lg: 24, xl: 32 } as const
export type IconSize = keyof typeof ICON_SIZE | number

/** Stroke width per weight, on the 24-unit grid (one consistent weight across the interface by default). */
const STROKE: Record<IconWeight, number> = { thin: 1.25, light: 1.5, regular: 1.75, duotone: 1.75, bold: 2.25, fill: 2 }

export interface AppIconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'ref' | 'children'> {
  name: IconName
  size?: IconSize
  /**
   * Accessible label. Without one the icon is decorative (aria-hidden); put
   * the accessible name on the interactive control instead.
   */
  label?: string
  /** Selected or active state: a tonal fill behind the stroke. */
  filled?: boolean
  /** Override the default weight (stroke width; `fill` adds the tonal fill). */
  weight?: IconWeight
}

/**
 * The one icon component. Colour comes from currentColor, so icons follow the
 * text colour tokens of their context. Every rendered icon carries
 * `data-icon="<semantic name>"`, which tests use to tell registry icons apart.
 */
export function AppIcon({ name, size = 'md', label, filled, weight, className, style, ...rest }: AppIconProps) {
  const entry = ICON_REGISTRY[name]
  const Glyph = entry.icon
  const px = typeof size === 'number' ? size : ICON_SIZE[size]
  const resolved: IconWeight = weight ?? (filled ? 'fill' : entry.weight)
  return (
    <Glyph
      size={px}
      strokeWidth={STROKE[resolved]}
      color="currentColor"
      fill={resolved === 'fill' ? 'currentColor' : 'none'}
      fillOpacity={resolved === 'fill' ? 0.2 : undefined}
      className={['ws-icon flex-none', entry.mirrored ? '-scale-x-100' : '', className].filter(Boolean).join(' ')}
      data-icon={name}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
      style={style}
      {...(rest as object)}
    />
  )
}

/** Alias kept for components written against the earlier name. */
export const Icon = AppIcon

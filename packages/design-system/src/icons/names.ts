/**
 * Semantic icon names. Tools and the shell refer to icons by meaning
 * ("requirements", "save", "locked"); the design system decides which glyph
 * that is (see registry.tsx: Lucide, or a custom engineering glyph with the
 * same interface). React-free, so contracts can reference it. Names are a
 * shared contract: add, never rename or remove.
 *
 * The list is split by domain in names/: core.ts, glyphs.ts, cad.ts, sysml.ts. A module adds its names to its domain
 * file (a new file for a new domain, listed below) and maps them in registry.tsx. Order is the concatenation below.
 */
import { CAD_ICON_NAMES } from './names/cad'
import { CORE_ICON_NAMES } from './names/core'
import { GLYPH_ICON_NAMES } from './names/glyphs'
import { SYSML_ICON_NAMES } from './names/sysml'

export const ICON_NAMES = [...CORE_ICON_NAMES, ...GLYPH_ICON_NAMES, ...CAD_ICON_NAMES, ...SYSML_ICON_NAMES] as const

export type IconName = (typeof ICON_NAMES)[number]

export function isIconName(value: string): value is IconName {
  return (ICON_NAMES as readonly string[]).includes(value)
}

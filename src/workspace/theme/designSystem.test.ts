import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspace = resolve(__dirname, '..')

function files(dir: string, extensions: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path, extensions)
    return extensions.some((e) => name.endsWith(e)) && !name.endsWith('.test.ts') ? [path] : []
  })
}

const HARD_CODED_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/

describe('styling contract for registered tools', () => {
  const toolFiles = files(join(workspace, 'tools'), ['.ts', '.tsx', '.css'])

  it.each(toolFiles.map((f) => [relative(workspace, f), f]))('%s uses design tokens only', (_name, path) => {
    const source = readFileSync(path, 'utf8')
    const lines = source.split('\n')
    const offenders = lines
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => HARD_CODED_COLOUR.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    expect(offenders, 'hard-coded colours; use var(--ws-…) tokens or semantic Tailwind classes').toEqual([])
    expect(source.includes('style={{'), 'inline styles; use classes and tokens').toBe(false)
  })

  it.each(toolFiles.filter((f) => f.endsWith('.tsx')).map((f) => [relative(workspace, f), f]))(
    '%s uses the shared SDK controls',
    (_name, path) => {
      const source = readFileSync(path, 'utf8')
      expect(source.match(/<(button|select|textarea)\b/g) ?? [], 'use Button, IconButton, Select, TextArea from the SDK').toEqual([])
      // A hidden file picker is the only raw input allowed (it has no visible styling).
      const inputs = source.match(/<input\b[^>]*/g) ?? []
      expect(inputs.filter((i) => !/type="file"/.test(i)), 'use TextInput, Checkbox from the SDK').toEqual([])
    },
  )

  it.each(files(join(workspace, 'tools'), ['.css']).map((f) => [relative(workspace, f), f]))(
    '%s is confined to the components cascade layer',
    (_name, path) => {
      const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').trim()
      expect(css.startsWith('@layer components {')).toBe(true)
    },
  )

  it('shell and SDK code contain no hard-coded colours', () => {
    const shared = [...files(join(workspace, 'shell'), ['.tsx', '.ts', '.css']), ...files(join(workspace, 'sdk'), ['.tsx', '.ts']), join(workspace, 'workspace.css')]
    const offenders = shared.flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => HARD_CODED_COLOUR.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*'))
        .map((line) => `${relative(workspace, path)}: ${line.trim()}`),
    )
    expect(offenders).toEqual([])
  })
})

// ---- Contrast -------------------------------------------------------------------------

function parseTheme(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  const block = css.slice(start, css.indexOf('\n}', start))
  return Object.fromEntries([...block.matchAll(/(--ws-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

function luminance(hex: string): number {
  const v = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

describe('theme contrast (WCAG AA, 4.5:1 for text)', () => {
  const css = readFileSync(join(workspace, 'theme/tokens.css'), 'utf8')
  const light = parseTheme(css, ":root[data-theme='light'] {")
  const darkOverrides = parseTheme(css, ":root[data-theme='dark'] {")
  const dark = { ...light, ...darkOverrides }
  const resolve = (theme: Record<string, string>, name: string): string => {
    const value = theme[name]
    const ref = /^var\((--ws-[\w-]+)\)$/.exec(value ?? '')
    return ref ? resolve(theme, ref[1]) : value
  }
  const pairs: [string, string][] = [
    ['--ws-text', '--ws-surface'],
    ['--ws-text', '--ws-bg'],
    ['--ws-text-2', '--ws-surface'],
    ['--ws-text-3', '--ws-surface'],
    ['--ws-text-3', '--ws-surface-2'],
    ['--ws-on-accent', '--ws-accent'],
    ['--ws-accent', '--ws-surface'],
    ['--ws-selected-text', '--ws-selected'],
    ['--ws-success', '--ws-success-soft'],
    ['--ws-warning', '--ws-warning-soft'],
    ['--ws-danger', '--ws-danger-soft'],
    ['--ws-info', '--ws-info-soft'],
    ['--ws-header-text', '--ws-header-bg'],
    ['--ws-header-text-2', '--ws-header-bg'],
  ]

  for (const [name, theme] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    it.each(pairs)(`${name}: %s on %s`, (fg, bg) => {
      expect(contrast(resolve(theme, fg), resolve(theme, bg))).toBeGreaterThanOrEqual(4.5)
    })
  }
})

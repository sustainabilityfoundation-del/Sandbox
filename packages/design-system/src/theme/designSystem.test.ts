import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ICON_NAMES } from '../icons/names'
import { ICON_REGISTRY } from '../icons/registry'

/** packages/design-system/src */
const workspace = resolve(__dirname, '..')
const repo = resolve(__dirname, '../../../..')
const shellSrc = join(repo, 'apps/workspace/src')

function files(dir: string, extensions: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === 'node_modules' || name.startsWith('dist')) return []
    if (statSync(path).isDirectory()) return files(path, extensions)
    return extensions.some((e) => name.endsWith(e)) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

const toolPackages = readdirSync(join(repo, 'packages'))
  .filter((name) => name.startsWith('tool-'))
  .map((name) => join(repo, 'packages', name))

const HARD_CODED_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/

describe('styling contract for tool packages', () => {
  const toolFiles = toolPackages.flatMap((dir) => [...files(join(dir, 'src'), ['.ts', '.tsx', '.css']), ...files(join(dir, 'harness'), ['.ts', '.tsx'])])

  it('finds the tool packages', () => {
    expect(toolPackages.map((p) => p.split(/[\\/]/).pop())).toEqual(['tool-cad', 'tool-requirements', 'tool-sysml'])
  })

  it.each(toolFiles.map((f) => [relative(repo, f), f]))('%s uses design tokens only', (_name, path) => {
    const source = readFileSync(path, 'utf8')
    const offenders = source
      .split('\n')
      .filter((line) => HARD_CODED_COLOUR.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    expect(offenders, 'hard-coded colours; use var(--ws-…) tokens or semantic Tailwind classes').toEqual([])
    expect(source.includes('style={{'), 'inline styles; use classes and tokens').toBe(false)
  })

  it.each(toolFiles.filter((f) => f.endsWith('.tsx')).map((f) => [relative(repo, f), f]))('%s uses the shared controls', (_name, path) => {
    const source = readFileSync(path, 'utf8')
    expect(source.match(/<(button|select|textarea)\b/g) ?? [], 'use Button, IconButton, Select, TextField from @ews/design-system').toEqual([])
    const inputs = source.match(/<input\b[^>]*/g) ?? []
    expect(inputs.filter((i) => !/type="file"/.test(i)), 'use TextField, Checkbox from @ews/design-system').toEqual([])
  })

  it.each(toolFiles.filter((f) => f.endsWith('.css')).map((f) => [relative(repo, f), f]))('%s is confined to the components cascade layer', (_name, path) => {
    const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').trim()
    expect(css.startsWith('@layer components {')).toBe(true)
  })

  it.each(toolFiles.filter((f) => /\.tsx?$/.test(f)).map((f) => [relative(repo, f), f]))('%s gets controls and icons only from the design system', (_name, path) => {
    const source = readFileSync(path, 'utf8')
    expect(source.match(/from '(react-aria-components|react-aria|@phosphor-icons\/[^']+|@mui\/[^']+|antd|@radix-ui\/[^']+|@headlessui\/[^']+|@material-symbols\/[^']+)'/g) ?? []).toEqual([])
  })
})

describe('one component library and one icon set', () => {
  it('uses no competing component or icon libraries anywhere in the monorepo', () => {
    const manifests = [join(repo, 'package.json'), ...['apps', 'packages'].flatMap((d) => readdirSync(join(repo, d)).map((n) => join(repo, d, n, 'package.json')))]
    for (const manifest of manifests) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies })
      expect(deps.filter((d) => /^(@mui\/|antd$|@radix-ui\/|@headlessui\/|@chakra-ui\/|react-bootstrap$|@mantine\/|lucide|react-icons$|@fortawesome\/|@material-symbols\/)/.test(d)), manifest).toEqual([])
    }
  })

  it('imports Phosphor icons only in the central registry', () => {
    const sources = [...files(join(repo, 'packages'), ['.ts', '.tsx']), ...files(shellSrc, ['.ts', '.tsx'])]
    const offenders = sources.filter((p) => !p.endsWith(join('icons', 'registry.tsx')) && !p.endsWith(join('icons', 'AppIcon.tsx')) && /from '@phosphor-icons\//.test(readFileSync(p, 'utf8')))
    expect(offenders.map((p) => relative(repo, p))).toEqual([])
  })

  it('maps every semantic icon name to an installed Phosphor icon or a custom SVG with the same interface', () => {
    for (const name of ICON_NAMES) {
      const entry = ICON_REGISTRY[name]
      expect(entry, name).toBeTruthy()
      expect(['regular', 'duotone']).toContain(entry.weight)
      // Phosphor icons and the custom icons are forwardRef components.
      expect(typeof entry.icon === 'object' || typeof entry.icon === 'function', name).toBe(true)
    }
    // Tools and model categories use duotone; actions use regular.
    expect(ICON_REGISTRY.requirements.weight).toBe('duotone')
    expect(ICON_REGISTRY.component.weight).toBe('duotone')
    expect(ICON_REGISTRY.save.weight).toBe('regular')
  })

  it('tools declare semantic icon names that exist', () => {
    for (const dir of toolPackages) {
      const index = readFileSync(join(dir, 'src', 'index.ts'), 'utf8')
      const icon = /\bicon: '([a-z-]+)'/.exec(index)?.[1]
      expect(icon && (ICON_NAMES as readonly string[]).includes(icon), dir).toBe(true)
    }
  })
})

describe('shell styling', () => {
  it('the shell and ChatGPT panel use the shared component library', () => {
    const offenders = files(join(shellSrc, 'shell'), ['.tsx']).flatMap((path) =>
      (readFileSync(path, 'utf8').match(/<(button|select|textarea|input)\b/g) ?? []).map((m) => `${relative(repo, path)}: ${m}`),
    )
    expect(offenders).toEqual([])
  })

  it('shell, SDK and design-system code contain no hard-coded colours', () => {
    const shared = [
      ...files(join(shellSrc, 'shell'), ['.tsx', '.ts', '.css']),
      ...files(join(repo, 'packages/platform-sdk/src'), ['.tsx', '.ts']),
      join(shellSrc, 'workspace.css'),
      join(workspace, 'theme/shared.css'),
    ]
    const offenders = shared.flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => HARD_CODED_COLOUR.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*'))
        .map((line) => `${relative(repo, path)}: ${line.trim()}`),
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
    ['--ws-inverse-text', '--ws-inverse-surface'],
    ['--ws-text-2', '--ws-surface-3'],
    ['--ws-accent', '--ws-surface-2'],
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

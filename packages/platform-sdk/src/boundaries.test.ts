import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Package boundaries. These rules keep each tool movable to its own repository
 * and publishable as a versioned package without changing its host integration.
 */

const repo = resolve(__dirname, '../../..')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === 'node_modules' || name.startsWith('dist')) return []
    if (statSync(path).isDirectory()) return files(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

function imports(path: string): string[] {
  // Comments may mention imports (e.g. usage notes); only code counts.
  const source = readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  return [...source.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2] ?? m[3])
}

/** Allowed '@ews/…' imports per package (subpath entries included). */
const ALLOWED: Record<string, RegExp> = {
  'packages/model-service': /^$/,
  'packages/design-system': /^$/,
  'packages/platform-sdk': /^@ews\/(model-service|design-system)(\/[\w-]+(\.css)?)?$/,
  // The Requirements tool may also use its own module's client (docs/specifications/requirements-contracts.md).
  'packages/tool-requirements': /^@ews\/(platform-sdk|design-system|requirements-client)(\/[\w.-]+)?$/,
  'packages/tool-sysml': /^@ews\/(platform-sdk|design-system)(\/[\w.-]+)?$/,
  'packages/tool-cad': /^@ews\/(platform-sdk|design-system)(\/[\w.-]+)?$/,
  // The workspace may use every package, but only a tool's public entry point.
  'apps/workspace': /^@ews\/(model-service|design-system|platform-sdk|tool-[\w-]+|requirements-client|conceptualize-client)(\/(react|harness|testing|preferences|icon-names|styles\.css))?$/,
  // Requirements module packages, checked once they exist. Only the client reaches the browser.
  'packages/requirements-client': /^@ews\/platform-sdk$/,
  'packages/reqif': /^$/,
  'services/requirements': /^@ews\/(platform-sdk|reqif)$/,
  'services/api': /^@ews\/(platform-sdk|requirements-service|conceptualize-service|sysml-service|settings-service|assistant-service)$/,
  // Conceptualize (docs/specifications/conceptualize-contracts.md). Only the client reaches the browser.
  'packages/tool-conceptualize': /^@ews\/(platform-sdk|design-system|conceptualize-client)(\/[\w.-]+)?$/,
  'packages/conceptualize-client': /^@ews\/platform-sdk$/,
  'services/conceptualize': /^@ews\/platform-sdk$/,
  // SysML Modeler (docs/specifications/sysml-program-contracts.md §3). Only the client and the framework-free core reach the browser.
  'packages/tool-sysml-modeler': /^@ews\/(platform-sdk|design-system|sysml-client|sysml-core)(\/[\w.-]+)?$/,
  'packages/sysml-client': /^@ews\/sysml-core$/,
  'packages/sysml-core': /^$/,
  'services/sysml': /^@ews\/sysml-core$/,
  // AI connection (docs/specifications/ai-connection.md §5, §5a): framework-free SDK contract only; hosted by services/api.
  'services/settings': /^@ews\/platform-sdk$/,
  'services/assistant': /^@ews\/platform-sdk$/,
}

describe('package boundaries', () => {
  for (const [pkg, allowed] of Object.entries(ALLOWED)) {
    const root = join(repo, pkg)
    if (!existsSync(join(root, 'package.json'))) continue
    const sources = [...files(join(root, 'src')), ...(pkg.startsWith('packages/tool-') ? files(join(root, 'harness')) : [])]

    it(`${pkg}: imports only the packages it may depend on`, () => {
      const bad = sources.flatMap((path) =>
        imports(path)
          .filter((spec) => spec.startsWith('@ews/') && !allowed.test(spec))
          .map((spec) => `${relative(repo, path)} → ${spec}`),
      )
      expect(bad).toEqual([])
    })

    it(`${pkg}: relative imports stay inside the package`, () => {
      const bad = sources.flatMap((path) =>
        imports(path)
          .filter((spec) => spec.startsWith('.'))
          .filter((spec) => !resolve(dirname(path), spec).startsWith(root + sep))
          .map((spec) => `${relative(repo, path)} → ${spec}`),
      )
      expect(bad).toEqual([])
    })

    it(`${pkg}: declares its @ews dependencies in package.json`, () => {
      const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
      const declared = new Set(Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }))
      const used = new Set(
        sources.flatMap((path) => imports(path).filter((s) => s.startsWith('@ews/')).map((s) => s.split('/').slice(0, 2).join('/'))),
      )
      expect([...used].filter((u) => !declared.has(u))).toEqual([])
    })
  }

  it('tools never reach the repository or the workspace store directly', () => {
    const toolSources = ['tool-requirements', 'tool-sysml', 'tool-cad'].flatMap((t) => files(join(repo, 'packages', t, 'src')))
    const bad = toolSources.filter((p) => /\b(DemoRepository|useWorkspaceStore|localStorage)\b/.test(readFileSync(p, 'utf8')))
    expect(bad.map((p) => relative(repo, p))).toEqual([])
  })

  it('the contract entry point and the model service are framework-free', () => {
    const pure = [...files(join(repo, 'packages/model-service/src')), ...files(join(__dirname, 'contract')), join(__dirname, 'index.ts')]
    const bad = pure.filter((p) => !/\.test\.ts$/.test(p) && imports(p).some((s) => s === 'react' || s.startsWith('react-') || s.startsWith('react/')))
    expect(bad.map((p) => relative(repo, p))).toEqual([])
  })

  it('the workspace renders tools through the registry, with no tool-specific branches', () => {
    const shell = files(join(repo, 'apps/workspace/src/shell'))
    const bad = shell.filter((p) => /\b(toolId|tool\.id|activeToolId)\s*===\s*['"](requirements|sysml|cad)['"]/.test(readFileSync(p, 'utf8')))
    expect(bad.map((p) => relative(repo, p))).toEqual([])
  })
})

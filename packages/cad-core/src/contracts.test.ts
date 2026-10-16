import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import schema from '../schema/ews-cad.schema.json'
import { applyTransaction, commandCatalog, createDocument, serializeDocument, validateDocument, type CadDocument } from './index'

/**
 * Machine-readable contracts: the JSON Schema of the native format agrees with the TypeScript
 * validator on real documents, the published command catalogue is current, and the CAD packages
 * respect their dependency boundaries (until the platform boundary test covers them).
 */

const repo = resolve(__dirname, '../../..')

function sampleDocument(): CadDocument {
  const r = applyTransaction(createDocument({ documentId: '00000000-0000-4000-8000-0000000000cc', title: 'All features', createdAt: '2026-10-14T00:00:00Z', writer: { tool: 'test', version: '0' } }), {
    commands: [
      { command: 'create_part', input: { name: 'Sample', ref: '$p', material: { name: 'Steel', density: 7850 } } },
      { command: 'create_parameter', input: { partId: '$p', name: 'w', expression: '40', description: 'width' } },
      { command: 'create_parameter', input: { partId: '$p', name: 'a', expression: '90', unit: 'deg' } },
      { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
      { command: 'add_rectangle', input: { sketchId: '$s', width: 'w', height: 20, ref: '$r' } },
      { command: 'add_arc', input: { sketchId: '$s', center: [60, 0], start: [70, 0], end: [60, 10], construction: true } },
      { command: 'apply_constraint', input: { sketchId: '$s', type: 'distance', entities: ['$r.points.0', '$r.points.2'], driving: false } },
      { command: 'extrude_profile', input: { sketchId: '$s', distance: 5, direction: 'symmetric', ref: '$e' } },
      { command: 'create_sketch', input: { partId: '$p', plane: 'XZ', offset: 'w', ref: '$t' } },
      { command: 'add_rectangle', input: { sketchId: '$t', corner: [5, 0], width: 5, height: 10 } },
      { command: 'revolve_profile', input: { sketchId: '$t', axis: 'y-axis', angle: 'a', operation: 'join' } },
      // Format 1.2: regular polygon, linear pattern, parameter binding.
      { command: 'create_sketch', input: { partId: '$p', plane: 'XY', offset: 5, ref: '$hx' } },
      { command: 'add_regular_polygon', input: { sketchId: '$hx', center: [10, 10], sides: 6, size: { acrossFlats: 4 }, rotation: 30 } },
      { command: 'extrude_profile', input: { sketchId: '$hx', distance: 2, direction: 'reverse', operation: 'cut', ref: '$pk' } },
      { command: 'pattern_linear', input: { features: ['$pk'], direction: 'x', count: 3, spacing: 'w / 4' } },
      { command: 'bind_parameter', input: { partId: '$p', name: 'w', ref: { module: 'conceptualize', kind: 'constraint', id: 'c-1', revision: 1 }, quantity: 'width' } },
      { command: 'add_semantic', input: { partId: '$p', kind: 'interface', name: 'Mount', targets: ['$e'] } },
      { command: 'add_reference', input: { subject: '$p', role: 'represents', target: { module: 'twin', id: 'HSG-110', revision: 3, kind: 'part' } } },
      { command: 'set_suppressed', input: { featureId: '$e', suppressed: true } },
    ],
  })
  if (!r.ok) throw new Error(r.error.message)
  return r.doc
}

describe('native format JSON Schema', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true })
  const validate = ajv.compile(schema)

  it('accepts documents written by the command layer (every feature and entity type)', () => {
    const doc = JSON.parse(serializeDocument(sampleDocument()))
    expect(validate(doc), JSON.stringify(validate.errors)).toBe(true)
    expect(validateDocument(doc)).toEqual([])
    expect(validate(createDocument({ documentId: 'x' }))).toBe(true)
  })

  it('rejects malformed documents, as the TypeScript validator does', () => {
    const doc = JSON.parse(serializeDocument(sampleDocument()))
    const bad = [
      { ...doc, format: 'other' },
      { ...doc, formatVersion: '2.0.0' },
      { ...doc, units: { length: 'in', angle: 'deg' } },
      { ...doc, assemblies: [{}] },
      { ...doc, parts: [{ ...doc.parts[0], features: [{ ...doc.parts[0].features[1], type: 'fillet' }] }] },
    ]
    for (const b of bad) {
      expect(validate(b)).toBe(false)
      expect(validateDocument(b).length).toBeGreaterThan(0)
    }
  })
})

describe('command catalogue', () => {
  it('docs/modules/cad/commands.json is generated from the registry (run npm run cad:commands)', () => {
    const published = JSON.parse(readFileSync(join(repo, 'docs/modules/cad/commands.json'), 'utf8'))
    expect(published).toEqual(JSON.parse(JSON.stringify(commandCatalog())))
  })
})

function sources(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === 'node_modules' || name.startsWith('dist')) return []
    return statSync(path).isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

describe('CAD package boundaries (ADR-0020)', () => {
  const RULES: Record<string, { ews: RegExp; forbidden: RegExp }> = {
    'packages/cad-core': { ews: /^$/, forbidden: /^(react|react-dom|three|replicad|replicad-opencascadejs)(\/|$)/ },
    'packages/cad-client': { ews: /^@ews\/(cad-core|platform-sdk)$/, forbidden: /^(react|react-dom|three|replicad|replicad-opencascadejs|pg|fastify)(\/|$)/ },
    'services/cad': { ews: /^@ews\/(cad-core(\/schema\/ews-cad\.schema\.json)?|platform-sdk|cad-client)$/, forbidden: /^(react|react-dom|three|replicad|replicad-opencascadejs)(\/|$)/ },
    'packages/cad-kernel': { ews: /^@ews\/cad-core$/, forbidden: /^(react|react-dom|three)(\/|$)/ },
    'packages/tool-cad-modeler': { ews: /^@ews\/(platform-sdk|design-system|cad-core|cad-kernel|cad-client)(\/[\w.-]+)?$/, forbidden: /^(replicad|replicad-opencascadejs|react-aria-components|@phosphor-icons\/.*)(\/|$)/ },
  }
  for (const [pkg, rule] of Object.entries(RULES)) {
    it(`${pkg} imports only what it may`, () => {
      const bad: string[] = []
      for (const file of [...sources(join(repo, pkg, 'src')), ...sources(join(repo, pkg, 'harness'))]) {
        const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
        for (const m of code.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
          const spec = m[1] ?? m[2]
          if (spec.startsWith('@ews/') && !rule.ews.test(spec)) bad.push(`${relative(repo, file)} → ${spec}`)
          if (rule.forbidden.test(spec)) bad.push(`${relative(repo, file)} → ${spec}`)
          if (spec.startsWith('.') && !resolve(file, '..', spec).startsWith(join(repo, pkg))) bad.push(`${relative(repo, file)} → ${spec} (leaves the package)`)
        }
      }
      expect(bad).toEqual([])
    })
  }
})

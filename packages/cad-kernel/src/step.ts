/**
 * Structural inspection of STEP (ISO 10303-21) text, independent of the kernel: header, schema
 * (AP203 / AP214 / AP242), entity counts, product names, units and colours. Used by tests and by the
 * export report shown to people and the assistant.
 */

export interface StepInspection {
  valid: boolean
  problems: string[]
  schema: string | null
  applicationProtocol: 'AP203' | 'AP214' | 'AP242' | 'unknown'
  fileName: string | null
  entityCount: number
  /** Counts of selected entity types. */
  entities: Record<string, number>
  products: string[]
  lengthUnit: string | null
  colours: number
}

const COUNTED = [
  'MANIFOLD_SOLID_BREP',
  'BREP_WITH_VOIDS',
  'CLOSED_SHELL',
  'ADVANCED_FACE',
  'EDGE_CURVE',
  'VERTEX_POINT',
  'PLANE',
  'CYLINDRICAL_SURFACE',
  'CONICAL_SURFACE',
  'TOROIDAL_SURFACE',
  'B_SPLINE_SURFACE_WITH_KNOTS',
  'PRODUCT',
  'NEXT_ASSEMBLY_USAGE_OCCURRENCE',
  'STYLED_ITEM',
  'COLOUR_RGB',
]

export function inspectStep(text: string): StepInspection {
  const problems: string[] = []
  const t = text.replace(/\r\n/g, '\n')
  if (!t.trimStart().startsWith('ISO-10303-21;')) problems.push('Missing "ISO-10303-21;" at the start of the file.')
  if (!/END-ISO-10303-21;\s*$/.test(t)) problems.push('Missing "END-ISO-10303-21;" at the end of the file.')
  const header = /HEADER;([\s\S]*?)ENDSEC;/.exec(t)?.[1] ?? ''
  if (!header) problems.push('Missing HEADER section.')
  if (!/DATA;[\s\S]*ENDSEC;/.test(t)) problems.push('Missing DATA section.')
  const schema = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/.exec(header)?.[1] ?? null
  if (!schema) problems.push('Missing FILE_SCHEMA.')
  const ap = !schema ? 'unknown' : /AP242|MANAGED_MODEL_BASED_3D_ENGINEERING|10303 442/i.test(schema) ? 'AP242' : /AUTOMOTIVE_DESIGN|AP214/i.test(schema) ? 'AP214' : /CONFIG_CONTROL_DESIGN|AP203/i.test(schema) ? 'AP203' : 'unknown'
  const fileName = /FILE_NAME\s*\(\s*'([^']*)'/.exec(header)?.[1] ?? null

  const data = /DATA;([\s\S]*)ENDSEC;/.exec(t)?.[1] ?? ''
  const records = data.split(/;\s*\n/).map((s) => s.trim()).filter((s) => /^#\d+\s*=/.test(s))
  const entities: Record<string, number> = Object.fromEntries(COUNTED.map((k) => [k, 0]))
  const ids = new Set<string>()
  const products: string[] = []
  for (const rec of records) {
    const id = /^#(\d+)/.exec(rec)![1]
    if (ids.has(id)) problems.push(`Duplicate entity #${id}.`)
    ids.add(id)
    const body = rec.slice(rec.indexOf('=') + 1).trim()
    for (const m of body.matchAll(/\b([A-Z][A-Z0-9_]*)\s*\(/g)) if (m[1] in entities) entities[m[1]]++
    const product = /^PRODUCT\s*\(\s*'([^']*)'/.exec(body)
    if (product) products.push(product[1])
  }
  // Every referenced entity must exist.
  const dangling = new Set<string>()
  for (const rec of records) for (const m of rec.slice(rec.indexOf('=') + 1).matchAll(/#(\d+)/g)) if (!ids.has(m[1])) dangling.add(m[1])
  if (dangling.size) problems.push(`References to missing entities: ${[...dangling].slice(0, 5).map((d) => `#${d}`).join(', ')}${dangling.size > 5 ? '…' : ''}.`)
  const unit = /LENGTH_UNIT\s*\(\s*\)\s*NAMED_UNIT\s*\(\s*\*\s*\)\s*SI_UNIT\s*\(\s*(\.\w+\.|\$)\s*,\s*\.METRE\.\s*\)/.exec(data)
  const lengthUnit = unit ? (unit[1] === '.MILLI.' ? 'mm' : unit[1] === '$' ? 'm' : unit[1].replace(/\./g, '').toLowerCase() + 'm') : /CONVERSION_BASED_UNIT\s*\(\s*'INCH'/i.test(data) ? 'inch' : null
  return {
    valid: problems.length === 0,
    problems,
    schema,
    applicationProtocol: ap,
    fileName,
    entityCount: records.length,
    entities,
    products,
    lengthUnit,
    colours: entities.COLOUR_RGB,
  }
}

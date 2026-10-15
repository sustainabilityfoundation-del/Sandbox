import { CadError } from '../errors'
import { namesIn } from '../expr/parameters'
import { PARAMETER_NAME, parseExpression } from '../expr/expression'
import { checkConstraintReferences } from '../sketch/solver'
import { stableStringify } from '../util'
import {
  FORMAT,
  FORMAT_VERSION,
  IMPLICIT_SKETCH_ENTITIES,
  isDimensional,
  type CadDocument,
  type Feature,
  type Part,
  type SketchFeature,
} from './types'

export interface NewDocumentOptions {
  documentId?: string
  title?: string
  createdAt?: string
  writer?: { tool: string; version: string }
}

function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  // Fallback (non-cryptographic), only for environments without crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function createDocument(options: NewDocumentOptions = {}): CadDocument {
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    documentId: options.documentId ?? uuid(),
    version: 0,
    nextId: 1,
    units: { length: 'mm', angle: 'deg' },
    metadata: { title: options.title ?? 'Untitled', createdAt: options.createdAt, writer: options.writer },
    parts: [],
    references: [],
  }
}

const major = (v: string) => Number(/^(\d+)\./.exec(v)?.[1] ?? NaN)

/** Every entity ID in the document (parts, parameters, features, sketch entities, constraints, semantics, references). */
export function allIds(doc: CadDocument): string[] {
  const ids: string[] = []
  for (const p of doc.parts) {
    ids.push(p.id, ...p.parameters.map((x) => x.id), ...p.semantics.map((x) => x.id))
    for (const f of p.features) {
      ids.push(f.id)
      if (f.type === 'sketch') ids.push(...f.entities.map((e) => e.id), ...f.constraints.map((c) => c.id))
    }
  }
  ids.push(...doc.references.map((r) => r.id))
  return ids
}

/**
 * Structural and referential validation of a document (beyond the JSON Schema): unique IDs,
 * features referring only to earlier sketches, sketch references, parameter names and expressions.
 * Returns problems; an empty list means the document can be regenerated.
 */
export function validateDocument(doc: unknown): string[] {
  const problems: string[] = []
  if (!doc || typeof doc !== 'object') return ['The document is not a JSON object.']
  const d = doc as CadDocument
  if (d.format !== FORMAT) problems.push(`format must be "${FORMAT}" (got ${JSON.stringify(d.format)}).`)
  if (typeof d.formatVersion !== 'string' || major(d.formatVersion) !== major(FORMAT_VERSION)) problems.push(`formatVersion ${JSON.stringify(d.formatVersion)} is not supported by this reader (major ${major(FORMAT_VERSION)}).`)
  if (typeof d.documentId !== 'string' || !d.documentId) problems.push('documentId is required.')
  if (!Number.isInteger(d.version) || d.version < 0) problems.push('version must be a non-negative integer.')
  if (!Number.isInteger(d.nextId) || d.nextId < 1) problems.push('nextId must be a positive integer.')
  if (!d.units || d.units.length !== 'mm' || d.units.angle !== 'deg') problems.push('units must be { length: "mm", angle: "deg" } in format 1.0.')
  if (!Array.isArray(d.parts)) problems.push('parts must be a list.')
  if (!Array.isArray(d.references)) problems.push('references must be a list.')
  if (Array.isArray(d.assemblies) && d.assemblies.length) problems.push('assemblies are reserved for a later format version and not supported yet.')
  if (Array.isArray(d.configurations) && d.configurations.length) problems.push('configurations are reserved for a later format version and not supported yet.')
  if (problems.length) return problems

  const ids = allIds(d)
  const seen = new Set<string>()
  for (const id of ids) {
    if (typeof id !== 'string' || !id) problems.push('Every entity needs a non-empty string ID.')
    else if (seen.has(id)) problems.push(`Duplicate ID ${id}.`)
    seen.add(id)
  }
  for (const part of d.parts) problems.push(...validatePart(part))
  const known = new Set(ids)
  for (const r of d.references) {
    const featureNames = new Set(d.parts.flatMap((p) => p.features.map((f) => f.id)))
    if (!known.has(r.subject) && !(typeof r.subject === 'string' && featureNames.has(r.subject.split('/')[0]))) problems.push(`Reference ${r.id}: subject ${r.subject} does not exist.`)
  }
  return problems
}

function validatePart(part: Part): string[] {
  const problems: string[] = []
  const names = new Set<string>()
  for (const p of part.parameters) {
    if (!PARAMETER_NAME.test(p.name)) problems.push(`Parameter ${p.id}: name “${p.name}” is not a valid identifier.`)
    if (names.has(p.name)) problems.push(`Parameter name “${p.name}” is used twice in ${part.id}.`)
    names.add(p.name)
    try {
      parseExpression(p.expression)
    } catch (e) {
      problems.push(`Parameter ${p.name}: ${(e as Error).message}`)
    }
  }
  const sketchesSoFar = new Map<string, SketchFeature>()
  for (const f of part.features) {
    if (f.type === 'sketch') {
      const entities = new Map(f.entities.map((e) => [e.id, e]))
      for (const e of f.entities) {
        if ((IMPLICIT_SKETCH_ENTITIES as readonly string[]).includes(e.id)) problems.push(`Sketch ${f.id}: ${e.id} is a reserved ID.`)
        const refs = e.type === 'line' ? [e.start, e.end] : e.type === 'circle' ? [e.center] : e.type === 'arc' ? [e.center, e.start, e.end] : []
        for (const r of refs) if (entities.get(r)?.type !== 'point' && r !== 'origin') problems.push(`Sketch ${f.id}: ${e.id} refers to ${r}, which is not a point of the sketch.`)
      }
      for (const c of f.constraints) {
        const problem = checkConstraintReferences(entities, c)
        if (problem) problems.push(`Sketch ${f.id}, constraint ${c.id}: ${problem}`)
        if (isDimensional(c.type) && c.driving !== false && c.value === undefined) problems.push(`Sketch ${f.id}, constraint ${c.id}: a driving ${c.type} needs a value.`)
        for (const n of namesIn(c.value)) if (!names.has(n)) problems.push(`Sketch ${f.id}, constraint ${c.id}: unknown parameter “${n}”.`)
      }
      sketchesSoFar.set(f.id, f)
    } else {
      if (!sketchesSoFar.has(f.sketch)) problems.push(`Feature ${f.id} refers to sketch ${f.sketch}, which does not exist earlier in ${part.id}.`)
      for (const n of featureNames(f)) if (!names.has(n)) problems.push(`Feature ${f.id}: unknown parameter “${n}”.`)
      if (f.type === 'revolve' && !['x-axis', 'y-axis'].includes(f.axis)) {
        const sk = sketchesSoFar.get(f.sketch)
        if (sk && sk.entities.find((e) => e.id === f.axis)?.type !== 'line') problems.push(`Feature ${f.id}: axis ${f.axis} is not a line of sketch ${f.sketch}.`)
      }
    }
  }
  return problems
}

/** Parameter names a feature's own values use. */
export function featureNames(f: Feature): string[] {
  if (f.type === 'extrude') return namesIn(f.extent.distance)
  if (f.type === 'revolve') return namesIn(f.angle)
  return [...namesIn(f.plane.offset), ...f.constraints.flatMap((c) => namesIn(c.value))]
}

/** Canonical JSON text of a document (sorted keys, two-space indentation, trailing newline). */
export function serializeDocument(doc: CadDocument): string {
  return JSON.stringify(JSON.parse(stableStringify(doc)), null, 2) + '\n'
}

/** Parses and validates a native file. Throws `invalid-document` with every problem found. */
export function parseDocument(text: string): CadDocument {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (e) {
    throw new CadError('invalid-document', `The file is not valid JSON: ${(e as Error).message}`)
  }
  const problems = validateDocument(value)
  if (problems.length) throw new CadError('invalid-document', `The file is not a valid ews-cad document: ${problems.slice(0, 8).join(' ')}${problems.length > 8 ? ` (and ${problems.length - 8} more)` : ''}`, { problems })
  return value as CadDocument
}

export function findPart(doc: CadDocument, partId: string): Part {
  const p = doc.parts.find((x) => x.id === partId)
  if (!p) throw new CadError('not-found', `Part ${partId} does not exist.`, { id: partId })
  return p
}

export function findFeature(doc: CadDocument, featureId: string): { part: Part; feature: Feature; index: number } {
  for (const part of doc.parts) {
    const index = part.features.findIndex((f) => f.id === featureId)
    if (index >= 0) return { part, feature: part.features[index], index }
  }
  throw new CadError('not-found', `Feature ${featureId} does not exist.`, { id: featureId })
}

export function findSketch(doc: CadDocument, sketchId: string): { part: Part; sketch: SketchFeature } {
  const { part, feature } = findFeature(doc, sketchId)
  if (feature.type !== 'sketch') throw new CadError('invalid-input', `${sketchId} is a ${feature.type}, not a sketch.`, { id: sketchId })
  return { part, sketch: feature }
}

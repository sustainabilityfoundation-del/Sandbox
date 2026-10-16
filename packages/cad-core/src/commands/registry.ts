import { CadError } from '../errors'
import { PARAMETER_NAME, RESERVED_NAMES, evaluate as evaluateExpr, parseExpression } from '../expr/expression'
import { evaluateParameters, namesIn } from '../expr/parameters'
import { featureNames, findFeature, findPart, findSketch } from '../model/document'
import type { JsonSchema } from '../model/jsonSchema'
import {
  DIMENSIONAL_CONSTRAINTS,
  GEOMETRIC_CONSTRAINTS,
  IMPLICIT_SKETCH_ENTITIES,
  isDimensional,
  type BodyOperation,
  type ConstraintType,
  type Expr,
  type ExtrudeDirection,
  type Feature,
  type Part,
  type PlaneRef,
  type ReferenceModule,
  type ReferenceRole,
  type SemanticKind,
  type SketchConstraint,
  type SketchEntity,
  type SketchFeature,
  type StandardPlane,
} from '../model/types'
import { checkConstraintReferences } from '../sketch/solver'
import type { CommandContext, CommandSpec } from './types'

// ---- schema fragments --------------------------------------------------------------------------

const id = (description: string): JsonSchema => ({ type: 'string', minLength: 1, maxLength: 128, description })
const name = (description = 'Display name'): JsonSchema => ({ type: 'string', minLength: 1, maxLength: 120, description })
const expr = (description: string): JsonSchema => ({ type: ['number', 'string'], description: `${description} A number in document units (mm, deg) or an expression over part parameters, e.g. "width / 2" or "1 in".` })
const ref: JsonSchema = { type: 'string', pattern: '^\\$[A-Za-z][A-Za-z0-9_-]*$', description: 'Placeholder ("$name") that later commands in the same transaction can use instead of the new ID.' }
const coords: JsonSchema = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'Sketch coordinates [x, y] in mm.' }
const pointInput = (description: string): JsonSchema => ({ oneOf: [{ type: 'string', minLength: 1, description: 'ID of an existing sketch point (or "origin")' }, coords], description })
const PLANES: StandardPlane[] = ['XY', 'XZ', 'YZ']
const OPERATIONS: BodyOperation[] = ['new', 'join', 'cut']
const DIRECTIONS: ExtrudeDirection[] = ['normal', 'reverse', 'symmetric']
const CONSTRAINT_TYPES: ConstraintType[] = [...GEOMETRIC_CONSTRAINTS, ...DIMENSIONAL_CONSTRAINTS]

const obj = (properties: Record<string, JsonSchema>, required: string[]): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false })

// ---- helpers ------------------------------------------------------------------------------------

function checkExpr(part: Part, value: Expr | undefined, field: string) {
  if (value === undefined) return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CadError('invalid-input', `${field} must be a finite number.`)
    return
  }
  parseExpression(value)
  const known = new Set(part.parameters.map((p) => p.name))
  const unknown = namesIn(value).filter((n) => !known.has(n))
  if (unknown.length) throw new CadError('invalid-expression', `${field}: unknown parameter${unknown.length > 1 ? 's' : ''} ${unknown.map((n) => `“${n}”`).join(', ')} in ${part.name}.`, { field, unknown })
}

function sketchOf(ctx: CommandContext, sketchId: string) {
  return findSketch(ctx.doc, sketchId)
}

/** Resolves a point input to a point ID, creating a point for coordinates. */
function pointFrom(ctx: CommandContext, sketch: SketchFeature, input: unknown, construction = false): string {
  if (typeof input === 'string') {
    if (input === 'origin') return 'origin'
    const e = sketch.entities.find((x) => x.id === input)
    if (!e) throw new CadError('not-found', `Point ${input} does not exist in ${sketch.id}.`, { id: input })
    if (e.type !== 'point') throw new CadError('invalid-input', `${input} is a ${e.type}, not a point.`, { id: input })
    return input
  }
  const [x, y] = input as [number, number]
  const pid = ctx.newId('pt')
  sketch.entities.push({ id: pid, type: 'point', x, y, ...(construction ? { construction: true } : {}) })
  ctx.created(pid)
  return pid
}


function addConstraint(ctx: CommandContext, part: Part, sketch: SketchFeature, c: Omit<SketchConstraint, 'id'>): string {
  const entities = new Map(sketch.entities.map((e) => [e.id, e]))
  const problem = checkConstraintReferences(entities, c)
  if (problem) throw new CadError('invalid-input', problem, { type: c.type, entities: c.entities })
  if (isDimensional(c.type)) {
    if (c.driving !== false && c.value === undefined) throw new CadError('invalid-input', `A driving ${c.type} dimension needs a value.`)
    checkExpr(part, c.value, 'value')
    if (typeof c.value === 'number' && ['length', 'radius', 'diameter'].includes(c.type) && c.value <= 0) throw new CadError('invalid-input', `${c.type} must be greater than zero.`)
  } else if (c.value !== undefined) throw new CadError('invalid-input', `${c.type} is a geometric constraint and takes no value.`)
  const cid = ctx.newId('cn')
  sketch.constraints.push({ id: cid, ...c })
  ctx.created(cid)
  ctx.modified(sketch.id)
  return cid
}

/** Feature IDs a feature refers to: its sketch, target body, datum plane, and the features owning the faces it names. */
export function referencesOf(f: Feature): string[] {
  const owners = (names: string[]) => names.map((n) => n.split('/')[0])
  const out: string[] = []
  if (f.type === 'extrude' || f.type === 'revolve') out.push(f.sketch)
  if ((f.type === 'extrude' || f.type === 'revolve' || f.type === 'fillet' || f.type === 'chamfer') && f.target) out.push(f.target)
  if (f.type === 'fillet' || f.type === 'chamfer') for (const e of f.edges) out.push(...owners((/^edge\((.*)\)(#\d+)?$/.exec(e)?.[1] ?? '').split('|').filter(Boolean)))
  if (f.type === 'pattern-linear') out.push(...f.features)
  if (f.type === 'sketch' || f.type === 'datum-plane') {
    if (f.plane.kind === 'datum') out.push(f.plane.datum)
    if (f.plane.kind === 'face') out.push(...owners([f.plane.face]))
  }
  return [...new Set(out)]
}

/** Features that refer to a feature (see referencesOf). */
function dependentsOf(part: Part, featureId: string): string[] {
  return part.features.filter((f) => f.id !== featureId && referencesOf(f).includes(featureId)).map((f) => f.id)
}

function parameterUsers(part: Part, paramName: string): string[] {
  return [
    ...part.parameters.filter((p) => namesIn(p.expression).includes(paramName)).map((p) => p.id),
    ...part.features.filter((f) => featureNames(f).includes(paramName)).map((f) => f.id),
  ]
}

const define = <I,>(spec: CommandSpec<I>): CommandSpec<Record<string, unknown>> => spec as unknown as CommandSpec<Record<string, unknown>>

// ---- linear patterns ------------------------------------------------------------------------------

const AXIS_NAMES = ['x', 'y', 'z', '-x', '-y', '-z']
const vec3: JsonSchema = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'Model vector [x, y, z].' }

function directionOf(input: unknown): [number, number, number] {
  if (typeof input === 'string') {
    const m = /^(-?)([xyz])$/.exec(input)
    if (!m) throw new CadError('invalid-input', `Unknown direction "${input}" (use x, y, z, -x, -y, -z or a vector).`)
    const v: [number, number, number] = [0, 0, 0]
    v['xyz'.indexOf(m[2])] = m[1] ? -1 : 1
    return v
  }
  const v = input as number[]
  const len = Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? Math.hypot(v[0], v[1], v[2]) : 0
  if (!(len > 1e-9)) throw new CadError('invalid-input', 'The direction must be a non-zero [x, y, z] vector.')
  return [v[0] / len, v[1] / len, v[2] / len]
}

function patternCount(part: Part, count: Expr): Expr {
  checkExpr(part, count, 'count')
  if (typeof count === 'number' && !(Number.isInteger(count) && count >= 2)) throw new CadError('invalid-input', `count must be an integer of at least 2 (got ${count}).`)
  return count
}

function patternTargets(part: Part, ids: string[], before?: string): string[] {
  const end = before ? part.features.findIndex((f) => f.id === before) : part.features.length
  const earlier = part.features.slice(0, end < 0 ? part.features.length : end)
  for (const id of ids) {
    const f = earlier.find((x) => x.id === id)
    if (!f) throw new CadError('not-found', `Feature ${id} does not exist earlier in ${part.name}.`)
    if (f.type !== 'extrude' && f.type !== 'revolve') throw new CadError('invalid-input', `${id} is a ${f.type}; a linear pattern repeats extrudes and revolves.`)
  }
  return [...new Set(ids)]
}

// ---- planes ---------------------------------------------------------------------------------------

type PlaneInput = { plane?: StandardPlane; datum?: string; face?: string; offset?: Expr }

const planeInputSchema: Record<string, JsonSchema> = {
  plane: { type: 'string', enum: PLANES, description: 'Standard plane.' },
  datum: { type: 'string', minLength: 1, description: 'A datum plane of the part (create_datum_plane).' },
  face: { type: 'string', minLength: 1, maxLength: 300, description: 'Stable name of a planar face, e.g. "ext-5/cap-end" (query get_entities).' },
  offset: expr('Offset along the plane normal.'),
}

/** Builds a PlaneRef from command input; references must exist earlier than `before` (or anywhere for new features). */
function planeFromInput(part: Part, i: PlaneInput, before?: string): PlaneRef {
  const given = [i.plane, i.datum, i.face].filter((x) => x !== undefined).length
  if (given !== 1) throw new CadError('invalid-input', 'Give exactly one of plane (XY, XZ, YZ), datum or face.')
  checkExpr(part, i.offset, 'offset')
  const offset = i.offset !== undefined && i.offset !== 0 ? { offset: i.offset } : {}
  const limit = before ? part.features.findIndex((f) => f.id === before) : part.features.length
  const earlier = part.features.slice(0, limit < 0 ? part.features.length : limit)
  if (i.plane) return { kind: 'standard', plane: i.plane, ...offset }
  if (i.datum) {
    if (earlier.find((f) => f.id === i.datum)?.type !== 'datum-plane') throw new CadError('not-found', `${i.datum} is not a datum plane earlier in ${part.name}.`)
    return { kind: 'datum', datum: i.datum, ...offset }
  }
  const owner = i.face!.split('/')[0]
  if (!i.face!.includes('/') || !earlier.some((f) => f.id === owner)) throw new CadError('not-found', `${i.face} is not a face name of an earlier feature (expected "<featureId>/<role>", e.g. "ext-5/cap-end").`)
  return { kind: 'face', face: i.face!, ...offset }
}

/** The part to add a body-modifying feature to: the target body's part, else the only/first part. */
function activePart(ctx: CommandContext, target?: string): Part {
  if (target) return findFeature(ctx.doc, target).part
  const part = ctx.doc.parts.at(-1)
  if (!part) throw new CadError('not-found', 'The document has no part.')
  return part
}

// ---- commands -------------------------------------------------------------------------------------

export const COMMANDS: CommandSpec[] = [
  // Document and parts
  define<{ title?: string; description?: string }>({
    name: 'set_document_metadata',
    category: 'document',
    summary: 'Set the document title or description.',
    input: obj({ title: name('Document title'), description: { type: 'string', maxLength: 2000 } }, []),
    output: '{}',
    preconditions: [],
    errors: ['invalid-input'],
    undo: 'Restores the previous metadata.',
    apply(ctx, i) {
      if (i.title !== undefined) ctx.doc.metadata.title = i.title
      if (i.description !== undefined) ctx.doc.metadata.description = i.description
      ctx.modified(ctx.doc.documentId)
      return {}
    },
  }),
  define<{ conceptId: string; revision: number; label?: string; handoff?: { id: string; revision: number } }>({
    name: 'set_document_source',
    category: 'document',
    summary:
      'Record the Conceptualize concept (and optionally the CAD handoff package) this document was started from, at an exact revision. Provenance only: nothing is copied; when the concept is revised later the document can be reported as possibly outdated, and it is never regenerated automatically.',
    input: obj(
      {
        conceptId: { type: 'string', minLength: 1, maxLength: 300, description: 'Concept ID (UUID) in Conceptualize.' },
        revision: { type: 'integer', minimum: 1, description: 'Concept revision the document is based on.' },
        label: { type: 'string', maxLength: 200, description: 'Display text captured now (not authoritative), e.g. "CON-012 Bit holder".' },
        handoff: obj({ id: { type: 'string', minLength: 1, maxLength: 300 }, revision: { type: 'integer', minimum: 1 } }, ['id', 'revision']),
      },
      ['conceptId', 'revision'],
    ),
    output: '{}',
    preconditions: ['revision is a positive integer.'],
    errors: ['invalid-input'],
    undo: 'Restores the previous source (or none).',
    apply(ctx, i) {
      if (!Number.isInteger(i.revision) || i.revision < 1) throw new CadError('invalid-input', 'revision must be a positive integer.')
      ctx.doc.metadata.source = {
        concept: { module: 'conceptualize', kind: 'concept', id: i.conceptId, revision: i.revision, ...(i.label ? { label: i.label } : {}) },
        ...(i.handoff ? { handoff: { id: i.handoff.id, revision: i.handoff.revision } } : {}),
      }
      ctx.modified(ctx.doc.documentId)
      return {}
    },
  }),
  define<Record<string, never>>({
    name: 'clear_document_source',
    category: 'document',
    summary: 'Remove the recorded source concept of the document.',
    input: obj({}, []),
    output: '{}',
    preconditions: ['A source is recorded.'],
    errors: ['precondition-failed'],
    undo: 'Restores the source.',
    apply(ctx) {
      if (!ctx.doc.metadata.source) throw new CadError('precondition-failed', 'The document has no recorded source concept.')
      delete ctx.doc.metadata.source
      ctx.modified(ctx.doc.documentId)
      return {}
    },
  }),
  define<{ name: string; ref?: string; material?: { name: string; density: number } }>({
    name: 'create_part',
    category: 'part',
    summary: 'Create an empty part (a container for parameters and a feature history).',
    input: obj({ name: name('Part name'), ref, material: obj({ name: name('Material name'), density: { type: 'number', exclusiveMinimum: 0, description: 'kg/m³' } }, ['name', 'density']) }, ['name']),
    output: '{ partId }',
    preconditions: [],
    errors: ['invalid-input'],
    undo: 'Removes the part.',
    apply(ctx, i) {
      const partId = ctx.newId('part')
      ctx.doc.parts.push({ id: partId, name: i.name, parameters: [], features: [], semantics: [], ...(i.material ? { material: i.material } : {}) })
      ctx.created(partId)
      return { partId }
    },
  }),
  define<{ id: string; name: string }>({
    name: 'rename',
    category: 'part',
    summary: 'Rename a part or feature (display name only; IDs never change).',
    input: obj({ id: id('Part or feature ID'), name: name() }, ['id', 'name']),
    output: '{}',
    preconditions: ['The part or feature exists.'],
    errors: ['not-found', 'invalid-input'],
    undo: 'Restores the previous name.',
    apply(ctx, i) {
      const part = ctx.doc.parts.find((p) => p.id === i.id)
      if (part) part.name = i.name
      else findFeature(ctx.doc, i.id).feature.name = i.name
      ctx.modified(i.id)
      return {}
    },
  }),
  define<{ partId: string; name: string; density: number }>({
    name: 'set_material',
    category: 'part',
    summary: 'Set the material of a part (used for mass properties).',
    input: obj({ partId: id('Part ID'), name: name('Material name'), density: { type: 'number', exclusiveMinimum: 0, description: 'Density in kg/m³' } }, ['partId', 'name', 'density']),
    output: '{}',
    preconditions: ['The part exists.'],
    errors: ['not-found', 'invalid-input'],
    undo: 'Restores the previous material.',
    apply(ctx, i) {
      findPart(ctx.doc, i.partId).material = { name: i.name, density: i.density }
      ctx.modified(i.partId)
      return {}
    },
  }),

  // Parameters
  define<{ partId: string; name: string; expression: Expr; unit?: 'mm' | 'deg' | 'none'; description?: string; ref?: string }>({
    name: 'create_parameter',
    category: 'parameter',
    summary: 'Create a named design parameter with an expression.',
    input: obj(
      {
        partId: id('Part ID'),
        name: { type: 'string', pattern: PARAMETER_NAME.source, description: 'Identifier used in expressions' },
        expression: expr('Value.'),
        unit: { type: 'string', enum: ['mm', 'deg', 'none'], default: 'mm' },
        description: { type: 'string', maxLength: 500 },
        ref,
      },
      ['partId', 'name', 'expression'],
    ),
    output: '{ parameterId }',
    preconditions: ['The name is a valid identifier, not reserved (functions, constants, units) and unique in the part.', 'The expression only uses existing parameters and creates no cycle.'],
    errors: ['not-found', 'invalid-input', 'invalid-expression', 'cycle'],
    undo: 'Removes the parameter.',
    apply(ctx, i) {
      const part = findPart(ctx.doc, i.partId)
      if (RESERVED_NAMES.has(i.name)) throw new CadError('invalid-input', `“${i.name}” is reserved (function, constant or unit).`)
      if (part.parameters.some((p) => p.name === i.name)) throw new CadError('precondition-failed', `${part.name} already has a parameter “${i.name}”.`)
      const expression = String(i.expression)
      checkExpr(part, expression, 'expression')
      const pid = ctx.newId('par')
      part.parameters.push({ id: pid, name: i.name, expression, unit: i.unit ?? 'mm', ...(i.description ? { description: i.description } : {}) })
      const evaluated = evaluateParameters(part).parameters.find((p) => p.id === pid)!
      if (evaluated.error?.code === 'cycle') throw new CadError('cycle', evaluated.error.message)
      ctx.created(pid)
      return { parameterId: pid, value: evaluated.value ?? null }
    },
  }),
  define<{ partId: string; name: string; expression: Expr }>({
    name: 'set_parameter',
    category: 'parameter',
    summary: 'Change a parameter’s expression; dependent sketches and features regenerate.',
    input: obj({ partId: id('Part ID'), name: { type: 'string', minLength: 1, description: 'Parameter name' }, expression: expr('New value.') }, ['partId', 'name', 'expression']),
    output: '{ parameterId, value }',
    preconditions: ['The parameter exists.', 'The expression only uses existing parameters and creates no cycle.'],
    errors: ['not-found', 'invalid-expression', 'cycle'],
    undo: 'Restores the previous expression.',
    apply(ctx, i) {
      const part = findPart(ctx.doc, i.partId)
      const p = part.parameters.find((x) => x.name === i.name)
      if (!p) throw new CadError('not-found', `${part.name} has no parameter “${i.name}”. It has ${part.parameters.map((x) => x.name).join(', ') || 'none'}.`)
      const expression = String(i.expression)
      checkExpr(part, expression, 'expression')
      p.expression = expression
      const evaluated = evaluateParameters(part).parameters.find((x) => x.id === p.id)!
      if (evaluated.error?.code === 'cycle') throw new CadError('cycle', evaluated.error.message)
      if (evaluated.error) throw new CadError('invalid-expression', evaluated.error.message)
      ctx.modified(p.id)
      return { parameterId: p.id, value: evaluated.value }
    },
  }),
  define<{ partId: string; name: string }>({
    name: 'delete_parameter',
    category: 'parameter',
    summary: 'Delete an unused parameter.',
    input: obj({ partId: id('Part ID'), name: { type: 'string', minLength: 1 } }, ['partId', 'name']),
    output: '{}',
    preconditions: ['No parameter, dimension or feature uses it.'],
    errors: ['not-found', 'in-use'],
    undo: 'Restores the parameter.',
    apply(ctx, i) {
      const part = findPart(ctx.doc, i.partId)
      const p = part.parameters.find((x) => x.name === i.name)
      if (!p) throw new CadError('not-found', `${part.name} has no parameter “${i.name}”.`)
      const users = parameterUsers(part, p.name)
      if (users.length) throw new CadError('in-use', `“${p.name}” is used by ${users.join(', ')}.`, { users })
      part.parameters = part.parameters.filter((x) => x !== p)
      ctx.deleted(p.id)
      return {}
    },
  }),

  // Sketches
  define<PlaneInput & { partId: string; name?: string; ref?: string }>({
    name: 'create_sketch',
    category: 'sketch',
    summary: 'Create an empty sketch on a standard plane (XY, XZ or YZ), a datum plane or a planar face (by stable name), optionally offset along its normal.',
    input: obj({ partId: id('Part ID'), ...planeInputSchema, name: name('Sketch name'), ref }, ['partId']),
    output: '{ sketchId }',
    preconditions: ['The part exists.', 'Exactly one of plane, datum or face is given; a datum is a datum plane earlier in the part; a face names a face of an earlier feature (planarity is checked at regeneration).'],
    errors: ['not-found', 'invalid-input', 'invalid-expression'],
    undo: 'Removes the sketch.',
    apply(ctx, i) {
      const part = findPart(ctx.doc, i.partId)
      const plane = planeFromInput(part, i)
      const sid = ctx.newId('sk')
      const n = part.features.filter((f) => f.type === 'sketch').length + 1
      part.features.push({ id: sid, type: 'sketch', name: i.name ?? `Sketch ${n}`, plane, entities: [], constraints: [] })
      ctx.created(sid)
      return { sketchId: sid }
    },
  }),
  define<PlaneInput & { sketchId: string }>({
    name: 'set_sketch_plane',
    category: 'sketch',
    summary: 'Move a sketch to another standard plane, datum plane or planar face, or change its offset.',
    input: obj({ sketchId: id('Sketch ID'), ...planeInputSchema }, ['sketchId']),
    output: '{}',
    preconditions: ['The sketch exists.', 'Exactly one of plane, datum or face; references must come earlier in the history than the sketch.'],
    errors: ['not-found', 'invalid-input', 'invalid-expression'],
    undo: 'Restores the previous plane.',
    apply(ctx, i) {
      const { part, sketch } = sketchOf(ctx, i.sketchId)
      sketch.plane = planeFromInput(part, i, sketch.id)
      ctx.modified(sketch.id)
      return {}
    },
  }),
  define<PlaneInput & { partId: string; name?: string; ref?: string }>({
    name: 'create_datum_plane',
    category: 'feature',
    summary: 'Create a datum (reference) plane: a standard plane, another datum plane or a planar face, offset along its normal. Sketches can be placed on it.',
    input: obj({ partId: id('Part ID'), ...planeInputSchema, name: name('Datum plane name'), ref }, ['partId']),
    output: '{ datumId }',
    preconditions: ['Exactly one of plane, datum or face; references must exist earlier in the part.'],
    errors: ['not-found', 'invalid-input', 'invalid-expression'],
    undo: 'Removes the datum plane.',
    apply(ctx, i) {
      const part = findPart(ctx.doc, i.partId)
      const plane = planeFromInput(part, i)
      const did = ctx.newId('dp')
      const n = part.features.filter((f) => f.type === 'datum-plane').length + 1
      part.features.push({ id: did, type: 'datum-plane', name: i.name ?? `Datum plane ${n}`, plane })
      ctx.created(did)
      return { datumId: did }
    },
  }),
define<{ sketchId: string; x: number; y: number; construction?: boolean; ref?: string }>({
    name: 'add_point',
    category: 'sketch',
    summary: 'Add a point to a sketch.',
    input: obj({ sketchId: id('Sketch ID'), x: { type: 'number' }, y: { type: 'number' }, construction: { type: 'boolean' }, ref }, ['sketchId', 'x', 'y']),
    output: '{ pointId }',
    preconditions: ['The sketch exists.'],
    errors: ['not-found', 'invalid-input'],
    undo: 'Removes the point.',
    apply(ctx, i) {
      const { sketch } = sketchOf(ctx, i.sketchId)
      const pointId = pointFrom(ctx, sketch, [i.x, i.y], i.construction)
      ctx.modified(sketch.id)
      return { pointId }
    },
  }),
  define<{ sketchId: string; start: string | [number, number]; end: string | [number, number]; construction?: boolean; ref?: string }>({
    name: 'add_line',
    category: 'sketch',
    summary: 'Add a line segment between two points (existing point IDs or new coordinates).',
    input: obj({ sketchId: id('Sketch ID'), start: pointInput('Start point'), end: pointInput('End point'), construction: { type: 'boolean', description: 'Construction lines are ignored by profiles (e.g. revolution axes).' }, ref }, ['sketchId', 'start', 'end']),
    output: '{ lineId, start, end }',
    preconditions: ['The sketch exists; referenced points exist; start and end differ.'],
    errors: ['not-found', 'invalid-input'],
    undo: 'Removes the line and points it created.',
    apply(ctx, i) {
      const { sketch } = sketchOf(ctx, i.sketchId)
      const start = pointFrom(ctx, sketch, i.start)
      const end = pointFrom(ctx, sketch, i.end)
      if (start === end) throw new CadError('invalid-input', 'A line needs two different points.')
      const lineId = ctx.newId('ln')
      sketch.entities.push({ id: lineId, type: 'line', start, end, ...(i.construction ? { construction: true } : {}) })
      ctx.created(lineId)
      ctx.modified(sketch.id)
      return { lineId, start, end }
    },
  }),
  define<{ sketchId: string; center: string | [number, number]; radius: number; construction?: boolean; ref?: string }>({
    name: 'add_circle',
    category: 'sketch',
    summary: 'Add a circle (centre point and seed radius). Add a radius or diameter constraint to fix its size.',
    input: obj({ sketchId: id('Sketch ID'), center: pointInput('Centre point'), radius: { type: 'number', exclusiveMinimum: 0, description: 'Seed radius in mm' }, construction: { type: 'boolean' }, ref }, ['sketchId', 'center', 'radius']),
    output: '{ circleId, center }',
    preconditions: ['The sketch exists; radius > 0.'],
    errors: ['not-found', 'invalid-input'],
    undo: 'Removes the circle.',
    apply(ctx, i) {
      const { sketch } = sketchOf(ctx, i.sketchId)
      const center = pointFrom(ctx, sketch, i.center)
      if (center === 'origin') throw new CadError('invalid-input', 'Use a new point at [0, 0] (optionally constrained coincident to the origin) as the centre.')
      const circleId = ctx.newId('ci')
      sketch.entities.push({ id: circleId, type: 'circle', center, radius: i.radius, ...(i.construction ? { construction: true } : {}) })
      ctx.created(circleId)
      ctx.modified(sketch.id)
      return { circleId, center }
    },
  }),
  define<{ sketchId: string; center: string | [number, number]; start: string | [number, number]; end: string | [number, number]; construction?: boolean; ref?: string }>({
    name: 'add_arc',
    category: 'sketch',
    summary: 'Add a circular arc, counter-clockwise from start to end around the centre.',
    input: obj({ sketchId: id('Sketch ID'), center: pointInput('Centre point'), start: pointInput('Start point'), end: pointInput('End point'), construction: { type: 'boolean' }, ref }, ['sketchId', 'center', 'start', 'end']),
    output: '{ arcId, center, start, end }',
    preconditions: ['The sketch exists; the three points differ.'],
    errors: ['not-found', 'invalid-input'],
    undo: 'Removes the arc.',
    apply(ctx, i) {
      const { sketch } = sketchOf(ctx, i.sketchId)
      const center = pointFrom(ctx, sketch, i.center)
      const start = pointFrom(ctx, sketch, i.start)
      const end = pointFrom(ctx, sketch, i.end)
      if (new Set([center, start, end]).size !== 3 || center === 'origin') throw new CadError('invalid-input', 'An arc needs three different points (not the origin as centre).')
      const arcId = ctx.newId('ar')
      sketch.entities.push({ id: arcId, type: 'arc', center, start, end, ...(i.construction ? { construction: true } : {}) })
      ctx.created(arcId)
      ctx.modified(sketch.id)
      return { arcId, center, start, end }
    },
  }),
  define<{ sketchId: string; corner?: [number, number]; center?: [number, number]; width: Expr; height: Expr; ref?: string; dimensions?: boolean }>({
    name: 'add_rectangle',
    category: 'sketch',
    summary: 'Add an axis-aligned rectangle: four lines with coincident corners, horizontal/vertical constraints and (by default) width and height dimensions.',
    input: obj(
      {
        sketchId: id('Sketch ID'),
        corner: { ...coords, description: 'Lower-left corner [x, y] (default [0, 0]); the corner is fixed to the origin when it is [0, 0].' },
        center: { ...coords, description: 'Centre [x, y] instead of a corner.' },
        width: expr('Width (x).'),
        height: expr('Height (y).'),
        dimensions: { type: 'boolean', default: true, description: 'Add driving width and height dimensions.' },
        ref,
      },
      ['sketchId', 'width', 'height'],
    ),
    output: '{ points: [4], lines: [bottom, right, top, left], constraints: [...], width?: constraintId, height?: constraintId }',
    preconditions: ['The sketch exists; width and height are positive.'],
    errors: ['not-found', 'invalid-input', 'invalid-expression'],
    undo: 'Removes the rectangle.',
    apply(ctx, i) {
      const { part, sketch } = sketchOf(ctx, i.sketchId)
      checkExpr(part, i.width, 'width')
      checkExpr(part, i.height, 'height')
      const scope = evaluateParameters(part)
      const num = (v: Expr) => (typeof v === 'number' ? v : evaluateExpr(v, scope.lookup))
      const w = num(i.width)
      const h = num(i.height)
      if (!(w > 0 && h > 0)) throw new CadError('invalid-input', `Width and height must be positive (got ${w} × ${h}).`)
      const [x0, y0] = i.center ? [i.center[0] - w / 2, i.center[1] - h / 2] : (i.corner ?? [0, 0])
      const corners: [number, number][] = [
        [x0, y0],
        [x0 + w, y0],
        [x0 + w, y0 + h],
        [x0, y0 + h],
      ]
      const points = corners.map((c) => pointFrom(ctx, sketch, c))
      const lines = [0, 1, 2, 3].map((k) => {
        const lid = ctx.newId('ln')
        sketch.entities.push({ id: lid, type: 'line', start: points[k], end: points[(k + 1) % 4] })
        ctx.created(lid)
        return lid
      })
      const constraints = [
        addConstraint(ctx, part, sketch, { type: 'horizontal', entities: [lines[0]] }),
        addConstraint(ctx, part, sketch, { type: 'vertical', entities: [lines[1]] }),
        addConstraint(ctx, part, sketch, { type: 'horizontal', entities: [lines[2]] }),
        addConstraint(ctx, part, sketch, { type: 'vertical', entities: [lines[3]] }),
      ]
      const out: Record<string, unknown> = { points, lines, constraints }
      if (i.dimensions !== false) {
        out.width = addConstraint(ctx, part, sketch, { type: 'length', entities: [lines[0]], value: i.width, name: 'width' })
        out.height = addConstraint(ctx, part, sketch, { type: 'length', entities: [lines[1]], value: i.height, name: 'height' })
        constraints.push(out.width as string, out.height as string)
      }
      if (!i.center && x0 === 0 && y0 === 0) constraints.push(addConstraint(ctx, part, sketch, { type: 'coincident', entities: [points[0], 'origin'].reverse() as [string, string] }))
      ctx.modified(sketch.id)
      return out
    },
  }),
  define<{ sketchId: string; center?: [number, number]; sides: number; size: { acrossFlats?: Expr; circumradius?: Expr }; rotation?: Expr; name?: string; ref?: string }>({
    name: 'add_regular_polygon',
    category: 'sketch',
    summary:
      'Add a regular polygon as editable sketch geometry: N lines with equal-length and point-on-circle constraints on a construction circumcircle, its centre dimensioned from the origin, its rotation fixed, and its size as a driving dimension (across flats through a tangent inscribed construction circle, or the circumradius). Fully constrained; the solver checks it like any sketch.',
    input: obj(
      {
        sketchId: id('Sketch ID'),
        center: { ...coords, description: 'Centre [x, y] in mm (default [0, 0]); dimensioned from the origin.' },
        sides: { type: 'integer', minimum: 3, maximum: 64, description: 'Number of sides.' },
        size: obj(
          {
            acrossFlats: expr('Distance between opposite sides (inscribed-circle diameter).'),
            circumradius: expr('Distance from the centre to a vertex.'),
          },
          [],
        ),
        rotation: expr('Angle of the first vertex from the sketch x axis, in degrees (default 0).'),
        name: { type: 'string', maxLength: 60, description: 'Name of the size dimension (default "across flats" or "circumradius").' },
        ref,
      },
      ['sketchId', 'sides', 'size'],
    ),
    output: '{ points: [N], lines: [N], center, circumcircle, inscribedCircle?, size: constraintId, constraints: [...] }',
    preconditions: ['The sketch exists.', 'Exactly one of size.acrossFlats and size.circumradius is given, and it is positive.', 'Rotation is a number or expression in degrees.'],
    errors: ['not-found', 'invalid-input', 'invalid-expression'],
    undo: 'Removes the polygon and its constraints.',
    apply(ctx, i) {
      const { part, sketch } = sketchOf(ctx, i.sketchId)
      const n = i.sides
      if (!Number.isInteger(n) || n < 3 || n > 64) throw new CadError('invalid-input', `A regular polygon needs 3 to 64 sides (got ${n}).`)
      const hasAF = i.size?.acrossFlats !== undefined
      const hasR = i.size?.circumradius !== undefined
      if (hasAF === hasR) throw new CadError('invalid-input', 'Give exactly one size: size.acrossFlats or size.circumradius.')
      const sizeExpr = (hasAF ? i.size.acrossFlats : i.size.circumradius) as Expr
      checkExpr(part, sizeExpr, hasAF ? 'size.acrossFlats' : 'size.circumradius')
      if (i.rotation !== undefined) checkExpr(part, i.rotation, 'rotation')
      const scope = evaluateParameters(part)
      const num = (v: Expr) => (typeof v === 'number' ? v : evaluateExpr(v, scope.lookup))
      const s = num(sizeExpr)
      if (!(s > 0)) throw new CadError('invalid-input', `The polygon size must be positive (got ${s}).`)
      const R = hasAF ? s / 2 / Math.cos(Math.PI / n) : s
      const rot = i.rotation === undefined ? 0 : num(i.rotation)
      const [cx, cy] = i.center ?? [0, 0]
      // Seed positions are the exact solution, so the solver starts converged.
      const center = pointFrom(ctx, sketch, [cx, cy], true)
      const points = Array.from({ length: n }, (_, k) => {
        const a = ((rot + (360 * k) / n) * Math.PI) / 180
        return pointFrom(ctx, sketch, [cx + R * Math.cos(a), cy + R * Math.sin(a)])
      })
      const lines = points.map((p, k) => {
        const lid = ctx.newId('ln')
        sketch.entities.push({ id: lid, type: 'line', start: p, end: points[(k + 1) % n] })
        ctx.created(lid)
        return lid
      })
      const circumcircle = ctx.newId('ci')
      sketch.entities.push({ id: circumcircle, type: 'circle', center, radius: R, construction: true })
      ctx.created(circumcircle)
      const ray = ctx.newId('ln')
      sketch.entities.push({ id: ray, type: 'line', start: center, end: points[0], construction: true })
      ctx.created(ray)
      const constraints: string[] = []
      const add = (c: Omit<SketchConstraint, 'id'>) => {
        const cid = addConstraint(ctx, part, sketch, c)
        constraints.push(cid)
        return cid
      }
      // Centre: dimensioned from the origin (or on it).
      if (cx === 0 && cy === 0) add({ type: 'coincident', entities: ['origin', center] })
      else {
        add({ type: 'distance-x', entities: ['origin', center], value: cx })
        add({ type: 'distance-y', entities: ['origin', center], value: cy })
      }
      for (const p of points) add({ type: 'point-on-circle', entities: [p, circumcircle] })
      for (let k = 1; k < n; k++) add({ type: 'equal', entities: [lines[0], lines[k]] })
      // Rotation of the first vertex (the angle constraint is unsigned, so 0/180 and 90/270 use horizontal/vertical).
      const r = ((rot % 360) + 360) % 360
      if (Math.abs(r) < 1e-9 || Math.abs(r - 180) < 1e-9) add({ type: 'horizontal', entities: [ray] })
      else if (Math.abs(r - 90) < 1e-9 || Math.abs(r - 270) < 1e-9) add({ type: 'vertical', entities: [ray] })
      else add({ type: 'angle', entities: ['x-axis', ray], value: Math.abs(r > 180 ? 360 - r : r) })
      let inscribedCircle: string | undefined
      let size: string
      if (hasAF) {
        inscribedCircle = ctx.newId('ci')
        sketch.entities.push({ id: inscribedCircle, type: 'circle', center, radius: s / 2, construction: true })
        ctx.created(inscribedCircle)
        add({ type: 'tangent', entities: [lines[0], inscribedCircle] })
        size = add({ type: 'diameter', entities: [inscribedCircle], value: sizeExpr, name: i.name ?? 'across flats' })
      } else size = add({ type: 'radius', entities: [circumcircle], value: sizeExpr, name: i.name ?? 'circumradius' })
      ctx.modified(sketch.id)
      return { points, lines, center, circumcircle, ...(inscribedCircle ? { inscribedCircle } : {}), size, constraints }
    },
  }),
  define<{ sketchId: string; type: ConstraintType; entities: string[]; value?: Expr; driving?: boolean; name?: string; ref?: string }>({
    name: 'apply_constraint',
    category: 'constraint',
    summary: 'Apply a geometric or dimensional constraint to sketch entities.',
    input: obj(
      {
        sketchId: id('Sketch ID'),
        type: { type: 'string', enum: CONSTRAINT_TYPES },
        entities: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, maxItems: 2, description: 'Entity IDs in the order the type defines (see the constraint reference); "origin", "x-axis" and "y-axis" are always available.' },
        value: expr('Dimensional constraints only.'),
        driving: { type: 'boolean', default: true, description: 'false: a driven (reference) dimension that only measures.' },
        name: { type: 'string', maxLength: 60 },
        ref,
      },
      ['sketchId', 'type', 'entities'],
    ),
    output: '{ constraintId }',
    preconditions: ['The entities exist and match the constraint signature.', 'A driving dimension has a value; length, radius and diameter are positive.'],
    errors: ['not-found', 'invalid-input', 'invalid-expression'],
    undo: 'Removes the constraint.',
    apply(ctx, i) {
      const { part, sketch } = sketchOf(ctx, i.sketchId)
      const constraintId = addConstraint(ctx, part, sketch, { type: i.type, entities: i.entities, ...(i.value !== undefined ? { value: i.value } : {}), ...(i.driving === false ? { driving: false } : {}), ...(i.name ? { name: i.name } : {}) })
      return { constraintId }
    },
  }),
  define<{ sketchId: string; constraintId: string; value: Expr }>({
    name: 'set_dimension',
    category: 'constraint',
    summary: 'Change the value of a dimensional constraint (a literal or an expression); the sketch and dependent features regenerate.',
    input: obj({ sketchId: id('Sketch ID'), constraintId: id('Constraint ID'), value: expr('New value.') }, ['sketchId', 'constraintId', 'value']),
    output: '{}',
    preconditions: ['The constraint exists and is dimensional.'],
    errors: ['not-found', 'invalid-input', 'invalid-expression'],
    undo: 'Restores the previous value.',
    apply(ctx, i) {
      const { part, sketch } = sketchOf(ctx, i.sketchId)
      const c = sketch.constraints.find((x) => x.id === i.constraintId)
      if (!c) throw new CadError('not-found', `Constraint ${i.constraintId} does not exist in ${sketch.id}.`)
      if (!isDimensional(c.type)) throw new CadError('invalid-input', `${c.id} is a ${c.type} constraint and has no value.`)
      checkExpr(part, i.value, 'value')
      if (typeof i.value === 'number' && ['length', 'radius', 'diameter'].includes(c.type) && i.value <= 0) throw new CadError('invalid-input', `${c.type} must be greater than zero.`)
      c.value = i.value
      ctx.modified(c.id, sketch.id)
      return {}
    },
  }),
  define<{ sketchId: string; constraintId: string; driving: boolean }>({
    name: 'set_dimension_driving',
    category: 'constraint',
    summary: 'Switch a dimension between driving (solved for) and driven (reference, measured only).',
    input: obj({ sketchId: id('Sketch ID'), constraintId: id('Constraint ID'), driving: { type: 'boolean' } }, ['sketchId', 'constraintId', 'driving']),
    output: '{}',
    preconditions: ['The constraint is dimensional; a driving dimension has a value.'],
    errors: ['not-found', 'invalid-input'],
    undo: 'Restores the previous state.',
    apply(ctx, i) {
      const { sketch } = sketchOf(ctx, i.sketchId)
      const c = sketch.constraints.find((x) => x.id === i.constraintId)
      if (!c) throw new CadError('not-found', `Constraint ${i.constraintId} does not exist in ${sketch.id}.`)
      if (!isDimensional(c.type)) throw new CadError('invalid-input', `${c.id} is not a dimension.`)
      if (i.driving && c.value === undefined) throw new CadError('invalid-input', `Give ${c.id} a value before making it driving.`)
      if (i.driving) delete c.driving
      else c.driving = false
      ctx.modified(c.id, sketch.id)
      return {}
    },
  }),
  define<{ sketchId: string; constraintId: string }>({
    name: 'delete_constraint',
    category: 'constraint',
    summary: 'Remove a constraint from a sketch.',
    input: obj({ sketchId: id('Sketch ID'), constraintId: id('Constraint ID') }, ['sketchId', 'constraintId']),
    output: '{}',
    preconditions: ['The constraint exists.'],
    errors: ['not-found'],
    undo: 'Restores the constraint.',
    apply(ctx, i) {
      const { sketch } = sketchOf(ctx, i.sketchId)
      if (!sketch.constraints.some((c) => c.id === i.constraintId)) throw new CadError('not-found', `Constraint ${i.constraintId} does not exist in ${sketch.id}.`)
      sketch.constraints = sketch.constraints.filter((c) => c.id !== i.constraintId)
      ctx.deleted(i.constraintId)
      ctx.modified(sketch.id)
      return {}
    },
  }),
  define<{ sketchId: string; ids: string[] }>({
    name: 'delete_sketch_entities',
    category: 'sketch',
    summary: 'Delete sketch entities; curves using deleted points and constraints referring to deleted entities are removed too.',
    input: obj({ sketchId: id('Sketch ID'), ids: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 } }, ['sketchId', 'ids']),
    output: '{ deleted: [...] }',
    preconditions: ['Every ID exists in the sketch (implicit origin and axes cannot be deleted).'],
    errors: ['not-found', 'invalid-input'],
    undo: 'Restores all removed entities and constraints.',
    apply(ctx, i) {
      const { sketch } = sketchOf(ctx, i.sketchId)
      for (const x of i.ids) {
        if ((IMPLICIT_SKETCH_ENTITIES as readonly string[]).includes(x)) throw new CadError('invalid-input', `${x} is part of every sketch and cannot be deleted.`)
        if (!sketch.entities.some((e) => e.id === x)) throw new CadError('not-found', `${x} does not exist in ${sketch.id}.`)
      }
      const gone = new Set(i.ids)
      const uses = (e: SketchEntity) => (e.type === 'line' ? [e.start, e.end] : e.type === 'circle' ? [e.center] : e.type === 'arc' ? [e.center, e.start, e.end] : [])
      let changed = true
      while (changed) {
        changed = false
        for (const e of sketch.entities) if (!gone.has(e.id) && uses(e).some((u) => gone.has(u))) (gone.add(e.id), (changed = true))
      }
      const removedConstraints = sketch.constraints.filter((c) => c.entities.some((x) => gone.has(x))).map((c) => c.id)
      sketch.entities = sketch.entities.filter((e) => !gone.has(e.id))
      sketch.constraints = sketch.constraints.filter((c) => !removedConstraints.includes(c.id))
      ctx.deleted(...gone, ...removedConstraints)
      ctx.modified(sketch.id)
      return { deleted: [...gone, ...removedConstraints] }
    },
  }),
  define<{ sketchId: string; pointId: string; x: number; y: number }>({
    name: 'move_sketch_point',
    category: 'sketch',
    summary: 'Move a point’s drawn (seed) position; constraints still decide the solved position.',
    input: obj({ sketchId: id('Sketch ID'), pointId: id('Point ID'), x: { type: 'number' }, y: { type: 'number' } }, ['sketchId', 'pointId', 'x', 'y']),
    output: '{}',
    preconditions: ['The point exists.'],
    errors: ['not-found'],
    undo: 'Restores the previous position.',
    apply(ctx, i) {
      const { sketch } = sketchOf(ctx, i.sketchId)
      const p = sketch.entities.find((e) => e.id === i.pointId)
      if (!p || p.type !== 'point') throw new CadError('not-found', `Point ${i.pointId} does not exist in ${sketch.id}.`)
      p.x = i.x
      p.y = i.y
      ctx.modified(p.id, sketch.id)
      return {}
    },
  }),
  define<{ sketchId: string; ids: string[]; construction: boolean }>({
    name: 'set_construction',
    category: 'sketch',
    summary: 'Mark sketch curves as construction geometry (excluded from profiles) or normal geometry.',
    input: obj({ sketchId: id('Sketch ID'), ids: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 }, construction: { type: 'boolean' } }, ['sketchId', 'ids', 'construction']),
    output: '{}',
    preconditions: ['Every ID is a line, circle or arc of the sketch.'],
    errors: ['not-found', 'invalid-input'],
    undo: 'Restores the previous state.',
    apply(ctx, i) {
      const { sketch } = sketchOf(ctx, i.sketchId)
      for (const x of i.ids) {
        const e = sketch.entities.find((s) => s.id === x)
        if (!e) throw new CadError('not-found', `${x} does not exist in ${sketch.id}.`)
        if (e.type === 'point') throw new CadError('invalid-input', `${x} is a point.`)
        if (i.construction) e.construction = true
        else delete e.construction
      }
      ctx.modified(...i.ids, sketch.id)
      return {}
    },
  }),

  // Features
  define<{ sketchId: string; distance: Expr; direction?: ExtrudeDirection; operation?: BodyOperation; target?: string; name?: string; ref?: string }>({
    name: 'extrude_profile',
    category: 'feature',
    summary: 'Extrude the closed profile of a sketch along its normal: a new body, joined to a body, or cut from it.',
    input: obj(
      {
        sketchId: id('Sketch ID'),
        distance: expr('Extrusion depth (> 0).'),
        direction: { type: 'string', enum: DIRECTIONS, default: 'normal' },
        operation: { type: 'string', enum: OPERATIONS, default: 'new', description: 'new body, join (fuse) or cut. The first solid of a part is always a new body.' },
        target: { type: 'string', description: 'Body to join or cut (ID of the feature that created it). Default: the latest body.' },
        name: name('Feature name'),
        ref,
      },
      ['sketchId', 'distance'],
    ),
    output: '{ featureId }',
    preconditions: ['The sketch exists; a literal distance is > 0; an explicit target is a body-creating feature earlier in the part.'],
    errors: ['not-found', 'invalid-input', 'invalid-expression'],
    undo: 'Removes the feature.',
    apply(ctx, i) {
      const { part, sketch } = sketchOf(ctx, i.sketchId)
      checkExpr(part, i.distance, 'distance')
      if (typeof i.distance === 'number' && i.distance <= 0) throw new CadError('invalid-input', 'distance must be greater than zero.')
      if (i.target) checkTarget(part, i.target)
      const fid = ctx.newId('ext')
      const n = part.features.filter((f) => f.type === 'extrude').length + 1
      part.features.push({ id: fid, type: 'extrude', name: i.name ?? `Extrude ${n}`, sketch: sketch.id, extent: { distance: i.distance, direction: i.direction ?? 'normal' }, operation: i.operation ?? 'new', ...(i.target ? { target: i.target } : {}) })
      ctx.created(fid)
      return { featureId: fid }
    },
  }),
  define<{ sketchId: string; axis: string; angle?: Expr; operation?: BodyOperation; target?: string; name?: string; ref?: string }>({
    name: 'revolve_profile',
    category: 'feature',
    summary: 'Revolve the closed profile of a sketch about a sketch line or a sketch axis.',
    input: obj(
      {
        sketchId: id('Sketch ID'),
        axis: { type: 'string', minLength: 1, description: 'A line of the sketch (often construction), or "x-axis" / "y-axis".' },
        angle: expr('Angle in degrees, (0, 360]. Default 360.'),
        operation: { type: 'string', enum: OPERATIONS, default: 'new' },
        target: { type: 'string' },
        name: name('Feature name'),
        ref,
      },
      ['sketchId', 'axis'],
    ),
    output: '{ featureId }',
    preconditions: ['The axis is a line of the sketch or a sketch axis; a literal angle is in (0, 360].'],
    errors: ['not-found', 'invalid-input', 'invalid-expression'],
    undo: 'Removes the feature.',
    apply(ctx, i) {
      const { part, sketch } = sketchOf(ctx, i.sketchId)
      if (!['x-axis', 'y-axis'].includes(i.axis) && sketch.entities.find((e) => e.id === i.axis)?.type !== 'line') throw new CadError('invalid-input', `Axis ${i.axis} is not a line of ${sketch.id}.`)
      const angle = i.angle ?? 360
      checkExpr(part, angle, 'angle')
      if (typeof angle === 'number' && !(angle > 0 && angle <= 360)) throw new CadError('invalid-input', 'angle must be in (0, 360].')
      if (i.target) checkTarget(part, i.target)
      const fid = ctx.newId('rev')
      const n = part.features.filter((f) => f.type === 'revolve').length + 1
      part.features.push({ id: fid, type: 'revolve', name: i.name ?? `Revolve ${n}`, sketch: sketch.id, axis: i.axis, angle, operation: i.operation ?? 'new', ...(i.target ? { target: i.target } : {}) })
      ctx.created(fid)
      return { featureId: fid }
    },
  }),
  define<{ edges: string[]; radius: Expr; target?: string; name?: string; ref?: string }>({
    name: 'fillet_edges',
    category: 'feature',
    summary: 'Round edges of a body with a constant radius. Edges are selected by stable edge names (query get_entities).',
    input: obj(
      {
        edges: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 400 }, minItems: 1, maxItems: 200, description: 'Stable edge names, e.g. "edge(ext-5/cap-end|ext-5/side:ln-8)".' },
        radius: expr('Fillet radius (> 0).'),
        target: { type: 'string', description: 'Body (ID of the feature that created it). Default: the latest body.' },
        name: name('Feature name'),
        ref,
      },
      ['edges', 'radius'],
    ),
    output: '{ featureId }',
    preconditions: ['A body exists (checked at regeneration).', 'A literal radius is > 0.', 'Edge names resolve on the body at regeneration; otherwise the feature fails with reason reference-lost.'],
    errors: ['not-found', 'invalid-input', 'invalid-expression'],
    undo: 'Removes the feature.',
    apply(ctx, i) {
      const part = activePart(ctx, i.target)
      checkExpr(part, i.radius, 'radius')
      if (typeof i.radius === 'number' && i.radius <= 0) throw new CadError('invalid-input', 'radius must be greater than zero.')
      if (i.target) checkTarget(part, i.target)
      const fid = ctx.newId('fil')
      const n = part.features.filter((f) => f.type === 'fillet').length + 1
      part.features.push({ id: fid, type: 'fillet', name: i.name ?? `Fillet ${n}`, edges: [...new Set(i.edges)], radius: i.radius, ...(i.target ? { target: i.target } : {}) })
      ctx.created(fid)
      return { featureId: fid }
    },
  }),
  define<{ edges: string[]; distance: Expr; target?: string; name?: string; ref?: string }>({
    name: 'chamfer_edges',
    category: 'feature',
    summary: 'Bevel edges of a body with an equal-distance chamfer. Edges are selected by stable edge names (query get_entities).',
    input: obj(
      {
        edges: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 400 }, minItems: 1, maxItems: 200, description: 'Stable edge names.' },
        distance: expr('Chamfer distance (> 0).'),
        target: { type: 'string', description: 'Body (ID of the feature that created it). Default: the latest body.' },
        name: name('Feature name'),
        ref,
      },
      ['edges', 'distance'],
    ),
    output: '{ featureId }',
    preconditions: ['A body exists (checked at regeneration).', 'A literal distance is > 0.', 'Edge names resolve on the body at regeneration; otherwise the feature fails with reason reference-lost.'],
    errors: ['not-found', 'invalid-input', 'invalid-expression'],
    undo: 'Removes the feature.',
    apply(ctx, i) {
      const part = activePart(ctx, i.target)
      checkExpr(part, i.distance, 'distance')
      if (typeof i.distance === 'number' && i.distance <= 0) throw new CadError('invalid-input', 'distance must be greater than zero.')
      if (i.target) checkTarget(part, i.target)
      const fid = ctx.newId('cha')
      const n = part.features.filter((f) => f.type === 'chamfer').length + 1
      part.features.push({ id: fid, type: 'chamfer', name: i.name ?? `Chamfer ${n}`, edges: [...new Set(i.edges)], distance: i.distance, ...(i.target ? { target: i.target } : {}) })
      ctx.created(fid)
      return { featureId: fid }
    },
  }),
  define<{ featureId: string; distance?: Expr; direction?: ExtrudeDirection | [number, number, number] | string; angle?: Expr; axis?: string; operation?: BodyOperation; target?: string | null; radius?: Expr; edges?: string[]; offset?: Expr; count?: Expr; spacing?: Expr; features?: string[] }>({
    name: 'edit_feature',
    category: 'feature',
    summary: 'Change a feature: extrude (distance, direction), revolve (angle, axis), fillet (radius, edges), chamfer (distance, edges), datum plane (offset), linear pattern (count, spacing, direction, features); operation or target body.',
    input: obj(
      {
        featureId: id('Feature ID'),
        distance: expr('Extrude depth or chamfer distance.'),
        direction: { oneOf: [{ type: 'string', enum: [...DIRECTIONS, ...AXIS_NAMES] }, vec3] , description: 'Extrude: normal, reverse or symmetric. Linear pattern: an axis name ("x", "-y" …) or an [x, y, z] vector.' },
        angle: expr('Revolve angle.'),
        axis: { type: 'string', minLength: 1 },
        operation: { type: 'string', enum: OPERATIONS },
        target: { type: ['string', 'null'], description: 'Body to join, cut, fillet or chamfer; null for the latest body.' },
        radius: expr('Fillet radius.'),
        edges: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 400 }, minItems: 1, maxItems: 200, description: 'Fillet or chamfer edges (stable edge names).' },
        offset: expr('Datum plane offset.'),
        count: expr('Linear pattern: number of occurrences including the original (integer ≥ 2).'),
        spacing: expr('Linear pattern: distance between neighbouring occurrences.'),
        features: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, maxItems: 50, description: 'Linear pattern: extrude or revolve features to repeat.' },
      },
      ['featureId'],
    ),
    output: '{}',
    preconditions: ['Only the fields of the feature type are given; values are valid.'],
    errors: ['not-found', 'invalid-input', 'invalid-expression'],
    undo: 'Restores the previous definition.',
    apply(ctx, i) {
      const { part, feature } = findFeature(ctx.doc, i.featureId)
      const allowed: Record<Feature['type'], string[]> = {
        sketch: [],
        extrude: ['distance', 'direction', 'operation', 'target'],
        revolve: ['angle', 'axis', 'operation', 'target'],
        fillet: ['radius', 'edges', 'target'],
        chamfer: ['distance', 'edges', 'target'],
        'datum-plane': ['offset'],
        'pattern-linear': ['count', 'spacing', 'direction', 'features'],
      }
      if (feature.type === 'sketch') throw new CadError('invalid-input', `${feature.id} is a sketch; edit it with sketch and constraint commands.`)
      const given = Object.keys(i).filter((k) => k !== 'featureId' && (i as Record<string, unknown>)[k] !== undefined)
      const wrong = given.filter((k) => !allowed[feature.type].includes(k))
      if (wrong.length) throw new CadError('invalid-input', `${wrong.join(', ')} do${wrong.length > 1 ? '' : 'es'} not apply to a ${feature.type} (allowed: ${allowed[feature.type].join(', ')}).`)
      const positive = (v: Expr, field: string) => {
        checkExpr(part, v, field)
        if (typeof v === 'number' && v <= 0) throw new CadError('invalid-input', `${field} must be greater than zero.`)
        return v
      }
      if (feature.type === 'pattern-linear') {
        if (i.count !== undefined) feature.count = patternCount(part, i.count)
        if (i.spacing !== undefined) feature.spacing = positive(i.spacing, 'spacing')
        if (i.direction !== undefined) feature.direction = directionOf(i.direction)
        if (i.features) feature.features = patternTargets(part, i.features, feature.id)
      } else if (feature.type === 'extrude') {
        if (i.distance !== undefined) feature.extent.distance = positive(i.distance, 'distance')
        if (i.direction) {
          if (!(DIRECTIONS as readonly string[]).includes(i.direction as string)) throw new CadError('invalid-input', `Extrude direction must be one of ${DIRECTIONS.join(', ')}.`)
          feature.extent.direction = i.direction as ExtrudeDirection
        }
      } else if (feature.type === 'revolve') {
        if (i.angle !== undefined) {
          checkExpr(part, i.angle, 'angle')
          if (typeof i.angle === 'number' && !(i.angle > 0 && i.angle <= 360)) throw new CadError('invalid-input', 'angle must be in (0, 360].')
          feature.angle = i.angle
        }
        if (i.axis !== undefined) {
          const { sketch } = findSketch(ctx.doc, feature.sketch)
          if (!['x-axis', 'y-axis'].includes(i.axis) && sketch.entities.find((e) => e.id === i.axis)?.type !== 'line') throw new CadError('invalid-input', `Axis ${i.axis} is not a line of ${sketch.id}.`)
          feature.axis = i.axis
        }
      } else if (feature.type === 'fillet') {
        if (i.radius !== undefined) feature.radius = positive(i.radius, 'radius')
        if (i.edges) feature.edges = [...new Set(i.edges)]
      } else if (feature.type === 'chamfer') {
        if (i.distance !== undefined) feature.distance = positive(i.distance, 'distance')
        if (i.edges) feature.edges = [...new Set(i.edges)]
      } else if (feature.type === 'datum-plane') {
        checkExpr(part, i.offset, 'offset')
        if (i.offset === 0) delete feature.plane.offset
        else if (i.offset !== undefined) feature.plane.offset = i.offset
      }
      if (i.operation && (feature.type === 'extrude' || feature.type === 'revolve')) feature.operation = i.operation
      if (feature.type === 'extrude' || feature.type === 'revolve' || feature.type === 'fillet' || feature.type === 'chamfer') {
        if (i.target === null) delete feature.target
        else if (i.target !== undefined) {
          checkTarget(part, i.target, feature.id)
          feature.target = i.target
        }
      }
      ctx.modified(feature.id)
      return {}
    },
  }),
define<{ features: string[]; direction: [number, number, number] | string; count: Expr; spacing: Expr; name?: string; ref?: string }>({
    name: 'pattern_linear',
    category: 'feature',
    summary:
      'Repeat extrude or revolve features (for example a pocket cut) along a direction: count occurrences (including the original), spacing apart. Count and spacing may be expressions over parameters. Each occurrence is rebuilt from the original sketch on a shifted plane and applied with the same operation; faces get stable names "<patternId>/i<k>-<featureId>-<role>". Regeneration reports the gap between neighbouring occurrences.',
    input: obj(
      {
        features: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, maxItems: 50, description: 'Extrude or revolve feature IDs, earlier in the same part.' },
        direction: { oneOf: [{ type: 'string', enum: AXIS_NAMES }, vec3], description: 'Model direction: "x", "y", "z", "-x", "-y", "-z", or an [x, y, z] vector (normalised).' },
        count: expr('Number of occurrences including the original (integer ≥ 2).'),
        spacing: expr('Distance between neighbouring occurrences (mm, > 0).'),
        name: name('Pattern name'),
        ref,
      },
      ['features', 'direction', 'count', 'spacing'],
    ),
    output: '{ featureId }',
    preconditions: ['The features are extrudes or revolves of the same part, earlier in the history.', 'count evaluates to an integer ≥ 2 and spacing to a positive length (checked again at regeneration).'],
    errors: ['not-found', 'invalid-input', 'invalid-expression'],
    undo: 'Removes the pattern.',
    apply(ctx, i) {
      const first = i.features?.[0]
      if (!first) throw new CadError('invalid-input', 'Give at least one feature to repeat.')
      const { part } = findFeature(ctx.doc, first)
      const features = patternTargets(part, i.features)
      const count = patternCount(part, i.count)
      checkExpr(part, i.spacing, 'spacing')
      if (typeof i.spacing === 'number' && !(i.spacing > 0)) throw new CadError('invalid-input', 'spacing must be greater than zero.')
      const fid = ctx.newId('pat')
      const n = part.features.filter((f) => f.type === 'pattern-linear').length + 1
      part.features.push({ id: fid, type: 'pattern-linear', name: i.name ?? `Linear pattern ${n}`, features, direction: directionOf(i.direction), count, spacing: i.spacing })
      ctx.created(fid)
      return { featureId: fid }
    },
  }),
  define<{ partId: string; name: string; ref: { module: string; kind: string; id: string; revision?: number }; quantity?: string; note?: string }>({
    name: 'bind_parameter',
    category: 'parameter',
    summary:
      'Record what a parameter implements: a revision-pinned reference to another module\'s artifact (typically a design constraint, { module: "conceptualize", kind: "constraint", id, revision }). Nothing is copied from the target; cad-modeler.check reads the bound values from the owning module, and cad-modeler.check_bindings reports bindings pinned to superseded revisions.',
    input: obj(
      {
        partId: id('Part ID'),
        name: name('Parameter name'),
        ref: obj(
          {
            module: { type: 'string', minLength: 1, maxLength: 60 },
            kind: { type: 'string', minLength: 1, maxLength: 60 },
            id: { type: 'string', minLength: 1, maxLength: 300 },
            revision: { type: 'integer', minimum: 1, description: 'The target revision the parameter was set against.' },
          },
          ['module', 'kind', 'id'],
        ),
        quantity: { type: 'string', maxLength: 120, description: 'The quantity of the target the parameter implements (e.g. "pocket across flats").' },
        note: { type: 'string', maxLength: 500 },
      },
      ['partId', 'name', 'ref'],
    ),
    output: '{ parameterId }',
    preconditions: ['The parameter exists.'],
    errors: ['not-found', 'invalid-input'],
    undo: 'Restores the previous binding (or none).',
    apply(ctx, i) {
      const part = findPart(ctx.doc, i.partId)
      const p = part.parameters.find((x) => x.name === i.name)
      if (!p) throw new CadError('not-found', `Parameter ${i.name} does not exist in ${part.name}.`)
      p.binding = { ref: { module: i.ref.module, kind: i.ref.kind, id: i.ref.id, ...(i.ref.revision !== undefined ? { revision: i.ref.revision } : {}) }, ...(i.quantity ? { quantity: i.quantity } : {}), ...(i.note ? { note: i.note } : {}) }
      ctx.modified(p.id)
      return { parameterId: p.id }
    },
  }),
  define<{ partId: string; name: string }>({
    name: 'unbind_parameter',
    category: 'parameter',
    summary: 'Remove the binding of a parameter (its value and expression stay).',
    input: obj({ partId: id('Part ID'), name: name('Parameter name') }, ['partId', 'name']),
    output: '{ parameterId }',
    preconditions: ['The parameter exists and is bound.'],
    errors: ['not-found', 'precondition-failed'],
    undo: 'Restores the binding.',
    apply(ctx, i) {
      const part = findPart(ctx.doc, i.partId)
      const p = part.parameters.find((x) => x.name === i.name)
      if (!p) throw new CadError('not-found', `Parameter ${i.name} does not exist in ${part.name}.`)
      if (!p.binding) throw new CadError('precondition-failed', `Parameter ${i.name} is not bound.`)
      delete p.binding
      ctx.modified(p.id)
      return { parameterId: p.id }
    },
  }),
  define<{ featureId: string; suppressed: boolean }>({
    name: 'set_suppressed',
    category: 'feature',
    summary: 'Suppress or unsuppress a feature (suppressed features are skipped by regeneration; dependents are blocked).',
    input: obj({ featureId: id('Feature ID'), suppressed: { type: 'boolean' } }, ['featureId', 'suppressed']),
    output: '{}',
    preconditions: ['The feature exists.'],
    errors: ['not-found'],
    undo: 'Restores the previous state.',
    apply(ctx, i) {
      const { feature } = findFeature(ctx.doc, i.featureId)
      if (i.suppressed) feature.suppressed = true
      else delete feature.suppressed
      ctx.modified(feature.id)
      return {}
    },
  }),
  define<{ featureId: string }>({
    name: 'delete_feature',
    category: 'feature',
    summary: 'Delete a feature that no other feature depends on.',
    input: obj({ featureId: id('Feature ID') }, ['featureId']),
    output: '{}',
    preconditions: ['No later feature uses the sketch or targets the body.', 'No semantic annotation or external reference uses it.'],
    errors: ['not-found', 'in-use'],
    undo: 'Restores the feature.',
    apply(ctx, i) {
      const { part, feature } = findFeature(ctx.doc, i.featureId)
      const dependents = dependentsOf(part, feature.id)
      if (dependents.length) throw new CadError('in-use', `${feature.id} is used by ${dependents.join(', ')}. Delete or edit those first.`, { dependents })
      const refs = ctx.doc.references.filter((r) => r.subject === feature.id || r.subject.startsWith(`${feature.id}/`)).map((r) => r.id)
      if (refs.length) throw new CadError('in-use', `${feature.id} has external references ${refs.join(', ')}.`, { references: refs })
      part.features = part.features.filter((f) => f !== feature)
      ctx.deleted(feature.id, ...(feature.type === 'sketch' ? [...feature.entities.map((e) => e.id), ...feature.constraints.map((c) => c.id)] : []))
      return {}
    },
  }),

  // Engineering semantics and references
  define<{ partId: string; kind: SemanticKind; name: string; targets: string[]; description?: string; ref?: string }>({
    name: 'add_semantic',
    category: 'semantics',
    summary: 'Annotate faces, features or parameters with engineering meaning (named interface, functional surface, design intent).',
    input: obj(
      {
        partId: id('Part ID'),
        kind: { type: 'string', enum: ['interface', 'functional-surface', 'design-intent', 'note'] },
        name: name('Annotation name'),
        targets: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, description: 'Stable face names (e.g. "ext-5/cap-end"), feature or parameter IDs.' },
        description: { type: 'string', maxLength: 2000 },
        ref,
      },
      ['partId', 'kind', 'name', 'targets'],
    ),
    output: '{ semanticId }',
    preconditions: ['Feature and parameter targets exist; face names start with an existing feature ID.'],
    errors: ['not-found', 'invalid-input'],
    undo: 'Removes the annotation.',
    apply(ctx, i) {
      const part = findPart(ctx.doc, i.partId)
      for (const t of i.targets) checkSubject(part, t)
      const sid = ctx.newId('sem')
      part.semantics.push({ id: sid, kind: i.kind, name: i.name, targets: i.targets, ...(i.description ? { description: i.description } : {}) })
      ctx.created(sid)
      return { semanticId: sid }
    },
  }),
  define<{ semanticId: string }>({
    name: 'remove_semantic',
    category: 'semantics',
    summary: 'Remove an engineering annotation.',
    input: obj({ semanticId: id('Annotation ID') }, ['semanticId']),
    output: '{}',
    preconditions: ['The annotation exists.'],
    errors: ['not-found'],
    undo: 'Restores the annotation.',
    apply(ctx, i) {
      const part = ctx.doc.parts.find((p) => p.semantics.some((s) => s.id === i.semanticId))
      if (!part) throw new CadError('not-found', `Annotation ${i.semanticId} does not exist.`)
      part.semantics = part.semantics.filter((s) => s.id !== i.semanticId)
      ctx.deleted(i.semanticId)
      return {}
    },
  }),
  define<{ subject: string; role: ReferenceRole; target: { module: ReferenceModule; id: string; revision?: number; kind?: string; label?: string }; ref?: string }>({
    name: 'add_reference',
    category: 'reference',
    summary: 'Link a CAD entity to an artifact of another module (Project Management product element, twin component, requirement, SysML element, Concept). The target is referenced, never copied.',
    input: obj(
      {
        subject: id('Part, feature, parameter or face name'),
        role: { type: 'string', enum: ['represents', 'satisfies', 'verifies', 'realizes', 'traces', 'related'] },
        target: obj(
          {
            module: { type: 'string', enum: ['twin', 'requirements', 'sysml', 'conceptualize', 'product', 'external'] },
            id: { type: 'string', minLength: 1, maxLength: 300 },
            revision: { type: 'integer', minimum: 0, description: 'Pin a revision; omit to follow the latest.' },
            kind: { type: 'string', maxLength: 60 },
            label: { type: 'string', maxLength: 200, description: 'Display text captured when linking (not authoritative).' },
          },
          ['module', 'id'],
        ),
        ref,
      },
      ['subject', 'role', 'target'],
    ),
    output: '{ referenceId }',
    preconditions: ['The subject exists in the document.', 'The target is validated by the caller against the owning module (the UI does; the assistant receives its result).'],
    errors: ['not-found', 'invalid-input', 'precondition-failed'],
    undo: 'Removes the reference.',
    apply(ctx, i) {
      const part = ctx.doc.parts.find((p) => p.id === i.subject) ?? ctx.doc.parts.find((p) => { try { checkSubject(p, i.subject); return true } catch { return false } })
      if (!part) throw new CadError('not-found', `${i.subject} is not a part, feature, parameter or face of this document.`)
      if (ctx.doc.references.some((r) => r.subject === i.subject && r.role === i.role && r.target.module === i.target.module && r.target.id === i.target.id)) throw new CadError('precondition-failed', 'This reference already exists.')
      const rid = ctx.newId('ref')
      ctx.doc.references.push({ id: rid, subject: i.subject, role: i.role, target: i.target })
      ctx.created(rid)
      return { referenceId: rid }
    },
  }),
  define<{ referenceId: string }>({
    name: 'remove_reference',
    category: 'reference',
    summary: 'Remove a cross-module reference.',
    input: obj({ referenceId: id('Reference ID') }, ['referenceId']),
    output: '{}',
    preconditions: ['The reference exists.'],
    errors: ['not-found'],
    undo: 'Restores the reference.',
    apply(ctx, i) {
      if (!ctx.doc.references.some((r) => r.id === i.referenceId)) throw new CadError('not-found', `Reference ${i.referenceId} does not exist.`)
      ctx.doc.references = ctx.doc.references.filter((r) => r.id !== i.referenceId)
      ctx.deleted(i.referenceId)
      return {}
    },
  }),
]

function checkTarget(part: Part, target: string, before?: string) {
  const idx = part.features.findIndex((f) => f.id === target)
  const f = part.features[idx]
  if (!f || (f.type !== 'extrude' && f.type !== 'revolve') || f.operation !== 'new') {
    const bodies = part.features.filter((x) => (x.type === 'extrude' || x.type === 'revolve') && x.operation === 'new').map((x) => x.id)
    throw new CadError('invalid-input', `Target ${target} is not a body of ${part.name}. Bodies: ${bodies.join(', ') || 'none yet'}.`)
  }
  if (before && idx > part.features.findIndex((x) => x.id === before)) throw new CadError('invalid-input', `Target ${target} comes after ${before} in the history.`)
}

function checkSubject(part: Part, subject: string) {
  const featureId = subject.split('/')[0]
  if (subject === part.id) return
  if (part.parameters.some((p) => p.id === subject || p.name === subject)) return
  if (part.features.some((f) => f.id === featureId)) return
  throw new CadError('not-found', `${subject} is not a feature, parameter or face of ${part.name}.`)
}



export const COMMAND_INDEX = new Map(COMMANDS.map((c) => [c.name, c]))

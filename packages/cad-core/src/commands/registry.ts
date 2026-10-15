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
  type ExtrudeFeature,
  type Feature,
  type Part,
  type ReferenceModule,
  type ReferenceRole,
  type RevolveFeature,
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

/** Features that use a sketch, or that target a body created by a feature. */
function dependentsOf(part: Part, featureId: string): string[] {
  return part.features
    .filter((f): f is ExtrudeFeature | RevolveFeature => f.type !== 'sketch')
    .filter((f) => f.sketch === featureId || f.target === featureId)
    .map((f) => f.id)
}

function parameterUsers(part: Part, paramName: string): string[] {
  return [
    ...part.parameters.filter((p) => namesIn(p.expression).includes(paramName)).map((p) => p.id),
    ...part.features.filter((f) => featureNames(f).includes(paramName)).map((f) => f.id),
  ]
}

const define = <I,>(spec: CommandSpec<I>): CommandSpec<Record<string, unknown>> => spec as unknown as CommandSpec<Record<string, unknown>>

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
  define<{ partId: string; plane: StandardPlane; offset?: Expr; name?: string; ref?: string }>({
    name: 'create_sketch',
    category: 'sketch',
    summary: 'Create an empty sketch on a standard plane (XY, XZ or YZ), optionally offset along its normal.',
    input: obj({ partId: id('Part ID'), plane: { type: 'string', enum: PLANES }, offset: expr('Offset along the plane normal.'), name: name('Sketch name'), ref }, ['partId', 'plane']),
    output: '{ sketchId }',
    preconditions: ['The part exists.'],
    errors: ['not-found', 'invalid-input', 'invalid-expression'],
    undo: 'Removes the sketch.',
    apply(ctx, i) {
      const part = findPart(ctx.doc, i.partId)
      checkExpr(part, i.offset, 'offset')
      const sid = ctx.newId('sk')
      const n = part.features.filter((f) => f.type === 'sketch').length + 1
      part.features.push({ id: sid, type: 'sketch', name: i.name ?? `Sketch ${n}`, plane: { kind: 'standard', plane: i.plane, ...(i.offset !== undefined && i.offset !== 0 ? { offset: i.offset } : {}) }, entities: [], constraints: [] })
      ctx.created(sid)
      return { sketchId: sid }
    },
  }),
  define<{ sketchId: string; plane: StandardPlane; offset?: Expr }>({
    name: 'set_sketch_plane',
    category: 'sketch',
    summary: 'Move a sketch to another standard plane or offset.',
    input: obj({ sketchId: id('Sketch ID'), plane: { type: 'string', enum: PLANES }, offset: expr('Offset along the plane normal.') }, ['sketchId', 'plane']),
    output: '{}',
    preconditions: ['The sketch exists.'],
    errors: ['not-found', 'invalid-expression'],
    undo: 'Restores the previous plane.',
    apply(ctx, i) {
      const { part, sketch } = sketchOf(ctx, i.sketchId)
      checkExpr(part, i.offset, 'offset')
      sketch.plane = { kind: 'standard', plane: i.plane, ...(i.offset !== undefined && i.offset !== 0 ? { offset: i.offset } : {}) }
      ctx.modified(sketch.id)
      return {}
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
  define<{ featureId: string; distance?: Expr; direction?: ExtrudeDirection; angle?: Expr; axis?: string; operation?: BodyOperation; target?: string | null }>({
    name: 'edit_feature',
    category: 'feature',
    summary: 'Change an extrude or revolve: distance, direction, angle, axis, operation or target body.',
    input: obj(
      {
        featureId: id('Feature ID'),
        distance: expr('Extrude depth.'),
        direction: { type: 'string', enum: DIRECTIONS },
        angle: expr('Revolve angle.'),
        axis: { type: 'string', minLength: 1 },
        operation: { type: 'string', enum: OPERATIONS },
        target: { type: ['string', 'null'], description: 'Body to join or cut; null for the latest body.' },
      },
      ['featureId'],
    ),
    output: '{}',
    preconditions: ['The feature is an extrude (distance, direction) or revolve (angle, axis); values are valid.'],
    errors: ['not-found', 'invalid-input', 'invalid-expression'],
    undo: 'Restores the previous definition.',
    apply(ctx, i) {
      const { part, feature } = findFeature(ctx.doc, i.featureId)
      if (feature.type === 'sketch') throw new CadError('invalid-input', `${feature.id} is a sketch; edit it with sketch and constraint commands.`)
      if (feature.type === 'extrude') {
        if (i.angle !== undefined || i.axis !== undefined) throw new CadError('invalid-input', 'angle and axis apply to revolve features only.')
        if (i.distance !== undefined) {
          checkExpr(part, i.distance, 'distance')
          if (typeof i.distance === 'number' && i.distance <= 0) throw new CadError('invalid-input', 'distance must be greater than zero.')
          feature.extent.distance = i.distance
        }
        if (i.direction) feature.extent.direction = i.direction
      } else {
        if (i.distance !== undefined || i.direction !== undefined) throw new CadError('invalid-input', 'distance and direction apply to extrude features only.')
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
      }
      if (i.operation) feature.operation = i.operation
      if (i.target === null) delete feature.target
      else if (i.target !== undefined) {
        checkTarget(part, i.target, feature.id)
        feature.target = i.target
      }
      ctx.modified(feature.id)
      return {}
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
    summary: 'Link a CAD entity to an artifact of another module (twin component, requirement, SysML element, Concept). The target is referenced, never copied.',
    input: obj(
      {
        subject: id('Part, feature, parameter or face name'),
        role: { type: 'string', enum: ['represents', 'satisfies', 'verifies', 'realizes', 'traces', 'related'] },
        target: obj(
          {
            module: { type: 'string', enum: ['twin', 'requirements', 'sysml', 'conceptualize', 'external'] },
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
  if (!f || f.type === 'sketch' || f.operation !== 'new') {
    const bodies = part.features.filter((x): x is Feature & { operation: BodyOperation } => x.type !== 'sketch' && x.operation === 'new').map((x) => x.id)
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

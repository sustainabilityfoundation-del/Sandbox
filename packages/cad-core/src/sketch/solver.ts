import { CadError, type CadErrorInfo } from '../errors'
import {
  SKETCH_ORIGIN,
  SKETCH_X_AXIS,
  SKETCH_Y_AXIS,
  isDimensional,
  type ConstraintType,
  type SketchConstraint,
  type SketchEntity,
  type SketchFeature,
} from '../model/types'
import { analyzeRank, solveLinear, type Matrix } from './linalg'

/**
 * Numerical sketch constraint solver (ADR-0025). Unknowns are point coordinates and circle radii;
 * each constraint contributes residual equations. A damped minimum-norm Gauss–Newton iteration
 * (Levenberg-style) starts from the drawn seed geometry, so unconstrained geometry stays where it was
 * drawn. After solving, the Jacobian's rank gives the remaining degrees of freedom, dependent rows the
 * redundant constraints, and the null space the points that are still free.
 */

export type SketchStatus = 'fully-constrained' | 'under-constrained' | 'over-constrained' | 'conflicting' | 'failed'

export type Vec2 = [number, number]

export interface SolveIssue extends CadErrorInfo {
  constraintId?: string
  entityId?: string
}

export interface SketchSolution {
  status: SketchStatus
  converged: boolean
  /** Remaining degrees of freedom (0 when fully constrained). */
  dof: number
  iterations: number
  /** Largest absolute residual at the solution. */
  maxResidual: number
  points: Record<string, Vec2>
  radii: Record<string, number>
  /** Points with at least one undetermined coordinate. */
  freePoints: string[]
  /** Circles whose radius is undetermined. */
  freeCircles: string[]
  /** Consistent but redundant constraints. */
  redundant: string[]
  /** Constraints whose removal (each on its own) makes the sketch solvable. */
  conflicting: string[]
  /** Measured values of driven (reference) dimensions. */
  driven: Record<string, number>
  issues: SolveIssue[]
}

export interface SolveOptions {
  /** Evaluated values of dimensional constraints (by constraint ID). */
  values: Record<string, number>
  maxIterations?: number
  tolerance?: number
}

interface Equation {
  constraintId: string
  f: (x: Float64Array) => number
}

const DEG = Math.PI / 180

type PointRef = { kind: 'var'; ix: number; iy: number } | { kind: 'const'; x: number; y: number }

/** Entity types each constraint accepts, in order ('line' includes the sketch axes). */
const SIGNATURES: Record<ConstraintType, string[][]> = {
  coincident: [['point', 'point']],
  horizontal: [['line'], ['point', 'point']],
  vertical: [['line'], ['point', 'point']],
  parallel: [['line', 'line']],
  perpendicular: [['line', 'line']],
  equal: [['line', 'line'], ['curve', 'curve']],
  fixed: [['point']],
  'point-on-line': [['point', 'line']],
  'point-on-circle': [['point', 'curve']],
  midpoint: [['point', 'line']],
  tangent: [['line', 'curve'], ['curve', 'curve']],
  concentric: [['curve', 'curve']],
  distance: [['point', 'point'], ['point', 'line']],
  'distance-x': [['point', 'point']],
  'distance-y': [['point', 'point']],
  length: [['line']],
  radius: [['curve']],
  diameter: [['curve']],
  angle: [['line', 'line']],
}

export function constraintSignatures(type: ConstraintType): string[][] {
  return SIGNATURES[type]
}

/** Entity kind used in signatures: point, line (incl. axes), curve (circle or arc). */
export function entityKind(entities: Map<string, SketchEntity>, id: string): 'point' | 'line' | 'curve' | undefined {
  if (id === SKETCH_ORIGIN) return 'point'
  if (id === SKETCH_X_AXIS || id === SKETCH_Y_AXIS) return 'line'
  const e = entities.get(id)
  if (!e) return undefined
  return e.type === 'point' ? 'point' : e.type === 'line' ? 'line' : 'curve'
}

/** Checks a constraint's references; returns a problem or null. */
export function checkConstraintReferences(entities: Map<string, SketchEntity>, c: Pick<SketchConstraint, 'type' | 'entities'>): string | null {
  const sigs = SIGNATURES[c.type]
  if (!sigs) return `Unknown constraint type “${c.type}”.`
  const kinds = c.entities.map((id) => entityKind(entities, id))
  const missing = c.entities.filter((_, i) => !kinds[i])
  if (missing.length) return `Unknown sketch entit${missing.length > 1 ? 'ies' : 'y'} ${missing.join(', ')}.`
  if (new Set(c.entities).size !== c.entities.length) return 'A constraint cannot reference the same entity twice.'
  const ok = sigs.some((sig) => sig.length === kinds.length && sig.every((k, i) => k === kinds[i]))
  if (!ok) return `${c.type} needs ${sigs.map((s) => s.join(' + ')).join(' or ')}; got ${kinds.join(' + ')}.`
  return null
}

export function solveSketch(sketch: Pick<SketchFeature, 'entities' | 'constraints'>, options: SolveOptions): SketchSolution {
  const tolerance = options.tolerance ?? 1e-9
  const maxIterations = options.maxIterations ?? 100
  const entities = new Map(sketch.entities.map((e) => [e.id, e]))
  const issues: SolveIssue[] = []

  // ---- unknowns --------------------------------------------------------------------------------
  const seed: number[] = []
  const pointIndex = new Map<string, number>()
  const radiusIndex = new Map<string, number>()
  for (const e of sketch.entities) {
    if (e.type === 'point') {
      pointIndex.set(e.id, seed.length)
      seed.push(e.x, e.y)
    }
  }
  for (const e of sketch.entities) {
    if (e.type === 'circle') {
      radiusIndex.set(e.id, seed.length)
      seed.push(e.radius)
    }
  }
  const n = seed.length

  const point = (id: string): PointRef => {
    if (id === SKETCH_ORIGIN) return { kind: 'const', x: 0, y: 0 }
    const i = pointIndex.get(id)
    if (i === undefined) throw new CadError('not-found', `Point ${id} does not exist.`)
    return { kind: 'var', ix: i, iy: i + 1 }
  }
  const px = (p: PointRef, x: Float64Array) => (p.kind === 'var' ? x[p.ix] : p.x)
  const py = (p: PointRef, x: Float64Array) => (p.kind === 'var' ? x[p.iy] : p.y)
  const line = (id: string): [PointRef, PointRef] => {
    if (id === SKETCH_X_AXIS) return [{ kind: 'const', x: 0, y: 0 }, { kind: 'const', x: 1, y: 0 }]
    if (id === SKETCH_Y_AXIS) return [{ kind: 'const', x: 0, y: 0 }, { kind: 'const', x: 0, y: 1 }]
    const e = entities.get(id)
    if (!e || e.type !== 'line') throw new CadError('not-found', `Line ${id} does not exist.`)
    return [point(e.start), point(e.end)]
  }
  const curve = (id: string): { c: PointRef; r: (x: Float64Array) => number } => {
    const e = entities.get(id)
    if (e?.type === 'circle') {
      const ri = radiusIndex.get(id)!
      return { c: point(e.center), r: (x) => x[ri] }
    }
    if (e?.type === 'arc') {
      const c = point(e.center)
      const s = point(e.start)
      return { c, r: (x) => Math.hypot(px(s, x) - px(c, x), py(s, x) - py(c, x)) }
    }
    throw new CadError('not-found', `Circle or arc ${id} does not exist.`)
  }
  const dir = (l: [PointRef, PointRef], x: Float64Array): Vec2 => [px(l[1], x) - px(l[0], x), py(l[1], x) - py(l[0], x)]
  const norm = (v: Vec2) => Math.hypot(v[0], v[1]) || 1e-300

  // ---- equations -------------------------------------------------------------------------------
  const equations: Equation[] = []
  const add = (constraintId: string, f: (x: Float64Array) => number) => equations.push({ constraintId, f })

  // Arc consistency: start and end at the same distance from the centre (internal constraint).
  for (const e of sketch.entities) {
    if (e.type !== 'arc') continue
    try {
      const c = point(e.center)
      const s = point(e.start)
      const t = point(e.end)
      add(`arc:${e.id}`, (x) => Math.hypot(px(s, x) - px(c, x), py(s, x) - py(c, x)) - Math.hypot(px(t, x) - px(c, x), py(t, x) - py(c, x)))
    } catch (err) {
      issues.push({ code: 'invalid-input', message: (err as Error).message, entityId: e.id })
    }
  }

  const driven: { id: string; measure: (x: Float64Array) => number }[] = []
  const seedX = Float64Array.from(seed)

  for (const c of sketch.constraints) {
    const problem = checkConstraintReferences(entities, c)
    if (problem) {
      issues.push({ code: 'invalid-input', message: `Constraint ${c.id}: ${problem}`, constraintId: c.id })
      continue
    }
    const dimensional = isDimensional(c.type)
    const isDriving = !dimensional || c.driving !== false
    let value = 0
    if (dimensional && isDriving) {
      const v = options.values[c.id]
      if (v === undefined || !Number.isFinite(v)) {
        issues.push({ code: 'invalid-expression', message: `Constraint ${c.id} has no valid value.`, constraintId: c.id })
        continue
      }
      value = v
      if ((c.type === 'length' || c.type === 'radius' || c.type === 'diameter') && value <= 0) {
        issues.push({ code: 'invalid-input', message: `Constraint ${c.id}: ${c.type} must be greater than zero (got ${value}).`, constraintId: c.id })
        continue
      }
      if (c.type === 'distance' && value < 0) {
        issues.push({ code: 'invalid-input', message: `Constraint ${c.id}: distance must not be negative (got ${value}).`, constraintId: c.id })
        continue
      }
    }
    const [a, b] = c.entities
    const kinds = c.entities.map((id) => entityKind(entities, id))
    const residuals = buildResiduals(c.type, kinds, a, b, value)
    if (!isDriving) {
      // Driven dimension: measured, never solved for. Its residual at value 0 is the measurement itself
      // for most types; compute explicitly for clarity.
      driven.push({ id: c.id, measure: measureFor(c.type, kinds, a, b) })
      continue
    }
    for (const f of residuals) add(c.id, f)
  }

  function buildResiduals(type: ConstraintType, kinds: (string | undefined)[], a: string, b: string, v: number): ((x: Float64Array) => number)[] {
    switch (type) {
      case 'coincident': {
        const p = point(a)
        const q = point(b)
        return [(x) => px(p, x) - px(q, x), (x) => py(p, x) - py(q, x)]
      }
      case 'horizontal':
      case 'vertical': {
        const [p, q] = kinds[0] === 'line' ? line(a) : [point(a), point(b)]
        return type === 'horizontal' ? [(x) => py(p, x) - py(q, x)] : [(x) => px(p, x) - px(q, x)]
      }
      case 'parallel':
      case 'perpendicular': {
        const l1 = line(a)
        const l2 = line(b)
        return [
          (x) => {
            const d1 = dir(l1, x)
            const d2 = dir(l2, x)
            const s = type === 'parallel' ? d1[0] * d2[1] - d1[1] * d2[0] : d1[0] * d2[0] + d1[1] * d2[1]
            return s / (norm(d1) * norm(d2))
          },
        ]
      }
      case 'equal': {
        if (kinds[0] === 'line') {
          const l1 = line(a)
          const l2 = line(b)
          return [(x) => norm(dir(l1, x)) - norm(dir(l2, x))]
        }
        const c1 = curve(a)
        const c2 = curve(b)
        return [(x) => c1.r(x) - c2.r(x)]
      }
      case 'fixed': {
        const p = point(a)
        if (p.kind === 'const') return []
        const x0 = seedX[p.ix]
        const y0 = seedX[p.iy]
        return [(x) => px(p, x) - x0, (x) => py(p, x) - y0]
      }
      case 'point-on-line': {
        const p = point(a)
        const l = line(b)
        return [
          (x) => {
            const d = dir(l, x)
            return (d[0] * (py(p, x) - py(l[0], x)) - d[1] * (px(p, x) - px(l[0], x))) / norm(d)
          },
        ]
      }
      case 'point-on-circle': {
        const p = point(a)
        const c = curve(b)
        return [(x) => Math.hypot(px(p, x) - px(c.c, x), py(p, x) - py(c.c, x)) - c.r(x)]
      }
      case 'midpoint': {
        const p = point(a)
        const [s, t] = line(b)
        return [(x) => px(p, x) - (px(s, x) + px(t, x)) / 2, (x) => py(p, x) - (py(s, x) + py(t, x)) / 2]
      }
      case 'tangent': {
        if (kinds[0] === 'line') {
          const l = line(a)
          const c = curve(b)
          return [
            (x) => {
              const d = dir(l, x)
              const dist = Math.abs(d[0] * (py(c.c, x) - py(l[0], x)) - d[1] * (px(c.c, x) - px(l[0], x))) / norm(d)
              return dist - c.r(x)
            },
          ]
        }
        const c1 = curve(a)
        const c2 = curve(b)
        const d0 = Math.hypot(px(c1.c, seedX) - px(c2.c, seedX), py(c1.c, seedX) - py(c2.c, seedX))
        const internal = d0 < Math.max(c1.r(seedX), c2.r(seedX))
        return [(x) => Math.hypot(px(c1.c, x) - px(c2.c, x), py(c1.c, x) - py(c2.c, x)) - (internal ? Math.abs(c1.r(x) - c2.r(x)) : c1.r(x) + c2.r(x))]
      }
      case 'concentric': {
        const c1 = curve(a)
        const c2 = curve(b)
        return [(x) => px(c1.c, x) - px(c2.c, x), (x) => py(c1.c, x) - py(c2.c, x)]
      }
      default: {
        const m = measureFor(type, kinds, a, b)
        const target = type === 'angle' ? v * DEG : v
        return [(x) => m(x) * (type === 'angle' ? DEG : 1) - target]
      }
    }
  }

  /** The measured quantity of a dimensional constraint (mm, or degrees for angles). */
  function measureFor(type: ConstraintType, kinds: (string | undefined)[], a: string, b: string): (x: Float64Array) => number {
    switch (type) {
      case 'distance': {
        if (kinds[1] === 'line') {
          const p = point(a)
          const l = line(b)
          return (x) => {
            const d = dir(l, x)
            return Math.abs(d[0] * (py(p, x) - py(l[0], x)) - d[1] * (px(p, x) - px(l[0], x))) / norm(d)
          }
        }
        const p = point(a)
        const q = point(b)
        return (x) => Math.hypot(px(q, x) - px(p, x), py(q, x) - py(p, x))
      }
      case 'distance-x': {
        const p = point(a)
        const q = point(b)
        return (x) => px(q, x) - px(p, x)
      }
      case 'distance-y': {
        const p = point(a)
        const q = point(b)
        return (x) => py(q, x) - py(p, x)
      }
      case 'length': {
        const l = line(a)
        return (x) => norm(dir(l, x))
      }
      case 'radius': {
        const c = curve(a)
        return (x) => c.r(x)
      }
      case 'diameter': {
        const c = curve(a)
        return (x) => 2 * c.r(x)
      }
      case 'angle': {
        const l1 = line(a)
        const l2 = line(b)
        return (x) => {
          const d1 = dir(l1, x)
          const d2 = dir(l2, x)
          return Math.atan2(Math.abs(d1[0] * d2[1] - d1[1] * d2[0]), d1[0] * d2[0] + d1[1] * d2[1]) / DEG
        }
      }
      default:
        throw new CadError('unsupported', `${type} is not a dimensional constraint.`)
    }
  }

  // ---- solve -----------------------------------------------------------------------------------
  const run = (eqs: Equation[]) => gaussNewton(eqs, Float64Array.from(seed), maxIterations, tolerance)
  const result = run(equations)
  const x = result.x

  // ---- analysis --------------------------------------------------------------------------------
  const J = jacobian(equations, x)
  const rank = analyzeRank(J, n)
  const dof = n - rank.rank
  const redundant = result.converged ? [...new Set(rank.dependentRows.map((r) => equations[r].constraintId))].filter((id) => !id.startsWith('arc:')) : []

  let conflicting: string[] = []
  if (!result.converged) {
    const ids = [...new Set(equations.map((e) => e.constraintId))].filter((id) => !id.startsWith('arc:')).reverse().slice(0, 60)
    conflicting = ids.filter((id) => run(equations.filter((e) => e.constraintId !== id)).converged)
  }

  const points: Record<string, Vec2> = {}
  for (const [id, i] of pointIndex) points[id] = [clean(x[i]), clean(x[i + 1])]
  const radii: Record<string, number> = {}
  for (const [id, i] of radiusIndex) radii[id] = clean(x[i])
  for (const e of sketch.entities) {
    if (e.type === 'arc' && points[e.center] && points[e.start]) radii[e.id] = clean(Math.hypot(points[e.start][0] - points[e.center][0], points[e.start][1] - points[e.center][1]))
  }
  const freeVars = new Set(rank.freeVariables)
  const freePoints = [...pointIndex].filter(([, i]) => freeVars.has(i) || freeVars.has(i + 1)).map(([id]) => id)
  const freeCircles = [...radiusIndex].filter(([, i]) => freeVars.has(i)).map(([id]) => id)
  const drivenValues: Record<string, number> = {}
  for (const d of driven) drivenValues[d.id] = clean(d.measure(x))

  for (const [id, r] of Object.entries(radii)) if (!(r > 0)) issues.push({ code: 'precondition-failed', message: `Circle or arc ${id} has collapsed to radius ${r}.`, entityId: id })

  let status: SketchStatus
  if (issues.length) status = 'failed'
  else if (!result.converged) status = 'conflicting'
  else if (redundant.length) status = 'over-constrained'
  else status = dof === 0 ? 'fully-constrained' : 'under-constrained'

  return {
    status,
    converged: result.converged,
    dof,
    iterations: result.iterations,
    maxResidual: result.maxResidual,
    points,
    radii,
    freePoints,
    freeCircles,
    redundant,
    conflicting,
    driven: drivenValues,
    issues,
  }
}

/** Rounds away floating-point noise (well below the modelling tolerance) for stable output. */
function clean(v: number): number {
  const r = Math.round(v * 1e9) / 1e9
  return Object.is(r, -0) ? 0 : r
}

function residuals(eqs: Equation[], x: Float64Array): number[] {
  return eqs.map((e) => e.f(x))
}

function jacobian(eqs: Equation[], x: Float64Array): Matrix {
  const n = x.length
  const J: Matrix = eqs.map(() => new Array<number>(n).fill(0))
  const work = Float64Array.from(x)
  for (let j = 0; j < n; j++) {
    const h = 1e-7 * Math.max(1, Math.abs(x[j]))
    work[j] = x[j] + h
    const fp = residuals(eqs, work)
    work[j] = x[j] - h
    const fm = residuals(eqs, work)
    work[j] = x[j]
    for (let i = 0; i < eqs.length; i++) J[i][j] = (fp[i] - fm[i]) / (2 * h)
  }
  return J
}

/** Damped minimum-norm Gauss–Newton: δ = −Jᵀ (J Jᵀ + λI)⁻¹ r, with λ adapted by the cost. */
function gaussNewton(eqs: Equation[], x0: Float64Array, maxIterations: number, tolerance: number) {
  let x = x0
  let r = residuals(eqs, x)
  let cost = r.reduce((s, v) => s + v * v, 0)
  let lambda = 1e-12
  let iterations = 0
  const maxAbs = (v: number[]) => v.reduce((m, a) => Math.max(m, Math.abs(a)), 0)
  if (!eqs.length) return { x, converged: true, iterations, maxResidual: 0 }
  while (iterations < maxIterations && maxAbs(r) > tolerance) {
    iterations++
    const J = jacobian(eqs, x)
    const m = eqs.length
    const JJt: Matrix = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, k) => J[i].reduce((s, v, j) => s + v * J[k][j], 0)))
    let improved = false
    for (let attempt = 0; attempt < 30; attempt++) {
      const A = JJt.map((row, i) => row.map((v, k) => (i === k ? v + lambda : v)))
      const y = solveLinear(A, r)
      if (!y) {
        lambda = Math.max(lambda * 10, 1e-12)
        continue
      }
      const next = Float64Array.from(x)
      for (let j = 0; j < x.length; j++) {
        let s = 0
        for (let i = 0; i < m; i++) s += J[i][j] * y[i]
        next[j] -= s
      }
      const rn = residuals(eqs, next)
      const cn = rn.reduce((s, v) => s + v * v, 0)
      if (Number.isFinite(cn) && cn < cost) {
        x = next
        r = rn
        cost = cn
        lambda = Math.max(lambda / 10, 1e-15)
        improved = true
        break
      }
      lambda = Math.max(lambda * 10, 1e-12)
    }
    if (!improved) break
  }
  const maxResidual = maxAbs(r)
  return { x, converged: maxResidual <= Math.max(tolerance, 1e-7), iterations, maxResidual }
}

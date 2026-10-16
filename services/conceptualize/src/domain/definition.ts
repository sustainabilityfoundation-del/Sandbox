import { convert, quantityProblem, sameDimension } from './units'
import type { Basis } from './rules'

/**
 * The engineering definition of a Concept revision (concept-visualization.md §5): the authoritative,
 * structured description that layouts render and CAD consumes. Generated images never write it.
 *
 * - Components, relationships, interfaces and parameters carry stable IDs (letters, digits, - and _).
 *   An item without an ID gets the next one from `idSeq` (C1, P1, I1, R1, D1), so IDs are never reused.
 * - Parameters are defined engineering values with units and a basis; "verified" is never a parameter
 *   basis: verification comes from recorded checks (evidence results against constraints).
 * - The layout places components in a 2D view. An extent bound to a parameter is to scale; dimensions
 *   are labelled ONLY from their parameter (never from geometry or image text).
 */

export const STAGES = ['exploration', 'layout', 'engineering'] as const
export type Stage = (typeof STAGES)[number]
export const COMPONENT_KINDS = ['part', 'assembly', 'purchased', 'envelope', 'feature'] as const
export const COMPONENT_RELATIONS = ['contains', 'attached-to', 'supports', 'guides', 'drives', 'connected-to', 'clears'] as const
export const INTERFACE_KINDS = ['mechanical', 'electrical', 'fluid', 'thermal', 'data', 'other'] as const
export const LAYOUT_VIEWS = ['top', 'front', 'side', 'section'] as const
export const PARAMETER_BASES = ['user-assertion', 'ai-hypothesis', 'assumption', 'estimate'] as const
export type ParameterBasis = (typeof PARAMETER_BASES)[number]

export type Coord = number | { parameter: string }

export interface Component {
  id: string
  name: string
  kind: (typeof COMPONENT_KINDS)[number]
  description: string
  basis: ParameterBasis
}
export interface ComponentRelationship {
  id: string
  type: (typeof COMPONENT_RELATIONS)[number]
  from: string
  to: string
  note: string
}
export interface ComponentInterface {
  id: string
  name: string
  kind: (typeof INTERFACE_KINDS)[number]
  between: string[]
  description: string
  parameterIds: string[]
}
export interface Parameter {
  id: string
  symbol: string
  name: string
  value: number | null
  min: number | null
  max: number | null
  unit: string
  basis: ParameterBasis
  componentId: string | null
  /** A design constraint (CST) this parameter is checked against: verification lives there. */
  constraintId: string | null
  note: string
}
export interface LayoutItem {
  componentId: string
  x: Coord
  y: Coord
  width: Coord
  height: Coord
  shape: 'rect' | 'circle'
}
export interface LayoutDimension {
  id: string
  parameterId: string
  componentId: string
  axis: 'x' | 'y'
}
export interface Layout {
  view: (typeof LAYOUT_VIEWS)[number]
  unit: string
  items: LayoutItem[]
  dimensions: LayoutDimension[]
}
export interface EngineeringDefinition {
  intent: string
  components: Component[]
  relationships: ComponentRelationship[]
  interfaces: ComponentInterface[]
  parameters: Parameter[]
  layout: Layout | null
  /** Highest numeric ID suffix ever assigned (IDs are never reused). */
  idSeq: number
}

export const EMPTY_DEFINITION: EngineeringDefinition = { intent: '', components: [], relationships: [], interfaces: [], parameters: [], layout: null, idSeq: 0 }

/** Stored definitions written before migration 0007 are `{}`. */
export function readDefinition(raw: unknown): EngineeringDefinition {
  const d = (raw ?? {}) as Partial<EngineeringDefinition>
  return {
    intent: d.intent ?? '',
    components: d.components ?? [],
    relationships: d.relationships ?? [],
    interfaces: d.interfaces ?? [],
    parameters: d.parameters ?? [],
    layout: d.layout ?? null,
    idSeq: d.idSeq ?? 0,
  }
}

export const ID = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/
const SYMBOL = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/

// ---- input -----------------------------------------------------------------------------------------------

type Opt<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
export interface DefinitionInput {
  intent?: string
  components?: Opt<Component, 'id' | 'kind' | 'description' | 'basis'>[]
  relationships?: Opt<ComponentRelationship, 'id' | 'note'>[]
  interfaces?: (Opt<ComponentInterface, 'id' | 'kind' | 'description' | 'parameterIds'> & { between: string[] })[]
  parameters?: (Opt<Parameter, 'id' | 'name' | 'value' | 'min' | 'max' | 'basis' | 'componentId' | 'constraintId' | 'note'>)[]
  layout?: (Opt<Layout, 'view' | 'unit' | 'dimensions'> & { items: Opt<LayoutItem, 'shape'>[]; dimensions?: Opt<LayoutDimension, 'id'>[] }) | null
}

export interface DefinitionContext {
  /** The assistant may only write ai-hypothesis, assumption or estimate on new or changed items. */
  assistant: boolean
  /** Basis used when an item gives none. */
  defaultBasis: ParameterBasis
  /** Constraint IDs (UUID) that exist in the project, checked by the caller. */
  constraintExists?: (id: string) => boolean
}

export class DefinitionError extends Error {
  constructor(readonly fields: Record<string, string>) {
    super(Object.values(fields)[0] ?? 'The definition is not valid.')
  }
}

/** Key-order-insensitive equality (stored JSONB does not keep key order); undefined fields are ignored. */
export const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(v)
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)

/**
 * Validates and normalizes a definition against the previous one: assigns missing IDs, checks references,
 * units and bases. Unchanged items keep their basis (so the assistant can carry a person's parameters
 * forward); new or changed items written by the assistant must use an assistant basis.
 */
export function normalizeDefinition(input: DefinitionInput, previous: EngineeringDefinition, ctx: DefinitionContext): EngineeringDefinition {
  const errors: Record<string, string> = {}
  let seq = previous.idSeq
  const used = new Set<string>()
  const assign = (given: string | undefined, at: string): string => {
    if (given !== undefined) {
      if (!ID.test(given)) errors[`${at}.id`] = 'IDs use letters, digits, - and _ and start with a letter (at most 40 characters)'
      if (used.has(given)) errors[`${at}.id`] = `ID ${given} is used twice`
      used.add(given)
      const n = /^(?:[A-Za-z]+)(\d+)$/.exec(given)
      if (n) seq = Math.max(seq, Number(n[1]))
      return given
    }
    return ''
  }
  const pending: { set: (id: string) => void; prefix: string }[] = []
  const later = (prefix: string, set: (id: string) => void) => pending.push({ prefix, set })
  const basisOf = (given: ParameterBasis | undefined, prior: { basis: ParameterBasis } | undefined, unchanged: boolean, at: string): ParameterBasis => {
    if (unchanged && prior) return prior.basis
    const basis = given ?? ctx.defaultBasis
    if (!PARAMETER_BASES.includes(basis)) errors[at] = `basis must be one of ${PARAMETER_BASES.join(', ')} (verification comes from recorded checks, not from a parameter)`
    else if (ctx.assistant && basis === 'user-assertion') errors[at] = 'the assistant may only record ai-hypothesis, assumption or estimate'
    return basis
  }

  const prevComponents = new Map(previous.components.map((c) => [c.id, c]))
  const components: Component[] = (input.components ?? []).map((c, i) => {
    const at = `definition.components[${i}]`
    if (!c.name?.trim()) errors[`${at}.name`] = 'required'
    const kind = c.kind ?? 'part'
    if (!COMPONENT_KINDS.includes(kind)) errors[`${at}.kind`] = `one of ${COMPONENT_KINDS.join(', ')}`
    const out: Component = { id: assign(c.id, at), name: (c.name ?? '').trim(), kind, description: (c.description ?? '').trim(), basis: 'ai-hypothesis' }
    const prior = out.id ? prevComponents.get(out.id) : undefined
    const unchanged = !!prior && prior.name === out.name && prior.kind === out.kind && prior.description === out.description && (c.basis === undefined || c.basis === prior.basis)
    out.basis = basisOf(c.basis, prior, unchanged, `${at}.basis`)
    if (!out.id) later('C', (id) => (out.id = id))
    return out
  })
  const prevParams = new Map(previous.parameters.map((p) => [p.id, p]))
  const parameters: Parameter[] = (input.parameters ?? []).map((p, i) => {
    const at = `definition.parameters[${i}]`
    if (!p.symbol || !SYMBOL.test(p.symbol)) errors[`${at}.symbol`] = 'a symbol such as w_max (letters, digits and _)'
    const problem = quantityProblem({ value: p.value ?? null, min: p.min ?? null, max: p.max ?? null, unit: p.unit })
    if (problem) errors[`${at}.unit`] = problem
    if (p.value == null && p.min == null && p.max == null) errors[`${at}.value`] = 'give a value, a minimum or a maximum (an unknown value is an open question, not a parameter)'
    const out: Parameter = {
      id: assign(p.id, at),
      symbol: p.symbol,
      name: (p.name ?? p.symbol ?? '').trim(),
      value: p.value ?? null,
      min: p.min ?? null,
      max: p.max ?? null,
      unit: p.unit,
      basis: 'ai-hypothesis',
      componentId: p.componentId ?? null,
      constraintId: p.constraintId ?? null,
      note: (p.note ?? '').trim(),
    }
    const prior = out.id ? prevParams.get(out.id) : undefined
    const unchanged = !!prior && same({ ...prior, basis: undefined }, { ...out, basis: undefined }) && (p.basis === undefined || p.basis === prior.basis)
    out.basis = basisOf(p.basis, prior, unchanged, `${at}.basis`)
    if (out.constraintId && ctx.constraintExists && !ctx.constraintExists(out.constraintId)) errors[`${at}.constraintId`] = `constraint ${out.constraintId} is not in this project`
    if (!out.id) later('P', (id) => (out.id = id))
    return out
  })
  const relationships: ComponentRelationship[] = (input.relationships ?? []).map((r, i) => {
    const at = `definition.relationships[${i}]`
    if (!COMPONENT_RELATIONS.includes(r.type)) errors[`${at}.type`] = `one of ${COMPONENT_RELATIONS.join(', ')}`
    const out: ComponentRelationship = { id: assign(r.id, at), type: r.type, from: r.from, to: r.to, note: (r.note ?? '').trim() }
    if (!out.id) later('R', (id) => (out.id = id))
    return out
  })
  const interfaces: ComponentInterface[] = (input.interfaces ?? []).map((f, i) => {
    const at = `definition.interfaces[${i}]`
    if (!f.name?.trim()) errors[`${at}.name`] = 'required'
    const kind = f.kind ?? 'mechanical'
    if (!INTERFACE_KINDS.includes(kind)) errors[`${at}.kind`] = `one of ${INTERFACE_KINDS.join(', ')}`
    if (!Array.isArray(f.between) || f.between.length !== 2) errors[`${at}.between`] = 'two component IDs'
    const out: ComponentInterface = { id: assign(f.id, at), name: (f.name ?? '').trim(), kind, between: [f.between?.[0], f.between?.[1]], description: (f.description ?? '').trim(), parameterIds: f.parameterIds ?? [] }
    if (!out.id) later('I', (id) => (out.id = id))
    return out
  })
  let layout: Layout | null = null
  if (input.layout) {
    const l = input.layout
    const unit = l.unit ?? 'mm'
    if (quantityProblem({ value: 1, unit }) || !sameDimension(unit, 'mm')) errors['definition.layout.unit'] = 'a length unit such as mm'
    const view = l.view ?? 'top'
    if (!LAYOUT_VIEWS.includes(view)) errors['definition.layout.view'] = `one of ${LAYOUT_VIEWS.join(', ')}`
    layout = {
      view,
      unit,
      items: (l.items ?? []).map((it) => ({ componentId: it.componentId, x: it.x, y: it.y, width: it.width, height: it.height, shape: it.shape ?? 'rect' })),
      dimensions: (l.dimensions ?? []).map((d, i) => {
        const out: LayoutDimension = { id: assign(d.id, `definition.layout.dimensions[${i}]`), parameterId: d.parameterId, componentId: d.componentId, axis: d.axis }
        if (!out.id) later('D', (id) => (out.id = id))
        return out
      }),
    }
  }
  for (const p of pending) {
    let id: string
    do id = `${p.prefix}${++seq}`
    while (used.has(id))
    used.add(id)
    p.set(id)
  }

  // References (after IDs are known).
  const componentIds = new Set(components.map((c) => c.id))
  const paramById = new Map(parameters.map((p) => [p.id, p]))
  const symbols = new Set<string>()
  parameters.forEach((p, i) => {
    if (symbols.has(p.symbol)) errors[`definition.parameters[${i}].symbol`] = `symbol ${p.symbol} is used twice`
    symbols.add(p.symbol)
    if (p.componentId && !componentIds.has(p.componentId)) errors[`definition.parameters[${i}].componentId`] = `no component ${p.componentId}`
  })
  relationships.forEach((r, i) => {
    for (const end of ['from', 'to'] as const) if (!componentIds.has(r[end])) errors[`definition.relationships[${i}].${end}`] = `no component ${r[end]}`
    if (r.from === r.to) errors[`definition.relationships[${i}]`] = 'a relationship joins two different components'
  })
  interfaces.forEach((f, i) => {
    f.between.forEach((c, j) => {
      if (!componentIds.has(c)) errors[`definition.interfaces[${i}].between[${j}]`] = `no component ${c}`
    })
    f.parameterIds.forEach((p, j) => {
      if (!paramById.has(p)) errors[`definition.interfaces[${i}].parameterIds[${j}]`] = `no parameter ${p}`
    })
  })
  if (layout) {
    const placed = new Set<string>()
    const lengthParam = (ref: string, at: string) => {
      const p = paramById.get(ref)
      if (!p) errors[at] = `no parameter ${ref}`
      else if (!sameDimension(p.unit, layout!.unit)) errors[at] = `parameter ${p.symbol} is in ${p.unit}, not a length`
      else if (p.value == null) errors[at] = `parameter ${p.symbol} has no nominal value to draw`
    }
    layout.items.forEach((it, i) => {
      const at = `definition.layout.items[${i}]`
      if (!componentIds.has(it.componentId)) errors[`${at}.componentId`] = `no component ${it.componentId}`
      if (placed.has(it.componentId)) errors[`${at}.componentId`] = `component ${it.componentId} is placed twice`
      placed.add(it.componentId)
      for (const k of ['x', 'y', 'width', 'height'] as const) {
        const v = it[k]
        if (typeof v === 'number') {
          if (!Number.isFinite(v) || ((k === 'width' || k === 'height') && v <= 0)) errors[`${at}.${k}`] = k === 'width' || k === 'height' ? 'a positive number' : 'a number'
        } else if (v && typeof v === 'object' && typeof v.parameter === 'string') lengthParam(v.parameter, `${at}.${k}`)
        else errors[`${at}.${k}`] = 'a number (layout units) or { parameter: <parameter ID> }'
      }
      if (!['rect', 'circle'].includes(it.shape)) errors[`${at}.shape`] = 'rect or circle'
    })
    layout.dimensions.forEach((d, i) => {
      const at = `definition.layout.dimensions[${i}]`
      lengthParam(d.parameterId, `${at}.parameterId`)
      if (!placed.has(d.componentId)) errors[`${at}.componentId`] = `component ${d.componentId} is not in the layout`
      if (d.axis !== 'x' && d.axis !== 'y') errors[`${at}.axis`] = 'x or y'
    })
  }
  if (Object.keys(errors).length) throw new DefinitionError(errors)
  return { intent: (input.intent ?? '').trim(), components, relationships, interfaces, parameters, layout, idSeq: seq }
}

// ---- layout geometry and scale -----------------------------------------------------------------------------

/** A coordinate in layout units; a parameter reference uses the parameter's nominal value, converted. */
export function coordValue(c: Coord, d: EngineeringDefinition): number {
  if (typeof c === 'number') return c
  const p = d.parameters.find((x) => x.id === c.parameter)
  if (!p || p.value == null || !d.layout) return NaN
  return convert(p.value, p.unit, d.layout.unit)
}

/**
 * A layout is to scale when every dimensioned extent is bound to the parameter it is labelled with.
 * Otherwise the drawing is schematic: labels stay exact (from parameters) but lengths are not to scale.
 */
export function layoutNotToScale(d: EngineeringDefinition): boolean {
  if (!d.layout) return true
  return d.layout.dimensions.some((dim) => {
    const it = d.layout!.items.find((i) => i.componentId === dim.componentId)
    const extent = dim.axis === 'x' ? it?.width : it?.height
    return !(extent && typeof extent === 'object' && extent.parameter === dim.parameterId)
  })
}

// ---- change detection (staleness) ---------------------------------------------------------------------------

export interface DefinitionChange {
  area: 'intent' | 'component' | 'relationship' | 'interface' | 'parameter' | 'layout'
  id: string
  change: 'added' | 'removed' | 'changed'
  label: string
}

const diffList = <T extends { id: string }>(area: DefinitionChange['area'], a: T[], b: T[], label: (x: T) => string): DefinitionChange[] => {
  const out: DefinitionChange[] = []
  const before = new Map(a.map((x) => [x.id, x]))
  const after = new Map(b.map((x) => [x.id, x]))
  for (const [id, x] of after) {
    const prior = before.get(id)
    if (!prior) out.push({ area, id, change: 'added', label: label(x) })
    else if (!same(prior, x)) out.push({ area, id, change: 'changed', label: label(x) })
  }
  for (const [id, x] of before) if (!after.has(id)) out.push({ area, id, change: 'removed', label: label(x) })
  return out
}

const paramLabel = (p: Parameter) => `${p.symbol} = ${p.value ?? `${p.min ?? '…'}–${p.max ?? '…'}`} ${p.unit}`

/** What changed between two definitions (stable IDs make this exact). */
export function definitionChanges(a: EngineeringDefinition, b: EngineeringDefinition): DefinitionChange[] {
  return [
    ...(a.intent !== b.intent ? [{ area: 'intent' as const, id: 'intent', change: 'changed' as const, label: 'functional intent' }] : []),
    ...diffList('component', a.components, b.components, (c) => c.name),
    ...diffList('relationship', a.relationships, b.relationships, (r) => `${r.from} ${r.type} ${r.to}`),
    ...diffList('interface', a.interfaces, b.interfaces, (f) => f.name),
    ...diffList('parameter', a.parameters, b.parameters, paramLabel),
    ...(!same(a.layout, b.layout) ? [{ area: 'layout' as const, id: 'layout', change: (a.layout ? (b.layout ? 'changed' : 'removed') : 'added') as DefinitionChange['change'], label: 'layout' }] : []),
  ]
}

/** Which changes make a dependent artifact possibly outdated. */
export const RELEVANT: Record<'layout' | 'illustration' | 'handoff' | 'downstream', DefinitionChange['area'][]> = {
  layout: ['component', 'parameter', 'layout'],
  illustration: ['intent', 'component', 'interface', 'parameter'],
  handoff: ['intent', 'component', 'relationship', 'interface', 'parameter', 'layout'],
  downstream: ['component', 'interface', 'parameter'],
}

export const basisForAssistant = (b: Basis) => (['ai-hypothesis', 'assumption', 'estimate'] as Basis[]).includes(b)

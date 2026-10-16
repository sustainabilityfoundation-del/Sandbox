import type { Coord, DefinedParameter, DefinitionInput, EngineeringDefinition, LayoutItem } from '@ews/conceptualize-client'
import { parameterLabel } from './renderLayout'

/**
 * Targeted changes to an engineering definition (refinement from annotations, assistant edits), applied
 * client-side to produce the full definition the API stores. Stable IDs are kept; new items get the next
 * IDs after `idSeq` so placements can refer to them in the same change. Pure and testable; the service
 * validates the result exactly as it validates a person's edit.
 */

export interface DefinitionChanges {
  intent?: string
  setParameters?: { parameter: string; value?: number | null; min?: number | null; max?: number | null; unit?: string; name?: string }[]
  addParameters?: { symbol: string; name?: string; value?: number | null; min?: number | null; max?: number | null; unit: string; componentId?: string | null; basis?: DefinedParameter['basis'] }[]
  removeParameters?: string[]
  addComponents?: { name: string; kind?: 'part' | 'assembly' | 'purchased' | 'envelope' | 'feature'; description?: string; placement?: { x: Coord; y: Coord; width: Coord; height: Coord; shape?: 'rect' | 'circle' } }[]
  updateComponents?: { id: string; name?: string; kind?: 'part' | 'assembly' | 'purchased' | 'envelope' | 'feature'; description?: string }[]
  removeComponents?: string[]
  setPlacements?: { componentId: string; x?: Coord; y?: Coord; width?: Coord; height?: Coord; shape?: 'rect' | 'circle' }[]
  addInterfaces?: { name: string; kind?: 'mechanical' | 'electrical' | 'fluid' | 'thermal' | 'data' | 'other'; between: string[]; description?: string; parameterIds?: string[] }[]
  removeInterfaces?: string[]
  addDimensions?: { parameter: string; componentId: string; axis: 'x' | 'y' }[]
}

export interface ChangeLine {
  label: string
  before?: string
  after: string
}

export class ChangeError extends Error {}

const coordText = (c: Coord | undefined, def: EngineeringDefinition) => (c === undefined ? '' : typeof c === 'number' ? String(c) : (def.parameters.find((p) => p.id === c.parameter)?.symbol ?? c.parameter))

/** Resolves a parameter by ID or symbol. */
export function findParameter(def: EngineeringDefinition, ref: string): DefinedParameter | undefined {
  return def.parameters.find((p) => p.id === ref) ?? def.parameters.find((p) => p.symbol === ref)
}

export function applyDefinitionChanges(def: EngineeringDefinition, changes: DefinitionChanges, basis: DefinedParameter['basis'] = 'ai-hypothesis'): { input: DefinitionInput; lines: ChangeLine[] } {
  const lines: ChangeLine[] = []
  let seq = def.idSeq
  const next = (prefix: string, taken: Set<string>) => {
    let id: string
    do id = `${prefix}${++seq}`
    while (taken.has(id))
    taken.add(id)
    return id
  }
  const taken = new Set([...def.components.map((c) => c.id), ...def.parameters.map((p) => p.id), ...def.interfaces.map((f) => f.id), ...def.relationships.map((r) => r.id), ...(def.layout?.dimensions.map((d) => d.id) ?? [])])
  let components = def.components.map((c) => ({ ...c }))
  let parameters = def.parameters.map((p) => ({ ...p }))
  let interfaces = def.interfaces.map((f) => ({ ...f }))
  let relationships = def.relationships.map((r) => ({ ...r }))
  let items: LayoutItem[] = def.layout?.items.map((i) => ({ ...i })) ?? []
  let dimensions = def.layout?.dimensions.map((d) => ({ ...d })) ?? []
  const comp = (id: string) => {
    const c = components.find((x) => x.id === id)
    if (!c) throw new ChangeError(`There is no component ${id}.`)
    return c
  }
  if (changes.intent !== undefined && changes.intent !== def.intent) lines.push({ label: 'Functional intent', before: def.intent, after: changes.intent })
  for (const s of changes.setParameters ?? []) {
    const p = parameters.find((x) => x.id === s.parameter) ?? parameters.find((x) => x.symbol === s.parameter)
    if (!p) throw new ChangeError(`There is no parameter ${s.parameter}.`)
    const before = parameterLabel(p)
    if (s.value !== undefined) p.value = s.value
    if (s.min !== undefined) p.min = s.min
    if (s.max !== undefined) p.max = s.max
    if (s.unit !== undefined) p.unit = s.unit
    if (s.name !== undefined) p.name = s.name
    p.basis = basis
    lines.push({ label: `Parameter ${p.id}`, before, after: parameterLabel(p) })
  }
  for (const a of changes.addParameters ?? []) {
    if (parameters.some((p) => p.symbol === a.symbol)) throw new ChangeError(`Parameter symbol ${a.symbol} already exists; use setParameters.`)
    const p: DefinedParameter = { id: next('P', taken), symbol: a.symbol, name: a.name ?? a.symbol, value: a.value ?? null, min: a.min ?? null, max: a.max ?? null, unit: a.unit, basis: a.basis ?? basis, componentId: a.componentId ?? null, constraintId: null, note: '' }
    parameters.push(p)
    lines.push({ label: `New parameter ${p.id}`, after: parameterLabel(p) })
  }
  for (const a of changes.addComponents ?? []) {
    const id = next('C', taken)
    components.push({ id, name: a.name, kind: a.kind ?? 'part', description: a.description ?? '', basis })
    lines.push({ label: `New component ${id}`, after: `${a.name} (${a.kind ?? 'part'})` })
    if (a.placement) {
      items.push({ componentId: id, x: a.placement.x, y: a.placement.y, width: a.placement.width, height: a.placement.height, shape: a.placement.shape ?? 'rect' })
      lines.push({ label: `Placement of ${id}`, after: `x ${coordText(a.placement.x, def)}, y ${coordText(a.placement.y, def)}, ${coordText(a.placement.width, def)} × ${coordText(a.placement.height, def)}` })
    }
  }
  for (const u of changes.updateComponents ?? []) {
    const c = comp(u.id)
    const before = `${c.name} (${c.kind})`
    if (u.name !== undefined) c.name = u.name
    if (u.kind !== undefined) c.kind = u.kind
    if (u.description !== undefined) c.description = u.description
    c.basis = basis
    lines.push({ label: `Component ${c.id}`, before, after: `${c.name} (${c.kind})` })
  }
  for (const id of changes.removeComponents ?? []) {
    const c = comp(id)
    components = components.filter((x) => x.id !== id)
    items = items.filter((i) => i.componentId !== id)
    dimensions = dimensions.filter((d) => d.componentId !== id)
    interfaces = interfaces.filter((f) => !f.between.includes(id))
    relationships = relationships.filter((r) => r.from !== id && r.to !== id)
    parameters = parameters.map((p) => (p.componentId === id ? { ...p, componentId: null } : p))
    lines.push({ label: `Removed component ${id}`, before: c.name, after: '(removed, with its placement, dimensions, interfaces and relationships)' })
  }
  for (const s of changes.setPlacements ?? []) {
    comp(s.componentId)
    const it = items.find((i) => i.componentId === s.componentId)
    if (!it) {
      if (s.x === undefined || s.y === undefined || s.width === undefined || s.height === undefined) throw new ChangeError(`${s.componentId} is not placed yet; give x, y, width and height.`)
      items.push({ componentId: s.componentId, x: s.x, y: s.y, width: s.width, height: s.height, shape: s.shape ?? 'rect' })
      lines.push({ label: `Placement of ${s.componentId}`, after: `x ${coordText(s.x, def)}, y ${coordText(s.y, def)}` })
      continue
    }
    const before = `x ${coordText(it.x, def)}, y ${coordText(it.y, def)}, ${coordText(it.width, def)} × ${coordText(it.height, def)}`
    for (const k of ['x', 'y', 'width', 'height'] as const) if (s[k] !== undefined) it[k] = s[k]!
    if (s.shape) it.shape = s.shape
    lines.push({ label: `Placement of ${s.componentId}`, before, after: `x ${coordText(it.x, def)}, y ${coordText(it.y, def)}, ${coordText(it.width, def)} × ${coordText(it.height, def)}` })
  }
  for (const a of changes.addInterfaces ?? []) {
    a.between.forEach(comp)
    const id = next('I', taken)
    interfaces.push({ id, name: a.name, kind: a.kind ?? 'mechanical', between: a.between, description: a.description ?? '', parameterIds: a.parameterIds ?? [] })
    lines.push({ label: `New interface ${id}`, after: `${a.name}: ${a.between.join(' ↔ ')}` })
  }
  for (const id of changes.removeInterfaces ?? []) {
    if (!interfaces.some((f) => f.id === id)) throw new ChangeError(`There is no interface ${id}.`)
    interfaces = interfaces.filter((f) => f.id !== id)
    lines.push({ label: `Removed interface ${id}`, after: '(removed)' })
  }
  for (const id of changes.removeParameters ?? []) {
    const p = parameters.find((x) => x.id === id) ?? parameters.find((x) => x.symbol === id)
    if (!p) throw new ChangeError(`There is no parameter ${id}.`)
    const used = items.some((i) => (['x', 'y', 'width', 'height'] as const).some((k) => typeof i[k] === 'object' && (i[k] as { parameter: string }).parameter === p.id))
    if (used) throw new ChangeError(`Parameter ${p.symbol} positions a component in the layout; change the placement first.`)
    parameters = parameters.filter((x) => x.id !== p.id)
    dimensions = dimensions.filter((d) => d.parameterId !== p.id)
    lines.push({ label: `Removed parameter ${p.id}`, before: parameterLabel(p), after: '(removed)' })
  }
  for (const d of changes.addDimensions ?? []) {
    const p = parameters.find((x) => x.id === d.parameter) ?? parameters.find((x) => x.symbol === d.parameter)
    if (!p) throw new ChangeError(`There is no parameter ${d.parameter}.`)
    const id = next('D', taken)
    dimensions.push({ id, parameterId: p.id, componentId: d.componentId, axis: d.axis })
    lines.push({ label: `New dimension ${id}`, after: `${parameterLabel(p)} on ${d.componentId} (${d.axis})` })
  }
  const layout = def.layout || items.length ? { view: def.layout?.view ?? 'top', unit: def.layout?.unit ?? 'mm', items, dimensions } : null
  return { input: { intent: changes.intent ?? def.intent, components, relationships, interfaces, parameters, layout }, lines }
}

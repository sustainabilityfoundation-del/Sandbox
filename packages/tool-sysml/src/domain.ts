import { displayId, isComponent, readSysmlElement, type EngineeringObject, type ModelChange, type ModelIndex, type SysmlElement } from '@ews/platform-sdk'

/**
 * SysML tool domain logic (no React).
 *
 * Supported constructs (a deliberately small subset, not SysML v2 compliant):
 * - part (definition) and part usages nested in one part definition
 * - requirement usage that references a requirement in the shared twin
 * - connection between two parts
 * - satisfy: a part satisfies a requirement usage
 * - represents: a part stands for a physical component (shared identity)
 * Not supported: ports, interfaces, items, attributes, actions, states,
 * constraints, allocations, views, packages, imports, multiplicities.
 */

export const SUPPORTED_CONSTRUCTS = ['part', 'part usage (nested once)', 'requirement usage (reference)', 'connection', 'satisfy', 'represents (link to a physical component)']
export const UNSUPPORTED_CONSTRUCTS = ['ports and interfaces', 'items and attributes', 'actions and states', 'constraints and calculations', 'packages and imports', 'multiplicities']

export interface SysmlViewState {
  /** Diagram position, private to this view instance. */
  camera: { panX: number; panY: number; zoom: number }
  showText: boolean
  dialog: null | { kind: 'add-part'; representsId?: string } | { kind: 'add-requirement'; requirementId?: string } | { kind: 'connect'; fromId?: string }
}

export const INITIAL_VIEW_STATE: SysmlViewState = { camera: { panX: 0, panY: 0, zoom: 1 }, showText: false, dialog: null }

export interface DiagramModel {
  elements: SysmlElement[]
  definitions: SysmlElement[]
  usagesOf: (id: string) => SysmlElement[]
  requirements: SysmlElement[]
  connections: { id: string; from: string; to: string }[]
  satisfies: { id: string; from: string; to: string }[]
}

export function diagramModel(model: ModelIndex): DiagramModel {
  const elements = model.objects.filter((o) => o.type === 'sysml-element').map(readSysmlElement)
  const parts = elements.filter((e) => e.kind === 'part')
  const ids = new Set(elements.map((e) => e.id))
  const rels = (type: 'connects' | 'satisfies') =>
    model.relationships.filter((r) => r.type === type && ids.has(r.from) && ids.has(r.to)).map((r) => ({ id: r.id, from: r.from, to: r.to }))
  return {
    elements,
    definitions: parts.filter((p) => !p.ownerId),
    usagesOf: (id) => parts.filter((p) => p.ownerId === id),
    requirements: elements.filter((e) => e.kind === 'requirement'),
    connections: rels('connects'),
    satisfies: rels('satisfies'),
  }
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface DiagramLayout {
  boxes: Map<string, Box>
  bounds: Box
}

const USAGE_W = 150
const USAGE_H = 70
const GAP = 28

/** Automatic layout: part definitions with their usages in a row, requirement usages in a column. */
export function layoutDiagram(d: DiagramModel): DiagramLayout {
  const boxes = new Map<string, Box>()
  let y = 0
  let right = 0
  for (const def of d.definitions) {
    const usages = d.usagesOf(def.id)
    const w = usages.length ? usages.length * (USAGE_W + GAP) + GAP : 180
    const h = usages.length ? USAGE_H + 76 : 80
    boxes.set(def.id, { x: 0, y, w, h })
    usages.forEach((u, i) => boxes.set(u.id, { x: GAP + i * (USAGE_W + GAP), y: y + 56, w: USAGE_W, h: USAGE_H }))
    y += h + 40
    right = Math.max(right, w)
  }
  const rx = right + 120
  d.requirements.forEach((r, i) => boxes.set(r.id, { x: rx, y: i * (USAGE_H + 24), w: 200, h: USAGE_H }))
  const maxX = d.requirements.length ? rx + 200 : right
  const maxY = Math.max(y - 40, d.requirements.length * (USAGE_H + 24) - 24, 80)
  return { boxes, bounds: { x: -40, y: -40, w: maxX + 80, h: maxY + 80 } }
}

/** Valid connection kind between two elements, or why there is none. */
export function connectionKind(from: SysmlElement | undefined, to: SysmlElement | undefined): { kind: 'connects' | 'satisfies' } | { error: string } {
  if (!from || !to) return { error: 'Choose both ends.' }
  if (from.id === to.id) return { error: 'An element cannot be connected to itself.' }
  if (from.kind !== 'part') return { error: 'Connections start at a part.' }
  return to.kind === 'requirement' ? { kind: 'satisfies' } : { kind: 'connects' }
}

/** Lower-camel identifier from a display name, e.g. "Ingress protection" → "ingressProtection". */
export function identifier(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'element'
  return words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))).join('')
}

export function createPartChanges(input: { name: string; typeName?: string; ownerId?: string; representsId?: string }): ModelChange[] {
  return [
    {
      kind: 'add-object',
      idPrefix: 'SYS',
      ref: '$part',
      object: {
        type: 'sysml-element',
        name: input.name,
        ...(input.ownerId ? { parentId: input.ownerId } : {}),
        properties: { kind: 'part', ...(input.typeName ? { typeName: input.typeName } : {}) },
      },
    },
    ...(input.representsId ? [{ kind: 'add-relationship' as const, relationship: { type: 'represents' as const, from: '$part', to: input.representsId } }] : []),
  ]
}

export function createRequirementChanges(requirement: EngineeringObject): ModelChange[] {
  return [
    { kind: 'add-object', idPrefix: 'SYS', ref: '$req', object: { type: 'sysml-element', name: identifier(requirement.name), properties: { kind: 'requirement' } } },
    { kind: 'add-relationship', relationship: { type: 'references', from: '$req', to: requirement.id } },
  ]
}

/**
 * Illustrative SysML v2-style text generated from the model. It is a read-only
 * rendering of the supported constructs, not a parser and not the standard's
 * full grammar.
 */
export function textNotation(model: ModelIndex, d: DiagramModel): string {
  const lines = ['// Illustrative SysML v2-style notation, generated from the model (read-only; not parsed).', '']
  const nameOf = (id: string) => d.elements.find((e) => e.id === id)?.name ?? id
  const note = (e: SysmlElement) => {
    const component = model.linked(e.id, 'represents', 'out')[0]
    return `// ${e.id}${component ? ` represents ${component}` : ''}`
  }
  const placed = new Set<string>()
  for (const def of d.definitions) {
    const usages = d.usagesOf(def.id)
    const group = new Set([def.id, ...usages.map((u) => u.id)])
    lines.push(`part def ${def.name} {  ${note(def)}`)
    for (const u of usages) lines.push(`  part ${u.name}${u.typeName ? ` : ${u.typeName}` : ''};  ${note(u)}`)
    for (const c of d.connections) {
      if (group.has(c.from) && group.has(c.to)) {
        lines.push(`  connect ${nameOf(c.from)} to ${nameOf(c.to)};`)
        placed.add(c.id)
      }
    }
    lines.push('}', '')
  }
  for (const r of d.requirements) {
    const ref = model.linked(r.id, 'references', 'out')[0]
    const statement = ref ? model.get(ref)?.properties.statement : undefined
    const refObject = ref ? model.get(ref) : undefined
    lines.push(`requirement ${r.name} {  // ${r.id}${ref ? ` references ${refObject ? displayId(refObject) : ref}` : ''}`)
    if (typeof statement === 'string') lines.push(`  doc /* ${statement} */`)
    lines.push('}')
  }
  const rest = [
    ...d.satisfies.map((s) => `satisfy ${nameOf(s.to)} by ${nameOf(s.from)};`),
    ...d.connections.filter((c) => !placed.has(c.id)).map((c) => `connect ${nameOf(c.from)} to ${nameOf(c.to)};`),
  ]
  if (rest.length) lines.push('', ...rest)
  return lines.join('\n')
}

/** Components that no SysML element represents yet. */
export function unrepresentedComponents(model: ModelIndex): EngineeringObject[] {
  return model.objects.filter((o) => isComponent(o) && !model.linkedObjects(o.id, 'represents', 'in').some((e) => e.type === 'sysml-element'))
}

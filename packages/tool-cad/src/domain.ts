import {
  componentOf,
  isComponent,
  readCadRepresentation,
  type CadRepresentation,
  type EngineeringObject,
  type ModelChange,
  type ModelIndex,
  type Quantity,
} from '@ews/platform-sdk'

/**
 * CAD tool domain logic (no React). The geometry is a MOCK side elevation
 * computed from a few demonstration dimensions; there is no CAD kernel.
 */

export interface Camera {
  /** Offset from the fitted centre, in mm. */
  panX: number
  panY: number
  zoom: number
}

export interface CadViewState {
  camera: Camera
  mode: 'select' | 'pan'
  /** Side panel: dimension editing or part visibility. */
  panel: 'dimensions' | 'visibility' | null
  /** Hidden components in this view only (private view state). */
  hidden: string[]
}

export const FIT_CAMERA: Camera = { panX: 0, panY: 0, zoom: 1 }

export const INITIAL_VIEW_STATE: CadViewState = { camera: FIT_CAMERA, mode: 'select', panel: null, hidden: [] }

/** Editable demonstration dimensions, with validation ranges (mm). */
export const DIMENSIONS: Record<string, { label: string; min: number; max: number }> = {
  diameter: { label: 'Diameter', min: 5, max: 200 },
  outerDiameter: { label: 'Outer diameter', min: 20, max: 300 },
  length: { label: 'Length', min: 50, max: 2000 },
}

/**
 * The explicit, documented mapping from a representation's parameter to its
 * component's property. A CAD edit updates the mapped component property in
 * the same transaction, so the twin stays consistent. The first property that
 * exists on the component is used; parameters with no match update the
 * representation only. There is no other synchronisation (in particular, none
 * between CAD and SysML).
 */
export const PARAMETER_TO_PROPERTY: Record<string, string[]> = {
  diameter: ['diameter'],
  outerDiameter: ['outerDiameter'],
  length: ['effectiveLength', 'length'],
}

export function mappedProperty(component: EngineeringObject | undefined, parameter: string): string | undefined {
  if (!component) return undefined
  return PARAMETER_TO_PROPERTY[parameter]?.find((p) => p in component.properties)
}

export interface Part {
  rep: CadRepresentation
  component: EngineeringObject | undefined
}

/** CAD representations with the components they represent. */
export function partsOf(model: ModelIndex): Part[] {
  return model.objects
    .filter((o) => o.type === 'cad-representation')
    .map((o) => ({ rep: readCadRepresentation(o), component: componentOf(model, o.id) }))
}

/** The representation of a component, if it has one. */
export function partForComponent(parts: Part[], componentId: string | undefined): Part | undefined {
  return componentId ? parts.find((p) => p.component?.id === componentId) : undefined
}

/** The component a selected object stands for (itself, or what its representation represents). */
export function selectedComponentId(model: ModelIndex, selectedIds: string[]): string | undefined {
  for (const id of selectedIds) {
    const c = componentOf(model, id)
    if (c && isComponent(c)) return c.id
  }
  return undefined
}

const mm = (q: Quantity | undefined, fallback: number) => (q && q.unit === 'mm' ? q.value : fallback)

/** Mock side elevation in mm, with the actuator axis at y = 0. */
export interface Layout {
  housing: { length: number; od: number }
  rod: { d: number; length: number; x0: number }
  motor: { length: number; d: number; y: number }
  bounds: { x: number; y: number; w: number; h: number }
}

export function layoutOf(parts: Part[]): Layout {
  const byShape = (shape: string) => parts.find((p) => p.rep.shape === shape)?.rep.parameters ?? {}
  const h = byShape('housing')
  const r = byShape('rod')
  const m = byShape('motor')
  const housing = { length: mm(h.length, 420), od: mm(h.outerDiameter, 60) }
  // About 100 mm of the rod stays inside the housing at full extension.
  const rod = { d: mm(r.diameter, 25), length: mm(r.length, 600), x0: housing.length - 100 }
  const motorD = mm(m.diameter, 70)
  const motor = { length: mm(m.length, 160), d: motorD, y: -(housing.od / 2 + 12 + motorD / 2) }
  const right = rod.x0 + rod.length + Math.max(rod.d * 0.8, 16)
  const top = motor.y - motorD / 2
  const bottom = housing.od / 2
  const left = -50
  const margin = 70
  return {
    housing,
    rod,
    motor,
    bounds: { x: left - margin, y: top - margin, w: right - left + margin * 2, h: bottom - top + margin * 2 + 40 },
  }
}

export interface DimensionEdit {
  parameter: string
  value: number
}

/**
 * Changes for a dimension edit: the representation, plus the mapped component
 * property, in one transaction with base revisions (stale edits are rejected).
 */
export function dimensionChanges(part: Part, edits: DimensionEdit[]): ModelChange[] {
  const changes: ModelChange[] = [
    {
      kind: 'update-properties',
      targetId: part.rep.id,
      baseRevision: part.rep.revision,
      properties: Object.fromEntries(edits.map((e) => [e.parameter, { value: e.value, unit: 'mm' }])),
    },
  ]
  const component = part.component
  if (component) {
    const mapped = Object.fromEntries(
      edits.flatMap((e) => {
        const property = mappedProperty(component, e.parameter)
        return property ? [[property, { value: e.value, unit: 'mm' }]] : []
      }),
    )
    if (Object.keys(mapped).length) {
      changes.push({ kind: 'update-properties', targetId: component.id, baseRevision: component.revision, properties: mapped })
    }
  }
  return changes
}

export function validateDimension(parameter: string, raw: string): { ok: true; value: number } | { ok: false; message: string } {
  const spec = DIMENSIONS[parameter]
  const value = Number(raw)
  if (!spec) return { ok: false, message: `${parameter} is not an editable dimension.` }
  if (raw.trim() === '' || !Number.isFinite(value)) return { ok: false, message: 'Enter a number in mm.' }
  if (value < spec.min || value > spec.max) return { ok: false, message: `${spec.label} must be between ${spec.min} and ${spec.max} mm.` }
  return { ok: true, value }
}

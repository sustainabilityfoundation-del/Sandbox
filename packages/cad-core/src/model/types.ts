/**
 * The native, open parametric model of the CAD Modeler (`ews-cad`, format 1.x).
 * Specification: docs/modules/cad/native-format.md; JSON Schema: schema/ews-cad.schema.json.
 *
 * The document stores design intent only. B-rep, meshes and mass properties are derived by
 * regeneration and are never stored as the source of truth.
 */

export const FORMAT = 'ews-cad'
export const FORMAT_VERSION = '1.2.0'
export const MEDIA_TYPE = 'application/vnd.ews.cad+json'
export const FILE_EXTENSION = '.ewscad'

/** A value: a literal number in document units, or an expression string ("width / 2", "10 mm"). */
export type Expr = number | string

export interface CadDocument {
  format: typeof FORMAT
  /** Semantic version of the format this document follows. */
  formatVersion: string
  /** Global identity of the document (UUID). Entity IDs are local to it. */
  documentId: string
  /** Monotonic version, incremented by every committed transaction (also undo and redo). */
  version: number
  /** Next number for deterministic entity IDs; IDs are never reused. */
  nextId: number
  units: { length: 'mm'; angle: 'deg' }
  metadata: DocumentMetadata
  parts: Part[]
  /** References from CAD entities to artifacts owned by other modules (owned by CAD). */
  references: ExternalReference[]
  /** Reserved for assemblies (Phase 3). Readers of format 1.0 reject non-empty values. */
  assemblies?: unknown[]
  /** Reserved for configurations (Phase 2+). Readers of format 1.0 reject non-empty values. */
  configurations?: unknown[]
  /** Namespaced extension data; readers preserve and otherwise ignore it. */
  extensions?: Record<string, unknown>
}

export interface DocumentMetadata {
  title: string
  description?: string
  createdAt?: string
  modifiedAt?: string
  /** Tool that wrote the file. */
  writer?: { tool: string; version: string }
  properties?: Record<string, string | number | boolean>
}

export interface Part {
  id: string
  name: string
  parameters: Parameter[]
  /** Feature history, in regeneration order. */
  features: Feature[]
  material?: Material
  /** Engineering semantics: named interfaces, functional surfaces, design-intent notes. */
  semantics: SemanticAnnotation[]
  properties?: Record<string, string | number | boolean>
}

export interface Material {
  name: string
  /** kg/m³ */
  density: number
}

export type ParameterUnit = 'mm' | 'deg' | 'none'

export interface Parameter {
  id: string
  /** Identifier used in expressions: letters, digits, underscore; starts with a letter. */
  name: string
  expression: string
  unit: ParameterUnit
  description?: string
  /**
   * What this parameter implements (format 1.2): a revision-pinned reference to another module's
   * artifact, typically a design constraint. The target's values are never copied here; checks read
   * them from the owning module.
   */
  binding?: ParameterBinding
}

export interface ParameterBinding {
  /** ArtifactRef of the bound artifact, with the revision the parameter was set against. */
  ref: { module: string; kind: string; id: string; revision?: number }
  /** The quantity of the target the parameter implements, e.g. "pocket across flats". */
  quantity?: string
  note?: string
}

export type SemanticKind = 'interface' | 'functional-surface' | 'design-intent' | 'note'

export interface SemanticAnnotation {
  id: string
  kind: SemanticKind
  name: string
  /** Stable entity names (faces such as "ext-5/cap-end", features, parameters). */
  targets: string[]
  description?: string
}

export type ReferenceRole = 'represents' | 'satisfies' | 'verifies' | 'realizes' | 'traces' | 'related'
export type ReferenceModule = 'twin' | 'requirements' | 'sysml' | 'conceptualize' | 'product' | 'external'

export interface ExternalReference {
  id: string
  /** CAD entity the reference starts from (part, feature, parameter or face name). */
  subject: string
  role: ReferenceRole
  target: { module: ReferenceModule; id: string; revision?: number; kind?: string; label?: string }
}

// ---- features -------------------------------------------------------------------------------

/** Features that create or modify solid geometry from a sketch profile. */
export type ProfileFeature = ExtrudeFeature | RevolveFeature
/** Features that modify edges of an existing body (format 1.1). */
export type EdgeFeature = FilletFeature | ChamferFeature

export type Feature = SketchFeature | ExtrudeFeature | RevolveFeature | FilletFeature | ChamferFeature | DatumPlaneFeature | PatternLinearFeature
export type FeatureType = Feature['type']

interface FeatureBase {
  id: string
  name: string
  suppressed?: boolean
}

export type StandardPlane = 'XY' | 'XZ' | 'YZ'

/**
 * Where a sketch or datum plane lies: a standard plane, a datum plane feature, or a planar face by its
 * stable name (format 1.1), each with an optional offset along the normal.
 */
export type PlaneRef =
  | { kind: 'standard'; plane: StandardPlane; offset?: Expr }
  | { kind: 'datum'; datum: string; offset?: Expr }
  | { kind: 'face'; face: string; offset?: Expr }

export interface SketchFeature extends FeatureBase {
  type: 'sketch'
  plane: PlaneRef
  entities: SketchEntity[]
  constraints: SketchConstraint[]
}

export type BodyOperation = 'new' | 'join' | 'cut'
export type ExtrudeDirection = 'normal' | 'reverse' | 'symmetric'

export interface ExtrudeFeature extends FeatureBase {
  type: 'extrude'
  /** The sketch whose closed profile is extruded. */
  sketch: string
  extent: { distance: Expr; direction: ExtrudeDirection }
  operation: BodyOperation
  /** Body to join or cut (the ID of the feature that created it). Default: the latest body. */
  target?: string
}

export interface RevolveFeature extends FeatureBase {
  type: 'revolve'
  sketch: string
  /** A line of the sketch (often construction), or the sketch axes "x-axis" / "y-axis". */
  axis: string
  angle: Expr
  operation: BodyOperation
  target?: string
}

/** Fillet of edges selected by stable edge names (format 1.1). */
export interface FilletFeature extends FeatureBase {
  type: 'fillet'
  /** Stable edge names, e.g. "edge(ext-5/cap-end|ext-5/side:ln-8)". */
  edges: string[]
  radius: Expr
  /** Body to modify (ID of the feature that created it). Default: the latest body. */
  target?: string
}

/** Equal-distance chamfer of edges selected by stable edge names (format 1.1). */
export interface ChamferFeature extends FeatureBase {
  type: 'chamfer'
  edges: string[]
  distance: Expr
  target?: string
}

/**
 * Linear pattern (format 1.2): repeats the solid features (extrude, revolve) along a model direction.
 * Occurrence k (2 ≤ k ≤ count; the original is occurrence 1) is the feature rebuilt from its sketch plane
 * shifted by (k − 1)·spacing·direction and applied with the same operation to the same body. Its faces are
 * named "<patternId>/i<k>-<featureId>-<role>", for example "pat-12/i2-ext-9-side:ln-3".
 */
export interface PatternLinearFeature extends FeatureBase {
  type: 'pattern-linear'
  features: string[]
  /** Unit vector in model coordinates. */
  direction: [number, number, number]
  /** Total number of occurrences including the original (integer ≥ 2). */
  count: Expr
  /** Distance between neighbouring occurrences, in mm. */
  spacing: Expr
}

/** A named reference plane (format 1.1): sketches and other datum planes can use it. */
export interface DatumPlaneFeature extends FeatureBase {
  type: 'datum-plane'
  plane: PlaneRef
}

// ---- sketches -------------------------------------------------------------------------------

/** Implicit, fixed sketch references every sketch has. */
export const SKETCH_ORIGIN = 'origin'
export const SKETCH_X_AXIS = 'x-axis'
export const SKETCH_Y_AXIS = 'y-axis'
export const IMPLICIT_SKETCH_ENTITIES = [SKETCH_ORIGIN, SKETCH_X_AXIS, SKETCH_Y_AXIS] as const

export type SketchEntity = SketchPoint | SketchLine | SketchCircle | SketchArc
export type SketchEntityType = SketchEntity['type']

interface SketchEntityBase {
  id: string
  /** Construction geometry takes part in constraints but not in profiles. */
  construction?: boolean
}

/** Point. x and y are the drawn (seed) position; the solver starts from it. */
export interface SketchPoint extends SketchEntityBase {
  type: 'point'
  x: number
  y: number
}

export interface SketchLine extends SketchEntityBase {
  type: 'line'
  start: string
  end: string
}

export interface SketchCircle extends SketchEntityBase {
  type: 'circle'
  center: string
  /** Seed radius. */
  radius: number
}

/** Arc counter-clockwise from start to end around center. */
export interface SketchArc extends SketchEntityBase {
  type: 'arc'
  center: string
  start: string
  end: string
}

export const GEOMETRIC_CONSTRAINTS = [
  'coincident',
  'horizontal',
  'vertical',
  'parallel',
  'perpendicular',
  'equal',
  'fixed',
  'point-on-line',
  'point-on-circle',
  'midpoint',
  'tangent',
  'concentric',
] as const

export const DIMENSIONAL_CONSTRAINTS = ['distance', 'distance-x', 'distance-y', 'length', 'radius', 'diameter', 'angle'] as const

export type GeometricConstraintType = (typeof GEOMETRIC_CONSTRAINTS)[number]
export type DimensionalConstraintType = (typeof DIMENSIONAL_CONSTRAINTS)[number]
export type ConstraintType = GeometricConstraintType | DimensionalConstraintType

export interface SketchConstraint {
  id: string
  type: ConstraintType
  /** Referenced sketch entities in the order the constraint type defines. */
  entities: string[]
  /** Dimensional constraints: the value (mm or deg) or an expression over part parameters. */
  value?: Expr
  /** Dimensional constraints: false for a driven (reference) dimension that only measures. Default true. */
  driving?: boolean
  /** Optional display name of a dimension. */
  name?: string
}

export function isDimensional(type: ConstraintType): type is DimensionalConstraintType {
  return (DIMENSIONAL_CONSTRAINTS as readonly string[]).includes(type)
}

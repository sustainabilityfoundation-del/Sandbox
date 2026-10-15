// SDK 1.8 (milestone C5): implemented by `createCadReadService` in `@ews/cad-client`.
/** CAD Modeler read access for other modules (SDK 1.8, contract C5). Read-only. */
export interface CadArtifactRefInput {
  module: string
  kind: string
  /** '<documentUuid>/<entityId>'; the document UUID twice for the whole document. */
  id: string
  /** Pinned revision; omitted = follow the latest. */
  revision?: number
}

export type CadReadResult<T> =
  | { status: 'resolved'; value: T }
  | { status: 'missing'; reason: 'not-a-cad-reference' | 'document-not-found' | 'revision-not-found' | 'entity-not-found' | 'no-geometry'; message: string }
  | { status: 'unavailable'; reason: 'forbidden' | 'unauthenticated' | 'service-unavailable' | 'kernel-unavailable'; message: string }

export interface CadEntitySummary {
  /** The reference with the revision it resolved at. */
  ref: { module: 'cad'; kind: 'cad-modeler-entity'; id: string; revision: number }
  documentId: string
  entityId: string
  /** 'document' | 'part' | 'face' | 'parameter' | a feature type ('extrude', 'fillet', …) | 'sketch-element' */
  entityType: string
  label: string
  documentTitle: string
  pinned: boolean
  latestRevision: number
  archived: boolean
  /** False for face names: only regeneration can confirm a face exists. */
  verifiedInGeometry: boolean
}

export interface CadBodyMassProperties {
  bodyId: string
  /** mm³ */
  volume: number
  /** mm² */
  surfaceArea: number
  /** mm */
  centerOfMass: [number, number, number]
  boundingBox: { min: [number, number, number]; max: [number, number, number]; size: [number, number, number] }
  /** kg; null without a material. */
  mass: number | null
  material: { name: string; density: number } | null
  /** OCCT BRepCheck validity of the solid. */
  valid: boolean
  units: { length: 'mm'; volume: 'mm³'; area: 'mm²'; mass: 'kg' }
}

export interface CadMassPropertiesResult {
  ref: CadEntitySummary['ref']
  parts: { partId: string; name: string; bodies: CadBodyMassProperties[] }[]
  regeneration: { ok: boolean; failures: { partId: string; featureId: string; status: string; code?: string; message?: string }[]; kernel: string; location: string }
  /** Recomputed from the stored native model of that revision; never stored. */
  derivedFrom: 'regeneration'
}

export interface CadService {
  summary(projectId: string, ref: CadArtifactRefInput): Promise<CadReadResult<CadEntitySummary>>
  /** Parts and whole documents only; other entities give missing / 'no-geometry'. */
  massProperties(projectId: string, ref: CadArtifactRefInput): Promise<CadReadResult<CadMassPropertiesResult>>
}



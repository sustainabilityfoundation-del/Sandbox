import type { RequirementSummary } from '@ews/platform-sdk'

/**
 * Sources outside Conceptualize that the reasoning core reads.
 *
 * - The twin (components, SysML elements, CAD representations) lives in the browser repository. The
 *   platform executor attaches a CLIENT-ATTESTED snapshot of the objects a reasoning call asks for
 *   (CR-P1, approved for the prototype). Every value read from it is labelled `via: 'client-attested'`.
 * - Requirements are read through the SDK `RequirementsService` contract (`get`). The prototype passes
 *   a labelled fixture implementing that subset; the workspace passes the real service.
 */

/** Minimal structural view of the SDK ModelIndex (so the snapshot can be built from it without importing the repository). */
export interface TwinReader {
  get: (id: string) => { id: string; type: string; name: string; revision: number; properties: Record<string, unknown> } | undefined
  relationshipsOf: (id: string) => { id?: string; type: string; from: string; to: string }[]
}

export interface TwinSnapshotObject {
  id: string
  type: string
  name: string
  revision: number
  properties: Record<string, unknown>
  relationships: { type: string; from: string; to: string }[]
}

export interface TwinSnapshot {
  via: 'client-attested'
  attestedAt: string
  /** Who attested it (the platform executor in production; a test fixture in tests). */
  attestedBy: string
  objects: TwinSnapshotObject[]
}

/** Builds a client-attested snapshot of the given twin objects (what the executor would attach, CR-P1). */
export function attestTwinSnapshot(model: TwinReader, ids: string[], attestedBy: string, at: Date = new Date()): TwinSnapshot {
  const objects: TwinSnapshotObject[] = []
  for (const id of ids) {
    const o = model.get(id)
    if (!o) continue
    objects.push({
      id: o.id,
      type: o.type,
      name: o.name,
      revision: o.revision,
      properties: structuredClone(o.properties),
      relationships: model.relationshipsOf(id).map((r) => ({ type: r.type, from: r.from, to: r.to })),
    })
  }
  return { via: 'client-attested', attestedAt: at.toISOString(), attestedBy, objects }
}

export function twinObject(snapshot: TwinSnapshot | undefined, id: string): TwinSnapshotObject | undefined {
  return snapshot?.objects.find((o) => o.id === id)
}

/** The part of the SDK RequirementsService the reasoning core needs. */
export interface RequirementsReader {
  readonly mode: 'api' | 'demo' | 'test-fixture'
  get: (id: string, scope: { projectId: string; revision?: number }) => Promise<RequirementSummary | undefined>
}

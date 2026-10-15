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

/** The part of the Requirements API the new-project scenario uses to create and revise a requirement. */
export interface RequirementsWriter {
  readonly mode: 'api' | 'test-fixture'
  create: (input: { projectId: string; title: string; statement: string; rationale?: string; type?: string }, actor: string) => Promise<{ id: string; key: string; revision: number }>
  revise: (id: string, patch: { projectId: string; statement?: string; title?: string; reason: string }, expectedRevision: number, actor: string) => Promise<{ id: string; key: string; revision: number }>
}

/** TEST FIXTURE: an in-memory requirements store (reader and writer) for runs against the contract adapter. */
export function requirementsFixtureStore(): RequirementsReader & RequirementsWriter {
  const rows = new Map<string, { id: string; key: string; projectId: string; title: string; statement: string; revisions: { revision: number; title: string; statement: string }[] }>()
  let n = 0
  return {
    mode: 'test-fixture',
    async get(id, scope) {
      const r = rows.get(id)
      if (!r || r.projectId !== scope.projectId) return undefined
      const rev = scope.revision ? r.revisions.find((x) => x.revision === scope.revision) : r.revisions[r.revisions.length - 1]
      if (!rev) return undefined
      return { id: r.id, key: r.key, projectId: r.projectId, revision: rev.revision, title: rev.title, statement: rev.statement, type: 'functional', status: 'draft', archived: false, applicability: [], verificationMethods: [], updatedAt: new Date().toISOString() }
    },
    async create(input) {
      const id = globalThis.crypto.randomUUID()
      const key = `REQ-${String(++n).padStart(3, '0')}`
      rows.set(id, { id, key, projectId: input.projectId, title: input.title, statement: input.statement, revisions: [{ revision: 1, title: input.title, statement: input.statement }] })
      return { id, key, revision: 1 }
    },
    async revise(id, patch, expectedRevision) {
      const r = rows.get(id)
      if (!r) throw new Error(`Requirement ${id} does not exist.`)
      const cur = r.revisions[r.revisions.length - 1]
      if (cur.revision !== expectedRevision) throw new Error(`Requirement ${r.key} is at revision ${cur.revision}.`)
      r.revisions.push({ revision: cur.revision + 1, title: patch.title ?? cur.title, statement: patch.statement ?? cur.statement })
      return { id, key: r.key, revision: cur.revision + 1 }
    },
  }
}

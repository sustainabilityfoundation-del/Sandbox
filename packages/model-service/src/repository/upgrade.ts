import type { ActivityEntry, ModelSnapshot, OutputRecord } from '../domain/types'
import type { DatabaseV2 } from './DemoRepository'
import { representationSeed } from './seed'

/** Data as saved by version 0.1 (storage key ews.demo-repository.v2). */
export interface LegacyDatabase {
  schema: 1
  model: ModelSnapshot
  outputs: Omit<OutputRecord, 'schemaVersion'>[]
  activity: ActivityEntry[]
}

function nextNumber(prefix: string, ids: Iterable<string>): number {
  let max = 0
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)
  for (const id of ids) {
    const match = pattern.exec(id)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return max + 1
}

/**
 * Non-destructive upgrade of 0.1 data.
 *
 * - Every existing object, relationship, artifact and activity entry is kept
 *   exactly as it was, including data from the retired Analysis and
 *   Verification tools.
 * - Artifacts saved without a schema version are read as version 1.
 * - The sample SysML elements and CAD representations are added for the
 *   components that exist, linked with explicit 'represents' relationships, as
 *   one new model revision. IDs that are already in use are skipped, so nothing
 *   is overwritten.
 *
 * The caller stores the result under a new key; the 0.1 entry stays untouched.
 */
export function upgradeLegacyDatabase(legacy: LegacyDatabase): DatabaseV2 {
  const model = structuredClone(legacy.model)
  const outputs: OutputRecord[] = legacy.outputs.map((o) => ({ ...structuredClone(o), schemaVersion: 1 }))
  const activity = structuredClone(legacy.activity)

  const seed = representationSeed()
  const existing = new Set(model.objects.map((o) => o.id))
  const revision = model.modelRevision + 1

  // Only representations whose target exists (or is added now) are added.
  const added = seed.objects.filter((o) => !existing.has(o.id))
  const available = new Set([...existing, ...added.map((o) => o.id)])
  const addedIds = new Set(added.map((o) => o.id))
  const relationships = seed.relationships.filter(
    (r) =>
      (addedIds.has(r.from) || addedIds.has(r.to)) &&
      available.has(r.from) &&
      available.has(r.to) &&
      !model.relationships.some((x) => x.type === r.type && x.from === r.from && x.to === r.to),
  )
  if (!added.length) return { schema: 2, model, outputs, activity }

  model.objects.push(...added.map((o) => ({ ...o, revision })))
  let rel = nextNumber('REL', model.relationships.map((r) => r.id))
  model.relationships.push(
    ...relationships.map((r) => ({ ...r, id: `REL-${String(rel++).padStart(4, '0')}`, revision })),
  )
  model.modelRevision = revision

  const log = nextNumber('LOG', activity.map((a) => a.id))
  activity.unshift({
    id: `LOG-${String(log).padStart(5, '0')}`,
    at: new Date().toISOString(),
    kind: 'info',
    message:
      `Platform upgrade (model rev ${revision}): added SysML and CAD representations ` +
      `${added.map((o) => o.id).join(', ')} for existing components. No existing data was changed or removed.`,
    objectIds: added.map((o) => o.id),
  })
  return { schema: 2, model, outputs, activity }
}

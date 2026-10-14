import type { EngineeringObject, ExternalProjection, Relationship } from '@ews/model-service'
import type { RequirementLifecycleStatus, RequirementSummary, RequirementsService } from '@ews/platform-sdk'
import { getModuleClient } from '@ews/requirements-client'

/**
 * Projects requirements from the Requirements service into the workspace's read model
 * (docs/specifications/requirements-contracts.md §3 and §10.2). The service is authoritative
 * for identity, canonical text, lifecycle and allocation; the twin keeps every other object.
 */

/** Twin requirement status for the service lifecycle; "retired" is shown as the twin's "obsolete". */
const STATUS: Record<RequirementLifecycleStatus, string> = { draft: 'draft', 'in-review': 'in-review', approved: 'approved', retired: 'obsolete' }

export function requirementObject(r: RequirementSummary): EngineeringObject {
  return {
    id: r.id,
    type: 'requirement',
    name: r.title,
    revision: r.revision,
    properties: {
      key: r.key,
      statement: r.statement,
      status: STATUS[r.status],
      requirementType: r.type,
      verificationMethods: r.verificationMethods,
      owner: 'requirements-service',
    },
  }
}

async function listAll(service: RequirementsService, projectId: string, configurationId: string): Promise<RequirementSummary[]> {
  const all: RequirementSummary[] = []
  let cursor: string | undefined
  do {
    const page = await service.list({ projectId, configurationId, cursor, limit: 200 })
    all.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  return all
}

async function allocations(service: RequirementsService, projectId: string, requirements: RequirementSummary[]): Promise<Relationship[]> {
  const client = getModuleClient(service, projectId)
  if (client) {
    const rels = await client.listRelationships({ type: 'allocated-to', limit: 20000 })
    return rels
      .filter((r) => !r.deleted && r.toTwinId)
      .map((r) => ({ id: `svc:${r.id}`, type: 'allocated-to' as const, from: r.fromId, to: r.toTwinId!, revision: r.revision }))
  }
  // Adapters without the module client (demo): trace links per requirement through the SDK contract.
  const links = await Promise.all(requirements.map((r) => service.traceLinks(r.id, { projectId })))
  return links
    .flat()
    .filter((l) => l.type === 'allocated-to')
    .map((l) => ({ id: `svc:${l.id}`, type: 'allocated-to' as const, from: l.from, to: l.to, revision: 1 }))
}

/**
 * Loads the projection. `legacyIds` are the twin's own requirement object IDs (e.g. "REQ-001");
 * each one the service resolves becomes an alias of its canonical UUID. Throws on service
 * failure: the caller reports it and never substitutes other data.
 */
export async function loadRequirementsProjection(
  service: RequirementsService,
  projectId: string,
  configurationId: string,
  legacyIds: string[],
): Promise<ExternalProjection> {
  const requirements = await listAll(service, projectId, configurationId)
  const resolved = await Promise.all(legacyIds.map(async (legacy) => [legacy, await service.resolve(legacy, { projectId })] as const))
  const aliases = new Map(resolved.filter(([legacy, r]) => r && r.id !== legacy).map(([legacy, r]) => [legacy, r!.id]))
  return {
    objects: requirements.map(requirementObject),
    aliases,
    relationships: await allocations(service, projectId, requirements),
    ownedRelationshipTypes: ['allocated-to'],
  }
}

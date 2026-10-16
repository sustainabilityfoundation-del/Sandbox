import type { EngineeringObject, ExternalProjection } from '@ews/model-service'
import type { ProjectsService } from '@ews/platform-sdk'
import { getProjectsClient, type BreakdownNode, type ProductElement } from '@ews/projects-client'

/**
 * Projects the product registry into the workspace's read model (CR-PM-MS-2, ADR-0063): the registry is
 * authoritative for product structure in new projects; the browser twin of a new project stays empty and is a
 * read-only fallback. The example project PRJ-ACT100 is not projected: its illustrative tools keep working on the
 * browser twin (coordinator answer Q1), and moving its browser data to the server is the explicit import of C8.
 *
 * Twin object types are coarser than element kinds: parts stay parts, every other kind is shown as an assembly
 * with its kind kept in the `elementKind` property.
 */
export function elementObject(e: ProductElement, parentId?: string): EngineeringObject {
  return {
    id: e.id,
    type: e.elementKind === 'part' ? 'part' : 'assembly',
    name: e.name,
    ...(parentId ? { parentId } : {}),
    revision: e.revision,
    properties: { ...e.properties, key: e.key, elementKind: e.elementKind, owner: 'product-registry' } as EngineeringObject['properties'],
  }
}

function parents(nodes: BreakdownNode[], parentId: string | undefined, out: Map<string, string>) {
  for (const n of nodes) {
    if (!n.element) continue
    // An element placed under several parents keeps its first parent in the tree; the others are breakdown edges.
    if (parentId && !out.has(n.element.id)) out.set(n.element.id, parentId)
    parents(n.children, n.element.id, out)
  }
}

/**
 * The example project keeps its browser twin authoritative for the illustrative tools; its components exist in the
 * product registry with their twin IDs as aliases. References stored canonically by other services (for example a
 * Requirements allocation to ROD-120 is stored with the element UUID) are mapped back to the twin's objects.
 */
export async function loadLegacyProductAliases(service: ProjectsService, projectId: string): Promise<ExternalProjection | null> {
  const client = getProjectsClient(service)
  if (!client) return null
  const elements = await client.productElements(projectId)
  const aliases = new Map(elements.filter((e) => e.aliases.length).map((e) => [e.id, e.aliases[0]]))
  return aliases.size ? { objects: [], aliases, relationships: [], ownedRelationshipTypes: [] } : null
}

/** Loads the projection; throws on service failure (the caller reports it, nothing is substituted). */
export async function loadProductProjection(service: ProjectsService, projectId: string): Promise<ExternalProjection | null> {
  const client = getProjectsClient(service)
  if (!client) return null
  const [elements, breakdowns] = await Promise.all([client.productElements(projectId), client.breakdowns(projectId)])
  const main = breakdowns.find((b) => b.purpose === 'product-breakdown') ?? breakdowns[0]
  const parentOf = new Map<string, string>()
  if (main) parents((await client.breakdownTree(projectId, main.id)).roots, undefined, parentOf)
  return {
    objects: elements.filter((e) => e.lifecycle !== 'retired').map((e) => elementObject(e, parentOf.get(e.id))),
    aliases: new Map(),
    relationships: [],
    ownedRelationshipTypes: [],
  }
}

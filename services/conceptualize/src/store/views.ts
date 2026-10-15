import { assess } from '../domain/assessment'
import type { ConceptListItemDto, ImplementationDto } from '../http/schemas'
import { listDecisions, listSets } from './alternatives'
import { allListItems, listItems, requireConcept } from './concepts'
import type { Queryable } from './context'
import { getImplementation, listEvidence, listImplementations, listLinks } from './implementations'
import { listDecompositions, listRelationships } from './relationships'
import { listStudies } from './tradeStudies'

/** Concepts with their active relationships, decompositions and alternative sets (for the explorer's tree and graph). */
export async function projectGraph(db: Queryable, projectId: string, includeArchived: boolean) {
  const nodes = await allListItems(db, projectId, includeArchived)
  const ids = new Set(nodes.map((n) => n.id))
  const edges = (await listRelationships(db, projectId)).filter((e) => ids.has(e.fromId) && ids.has(e.toId))
  const decompositions = (await listDecompositions(db, projectId)).filter((d) => ids.has(d.parentId))
  const alternativeSets = (await listSets(db, projectId)).filter((s) => ids.has(s.parentId))
  return { nodes, edges, decompositions, alternativeSets }
}

/** Inputs of the deterministic maturity assessment, read from the module's own records. */
export async function assessment(db: Queryable, projectId: string, conceptId: string) {
  const c = await requireConcept(db, projectId, conceptId)
  const rels = await listRelationships(db, projectId, { conceptId })
  const sets = await listSets(db, projectId, { conceptId })
  const asParent = sets.filter((s) => s.parentId === conceptId)
  const studies = await listStudies(db, projectId, { conceptId })
  const decisions = (await listDecisions(db, projectId, { conceptId })).filter((d) => d.status !== 'withdrawn')
  const evidence = await listEvidence(db, projectId, conceptId)
  const links = await listLinks(db, projectId, { conceptId })
  const impls = await listImplementations(db, projectId, { conceptId })
  const result = assess({
    maturity: c.maturity,
    verificationStatus: c.verificationStatus,
    description: c.description || c.summary,
    purpose: c.purpose,
    statements: c.statements.map((s) => ({ kind: s.kind, basis: s.basis, state: s.state, hasQuantity: !!s.quantity, confirmed: !!s.confirmedBy })),
    childCount: rels.filter((r) => r.type === 'contains' && r.fromId === conceptId).length,
    interfaceCount: rels.filter((r) => r.type === 'interfaces-with').length,
    alternativeSets: { asParent: asParent.length, asMember: sets.filter((s) => s.members.some((m) => m.conceptId === conceptId)).length, memberCount: asParent.reduce((n, s) => n + s.members.filter((m) => m.status !== 'withdrawn').length, 0) },
    tradeStudies: studies.length,
    scoredTradeStudies: studies.filter((s) => s.scores.length > 0).length,
    decisions: {
      recorded: decisions.filter((d) => d.status === 'recorded').length,
      proposed: decisions.filter((d) => d.status === 'proposed').length,
      accepted: decisions.some((d) => d.status === 'recorded' && !d.supersededById && d.outcomes.some((o) => o.conceptId === conceptId && o.outcome === 'accepted')),
    },
    evidence: { preliminary: evidence.filter((e) => e.basis !== 'evidence').length, verified: evidence.filter((e) => e.basis === 'evidence').length },
    requirementLinks: links.filter((l) => l.artifact.module === 'requirements').length,
    implementations: { total: impls.filter((i) => i.status !== 'retired').length, inDevelopment: impls.filter((i) => i.status === 'in-development').length, implemented: impls.filter((i) => i.status === 'implemented').length },
    pendingRealizations: impls.reduce((n, i) => n + i.realizationRequests.filter((r) => r.status === 'pending').length, 0),
  })
  return { conceptId, revision: c.revision, maturity: c.maturity, ...result }
}

/** Concepts an artifact realizes (through implementations) or is linked to (requirement links, references). */
export async function artifactConcepts(db: Queryable, projectId: string, module: string, artifactId: string) {
  const { rows } = await db.query<{ implementation_id: string }>(
    `SELECT DISTINCT a.implementation_id FROM conceptualize.implementation_artifacts a JOIN conceptualize.implementations i ON i.id = a.implementation_id
     WHERE i.project_id = $1 AND a.module = $2 AND a.artifact_id = $3 AND NOT a.removed`,
    [projectId, module, artifactId],
  )
  const implementations: { concept: ConceptListItemDto; implementation: ImplementationDto }[] = []
  for (const r of rows) {
    const impl = (await getImplementation(db, projectId, r.implementation_id))!
    for (const c of await listItems(db, projectId, impl.conceptIds)) implementations.push({ concept: c, implementation: impl })
  }
  const links = await listLinks(db, projectId, { module, artifactId })
  const items = await listItems(db, projectId, [...new Set(links.map((l) => l.conceptId))])
  return { implementations, links: links.map((l) => ({ concept: items.find((i) => i.id === l.conceptId)!, link: l })).filter((x) => x.concept) }
}

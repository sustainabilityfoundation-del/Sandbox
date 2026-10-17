import { isKindOf } from '../metamodel/metaclasses'
import { refId, type Element, type Model } from '../model/model'
import { semanticsOf, type Semantics } from '../semantics/semantics'

/**
 * Relationship matrices and requirement coverage (Grid View projections, BL-016 / BL-021). Pure
 * functions of the model: rows, columns and cells are computed, never stored.
 */

export type MatrixKind = 'satisfy' | 'allocate' | 'connect'

export interface MatrixAxisItem {
  /** Stable key: element ID, or element IDs joined by "." for feature chains (`act100.controller`). */
  key: string
  /** Last element of the chain (for selection). */
  elementId: string
  label: string
  metaclass: string
  /** Stable ID of the managed requirement the element stands for (REQ-nnn), when its EWS::ManagedRequirement metadata carries one. */
  displayId?: string
  /** Title of that managed requirement as recorded at import (display only; the text is owned by Requirements Management). */
  title?: string
}

export interface MatrixCell {
  row: string
  col: string
  /** The relationship usages (satisfy, allocation, connection …) in this cell. */
  relationships: { id: string; metaclass: string; label: string }[]
}

export interface RelationshipMatrix {
  kind: MatrixKind
  scopeId: string
  rows: MatrixAxisItem[]
  cols: MatrixAxisItem[]
  cells: MatrixCell[]
  /** Relationships whose ends could not be placed (e.g. unresolved), with a reason. */
  notes: string[]
}

/** Elements owned (transitively through namespaces) by a scope; the whole model for the root. */
function within(s: Semantics, scopeId: string): Element[] {
  const out: Element[] = []
  const visit = (id: string, depth: number) => {
    for (const m of s.ownedMembers(id)) {
      out.push(m)
      if (depth < 40 && isKindOf(m['@type'], 'Namespace') && !(isKindOf(m['@type'], 'Expression') && !isKindOf(m['@type'], 'Usage'))) visit(m['@id'], depth + 1)
    }
  }
  visit(scopeId, 0)
  return out
}

/** The feature chain an end (or a satisfy subject value) refers to. */
function endChain(s: Semantics, end: Element): string[] {
  const rs = s.ownedRelationships(end['@id']).find((r) => r['@type'] === 'ReferenceSubsetting')
  const target = rs ? refId(rs, 'referencedFeature') : undefined
  if (!target) return []
  const links = s.ownedRelationships(target).filter((r) => r['@type'] === 'FeatureChaining')
  return links.length ? links.map((l) => refId(l, 'chainingFeature')!).filter(Boolean) : [target]
}

function connectorEnds(s: Semantics, id: string): string[][] {
  return s.memberships(id).filter((m) => m['@type'] === 'EndFeatureMembership').map((m) => endChain(s, s.memberElement(m)!))
}

/** The feature `satisfy R by x` names (chain), or [] when there is no `by`. */
export function satisfyingChain(s: Semantics, satisfyId: string): string[] {
  const subj = s.memberships(satisfyId).find((m) => m['@type'] === 'SubjectMembership')
  const subject = subj && s.memberElement(subj)
  const fv = subject && s.ownedRelationships(subject['@id']).find((r) => r['@type'] === 'FeatureValue')
  const expr = fv && s.get(refId(fv, 'ownedRelatedElement'))
  const mem = expr && s.memberships(expr['@id'])[0]
  const target = mem && s.memberElement(mem)
  if (!target) return []
  const links = s.ownedRelationships(target['@id']).filter((r) => r['@type'] === 'FeatureChaining')
  return links.length ? links.map((l) => refId(l, 'chainingFeature')!).filter(Boolean) : [target['@id']]
}

/** The requirement a satisfy (or verify) usage references. */
export function referencedRequirement(s: Semantics, usageId: string): string | undefined {
  const rs = s.ownedRelationships(usageId).find((r) => r['@type'] === 'ReferenceSubsetting')
  return rs ? refId(rs, 'referencedFeature') : undefined
}

function axis(s: Semantics, chain: string[]): MatrixAxisItem {
  const last = chain[chain.length - 1]
  const label = chain.length > 1 ? chain.map((id) => s.name(id) ?? '?').join('.') : (s.qualifiedName(last) ?? s.label(last))
  const item: MatrixAxisItem = { key: chain.join('.'), elementId: last, label, metaclass: s.get(last)?.['@type'] ?? '?' }
  const managed = chain.length === 1 ? managedOf(s, last) : undefined
  if (managed?.requirementKey) item.displayId = managed.requirementKey
  if (managed?.title) item.title = managed.title
  return item
}

const REQUIREMENT_REFERENCE_MEMBERSHIPS = new Set(['RequirementVerificationMembership', 'FramedConcernMembership', 'ObjectiveMembership', 'SubjectMembership'])

/** Requirement usages that state requirements (not satisfy/verify references, not objectives). */
export function requirementUsages(model: Model, scopeId: string = model.rootId): Element[] {
  const s = semanticsOf(model)
  return within(s, scopeId).filter((e) => isKindOf(e['@type'], 'RequirementUsage') && e['@type'] !== 'SatisfyRequirementUsage' && !REQUIREMENT_REFERENCE_MEMBERSHIPS.has(s.owningMembership(e['@id'])?.['@type'] ?? '') && !isKindOf(e['@type'], 'ConcernUsage') && !isKindOf(e['@type'], 'ViewpointUsage'))
}

export function relationshipMatrix(model: Model, kind: MatrixKind, scopeId: string = model.rootId): RelationshipMatrix {
  const s = semanticsOf(model)
  const scope = within(s, scopeId)
  const rows = new Map<string, MatrixAxisItem>()
  const cols = new Map<string, MatrixAxisItem>()
  const cells = new Map<string, MatrixCell>()
  const notes: string[] = []
  const put = (r: MatrixAxisItem, c: MatrixAxisItem, rel: Element) => {
    rows.set(r.key, r)
    cols.set(c.key, c)
    const k = `${r.key}|${c.key}`
    const cell = cells.get(k) ?? { row: r.key, col: c.key, relationships: [] }
    cell.relationships.push({ id: rel['@id'], metaclass: rel['@type'], label: s.name(rel['@id']) ?? rel['@type'].replace(/Usage$|AsUsage$/, '') })
    cells.set(k, cell)
  }
  if (kind === 'satisfy') {
    // Rows: every requirement in scope (also unsatisfied ones); columns: what satisfies them.
    for (const r of requirementUsages(model, scopeId)) rows.set(r['@id'], axis(s, [r['@id']]))
    for (const sat of scope.filter((e) => e['@type'] === 'SatisfyRequirementUsage')) {
      const req = referencedRequirement(s, sat['@id'])
      const by = satisfyingChain(s, sat['@id'])
      if (!req || !by.length) {
        notes.push(`${s.label(sat['@id'])}: satisfy without a requirement or a “by” feature is not shown.`)
        continue
      }
      put(axis(s, [req]), axis(s, by), sat)
    }
  } else if (kind === 'allocate') {
    for (const a of scope.filter((e) => isKindOf(e['@type'], 'AllocationUsage'))) {
      const [src, tgt] = connectorEnds(s, a['@id'])
      if (!src?.length || !tgt?.length) {
        notes.push(`${s.label(a['@id'])}: allocation with unresolved ends is not shown.`)
        continue
      }
      put(axis(s, src), axis(s, tgt), a)
    }
  } else {
    // Connections between parts: rows and columns are the first features of the end chains (parts).
    for (const c of scope.filter((e) => isKindOf(e['@type'], 'ConnectorAsUsage') && !isKindOf(e['@type'], 'AllocationUsage') && e['@type'] !== 'SuccessionAsUsage' && !isKindOf(e['@type'], 'TransitionUsage'))) {
      const [a, b] = connectorEnds(s, c['@id'])
      if (!a?.length || !b?.length) continue
      const ra = axis(s, [a[0]])
      const rb = axis(s, [b[0]])
      put(ra, rb, c)
    }
    // Symmetric: every part appears as a row and a column.
    for (const [k, v] of rows) cols.set(k, v)
    for (const [k, v] of cols) rows.set(k, v)
  }
  const sort = (m: Map<string, MatrixAxisItem>) => [...m.values()].sort((x, y) => x.label.localeCompare(y.label))
  return { kind, scopeId, rows: sort(rows), cols: sort(cols), cells: [...cells.values()], notes }
}

export type CoverageStatus = 'satisfied-and-verified' | 'satisfied' | 'verified' | 'not-covered'

export interface RequirementCoverage {
  id: string
  label: string
  shortName?: string
  /** Features that satisfy it (`satisfy R by x`). */
  satisfiedBy: { relationshipId: string; label: string }[]
  /** Verification cases whose objective verifies it. */
  verifiedBy: { caseId: string; label: string }[]
  /** Managed requirement link (EWS::ManagedRequirement), if any. */
  managed?: { requirementId?: string; revision?: number; requirementKey?: string; title?: string }
  status: CoverageStatus
}

export interface CoverageReport {
  scopeId: string
  requirements: RequirementCoverage[]
  counts: Record<CoverageStatus, number> & { total: number; linkedToManaged: number }
}

export function managedOf(s: Semantics, id: string): RequirementCoverage['managed'] {
  const els = [id, ...s.featureTypes(id)]
  for (const e of els) {
    const meta = s.ownedMembers(e).find((m) => m['@type'] === 'MetadataUsage' && s.featureTypes(m['@id']).some((t) => s.qualifiedName(t) === 'EWS::ManagedRequirement'))
    if (!meta) continue
    const out: NonNullable<RequirementCoverage['managed']> = {}
    for (const f of s.ownedMembers(meta['@id'])) {
      const fv = s.ownedRelationships(f['@id']).find((r) => r['@type'] === 'FeatureValue')
      const v = fv ? s.get(refId(fv, 'ownedRelatedElement')) : undefined
      if (s.name(f['@id']) === 'requirementId' && v?.['@type'] === 'LiteralString') out.requirementId = String(v.value)
      if (s.name(f['@id']) === 'revision' && v?.['@type'] === 'LiteralInteger') out.revision = Number(v.value)
      if (s.name(f['@id']) === 'requirementKey' && v?.['@type'] === 'LiteralString') out.requirementKey = String(v.value)
      if (s.name(f['@id']) === 'title' && v?.['@type'] === 'LiteralString') out.title = String(v.value)
    }
    return out
  }
  return undefined
}

/** Requirement coverage: which requirements are satisfied by the design and verified by verification cases. */
export function requirementCoverage(model: Model, scopeId: string = model.rootId): CoverageReport {
  const s = semanticsOf(model)
  const all = within(s, model.rootId)
  const satisfies = new Map<string, RequirementCoverage['satisfiedBy']>()
  for (const sat of all.filter((e) => e['@type'] === 'SatisfyRequirementUsage')) {
    const req = referencedRequirement(s, sat['@id'])
    if (!req) continue
    const by = satisfyingChain(s, sat['@id'])
    const list = satisfies.get(req) ?? []
    list.push({ relationshipId: sat['@id'], label: by.length ? axis(s, by).label : '(no “by”)' })
    satisfies.set(req, list)
  }
  const verifies = new Map<string, RequirementCoverage['verifiedBy']>()
  for (const v of all.filter((e) => s.owningMembership(e['@id'])?.['@type'] === 'RequirementVerificationMembership')) {
    const req = referencedRequirement(s, v['@id'])
    if (!req) continue
    let cur = s.owner(v['@id'])
    while (cur && !isKindOf(cur['@type'], 'VerificationCaseUsage') && !isKindOf(cur['@type'], 'VerificationCaseDefinition')) cur = s.owner(cur['@id'])
    if (!cur) continue
    const list = verifies.get(req) ?? []
    // A verification definition verifies through its usages; list the definition and its usages.
    const cases = isKindOf(cur['@type'], 'VerificationCaseDefinition') ? [cur, ...all.filter((u) => isKindOf(u['@type'], 'VerificationCaseUsage') && s.featureTypes(u['@id']).includes(cur!['@id']))] : [cur]
    for (const c of cases) if (!list.some((x) => x.caseId === c['@id'])) list.push({ caseId: c['@id'], label: s.label(c['@id']) })
    verifies.set(req, list)
  }
  const requirements = requirementUsages(model, scopeId).map((r): RequirementCoverage => {
    const satisfiedBy = satisfies.get(r['@id']) ?? []
    const verifiedBy = verifies.get(r['@id']) ?? []
    const status: CoverageStatus = satisfiedBy.length && verifiedBy.length ? 'satisfied-and-verified' : satisfiedBy.length ? 'satisfied' : verifiedBy.length ? 'verified' : 'not-covered'
    return { id: r['@id'], label: s.qualifiedName(r['@id']) ?? s.label(r['@id']), shortName: s.shortName(r['@id']) ?? s.featureTypes(r['@id']).map((t) => s.shortName(t)).find(Boolean), satisfiedBy, verifiedBy, managed: managedOf(s, r['@id']), status }
  })
  const counts = { 'satisfied-and-verified': 0, satisfied: 0, verified: 0, 'not-covered': 0, total: requirements.length, linkedToManaged: requirements.filter((r) => r.managed?.requirementId).length }
  for (const r of requirements) counts[r.status]++
  return { scopeId, requirements, counts }
}

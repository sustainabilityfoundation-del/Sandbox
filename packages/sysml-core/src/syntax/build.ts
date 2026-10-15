import { isKindOf } from '../metamodel/metaclasses'
import { newId } from '../model/ids'
import { refId, refIds, type Element, type Model } from '../model/model'
import { Semantics } from '../semantics/semantics'
import type { Chain, CommentNode, DefinitionNode, Expr, Member, MembershipKind, MetadataNode, QName, UsageNode } from './ast'
import type { Range } from './lexer'

/**
 * Maps the syntax tree to KerML/SysML abstract-syntax elements in a model, then resolves names.
 * Ownership is always expressed by owning relationships (memberships, or relationships that own
 * related elements); references are element IDs set by name resolution.
 */

export interface ResolutionDiagnostic {
  ruleId: 'SYSML-RESOLVE'
  severity: 'error'
  message: string
  range?: Range
  elementId: string
}

type PendingKind = 'type' | 'conjugated-type' | 'feature' | 'redefined' | 'namespace' | 'membership' | 'element'

interface PendingName {
  kind: PendingKind
  name: QName
  /** Element whose property receives the result. */
  elementId: string
  property: string
  /** Namespace to resolve from. */
  scopeId: string
  /** The feature declaring the reference (excluded from its own resolution). */
  declaringId?: string
  /** Import/alias targets: resolve without the scope's own imports (avoids self-reference). */
  importContext?: boolean
}

interface PendingChain {
  /** FeatureChaining relationship IDs, in order. */
  chainingIds: string[]
  chain: Chain
  scopeId: string
}

/** Updates an element copy-on-write (elements may be shared with other model versions). */
export function patch(model: Model, id: string, changes: Record<string, unknown>): Element {
  const old = model.own(id)
  if (!old) throw new Error(`Element ${id} is not in this model layer`)
  const next = { ...old, ...changes } as Element
  for (const [k, v] of Object.entries(changes)) if (v === undefined) delete next[k]
  model.put(next)
  return next
}

export const MEMBERSHIP_METACLASS: Record<MembershipKind, string> = {
  owning: 'OwningMembership',
  feature: 'FeatureMembership',
  end: 'EndFeatureMembership',
  parameter: 'ParameterMembership',
  return: 'ReturnParameterMembership',
  subject: 'SubjectMembership',
  variant: 'VariantMembership',
  require: 'RequirementConstraintMembership',
  assume: 'RequirementConstraintMembership',
  result: 'ResultExpressionMembership',
  entry: 'StateSubactionMembership',
  do: 'StateSubactionMembership',
  exit: 'StateSubactionMembership',
  objective: 'ObjectiveMembership',
  verify: 'RequirementVerificationMembership',
  actor: 'ActorMembership',
  stakeholder: 'StakeholderMembership',
  frame: 'FramedConcernMembership',
  render: 'ViewRenderingMembership',
}

/** Usages that are referential (never composite) whatever their prefix. */
const REFERENTIAL = new Set(['AttributeUsage', 'EnumerationUsage', 'ReferenceUsage', 'SatisfyRequirementUsage', 'BindingConnectorAsUsage', 'SuccessionAsUsage', 'PerformActionUsage', 'ExhibitStateUsage'])

export class Builder {
  readonly pendingNames: PendingName[] = []
  readonly pendingChains: PendingChain[] = []
  /** Source ranges of built elements (for diagnostics). */
  readonly ranges = new Map<string, Range>()
  readonly created: string[] = []
  /** Element built for each syntax node (for references to earlier unnamed members, e.g. `entry; then off;`). */
  private readonly nodeIds = new Map<Member, string>()

  constructor(readonly model: Model) {}

  // ---- low-level element creation ------------------------------------------------------------
  private add(el: Omit<Element, '@id'> & { '@id'?: string }, range?: Range): Element {
    const e = { ...el, '@id': el['@id'] ?? newId() } as Element
    if (!Array.isArray(e.ownedRelationship)) e.ownedRelationship = []
    this.model.put(e)
    this.created.push(e['@id'])
    if (range) this.ranges.set(e['@id'], range)
    return e
  }

  private appendOwned(ownerId: string, relId: string) {
    const owner = this.model.get(ownerId)!
    if (this.model.own(ownerId)) patch(this.model, ownerId, { ownedRelationship: [...refIds(owner, 'ownedRelationship'), relId] })
    else throw new Error('Library elements are read-only')
  }

  /** Adds `member` to `ownerId` through a new membership of the given metaclass. */
  own(ownerId: string, member: Element, membershipType: string, extra: Record<string, unknown> = {}): Element {
    const m = this.add({ '@type': membershipType, ...extra, ownedRelatedElement: [member['@id']], owningRelatedElement: ownerId })
    patch(this.model, member['@id'], { owningRelationship: m['@id'] })
    this.appendOwned(ownerId, m['@id'])
    return m
  }

  /** Adds a relationship owned by `ownerId` (not a membership), optionally owning related elements. */
  relationship(ownerId: string, type: string, props: Record<string, unknown>, range?: Range): Element {
    const r = this.add({ '@type': type, ...props, ownedRelatedElement: [], owningRelatedElement: ownerId }, range)
    this.appendOwned(ownerId, r['@id'])
    return r
  }

  private ownRelated(rel: Element, child: Element) {
    patch(this.model, rel['@id'], { ownedRelatedElement: [...refIds(this.model.get(rel['@id'])!, 'ownedRelatedElement'), child['@id']] })
    patch(this.model, child['@id'], { owningRelationship: rel['@id'] })
  }

  private pending(kind: PendingKind, elementId: string, property: string, name: QName, scopeId: string, extra: Partial<PendingName> = {}) {
    if (name.resolvedId) {
      patch(this.model, elementId, { [property]: name.resolvedId })
      return
    }
    this.pendingNames.push({ kind, elementId, property, name, scopeId, ...extra })
  }

  // ---- members ------------------------------------------------------------------------------
  buildMembers(ownerId: string, members: Member[]): string[] {
    const ids: string[] = []
    for (const m of members) {
      const id = this.member(ownerId, m)
      if (id) ids.push(id)
    }
    return ids
  }

  private isBehavioral(ownerId: string): boolean {
    const t = this.model.get(ownerId)?.['@type'] ?? ''
    return isKindOf(t, 'Behavior') || isKindOf(t, 'Step')
  }

  member(ownerId: string, m: Member): string | undefined {
    const id = this.memberNode(ownerId, m)
    if (id) this.nodeIds.set(m, id)
    return id
  }

  private memberNode(ownerId: string, m: Member): string | undefined {
    const ownerIsType = isKindOf(this.model.get(ownerId)?.['@type'] ?? '', 'Type')
    const vis = m.visibility ? { visibility: m.visibility } : {}
    switch (m.kind) {
      case 'package': {
        const p = this.add({ '@type': m.isLibrary ? 'LibraryPackage' : 'Package', ...nameProps(m.name, m.shortName), ...(m.isLibrary ? { isStandard: m.isStandard } : {}) }, m.range)
        this.own(ownerId, p, 'OwningMembership', vis)
        this.buildMembers(p['@id'], m.members)
        return p['@id']
      }
      case 'first': {
        if (m.target.parts.length !== 1) throw new Error('first: only simple names are supported')
        const mem = this.add({ '@type': 'Membership', ownedRelatedElement: [], owningRelatedElement: ownerId }, m.range)
        this.appendOwned(ownerId, mem['@id'])
        this.pending('feature', mem['@id'], 'memberElement', m.target.parts[0], ownerId)
        return mem['@id']
      }
      case 'import': {
        const type = m.isExpose ? (m.isNamespace ? 'NamespaceExpose' : 'MembershipExpose') : m.isNamespace ? 'NamespaceImport' : 'MembershipImport'
        const imp = this.relationship(ownerId, type, { visibility: m.visibility ?? (m.isExpose ? 'protected' : 'private'), isRecursive: m.isRecursive, isImportAll: m.isImportAll }, m.range)
        this.pending(m.isNamespace ? 'namespace' : 'membership', imp['@id'], m.isNamespace ? 'importedNamespace' : 'importedMembership', m.target, ownerId, { importContext: true })
        return imp['@id']
      }
      case 'alias': {
        const al = this.add({ '@type': 'Membership', memberName: m.name, ...(m.shortName ? { memberShortName: m.shortName } : {}), visibility: m.visibility ?? 'public', ownedRelatedElement: [], owningRelatedElement: ownerId }, m.range)
        this.appendOwned(ownerId, al['@id'])
        this.pending('element', al['@id'], 'memberElement', m.target, ownerId, { importContext: true })
        return al['@id']
      }
      case 'doc':
      case 'comment':
        return this.comment(ownerId, m)
      case 'metadata':
        return this.metadata(ownerId, m, ownerIsType)
      case 'definition':
        return this.definition(ownerId, m, ownerIsType)
      case 'usage':
        return this.usage(ownerId, m)
      case 'expression': {
        const e = this.expression(m.expr, ownerId)
        this.own(ownerId, e, 'ResultExpressionMembership')
        return e['@id']
      }
    }
  }

  private comment(ownerId: string, m: CommentNode): string {
    const c = this.add({ '@type': m.kind === 'doc' ? 'Documentation' : 'Comment', ...nameProps(m.name, m.shortName), body: m.body, ...(m.locale ? { locale: m.locale } : {}) }, m.range)
    this.own(ownerId, c, 'OwningMembership', m.visibility ? { visibility: m.visibility } : {})
    for (const a of m.about) {
      const ann = this.relationship(c['@id'], 'Annotation', {}, a.range)
      this.pending('element', ann['@id'], 'annotatedElement', a, ownerId)
    }
    return c['@id']
  }

  private metadata(ownerId: string, m: MetadataNode, ownerIsType: boolean): string {
    const u = this.add({ '@type': 'MetadataUsage', ...nameProps(m.name), isComposite: false }, m.range)
    this.own(ownerId, u, ownerIsType ? 'FeatureMembership' : 'OwningMembership', m.visibility ? { visibility: m.visibility } : {})
    const ft = this.relationship(u['@id'], 'FeatureTyping', { typedFeature: u['@id'] }, m.type.range)
    this.pending('type', ft['@id'], 'type', m.type, ownerId)
    for (const a of m.about) {
      const ann = this.relationship(u['@id'], 'Annotation', {}, a.range)
      this.pending('element', ann['@id'], 'annotatedElement', a, ownerId)
    }
    this.buildMembers(u['@id'], m.members)
    return u['@id']
  }

  private definition(ownerId: string, m: DefinitionNode, ownerIsType: boolean): string {
    const d = this.add({ '@type': m.metaclass, ...nameProps(m.name, m.shortName), isAbstract: m.isAbstract, ...(m.isVariation ? { isVariation: true } : {}) }, m.range)
    if (m.nameRange) this.ranges.set(`${d['@id']}#name`, m.nameRange)
    const membership = m.membership === 'owning' && ownerIsType ? 'feature' : m.membership
    this.own(ownerId, d, membership === 'feature' ? 'OwningMembership' : MEMBERSHIP_METACLASS[membership], m.visibility ? { visibility: m.visibility } : {})
    for (const s of m.specializes) {
      const r = this.relationship(d['@id'], 'Subclassification', { subclassifier: d['@id'] }, s.range)
      this.pending('type', r['@id'], 'superclassifier', s, ownerId, { declaringId: d['@id'] })
    }
    if (m.metaclass === 'PortDefinition') this.conjugatedPortDefinition(d)
    for (const q of m.prefixMetadata ?? []) this.metadata(d['@id'], { kind: 'metadata', type: q, about: [], members: [], range: q.range }, true)
    this.buildMembers(d['@id'], m.members)
    return d['@id']
  }

  /** Every port definition owns its conjugated port definition (SysML 2.0, §8.3.12). */
  conjugatedPortDefinition(port: Element) {
    const conj = this.add({ '@type': 'ConjugatedPortDefinition', ...(typeof port.declaredName === 'string' ? { declaredName: `~${port.declaredName}` } : {}), isImpliedIncluded: true })
    this.own(port['@id'], conj, 'OwningMembership', { isImplied: true })
    this.relationship(conj['@id'], 'PortConjugation', { originalPortDefinition: port['@id'], conjugatedType: conj['@id'], isImplied: true })
  }

  private usage(ownerId: string, m: UsageNode): string {
    let membership = m.membership
    if (membership === 'feature' && m.direction && this.isBehavioral(ownerId)) membership = 'parameter'
    const composite = !m.isReference && !REFERENTIAL.has(m.metaclass) && isKindOf(m.metaclass, 'OccurrenceUsage')
    const attrs: Record<string, unknown> = {
      '@type': m.metaclass,
      ...nameProps(m.name, m.shortName),
      ...(m.direction ? { direction: m.direction } : {}),
      ...(m.isAbstract ? { isAbstract: true } : {}),
      ...(m.isVariation ? { isVariation: true } : {}),
      ...(m.isEnd || membership === 'end' ? { isEnd: true } : {}),
      ...(m.isDerived ? { isDerived: true } : {}),
      ...(m.isConstant ? { isConstant: true } : {}),
      ...(m.isOrdered ? { isOrdered: true } : {}),
      ...(m.isNonunique ? { isUnique: false } : {}),
      ...(m.isNegated ? { isNegated: true } : {}),
      isComposite: composite,
    }
    const u = this.add(attrs as Element, m.range)
    if (m.nameRange) this.ranges.set(`${u['@id']}#name`, m.nameRange)
    const extra: Record<string, unknown> = m.visibility ? { visibility: m.visibility } : {}
    if (membership === 'require' || membership === 'assume') extra.kind = membership === 'require' ? 'requirement' : 'assumption'
    if (membership === 'verify' || membership === 'frame') extra.kind = 'requirement'
    if (membership === 'entry' || membership === 'do' || membership === 'exit') extra.kind = membership
    this.own(ownerId, u, MEMBERSHIP_METACLASS[membership], extra)
    this.featureSpecializations(u['@id'], ownerId, m)
    for (const q of m.prefixMetadata ?? []) this.metadata(u['@id'], { kind: 'metadata', type: q, about: [], members: [], range: q.range }, true)
    if (m.performs) {
      const rs = this.relationship(u['@id'], 'ReferenceSubsetting', { referencingFeature: u['@id'] }, m.performs.range)
      this.referenceTo(rs, 'referencedFeature', m.performs, ownerId)
    }
    if (m.accept) this.acceptParts(u['@id'], ownerId, m.accept.payloadName, m.accept.payloadType, m.accept.via)
    if (m.multiplicity) this.multiplicity(u['@id'], m.multiplicity.lower, m.multiplicity.upper)
    if (m.value) {
      const fv = this.relationship(u['@id'], 'FeatureValue', { ...(m.value.isDefault ? { isDefault: true } : {}), ...(m.value.isInitial ? { isInitial: true } : {}) })
      this.ownRelated(fv, this.expression(m.value.expr, u['@id']))
    }
    if (m.connector) this.connector(u['@id'], ownerId, m.connector.ends, m.connector.itemType)
    if (m.satisfy) {
      const rs = this.relationship(u['@id'], 'ReferenceSubsetting', { referencingFeature: u['@id'] }, m.satisfy.requirement.range)
      this.pending('feature', rs['@id'], 'referencedFeature', m.satisfy.requirement, ownerId, { declaringId: u['@id'] })
      if (m.satisfy.by) {
        const subject = this.add({ '@type': 'ReferenceUsage', direction: 'in', isComposite: false })
        this.own(u['@id'], subject, 'SubjectMembership')
        const fv = this.relationship(subject['@id'], 'FeatureValue', {})
        this.ownRelated(fv, this.chainReference(m.satisfy.by, ownerId))
      }
    }
    if (m.transition) this.transition(u['@id'], ownerId, m)
    this.buildMembers(u['@id'], m.members)
    if (m.result) {
      const e = this.expression(m.result, u['@id'])
      this.own(u['@id'], e, 'ResultExpressionMembership')
    }
    return u['@id']
  }

  private featureSpecializations(id: string, ownerId: string, m: Pick<UsageNode, 'typing' | 'subsets' | 'redefines' | 'references' | 'chainSpecializations'>) {
    for (const t of m.typing) {
      if (t.conjugated) {
        const r = this.relationship(id, 'ConjugatedPortTyping', { typedFeature: id }, t.name.range)
        this.pending('conjugated-type', r['@id'], 'conjugatedPortDefinition', t.name, ownerId, { declaringId: id })
      } else {
        const r = this.relationship(id, 'FeatureTyping', { typedFeature: id }, t.name.range)
        this.pending('type', r['@id'], 'type', t.name, ownerId, { declaringId: id })
      }
    }
    for (const s of m.subsets) {
      const r = this.relationship(id, 'Subsetting', { subsettingFeature: id }, s.range)
      this.pending('feature', r['@id'], 'subsettedFeature', s, ownerId, { declaringId: id })
    }
    for (const s of m.redefines) {
      const r = this.relationship(id, 'Redefinition', { redefiningFeature: id }, s.range)
      this.pending('redefined', r['@id'], 'redefinedFeature', s, ownerId, { declaringId: id })
    }
    if (m.references) {
      const r = this.relationship(id, 'ReferenceSubsetting', { referencingFeature: id }, m.references.range)
      this.pending('feature', r['@id'], 'referencedFeature', m.references, ownerId, { declaringId: id })
    }
    for (const c of (m as UsageNode).chainSpecializations ?? []) {
      const [type, a, b] = c.kind === 'subsets' ? ['Subsetting', 'subsettingFeature', 'subsettedFeature'] : c.kind === 'redefines' ? ['Redefinition', 'redefiningFeature', 'redefinedFeature'] : ['ReferenceSubsetting', 'referencingFeature', 'referencedFeature']
      const r = this.relationship(id, type, { [a]: id }, c.chain.range)
      this.referenceTo(r, b, c.chain, ownerId)
    }
  }

  multiplicity(featureId: string, lower: Expr | undefined, upper: Expr) {
    const range = this.add({ '@type': 'MultiplicityRange' })
    this.own(featureId, range, 'OwningMembership')
    for (const b of lower ? [lower, upper] : [upper]) this.own(range['@id'], this.expression(b, featureId), 'OwningMembership')
  }

  /** Connector ends: end features that reference the connected features (or feature chains). */
  connector(connectorId: string, ownerId: string, ends: Chain[], itemType?: QName) {
    if (itemType) {
      const payload = this.add({ '@type': 'PayloadFeature', isComposite: false })
      this.own(connectorId, payload, 'FeatureMembership')
      const ft = this.relationship(payload['@id'], 'FeatureTyping', { typedFeature: payload['@id'] }, itemType.range)
      this.pending('type', ft['@id'], 'type', itemType, ownerId)
    }
    for (const end of ends) {
      const e = this.add({ '@type': 'ReferenceUsage', isEnd: true, isComposite: false }, end.range)
      this.own(connectorId, e, 'EndFeatureMembership')
      const rs = this.relationship(e['@id'], 'ReferenceSubsetting', { referencingFeature: e['@id'] }, end.range)
      this.referenceTo(rs, 'referencedFeature', end, ownerId)
    }
  }

  /** Points `rel.prop` at a feature (simple name) or at an owned chain feature (`a.b.c`). */
  private referenceTo(rel: Element, prop: string, chain: Chain, scopeId: string) {
    if (chain.nodeRef) {
      const id = this.nodeIds.get(chain.nodeRef)
      if (id) patch(this.model, rel['@id'], { [prop]: id })
      return
    }
    if (chain.parts.length === 1) {
      this.pending('feature', rel['@id'], prop, chain.parts[0], scopeId)
      return
    }
    const f = this.add({ '@type': 'Feature', isComposite: false }, chain.range)
    this.ownRelated(rel, f)
    patch(this.model, rel['@id'], { [prop]: f['@id'] })
    const ids: string[] = []
    for (const p of chain.parts) ids.push(this.relationship(f['@id'], 'FeatureChaining', {}, p.range)['@id'])
    this.pendingChains.push({ chainingIds: ids, chain, scopeId })
  }

  private chainReference(chain: Chain, scopeId: string): Element {
    const fre = this.add({ '@type': 'FeatureReferenceExpression' }, chain.range)
    if (chain.parts.length === 1) {
      const mem = this.add({ '@type': 'Membership', ownedRelatedElement: [], owningRelatedElement: fre['@id'] })
      this.appendOwned(fre['@id'], mem['@id'])
      this.pending('feature', mem['@id'], 'memberElement', chain.parts[0], scopeId)
    } else {
      const f = this.add({ '@type': 'Feature', isComposite: false }, chain.range)
      this.own(fre['@id'], f, 'OwningMembership')
      const ids: string[] = []
      for (const p of chain.parts) ids.push(this.relationship(f['@id'], 'FeatureChaining', {}, p.range)['@id'])
      this.pendingChains.push({ chainingIds: ids, chain, scopeId })
    }
    return fre
  }

  private transition(id: string, ownerId: string, m: UsageNode) {
    const tr = m.transition!
    if (tr.source) {
      const mem = this.add({ '@type': 'Membership', ownedRelatedElement: [], owningRelatedElement: id })
      this.appendOwned(id, mem['@id'])
      if (tr.source.parts.length === 1) this.pending('feature', mem['@id'], 'memberElement', tr.source.parts[0], ownerId)
    }
    if (tr.acceptType) {
      const accept = this.add({ '@type': 'AcceptActionUsage', isComposite: true })
      this.own(id, accept, 'TransitionFeatureMembership', { kind: 'trigger' })
      this.acceptParts(accept['@id'], ownerId, tr.acceptName, tr.acceptType, tr.acceptVia)
    }
    if (tr.guard) this.own(id, this.expression(tr.guard, ownerId), 'TransitionFeatureMembership', { kind: 'guard' })
    const succ = this.add({ '@type': 'SuccessionAsUsage', isComposite: false })
    this.own(id, succ, 'FeatureMembership')
    this.connector(succ['@id'], ownerId, [tr.source ?? tr.target, tr.target])
  }

  /** Accept action parameters: the payload (`name : T`) and the receiver (`via port`). */
  private acceptParts(acceptId: string, scopeId: string, payloadName?: string, payloadType?: QName, via?: Chain) {
    const payload = this.add({ '@type': 'ReferenceUsage', direction: 'in', isComposite: false, ...nameProps(payloadName) })
    this.own(acceptId, payload, 'ParameterMembership')
    if (payloadType) {
      const ft = this.relationship(payload['@id'], 'FeatureTyping', { typedFeature: payload['@id'] }, payloadType.range)
      this.pending('type', ft['@id'], 'type', payloadType, scopeId)
    }
    if (via) {
      const receiver = this.add({ '@type': 'ReferenceUsage', direction: 'in', isComposite: false })
      this.own(acceptId, receiver, 'ParameterMembership')
      const fv = this.relationship(receiver['@id'], 'FeatureValue', {})
      this.ownRelated(fv, this.chainReference(via, scopeId))
    }
  }

  // ---- expressions ------------------------------------------------------------------------------
  expression(e: Expr, scopeId: string): Element {
    switch (e.kind) {
      case 'literal': {
        const type = { integer: 'LiteralInteger', rational: 'LiteralRational', string: 'LiteralString', boolean: 'LiteralBoolean', infinity: 'LiteralInfinity', null: 'NullExpression' }[e.type]
        return this.add({ '@type': type, ...(e.value !== null ? { value: e.value } : {}) }, e.range)
      }
      case 'ref':
        return this.chainReference(e.chain, scopeId)
      case 'op': {
        const op = this.add({ '@type': 'OperatorExpression', operator: e.operator }, e.range)
        for (const a of e.args) this.own(op['@id'], this.expression(a, scopeId), 'ParameterMembership')
        return op
      }
      case 'invoke': {
        const inv = this.add({ '@type': 'InvocationExpression' }, e.range)
        const ft = this.relationship(inv['@id'], 'FeatureTyping', { typedFeature: inv['@id'] }, e.target.range)
        this.pending('type', ft['@id'], 'type', e.target, scopeId)
        for (const a of e.args) this.own(inv['@id'], this.expression(a, scopeId), 'ParameterMembership')
        return inv
      }
    }
  }

  // ---- resolution -----------------------------------------------------------------------------
  /** Resolves all pending names. Returns diagnostics for names that could not be resolved. */
  resolve(): ResolutionDiagnostic[] {
    const diagnostics: ResolutionDiagnostic[] = []
    const byKey = new Map<string, PendingName>()
    for (const p of this.pendingNames) byKey.set(`${p.elementId}|${p.property}`, p)
    const inProgress = new Set<string>()
    const failed = new Set<string>()
    const done = new Set<string>()
    const sem: Semantics = new Semantics(this.model, {
      resolve: (el, prop) => {
        const key = `${el['@id']}|${prop}`
        const p = byKey.get(key)
        if (!p || inProgress.has(key) || failed.has(key) || done.has(key)) return undefined
        inProgress.add(key)
        try {
          const target = this.resolveOne(sem, p)
          if (target) {
            patch(this.model, p.elementId, { [p.property]: target })
            done.add(key)
          }
          return target
        } finally {
          inProgress.delete(key)
        }
      },
    })
    for (const p of this.pendingNames) {
      const key = `${p.elementId}|${p.property}`
      if (done.has(key)) continue
      const el = this.model.get(p.elementId)!
      if (refId(el, p.property)) continue
      const target = sem.ref(el, p.property)
      if (!target) {
        failed.add(key)
        diagnostics.push({ ruleId: 'SYSML-RESOLVE', severity: 'error', message: unresolvedMessage(p), range: p.name.range, elementId: p.declaringId ?? p.elementId })
      }
    }
    for (const c of this.pendingChains) {
      let prev: string | undefined
      for (let k = 0; k < c.chain.parts.length; k++) {
        const part = c.chain.parts[k]
        const given = part.resolvedId ? this.model.get(part.resolvedId) : undefined
        const hit = given ? { element: given } : k === 0 ? sem.resolveQualified(c.scopeId, part.segments) : part.segments.length === 1 ? sem.featureOf(prev!, part.segments[0]) : undefined
        if (!hit) {
          diagnostics.push({ ruleId: 'SYSML-RESOLVE', severity: 'error', message: `Cannot resolve “${part.segments.join('::')}”${k > 0 ? ` as a feature of “${c.chain.parts.slice(0, k).map((p) => p.segments.join('::')).join('.')}”` : ''}.`, range: part.range, elementId: c.chainingIds[k] })
          break
        }
        patch(this.model, c.chainingIds[k], { chainingFeature: hit.element['@id'] })
        prev = hit.element['@id']
      }
    }
    return diagnostics
  }

  private resolveOne(sem: Semantics, p: PendingName): string | undefined {
    const segs = p.name.segments
    let hit
    if (p.importContext) {
      // First segment among the namespace's own members, then from the enclosing scopes.
      const own = sem.memberships(p.scopeId).find((m) => !isKindOf(m['@type'], 'Import') && m['@id'] !== p.elementId && (sem.memberName(m) === segs[0] || sem.memberShortName(m) === segs[0]))
      let first = own ? { membership: own, element: sem.memberElement(own)! } : undefined
      if (!first) {
        const parent = sem.enclosingNamespace(p.scopeId)
        first = parent ? sem.lookup(parent['@id'], segs[0]) : sem.lookup(this.model.rootId, segs[0])
        if (!first && !parent) first = undefined
      }
      hit = first
      for (let k = 1; k < segs.length && hit; k++) {
        const m = sem.publicMemberNamed(hit.element['@id'], segs[k])
        hit = m ? { membership: m, element: sem.memberElement(m)! } : undefined
      }
    } else if (p.kind === 'redefined') {
      // A redefined feature is looked up among the owner's inherited features first.
      if (segs.length === 1) {
        const m = sem.inheritedMemberships(p.scopeId).find((x) => sem.memberName(x) === segs[0] || sem.memberShortName(x) === segs[0])
        hit = m ? { membership: m, element: sem.memberElement(m)! } : undefined
      }
      hit ??= sem.resolveQualified(p.scopeId, segs, p.declaringId)
    } else {
      hit = sem.resolveQualified(p.scopeId, segs, p.declaringId)
    }
    if (!hit) return undefined
    if (p.kind === 'membership') return hit.membership['@id']
    if (p.kind === 'conjugated-type') {
      const conj = sem.ownedMembers(hit.element['@id']).find((x) => x['@type'] === 'ConjugatedPortDefinition')
      return conj?.['@id']
    }
    return hit.element['@id']
  }
}

function unresolvedMessage(p: PendingName): string {
  const name = p.name.segments.join('::')
  switch (p.kind) {
    case 'type':
      return `Cannot resolve type “${name}”.`
    case 'conjugated-type':
      return `Cannot resolve port definition “${name}” for the conjugated typing “~${name}”.`
    case 'redefined':
      return `Cannot resolve “${name}”: no inherited feature of that name to redefine.`
    case 'namespace':
      return `Cannot resolve namespace “${name}” to import.`
    case 'membership':
      return `Cannot resolve “${name}” to import.`
    default:
      return `Cannot resolve “${name}”.`
  }
}

function nameProps(name?: string, shortName?: string): Record<string, string> {
  return { ...(name !== undefined ? { declaredName: name } : {}), ...(shortName !== undefined ? { declaredShortName: shortName } : {}) }
}

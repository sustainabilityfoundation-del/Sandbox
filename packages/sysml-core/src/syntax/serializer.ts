import { isKindOf } from '../metamodel/metaclasses'
import { refId, refIds, type Element, type Model } from '../model/model'
import { quote, semanticsOf, type Semantics } from '../semantics/semantics'

/**
 * Serializes the semantic model to SysML v2 textual notation (supported subset). The output is
 * canonical (our formatting), and parse(serialize(m)) yields a semantically equal model.
 */

const USAGE_KEYWORD: Record<string, string> = {
  PartUsage: 'part',
  AttributeUsage: 'attribute',
  ItemUsage: 'item',
  PortUsage: 'port',
  ConnectionUsage: 'connection',
  InterfaceUsage: 'interface',
  FlowUsage: 'flow',
  ActionUsage: 'action',
  StateUsage: 'state',
  ConstraintUsage: 'constraint',
  RequirementUsage: 'requirement',
  CalculationUsage: 'calc',
  AllocationUsage: 'allocation',
  OccurrenceUsage: 'occurrence',
  EnumerationUsage: 'enum',
  ReferenceUsage: 'ref',
  BindingConnectorAsUsage: 'binding',
  SuccessionAsUsage: 'succession',
  TransitionUsage: 'transition',
  AcceptActionUsage: 'accept',
  PerformActionUsage: 'perform action',
  ExhibitStateUsage: 'exhibit state',
  AssertConstraintUsage: 'assert constraint',
  UseCaseUsage: 'use case',
  VerificationCaseUsage: 'verification',
  AnalysisCaseUsage: 'analysis',
  ConcernUsage: 'concern',
  ViewUsage: 'view',
  ViewpointUsage: 'viewpoint',
  CaseUsage: 'case',
  RenderingUsage: 'rendering',
}

const DEFINITION_KEYWORD: Record<string, string> = {
  PartDefinition: 'part',
  AttributeDefinition: 'attribute',
  ItemDefinition: 'item',
  PortDefinition: 'port',
  ConnectionDefinition: 'connection',
  InterfaceDefinition: 'interface',
  FlowDefinition: 'flow',
  ActionDefinition: 'action',
  StateDefinition: 'state',
  ConstraintDefinition: 'constraint',
  RequirementDefinition: 'requirement',
  CalculationDefinition: 'calc',
  AllocationDefinition: 'allocation',
  OccurrenceDefinition: 'occurrence',
  EnumerationDefinition: 'enum',
  MetadataDefinition: 'metadata',
  UseCaseDefinition: 'use case',
  VerificationCaseDefinition: 'verification',
  AnalysisCaseDefinition: 'analysis',
  ConcernDefinition: 'concern',
  ViewDefinition: 'view',
  ViewpointDefinition: 'viewpoint',
  CaseDefinition: 'case',
  RenderingDefinition: 'rendering',
}

/** Usages that are written as a reference (`perform x;`) when they only reference a feature. */
const REFERENCE_FORM: Record<string, string> = { PerformActionUsage: 'perform', ExhibitStateUsage: 'exhibit', AssertConstraintUsage: 'assert' }

export function usageKeyword(metaclass: string): string | undefined {
  return USAGE_KEYWORD[metaclass]
}
export function definitionKeyword(metaclass: string): string | undefined {
  return DEFINITION_KEYWORD[metaclass]
}

const PRECEDENCE: Record<string, number> = {
  if: 0, implies: 1, or: 2, '|': 2, xor: 3, and: 4, '&': 4, '==': 5, '!=': 5, '===': 5, '!==': 5,
  '<': 6, '>': 6, '<=': 6, '>=': 6, '+': 7, '-': 7, '*': 8, '/': 8, '%': 8, '**': 9, '^': 9,
}

export interface SerializeOptions {
  indent?: string
}

/** Text of the members of a namespace (the whole model when `namespaceId` is the root). */
export function serialize(model: Model, namespaceId: string = model.rootId, options: SerializeOptions = {}): string {
  const w = new Writer(semanticsOf(model), options.indent ?? '    ')
  w.members(namespaceId, 0)
  return w.out.join('\n') + (w.out.length ? '\n' : '')
}

/** Text of a single element declaration (with its body). */
export function serializeElement(model: Model, elementId: string, options: SerializeOptions = {}): string {
  const sem = semanticsOf(model)
  const w = new Writer(sem, options.indent ?? '    ')
  const m = sem.owningMembership(elementId)
  const owner = sem.owner(elementId)
  if (m && owner) w.member(m, owner['@id'], 0)
  return w.out.join('\n') + '\n'
}

/** Serializes one expression element. */
export function serializeExpression(model: Model, exprId: string, scopeId?: string): string {
  const sem = semanticsOf(model)
  const w = new Writer(sem, '    ')
  return w.expr(exprId, scopeId ?? sem.enclosingNamespace(exprId)?.['@id'] ?? model.rootId, 0)
}

class Writer {
  out: string[] = []
  constructor(
    private readonly s: Semantics,
    private readonly ind: string,
  ) {}

  private get(id: string | undefined): Element | undefined {
    return this.s.get(id)
  }
  private line(depth: number, text: string) {
    this.out.push(this.ind.repeat(depth) + text)
  }

  /** Element of the previous member printed in the current body (target of a following `then`). */
  private prev: string | undefined

  members(nsId: string, depth: number, skip: Set<string> = new Set()) {
    const saved = this.prev
    this.prev = undefined
    for (const rel of this.s.ownedRelationships(nsId)) {
      if (skip.has(rel['@id'])) continue
      const t = rel['@type']
      if (isKindOf(t, 'Import')) this.importDecl(rel, nsId, depth)
      else if (isKindOf(t, 'Membership') && !isKindOf(t, 'FeatureValue')) {
        this.member(rel, nsId, depth)
        const el = isKindOf(t, 'OwningMembership') ? refId(rel, 'ownedRelatedElement') : refId(rel, 'memberElement')
        const elT = this.get(el)?.['@type'] ?? ''
        if (el && isKindOf(elT, 'Feature') && !isKindOf(elT, 'ConnectorAsUsage') && elT !== 'TransitionUsage' && elT !== 'SatisfyRequirementUsage') this.prev = el
        else if (elT === 'SuccessionAsUsage') this.prev = this.successionTarget(el!)
      }
    }
    this.prev = saved
  }

  private successionTarget(id: string): string | undefined {
    const ends = this.s.memberships(id).filter((x) => x['@type'] === 'EndFeatureMembership')
    const last = ends[1] && this.get(refId(ends[1], 'ownedRelatedElement'))
    const rs = last && this.s.ownedRelationships(last['@id']).find((r) => r['@type'] === 'ReferenceSubsetting')
    return rs ? refId(rs, 'referencedFeature') : undefined
  }

  member(m: Element, nsId: string, depth: number) {
    const t = m['@type']
    const vis = m.visibility && m.visibility !== 'public' ? `${m.visibility} ` : ''
    if (!isKindOf(t, 'OwningMembership')) {
      // `first x;` (initial node): a nameless membership. Aliases have a member name.
      if (typeof m.memberName !== 'string' && t === 'Membership') {
        const target = refId(m, 'memberElement')
        this.line(depth, `${vis}first ${target ? this.refName(nsId, target) : '?'};`)
        return
      }
      // Alias (a membership whose member is owned elsewhere).
      if (typeof m.memberName === 'string') {
        const target = refId(m, 'memberElement')
        const short = typeof m.memberShortName === 'string' ? `<${quote(m.memberShortName)}> ` : ''
        this.line(depth, `${vis}alias ${short}${quote(m.memberName)} for ${target ? this.refName(nsId, target) : '?'};`)
      }
      return
    }
    const el = this.get(refId(m, 'ownedRelatedElement'))
    if (!el) return
    const et = el['@type']
    if (et === 'ConjugatedPortDefinition' || et === 'MultiplicityRange') return
    if (isKindOf(t, 'ResultExpressionMembership') && isKindOf(et, 'Expression') && !isKindOf(et, 'Usage')) {
      this.line(depth, this.expr(el['@id'], nsId, 0))
      return
    }
    if (et === 'Documentation') {
      this.line(depth, `${vis}doc${el.locale ? ` locale ${JSON.stringify(el.locale)}` : ''}${this.ident(el, ' ')} ${commentText(String(el.body ?? ''), depth, this.ind)}`)
      return
    }
    if (et === 'Comment') {
      const about = this.s.ownedRelationships(el['@id']).filter((r) => r['@type'] === 'Annotation').map((r) => this.refName(nsId, refId(r, 'annotatedElement')!))
      const head = el.declaredName !== undefined || el.declaredShortName !== undefined || about.length || el.locale ? `comment${this.ident(el, ' ')}${about.length ? ` about ${about.join(', ')}` : ''}${el.locale ? ` locale ${JSON.stringify(el.locale)}` : ''} ` : ''
      this.line(depth, `${vis}${head}${commentText(String(el.body ?? ''), depth, this.ind)}`)
      return
    }
    if (et === 'Package' || et === 'LibraryPackage') {
      const kw = et === 'LibraryPackage' ? `${el.isStandard ? 'standard ' : ''}library package` : 'package'
      this.block(depth, `${vis}${kw}${this.ident(el, ' ')}`, el['@id'])
      return
    }
    if (et === 'MetadataUsage') {
      this.metadata(el, nsId, depth, vis)
      return
    }
    if (isKindOf(et, 'Definition')) {
      this.definition(el, nsId, depth, vis)
      return
    }
    if (isKindOf(et, 'Usage') || isKindOf(et, 'Feature')) {
      this.usage(el, m, nsId, depth, vis)
    }
  }

  private ident(el: Element, lead = ''): string {
    const short = typeof el.declaredShortName === 'string' ? `<${quote(el.declaredShortName)}>` : ''
    const name = typeof el.declaredName === 'string' ? quote(el.declaredName) : ''
    const both = [short, name].filter(Boolean).join(' ')
    return both ? lead + both : ''
  }

  private importDecl(imp: Element, nsId: string, depth: number) {
    const expose = isKindOf(imp['@type'], 'Expose')
    const kw = expose ? 'expose' : 'import'
    const vis = (imp.visibility ?? (expose ? 'protected' : 'private')) === (expose ? 'protected' : 'private') ? '' : `${imp.visibility} `
    const all = imp.isImportAll ? 'all ' : ''
    if (isKindOf(imp['@type'], 'NamespaceImport')) {
      const ns = refId(imp, 'importedNamespace')
      this.line(depth, `${vis}${kw} ${all}${ns ? this.absoluteName(ns) : '?'}::*${imp.isRecursive ? '::**' : ''};`)
    } else {
      const mem = this.get(refId(imp, 'importedMembership'))
      const el = mem && this.s.memberElement(mem)
      const owner = mem && this.get(refId(mem, 'owningRelatedElement'))
      const name = mem ? this.s.memberName(mem) : undefined
      const prefix = owner && owner['@id'] !== this.s.model.rootId && owner['@id'] !== this.s.model.library?.rootId ? `${this.absoluteName(owner['@id'])}::` : ''
      this.line(depth, `${vis}${kw} ${all}${el && name ? `${prefix}${quote(name)}` : '?'}${imp.isRecursive ? '::**' : ''};`)
    }
    void nsId
  }

  private block(depth: number, head: string, id: string, skip?: Set<string>, extraLines?: string[]) {
    const before = this.out.length
    this.out.push('')
    this.members(id, depth + 1, skip)
    for (const l of extraLines ?? []) this.line(depth + 1, l)
    if (this.out.length === before + 1) this.out[before] = this.ind.repeat(depth) + `${head};`
    else {
      this.out[before] = this.ind.repeat(depth) + `${head} {`
      this.line(depth, '}')
    }
  }

  private specializations(el: Element, nsId: string): { typing: string[]; subsets: string[]; redefines: string[]; references?: string; skip: Set<string> } {
    const typing: string[] = []
    const subsets: string[] = []
    const redefines: string[] = []
    let references: string | undefined
    const skip = new Set<string>()
    for (const r of this.s.ownedRelationships(el['@id'])) {
      const t = r['@type']
      if (t === 'ConjugatedPortTyping') {
        const conj = this.get(refId(r, 'conjugatedPortDefinition'))
        const original = conj && this.s.owner(conj['@id'])
        typing.push(`~${original ? this.refName(nsId, original['@id']) : '?'}`)
      } else if (t === 'FeatureTyping') typing.push(this.refName(nsId, refId(r, 'type')))
      else if (t === 'Redefinition') redefines.push(this.isOwnedChain(r, 'redefinedFeature') ? this.refOrChain(r, 'redefinedFeature', nsId) : this.refName(nsId, refId(r, 'redefinedFeature'), true))
      else if (t === 'ReferenceSubsetting') {
        if (el.isEnd && isKindOf(this.s.owner(el['@id'])?.['@type'] ?? '', 'Connector')) continue
        if (el['@type'] === 'SatisfyRequirementUsage') continue
        references = this.refOrChain(r, 'referencedFeature', nsId)
      } else if (t === 'Subsetting') subsets.push(this.refOrChain(r, 'subsettedFeature', nsId))
      else continue
      skip.add(r['@id'])
    }
    return { typing, subsets, redefines, references, skip }
  }

  private definition(el: Element, nsId: string, depth: number, vis: string) {
    const kw = DEFINITION_KEYWORD[el['@type']] ?? 'part'
    const prefix = `${el.isAbstract ? 'abstract ' : ''}${el.isVariation ? 'variation ' : ''}`
    const generals = this.s.ownedRelationships(el['@id']).filter((r) => r['@type'] === 'Subclassification')
    const spec = generals.length ? ` :> ${generals.map((r) => this.refName(nsId, refId(r, 'superclassifier'))).join(', ')}` : ''
    this.block(depth, `${vis}${prefix}${kw} def${this.ident(el, ' ')}${spec}`, el['@id'])
  }

  private metadata(el: Element, nsId: string, depth: number, vis: string) {
    const ft = this.s.ownedRelationships(el['@id']).find((r) => r['@type'] === 'FeatureTyping')
    const type = ft ? this.refName(nsId, refId(ft, 'type')) : '?'
    const about = this.s.ownedRelationships(el['@id']).filter((r) => r['@type'] === 'Annotation').map((r) => this.refName(nsId, refId(r, 'annotatedElement')!))
    const head = typeof el.declaredName === 'string' ? `${vis}metadata ${quote(el.declaredName)} : ${type}` : `${vis}@${type}`
    const lines: string[] = []
    for (const m of this.s.ownedMembers(el['@id'])) {
      const redef = this.s.ownedRelationships(m['@id']).find((r) => r['@type'] === 'Redefinition')
      const fv = this.s.ownedRelationships(m['@id']).find((r) => r['@type'] === 'FeatureValue')
      const value = fv ? this.get(refId(fv, 'ownedRelatedElement')) : undefined
      if (redef && value && m.declaredName === undefined) lines.push(`${quote(this.s.name(refId(redef, 'redefinedFeature')!) ?? '?')} = ${this.expr(value['@id'], m['@id'], 0)};`)
    }
    const aboutText = about.length ? ` about ${about.join(', ')}` : ''
    if (!lines.length) this.line(depth, `${head}${aboutText};`)
    else {
      this.line(depth, `${head}${aboutText} {`)
      for (const l of lines) this.line(depth + 1, l)
      this.line(depth, '}')
    }
  }

  private usage(el: Element, m: Element, nsId: string, depth: number, vis: string) {
    const t = el['@type']
    const mt = m['@type']
    const { typing, subsets, redefines, references, skip } = this.specializations(el, nsId)
    let keyword = USAGE_KEYWORD[t] ?? ''
    let lead = ''
    if (mt === 'SubjectMembership') lead = 'subject '
    else if (mt === 'ReturnParameterMembership') lead = 'return '
    else if (mt === 'RequirementConstraintMembership') lead = m.kind === 'assumption' ? 'assume ' : 'require '
    else if (mt === 'StateSubactionMembership') lead = `${m.kind} `
    else if (mt === 'ObjectiveMembership') (lead = 'objective '), (keyword = '')
    else if (mt === 'RequirementVerificationMembership') (lead = 'verify '), (keyword = 'requirement')
    else if (mt === 'FramedConcernMembership') (lead = 'frame '), (keyword = 'concern')
    else if (mt === 'ViewRenderingMembership') (lead = 'render '), (keyword = 'rendering')
    else if (mt === 'ActorMembership') (lead = 'actor '), (keyword = '')
    else if (mt === 'StakeholderMembership') (lead = 'stakeholder '), (keyword = '')
    if (t === 'AssertConstraintUsage' && el.isNegated) keyword = 'assert not constraint'
    if (t === 'ReferenceUsage' && (lead === 'subject ' || lead === 'return ' || (redefines.length && el.declaredName === undefined) || el.isEnd || el.direction)) keyword = ''
    // Reference forms: `perform x.y;`, `exhibit s;`, `assert c;`, `require c;`, `verify r;`, `frame c;`, `render r;`.
    const refWord = REFERENCE_FORM[t] ?? (lead && t !== 'ReferenceUsage' ? lead.trim() : undefined)
    if (refWord && references && el.declaredName === undefined && el.declaredShortName === undefined && !typing.length && !subsets.length && !redefines.length && (REFERENCE_FORM[t] || ['require', 'assume', 'verify', 'frame', 'render'].includes(lead.trim()))) {
      const word = t === 'AssertConstraintUsage' ? (el.isNegated ? 'assert not' : 'assert') : REFERENCE_FORM[t] ?? lead.trim()
      for (const mem of this.s.memberships(el['@id'])) if (this.get(refId(mem, 'ownedRelatedElement'))?.['@type'] === 'MultiplicityRange') skip.add(mem['@id'])
      this.block(depth, `${vis}${word} ${references}`, el['@id'], skip)
      return
    }
    if (t === 'AcceptActionUsage' && !isKindOf(mt, 'TransitionFeatureMembership')) {
      this.block(depth, `${vis}${this.acceptText(el, nsId, skip)}`, el['@id'], skip)
      return
    }
    if (mt === 'VariantMembership' && t === 'EnumerationUsage') keyword = 'enum'
    const isRefPrefix = !el.isComposite && isKindOf(t, 'OccurrenceUsage') && !['ReferenceUsage', 'PerformActionUsage', 'ExhibitStateUsage', 'SatisfyRequirementUsage', 'BindingConnectorAsUsage', 'SuccessionAsUsage', 'TransitionUsage', 'AcceptActionUsage', 'FlowUsage', 'ConnectionUsage', 'InterfaceUsage', 'AllocationUsage', 'ConstraintUsage', 'RequirementUsage', 'CalculationUsage'].includes(t)
    const prefix = [
      el.direction ? `${el.direction} ` : '',
      el.isAbstract ? 'abstract ' : '',
      el.isVariation ? 'variation ' : '',
      el.isEnd ? 'end ' : '',
      el.isDerived ? 'derived ' : '',
      el.isConstant ? 'constant ' : '',
      isRefPrefix ? 'ref ' : '',
    ].join('')
    const parts: string[] = []
    const ident = this.ident(el)
    if (ident) parts.push(ident)
    if (typing.length) parts.push(`: ${typing.join(', ')}`)
    if (subsets.length) parts.push(`:> ${subsets.join(', ')}`)
    if (redefines.length) parts.push(`:>> ${redefines.join(', ')}`)
    if (references) parts.push(`::> ${references}`)
    // Multiplicity.
    for (const mem of this.s.memberships(el['@id'])) {
      const r = this.get(refId(mem, 'ownedRelatedElement'))
      if (r?.['@type'] === 'MultiplicityRange') {
        const bounds = this.s.ownedMembers(r['@id']).map((b) => this.expr(b['@id'], nsId, 0))
        if (parts.length) parts[parts.length - 1] += `[${bounds.join('..')}]`
        else parts.push(`[${bounds.join('..')}]`)
        skip.add(mem['@id'])
      }
    }
    const flags = `${el.isOrdered ? ' ordered' : ''}${el.isUnique === false ? ' nonunique' : ''}`
    // Value.
    const fv = this.s.ownedRelationships(el['@id']).find((r) => r['@type'] === 'FeatureValue')
    let value = ''
    if (fv) {
      const v = this.get(refId(fv, 'ownedRelatedElement'))
      const op = fv.isDefault ? (fv.isInitial ? 'default := ' : 'default = ') : fv.isInitial ? ':= ' : '= '
      if (v) value = ` ${op}${this.expr(v['@id'], el['@id'], 0)}`
      skip.add(fv['@id'])
    }
    let tail = ''
    // Connector-shaped usages.
    if (isKindOf(t, 'ConnectorAsUsage') && t !== 'TransitionUsage') {
      const ends = this.s.memberships(el['@id']).filter((x) => x['@type'] === 'EndFeatureMembership')
      const endTexts: string[] = []
      let printable = ends.length === 2
      for (const e of ends) {
        const end = this.get(refId(e, 'ownedRelatedElement'))!
        const rs = this.s.ownedRelationships(end['@id']).find((r) => r['@type'] === 'ReferenceSubsetting')
        if (!rs || end.declaredName !== undefined || this.s.ownedRelationships(end['@id']).some((r) => r['@type'] === 'FeatureTyping')) printable = false
        else endTexts.push(this.refOrChain(rs, 'referencedFeature', nsId))
      }
      if (printable && t === 'SuccessionAsUsage' && !parts.length && !prefix && this.prev) {
        const first = this.get(refId(ends[0], 'ownedRelatedElement'))!
        const rs0 = this.s.ownedRelationships(first['@id']).find((r) => r['@type'] === 'ReferenceSubsetting')
        if (rs0 && refId(rs0, 'referencedFeature') === this.prev) {
          for (const e of ends) skip.add(e['@id'])
          this.block(depth, `${vis}then ${endTexts[1]}`, el['@id'], skip)
          return
        }
      }
      if (printable) {
        for (const e of ends) skip.add(e['@id'])
        const [a, b] = endTexts
        if (t === 'BindingConnectorAsUsage') tail = `bind ${a} = ${b}`
        else if (t === 'SuccessionAsUsage') tail = `first ${a} then ${b}`
        else if (t === 'AllocationUsage') tail = `allocate ${a} to ${b}`
        else if (t === 'FlowUsage') tail = `from ${a} to ${b}`
        else tail = `connect ${a} to ${b}`
      }
      if (t === 'FlowUsage') {
        const payload = this.s.memberships(el['@id']).find((x) => this.get(refId(x, 'ownedRelatedElement'))?.['@type'] === 'PayloadFeature')
        if (payload) {
          const pf = this.get(refId(payload, 'ownedRelatedElement'))!
          const ft = this.s.ownedRelationships(pf['@id']).find((r) => r['@type'] === 'FeatureTyping')
          if (ft) tail = `of ${this.refName(nsId, refId(ft, 'type'))}${tail ? ` ${tail}` : ''}`
          skip.add(payload['@id'])
        }
      }
      const named = parts.length > 0 || prefix || t === 'FlowUsage'
      const kw = named ? `${keyword} ` : ''
      const decl = `${prefix}${kw}${parts.join(' ')}${named && parts.length ? ' ' : ''}${tail}`.replace(/\s+$/, '')
      this.block(depth, `${vis}${lead}${decl}`, el['@id'], skip)
      return
    }
    if (t === 'SatisfyRequirementUsage') {
      const rs = this.s.ownedRelationships(el['@id']).find((r) => r['@type'] === 'ReferenceSubsetting')
      const subj = this.s.memberships(el['@id']).find((x) => x['@type'] === 'SubjectMembership')
      let by = ''
      if (subj) {
        const subject = this.get(refId(subj, 'ownedRelatedElement'))!
        const sfv = this.s.ownedRelationships(subject['@id']).find((r) => r['@type'] === 'FeatureValue')
        const expr = sfv && this.get(refId(sfv, 'ownedRelatedElement'))
        if (expr) by = ` by ${this.expr(expr['@id'], nsId, 0)}`
        skip.add(subj['@id'])
      }
      if (rs) skip.add(rs['@id'])
      this.block(depth, `${vis}satisfy ${rs ? this.refName(nsId, refId(rs, 'referencedFeature')) : '?'}${by}`, el['@id'], skip)
      return
    }
    if (t === 'TransitionUsage') {
      this.transition(el, nsId, depth, vis, skip)
      return
    }
    // Result expression of constraints and calculations: `{ expr }` printed as a body member.
    const head = `${vis}${lead}${prefix}${keyword}${keyword && (parts.length || flags) ? ' ' : ''}${parts.join(' ')}${flags}${value}`.replace(/\s+$/, '')
    this.block(depth, head || `${vis}${lead}${keyword}`, el['@id'], skip)
  }

  private transition(el: Element, nsId: string, depth: number, vis: string, skip: Set<string>) {
    let text = `${vis}transition${this.ident(el, ' ')}`
    const rels = this.s.ownedRelationships(el['@id'])
    const sourceMem = rels.find((r) => r['@type'] === 'Membership')
    if (sourceMem) {
      text += ` first ${this.refName(nsId, refId(sourceMem, 'memberElement'))}`
      skip.add(sourceMem['@id'])
    }
    let target = '?'
    for (const r of rels) {
      if (r['@type'] === 'TransitionFeatureMembership') {
        const x = this.get(refId(r, 'ownedRelatedElement'))!
        if (r.kind === 'trigger' && x['@type'] === 'AcceptActionUsage') {
          text += ` ${this.acceptText(x, nsId, new Set())}`
        } else if (r.kind === 'guard') text += ` if ${this.expr(x['@id'], nsId, 0)}`
        skip.add(r['@id'])
      } else if (r['@type'] === 'FeatureMembership') {
        const x = this.get(refId(r, 'ownedRelatedElement'))
        if (x?.['@type'] === 'SuccessionAsUsage') {
          const ends = this.s.memberships(x['@id']).filter((q) => q['@type'] === 'EndFeatureMembership')
          const last = ends[ends.length - 1] && this.get(refId(ends[ends.length - 1], 'ownedRelatedElement'))
          const rs = last && this.s.ownedRelationships(last['@id']).find((q) => q['@type'] === 'ReferenceSubsetting')
          if (rs) target = this.refOrChain(rs, 'referencedFeature', nsId)
          skip.add(r['@id'])
        }
      }
    }
    this.block(depth, `${text} then ${target}`, el['@id'], skip)
  }

  /** `accept [name :] T [via x]` from an accept action's payload and receiver parameters. */
  private acceptText(el: Element, nsId: string, skip: Set<string>): string {
    const params = this.s.memberships(el['@id']).filter((p) => p['@type'] === 'ParameterMembership')
    for (const p of params) skip.add(p['@id'])
    const payload = params[0] && this.get(refId(params[0], 'ownedRelatedElement'))
    const ft = payload && this.s.ownedRelationships(payload['@id']).find((q) => q['@type'] === 'FeatureTyping')
    const receiver = params[1] && this.get(refId(params[1], 'ownedRelatedElement'))
    const fv = receiver && this.s.ownedRelationships(receiver['@id']).find((q) => q['@type'] === 'FeatureValue')
    const via = fv && refId(fv, 'ownedRelatedElement')
    const name = payload && typeof payload.declaredName === 'string' ? `${quote(payload.declaredName)} : ` : ''
    return `accept ${name}${ft ? this.refName(nsId, refId(ft, 'type')) : ''}${via ? ` via ${this.expr(via, nsId, 0)}` : ''}`.replace(/\s+$/, '')
  }

  // ---- references ---------------------------------------------------------------------------
  /** The shortest name that resolves back to `target` from `scopeId`. */
  refName(scopeId: string, target: string | undefined, redefinition = false): string {
    if (!target) return '?'
    const name = this.s.name(target)
    const short = this.s.shortName(target)
    // Library elements (e.g. SI units) are conventionally referenced by their short name (kg, m, N).
    if (short !== undefined && !redefinition && this.s.model.isLibrary(target) && this.s.lookup(scopeId, short)?.element['@id'] === target) return quote(short)
    if (name !== undefined) {
      if (redefinition) return quote(name)
      const hit = this.s.lookup(scopeId, name)
      if (hit?.element['@id'] === target) return quote(name)
    }
    return this.absoluteName(target)
  }

  absoluteName(target: string): string {
    return this.s.qualifiedName(target) ?? quote(this.s.name(target) ?? '?')
  }

  private isOwnedChain(rel: Element, prop: string): boolean {
    const target = refId(rel, prop)
    return !!target && refIds(rel, 'ownedRelatedElement').includes(target)
  }

  /** A reference that may be a feature chain (owned chain feature with FeatureChainings). */
  private refOrChain(rel: Element, prop: string, scopeId: string): string {
    const target = this.get(refId(rel, prop))
    if (target && refIds(rel, 'ownedRelatedElement').includes(target['@id'])) return this.chainText(target['@id'], scopeId)
    return this.refName(scopeId, target?.['@id'])
  }

  private chainText(featureId: string, scopeId: string): string {
    const links = this.s.ownedRelationships(featureId).filter((r) => r['@type'] === 'FeatureChaining')
    return links.map((l, k) => (k === 0 ? this.refName(scopeId, refId(l, 'chainingFeature')) : quote(this.s.name(refId(l, 'chainingFeature')!) ?? '?'))).join('.')
  }

  // ---- expressions --------------------------------------------------------------------------
  expr(id: string, scopeId: string, parentPrec: number): string {
    const e = this.get(id)
    if (!e) return '?'
    switch (e['@type']) {
      case 'LiteralInteger':
        return String(e.value)
      case 'LiteralRational': {
        const s = String(e.value)
        return /[.eE]/.test(s) || !Number.isFinite(e.value as number) ? s : `${s}.0`
      }
      case 'LiteralString':
        return JSON.stringify(String(e.value ?? ''))
      case 'LiteralBoolean':
        return e.value ? 'true' : 'false'
      case 'LiteralInfinity':
        return '*'
      case 'NullExpression':
        return 'null'
      case 'FeatureReferenceExpression': {
        const mem = this.s.memberships(id)[0]
        if (!mem) return '?'
        const target = this.s.memberElement(mem)
        if (!target) return '?'
        if (isKindOf(mem['@type'], 'OwningMembership')) return this.chainText(target['@id'], scopeId)
        return this.refName(scopeId, target['@id'])
      }
      case 'InvocationExpression': {
        const ft = this.s.ownedRelationships(id).find((r) => r['@type'] === 'FeatureTyping')
        const args = this.s.ownedMembers(id).map((a) => this.expr(a['@id'], scopeId, 0))
        return `${ft ? this.refName(scopeId, refId(ft, 'type')) : '?'}(${args.join(', ')})`
      }
      case 'OperatorExpression': {
        const op = String(e.operator)
        const args = this.s.ownedMembers(id)
        if (op === ',') return `(${args.map((a) => this.expr(a['@id'], scopeId, 0)).join(', ')})`
        if (op === '[') return `${this.expr(args[0]['@id'], scopeId, 11)} [${this.expr(args[1]['@id'], scopeId, 0)}]`
        if (op === 'if') {
          const text = `if ${this.expr(args[0]['@id'], scopeId, 0)} ? ${this.expr(args[1]['@id'], scopeId, 0)} else ${this.expr(args[2]['@id'], scopeId, 0)}`
          return parentPrec > 0 ? `(${text})` : text
        }
        if (args.length === 1) {
          const text = `${op}${op === 'not' ? ' ' : ''}${this.expr(args[0]['@id'], scopeId, 10)}`
          return parentPrec > 10 ? `(${text})` : text
        }
        const p = PRECEDENCE[op] ?? 5
        const rightAssoc = op === '**' || op === '^'
        const l = this.expr(args[0]['@id'], scopeId, rightAssoc ? p + 1 : p)
        const r = this.expr(args[1]['@id'], scopeId, rightAssoc ? p : p + 1)
        const text = `${l} ${op} ${r}`
        return parentPrec > p ? `(${text})` : text
      }
      default:
        return '?'
    }
  }
}

function commentText(body: string, depth: number, ind: string): string {
  if (!body.includes('\n')) return `/* ${body} */`
  const pad = ind.repeat(depth)
  return `/*\n${body.split('\n').map((l) => `${pad} * ${l}`.replace(/\s+$/, '')).join('\n')}\n${pad} */`
}

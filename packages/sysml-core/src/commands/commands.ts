import { isKindOf } from '../metamodel/metaclasses'
import { UUID_PATTERN } from '../model/ids'
import { refId, refIds, type Element, type Model } from '../model/model'
import { Semantics, semanticsOf } from '../semantics/semantics'
import type { Chain, DefinitionNode, Expr, Member, PackageNode, QName, UsageNode } from '../syntax/ast'
import { Builder, patch } from '../syntax/build'
import type { Range } from '../syntax/lexer'
import { parse, parseExpression } from '../syntax/parser'
import type { Diagnostic } from '../validation/diagnostic'
import { preserveIdentity } from './reconcile'

/**
 * Typed modelling commands (ADR-0034). Each command is plain JSON (published with a JSON schema in
 * COMMAND_SCHEMAS) and is executed against a working copy by `executeCommand`. Element references
 * in commands are element IDs (UUIDs), placeholders of elements created earlier in the same
 * transaction (`$name`), or qualified names (`Package::Part::feature`).
 */

export type ElementRef = string

export const CREATABLE_KINDS = [
  'Package',
  'PartDefinition', 'PartUsage',
  'AttributeDefinition', 'AttributeUsage',
  'EnumerationDefinition', 'EnumerationUsage',
  'ItemDefinition', 'ItemUsage',
  'PortDefinition', 'PortUsage',
  'ConnectionDefinition', 'InterfaceDefinition', 'AllocationDefinition', 'FlowDefinition',
  'ActionDefinition', 'ActionUsage',
  'StateDefinition', 'StateUsage',
  'ConstraintDefinition', 'ConstraintUsage',
  'RequirementDefinition', 'RequirementUsage',
  'CalculationDefinition', 'CalculationUsage',
  'OccurrenceDefinition', 'OccurrenceUsage',
  'MetadataDefinition',
  'ReferenceUsage',
] as const

export type CreatableKind = (typeof CREATABLE_KINDS)[number]

export const CONNECT_KINDS = ['connection', 'interface', 'flow', 'binding', 'succession', 'allocation'] as const
export type ConnectKind = (typeof CONNECT_KINDS)[number]

export const METADATA_KINDS = ['ManagedRequirement', 'CadRepresentation', 'ConceptLink'] as const

export type Command =
  | {
      op: 'createElement'
      ownerId: ElementRef
      kind: CreatableKind
      name?: string
      shortName?: string
      /** Placeholder for later commands of the same transaction, e.g. "$motor". */
      ref?: string
      typeIds?: ElementRef[]
      /** Conjugated typing (`~T`) for port usages. */
      conjugated?: boolean
      specializes?: ElementRef[]
      subsets?: ElementRef[]
      redefines?: ElementRef[]
      multiplicity?: { lower?: number; upper: number | '*' }
      /** Value expression in textual notation, e.g. "12 [kg]". */
      value?: string
      direction?: 'in' | 'out' | 'inout'
      isAbstract?: boolean
      isEnd?: boolean
      /** `ref` prefix: not composite. */
      isReference?: boolean
      doc?: string
    }
  | { op: 'rename'; elementId: ElementRef; name?: string | null; shortName?: string | null }
  | { op: 'setTyping'; elementId: ElementRef; typeIds: ElementRef[]; conjugated?: boolean }
  | { op: 'addSpecialization'; elementId: ElementRef; generalId: ElementRef; kind?: 'subclassification' | 'subsetting' | 'redefinition' | 'reference-subsetting' }
  | { op: 'removeSpecialization'; elementId: ElementRef; generalId: ElementRef }
  | { op: 'setMultiplicity'; elementId: ElementRef; multiplicity: { lower?: number; upper: number | '*' } | null }
  | { op: 'setValue'; elementId: ElementRef; expression: string | null; isDefault?: boolean; isInitial?: boolean }
  | { op: 'setDirection'; elementId: ElementRef; direction: 'in' | 'out' | 'inout' | null }
  | { op: 'setAbstract'; elementId: ElementRef; isAbstract: boolean }
  | { op: 'setDocumentation'; elementId: ElementRef; text: string }
  | { op: 'connect'; ownerId: ElementRef; kind: ConnectKind; source: string; target: string; name?: string; typeId?: ElementRef; itemTypeId?: ElementRef; ref?: string }
  | { op: 'satisfy'; ownerId: ElementRef; requirementId: ElementRef; by: string; ref?: string }
  | { op: 'move'; elementId: ElementRef; newOwnerId: ElementRef }
  | { op: 'deleteElement'; elementId: ElementRef; removeReferences?: boolean }
  | { op: 'applyText'; namespaceId: ElementRef; text: string; mode?: 'replace-members' | 'append' }
  | { op: 'setMetadata'; elementId: ElementRef; metadata: (typeof METADATA_KINDS)[number]; values: Record<string, string | number | null> | null }

export class CommandError extends Error {
  constructor(
    readonly code: 'invalid' | 'not-found' | 'not-allowed',
    message: string,
    readonly diagnostics: Diagnostic[] = [],
  ) {
    super(message)
    this.name = 'CommandError'
  }
}

export interface CommandContext {
  /** Working copy; commands modify it. */
  model: Model
  /** The model before the transaction (for identity preservation). */
  base: Model
  placeholders: Map<string, string>
}

export interface CommandOutcome {
  /** Main element created or affected. */
  elementId?: string
  /** Diagnostics from parsing text or expressions (only errors abort). */
  diagnostics?: Diagnostic[]
}

const NO_RANGE: Range = { start: { offset: 0, line: 1, column: 1 }, end: { offset: 0, line: 1, column: 1 } }

/** Splits a qualified name `A::'b c'::d` into segments. */
export function splitQualifiedName(text: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '\\' && i + 1 < text.length) cur += text[++i]
      else if (c === "'") quoted = false
      else cur += c
    } else if (c === "'") quoted = true
    else if (c === ':' && text[i + 1] === ':') {
      out.push(cur.trim())
      cur = ''
      i++
    } else cur += c
  }
  out.push(cur.trim())
  return out
}

/** Resolves an element reference (UUID, `$placeholder` or qualified name). */
export function resolveRef(model: Model, ref: unknown, placeholders: Map<string, string> = new Map(), what = 'element'): Element {
  if (typeof ref !== 'string' || !ref.trim()) throw new CommandError('invalid', `The ${what} reference must be a non-empty string.`)
  const r = ref.trim()
  if (r.startsWith('$')) {
    const id = placeholders.get(r)
    if (!id) throw new CommandError('not-found', `Placeholder ${r} was not defined by an earlier command in this transaction.`)
    return model.get(id)!
  }
  if (UUID_PATTERN.test(r)) {
    const el = model.get(r)
    if (!el) throw new CommandError('not-found', `No element ${r}.`)
    return el
  }
  const segments = splitQualifiedName(r)
  const s = semanticsOf(model)
  const hit = s.resolveQualified(model.rootId, segments)
  if (hit) return hit.element
  // Convenience for people and the assistant: a simple name that is unique in the model (not the library).
  if (segments.length === 1) {
    const matches = [...model.elements()].filter((e) => e.declaredName === segments[0] && !isKindOf(e['@type'], 'Relationship'))
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) throw new CommandError('invalid', `“${r}” is ambiguous: ${matches.slice(0, 6).map((m) => s.qualifiedName(m['@id']) ?? m['@type']).join(', ')}. Use a qualified name.`)
  }
  throw new CommandError('not-found', `No ${what} named “${r}”.`)
}

function writable(ctx: CommandContext, el: Element): Element {
  if (ctx.model.isLibrary(el['@id'])) throw new CommandError('not-allowed', `${semanticsOf(ctx.model).label(el['@id'])} belongs to the model library and is read-only.`)
  return el
}

const q = (id: string): QName => ({ segments: [], range: NO_RANGE, resolvedId: id })

function exprFromText(text: string): Expr {
  const r = parseExpression(text)
  if (!r.expr || r.diagnostics.length) throw new CommandError('invalid', `The expression “${text}” is not valid: ${r.diagnostics.map((d) => d.message).join(' ')}`, r.diagnostics.map((d) => ({ ...d })))
  return r.expr
}

function chainFromText(model: Model, text: string, placeholders: Map<string, string>): Chain {
  const t = text.trim()
  if (UUID_PATTERN.test(t) || t.startsWith('$')) {
    const el = resolveRef(model, t, placeholders)
    return { parts: [q(el['@id'])], range: NO_RANGE }
  }
  const e = exprFromText(t)
  if (e.kind !== 'ref') throw new CommandError('invalid', `“${text}” is not a feature reference (expected e.g. motor.power).`)
  return e.chain
}

function finishBuild(builder: Builder): Diagnostic[] {
  const diags = builder.resolve().map((d) => ({ ...d }) as Diagnostic)
  if (diags.length) throw new CommandError('invalid', diags.map((d) => d.message).join(' '), diags)
  return diags
}

/** Removes an element, its owning membership and its owned subtree from the working copy. Returns removed IDs. */
export function removeSubtree(model: Model, id: string, includeOwningRelationship = true): Set<string> {
  const removed = new Set<string>()
  const collect = (eid: string) => {
    if (removed.has(eid)) return
    const el = model.own(eid)
    if (!el) return
    removed.add(eid)
    for (const r of refIds(el, 'ownedRelationship')) collect(r)
    for (const c of refIds(el, 'ownedRelatedElement')) collect(c)
  }
  const el = model.own(id)
  if (!el) return removed
  let top = id
  const owningRel = refId(el, 'owningRelationship')
  if (includeOwningRelationship && owningRel) {
    const rel = model.own(owningRel)
    if (rel && refIds(rel, 'ownedRelatedElement').length <= 1) top = owningRel
  }
  collect(top)
  // Detach from the owner.
  const topEl = model.own(top)!
  const owner = refId(topEl, 'owningRelatedElement') ?? (top === id ? undefined : undefined)
  if (owner && model.own(owner)) patch(model, owner, { ownedRelationship: refIds(model.own(owner)!, 'ownedRelationship').filter((x) => x !== top) })
  if (top === id && owningRel && model.own(owningRel)) {
    const rel = model.own(owningRel)!
    patch(model, owningRel, { ownedRelatedElement: refIds(rel, 'ownedRelatedElement').filter((x) => x !== id) })
  }
  for (const r of removed) model.remove(r)
  return removed
}

function ownedRels(model: Model, id: string, pred: (r: Element) => boolean): Element[] {
  const el = model.get(id)
  return el ? refIds(el, 'ownedRelationship').map((r) => model.get(r)!).filter((r) => r && pred(r)) : []
}

function membershipFor(owner: Element, kind: string, isEnd?: boolean): UsageNode['membership'] {
  if (isEnd) return 'end'
  if (kind === 'EnumerationUsage' && owner['@type'] === 'EnumerationDefinition') return 'variant'
  return isKindOf(owner['@type'], 'Type') ? 'feature' : 'owning'
}

function usageKeywordOf(kind: string): string {
  const map: Record<string, string> = { PartUsage: 'part', AttributeUsage: 'attribute', EnumerationUsage: 'enum', ItemUsage: 'item', PortUsage: 'port', ActionUsage: 'action', StateUsage: 'state', ConstraintUsage: 'constraint', RequirementUsage: 'requirement', CalculationUsage: 'calc', OccurrenceUsage: 'occurrence', ReferenceUsage: 'ref' }
  return map[kind] ?? ''
}

function multiplicityExprs(m: { lower?: number; upper: number | '*' }): { lower?: Expr; upper: Expr } {
  const lit = (v: number | '*'): Expr => (v === '*' ? { kind: 'literal', type: 'infinity', value: null, range: NO_RANGE } : { kind: 'literal', type: 'integer', value: v, range: NO_RANGE })
  if (m.upper !== '*' && (!Number.isInteger(m.upper) || m.upper < 0)) throw new CommandError('invalid', 'Multiplicity bounds must be non-negative integers or "*".')
  if (m.lower !== undefined && (!Number.isInteger(m.lower) || m.lower < 0)) throw new CommandError('invalid', 'Multiplicity bounds must be non-negative integers.')
  return { lower: m.lower === undefined ? undefined : lit(m.lower), upper: lit(m.upper) }
}

// ---- execution --------------------------------------------------------------------------------

export function executeCommand(ctx: CommandContext, cmd: Command): CommandOutcome {
  const { model, placeholders } = ctx
  const ref = (r: unknown, what?: string) => resolveRef(model, r, placeholders, what)
  switch (cmd.op) {
    case 'createElement': {
      if (!CREATABLE_KINDS.includes(cmd.kind)) throw new CommandError('invalid', `kind must be one of ${CREATABLE_KINDS.join(', ')}.`)
      const owner = writable(ctx, ref(cmd.ownerId, 'owner'))
      if (!isKindOf(owner['@type'], 'Namespace')) throw new CommandError('invalid', `${semanticsOf(model).label(owner['@id'])} (${owner['@type']}) cannot own members.`)
      const builder = new Builder(model)
      let node: Member
      if (cmd.kind === 'Package') {
        node = { kind: 'package', name: cmd.name, shortName: cmd.shortName, isLibrary: false, isStandard: false, members: [], range: NO_RANGE } satisfies PackageNode
      } else if (cmd.kind.endsWith('Definition')) {
        node = { kind: 'definition', metaclass: cmd.kind, name: cmd.name, shortName: cmd.shortName, isAbstract: !!cmd.isAbstract, isVariation: false, specializes: (cmd.specializes ?? []).map((s) => q(ref(s, 'general type')['@id'])), members: [], membership: 'owning', range: NO_RANGE } satisfies DefinitionNode
      } else {
        const m = cmd.multiplicity ? multiplicityExprs(cmd.multiplicity) : undefined
        node = {
          kind: 'usage',
          metaclass: cmd.kind,
          keyword: usageKeywordOf(cmd.kind),
          name: cmd.name,
          shortName: cmd.shortName,
          direction: cmd.direction,
          isAbstract: !!cmd.isAbstract,
          isVariation: false,
          isEnd: !!cmd.isEnd,
          isDerived: false,
          isConstant: false,
          isReference: !!cmd.isReference,
          isOrdered: false,
          isNonunique: false,
          typing: (cmd.typeIds ?? []).map((t) => ({ name: q(ref(t, 'type')['@id']), conjugated: cmd.conjugated || undefined })),
          subsets: (cmd.subsets ?? []).map((s) => q(ref(s, 'subsetted feature')['@id'])),
          redefines: (cmd.redefines ?? []).map((s) => q(ref(s, 'redefined feature')['@id'])),
          multiplicity: m ? { ...m, range: NO_RANGE } : undefined,
          value: cmd.value !== undefined ? { expr: exprFromText(cmd.value), isDefault: false, isInitial: false } : undefined,
          members: [],
          membership: membershipFor(owner, cmd.kind, cmd.isEnd),
          range: NO_RANGE,
        } satisfies UsageNode
      }
      if (cmd.doc) (node as { members: Member[] }).members.push({ kind: 'doc', about: [], body: cmd.doc, range: NO_RANGE })
      if (cmd.conjugated) for (const t of (node as UsageNode).typing ?? []) {
        // ~T needs the conjugated port definition owned by T.
        const def = model.get(t.name.resolvedId!)
        const conj = def && semanticsOf(model).ownedMembers(def['@id']).find((x) => x['@type'] === 'ConjugatedPortDefinition')
        if (!conj) throw new CommandError('invalid', 'Conjugated typing needs a port definition.')
        t.name = q(conj['@id'])
        t.conjugated = true
      }
      const id = builder.member(owner['@id'], node)!
      finishBuild(builder)
      // ConjugatedPortTyping of a pre-resolved target: point conjugatedPortDefinition, keep `type` too.
      if (cmd.ref) placeholders.set(cmd.ref.startsWith('$') ? cmd.ref : `$${cmd.ref}`, id)
      return { elementId: id }
    }
    case 'rename': {
      const el = writable(ctx, ref(cmd.elementId))
      const changes: Record<string, unknown> = {}
      if (cmd.name !== undefined) changes.declaredName = cmd.name === null || cmd.name === '' ? undefined : cmd.name
      if (cmd.shortName !== undefined) changes.declaredShortName = cmd.shortName === null || cmd.shortName === '' ? undefined : cmd.shortName
      if (cmd.name !== undefined && cmd.name !== null && !String(cmd.name).trim()) throw new CommandError('invalid', 'A name cannot be blank; use null to remove it.')
      patch(model, el['@id'], changes)
      return { elementId: el['@id'] }
    }
    case 'setTyping': {
      const el = writable(ctx, ref(cmd.elementId))
      if (!isKindOf(el['@type'], 'Feature')) throw new CommandError('invalid', 'Only features (usages) are typed.')
      for (const r of ownedRels(model, el['@id'], (x) => isKindOf(x['@type'], 'FeatureTyping'))) removeSubtree(model, r['@id'], false)
      const builder = new Builder(model)
      for (const t of cmd.typeIds) {
        const type = ref(t, 'type')
        if (cmd.conjugated) {
          const conj = semanticsOf(model).ownedMembers(type['@id']).find((x) => x['@type'] === 'ConjugatedPortDefinition')
          if (!conj) throw new CommandError('invalid', 'Conjugated typing needs a port definition.')
          builder.relationship(el['@id'], 'ConjugatedPortTyping', { typedFeature: el['@id'], conjugatedPortDefinition: conj['@id'] })
        } else builder.relationship(el['@id'], 'FeatureTyping', { typedFeature: el['@id'], type: type['@id'] })
      }
      return { elementId: el['@id'] }
    }
    case 'addSpecialization': {
      const el = writable(ctx, ref(cmd.elementId))
      const g = ref(cmd.generalId, 'general')
      const builder = new Builder(model)
      const kind = cmd.kind ?? (isKindOf(el['@type'], 'Feature') ? 'subsetting' : 'subclassification')
      if (kind === 'subclassification') {
        if (!isKindOf(el['@type'], 'Classifier')) throw new CommandError('invalid', 'Only definitions (classifiers) have subclassifications; use subsetting or redefinition for usages.')
        builder.relationship(el['@id'], 'Subclassification', { subclassifier: el['@id'], superclassifier: g['@id'] })
      } else {
        if (!isKindOf(el['@type'], 'Feature') || !isKindOf(g['@type'], 'Feature')) throw new CommandError('invalid', `${kind} relates two features.`)
        const [type, a, b] = kind === 'subsetting' ? ['Subsetting', 'subsettingFeature', 'subsettedFeature'] : kind === 'redefinition' ? ['Redefinition', 'redefiningFeature', 'redefinedFeature'] : ['ReferenceSubsetting', 'referencingFeature', 'referencedFeature']
        builder.relationship(el['@id'], type, { [a]: el['@id'], [b]: g['@id'] })
      }
      return { elementId: el['@id'] }
    }
    case 'removeSpecialization': {
      const el = writable(ctx, ref(cmd.elementId))
      const g = ref(cmd.generalId, 'general')
      const s = new Semantics(model)
      const rels = s.ownedRelationships(el['@id']).filter((r) => isKindOf(r['@type'], 'Specialization') && Object.values(r).includes(g['@id']) && r['@type'] !== 'FeatureTyping')
      if (!rels.length) throw new CommandError('not-found', `${s.label(el['@id'])} does not specialize ${s.label(g['@id'])}.`)
      for (const r of rels) removeSubtree(model, r['@id'], false)
      return { elementId: el['@id'] }
    }
    case 'setMultiplicity': {
      const el = writable(ctx, ref(cmd.elementId))
      if (!isKindOf(el['@type'], 'Feature')) throw new CommandError('invalid', 'Only features have multiplicities.')
      for (const m of ownedRels(model, el['@id'], (x) => x['@type'] === 'OwningMembership' && model.get(refId(x, 'ownedRelatedElement'))?.['@type'] === 'MultiplicityRange')) removeSubtree(model, m['@id'], false)
      if (cmd.multiplicity) {
        const mm = multiplicityExprs(cmd.multiplicity)
        const builder = new Builder(model)
        builder.multiplicity(el['@id'], mm.lower, mm.upper)
      }
      return { elementId: el['@id'] }
    }
    case 'setValue': {
      const el = writable(ctx, ref(cmd.elementId))
      if (!isKindOf(el['@type'], 'Feature')) throw new CommandError('invalid', 'Only features have values.')
      for (const r of ownedRels(model, el['@id'], (x) => x['@type'] === 'FeatureValue')) removeSubtree(model, r['@id'], false)
      if (cmd.expression !== null && cmd.expression.trim()) {
        const builder = new Builder(model)
        const fv = builder.relationship(el['@id'], 'FeatureValue', { ...(cmd.isDefault ? { isDefault: true } : {}), ...(cmd.isInitial ? { isInitial: true } : {}) })
        const e = builder.expression(exprFromText(cmd.expression), el['@id'])
        patch(model, fv['@id'], { ownedRelatedElement: [e['@id']] })
        patch(model, e['@id'], { owningRelationship: fv['@id'] })
        finishBuild(builder)
      }
      return { elementId: el['@id'] }
    }
    case 'setDirection': {
      const el = writable(ctx, ref(cmd.elementId))
      if (!isKindOf(el['@type'], 'Feature')) throw new CommandError('invalid', 'Only features have a direction.')
      patch(model, el['@id'], { direction: cmd.direction ?? undefined })
      return { elementId: el['@id'] }
    }
    case 'setAbstract': {
      const el = writable(ctx, ref(cmd.elementId))
      if (!isKindOf(el['@type'], 'Type')) throw new CommandError('invalid', 'Only types (definitions and usages) can be abstract.')
      patch(model, el['@id'], { isAbstract: cmd.isAbstract ? true : undefined })
      return { elementId: el['@id'] }
    }
    case 'setDocumentation': {
      const el = writable(ctx, ref(cmd.elementId))
      const s = new Semantics(model)
      const doc = s.ownedMembers(el['@id']).find((m) => m['@type'] === 'Documentation')
      if (!cmd.text.trim()) {
        if (doc) removeSubtree(model, doc['@id'])
      } else if (doc) patch(model, doc['@id'], { body: cmd.text.trim() })
      else {
        const builder = new Builder(model)
        builder.member(el['@id'], { kind: 'doc', about: [], body: cmd.text.trim(), range: NO_RANGE })
      }
      return { elementId: el['@id'] }
    }
    case 'connect': {
      const owner = writable(ctx, ref(cmd.ownerId, 'owner'))
      if (!CONNECT_KINDS.includes(cmd.kind)) throw new CommandError('invalid', `kind must be one of ${CONNECT_KINDS.join(', ')}.`)
      const metaclass = { connection: 'ConnectionUsage', interface: 'InterfaceUsage', flow: 'FlowUsage', binding: 'BindingConnectorAsUsage', succession: 'SuccessionAsUsage', allocation: 'AllocationUsage' }[cmd.kind]
      const node: UsageNode = {
        kind: 'usage', metaclass, keyword: cmd.kind, name: cmd.name, isAbstract: false, isVariation: false, isEnd: false, isDerived: false, isConstant: false, isReference: false, isOrdered: false, isNonunique: false,
        typing: cmd.typeId ? [{ name: q(ref(cmd.typeId, 'type')['@id']) }] : [], subsets: [], redefines: [], members: [], membership: membershipFor(owner, metaclass), range: NO_RANGE,
        connector: { ends: [chainFromText(model, cmd.source, placeholders), chainFromText(model, cmd.target, placeholders)], itemType: cmd.itemTypeId ? q(ref(cmd.itemTypeId, 'item type')['@id']) : undefined },
      }
      const builder = new Builder(model)
      const id = builder.member(owner['@id'], node)!
      finishBuild(builder)
      if (cmd.ref) placeholders.set(cmd.ref.startsWith('$') ? cmd.ref : `$${cmd.ref}`, id)
      return { elementId: id }
    }
    case 'satisfy': {
      const owner = writable(ctx, ref(cmd.ownerId, 'owner'))
      const req = ref(cmd.requirementId, 'requirement')
      const node: UsageNode = {
        kind: 'usage', metaclass: 'SatisfyRequirementUsage', keyword: 'satisfy', isAbstract: false, isVariation: false, isEnd: false, isDerived: false, isConstant: false, isReference: false, isOrdered: false, isNonunique: false,
        typing: [], subsets: [], redefines: [], members: [], membership: membershipFor(owner, 'SatisfyRequirementUsage'), range: NO_RANGE,
        satisfy: { requirement: q(req['@id']), by: chainFromText(model, cmd.by, placeholders) },
      }
      const builder = new Builder(model)
      const id = builder.member(owner['@id'], node)!
      finishBuild(builder)
      if (cmd.ref) placeholders.set(cmd.ref.startsWith('$') ? cmd.ref : `$${cmd.ref}`, id)
      return { elementId: id }
    }
    case 'move': {
      const el = writable(ctx, ref(cmd.elementId))
      const target = writable(ctx, ref(cmd.newOwnerId, 'new owner'))
      if (!isKindOf(target['@type'], 'Namespace')) throw new CommandError('invalid', 'The new owner must be a namespace.')
      const mem = semanticsOf(model).owningMembership(el['@id'])
      if (!mem) throw new CommandError('invalid', 'Only namespace members can be moved.')
      let cur: string | undefined = target['@id']
      const s = new Semantics(model)
      while (cur) {
        if (cur === el['@id']) throw new CommandError('invalid', 'An element cannot be moved into itself.')
        cur = s.owner(cur)?.['@id']
      }
      const oldOwner = refId(mem, 'owningRelatedElement')!
      patch(model, oldOwner, { ownedRelationship: refIds(model.get(oldOwner)!, 'ownedRelationship').filter((x) => x !== mem['@id']) })
      // Feature memberships only within types; packages own through owning memberships.
      let type = mem['@type']
      if (!isKindOf(target['@type'], 'Type') && isKindOf(type, 'FeatureMembership')) type = 'OwningMembership'
      if (isKindOf(target['@type'], 'Type') && type === 'OwningMembership' && isKindOf(el['@type'], 'Feature')) type = 'FeatureMembership'
      patch(model, mem['@id'], { owningRelatedElement: target['@id'], '@type': type })
      patch(model, target['@id'], { ownedRelationship: [...refIds(model.get(target['@id'])!, 'ownedRelationship'), mem['@id']] })
      return { elementId: el['@id'] }
    }
    case 'deleteElement': {
      const el = writable(ctx, ref(cmd.elementId))
      if (el['@id'] === model.rootId) throw new CommandError('not-allowed', 'The root namespace cannot be deleted.')
      const s = new Semantics(model)
      // Collect the subtree first to check references from outside it.
      const subtree = new Set<string>()
      const collect = (id: string) => {
        if (subtree.has(id)) return
        subtree.add(id)
        const e = model.own(id)
        if (!e) return
        for (const r of refIds(e, 'ownedRelationship')) collect(r)
        for (const c of refIds(e, 'ownedRelatedElement')) collect(c)
      }
      collect(el['@id'])
      const external = new Map<string, string>()
      for (const id of subtree) for (const r of model.referencesTo(id)) if (!subtree.has(r)) external.set(r, id)
      if (external.size && !cmd.removeReferences) {
        const names = [...external.keys()].slice(0, 5).map((r) => s.label(topOwner(s, r)))
        throw new CommandError('not-allowed', `${s.label(el['@id'])} is still referenced by ${[...new Set(names)].join(', ')}${external.size > 5 ? ' …' : ''}. Remove those references first, or delete with removeReferences.`)
      }
      if (external.size) {
        // Remove the referencing relationships (typings, specializations, ends …) with their subtrees.
        for (const r of external.keys()) {
          const rel = model.own(r)
          if (!rel) continue
          const holder = isKindOf(rel['@type'], 'Relationship') ? r : undefined
          if (holder) removeSubtree(model, outermostReferenceHolder(model, holder), false)
        }
      }
      removeSubtree(model, el['@id'])
      return { elementId: el['@id'] }
    }
    case 'applyText':
      return applyText(ctx, cmd)
    case 'setMetadata': {
      const el = writable(ctx, ref(cmd.elementId))
      if (!METADATA_KINDS.includes(cmd.metadata)) throw new CommandError('invalid', `metadata must be one of ${METADATA_KINDS.join(', ')}.`)
      const s = new Semantics(model)
      const existing = s.ownedMembers(el['@id']).filter((m) => m['@type'] === 'MetadataUsage' && s.featureTypes(m['@id']).some((t) => s.qualifiedName(t) === `EWS::${cmd.metadata}`))
      for (const m of existing) removeSubtree(model, m['@id'])
      if (cmd.values) {
        const def = resolveRef(model, `EWS::${cmd.metadata}`)
        const lines = Object.entries(cmd.values)
          .filter(([, v]) => v !== null && v !== undefined)
          .map(([k, v]) => `${k} = ${typeof v === 'number' ? String(v) : JSON.stringify(String(v))};`)
        const text = `@EWS::${cmd.metadata} { ${lines.join(' ')} }`
        const parsed = parse(text)
        if (parsed.diagnostics.length) throw new CommandError('invalid', parsed.diagnostics.map((d) => d.message).join(' '))
        const builder = new Builder(model)
        builder.buildMembers(el['@id'], parsed.model.members)
        finishBuild(builder)
        void def
      }
      return { elementId: el['@id'] }
    }
  }
}

function topOwner(s: Semantics, id: string): string {
  let cur = id
  for (let k = 0; k < 50; k++) {
    const el = s.get(cur)
    if (!el) return cur
    if (!isKindOf(el['@type'], 'Relationship') && !isKindOf(el['@type'], 'Expression') && el['@type'] !== 'Feature' && !(el['@type'] === 'ReferenceUsage' && el.isEnd)) return cur
    const o = s.owner(cur)
    if (!o) return cur
    cur = o['@id']
  }
  return cur
}

/** For a reference inside an expression or chain, the relationship to remove is the outermost one owned by a real element. */
function outermostReferenceHolder(model: Model, relId: string): string {
  const s = new Semantics(model)
  let cur = relId
  for (let k = 0; k < 50; k++) {
    const owner = s.owner(cur)
    if (!owner) return cur
    const t = owner['@type']
    if (isKindOf(t, 'Expression') || t === 'Feature' || isKindOf(t, 'Relationship')) {
      const holder = s.owningMembership(owner['@id']) ?? s.get(refId(owner, 'owningRelationship'))
      cur = holder ? holder['@id'] : owner['@id']
      continue
    }
    return cur
  }
  return cur
}

/** Relationships of a namespace that its textual body shows (members and imports). */
export function isBodyRelationship(model: Model, rel: Element): boolean {
  const t = rel['@type']
  if (isKindOf(t, 'Import')) return true
  if (!isKindOf(t, 'Membership') || isKindOf(t, 'FeatureValue')) return false
  const child = model.get(refId(rel, 'ownedRelatedElement'))
  if (child && (child['@type'] === 'ConjugatedPortDefinition' || child['@type'] === 'MultiplicityRange')) return false
  return true
}

/** Namespaces whose members can be edited as text: the root, packages and definitions. */
export function isTextEditableNamespace(model: Model, id: string): boolean {
  const el = model.get(id)
  if (!el) return false
  return id === model.rootId || isKindOf(el['@type'], 'Package') || isKindOf(el['@type'], 'Definition')
}

function applyText(ctx: CommandContext, cmd: Extract<Command, { op: 'applyText' }>): CommandOutcome {
  const { model } = ctx
  const ns = writable(ctx, resolveRef(model, cmd.namespaceId, ctx.placeholders, 'namespace'))
  if (!isTextEditableNamespace(model, ns['@id'])) throw new CommandError('invalid', 'Text can be applied to the model root, packages and definitions.')
  const parsed = parse(cmd.text)
  const syntax: Diagnostic[] = parsed.diagnostics.map((d) => ({ ruleId: d.ruleId, severity: d.severity, message: d.message, range: d.range, ...(d.construct ? { construct: d.construct } : {}) }))
  if (syntax.length) throw new CommandError('invalid', `The text has ${syntax.length} syntax error${syntax.length === 1 ? '' : 's'}: ${syntax[0].message}`, syntax)
  const mode = cmd.mode ?? 'replace-members'
  const before = model.clone()
  if (mode === 'replace-members') {
    for (const rel of ownedRels(model, ns['@id'], (r) => isBodyRelationship(model, r))) removeSubtree(model, rel['@id'], false)
  }
  const builder = new Builder(model)
  builder.buildMembers(ns['@id'], parsed.model.members)
  const diags = builder.resolve()
  if (diags.length) {
    throw new CommandError('invalid', `${diags.length} name${diags.length === 1 ? '' : 's'} could not be resolved: ${diags[0].message}`, diags.map((d) => ({ ...d }) as Diagnostic))
  }
  if (mode === 'replace-members') preserveIdentity(before, model, ns['@id'], new Set(builder.created), (r) => isBodyRelationship(before.get(r['@id']) ? before : model, r))
  return { elementId: ns['@id'] }
}

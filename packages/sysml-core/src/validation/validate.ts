import { isKindOf, isKnownMetaclass, referencesOfCached } from '../metamodel/metaclasses'
import { STRUCTURAL_REFS, refId, refIds, type Element, type Model } from '../model/model'
import { semanticsOf, type Semantics } from '../semantics/semantics'
import { evaluate, quantityDimension } from '../units/evaluate'
import { dimensionName, sameDimension } from '../units/units'
import type { Diagnostic } from './diagnostic'

/**
 * Semantic validation rules (SYS-FR-VAL-02). Each rule approximates a constraint of the KerML /
 * SysML specifications or an engineering check; rule IDs are ours (see conformance.md). Rules run
 * per element, so callers can validate the whole model or only affected elements.
 */

export interface RuleInfo {
  id: string
  severity: Diagnostic['severity']
  title: string
  /** Specification constraint approximated, if any. */
  spec?: string
}

export const RULES: RuleInfo[] = [
  { id: 'SYSML-REF-DANGLING', severity: 'error', title: 'References point to existing elements' },
  { id: 'SYSML-OWNERSHIP', severity: 'error', title: 'Ownership relationships are consistent (owned element and owning relationship agree)' },
  { id: 'SYSML-TYPING-KIND', severity: 'error', title: 'A usage is typed by definitions of its kind (part by part def, attribute by attribute def …)', spec: 'SysML validate*UsageType constraints, e.g. validatePartUsagePartDefinition' },
  { id: 'SYSML-SPECIALIZATION-KIND', severity: 'error', title: 'A definition specializes definitions of a compatible kind', spec: 'SysML definition specialization constraints' },
  { id: 'SYSML-SPECIALIZATION-CYCLE', severity: 'error', title: 'No type specializes itself (directly or indirectly)', spec: 'KerML: specialization must not be circular' },
  { id: 'SYSML-MULTIPLICITY', severity: 'error', title: 'Multiplicity bounds are non-negative and lower ≤ upper', spec: 'KerML MultiplicityRange bounds' },
  { id: 'SYSML-DUPLICATE-NAME', severity: 'warning', title: 'Members of a namespace are distinguishable by name', spec: 'KerML validateNamespaceDistinguishability' },
  { id: 'SYSML-REDEFINITION-TARGET', severity: 'error', title: 'A redefined feature is inherited by the owning type', spec: 'KerML validateRedefinitionFeaturingTypes (approximation)' },
  { id: 'SYSML-UNIT-DIMENSION', severity: 'error', title: 'A quantity value has the dimension of the attribute’s quantity type' },
  { id: 'SYSML-UNIT-MISSING', severity: 'warning', title: 'A quantity attribute’s numeric value states its unit' },
  { id: 'SYSML-CONNECTOR-ENDS', severity: 'error', title: 'Connections, interfaces, flows, bindings, successions and allocations have two connected ends', spec: 'SysML binary connector usages' },
  { id: 'SYSML-SATISFY-TARGET', severity: 'error', title: 'A satisfy relationship targets a requirement', spec: 'SysML SatisfyRequirementUsage' },
  { id: 'SYSML-TRANSITION-STATES', severity: 'warning', title: 'Transitions connect states' },
  { id: 'SYSML-COMPOSITION-CYCLE', severity: 'warning', title: 'A definition does not compose itself with a mandatory part (infinite structure)' },
  { id: 'SYSML-MANAGED-REQUIREMENT', severity: 'error', title: 'Managed requirement metadata carries a canonical requirement UUID' },
  { id: 'SYSML-PRODUCT-REFERENCE', severity: 'error', title: 'Product element metadata refers to a product element UUID with an integer revision' },
  { id: 'SYSML-CAD-REFERENCE', severity: 'error', title: 'CAD representation metadata refers to a CAD Modeler entity as <documentUuid>/<entityId> with an integer document revision' },
  { id: 'SYSML-CONSTRAINT-FALSE', severity: 'warning', title: 'A constraint whose expression can be evaluated holds (evaluates to true)' },
  { id: 'SYSML-UNSUPPORTED-METACLASS', severity: 'info', title: 'Element of a metaclass this version does not interpret (preserved unchanged)' },
]

const TYPE_KINDS: Record<string, string[]> = {
  PartUsage: ['PartDefinition'],
  ItemUsage: ['Structure'],
  AttributeUsage: ['DataType'],
  EnumerationUsage: ['EnumerationDefinition'],
  PortUsage: ['PortDefinition'],
  ConnectionUsage: ['Association'],
  InterfaceUsage: ['InterfaceDefinition'],
  AllocationUsage: ['AllocationDefinition'],
  FlowUsage: ['Behavior', 'Association'],
  ActionUsage: ['Behavior'],
  StateUsage: ['StateDefinition'],
  ConstraintUsage: ['Predicate'],
  RequirementUsage: ['RequirementDefinition'],
  CalculationUsage: ['Function'],
  OccurrenceUsage: ['Class'],
  MetadataUsage: ['Metaclass'],
  PerformActionUsage: ['Behavior'],
  ExhibitStateUsage: ['StateDefinition'],
  AssertConstraintUsage: ['Predicate'],
  CaseUsage: ['CaseDefinition'],
  UseCaseUsage: ['UseCaseDefinition'],
  VerificationCaseUsage: ['VerificationCaseDefinition'],
  AnalysisCaseUsage: ['AnalysisCaseDefinition'],
  ConcernUsage: ['ConcernDefinition'],
  ViewpointUsage: ['ViewpointDefinition'],
  ViewUsage: ['ViewDefinition'],
  RenderingUsage: ['RenderingDefinition'],
}

const BINARY_CONNECTORS = ['ConnectionUsage', 'InterfaceUsage', 'AllocationUsage', 'FlowUsage', 'BindingConnectorAsUsage', 'SuccessionAsUsage']

/** Validates the whole model layer (or only the given elements). */
export function validate(model: Model, ids?: Iterable<string>): Diagnostic[] {
  const s = semanticsOf(model)
  const out: Diagnostic[] = []
  const targets = ids ? [...new Set(ids)].map((id) => model.own(id)).filter((e): e is Element => !!e) : [...model.elements()]
  for (const el of targets) checkElement(s, el, out)
  return out
}

function d(out: Diagnostic[], ruleId: string, elementId: string, message: string) {
  const rule = RULES.find((r) => r.id === ruleId)!
  out.push({ ruleId, severity: rule.severity, elementId, message })
}

function checkElement(s: Semantics, el: Element, out: Diagnostic[]) {
  const id = el['@id']
  const t = el['@type']
  const label = () => s.label(id)
  if (!isKnownMetaclass(t)) {
    d(out, 'SYSML-UNSUPPORTED-METACLASS', id, `${t} elements are kept unchanged but not interpreted by this version.`)
    return
  }
  // References and ownership.
  for (const prop of Object.keys(referencesOfCached(t))) {
    for (const target of refIds(el, prop)) {
      if (!s.model.has(target)) d(out, 'SYSML-REF-DANGLING', id, `${label()}: ${prop} refers to a missing element (${target}).`)
    }
  }
  const owningRel = refId(el, 'owningRelationship')
  if (owningRel) {
    const rel = s.get(owningRel)
    if (rel && !refIds(rel, 'ownedRelatedElement').includes(id)) d(out, 'SYSML-OWNERSHIP', id, `${label()}: its owning relationship does not list it as owned.`)
  } else if (id !== s.model.rootId && !isKindOf(t, 'Relationship')) d(out, 'SYSML-OWNERSHIP', id, `${t} ${label()} has no owner (only the root namespace may be unowned).`)
  if (isKindOf(t, 'Relationship') && !owningRel) {
    const owner = refId(el, 'owningRelatedElement')
    if (!owner) d(out, 'SYSML-OWNERSHIP', id, `${t} has no owning element.`)
    else if (s.get(owner) && !refIds(s.get(owner)!, 'ownedRelationship').includes(id)) d(out, 'SYSML-OWNERSHIP', id, `${t}: its owner does not list it as an owned relationship.`)
  }
  void STRUCTURAL_REFS

  // Typing kind.
  if (TYPE_KINDS[t] || (isKindOf(t, 'Usage') && !['ReferenceUsage'].includes(t))) {
    const expected = TYPE_KINDS[t] ?? Object.entries(TYPE_KINDS).find(([k]) => isKindOf(t, k))?.[1]
    if (expected) {
      for (const r of s.ownedRelationships(id)) {
        if (!isKindOf(r['@type'], 'FeatureTyping')) continue
        const type = s.get(refId(r, isKindOf(r['@type'], 'ConjugatedPortTyping') ? 'conjugatedPortDefinition' : 'type'))
        if (type && !expected.some((k) => isKindOf(type['@type'], k))) {
          d(out, 'SYSML-TYPING-KIND', id, `${label()} (${t}) is typed by ${s.label(type['@id'])}, a ${type['@type']}; expected ${expected.join(' or ')}.`)
        }
      }
    }
  }

  // Specialization kind and cycles.
  if (isKindOf(t, 'Type')) {
    for (const r of s.ownedRelationships(id)) {
      if (r['@type'] !== 'Subclassification') continue
      const g = s.get(refId(r, 'superclassifier'))
      if (g && isKindOf(t, 'Definition') && isKindOf(g['@type'], 'Definition') && !compatible(t, g['@type'])) {
        d(out, 'SYSML-SPECIALIZATION-KIND', id, `${label()} (${t}) cannot specialize ${s.label(g['@id'])} (${g['@type']}).`)
      }
    }
    if (inCycle(s, id)) d(out, 'SYSML-SPECIALIZATION-CYCLE', id, `${label()} specializes itself (directly or through other types).`)
  }

  // Multiplicity.
  if (t === 'MultiplicityRange') {
    const bounds = s.ownedMembers(id)
    const values = bounds.map((b) => (b['@type'] === 'LiteralInfinity' ? Infinity : b['@type'] === 'LiteralInteger' ? Number(b.value) : NaN))
    const [lower, upper] = values.length === 1 ? [values[0], values[0]] : values
    const owner = s.owner(id)
    if ([lower, upper].some((v) => Number.isFinite(v) && v < 0)) d(out, 'SYSML-MULTIPLICITY', owner?.['@id'] ?? id, `${owner ? s.label(owner['@id']) : 'Multiplicity'}: bounds must not be negative.`)
    else if (lower > upper) d(out, 'SYSML-MULTIPLICITY', owner?.['@id'] ?? id, `${owner ? s.label(owner['@id']) : 'Multiplicity'}: lower bound ${lower} exceeds upper bound ${upper}.`)
  }

  // Distinguishable member names.
  if (isKindOf(t, 'Namespace')) {
    const seen = new Map<string, Element>()
    for (const m of s.memberships(id)) {
      const n = s.memberName(m)
      if (n === undefined) continue
      const prev = seen.get(n)
      const el2 = s.memberElement(m)
      if (prev && el2 && prev['@type'] === el2['@type'] && el2['@type'] !== 'ConjugatedPortDefinition') d(out, 'SYSML-DUPLICATE-NAME', el2['@id'], `“${n}” is declared more than once in ${id === s.model.rootId ? 'the model root' : s.label(id)}.`)
      else if (el2) seen.set(n, el2)
    }
  }

  // Redefinition targets.
  if (t === 'Redefinition') {
    const redefining = refId(el, 'redefiningFeature')
    const redefined = refId(el, 'redefinedFeature')
    if (redefining && redefined) {
      const ownerType = s.owningNamespace(redefining)
      if (ownerType && isKindOf(ownerType['@type'], 'Type')) {
        const inherited = s.inheritedMemberships(ownerType['@id']).map((m) => s.memberElement(m)?.['@id'])
        const ownerGenerals = s.allGenerals(ownerType['@id'])
        const redefinedOwner = s.owningNamespace(redefined)?.['@id']
        if (!inherited.includes(redefined) && !(redefinedOwner && ownerGenerals.includes(redefinedOwner))) {
          d(out, 'SYSML-REDEFINITION-TARGET', redefining, `${s.label(redefining)} redefines ${s.label(redefined)}, which ${s.label(ownerType['@id'])} does not inherit.`)
        }
      }
    }
  }

  // Units.
  if (isKindOf(t, 'Feature') && !isKindOf(t, 'Expression')) {
    const fv = s.ownedRelationships(id).find((r) => r['@type'] === 'FeatureValue')
    const expr = fv && refId(fv, 'ownedRelatedElement')
    if (expr) {
      const dims = s.featureTypes(id).map((ty) => quantityDimension(s, ty)).filter((x) => !!x)
      if (dims.length) {
        const v = evaluate(s.model, expr)
        if (v.kind === 'number') {
          if (!v.dimension) d(out, 'SYSML-UNIT-MISSING', id, `${label()} is a ${dimensionName(dims[0]!)} quantity; give its value a unit, e.g. “= 10 [kg]”.`)
          else if (!sameDimension(v.dimension, dims[0]!)) d(out, 'SYSML-UNIT-DIMENSION', id, `${label()} expects a ${dimensionName(dims[0]!)} value but is given a ${dimensionName(v.dimension)} value.`)
        }
      }
    }
  }

  // Connector ends.
  if (BINARY_CONNECTORS.includes(t)) {
    const ends = s.memberships(id).filter((m) => m['@type'] === 'EndFeatureMembership')
    const ownerIsDefinition = isKindOf(s.owningNamespace(id)?.['@type'] ?? '', 'Definition') || isKindOf(s.owningNamespace(id)?.['@type'] ?? '', 'Usage') || isKindOf(s.owningNamespace(id)?.['@type'] ?? '', 'Package')
    const typedByDef = s.featureTypes(id).length > 0
    if (ends.length !== 2 && !(ends.length === 0 && typedByDef) && ownerIsDefinition) d(out, 'SYSML-CONNECTOR-ENDS', id, `${label()} (${t}) must connect exactly two ends; it has ${ends.length}.`)
  }

  // Satisfy target.
  if (t === 'SatisfyRequirementUsage') {
    const rs = s.ownedRelationships(id).find((r) => r['@type'] === 'ReferenceSubsetting')
    const target = rs && s.get(refId(rs, 'referencedFeature'))
    if (!target) d(out, 'SYSML-SATISFY-TARGET', id, 'The satisfy relationship names no requirement.')
    else if (!isKindOf(target['@type'], 'RequirementUsage')) d(out, 'SYSML-SATISFY-TARGET', id, `satisfy targets ${s.label(target['@id'])}, a ${target['@type']}; it must be a requirement usage.`)
  }

  // Transitions connect states.
  if (t === 'TransitionUsage') {
    const succ = s.ownedMembers(id).find((m) => m['@type'] === 'SuccessionAsUsage')
    if (succ) {
      for (const end of s.ownedMembers(succ['@id'])) {
        const rs = s.ownedRelationships(end['@id']).find((r) => r['@type'] === 'ReferenceSubsetting')
        const target = rs && s.get(refId(rs, 'referencedFeature'))
        if (target && !isKindOf(target['@type'], 'StateUsage') && !isKindOf(target['@type'], 'ActionUsage')) d(out, 'SYSML-TRANSITION-STATES', id, `Transition end ${s.label(target['@id'])} is not a state.`)
      }
    }
  }

  // Composition cycles: a definition composing itself with lower bound ≥ 1.
  if (isKindOf(t, 'PartDefinition') || isKindOf(t, 'ItemDefinition')) {
    for (const f of s.ownedMembers(id)) {
      if (!f.isComposite || !isKindOf(f['@type'], 'ItemUsage')) continue
      if (s.featureTypes(f['@id']).some((ty) => ty === id || s.allGenerals(ty).includes(id)) && lowerBound(s, f['@id']) >= 1) {
        d(out, 'SYSML-COMPOSITION-CYCLE', f['@id'], `${s.label(f['@id'])} makes every ${s.label(id)} contain another ${s.label(id)} (infinite structure). Make it optional ([0..1]) or a reference.`)
      }
    }
  }

  // Managed requirement metadata.
  if (t === 'MetadataUsage') {
    const ty = s.featureTypes(id).map((x) => s.qualifiedName(x))
    if (ty.includes('EWS::ManagedRequirement')) {
      const idFeature = s.ownedMembers(id).find((m) => s.name(m['@id']) === 'requirementId')
      const fv = idFeature && s.ownedRelationships(idFeature['@id']).find((r) => r['@type'] === 'FeatureValue')
      const v = fv && refId(fv, 'ownedRelatedElement') ? evaluate(s.model, refId(fv, 'ownedRelatedElement')!) : undefined
      if (!v || v.kind !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.value)) {
        d(out, 'SYSML-MANAGED-REQUIREMENT', s.owner(id)?.['@id'] ?? id, 'ManagedRequirement needs requirementId = "<canonical requirement UUID>" (keys such as REQ-001 are display text, not identity).')
      }
    }
  }

  // CAD representation metadata (CR-SYSML-03).
  if (t === 'MetadataUsage' && s.featureTypes(id).some((x) => s.qualifiedName(x) === 'EWS::CadRepresentation')) {
    const ref = readCadMetadata(s, id)
    if (!ref.cadRef || !CAD_REF.test(ref.cadRef)) {
      d(out, 'SYSML-CAD-REFERENCE', s.owner(id)?.['@id'] ?? id, 'CadRepresentation needs cadRef = "<CAD document UUID>/<entity ID>" (a CAD Modeler entity; names are display text, not identity).')
    } else if (ref.revision !== undefined && !(Number.isInteger(ref.revision) && ref.revision >= 1)) {
      d(out, 'SYSML-CAD-REFERENCE', s.owner(id)?.['@id'] ?? id, 'CadRepresentation revision must be a CAD document revision number (an integer from 1), or absent to follow the latest revision.')
    }
  }

  // Product element metadata (CR-PM-SYS-1).
  if (t === 'MetadataUsage' && s.featureTypes(id).some((x) => s.qualifiedName(x) === 'EWS::ProductElement')) {
    const v = readMetadataValues(s, id)
    const pid = typeof v.productElementId === 'string' ? v.productElementId : undefined
    if (!pid || !UUID.test(pid)) d(out, 'SYSML-PRODUCT-REFERENCE', s.owner(id)?.['@id'] ?? id, 'ProductElement needs productElementId = "<product element UUID>" (keys and names are display text, not identity).')
    else if (v.revision !== undefined && !(typeof v.revision === 'number' && Number.isInteger(v.revision) && v.revision >= 1)) d(out, 'SYSML-PRODUCT-REFERENCE', s.owner(id)?.['@id'] ?? id, 'ProductElement revision must be an integer from 1, or absent to follow the latest revision.')
  }

  // Constraints that evaluate to false.
  if (t === 'ConstraintUsage' && s.owningMembership(id)?.['@type'] !== 'RequirementConstraintMembership') {
    const res = s.memberships(id).find((m) => m['@type'] === 'ResultExpressionMembership')
    const e = res && refId(res, 'ownedRelatedElement')
    if (e) {
      const v = evaluate(s.model, e)
      if (v.kind === 'boolean' && !v.value) d(out, 'SYSML-CONSTRAINT-FALSE', id, `Constraint ${label()} evaluates to false with the current values.`)
    }
  }
}

function compatible(specific: string, general: string): boolean {
  if (isKindOf(specific, general)) return true
  // Attribute definitions may specialize data types; occurrence kinds may specialize OccurrenceDefinition.
  return false
}

function inCycle(s: Semantics, id: string): boolean {
  const seen = new Set<string>()
  const stack = [...s.generals(id)]
  while (stack.length) {
    const g = stack.pop()!
    if (g === id) return true
    if (seen.has(g)) continue
    seen.add(g)
    stack.push(...s.generals(g))
  }
  return false
}

function lowerBound(s: Semantics, featureId: string): number {
  const range = s.ownedMembers(featureId).find((m) => m['@type'] === 'MultiplicityRange')
  if (!range) return 1
  const first = s.ownedMembers(range['@id'])[0]
  return first?.['@type'] === 'LiteralInteger' ? Number(first.value) : 0
}

/** Metaclasses a usage of the given metaclass may be typed by (for editors and the assistant). */
export function expectedTypeKinds(metaclass: string): string[] | undefined {
  if (metaclass === 'ReferenceUsage') return ['Type']
  return TYPE_KINDS[metaclass] ?? Object.entries(TYPE_KINDS).find(([k]) => isKindOf(metaclass, k))?.[1]
}

/** `<documentUuid>/<entityId>`: a CAD Modeler entity (CR-SYSML-03). */
export const CAD_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^\s/][^\s]*$/i

/** Values of an EWS::CadRepresentation metadata usage (strings and integers only; no evaluation). */
export function readCadMetadata(s: Semantics, metadataId: string): { cadRef?: string; revision?: number; role?: string } {
  const out: { cadRef?: string; revision?: number; role?: string } = {}
  for (const f of s.ownedMembers(metadataId)) {
    const fv = s.ownedRelationships(f['@id']).find((r) => r['@type'] === 'FeatureValue')
    const v = fv ? s.get(refId(fv, 'ownedRelatedElement')) : undefined
    const name = s.name(f['@id'])
    if (!v) continue
    if (name === 'cadRef' && v['@type'] === 'LiteralString') out.cadRef = String(v.value)
    else if (name === 'role' && v['@type'] === 'LiteralString') out.role = String(v.value)
    else if (name === 'revision') out.revision = v['@type'] === 'LiteralInteger' ? Number(v.value) : NaN
  }
  return out
}

/** A CAD Modeler entity reference held by a SysML element (CR-SYSML-03): the platform ArtifactRef shape. */
export interface CadEntityRef {
  module: 'cad'
  kind: 'cad-modeler-entity'
  /** `<documentUuid>/<entityId>` */
  id: string
  /** CAD document revision; absent = follow the latest revision. */
  revision?: number
}

/**
 * CAD representations of SysML elements (all, or of one element): references owned by SysML, never
 * copies of CAD data. Mass properties are read on demand from CAD by the caller, not synchronised.
 */
export function cadRepresentations(model: Model, elementId?: string): { elementId: string; metadataId: string; ref: CadEntityRef; role?: string; valid: boolean }[] {
  const s = semanticsOf(model)
  const out: { elementId: string; metadataId: string; ref: CadEntityRef; role?: string; valid: boolean }[] = []
  const owners = elementId ? [elementId] : [...model.elements()].filter((e) => !model.isLibrary(e['@id'])).map((e) => e['@id'])
  for (const owner of owners) {
    for (const m of s.ownedMembers(owner)) {
      if (m['@type'] !== 'MetadataUsage' || !s.featureTypes(m['@id']).some((x) => s.qualifiedName(x) === 'EWS::CadRepresentation')) continue
      const v = readCadMetadata(s, m['@id'])
      const valid = !!v.cadRef && CAD_REF.test(v.cadRef) && (v.revision === undefined || (Number.isInteger(v.revision) && v.revision >= 1))
      out.push({ elementId: owner, metadataId: m['@id'], ref: { module: 'cad', kind: 'cad-modeler-entity', id: v.cadRef ?? '', ...(v.revision !== undefined && Number.isInteger(v.revision) ? { revision: v.revision } : {}) }, ...(v.role ? { role: v.role } : {}), valid })
    }
  }
  return out
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** String and integer values of a metadata usage (no evaluation). A non-integer `revision` reads as NaN. */
export function readMetadataValues(s: Semantics, metadataId: string): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const f of s.ownedMembers(metadataId)) {
    const fv = s.ownedRelationships(f['@id']).find((r) => r['@type'] === 'FeatureValue')
    const v = fv ? s.get(refId(fv, 'ownedRelatedElement')) : undefined
    const name = s.name(f['@id'])
    if (!v || !name) continue
    if (v['@type'] === 'LiteralString') out[name] = String(v.value)
    else if (v['@type'] === 'LiteralInteger') out[name] = Number(v.value)
    else out[name] = NaN
  }
  return out
}

/** A product element of Project Management's product registry (CR-PM-SYS-1), as an ArtifactRef. */
export interface ProductElementRef {
  module: 'product'
  kind: 'product-element'
  /** Product element UUID. */
  id: string
  revision?: number
}

export interface Representation {
  elementId: string
  metadataId: string
  ref: CadEntityRef | ProductElementRef
  role?: string
  valid: boolean
}

/**
 * Everything a SysML element `represents` (CAD Modeler entities and product elements): references owned
 * by SysML, never copies. All non-library elements, or one element.
 */
export function representations(model: Model, elementId?: string): Representation[] {
  const s = semanticsOf(model)
  const out: Representation[] = []
  const owners = elementId ? [elementId] : [...model.elements()].filter((e) => !model.isLibrary(e['@id'])).map((e) => e['@id'])
  for (const owner of owners) {
    for (const m of s.ownedMembers(owner)) {
      if (m['@type'] !== 'MetadataUsage') continue
      const types = s.featureTypes(m['@id']).map((x) => s.qualifiedName(x))
      if (types.includes('EWS::CadRepresentation')) {
        const v = readCadMetadata(s, m['@id'])
        const valid = !!v.cadRef && CAD_REF.test(v.cadRef) && (v.revision === undefined || (Number.isInteger(v.revision) && v.revision >= 1))
        out.push({ elementId: owner, metadataId: m['@id'], ref: { module: 'cad', kind: 'cad-modeler-entity', id: v.cadRef ?? '', ...(v.revision !== undefined && Number.isInteger(v.revision) ? { revision: v.revision } : {}) }, ...(v.role ? { role: v.role } : {}), valid })
      } else if (types.includes('EWS::ProductElement')) {
        const v = readMetadataValues(s, m['@id'])
        const pid = typeof v.productElementId === 'string' ? v.productElementId : ''
        const rev = typeof v.revision === 'number' && Number.isInteger(v.revision) ? v.revision : undefined
        const valid = UUID.test(pid) && (v.revision === undefined || (rev !== undefined && rev >= 1))
        out.push({ elementId: owner, metadataId: m['@id'], ref: { module: 'product', kind: 'product-element', id: pid, ...(rev !== undefined ? { revision: rev } : {}) }, valid })
      }
    }
  }
  return out
}

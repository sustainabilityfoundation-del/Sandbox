/**
 * Metamodel registry: the KerML / SysML v2 abstract-syntax metaclasses this core supports, with
 * their supertypes, stored (non-derived) attributes and reference properties. Names follow the OMG
 * specifications and the Systems Modeling API JSON serialization. This registry is the single source
 * for JSON (de)serialization, kind checks, command schemas and the conformance list.
 *
 * It is a SUBSET. Metaclasses not listed here are preserved opaquely when imported (see json.ts).
 */

export type AttrType = 'string' | 'boolean' | 'number' | 'direction' | 'visibility' | 'enum'

export interface AttrDef {
  type: AttrType
  /** For 'enum'. */
  values?: readonly string[]
  /** Value assumed when the attribute is absent. */
  default?: unknown
}

export interface RefDef {
  many?: boolean
}

export interface MetaclassDef {
  name: string
  supers: readonly string[]
  abstract?: boolean
  attrs?: Readonly<Record<string, AttrDef>>
  refs?: Readonly<Record<string, RefDef>>
  /** For relationships: which reference properties are the API `source` and `target`. */
  source?: string
  target?: string
  /** Specification layer, for documentation. */
  layer: 'KerML Root' | 'KerML Core' | 'KerML Kernel' | 'SysML'
}

const many = { many: true } as const
const one = {} as const

const DEFS: MetaclassDef[] = [
  // ---- KerML Root ---------------------------------------------------------------------------
  { name: 'Element', supers: [], abstract: true, layer: 'KerML Root', attrs: { declaredName: { type: 'string' }, declaredShortName: { type: 'string' }, isImpliedIncluded: { type: 'boolean', default: false } }, refs: { owningRelationship: one, ownedRelationship: many } },
  { name: 'Relationship', supers: ['Element'], abstract: true, layer: 'KerML Root', attrs: { isImplied: { type: 'boolean', default: false } }, refs: { ownedRelatedElement: many, owningRelatedElement: one } },
  { name: 'Namespace', supers: ['Element'], layer: 'KerML Root' },
  { name: 'Membership', supers: ['Relationship'], layer: 'KerML Root', attrs: { memberName: { type: 'string' }, memberShortName: { type: 'string' }, visibility: { type: 'visibility', default: 'public' } }, refs: { memberElement: one }, source: 'membershipOwningNamespace', target: 'memberElement' },
  { name: 'OwningMembership', supers: ['Membership'], layer: 'KerML Root' },
  { name: 'Import', supers: ['Relationship'], abstract: true, layer: 'KerML Root', attrs: { visibility: { type: 'visibility', default: 'private' }, isRecursive: { type: 'boolean', default: false }, isImportAll: { type: 'boolean', default: false } } },
  { name: 'NamespaceImport', supers: ['Import'], layer: 'KerML Root', refs: { importedNamespace: one }, target: 'importedNamespace' },
  { name: 'MembershipImport', supers: ['Import'], layer: 'KerML Root', refs: { importedMembership: one }, target: 'importedMembership' },
  { name: 'Annotation', supers: ['Relationship'], layer: 'KerML Root', refs: { annotatedElement: one }, target: 'annotatedElement' },
  { name: 'Comment', supers: ['Element'], layer: 'KerML Root', attrs: { body: { type: 'string' }, locale: { type: 'string' } } },
  { name: 'Documentation', supers: ['Comment'], layer: 'KerML Root' },
  { name: 'Dependency', supers: ['Relationship'], layer: 'KerML Root', refs: { client: many, supplier: many }, source: 'client', target: 'supplier' },

  // ---- KerML Core ---------------------------------------------------------------------------
  { name: 'Type', supers: ['Namespace'], layer: 'KerML Core', attrs: { isAbstract: { type: 'boolean', default: false }, isSufficient: { type: 'boolean', default: false } } },
  { name: 'Classifier', supers: ['Type'], layer: 'KerML Core' },
  {
    name: 'Feature', supers: ['Type'], layer: 'KerML Core',
    attrs: { direction: { type: 'direction' }, isComposite: { type: 'boolean', default: false }, isEnd: { type: 'boolean', default: false }, isDerived: { type: 'boolean', default: false }, isConstant: { type: 'boolean', default: false }, isOrdered: { type: 'boolean', default: false }, isUnique: { type: 'boolean', default: true }, isPortion: { type: 'boolean', default: false }, isVariable: { type: 'boolean', default: false } },
  },
  { name: 'Specialization', supers: ['Relationship'], layer: 'KerML Core', refs: { general: one, specific: one }, source: 'specific', target: 'general' },
  { name: 'Subclassification', supers: ['Specialization'], layer: 'KerML Core', refs: { superclassifier: one, subclassifier: one }, source: 'subclassifier', target: 'superclassifier' },
  { name: 'FeatureTyping', supers: ['Specialization'], layer: 'KerML Core', refs: { type: one, typedFeature: one }, source: 'typedFeature', target: 'type' },
  { name: 'Subsetting', supers: ['Specialization'], layer: 'KerML Core', refs: { subsettedFeature: one, subsettingFeature: one }, source: 'subsettingFeature', target: 'subsettedFeature' },
  { name: 'Redefinition', supers: ['Subsetting'], layer: 'KerML Core', refs: { redefinedFeature: one, redefiningFeature: one }, source: 'redefiningFeature', target: 'redefinedFeature' },
  { name: 'ReferenceSubsetting', supers: ['Subsetting'], layer: 'KerML Core', refs: { referencedFeature: one, referencingFeature: one }, source: 'referencingFeature', target: 'referencedFeature' },
  { name: 'Conjugation', supers: ['Relationship'], layer: 'KerML Core', refs: { originalType: one, conjugatedType: one }, source: 'conjugatedType', target: 'originalType' },
  { name: 'FeatureChaining', supers: ['Relationship'], layer: 'KerML Core', refs: { chainingFeature: one }, target: 'chainingFeature' },
  { name: 'FeatureMembership', supers: ['OwningMembership'], layer: 'KerML Core' },
  { name: 'EndFeatureMembership', supers: ['FeatureMembership'], layer: 'KerML Core' },
  { name: 'ParameterMembership', supers: ['FeatureMembership'], layer: 'KerML Kernel' },
  { name: 'ReturnParameterMembership', supers: ['ParameterMembership'], layer: 'KerML Kernel' },
  { name: 'ResultExpressionMembership', supers: ['FeatureMembership'], layer: 'KerML Kernel' },
  { name: 'FeatureValue', supers: ['OwningMembership'], layer: 'KerML Kernel', attrs: { isDefault: { type: 'boolean', default: false }, isInitial: { type: 'boolean', default: false } } },
  { name: 'Multiplicity', supers: ['Feature'], layer: 'KerML Core' },

  // ---- KerML Kernel -------------------------------------------------------------------------
  { name: 'MultiplicityRange', supers: ['Multiplicity'], layer: 'KerML Kernel' },
  { name: 'Class', supers: ['Classifier'], layer: 'KerML Kernel' },
  { name: 'DataType', supers: ['Classifier'], layer: 'KerML Kernel' },
  { name: 'Structure', supers: ['Class'], layer: 'KerML Kernel' },
  { name: 'Association', supers: ['Classifier', 'Relationship'], layer: 'KerML Kernel' },
  { name: 'AssociationStructure', supers: ['Association', 'Structure'], layer: 'KerML Kernel' },
  { name: 'Behavior', supers: ['Class'], layer: 'KerML Kernel' },
  { name: 'Function', supers: ['Behavior'], layer: 'KerML Kernel' },
  { name: 'Predicate', supers: ['Function'], layer: 'KerML Kernel' },
  { name: 'Step', supers: ['Feature'], layer: 'KerML Kernel' },
  { name: 'Expression', supers: ['Step'], layer: 'KerML Kernel' },
  { name: 'BooleanExpression', supers: ['Expression'], layer: 'KerML Kernel' },
  { name: 'Invariant', supers: ['BooleanExpression'], layer: 'KerML Kernel', attrs: { isNegated: { type: 'boolean', default: false } } },
  { name: 'LiteralExpression', supers: ['Expression'], abstract: true, layer: 'KerML Kernel' },
  { name: 'LiteralInteger', supers: ['LiteralExpression'], layer: 'KerML Kernel', attrs: { value: { type: 'number' } } },
  { name: 'LiteralRational', supers: ['LiteralExpression'], layer: 'KerML Kernel', attrs: { value: { type: 'number' } } },
  { name: 'LiteralString', supers: ['LiteralExpression'], layer: 'KerML Kernel', attrs: { value: { type: 'string' } } },
  { name: 'LiteralBoolean', supers: ['LiteralExpression'], layer: 'KerML Kernel', attrs: { value: { type: 'boolean' } } },
  { name: 'LiteralInfinity', supers: ['LiteralExpression'], layer: 'KerML Kernel' },
  { name: 'NullExpression', supers: ['Expression'], layer: 'KerML Kernel' },
  { name: 'FeatureReferenceExpression', supers: ['Expression'], layer: 'KerML Kernel' },
  { name: 'InvocationExpression', supers: ['Expression'], layer: 'KerML Kernel' },
  { name: 'OperatorExpression', supers: ['InvocationExpression'], layer: 'KerML Kernel', attrs: { operator: { type: 'string' } } },
  { name: 'Connector', supers: ['Feature', 'Relationship'], layer: 'KerML Kernel' },
  { name: 'BindingConnector', supers: ['Connector'], layer: 'KerML Kernel' },
  { name: 'Succession', supers: ['Connector'], layer: 'KerML Kernel' },
  { name: 'Package', supers: ['Namespace'], layer: 'KerML Kernel' },
  { name: 'LibraryPackage', supers: ['Package'], layer: 'KerML Kernel', attrs: { isStandard: { type: 'boolean', default: false } } },
  { name: 'Metaclass', supers: ['Structure'], layer: 'KerML Kernel' },
  { name: 'MetadataFeature', supers: ['Feature', 'Annotation'], layer: 'KerML Kernel' },

  // ---- SysML ----------------------------------------------------------------------------------
  { name: 'Definition', supers: ['Classifier'], layer: 'SysML', attrs: { isVariation: { type: 'boolean', default: false } } },
  { name: 'Usage', supers: ['Feature'], layer: 'SysML', attrs: { isVariation: { type: 'boolean', default: false } } },
  { name: 'ReferenceUsage', supers: ['Usage'], layer: 'SysML' },
  { name: 'AttributeDefinition', supers: ['Definition', 'DataType'], layer: 'SysML' },
  { name: 'AttributeUsage', supers: ['Usage'], layer: 'SysML' },
  { name: 'EnumerationDefinition', supers: ['AttributeDefinition'], layer: 'SysML' },
  { name: 'EnumerationUsage', supers: ['AttributeUsage'], layer: 'SysML' },
  { name: 'VariantMembership', supers: ['OwningMembership'], layer: 'SysML' },
  { name: 'OccurrenceDefinition', supers: ['Definition', 'Class'], layer: 'SysML' },
  { name: 'OccurrenceUsage', supers: ['Usage'], layer: 'SysML' },
  { name: 'ItemDefinition', supers: ['OccurrenceDefinition', 'Structure'], layer: 'SysML' },
  { name: 'ItemUsage', supers: ['OccurrenceUsage'], layer: 'SysML' },
  { name: 'PartDefinition', supers: ['ItemDefinition'], layer: 'SysML' },
  { name: 'PartUsage', supers: ['ItemUsage'], layer: 'SysML' },
  { name: 'PortDefinition', supers: ['OccurrenceDefinition', 'Structure'], layer: 'SysML' },
  { name: 'ConjugatedPortDefinition', supers: ['PortDefinition'], layer: 'SysML' },
  { name: 'PortConjugation', supers: ['Conjugation'], layer: 'SysML', refs: { originalPortDefinition: one }, target: 'originalPortDefinition' },
  { name: 'PortUsage', supers: ['OccurrenceUsage'], layer: 'SysML' },
  { name: 'ConjugatedPortTyping', supers: ['FeatureTyping'], layer: 'SysML', refs: { conjugatedPortDefinition: one } },
  { name: 'ConnectionDefinition', supers: ['PartDefinition', 'AssociationStructure'], layer: 'SysML' },
  { name: 'ConnectorAsUsage', supers: ['Usage', 'Connector'], abstract: true, layer: 'SysML' },
  { name: 'ConnectionUsage', supers: ['ConnectorAsUsage', 'PartUsage'], layer: 'SysML' },
  { name: 'InterfaceDefinition', supers: ['ConnectionDefinition'], layer: 'SysML' },
  { name: 'InterfaceUsage', supers: ['ConnectionUsage'], layer: 'SysML' },
  { name: 'BindingConnectorAsUsage', supers: ['ConnectorAsUsage', 'BindingConnector'], layer: 'SysML' },
  { name: 'SuccessionAsUsage', supers: ['ConnectorAsUsage', 'Succession'], layer: 'SysML' },
  { name: 'AllocationDefinition', supers: ['ConnectionDefinition'], layer: 'SysML' },
  { name: 'AllocationUsage', supers: ['ConnectionUsage'], layer: 'SysML' },
  { name: 'ActionDefinition', supers: ['OccurrenceDefinition', 'Behavior'], layer: 'SysML' },
  { name: 'ActionUsage', supers: ['OccurrenceUsage', 'Step'], layer: 'SysML' },
  { name: 'FlowDefinition', supers: ['ActionDefinition', 'Association'], layer: 'SysML' },
  { name: 'FlowUsage', supers: ['ConnectorAsUsage', 'ActionUsage'], layer: 'SysML' },
  { name: 'PayloadFeature', supers: ['Feature'], layer: 'KerML Kernel' },
  { name: 'AcceptActionUsage', supers: ['ActionUsage'], layer: 'SysML' },
  { name: 'StateDefinition', supers: ['ActionDefinition'], layer: 'SysML', attrs: { isParallel: { type: 'boolean', default: false } } },
  { name: 'StateUsage', supers: ['ActionUsage'], layer: 'SysML', attrs: { isParallel: { type: 'boolean', default: false } } },
  { name: 'StateSubactionMembership', supers: ['FeatureMembership'], layer: 'SysML', attrs: { kind: { type: 'enum', values: ['entry', 'do', 'exit'] } } },
  { name: 'TransitionUsage', supers: ['ActionUsage'], layer: 'SysML' },
  { name: 'TransitionFeatureMembership', supers: ['FeatureMembership'], layer: 'SysML', attrs: { kind: { type: 'enum', values: ['trigger', 'guard', 'effect'] } } },
  { name: 'ConstraintDefinition', supers: ['OccurrenceDefinition', 'Predicate'], layer: 'SysML' },
  { name: 'ConstraintUsage', supers: ['OccurrenceUsage', 'BooleanExpression'], layer: 'SysML' },
  { name: 'RequirementDefinition', supers: ['ConstraintDefinition'], layer: 'SysML' },
  { name: 'RequirementUsage', supers: ['ConstraintUsage'], layer: 'SysML' },
  { name: 'SatisfyRequirementUsage', supers: ['RequirementUsage'], layer: 'SysML', attrs: { isNegated: { type: 'boolean', default: false } } },
  { name: 'SubjectMembership', supers: ['ParameterMembership'], layer: 'SysML' },
  { name: 'RequirementConstraintMembership', supers: ['FeatureMembership'], layer: 'SysML', attrs: { kind: { type: 'enum', values: ['assumption', 'requirement'], default: 'requirement' } } },
  { name: 'CalculationDefinition', supers: ['ActionDefinition', 'Function'], layer: 'SysML' },
  { name: 'CalculationUsage', supers: ['ActionUsage', 'Expression'], layer: 'SysML' },
  { name: 'MetadataDefinition', supers: ['ItemDefinition', 'Metaclass'], layer: 'SysML' },
  { name: 'MetadataUsage', supers: ['ItemUsage', 'MetadataFeature'], layer: 'SysML' },
]

export const METACLASSES: ReadonlyMap<string, MetaclassDef> = new Map(DEFS.map((d) => [d.name, d]))

const ancestry = new Map<string, Set<string>>()

/** All supertypes of a metaclass, including itself. Unknown names yield only themselves. */
export function supertypesOf(name: string): Set<string> {
  let set = ancestry.get(name)
  if (set) return set
  set = new Set([name])
  for (const s of METACLASSES.get(name)?.supers ?? []) for (const a of supertypesOf(s)) set.add(a)
  ancestry.set(name, set)
  return set
}

/** True if `metaclass` is `kind` or a (transitive) specialization of it. */
export function isKindOf(metaclass: string, kind: string): boolean {
  return supertypesOf(metaclass).has(kind)
}

export function isKnownMetaclass(name: string): boolean {
  return METACLASSES.has(name)
}

/** Stored attributes of a metaclass, including inherited ones. */
export function attributesOf(name: string): Record<string, AttrDef> {
  const out: Record<string, AttrDef> = {}
  for (const s of [...supertypesOf(name)].reverse()) Object.assign(out, METACLASSES.get(s)?.attrs ?? {})
  return out
}

/** Stored reference properties of a metaclass, including inherited ones. */
export function referencesOf(name: string): Record<string, RefDef> {
  const out: Record<string, RefDef> = {}
  for (const s of supertypesOf(name)) Object.assign(out, METACLASSES.get(s)?.refs ?? {})
  return out
}

const refCache = new Map<string, Record<string, RefDef>>()
export function referencesOfCached(name: string): Record<string, RefDef> {
  let r = refCache.get(name)
  if (!r) refCache.set(name, (r = referencesOf(name)))
  return r
}

/** The reference property holding the API `target` of a relationship metaclass (most specific wins). */
export function targetPropertyOf(name: string): string | undefined {
  const chain = [name, ...[...supertypesOf(name)].filter((s) => s !== name)]
  for (const s of chain) {
    const t = METACLASSES.get(s)?.target
    if (t) return t
  }
  return undefined
}

export function sourcePropertyOf(name: string): string | undefined {
  const chain = [name, ...[...supertypesOf(name)].filter((s) => s !== name)]
  for (const s of chain) {
    const t = METACLASSES.get(s)?.source
    if (t) return t
  }
  return undefined
}

export function allMetaclasses(): MetaclassDef[] {
  return DEFS
}

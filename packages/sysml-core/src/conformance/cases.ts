/**
 * Conformance corpus of the supported textual-notation subset (docs/modules/sysml/conformance.md).
 * Each case is a construct with a minimal text, the metaclasses it must produce, and whether it is
 * supported. Unsupported cases must be reported as SYSML-SYNTAX-UNSUPPORTED (never silently lost).
 * The texts are ours (written for these tests), not copied from OMG examples.
 */
export interface ConformanceCase {
  id: string
  construct: string
  text: string
  supported: boolean
  /** Metaclasses that must appear in the built model. */
  produces?: string[]
}

const P = (body: string) => `package P {\n    private import ScalarValues::*;\n    private import ISQ::*;\n    private import SI::*;\n${body}\n}`

export const CONFORMANCE_CASES: ConformanceCase[] = [
  { id: 'pkg', construct: 'package, nested package', supported: true, text: 'package A { package B; }', produces: ['Package', 'OwningMembership'] },
  { id: 'lib-pkg', construct: 'library package', supported: true, text: 'library package L { part def X; }', produces: ['LibraryPackage'] },
  { id: 'import-ns', construct: 'namespace import (::*)', supported: true, text: 'package A { part def X; } package B { import A::*; part x : X; }', produces: ['NamespaceImport', 'FeatureTyping'] },
  { id: 'import-member', construct: 'membership import', supported: true, text: 'package A { part def X; } package B { import A::X; part x : X; }', produces: ['MembershipImport'] },
  { id: 'import-recursive', construct: 'recursive import (::**)', supported: true, text: 'package A { package N { part def X; } } package B { import A::**; part x : X; }', produces: ['MembershipImport'] },
  { id: 'visibility', construct: 'public / private / protected members', supported: true, text: 'package A { private part def X; public part def Y; protected part def Z; }', produces: ['PartDefinition'] },
  { id: 'alias', construct: 'alias', supported: true, text: 'package A { part def X; alias Y for X; part y : Y; }', produces: ['Membership'] },
  { id: 'doc', construct: 'doc comment', supported: true, text: 'package A { doc /* About A. */ }', produces: ['Documentation'] },
  { id: 'comment-about', construct: 'comment … about', supported: true, text: 'package A { part def X; comment c about X /* Note on X. */ }', produces: ['Comment', 'Annotation'] },
  { id: 'comment-bare', construct: 'bare /* comment */', supported: true, text: 'package A { /* Free comment. */ }', produces: ['Comment'] },
  { id: 'short-name', construct: 'short name <…>, unrestricted names', supported: true, text: "package A { part def <'P-1'> 'Power unit'; }", produces: ['PartDefinition'] },
  { id: 'part-def', construct: 'part def with specialization (:>)', supported: true, text: 'package A { abstract part def V; part def Car :> V; }', produces: ['PartDefinition', 'Subclassification'] },
  { id: 'part-usage', construct: 'part usage with typing and multiplicity', supported: true, text: 'package A { part def W; part def Car { part wheels : W[4]; part spare : W[0..1]; } }', produces: ['PartUsage', 'FeatureMembership', 'MultiplicityRange', 'LiteralInteger'] },
  { id: 'ref-part', construct: 'ref part (non-composite)', supported: true, text: 'package A { part def W; part def Car { ref part driver : W; } }', produces: ['PartUsage'] },
  { id: 'attribute', construct: 'attribute def / usage with value', supported: true, text: P('    attribute def Rating :> Real;\n    part def M { attribute r : Rating = 3.5; attribute n : Integer default = 2; }'), produces: ['AttributeDefinition', 'AttributeUsage', 'FeatureValue', 'LiteralRational'] },
  { id: 'quantity', construct: 'quantity values with units', supported: true, text: P('    part def M { attribute m : MassValue = 12.5 [kg]; attribute v : SpeedValue = 3 [m/s]; }'), produces: ['OperatorExpression', 'FeatureReferenceExpression'] },
  { id: 'enum', construct: 'enum def with literals', supported: true, text: 'package A { enum def Mode { enum off; enum on; } enum def Color { red; green; } }', produces: ['EnumerationDefinition', 'EnumerationUsage', 'VariantMembership'] },
  { id: 'item', construct: 'item def / usage', supported: true, text: 'package A { item def Fuel; part def Tank { item fuel : Fuel; } }', produces: ['ItemDefinition', 'ItemUsage'] },
  { id: 'port', construct: 'port def, directed items, conjugated typing (~)', supported: true, text: 'package A { item def F; port def FP { out item f : F; } part def E { port fin : ~FP; port fout : FP; } }', produces: ['PortDefinition', 'PortUsage', 'ConjugatedPortDefinition', 'ConjugatedPortTyping', 'PortConjugation'] },
  { id: 'subsets-redefines', construct: 'subsetting (:>), redefinition (:>>), references (::>)', supported: true, text: 'package A { part def W; part def Car { part wheels : W[4]; part front :> wheels[2]; } part def Racer :> Car { part :>> wheels[4]; ref part w ::> wheels; } }', produces: ['Subsetting', 'Redefinition', 'ReferenceSubsetting'] },
  { id: 'connection', construct: 'connect … to … with feature chains', supported: true, text: 'package A { port def P; part def E { port p : P; } part def S { part a : E; part b : E; connect a.p to b.p; connection c connect a to b; } }', produces: ['ConnectionUsage', 'EndFeatureMembership', 'FeatureChaining'] },
  { id: 'interface', construct: 'interface def with ends, interface usage', supported: true, text: 'package A { port def P; interface def I { end x : P; end y : ~P; } part def E { port p : P; port q : ~P; } part def S { part a : E; part b : E; interface i : I connect a.p to b.q; } }', produces: ['InterfaceDefinition', 'InterfaceUsage'] },
  { id: 'flow', construct: 'flow of … from … to …', supported: true, text: 'package A { item def F; port def P { out item f : F; } part def E { port p : P; } part def S { part a : E; part b : E; flow of F from a.p to b.p; } }', produces: ['FlowUsage', 'PayloadFeature'] },
  { id: 'binding', construct: 'bind … = …', supported: true, text: 'package A { part def S { attribute x : ScalarValues::Real; attribute y : ScalarValues::Real; bind x = y; } }', produces: ['BindingConnectorAsUsage'] },
  { id: 'action', construct: 'action def with parameters, successions', supported: true, text: 'package A { item def D; action def Run { in d : D; out r : D; action a; action b; first a then b; } }', produces: ['ActionDefinition', 'ActionUsage', 'ParameterMembership', 'SuccessionAsUsage'] },
  { id: 'state', construct: 'state def, states, transitions with accept', supported: true, text: 'package A { item def Go; state def M { state off; state on; transition t first off accept Go then on; } }', produces: ['StateDefinition', 'StateUsage', 'TransitionUsage', 'AcceptActionUsage', 'TransitionFeatureMembership'] },
  { id: 'entry', construct: 'entry / do / exit actions', supported: true, text: 'package A { state def M { entry action init; do action run; exit; } }', produces: ['StateSubactionMembership'] },
  { id: 'requirement', construct: 'requirement def with subject and require constraint', supported: true, text: P('    part def V { attribute m : MassValue = 900 [kg]; }\n    requirement def <\'R1\'> Light { subject v : V; require constraint { v.m <= 1000 [kg] } }\n    requirement r : Light;'), produces: ['RequirementDefinition', 'RequirementUsage', 'SubjectMembership', 'RequirementConstraintMembership', 'ConstraintUsage', 'ResultExpressionMembership'] },
  { id: 'assume', construct: 'assume constraint', supported: true, text: P('    requirement def R { attribute t : Real; assume constraint { t > 0 } }'), produces: ['RequirementConstraintMembership'] },
  { id: 'satisfy', construct: 'satisfy … by …', supported: true, text: 'package A { part def V; requirement def R { subject v : V; } requirement r : R; part v : V; satisfy r by v; }', produces: ['SatisfyRequirementUsage'] },
  { id: 'allocate', construct: 'allocate … to …', supported: true, text: 'package A { action def F; part def C; action f : F; part c : C; allocate f to c; }', produces: ['AllocationUsage'] },
  { id: 'constraint', construct: 'constraint def / usage with expression body', supported: true, text: P('    constraint def Positive { in x : Real; x > 0 }\n    part def S { attribute v : Real = 2; constraint c : Positive { :>> x = v; } }'), produces: ['ConstraintDefinition', 'ConstraintUsage'] },
  { id: 'calc', construct: 'calc def with return and result expression', supported: true, text: P('    calc def Power { in u : Real; in i : Real; return p : Real; u * i }'), produces: ['CalculationDefinition', 'ReturnParameterMembership'] },
  { id: 'expressions', construct: 'expressions: arithmetic, comparison, boolean, conditional, invocation', supported: true, text: P('    calc def F { in x : Real; return : Real; }\n    part def S { attribute a : Real = 2 ** 3 + 4 * (5 - 1) / 2; attribute b : Boolean = a > 3 and not (a == 4) or false; attribute c : Real = if a > 1 ? 1.5 else -2.0; attribute d : Real = F(a); attribute s : String = "x"; }'), produces: ['OperatorExpression', 'InvocationExpression', 'LiteralBoolean', 'LiteralString'] },
  { id: 'metadata', construct: 'metadata usage @T { … }', supported: true, text: "package A { part def X { @EWS::ManagedRequirement { requirementId = \"5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001\"; revision = 2; } } }", produces: ['MetadataUsage'] },
  { id: 'metadata-def', construct: 'metadata def', supported: true, text: 'package A { metadata def Safety { attribute level : ScalarValues::Integer; } }', produces: ['MetadataDefinition'] },
  { id: 'occurrence', construct: 'occurrence def / usage', supported: true, text: 'package A { occurrence def Event; occurrence e : Event; }', produces: ['OccurrenceDefinition', 'OccurrenceUsage'] },
  { id: 'allocation-def', construct: 'allocation def, connection def', supported: true, text: 'package A { allocation def Deploy; connection def Link; }', produces: ['AllocationDefinition', 'ConnectionDefinition'] },
  { id: 'notes', construct: '// and //* notes (ignored)', supported: true, text: 'package A { // note\n //* block\n note */ part def X; }', produces: ['PartDefinition'] },
  // ---- not supported yet (reported explicitly) ----
  { id: 'use-case', construct: 'use case def / use case', supported: false, text: 'package A { use case def Drive; }' },
  { id: 'verification', construct: 'verification def / verify', supported: false, text: 'package A { verification def T; }' },
  { id: 'analysis', construct: 'analysis def', supported: false, text: 'package A { analysis def T; }' },
  { id: 'view', construct: 'view / viewpoint / render / expose', supported: false, text: 'package A { view def V; }' },
  { id: 'concern', construct: 'concern def, stakeholder, frame', supported: false, text: 'package A { concern def C; }' },
  { id: 'perform-exhibit', construct: 'perform action / exhibit state', supported: false, text: 'package A { part def P { perform action a; } }' },
  { id: 'send', construct: 'send / message / event occurrences', supported: false, text: 'package A { action def A { send x; } }' },
  { id: 'individual-snapshot', construct: 'individual, snapshot, timeslice', supported: false, text: 'package A { individual part def I; }' },
  { id: 'variant', construct: 'variation / variant members', supported: false, text: 'package A { variation part def V { variant part a; } }' },
  { id: 'control-nodes', construct: 'decide, merge, fork, join, loops', supported: false, text: 'package A { action def A { fork f; } }' },
  { id: 'assert', construct: 'assert constraint, assert satisfy', supported: false, text: 'package A { part def P { assert constraint c; } }' },
  { id: 'dependency', construct: 'dependency', supported: false, text: 'package A { part def X; part def Y; dependency from X to Y; }' },
  { id: 'then-shorthand', construct: '`then` succession shorthand after a member', supported: false, text: 'package A { action def A { action a; then action b; } }' },
]

import { describe, expect, it } from 'vitest'
import { resolveRef } from './commands/commands'
import { relationshipMatrix, requirementCoverage } from './query/matrix'
import { applyChanges, diffModels, invertChanges } from './commands/changes'
import { COMMAND_SCHEMAS } from './commands/schemas'
import { applyTransaction } from './commands/transaction'
import { canonicalForm } from './conformance/canonical'
import { ACTUATOR_EXAMPLE } from './examples/actuator'
import { loadLibrary, platformLibrary } from './library/library'
import { LIBRARY_SOURCES } from './library/text'
import { uuidV5 } from './model/ids'
import type { Model } from './model/model'
import { findElements, impact, incomingReferences } from './query/query'
import { semanticsOf } from './semantics/semantics'
import { parse } from './syntax/parser'
import { serialize } from './syntax/serializer'
import { loadText } from './syntax/text'
import { evaluate, featureValue, formatValue } from './units/evaluate'
import { cadRepresentations, validate } from './validation/validate'

const P = (body: string) => `package P {\n    private import ScalarValues::*;\n    private import ISQ::*;\n    private import SI::*;\n${body}\n}`

function model(text: string): Model {
  const r = loadText(text)
  expect(r.diagnostics).toEqual([])
  return r.model
}

function id(m: Model, qn: string): string {
  const hit = semanticsOf(m).resolveQualified(m.rootId, qn.split('::'))
  if (!hit) throw new Error(`no ${qn}`)
  return hit.element['@id']
}

function rules(m: Model): string[] {
  return validate(m).filter((d) => d.severity !== 'info').map((d) => d.ruleId)
}

describe('model library', () => {
  it('loads without problems, with deterministic name-based IDs (KerML §9.1 scheme)', () => {
    const a = loadLibrary(LIBRARY_SOURCES)
    const b = loadLibrary(LIBRARY_SOURCES)
    expect(a.diagnostics).toEqual([])
    expect([...a.model.elements()].map((e) => e['@id']).sort()).toEqual([...b.model.elements()].map((e) => e['@id']).sort())
    const lib = platformLibrary()
    const s = semanticsOf(lib)
    const pkg = s.ownedMembers(lib.rootId).find((e) => e.declaredName === 'ScalarValues')!
    expect(pkg['@id']).toBe(uuidV5('https://www.omg.org/spec/KerML/ScalarValues', '6ba7b811-9dad-11d1-80b4-00c04fd430c8'))
  })

  it('is read-only for commands', () => {
    const m = model('package A;')
    const r = applyTransaction(m, { commands: [{ op: 'rename', elementId: 'ScalarValues::Real', name: 'Float' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('not-allowed')
  })
})

describe('parser', () => {
  it('reports syntax errors with line and column and recovers at the next member', () => {
    const r = parse('package A {\n    part def X;\n    part p : ;\n    part def Y;\n}')
    expect(r.diagnostics).toHaveLength(1)
    expect(r.diagnostics[0].range.start.line).toBe(3)
    const pkg = r.model.members[0]
    expect(pkg.kind === 'package' && pkg.members.map((m) => ('name' in m ? m.name : undefined))).toEqual(['X', 'Y'])
  })

  it('reports unterminated comments and strings', () => {
    expect(parse('package A { doc /* x ').diagnostics[0].message).toMatch(/Unterminated comment/)
    expect(parse('package A { attribute a = "x; }').diagnostics[0].message).toMatch(/Unterminated string/)
  })

  it('quotes names that are keywords or not basic names when serializing', () => {
    const m = model("package A { part def 'in'; part def 'Power unit'; }")
    expect(serialize(m)).toContain("part def 'in';")
    expect(serialize(m)).toContain("part def 'Power unit';")
  })
})

describe('name resolution', () => {
  it('resolves inherited features, redefinitions and feature chains', () => {
    const m = model(P('    part def Wheel { attribute d : LengthValue = 0.6 [m]; }\n    part def Car { part wheels : Wheel[4]; }\n    part def Racer :> Car { part :>> wheels; attribute wheelSize : LengthValue = wheels.d; }'))
    const s = semanticsOf(m)
    const racer = id(m, 'P::Racer')
    const redef = s.ownedMembers(racer).find((e) => e['@type'] === 'PartUsage')!
    expect(s.name(redef['@id'])).toBe('wheels') // effective name from the redefined feature
    expect(s.featureTypes(redef['@id']).map((t) => s.qualifiedName(t))).toEqual(['P::Wheel'])
    const ws = s.ownedMembers(racer).find((e) => e.declaredName === 'wheelSize')!
    expect(formatValue(featureValue(m, ws['@id']))).toBe('0.6 [m]')
  })

  it('applies visibility: private imports are not re-exported, private members are hidden from outside', () => {
    const r = loadText('package A { part def X; private part def Hidden; } package B { private import A::*; } package C { import B::*; part x : X; part h : A::Hidden; }')
    const messages = r.diagnostics.map((d) => d.message)
    expect(messages).toEqual(['Cannot resolve type “X”.', 'Cannot resolve type “A::Hidden”.'])
    expect(r.diagnostics[0].range?.start.line).toBe(1)
  })

  it('resolves aliases, recursive imports, short names and conjugated port definitions', () => {
    const m = model("package A { package N { port def <'PP'> Power; } alias Pwr for N::Power; } package B { import A::**; part def E { port a : Pwr; port b : ~PP; } }")
    const s = semanticsOf(m)
    const e = id(m, 'B::E')
    const [a, b] = s.ownedMembers(e)
    expect(s.qualifiedName(s.featureTypes(a['@id'])[0])).toBe('A::N::Power')
    expect(m.get(s.featureTypes(b['@id'])[0])!['@type']).toBe('ConjugatedPortDefinition')
  })

  it('reports unresolved chain segments', () => {
    const r = loadText('package A { part def E; part def S { part a : E; part b : E; connect a.nothing to b; } }')
    expect(r.diagnostics.map((d) => d.message)).toEqual(['Cannot resolve “nothing” as a feature of “a”.'])
  })
})

describe('validation rules', () => {
  it('accepts the multidisciplinary example without errors or warnings', () => {
    expect(rules(model(ACTUATOR_EXAMPLE))).toEqual([])
  })
  it('SYSML-TYPING-KIND', () => {
    expect(rules(model('package A { attribute def V; part p : V; }'))).toContain('SYSML-TYPING-KIND')
    expect(rules(model('package A { part def V; part p : V; }'))).toEqual([])
  })
  it('SYSML-SPECIALIZATION-KIND and SYSML-SPECIALIZATION-CYCLE', () => {
    expect(rules(model('package A { attribute def V; part def P :> V; }'))).toContain('SYSML-SPECIALIZATION-KIND')
    expect(rules(model('package A { part def X :> Y; part def Y :> X; }'))).toEqual(['SYSML-SPECIALIZATION-CYCLE', 'SYSML-SPECIALIZATION-CYCLE'])
  })
  it('SYSML-MULTIPLICITY', () => {
    expect(rules(model('package A { part def W; part def C { part w : W[5..2]; } }'))).toContain('SYSML-MULTIPLICITY')
  })
  it('SYSML-DUPLICATE-NAME', () => {
    expect(rules(model('package A { part def X; part def X; }'))).toContain('SYSML-DUPLICATE-NAME')
  })
  it('SYSML-REDEFINITION-TARGET', () => {
    const m = model('package A { part def W; part def C { part w : W; } part def D { part x : W; } part def E :> D { part :>> C::w; } }')
    expect(rules(m)).toContain('SYSML-REDEFINITION-TARGET')
  })
  it('SYSML-UNIT-DIMENSION and SYSML-UNIT-MISSING', () => {
    expect(rules(model(P('    part def M { attribute mass : MassValue = 3 [m]; }')))).toEqual(['SYSML-UNIT-DIMENSION'])
    expect(rules(model(P('    part def M { attribute mass : MassValue = 3; }')))).toEqual(['SYSML-UNIT-MISSING'])
    expect(rules(model(P('    part def M { attribute v : SpeedValue = 3 [m/s]; attribute a : AccelerationValue = 9.81 [m/s^2]; }')))).toEqual([])
  })
  it('SYSML-SATISFY-TARGET', () => {
    expect(rules(model('package A { part def V; part v : V; satisfy v by v; }'))).toContain('SYSML-SATISFY-TARGET')
  })
  it('SYSML-COMPOSITION-CYCLE', () => {
    expect(rules(model('package A { part def Node { part child : Node; } }'))).toContain('SYSML-COMPOSITION-CYCLE')
    expect(rules(model('package A { part def Node { part child : Node[0..1]; } }'))).toEqual([])
  })
  it('SYSML-MANAGED-REQUIREMENT', () => {
    expect(rules(model('package A { requirement def R { @EWS::ManagedRequirement { requirementId = "REQ-001"; } } }'))).toEqual(['SYSML-MANAGED-REQUIREMENT'])
  })
  it('SYSML-CAD-REFERENCE and CAD representation refs (CR-SYSML-03)', () => {
    expect(rules(model('package A { part def R { @EWS::CadRepresentation { cadRef = "CAD-120"; } } }'))).toEqual(['SYSML-CAD-REFERENCE'])
    expect(rules(model('package A { part def R { @EWS::CadRepresentation { cadRef = "0e7c2c1a-4b7d-4f7e-9a51-2f3c6c1d9a10/e12"; revision = 0; } } }'))).toEqual(['SYSML-CAD-REFERENCE'])
    const m = model('package A { part def R { @EWS::CadRepresentation { cadRef = "0e7c2c1a-4b7d-4f7e-9a51-2f3c6c1d9a10/e12"; revision = 4; role = "part"; } } part def S; }')
    expect(rules(m)).toEqual([])
    expect(cadRepresentations(m)).toEqual([{ elementId: id(m, 'A::R'), metadataId: expect.any(String), ref: { module: 'cad', kind: 'cad-modeler-entity', id: '0e7c2c1a-4b7d-4f7e-9a51-2f3c6c1d9a10/e12', revision: 4 }, role: 'part', valid: true }])
    expect(cadRepresentations(m, id(m, 'A::S'))).toEqual([])
  })
  it('SYSML-CONSTRAINT-FALSE', () => {
    expect(rules(model(P('    part def S { attribute x : Real = 2; constraint { x > 3 } }')))).toEqual(['SYSML-CONSTRAINT-FALSE'])
  })
})

describe('units and evaluation', () => {
  it('evaluates quantities in SI base units with dimensions', () => {
    const m = model(P('    part def S { attribute a : LengthValue = 320 [mm]; attribute b : LengthValue = 0.15 [m]; attribute c : Real = 2 ** 3 + 1; }'))
    const s = semanticsOf(m)
    const [a, b, c] = s.ownedMembers(id(m, 'P::S'))
    const va = featureValue(m, a['@id'])
    expect(va.kind === 'number' && va.value).toBeCloseTo(0.32)
    expect(formatValue(va)).toBe('320 [mm]')
    expect(featureValue(m, b['@id'])).toMatchObject({ kind: 'number', value: 0.15 })
    expect(featureValue(m, c['@id'])).toMatchObject({ kind: 'number', value: 9 })
    const fv = s.ownedRelationships(a['@id']).find((r) => r['@type'] === 'FeatureValue')!
    expect(evaluate(m, (fv.ownedRelatedElement as string[])[0]).kind).toBe('number')
  })
})

describe('commands and transactions', () => {
  const base = () => model(P('    part def Motor { attribute mass : MassValue = 0.6 [kg]; }\n    part def Drive { part motor : Motor; }'))

  it('creates elements with typing, multiplicity and value; placeholders link later commands; the base is unchanged', () => {
    const m = base()
    const before = canonicalForm(m)
    const r = applyTransaction(m, {
      commands: [
        { op: 'createElement', ownerId: 'P', kind: 'PartDefinition', name: 'Battery', ref: '$bat' },
        { op: 'createElement', ownerId: '$bat', kind: 'AttributeUsage', name: 'capacity', typeIds: ['ISQ::ElectricChargeValue'], value: '7200 [C]' },
        { op: 'createElement', ownerId: 'P::Drive', kind: 'PartUsage', name: 'battery', typeIds: ['$bat'], multiplicity: { lower: 1, upper: 2 } },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(canonicalForm(m)).toEqual(before)
    expect(serialize(r.model)).toContain('part battery : Battery[1..2];')
    expect(serialize(r.model)).toContain('attribute capacity : ElectricChargeValue = 7200 [C];')
    expect(r.summaryText).toBe('Created P::Battery, P::Drive::battery')
    expect(r.diagnostics.introduced).toEqual([])
    expect(r.createdIds.$bat).toBeDefined()
  })

  it('is atomic: a failing command leaves nothing applied and names the command', () => {
    const m = base()
    const r = applyTransaction(m, { commands: [{ op: 'createElement', ownerId: 'P', kind: 'PartDefinition', name: 'X' }, { op: 'setTyping', elementId: 'P::Drive::motor', typeIds: ['P::Nope'] }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatchObject({ code: 'not-found', commandIndex: 1 })
    expect(findElements(m, { text: 'X', metaclass: 'PartDefinition' }).filter((e) => e.name === 'X')).toEqual([])
  })

  it('rejects unknown commands and properties (schema check)', () => {
    const m = base()
    const r = applyTransaction(m, { commands: [{ op: 'rename', elementId: 'P::Motor', name: 'M', colour: 'red' } as never] })
    expect(r.ok).toBe(false)
    expect(COMMAND_SCHEMAS.map((c) => c.op)).toContain('applyText')
  })

  it('renames without changing identity; references follow', () => {
    const m = base()
    const motor = id(m, 'P::Motor')
    const r = applyTransaction(m, { commands: [{ op: 'rename', elementId: motor, name: 'BrushlessMotor' }] })
    expect(r.ok && id(r.model, 'P::BrushlessMotor')).toBe(motor)
    expect(r.ok && serialize(r.model)).toContain('part motor : BrushlessMotor;')
  })

  it('refuses to delete referenced elements unless asked to remove the references', () => {
    const m = base()
    const refused = applyTransaction(m, { commands: [{ op: 'deleteElement', elementId: 'P::Motor' }] })
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.error.message).toMatch(/still referenced by P::Drive::motor/)
    const forced = applyTransaction(m, { commands: [{ op: 'deleteElement', elementId: 'P::Motor', removeReferences: true }] })
    expect(forced.ok).toBe(true)
    if (forced.ok) {
      expect(serialize(forced.model)).toContain('part motor;')
      expect(validate(forced.model).filter((d) => d.ruleId === 'SYSML-REF-DANGLING')).toEqual([])
    }
  })

  it('connects feature chains, satisfies requirements, moves and documents elements', () => {
    const m = model(P('    port def PP;\n    part def E { port p : PP; }\n    part def S { part a : E; part b : E; }\n    requirement def R { subject s : S; }\n    requirement r : R;\n    package Sub;'))
    const r = applyTransaction(m, {
      commands: [
        { op: 'connect', ownerId: 'P::S', kind: 'interface', source: 'a.p', target: 'b.p', name: 'link' },
        { op: 'createElement', ownerId: 'P', kind: 'PartUsage', name: 'sys', typeIds: ['P::S'] },
        { op: 'satisfy', ownerId: 'P', requirementId: 'P::r', by: 'sys' },
        { op: 'setDocumentation', elementId: 'P::S', text: 'The system.' },
        { op: 'move', elementId: 'P::E', newOwnerId: 'P::Sub' },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const text = serialize(r.model)
    expect(text).toContain('interface link connect a.p to b.p;')
    expect(text).toContain('satisfy r by sys;')
    expect(text).toContain('doc /* The system. */')
    expect(text).toMatch(/package Sub \{\s+part def E/)
    expect(rules(r.model)).toEqual([])
  })

  it('applyText keeps the IDs of matched elements and reports what changed', () => {
    const m = base()
    const motor = id(m, 'P::Motor')
    const mass = id(m, 'P::Motor::mass')
    const text = serialize(m, id(m, 'P')).replace('0.6 [kg]', '0.7 [kg]').replace('part def Drive {', 'part def Drive {\n        part spare : Motor[0..1];')
    const r = applyTransaction(m, { commands: [{ op: 'applyText', namespaceId: 'P', text }] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(id(r.model, 'P::Motor')).toBe(motor)
    expect(id(r.model, 'P::Motor::mass')).toBe(mass)
    expect(r.summary.map((x) => `${x.kind} ${x.label}`).sort()).toEqual(['created P::Drive::spare', 'updated P::Motor::mass'])
  })

  it('applyText refuses syntax errors and unresolved names, with source ranges', () => {
    const m = base()
    const bad = applyTransaction(m, { commands: [{ op: 'applyText', namespaceId: 'P', text: 'part def X {\n part y : Missing;\n}' }] })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error.diagnostics?.[0]).toMatchObject({ ruleId: 'SYSML-RESOLVE', range: { start: { line: 2 } } })
    const syntax = applyTransaction(m, { commands: [{ op: 'applyText', namespaceId: 'P', text: 'part def {' }] })
    expect(!syntax.ok && syntax.error.diagnostics?.[0].ruleId).toBe('SYSML-SYNTAX')
  })

  it('validation policy reject-new-errors refuses changes that introduce errors; report applies them', () => {
    const m = base()
    const cmd = { op: 'setValue' as const, elementId: 'P::Motor::mass', expression: '3 [m]' }
    const rejected = applyTransaction(m, { commands: [cmd], validationPolicy: 'reject-new-errors' })
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) expect(rejected.error.code).toBe('rejected')
    const reported = applyTransaction(m, { commands: [cmd] })
    expect(reported.ok && reported.diagnostics.introduced.map((d) => d.ruleId)).toEqual(['SYSML-UNIT-DIMENSION'])
  })

  it('the inverse change set restores the model exactly (undo)', () => {
    const m = base()
    const r = applyTransaction(m, { commands: [{ op: 'createElement', ownerId: 'P', kind: 'PartDefinition', name: 'X' }, { op: 'rename', elementId: 'P::Motor', name: 'M2' }, { op: 'deleteElement', elementId: 'P::Drive' }] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const undone = r.model.clone()
    applyChanges(undone, invertChanges(r.changes))
    expect(diffModels(m, undone)).toEqual([])
    expect(canonicalForm(undone)).toEqual(canonicalForm(m))
  })

  it('sets and clears platform metadata (managed requirement link)', () => {
    const m = model('package A { requirement def R; }')
    const r = applyTransaction(m, { commands: [{ op: 'setMetadata', elementId: 'A::R', metadata: 'ManagedRequirement', values: { requirementId: '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001', revision: 3 } }] })
    expect(r.ok && serialize(r.model)).toContain('@EWS::ManagedRequirement {')
    if (!r.ok) return
    const cleared = applyTransaction(r.model, { commands: [{ op: 'setMetadata', elementId: 'A::R', metadata: 'ManagedRequirement', values: null }] })
    expect(cleared.ok && serialize(cleared.model)).toBe('package A {\n    requirement def R;\n}\n')
  })
})

describe('queries and impact', () => {
  it('finds elements and incoming references (impact analysis)', () => {
    const m = model(ACTUATOR_EXAMPLE)
    expect(findElements(m, { metaclass: 'PartDefinition', text: 'motor' }).map((e) => e.qualifiedName).sort()).toEqual(['ActuatorSystem::Electrical::BrushlessMotor', 'ActuatorSystem::Electrical::MotorDriver'])
    const motorDef = id(m, 'ActuatorSystem::Electrical::BrushlessMotor')
    expect(incomingReferences(m, motorDef).map((r) => r.fromLabel)).toEqual(['ActuatorSystem::Architecture::LinearActuator::motor'])
    const affected = impact(m, id(m, 'ActuatorSystem::Mechanical::Rod'), 3).map((x) => x.label)
    expect(affected).toContain('ActuatorSystem::Architecture::LinearActuator::rod')
  })
})

describe('large-model baseline', () => {
  it('handles a generated model of about 30 000 elements; transactions cost little', () => {
    const lines: string[] = ['package Big {', '    private import ISQ::*;', '    private import SI::*;']
    for (let i = 0; i < 1500; i++) lines.push(`    part def D${i} { attribute m : MassValue = ${i} [kg]; part sub : D${Math.max(i - 1, 0)}[0..1]; }`)
    lines.push('}')
    let t = performance.now()
    const r = loadText(lines.join('\n'))
    const loadMs = performance.now() - t
    expect(r.diagnostics).toEqual([])
    expect(r.model.size).toBeGreaterThan(25_000)
    t = performance.now()
    const tx = applyTransaction(r.model, { commands: [{ op: 'rename', elementId: 'Big::D10', name: 'Renamed' }] })
    const txMs = performance.now() - t
    expect(tx.ok).toBe(true)
    console.log(`large model: ${r.model.size} elements, load ${loadMs.toFixed(0)} ms, rename transaction ${txMs.toFixed(0)} ms`)
    expect(txMs).toBeLessThan(5000)
  })
})

describe('element references', () => {
  it('accept a unique simple name and refuse an ambiguous one', () => {
    const m = model('package A { part def Motor; part def Pump { part motor : Motor; } } package B { part def Pump; }')
    const r = applyTransaction(m, { commands: [{ op: 'rename', elementId: 'Motor', name: 'Engine' }] })
    expect(r.ok).toBe(true)
    const amb = applyTransaction(m, { commands: [{ op: 'rename', elementId: 'Pump', name: 'P2' }] })
    expect(!amb.ok && amb.error.message).toMatch(/ambiguous: A::Pump, B::Pump/)
  })
})

describe('relationship matrices and requirement coverage', () => {
  it('satisfy matrix: every requirement is a row (also unsatisfied ones); satisfying features are columns', async () => {
    const m = model(ACTUATOR_EXAMPLE)
    const mx = relationshipMatrix(m, 'satisfy')
    expect(mx.rows.map((r) => r.label)).toEqual(['ActuatorSystem::Requirements::load', 'ActuatorSystem::Requirements::massLimit', 'ActuatorSystem::Requirements::stroke'])
    expect(mx.cols.map((c) => c.label)).toEqual(['ActuatorSystem::Product::act100'])
    expect(mx.cells).toHaveLength(3)
  })

  it('allocate matrix uses feature chains as axis labels; connect matrix is part-by-part', async () => {
    const m = model(ACTUATOR_EXAMPLE)
    const alloc = relationshipMatrix(m, 'allocate')
    expect(alloc.rows.map((r) => r.label)).toEqual(['ActuatorSystem::Software::controlLoop'])
    expect(alloc.cols.map((c) => c.label)).toEqual(['act100.controller'])
    const conn = relationshipMatrix(m, 'connect', id(m, 'ActuatorSystem::Architecture::LinearActuator'))
    expect(conn.rows.map((r) => r.label)).toEqual(conn.cols.map((c) => c.label))
    const driverSupply = conn.cells.find((c) => conn.rows.find((r) => r.key === c.row)?.label.endsWith('supply') && conn.cols.find((x) => x.key === c.col)?.label.endsWith('driver'))
    expect(driverSupply?.relationships.map((r) => r.metaclass)).toEqual(['InterfaceUsage'])
  })

  it('coverage: satisfied, verified, both or not covered; managed links counted', async () => {
    const m = model(ACTUATOR_EXAMPLE)
    const r = applyTransaction(m, { commands: [{ op: 'createElement', ownerId: 'ActuatorSystem::Requirements', kind: 'RequirementUsage', name: 'noise', typeIds: ['ActuatorSystem::Requirements::StrokeRequirement'] }, { op: 'setMetadata', elementId: 'ActuatorSystem::Requirements::load', metadata: 'ManagedRequirement', values: { requirementId: '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001', revision: 2 } }] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const cov = requirementCoverage(r.model)
    const by = Object.fromEntries(cov.requirements.map((x) => [x.label.split('::').pop()!, x] as const))
    expect(by.massLimit.status).toBe('satisfied-and-verified')
    expect(by.massLimit.verifiedBy.map((v) => v.label)).toContain('ActuatorSystem::Requirements::massTest')
    expect(by.load.status).toBe('satisfied')
    expect(by.load.managed).toEqual({ requirementId: '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001', revision: 2 })
    expect(by.noise.status).toBe('not-covered')
    expect(cov.counts).toMatchObject({ total: 4, 'satisfied-and-verified': 1, satisfied: 2, 'not-covered': 1, linkedToManaged: 1 })
  })
})

describe('implicit library specializations (derived, not stored)', () => {
  it('definitions and usages without explicit generals specialize the library base type or feature', () => {
    const r = loadText('package P { part def A; part def B :> A; part p; part q : B; action def Run { action step; first start; then step; then done; } state def S { state s1; } }')
    expect(r.diagnostics).toEqual([])
    const s = semanticsOf(r.model)
    const q = (n: string) => resolveRef(r.model, n)['@id']
    expect(s.qualifiedName(s.impliedGeneral(q('P::A'))!)).toBe('Parts::Part')
    expect(s.generals(q('P::B'))).toEqual([q('P::A')])
    expect(s.conformsTo(q('P::B'), q('Parts::Part'))).toBe(true)
    expect(s.qualifiedName(s.generals(q('P::p'))[0])).toBe('Parts::parts')
    expect(s.generals(q('P::q'))).toEqual([q('P::B')])
    // State definitions are actions: StateAction specializes Action.
    expect(s.conformsTo(q('P::S'), q('Actions::Action'))).toBe(true)
    // Not stored: no relationship was added, the explicit generals stay as written.
    expect(s.explicitGenerals(q('P::A'))).toEqual([])
    expect([...r.model.elements()].some((e) => e.isImplied === true)).toBe(false)
    expect(serialize(r.model)).not.toContain('Parts::Part')
  })
})

import type { Pool } from 'pg'
import { createDecision, createSet, recordDecision } from './store/alternatives'
import { createExploration } from './store/explorations'
import { assumptionsFromStatements } from './store/assumptions'
import { createConstraint } from './store/constraints'
import { createDesignLink } from './store/designLinks'
import { createFunction } from './store/functions'
import { changeMaturity, createConcept } from './store/concepts'
import { withTransaction, type Ctx } from './store/context'
import { createEvidence, createImplementation, createLink } from './store/implementations'
import { createDecomposition, createRelationship } from './store/relationships'
import { createStudy, putScores } from './store/tradeStudies'

/**
 * Reproducible example Concepts for the sample project PRJ-ACT100 (development seed; not run in
 * production unless SEED_ON_START=true). Running it twice changes nothing.
 *
 * 1. The sample linear actuator ACT-100 as a Concept, decomposed into functions and realized by a
 *    ConceptImplementation that references the existing twin objects (ACT-100, SYS-001, CAD-110,
 *    CAD-120) and requirements REQ-001…REQ-003 (canonical UUIDs, pinned revision 1).
 * 2. Brief §3: "Provide controlled mechanical power transmission" with four candidate solutions
 *    (gear train, belt drive, chain drive, direct drive), an illustrative trade study and a recorded
 *    decision with rationale (rejected alternatives are kept).
 * 3. Brief §4: an aircraft propulsion system with two alternative decompositions sharing children.
 *
 * The owner's 500 N compact actuator example is not seeded: it is produced live by the scripted
 * demo assistant (docs/specifications/conceptualize-progress.md, demonstration steps).
 */
export const SEED_PROJECT = 'PRJ-ACT100'
const id = (n: number) => `c0ce0000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const SEED_IDS = {
  actuator: id(1),
  linearMotion: id(2),
  axialLoad: id(3),
  ingress: id(4),
  transmission: id(5),
  gearTrain: id(6),
  beltDrive: id(7),
  chainDrive: id(8),
  directDrive: id(9),
  propulsion: id(10),
  energyStorage: id(11),
  powerConversion: id(12),
  thrust: id(13),
  thermal: id(14),
  control: id(15),
  fuel: id(16),
  generator: id(17),
}
export const SEED_REQUIREMENTS = {
  'REQ-001': '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001',
  'REQ-002': '5b1c7e2a-0002-4e6a-9c1d-6f0a3d2b1002',
  'REQ-003': '5b1c7e2a-0003-4e6a-9c1d-6f0a3d2b1003',
} as const

export async function seedConcepts(pool: Pool): Promise<{ seeded: boolean; message: string }> {
  const exists = await pool.query('SELECT 1 FROM conceptualize.concepts WHERE id = $1', [SEED_IDS.actuator])
  if (exists.rowCount) {
    const knowledge = await seedDesignKnowledge(pool)
    return { seeded: knowledge, message: knowledge ? 'Conceptualize seed present; added the design-knowledge examples (functions, constraints, assumptions).' : 'Conceptualize seed already present; nothing changed.' }
  }
  const as = <T>(actor: string, role: string, fn: (ctx: Ctx) => Promise<T>) =>
    withTransaction(pool, { projectId: SEED_PROJECT, actor, role, provenance: { sourceKind: 'system' } }, fn)
  const reason = 'Seeded example'

  await as('eli', 'editor', async (ctx) => {
    // ---- 1. ACT-100 ---------------------------------------------------------------------------------
    await createConcept(
      ctx,
      {
        name: 'Linear actuator ACT-100',
        summary: 'Electromechanical linear actuator for the press-fit station: 300 mm stroke, 12 kN operating load.',
        description:
          'An actuator that pushes parts into the press-fit fixture. It must extend a 300 mm stroke within the cell cycle time and withstand the peak press-fit load with margin. The Concept stays the same if the realization changes (for example from a ball screw to a hydraulic cylinder).',
        purpose: 'Provide controlled linear force and motion for the press-fit station.',
        abstraction: 'system',
        classifications: ['actuator', 'electromechanical'],
        attributes: { stroke: { value: 300, unit: 'mm', basis: 'user-assertion' }, operatingLoad: { value: 12, unit: 'kN', basis: 'user-assertion' } },
        statements: [
          { kind: 'function', text: 'Convert electrical power into controlled linear motion.' },
          { kind: 'constraint', text: 'Operating load', quantity: { value: 12, unit: 'kN' }, source: 'REQ-001' },
          { kind: 'constraint', text: 'Full-stroke extension time at nominal load', quantity: { max: 6, unit: 's' }, source: 'REQ-002' },
          { kind: 'constraint', text: 'Ingress protection of the housing: IP65', source: 'REQ-003' },
          { kind: 'interface', text: 'Mechanical mounting to the press frame; electrical supply 48 V DC.' },
          { kind: 'assumption', text: 'Duty cycle below 30 % at nominal load.', basis: 'assumption' },
          { kind: 'question', text: 'Is a holding brake needed when power fails?' },
          { kind: 'rationale', text: 'Electromechanical drive chosen for cleanliness (no hydraulic oil near food-packaging variants).' },
        ],
        maturity: 'defined',
        reason,
      },
      { id: SEED_IDS.actuator },
    )
    const children: [string, string, string][] = [
      [SEED_IDS.linearMotion, 'Generate linear motion', 'Turn motor rotation into translation of the rod over the full stroke.'],
      [SEED_IDS.axialLoad, 'Carry the axial load', 'Transfer the press-fit load from the rod to the frame without buckling.'],
      [SEED_IDS.ingress, 'Protect against ingress', 'Keep dust and wash-down water out of the drive (IP65).'],
    ]
    const dec = await createDecomposition(ctx, { parentId: SEED_IDS.actuator, name: 'Functional decomposition', description: 'Functions, not the CAD assembly structure.' })
    for (const [cid, name, summary] of children) {
      await createConcept(ctx, { name, summary, abstraction: 'function', maturity: 'defined', statements: [{ kind: 'function', text: summary }], reason }, { id: cid })
      await createRelationship(ctx, { type: 'contains', fromId: SEED_IDS.actuator, toId: cid, decompositionId: dec.id })
    }
    await createRelationship(ctx, { type: 'interfaces-with', fromId: SEED_IDS.linearMotion, toId: SEED_IDS.axialLoad, interface: { name: 'Rod–nut load path', kind: 'mechanical', flows: ['axial force', 'translation'] } })
    await createLink(ctx, SEED_IDS.actuator, { relation: 'satisfies', artifact: { module: 'requirements', id: SEED_REQUIREMENTS['REQ-001'], revision: 1, kind: 'requirement', label: 'REQ-001 Operating load' } })
    await createLink(ctx, SEED_IDS.actuator, { relation: 'satisfies', artifact: { module: 'requirements', id: SEED_REQUIREMENTS['REQ-002'], revision: 1, kind: 'requirement', label: 'REQ-002 Extension time' } })
    await createLink(ctx, SEED_IDS.ingress, { relation: 'satisfies', artifact: { module: 'requirements', id: SEED_REQUIREMENTS['REQ-003'], revision: 1, kind: 'requirement', label: 'REQ-003 Ingress protection' } })
    await createImplementation(ctx, {
      name: 'ACT-100 electromechanical design',
      description: 'Motor, ball screw, rod and housing of the sample twin. Mock geometry in CAD; SysML structure in the SysML tool.',
      status: 'in-development',
      conceptIds: [SEED_IDS.actuator, SEED_IDS.linearMotion, SEED_IDS.axialLoad],
      artifacts: [
        { module: 'twin', id: 'ACT-100', kind: 'assembly', label: 'ACT-100 Actuator assembly' },
        { module: 'sysml', id: 'SYS-001', kind: 'sysml-part', label: 'ActuatorSystem' },
        { module: 'cad', id: 'CAD-120', kind: 'cad-representation', label: 'Rod (mock geometry)' },
        { module: 'cad', id: 'CAD-110', kind: 'cad-representation', label: 'Housing (mock geometry)' },
      ],
      reason,
    })
    await createImplementation(ctx, {
      name: 'Housing sealing',
      status: 'candidate',
      conceptIds: [SEED_IDS.ingress],
      artifacts: [{ module: 'twin', id: 'HSG-110', kind: 'part', label: 'HSG-110 Housing' }],
      reason,
    })
    await createEvidence(ctx, {
      conceptId: SEED_IDS.axialLoad,
      kind: 'calculation',
      title: 'Rod buckling, preliminary (Euler)',
      summary: 'Critical load of the rod as a pinned–pinned Euler column. Preliminary; the CAD/analysis result is authoritative.',
      basis: 'estimate',
      method: 'P_cr = π² E I / (K L)², I = π d⁴ / 64',
      inputs: [
        { name: 'E', value: 210, unit: 'GPa' },
        { name: 'd', value: 25, unit: 'mm' },
        { name: 'L', value: 300, unit: 'mm' },
        { name: 'K', value: 1, unit: '-' },
      ],
      outputs: [{ name: 'P_cr', value: 441.6, unit: 'kN' }],
      assumptions: ['Solid steel rod', 'Pinned–pinned end conditions', 'No eccentricity'],
    })

    // ---- 2. Brief §3: power transmission alternatives ----------------------------------------------------
    await createConcept(
      ctx,
      {
        name: 'Provide controlled mechanical power transmission',
        summary: 'Transmit motor power to the screw at a controlled ratio.',
        description: 'The function every drive-train alternative must satisfy, independent of how it is implemented.',
        purpose: 'Match motor speed and torque to the screw.',
        abstraction: 'function',
        classifications: ['power transmission'],
        statements: [
          { kind: 'function', text: 'Transmit rotational power from the motor to the screw.' },
          { kind: 'constraint', text: 'Transmitted torque', quantity: { max: 8, unit: 'N*m' } },
          { kind: 'constraint', text: 'Speed ratio between 1:1 and 3:1', quantity: { min: 1, max: 3, unit: '-' } },
          { kind: 'uncertainty', text: 'Backlash tolerance of the positioning loop is not yet known.' },
        ],
        reason,
      },
      { id: SEED_IDS.transmission, maturity: 'evaluated' },
    )
    await createRelationship(ctx, { type: 'contains', fromId: SEED_IDS.linearMotion, toId: SEED_IDS.transmission })
    const options: [string, string, string, string][] = [
      [SEED_IDS.gearTrain, 'Gear train', 'Spur gear pair between motor and screw.', 'Positive engagement through meshing teeth.'],
      [SEED_IDS.beltDrive, 'Belt drive', 'Toothed belt and pulleys.', 'Synchronous belt engages pulley teeth; tension carries torque.'],
      [SEED_IDS.chainDrive, 'Chain drive', 'Roller chain and sprockets.', 'Roller chain links engage sprocket teeth.'],
      [SEED_IDS.directDrive, 'Direct-drive motor', 'Motor shaft coupled directly to the screw.', 'No transmission stage; the motor provides the full torque at screw speed.'],
    ]
    for (const [cid, name, summary, principle] of options) {
      await createConcept(ctx, { name, summary, abstraction: 'component', classifications: ['power transmission'], statements: [{ kind: 'principle', text: principle }, { kind: 'mechanism', text: summary }], reason }, { id: cid, maturity: 'evaluated' })
      await createRelationship(ctx, { type: 'implements', fromId: cid, toId: SEED_IDS.transmission })
    }
    const set = await createSet(ctx, { parentId: SEED_IDS.transmission, name: 'Drive-train principle', question: 'Which transmission realizes the function best for ACT-100?', memberIds: options.map((o) => o[0]) })
    const study = await createStudy(ctx, { title: 'Drive-train trade study', setId: set.id, useDefaultCriteria: true, description: 'Illustrative qualitative scores entered as engineering assumptions; not measured data.' })
    const q: Record<string, number[]> = {
      // performance, mass, cost, complexity, manufacturability, risk (1 very poor … 5 very good)
      [SEED_IDS.gearTrain]: [4, 3, 3, 3, 4, 4],
      [SEED_IDS.beltDrive]: [3, 4, 4, 4, 4, 3],
      [SEED_IDS.chainDrive]: [3, 2, 4, 3, 3, 2],
      [SEED_IDS.directDrive]: [5, 2, 2, 5, 3, 3],
    }
    await putScores(
      ctx,
      study.id,
      Object.entries(q).flatMap(([conceptId, values]) => values.map((v, i) => ({ criterionId: study.criteria[i].id, conceptId, qualitative: v, basis: 'assumption' as const, rationale: 'Illustrative engineering judgement (seed example)' }))),
      study.revision,
    )
  })

  await as('rui', 'reviewer', async (ctx) => {
    const { rows } = await ctx.db.query<{ id: string }>('SELECT id FROM conceptualize.alternative_sets WHERE parent_id = $1', [SEED_IDS.transmission])
    const { rows: studies } = await ctx.db.query<{ id: string }>('SELECT id FROM conceptualize.trade_studies WHERE set_id = $1', [rows[0].id])
    const d = await createDecision(ctx, {
      title: 'Gear train for the ACT-100 drive train',
      question: 'Which transmission realizes the function best for ACT-100?',
      rationale: 'Highest combined score with acceptable risk; positive engagement suits the positioning loop. The belt drive stays a deferred fallback if noise becomes an issue.',
      setId: rows[0].id,
      tradeStudyId: studies[0].id,
      outcomes: [
        { conceptId: SEED_IDS.gearTrain, outcome: 'accepted', rationale: 'Best overall in the trade study' },
        { conceptId: SEED_IDS.beltDrive, outcome: 'deferred', rationale: 'Fallback if gear noise is unacceptable' },
        { conceptId: SEED_IDS.chainDrive, outcome: 'rejected', rationale: 'Lubrication and elongation in a wash-down cell' },
        { conceptId: SEED_IDS.directDrive, outcome: 'rejected', rationale: 'Motor too large for the torque at screw speed' },
      ],
    })
    await recordDecision(ctx, d.id, d.recordVersion, 'Seeded example decision')
  })

  await as('ada', 'administrator', async (ctx) => {
    const { rows } = await ctx.db.query<{ current_revision: number }>('SELECT current_revision FROM conceptualize.concepts WHERE id = $1', [SEED_IDS.actuator])
    await changeMaturity(ctx, SEED_IDS.actuator, 'engineering-development', rows[0].current_revision, 'Realization started in SysML and CAD')
  })

  await as('eli', 'editor', async (ctx) => {
    // ---- 3. Brief §4: propulsion with alternative decompositions ---------------------------------------------
    await createConcept(
      ctx,
      {
        name: 'Aircraft propulsion system',
        summary: 'Produce thrust for a light aircraft.',
        description: 'Example of hierarchical and network decomposition: two alternative decompositions share functions.',
        abstraction: 'system',
        classifications: ['propulsion', 'example'],
        statements: [{ kind: 'function', text: 'Produce controllable thrust.' }, { kind: 'question', text: 'Battery-electric or hybrid-electric?' }],
        maturity: 'exploring',
        reason,
      },
      { id: SEED_IDS.propulsion },
    )
    const parts: [string, string][] = [
      [SEED_IDS.energyStorage, 'Energy storage'],
      [SEED_IDS.powerConversion, 'Power conversion'],
      [SEED_IDS.thrust, 'Thrust generation'],
      [SEED_IDS.thermal, 'Thermal management'],
      [SEED_IDS.control, 'Control and monitoring'],
      [SEED_IDS.fuel, 'Fuel storage and supply'],
      [SEED_IDS.generator, 'Electrical generation'],
    ]
    for (const [cid, name] of parts) await createConcept(ctx, { name, abstraction: 'function', maturity: 'idea', reason }, { id: cid })
    const electric = await createDecomposition(ctx, { parentId: SEED_IDS.propulsion, name: 'Battery-electric', description: 'Batteries, inverter and electric motor driving a propeller.' })
    const hybrid = await createDecomposition(ctx, { parentId: SEED_IDS.propulsion, name: 'Hybrid-electric', description: 'Fuel and generator supply the electric drive; shares thrust, thermal and control functions.' })
    for (const c of [SEED_IDS.energyStorage, SEED_IDS.powerConversion, SEED_IDS.thrust, SEED_IDS.thermal, SEED_IDS.control]) await createRelationship(ctx, { type: 'contains', fromId: SEED_IDS.propulsion, toId: c, decompositionId: electric.id })
    for (const c of [SEED_IDS.fuel, SEED_IDS.generator, SEED_IDS.powerConversion, SEED_IDS.thrust, SEED_IDS.thermal, SEED_IDS.control]) await createRelationship(ctx, { type: 'contains', fromId: SEED_IDS.propulsion, toId: c, decompositionId: hybrid.id })
    await createRelationship(ctx, { type: 'depends-on', fromId: SEED_IDS.thrust, toId: SEED_IDS.powerConversion })
    await createRelationship(ctx, { type: 'depends-on', fromId: SEED_IDS.powerConversion, toId: SEED_IDS.thermal })
    await createRelationship(ctx, { type: 'interfaces-with', fromId: SEED_IDS.energyStorage, toId: SEED_IDS.powerConversion, interface: { name: 'DC bus', kind: 'electrical', flows: ['electrical power'] } })
  })
  await as('eli', 'editor', (ctx) => seedCompactActuator(ctx))
  await seedDesignKnowledge(pool)
  return { seeded: true, message: 'Seeded example Concepts (ACT-100, power transmission alternatives, propulsion decompositions, 500 N compact actuator alternatives).' }
}

/**
 * The owner's example (brief §6): three alternatives for a compact actuator delivering 500 N within a
 * 100 mm envelope. Seeded as an exploration with preliminary estimates whose arithmetic is shown
 * (method, inputs, outputs, assumptions); scores are engineering assumptions, not measurements. The
 * scripted demo assistant can generate the same kind of exploration live.
 */
async function seedCompactActuator(ctx: Ctx) {
  const F = 500
  const objective = 'Develop three alternative concepts for a compact mechanical actuator capable of delivering 500 N of linear force within a 100 mm envelope.'
  // Ball screw: T = F·l / (2π·η)
  const lead = 0.005
  const eta = 0.9
  const torque = (F * lead) / (2 * Math.PI * eta)
  // Pneumatic: A = F / p, d = √(4A/π); next ISO bore 40 mm
  const p = 0.6e6
  const area = (F / p) * 1e6
  const bore = Math.sqrt((4 * area) / Math.PI)
  // Rack and pinion: T = F·r / η
  const r = 0.01
  const etaRp = 0.95
  const torqueRp = (F * r) / etaRp
  const r3 = (n: number) => Math.round(n * 1000) / 1000
  await createExploration(ctx, {
    objective,
    parent: {
      name: 'Compact mechanical actuator (500 N, 100 mm envelope)',
      summary: 'Deliver 500 N of linear force within a 100 mm envelope.',
      description: objective,
      purpose: 'Provide controlled linear force in a compact space.',
      abstraction: 'subsystem',
      classifications: ['actuator', 'example'],
      statements: [
        { kind: 'function', text: 'Deliver linear force' },
        { kind: 'constraint', text: 'Linear force', quantity: { value: F, unit: 'N' } },
        { kind: 'constraint', text: 'Envelope', quantity: { max: 100, unit: 'mm' } },
        { kind: 'question', text: 'What stroke and speed are required?' },
        { kind: 'question', text: 'Which energy source is available (electric, compressed air)?' },
      ],
    },
    setName: 'Actuation principle',
    question: 'Which principle delivers 500 N within 100 mm best?',
    alternatives: [
      {
        name: 'Electromechanical ball-screw actuator',
        summary: 'Motor drives a ball screw; the nut pushes the rod.',
        abstraction: 'subsystem',
        classifications: ['actuator', 'electromechanical'],
        statements: [
          { kind: 'principle', text: 'Rolling-element screw converts motor torque into axial force.', basis: 'assumption' },
          { kind: 'assumption', text: `Lead ${lead * 1000} mm, efficiency ${eta}`, basis: 'assumption' },
          { kind: 'performance', text: 'Required motor torque (preliminary)', quantity: { value: r3(torque), unit: 'N*m' }, basis: 'estimate' },
        ],
        children: [{ name: 'Electric motor' }, { name: 'Ball screw and nut' }, { name: 'Rod guide' }],
        interfaces: [{ from: 0, to: 1, definition: { name: 'Motor–screw coupling', kind: 'mechanical', flows: ['torque'] } }],
        evidence: [
          { kind: 'calculation', title: 'Motor torque for 500 N', basis: 'estimate', method: 'T = F·l / (2π·η)', inputs: [{ name: 'F', value: F, unit: 'N' }, { name: 'l', value: lead * 1000, unit: 'mm' }, { name: 'η', value: eta, unit: '-' }], outputs: [{ name: 'T', value: r3(torque), unit: 'N*m' }], assumptions: ['No friction in bearings', 'Static load'] },
        ],
      },
      {
        name: 'Compact pneumatic cylinder',
        summary: 'Double-acting cylinder supplied with compressed air.',
        abstraction: 'subsystem',
        classifications: ['actuator', 'pneumatic'],
        statements: [
          { kind: 'principle', text: 'Air pressure on the piston area produces axial force.', basis: 'assumption' },
          { kind: 'assumption', text: 'Supply pressure 6 bar', basis: 'assumption' },
          { kind: 'performance', text: 'Minimum bore (preliminary)', quantity: { value: Math.round(bore * 10) / 10, unit: 'mm' }, basis: 'estimate' },
          { kind: 'uncertainty', text: 'Compressed air availability at the installation site.' },
        ],
        children: [{ name: 'Cylinder and piston' }, { name: 'Valve' }],
        interfaces: [{ from: 1, to: 0, definition: { name: 'Air supply', kind: 'fluid', flows: ['compressed air'] } }],
        evidence: [
          { kind: 'calculation', title: 'Bore for 500 N at 6 bar', basis: 'estimate', method: 'A = F / p, d = √(4A/π)', inputs: [{ name: 'F', value: F, unit: 'N' }, { name: 'p', value: 6, unit: 'bar' }], outputs: [{ name: 'A', value: Math.round(area), unit: 'mm^2' }, { name: 'd', value: Math.round(bore * 10) / 10, unit: 'mm' }], assumptions: ['Friction and seal losses neglected; choose the next standard bore (40 mm)'] },
        ],
      },
      {
        name: 'Rack-and-pinion drive',
        summary: 'Motor-driven pinion moves a toothed rack.',
        abstraction: 'subsystem',
        classifications: ['actuator', 'electromechanical'],
        statements: [
          { kind: 'principle', text: 'Gear mesh converts pinion torque into rack force.', basis: 'assumption' },
          { kind: 'assumption', text: `Pinion pitch radius ${r * 1000} mm, efficiency ${etaRp}`, basis: 'assumption' },
          { kind: 'performance', text: 'Required pinion torque (preliminary)', quantity: { value: r3(torqueRp), unit: 'N*m' }, basis: 'estimate' },
          { kind: 'uncertainty', text: 'Backlash may be unacceptable for positioning.' },
        ],
        children: [{ name: 'Motor and gearbox' }, { name: 'Pinion and rack' }],
        interfaces: [{ from: 0, to: 1, definition: { name: 'Pinion shaft', kind: 'mechanical', flows: ['torque'] } }],
        evidence: [
          { kind: 'calculation', title: 'Pinion torque for 500 N', basis: 'estimate', method: 'T = F·r / η', inputs: [{ name: 'F', value: F, unit: 'N' }, { name: 'r', value: r * 1000, unit: 'mm' }, { name: 'η', value: etaRp, unit: '-' }], outputs: [{ name: 'T', value: r3(torqueRp), unit: 'N*m' }], assumptions: ['Static load', 'Single pinion'] },
        ],
      },
    ],
    tradeStudy: {
      title: 'Compact actuator principles',
      criteria: [
        { name: 'Mass (estimate)', category: 'mass', weight: 1, direction: 'minimize', scale: 'quantity', unit: 'kg' },
        { name: 'Cost', category: 'cost', weight: 1, direction: 'maximize', scale: 'qualitative', description: '5 = cheapest' },
        { name: 'Controllability', category: 'performance', weight: 2, direction: 'maximize', scale: 'qualitative' },
        { name: 'Risk', category: 'risk', weight: 1, direction: 'maximize', scale: 'qualitative', description: '5 = lowest risk' },
      ],
      scores: [
        { criterion: 0, alternative: 0, low: 0.6, high: 0.9, basis: 'estimate', rationale: 'Motor and screw of comparable products (assumed range)' },
        { criterion: 0, alternative: 1, low: 0.3, high: 0.5, basis: 'estimate', rationale: 'Cylinder only; excludes compressor' },
        { criterion: 0, alternative: 2, low: 0.7, high: 1.1, basis: 'estimate', rationale: 'Motor, gearbox and rack (assumed range)' },
        { criterion: 1, alternative: 0, qualitative: 2, basis: 'assumption' },
        { criterion: 1, alternative: 1, qualitative: 4, basis: 'assumption' },
        { criterion: 1, alternative: 2, qualitative: 3, basis: 'assumption' },
        { criterion: 2, alternative: 0, qualitative: 5, basis: 'assumption' },
        { criterion: 2, alternative: 1, qualitative: 2, basis: 'assumption' },
        { criterion: 2, alternative: 2, qualitative: 3, basis: 'assumption' },
        { criterion: 3, alternative: 0, qualitative: 4, basis: 'assumption' },
        { criterion: 3, alternative: 1, qualitative: 3, basis: 'assumption' },
        { criterion: 3, alternative: 2, qualitative: 3, basis: 'assumption' },
      ],
    },
    generator: 'seed (illustrative example)',
  })
}

export const FUNCTION_SEED_IDS = {
  linearForce: 'f0ce0000-0000-4000-8000-000000000001',
  effort: 'f0ce0000-0000-4000-8000-000000000002',
  convert: 'f0ce0000-0000-4000-8000-000000000003',
  guide: 'f0ce0000-0000-4000-8000-000000000004',
}

/**
 * Design-knowledge examples (CR-C1…C3): the function the 500 N alternatives perform, its decomposition,
 * a constraint formalizing REQ-001 (pinned revision 1), a stated envelope constraint, and Assumptions for
 * the assumption statements. Runs once (checks FN seed ID); the function-Concept CON-005 is left as it is
 * to demonstrate the explicit Convert to Function operation.
 */
export async function seedDesignKnowledge(pool: Pool): Promise<boolean> {
  const exists = await pool.query('SELECT 1 FROM conceptualize.functions WHERE id = $1', [FUNCTION_SEED_IDS.linearForce])
  if (exists.rowCount) return false
  await withTransaction(pool, { projectId: SEED_PROJECT, actor: 'eli', role: 'editor', provenance: { sourceKind: 'system' } }, async (ctx) => {
    const fn = await createFunction(
      ctx,
      {
        name: 'Deliver controlled linear force',
        verbPhrase: 'deliver linear force',
        description: 'Produce a controlled push or pull along one axis, whatever the actuation principle.',
        flows: [
          { direction: 'in', kind: 'energy', name: 'Drive energy (electrical or pneumatic)' },
          { direction: 'in', kind: 'signal', name: 'Command' },
          { direction: 'out', kind: 'force', name: 'Axial force', quantity: { value: 500, unit: 'N' } },
        ],
        performanceObjectives: [{ name: 'Axial force', quantity: { min: 500, unit: 'N' }, direction: 'target', basis: 'user-assertion' }],
        statements: [{ kind: 'behavior', text: 'Holds position when the command is constant.' }],
        status: 'active',
        reason: 'Seeded example',
      },
      { id: FUNCTION_SEED_IDS.linearForce },
    )
    const subs: [string, string, string][] = [
      [FUNCTION_SEED_IDS.effort, 'Generate driving effort', 'Turn the supplied energy into torque or pressure.'],
      [FUNCTION_SEED_IDS.convert, 'Convert to linear motion', 'Turn the driving effort into translation and force.'],
      [FUNCTION_SEED_IDS.guide, 'Guide and support the output', 'Carry side loads and keep the output aligned.'],
    ]
    for (const [id, name, description] of subs) await createFunction(ctx, { name, description, status: 'active', parentFunctionId: fn.id, reason: 'Seeded example' }, { id })
    // The seeded 500 N alternatives perform the function.
    const { rows } = await ctx.db.query<{ created_ids: { concepts: { id: string; role: string }[] } }>(`SELECT created_ids FROM conceptualize.explorations WHERE project_id = $1 AND generator = 'seed (illustrative example)'`, [SEED_PROJECT])
    const alternatives = rows[0]?.created_ids.concepts.filter((c) => c.role === 'alternative') ?? []
    for (const a of alternatives) await createDesignLink(ctx, { type: 'performs', from: { module: 'conceptualize', type: 'concept', id: a.id }, to: { module: 'conceptualize', type: 'function', id: fn.id } })
    await createConstraint(ctx, {
      kind: 'dimensional',
      statement: 'Fits a 100 mm envelope',
      bound: { symbol: 'L', operator: '<=', quantity: { value: 100, unit: 'mm' } },
      strength: 'hard',
      source: { kind: 'stated' },
      subjects: [{ module: 'conceptualize', type: 'function', id: fn.id }],
      status: 'active',
      reason: 'Seeded example',
    })
    await createConstraint(ctx, {
      kind: 'mathematical',
      statement: 'REQ-001 operating load as F ≥ 12 kN in the maximum-load scenario',
      bound: { symbol: 'F', operator: '>=', quantity: { value: 12, unit: 'kN' } },
      strength: 'hard',
      source: { kind: 'requirement', ref: { module: 'requirements', id: SEED_REQUIREMENTS['REQ-001'], revision: 1, kind: 'requirement', label: 'REQ-001 Operating load' } },
      subjects: [{ module: 'conceptualize', type: 'concept', id: SEED_IDS.actuator }],
      status: 'active',
      reason: 'Seeded example',
    })
    const { rows: all } = await ctx.db.query<{ id: string }>('SELECT id FROM conceptualize.concepts WHERE project_id = $1', [SEED_PROJECT])
    await assumptionsFromStatements(ctx, all.map((c) => c.id))
  })
  return true
}

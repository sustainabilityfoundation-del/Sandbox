import type { Pool } from 'pg'
import { createDecision, createSet, recordDecision } from './store/alternatives'
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
  if (exists.rowCount) return { seeded: false, message: 'Conceptualize seed already present (CON-001 exists); nothing changed.' }
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
  return { seeded: true, message: 'Seeded example Concepts CON-001…CON-017 (ACT-100, power transmission alternatives, propulsion decompositions).' }
}

import type { Pool } from 'pg'
import { createAttributeDefinition } from './store/attributes'
import { createBaseline } from './store/baselines'
import { addNode, createCollection } from './store/collections'
import { withTransaction, type Ctx } from './store/context'
import { createRelationship } from './store/relationships'
import { createRequirement, transition } from './store/requirements'
import { decide } from './store/reviews'
import type { TwinDirectory } from './twin'

/**
 * Reproducible seed for the sample actuator project PRJ-ACT100. REQ-001…REQ-003 use the fixed
 * canonical UUIDs agreed in contracts §3 and keep their legacy twin IDs as aliases. Running the
 * seed twice changes nothing (it checks for REQ-001's UUID first).
 */
export const SEED_PROJECT = 'PRJ-ACT100'
export const LEGACY_UUIDS = {
  'REQ-001': '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001',
  'REQ-002': '5b1c7e2a-0002-4e6a-9c1d-6f0a3d2b1002',
  'REQ-003': '5b1c7e2a-0003-4e6a-9c1d-6f0a3d2b1003',
} as const

export const SEED_IDS = {
  req4: '5b1c7e2a-0004-4e6a-9c1d-6f0a3d2b1004',
  req5: '5b1c7e2a-0005-4e6a-9c1d-6f0a3d2b1005',
  req6: '5b1c7e2a-0006-4e6a-9c1d-6f0a3d2b1006',
  collection: '7c2d8f3b-0001-4b7a-8d2e-7a1b4e3c2001',
  safetyClass: '8d3e9a4c-0001-4c8b-9e3f-8b2c5f4d3001',
  customerClause: '8d3e9a4c-0002-4c8b-9e3f-8b2c5f4d3002',
}

export async function seedRequirements(pool: Pool, twin: TwinDirectory): Promise<{ seeded: boolean; message: string }> {
  const exists = await pool.query('SELECT 1 FROM requirements.requirements WHERE id = $1', [LEGACY_UUIDS['REQ-001']])
  if (exists.rowCount) return { seeded: false, message: 'Seed data already present (REQ-001 exists); nothing changed.' }
  const as = <T>(actor: string, fn: (ctx: Ctx) => Promise<T>) => withTransaction(pool, { projectId: SEED_PROJECT, actor, configurationId: 'CFG-BASE' }, fn)

  await as('ada', async (ctx) => {
    await createAttributeDefinition(ctx, { key: 'safety-class', name: 'Safety class', description: 'Project safety classification (illustrative).', dataType: 'enumeration', enumValues: [{ key: 'a', label: 'A (highest)' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }] }, SEED_IDS.safetyClass)
    await createAttributeDefinition(ctx, { key: 'customer-clause', name: 'Customer clause', description: 'Clause of the customer specification this requirement answers.', dataType: 'string', maxLength: 200 }, SEED_IDS.customerClause)
    const col = await createCollection(ctx, { name: 'ACT-100 System Requirements Specification', description: 'Sample specification for the linear actuator. Document structure only; derivation is recorded as relationships.' }, SEED_IDS.collection)
    const perf = await addNode(ctx, col.id, { kind: 'heading', heading: 'Performance' }, null)
    const env = await addNode(ctx, col.id, { kind: 'heading', heading: 'Environment' }, null)
    const reason = 'Seeded from the sample twin'
    await createRequirement(
      ctx,
      {
        title: 'Operating load',
        statement: 'The actuator shall withstand an operating load of 12 kN in the maximum-load scenario with a positive margin of safety.',
        rationale: 'Peak press-fit force measured on the customer line is 11 kN; 12 kN adds a handling allowance.',
        type: 'performance',
        source: 'Customer specification CS-ACT-100, clause 4.1',
        owner: 'eli',
        priority: 'high',
        verificationMethods: ['analysis', 'test'],
        acceptanceCriteria: 'Analysis shows a margin of safety greater than 0 at 12 kN in SCN-MAX; a proof test at 12 kN shows no permanent deformation.',
        attributes: { [SEED_IDS.safetyClass]: ['b'], [SEED_IDS.customerClause]: 'CS-ACT-100 4.1' },
        collectionId: col.id,
        parentNodeId: perf.id,
      },
      { id: LEGACY_UUIDS['REQ-001'], key: 'REQ-001', legacyIds: ['REQ-001'], reason },
    )
    await createRequirement(
      ctx,
      {
        title: 'Extension time',
        statement: 'The actuator shall extend its full 300 mm stroke in no more than 6.0 s at nominal load.',
        rationale: 'Cycle-time budget of the assembly cell.',
        type: 'performance',
        source: 'Assembly cell cycle-time budget AC-7, revision B',
        owner: 'eli',
        priority: 'high',
        verificationMethods: ['test'],
        acceptanceCriteria: 'Measured extension time from fully retracted to fully extended at 8 kN is at most 6.0 s in five consecutive cycles.',
        attributes: { [SEED_IDS.safetyClass]: ['c'] },
        collectionId: col.id,
        parentNodeId: perf.id,
      },
      { id: LEGACY_UUIDS['REQ-002'], key: 'REQ-002', legacyIds: ['REQ-002'], reason },
    )
    await createRequirement(
      ctx,
      {
        title: 'Ingress protection',
        statement: 'The housing shall provide ingress protection to IP65.',
        rationale: 'Wash-down cleaning in the food-packaging variant.',
        type: 'environmental',
        source: 'Food-packaging variant study FP-3',
        owner: 'rui',
        priority: 'medium',
        verificationMethods: ['inspection'],
        acceptanceCriteria: 'Type test to IEC 60529 IP65 passed by an accredited laboratory.',
        collectionId: col.id,
        parentNodeId: env.id,
      },
      { id: LEGACY_UUIDS['REQ-003'], key: 'REQ-003', legacyIds: ['REQ-003'], reason },
    )
    await createRequirement(
      ctx,
      {
        title: 'Rod buckling safety',
        statement: 'The rod shall have a buckling safety factor of at least 3.0 under an axial compressive load of 12 kN at full extension.',
        rationale: 'Derived from the operating load for the rod as the most buckling-critical part.',
        type: 'performance',
        source: 'Load analysis LA-12 (derived from REQ-001)',
        owner: 'eli',
        priority: 'high',
        verificationMethods: ['analysis'],
        acceptanceCriteria: 'Euler buckling analysis with effective length 600 mm shows a factor of at least 3.0.',
        collectionId: col.id,
        parentNodeId: perf.id,
      },
      { id: SEED_IDS.req4, key: 'REQ-004', reason },
    )
    await createRequirement(
      ctx,
      {
        title: 'Motor power',
        statement: 'The motor shall deliver at least 350 W continuous mechanical power at 3000 rpm.',
        rationale: 'Part of the decomposition of the extension-time requirement.',
        type: 'performance',
        source: 'Drive sizing note DS-2',
        owner: 'eli',
        priority: 'medium',
        verificationMethods: ['test'],
        acceptanceCriteria: 'Dynamometer test at 3000 rpm for 30 min at 350 W without exceeding the winding temperature limit.',
        collectionId: col.id,
        parentNodeId: perf.id,
      },
      { id: SEED_IDS.req5, key: 'REQ-005', reason },
    )
    // Deliberately weak wording, so quality assistance has something to explain.
    await createRequirement(
      ctx,
      {
        title: 'Cleaning',
        statement: 'The housing should be easy to clean and shall resist corrosion etc. as appropriate.',
        rationale: '',
        type: 'environmental',
        source: '',
        verificationMethods: [],
        collectionId: col.id,
        parentNodeId: env.id,
      },
      { id: SEED_IDS.req6, key: 'REQ-006', reason: 'Draft from workshop notes' },
    )
    // Advance the key counter past the seeded keys.
    await ctx.db.query(`INSERT INTO requirements.key_counters (project_id, prefix, next_value) VALUES ($1, 'REQ', 7) ON CONFLICT (project_id, prefix) DO UPDATE SET next_value = greatest(requirements.key_counters.next_value, 7)`, [SEED_PROJECT])

    const alloc = (from: string, to: string) => createRelationship(ctx, twin, { type: 'allocated-to', fromId: from, toTwinId: to, reason }, { silent: true })
    await alloc(LEGACY_UUIDS['REQ-001'], 'ROD-120')
    await alloc(LEGACY_UUIDS['REQ-001'], 'HSG-110')
    await alloc(LEGACY_UUIDS['REQ-002'], 'ACT-100')
    await alloc(LEGACY_UUIDS['REQ-002'], 'MTR-130')
    await alloc(LEGACY_UUIDS['REQ-003'], 'HSG-110')
    await alloc(SEED_IDS.req4, 'ROD-120')
    await alloc(SEED_IDS.req5, 'MTR-130')
    await createRelationship(ctx, twin, { type: 'derives-from', fromId: SEED_IDS.req4, toRequirementId: LEGACY_UUIDS['REQ-001'], rationale: 'Load analysis LA-12', reason }, { silent: true })
    await createRelationship(ctx, twin, { type: 'decomposes', fromId: SEED_IDS.req5, toRequirementId: LEGACY_UUIDS['REQ-002'], rationale: 'Drive sizing', reason }, { silent: true })
  })

  // Review history: an editor requests review, a reviewer (who did not author the revision) decides.
  for (const key of ['REQ-001', 'REQ-002', 'REQ-003'] as const) {
    await as('eli', (ctx) => transition(ctx, LEGACY_UUIDS[key], 'request-review', 1, 'editor', 'Ready for review', 'Seed review'))
  }
  for (const key of ['REQ-001', 'REQ-002'] as const) {
    await as('rui', async (ctx) => {
      const { rows } = await ctx.db.query<{ id: string }>(`SELECT id FROM requirements.reviews WHERE requirement_id = $1 AND state = 'open'`, [LEGACY_UUIDS[key]])
      await decide(ctx, LEGACY_UUIDS[key], rows[0].id, { decision: 'approve', comment: 'Checked against the customer specification.', expectedRevision: 1 }, 'reviewer')
    })
  }
  await as('rui', (ctx) => createBaseline(ctx, { name: 'Seed baseline', description: 'Requirements as seeded (approved REQ-001, REQ-002; REQ-003 in review).', configurationId: 'CFG-BASE' }))
  return { seeded: true, message: 'Seeded PRJ-ACT100: 6 requirements, 1 collection, 9 relationships, 2 attribute definitions, 1 baseline.' }
}

import '../../api/test/providedContext'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inject } from 'vitest'
import { CONCEPT_MIGRATIONS_DIR, migrateConcepts } from '@ews/conceptualize-service'
import { migrate } from '../src/db/migrate'
import { dropDatabase, ensureDatabase } from '../../api/src/database'

/**
 * Migration 0002 (design knowledge, CR-C1…C6) on data in the old format (schema 0001 only): additive,
 * nothing rewritten; one Assumption per assumption statement of the current revision (CR-C3); evidence
 * gets its Concept as subject; decisions are valid with empty extensions.
 */
let pool: pg.Pool
let name: string
let dir: string
const admin = () => inject('pgAdminUrl')

const CONCEPT = '11111111-1111-4111-8111-111111111111'
const S1 = '22222222-2222-4222-8222-222222222221'
const S2 = '22222222-2222-4222-8222-222222222222'
const S3 = '22222222-2222-4222-8222-222222222223'
const EVD = '33333333-3333-4333-8333-333333333333'

beforeAll(async () => {
  name = `ews_test_${randomBytes(5).toString('hex')}`
  await ensureDatabase(admin(), name)
  const u = new URL(admin())
  u.pathname = `/${name}`
  pool = new pg.Pool({ connectionString: u.toString(), max: 4 })
  // Only the old schema.
  dir = mkdtempSync(join(tmpdir(), 'con-mig-'))
  copyFileSync(join(CONCEPT_MIGRATIONS_DIR, '0001_initial.sql'), join(dir, '0001_initial.sql'))
  await migrate(pool, { schema: 'conceptualize', directory: dir })
  // Old-format fixture: a Concept at revision 2 whose revision 1 had an assumption that revision 2 replaced.
  const t = '2026-10-01T10:00:00Z'
  await pool.query(`BEGIN`)
  await pool.query(`INSERT INTO conceptualize.concepts (id, project_id, key, current_revision, maturity, created_at, created_by, updated_at, updated_by) VALUES ($1,'PRJ-OLD','CON-001',2,'defined',$2,'eli',$2,'eli')`, [CONCEPT, t])
  for (const rev of [1, 2]) {
    await pool.query(`INSERT INTO conceptualize.concept_revisions (concept_id, revision, name, abstraction, maturity_at_creation, source_kind, created_at, created_by) VALUES ($1,$2,'Old concept','system','defined','user',$3,'eli')`, [CONCEPT, rev, t])
  }
  await pool.query(`INSERT INTO conceptualize.concept_statements (concept_id, revision, ordinal, statement_id, kind, text, basis) VALUES ($1,1,0,$2,'assumption','Old revision assumption','assumption')`, [CONCEPT, S1])
  await pool.query(`INSERT INTO conceptualize.concept_statements (concept_id, revision, ordinal, statement_id, kind, text, basis, quantity) VALUES ($1,2,0,$2,'assumption','Duty cycle below 30 %','assumption','{"max": 30, "unit": "%"}')`, [CONCEPT, S2])
  await pool.query(`INSERT INTO conceptualize.concept_statements (concept_id, revision, ordinal, statement_id, kind, text, basis) VALUES ($1,2,1,$2,'constraint','Supply voltage','ai-hypothesis')`, [CONCEPT, S3])
  await pool.query(`INSERT INTO conceptualize.evidence (id, project_id, key, concept_id, concept_revision, kind, title, basis, created_at, created_by) VALUES ($1,'PRJ-OLD','EVD-001',$2,2,'calculation','Old estimate','estimate',$3,'eli')`, [EVD, CONCEPT, t])
  await pool.query(`INSERT INTO conceptualize.decisions (id, project_id, key, title, rationale, subject_id, outcomes, status, proposed_by, proposed_at, recorded_by, recorded_at) VALUES (gen_random_uuid(),'PRJ-OLD','DEC-001','Old decision','Because',$1,'[]','recorded','eli',$2,'rui',$2)`, [CONCEPT, t])
  await pool.query(`COMMIT`)
})

afterAll(async () => {
  await pool?.end()
  await dropDatabase(admin(), name)
  rmSync(dir, { recursive: true, force: true })
})

describe('migration 0002 on old data (ADR-0009)', () => {
  it('applies additively and keeps every old row unchanged', async () => {
    const before = (await pool.query(`SELECT * FROM conceptualize.concept_statements ORDER BY revision, ordinal`)).rows
    const evidenceBefore = (await pool.query(`SELECT * FROM conceptualize.evidence`)).rows
    const result = await migrateConcepts(pool)
    expect(result.applied).toEqual(['0002_design_knowledge.sql', '0003_r1_link_vocabulary.sql', '0004_pm_artifact_modules.sql', '0005_evidence_results.sql', '0006_calculation_models.sql'])
    expect((await pool.query(`SELECT * FROM conceptualize.concept_statements ORDER BY revision, ordinal`)).rows).toEqual(before)
    expect((await pool.query(`SELECT * FROM conceptualize.evidence`)).rows.map((r) => ({ ...r, applicability: undefined, manifest: undefined, source: undefined, assumption_ids: undefined, tool: undefined, results: undefined, calculation: undefined, qualifications: undefined }))).toEqual(evidenceBefore.map((r) => ({ ...r, applicability: undefined, manifest: undefined, source: undefined, assumption_ids: undefined, tool: undefined, results: undefined, calculation: undefined, qualifications: undefined })))
    expect((await migrateConcepts(pool)).applied).toEqual([])
  })

  it('creates one Assumption per assumption statement of the current revision, referencing it', async () => {
    const { rows } = await pool.query(`SELECT a.key, a.validation_status, v.statement, v.quantity, v.basis, v.origin, v.scope, v.source_kind, v.change_reason FROM conceptualize.assumptions a JOIN conceptualize.assumption_revisions v ON v.assumption_id = a.id`)
    expect(rows).toEqual([
      {
        key: 'ASM-001',
        validation_status: 'unvalidated',
        statement: 'Duty cycle below 30 %',
        quantity: { max: 30, unit: '%' },
        basis: 'assumption',
        origin: { conceptId: CONCEPT, statementId: S2 },
        scope: { subjects: [{ module: 'conceptualize', type: 'concept', id: CONCEPT }], applicability: '' },
        source_kind: 'system',
        change_reason: 'migrated from statement',
      },
    ])
    expect((await pool.query(`SELECT next_value FROM conceptualize.key_counters WHERE project_id = 'PRJ-OLD' AND prefix = 'ASM'`)).rows[0].next_value).toBe(2)
  })

  it('keeps old decisions valid with empty extensions', async () => {
    const { rows } = await pool.query(`SELECT key, validity, support, assumption_refs, constraint_refs, affected, invalidation_conditions, review_flags FROM conceptualize.decisions`)
    expect(rows).toEqual([{ key: 'DEC-001', validity: 'valid', support: [], assumption_refs: [], constraint_refs: [], affected: [], invalidation_conditions: [], review_flags: [] }])
  })

  it('gives old evidence its Concept as subject and widens the basis vocabulary', async () => {
    expect((await pool.query(`SELECT * FROM conceptualize.evidence_subjects`)).rows).toEqual([{ evidence_id: EVD, subject_type: 'concept', subject_id: CONCEPT, subject_revision: 2 }])
    await pool.query(`BEGIN`)
    await pool.query(`INSERT INTO conceptualize.concept_revisions (concept_id, revision, name, abstraction, maturity_at_creation, source_kind, created_at, created_by) VALUES ($1,3,'Old concept','system','defined','user',now(),'eli')`, [CONCEPT])
    await pool.query(`INSERT INTO conceptualize.concept_statements (concept_id, revision, ordinal, statement_id, kind, text, basis) VALUES ($1,3,0,gen_random_uuid(),'note','Qualitative','assessment')`, [CONCEPT])
    await pool.query(`ROLLBACK`)
  })
})

describe('migration 0003 on data in the 0002 format (R1 link vocabulary)', () => {
  let pool3: pg.Pool
  let name3: string
  let dir3: string
  beforeAll(async () => {
    name3 = `ews_test_${randomBytes(5).toString('hex')}`
    await ensureDatabase(admin(), name3)
    const u = new URL(admin())
    u.pathname = `/${name3}`
    pool3 = new pg.Pool({ connectionString: u.toString(), max: 4 })
    dir3 = mkdtempSync(join(tmpdir(), 'con-mig3-'))
    for (const f of ['0001_initial.sql', '0002_design_knowledge.sql']) copyFileSync(join(CONCEPT_MIGRATIONS_DIR, f), join(dir3, f))
    await migrate(pool3, { schema: 'conceptualize', directory: dir3 })
    await pool3.query(`INSERT INTO conceptualize.link_types (name, label, inverse, from_types, to_types, description, created_by) VALUES ('thermal:rejects-heat-to', 'rejects heat to', 'receives heat from', '{concept}', '{concept}', 'User type', 'ada')`)
  })
  afterAll(async () => {
    await pool3?.end()
    await dropDatabase(admin(), name3)
    rmSync(dir3, { recursive: true, force: true })
  })

  it('adds propagation and artifact modules, widens built-in endpoints and leaves user-registered types unchanged', async () => {
    const before = (await pool3.query(`SELECT name, label, inverse, from_types, to_types, description, created_by FROM conceptualize.link_types WHERE NOT builtin`)).rows
    expect((await migrateConcepts(pool3)).applied).toEqual(['0003_r1_link_vocabulary.sql', '0004_pm_artifact_modules.sql', '0005_evidence_results.sql', '0006_calculation_models.sql'])
    const custom = (await pool3.query(`SELECT name, label, inverse, from_types, to_types, description, created_by, propagation, artifact_modules FROM conceptualize.link_types WHERE NOT builtin`)).rows
    expect(custom).toEqual(before.map((r) => ({ ...r, propagation: 'to-from', artifact_modules: null })))
    const builtin = Object.fromEntries((await pool3.query(`SELECT name, propagation, artifact_modules, from_types FROM conceptualize.link_types WHERE builtin`)).rows.map((r) => [r.name, r]))
    expect(builtin.formalizes).toMatchObject({ propagation: 'both', artifact_modules: ['requirements'] })
    expect(builtin['verified-by'].artifact_modules).toEqual(['twin'])
    expect(builtin.constrains.propagation).toBe('from-to')
    expect(builtin['depends-on'].from_types).toContain('trade-study')
  })
})

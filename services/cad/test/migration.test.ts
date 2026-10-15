import '../../api/test/providedContext'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import { inject, afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dropDatabase, ensureDatabase } from '../../api/src/database'
import { testDbUrl } from '../../api/test/helpers'
import { CAD_MIGRATIONS, migrateCad } from '../src/db/migrate'

/**
 * Migration 0002 on data stored by migration 0001 (fixture of the old format): additive only;
 * existing documents, revisions and events keep their data, old events gain kind and name.
 */
const name = `ews_test_cadmig${randomBytes(5).toString('hex')}`
let pool: pg.Pool
let only0001: string

beforeAll(async () => {
  await ensureDatabase(inject('pgAdminUrl'), name)
  pool = new pg.Pool({ connectionString: testDbUrl(name), max: 4 })
  only0001 = mkdtempSync(join(tmpdir(), 'cad-mig-'))
  copyFileSync(join(CAD_MIGRATIONS, '0001_cad.sql'), join(only0001, '0001_cad.sql'))
})
afterAll(async () => {
  await pool?.end()
  await dropDatabase(inject('pgAdminUrl'), name)
  rmSync(only0001, { recursive: true, force: true })
})

describe('cad schema migrations', () => {
  it('0002 adds event descriptors without rewriting stored documents, revisions or events', async () => {
    expect((await migrateCad(pool, only0001)).applied).toEqual(['0001_cad.sql'])
    const doc = randomUUID()
    const event = randomUUID()
    const content = { formatVersion: '1.0.0', documentId: doc, metadata: { title: 'Old plate' }, parts: [] }
    await pool.query(`INSERT INTO cad.documents (id, project_id, title, current_revision, created_at, created_by, updated_at, updated_by) VALUES ($1, 'PRJ-OLD', 'Old plate', 1, now(), 'eli', now(), 'eli')`, [doc])
    await pool.query(
      `INSERT INTO cad.document_revisions (document_id, revision, content, format_version, model_version, title, part_count, feature_count, content_hash, message, actor, source_kind, created_at)
       VALUES ($1, 1, $2, '1.0.0', 1, 'Old plate', 0, 0, 'h', 'first', 'eli', 'user', now())`,
      [doc, JSON.stringify(content)],
    )
    await pool.query(`INSERT INTO cad.outbox (event_id, project_id, type, document_id, revision, occurred_at, actor, source_kind) VALUES ($1, 'PRJ-OLD', 'cad.document-created', $2, 1, now(), 'eli', 'user')`, [event, doc])
    const before = (await pool.query('SELECT * FROM cad.document_revisions')).rows

    const result = await migrateCad(pool)
    expect(result.applied).toEqual(['0002_event_descriptors.sql'])
    expect(result.alreadyApplied).toEqual(['0001_cad.sql'])
    expect((await pool.query('SELECT * FROM cad.document_revisions')).rows).toEqual(before)
    const { rows } = await pool.query('SELECT * FROM cad.outbox WHERE event_id = $1', [event])
    expect(rows[0]).toMatchObject({ type: 'cad.document-created', revision: 1, actor: 'eli', kind: 'cad-document', name: 'Old plate', parts: null })
    expect((await migrateCad(pool)).applied).toEqual([])
  })
})

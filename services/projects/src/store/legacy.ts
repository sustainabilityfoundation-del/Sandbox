import type { Pool } from 'pg'

/**
 * Registers the existing example project PRJ-ACT100 in the project registry (coordinator answer Q3, 15 October
 * 2026). Additive and idempotent: if the registry already knows the project nothing changes; module data and
 * memberships are not touched (the platform seed already made the development users members). The project keeps
 * its ID; key ACT100; template `example-actuator` marks it as the preserved example (fixture), not a blank project.
 * Called from the host's development seed only (never in production, where the example does not exist).
 */
export const LEGACY_PROJECT = {
  id: 'PRJ-ACT100',
  key: 'ACT100',
  name: 'ACT-100 Linear actuator',
  description: 'The platform’s example project: a linear actuator (housing, rod, motor) used by every module’s examples. Preserved as a fixture; its IDs (REQ-001, SYS-…, CAD-…, ACT-100) are unchanged.',
  templateId: 'example-actuator',
  owner: 'ada',
} as const

export async function seedLegacyProject(pool: Pool): Promise<{ seeded: boolean; message: string }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const exists = await client.query('SELECT 1 FROM projects.projects WHERE id = $1', [LEGACY_PROJECT.id])
    if (exists.rowCount) {
      await client.query('ROLLBACK')
      return { seeded: false, message: 'Projects: PRJ-ACT100 already registered.' }
    }
    const { rows } = await client.query<{ now: Date }>('SELECT now() AS now')
    const now = rows[0].now
    const p = LEGACY_PROJECT
    const inserted = await client.query(
      `INSERT INTO projects.projects (id, key, name, description, disciplines, status, template_id, owner_id, tags, legacy, created_at, created_by, updated_at, updated_by)
       VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8,true,$9,'import',$9,'import') ON CONFLICT DO NOTHING RETURNING *`,
      [p.id, p.key, p.name, p.description, ['systems', 'mechanical', 'electrical', 'software'], p.templateId, p.owner, ['example'], now],
    )
    if (!inserted.rowCount) {
      await client.query('ROLLBACK')
      return { seeded: false, message: 'Projects: the key ACT100 is taken; PRJ-ACT100 not registered.' }
    }
    await client.query(`INSERT INTO projects.project_revisions (project_id, revision, snapshot, changed_at, changed_by, summary, source_kind) VALUES ($1, 1, $2, $3, 'import', 'Registered the existing example project', 'import')`, [
      p.id,
      JSON.stringify(inserted.rows[0]),
      now,
    ])
    await client.query(`INSERT INTO projects.creation_records (project_id, template_id, template_version, requested, created_at, created_by) VALUES ($1, $2, 1, $3, $4, 'import')`, [p.id, p.templateId, JSON.stringify({ legacy: true }), now])
    await client.query(`INSERT INTO projects.audit_events (project_id, entity_type, entity_id, action, revision, actor, occurred_at, source_kind, details) VALUES ($1, 'project', $1, 'registered-legacy', 1, 'import', $2, 'import', '{}')`, [p.id, now])
    await client.query('COMMIT')
    return { seeded: true, message: 'Projects: registered the example project PRJ-ACT100.' }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw e
  } finally {
    client.release()
  }
}

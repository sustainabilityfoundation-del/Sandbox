import type { PoolClient } from 'pg'
import type { Role } from '@ews/requirements-service'

/**
 * Platform membership port (CR-PM-API-1). `platform.project_memberships` stays the single authorization source
 * for every service; Project Management manages it only through this port. Each call runs on the caller's
 * client, inside the caller's transaction (all schemas share one PostgreSQL database), so creating a project and
 * making its creator the administrator commit together. Every change appends to `platform.membership_events`.
 */
export type Queryable = Pick<PoolClient, 'query'>

export interface MembershipPort {
  set(db: Queryable, input: { projectId: string; userId: string; role: Role; actor: string }): Promise<void>
  remove(db: Queryable, input: { projectId: string; userId: string; actor: string }): Promise<void>
  list(db: Queryable, projectId: string): Promise<{ userId: string; name: string; role: Role }[]>
  projectsOf(db: Queryable, userId: string): Promise<{ projectId: string; role: Role }[]>
  userExists(db: Queryable, userId: string): Promise<boolean>
}

export function platformMemberships(): MembershipPort {
  return {
    async set(db, { projectId, userId, role, actor }) {
      await db.query(
        `INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [projectId, userId, role],
      )
      await db.query(`INSERT INTO platform.membership_events (project_id, user_id, role, action, actor) VALUES ($1, $2, $3, 'set', $4)`, [projectId, userId, role, actor])
    },
    async remove(db, { projectId, userId, actor }) {
      await db.query('DELETE FROM platform.project_memberships WHERE project_id = $1 AND user_id = $2', [projectId, userId])
      await db.query(`INSERT INTO platform.membership_events (project_id, user_id, role, action, actor) VALUES ($1, $2, NULL, 'removed', $3)`, [projectId, userId, actor])
    },
    async list(db, projectId) {
      const { rows } = await db.query<{ user_id: string; name: string; role: Role }>(
        `SELECT m.user_id, u.name, m.role FROM platform.project_memberships m JOIN platform.users u ON u.id = m.user_id WHERE m.project_id = $1 ORDER BY m.user_id`,
        [projectId],
      )
      return rows.map((r) => ({ userId: r.user_id, name: r.name, role: r.role }))
    },
    async projectsOf(db, userId) {
      const { rows } = await db.query<{ project_id: string; role: Role }>('SELECT project_id, role FROM platform.project_memberships WHERE user_id = $1 ORDER BY project_id', [userId])
      return rows.map((r) => ({ projectId: r.project_id, role: r.role }))
    },
    async userExists(db, userId) {
      const { rowCount } = await db.query('SELECT 1 FROM platform.users WHERE id = $1 AND active', [userId])
      return !!rowCount
    },
  }
}

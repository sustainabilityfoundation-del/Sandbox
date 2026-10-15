/**
 * What the API host supplies to the Project Management plugin (docs/modules/projects/architecture.md §4).
 * Framework-free types; the host implements them (services/api), tests use labelled stand-ins.
 */
import type { PoolClient } from 'pg'
import type { Role } from './domain/rules'

export type Queryable = Pick<PoolClient, 'query'>

/** The authenticated caller, resolved by the host (development identities or production auth). */
export interface Principal {
  userId: string
  entitlements: string[]
}

/**
 * Platform membership port (CR-PM-API-1). Runs inside the caller's transaction (both schemas are in one
 * PostgreSQL database), so creating a project and making its creator the administrator commit together.
 * `platform.project_memberships` stays the single authorization source for every service.
 */
export interface MembershipPort {
  set(db: Queryable, input: { projectId: string; userId: string; role: Role; actor: string }): Promise<void>
  remove(db: Queryable, input: { projectId: string; userId: string; actor: string }): Promise<void>
  list(db: Queryable, projectId: string): Promise<{ userId: string; name: string; role: Role }[]>
  /** Projects a user is a member of, with the role (for the project list). */
  projectsOf(db: Queryable, userId: string): Promise<{ projectId: string; role: Role }[]>
  userExists(db: Queryable, userId: string): Promise<boolean>
}

export type SettingValue = boolean | number | string | null

/**
 * Project-scoped settings (CR-PM-SET-1). Implemented by the host over the settings service; until that
 * service is on main the plugin runs without it or with the labelled contract-test adapter.
 */
export interface ProjectSettingsPort {
  readonly description: string
  /** Writes project-scoped values as `actor` (an administrator); validated by the settings registry. */
  write(projectId: string, values: Record<string, SettingValue>, actor: string): Promise<{ revision: number }>
  /** Effective project-scoped values. */
  read(projectId: string): Promise<Record<string, SettingValue>>
}

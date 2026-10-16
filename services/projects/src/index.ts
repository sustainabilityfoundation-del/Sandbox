/**
 * @ews/projects-service: the Project Management service. Owns the PostgreSQL schema `projects`, its migrations,
 * the HTTP routes (a Fastify plugin hosted by @ews/api at /api/projects/v1), the transactional outbox, the
 * content-addressed blob store and the OpenAPI document. Other modules use the HTTP API or the SDK
 * ProjectsService, never these tables (docs/modules/projects).
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Pool } from 'pg'
import { migrate, type MigrationResult } from './db/migrate'

export { projectsPlugin, type ProjectsPluginOptions } from './http/plugin'
export { buildOpenApi, BASE_PATH as PROJECTS_BASE_PATH, API_VERSION as PROJECTS_API_VERSION } from './http/openapi'
export { createEventHub as createProjectsEventHub, type EventHub as ProjectsEventHub } from './events/hub'
export { localBlobStore, memoryBlobStore, BlobIntegrityError, BlobNotFoundError, type BlobStore } from './blob/blobStore'
export { ServiceError as ProjectsError } from './errors'
export type { MembershipPort, ProjectSettingsPort, Principal, Queryable, SettingValue } from './ports'
export { PERMISSIONS as PROJECT_PERMISSIONS, LINK_RULES as PROJECT_LINK_RULES, TEMPLATES as PROJECT_TEMPLATES, ROLES as PROJECT_ROLES, type Role as ProjectRole } from './domain/rules'
export { PROJECT_SETTINGS_PAGE, PROJECT_SETTING_DEFINITIONS, moduleEnablementDefinitions, checkProjectSetting } from './domain/settings'

export const PROJECTS_MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'db', 'migrations')

/** Applies the `projects` schema migrations. */
export function migrateProjects(pool: Pool): Promise<MigrationResult> {
  return migrate(pool, { schema: 'projects', directory: PROJECTS_MIGRATIONS_DIR })
}

/** Record state of a project for the host's roleOf (CR-PM-API-4): undefined when the registry does not know it. */
export async function projectState(pool: Pool, projectId: string): Promise<'active' | 'archived' | 'deleted' | undefined> {
  const { rows } = await pool.query<{ state: 'active' | 'archived' | 'deleted' }>('SELECT state FROM projects.projects WHERE id = $1', [projectId])
  return rows[0]?.state
}
export { seedLegacyProject, LEGACY_PROJECT } from './store/legacy'
export { productTwinDirectory, composeTwinDirectories, type TwinDirectoryLike, type TwinObjectInfo } from './twinDirectory'
export { importLegacyProduct, LEGACY_COMPONENTS, LEGACY_ELEMENT_IDS } from './store/legacyProduct'
export { runProvisioning, type ProvisioningModule } from './provisioning'
export { NEW_PROJECT_TOOLS, LEGACY_PROJECT_TOOLS, workspaceDefaults } from './domain/workspace'
export { reconcileProject, describeAndRegister, startRegistryConsumer, upsertDescriptor, type ReconcileReport } from './registry'
export { projectsServerManifest } from './manifest'

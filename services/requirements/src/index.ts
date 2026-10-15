/**
 * @ews/requirements-service: the Requirements Management service. Owns the PostgreSQL schema
 * `requirements`, its migrations and seed, the HTTP routes (a Fastify plugin hosted by @ews/api),
 * the transactional outbox and the OpenAPI document. Other modules use the HTTP API or the SDK
 * contract, never these tables.
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Pool } from 'pg'
import { migrate, type MigrationResult } from './db/migrate'

export { migrate, listMigrations, type MigrationResult, type MigrationSource } from './db/migrate'
export { requirementsPlugin, type RequirementsPluginOptions } from './http/plugin'
export { buildOpenApi, BASE_PATH, API_VERSION } from './http/openapi'
export type { HostServices, Principal, RouteSpec } from './http/route'
export { errorBody } from './http/route'
export { createEventHub, type EventHub } from './events/hub'
export { localObjectStorage, memoryObjectStorage, type ObjectStorage } from './storage'
export { staticTwinDirectory, composeTwinDirectory, ALLOCATABLE_TYPES, type TwinDirectory, type TwinObjectInfo } from './twin'
export { seedRequirements, LEGACY_UUIDS, SEED_IDS, SEED_PROJECT } from './seed'
export { ServiceError } from './errors'
export { PERMISSIONS, ROLES, RELATIONSHIP_RULES, TRANSITIONS, roleAllows, type Role, type Permission } from './domain/rules'
export { DEFAULT_CONVENTIONS, checkRequirement, QUALITY_DISCLAIMER, type QualityFinding, type WritingConventions } from './quality/rules'

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'db', 'migrations')

/** Applies the `requirements` schema migrations. */
export function migrateRequirements(pool: Pool): Promise<MigrationResult> {
  return migrate(pool, { schema: 'requirements', directory: MIGRATIONS_DIR })
}
export { createRequirementsArtifactSource, toArtifactChange, requirementLifecycle, REQUIREMENT_ARTIFACT_KINDS, ARTIFACT_MODULE } from './artifacts'

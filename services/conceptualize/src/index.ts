/**
 * @ews/conceptualize-service: the Conceptualize service. Owns the PostgreSQL schema `conceptualize`,
 * its migrations and seed, the HTTP routes (a Fastify plugin hosted by @ews/api), the transactional
 * outbox and the OpenAPI document. Other modules use the HTTP API or the SDK ConceptsService, never
 * these tables (docs/specifications/conceptualize-contracts.md).
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Pool } from 'pg'
import { migrate, type MigrationResult } from './db/migrate'

export { conceptsPlugin, type ConceptsPluginOptions } from './http/plugin'
export { buildOpenApi, BASE_PATH as CONCEPTS_BASE_PATH, API_VERSION as CONCEPTS_API_VERSION } from './http/openapi'
export { createEventHub as createConceptsEventHub, type EventHub as ConceptsEventHub } from './events/hub'
export { seedConcepts, seedDesignKnowledge, SEED_IDS as CONCEPT_SEED_IDS, SEED_REQUIREMENTS as CONCEPT_SEED_REQUIREMENTS, FUNCTION_SEED_IDS, CONSTRAINT_SEED_IDS } from './seed'
export { ServiceError as ConceptsError } from './errors'
export { PERMISSIONS as CONCEPT_PERMISSIONS, RELATIONSHIP_RULES as CONCEPT_RELATIONSHIP_RULES, MATURITIES, BASES, STATEMENT_KINDS, wouldCreateCycle } from './domain/rules'
export { parseUnit, convert, sameDimension, dimensionName, quantityProblem, COMMON_UNITS } from './domain/units'
export { evaluateStudy, TRADE_METHOD } from './domain/tradeStudy'
export { assess } from './domain/assessment'

export const CONCEPT_MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'db', 'migrations')

/** Applies the `conceptualize` schema migrations. */
export function migrateConcepts(pool: Pool): Promise<MigrationResult> {
  return migrate(pool, { schema: 'conceptualize', directory: CONCEPT_MIGRATIONS_DIR })
}
export { createConceptsArtifactSource, CONCEPTS_ARTIFACT_KINDS, lifecycleOf as conceptsLifecycleOf } from './artifactSource'

import type { Pool } from 'pg'
import { MIGRATIONS_DIR, listMigrations, migrateRequirements, type MigrationResult } from '@ews/requirements-service'
import { CONCEPT_MIGRATIONS_DIR, migrateConcepts } from '@ews/conceptualize-service'
import { PROJECTS_MIGRATIONS_DIR, migrateProjects } from '@ews/projects-service'
import { SETTINGS_MIGRATIONS, migrateSettings } from '@ews/settings-service'
import { ASSISTANT_MIGRATIONS, migrateAssistant } from '@ews/assistant-service'
import { VISUALIZATION_MIGRATIONS, migrateVisualization } from '@ews/visualization-service'
import { SYSML_MIGRATIONS, migrateSysml } from '@ews/sysml-service'
import { CAD_MIGRATIONS, migrateCad } from '@ews/cad-service'
import { PLATFORM_MIGRATIONS, migratePlatform } from './platform/identity'

/**
 * One command for every schema. Each module keeps its own migrations and its own runner (schema_migrations, SHA-256
 * checksums, a per-schema advisory lock); this file only lists them in a fixed order and calls them. No second framework.
 * Order: the order `prepareDatabase` already used (platform, requirements, conceptualize, projects), then the five modules
 * that migrate when their plugin starts (settings, assistant, visualization, sysml, cad).
 */
export interface SchemaMigrations {
  schema: string
  directory: string
  migrate: (pool: Pool) => Promise<MigrationResult>
}

export const SCHEMA_MIGRATIONS: readonly SchemaMigrations[] = [
  { schema: 'platform', directory: PLATFORM_MIGRATIONS, migrate: migratePlatform },
  { schema: 'requirements', directory: MIGRATIONS_DIR, migrate: migrateRequirements },
  { schema: 'conceptualize', directory: CONCEPT_MIGRATIONS_DIR, migrate: migrateConcepts },
  { schema: 'projects', directory: PROJECTS_MIGRATIONS_DIR, migrate: migrateProjects },
  { schema: 'settings', directory: SETTINGS_MIGRATIONS, migrate: (pool) => migrateSettings(pool) },
  { schema: 'assistant', directory: ASSISTANT_MIGRATIONS, migrate: (pool) => migrateAssistant(pool) },
  { schema: 'visualization', directory: VISUALIZATION_MIGRATIONS, migrate: (pool) => migrateVisualization(pool) },
  { schema: 'sysml', directory: SYSML_MIGRATIONS, migrate: (pool) => migrateSysml(pool) },
  { schema: 'cad', directory: CAD_MIGRATIONS, migrate: (pool) => migrateCad(pool) },
]

/** Applies every pending migration of every schema, in order. Throws on the first failure (earlier schemas stay applied). Idempotent. */
export async function migrateAll(pool: Pool, schemas: readonly SchemaMigrations[] = SCHEMA_MIGRATIONS): Promise<MigrationResult[]> {
  const results: MigrationResult[] = []
  for (const s of schemas) results.push(await s.migrate(pool))
  return results
}

export interface SchemaStatus {
  schema: string
  /** Versions in the image (files) and recorded in the database. */
  expected: number
  applied: number
  /** File names present in the image but not applied. */
  pending: string[]
  /** File names applied whose checksum differs from the file in the image. */
  drift: string[]
  /** Versions recorded in the database that this image does not know (e.g. an older image on a newer schema). Informational. */
  unknown: string[]
}

export interface MigrationStatus {
  /** True when nothing is pending and nothing drifted. */
  current: boolean
  pending: number
  drift: number
  schemas: SchemaStatus[]
}

let fileCache: Map<string, ReturnType<typeof listMigrations>> | undefined

/** Read-only: compares the migration files in this image with each schema's `schema_migrations` table. Changes nothing. */
export async function checkMigrations(pool: Pool, schemas: readonly SchemaMigrations[] = SCHEMA_MIGRATIONS): Promise<MigrationStatus> {
  fileCache ??= new Map()
  const out: SchemaStatus[] = []
  for (const s of schemas) {
    let files = fileCache.get(s.directory)
    if (!files) {
      files = listMigrations(s.directory)
      fileCache.set(s.directory, files)
    }
    const exists = await pool.query<{ ok: boolean }>('SELECT to_regclass($1) IS NOT NULL AS ok', [`${s.schema}.schema_migrations`])
    const done = new Map<string, string>()
    if (exists.rows[0]?.ok) {
      for (const r of (await pool.query<{ version: string; checksum: string }>(`SELECT version, checksum FROM ${s.schema}.schema_migrations`)).rows) done.set(r.version, r.checksum)
    }
    const pending: string[] = []
    const drift: string[] = []
    for (const f of files) {
      const checksum = done.get(f.version)
      if (checksum === undefined) pending.push(f.name)
      else if (checksum !== f.checksum) drift.push(f.name)
    }
    const known = new Set(files.map((f) => f.version))
    out.push({ schema: s.schema, expected: files.length, applied: done.size, pending, drift, unknown: [...done.keys()].filter((v) => !known.has(v)).sort() })
  }
  const pending = out.reduce((n, s) => n + s.pending.length, 0)
  const drift = out.reduce((n, s) => n + s.drift.length, 0)
  return { current: pending === 0 && drift === 0, pending, drift, schemas: out }
}

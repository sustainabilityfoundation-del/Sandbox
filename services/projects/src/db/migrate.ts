import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Pool } from 'pg'

/**
 * Version-controlled SQL migrations. Files are named `NNNN_description.sql` and applied in order,
 * each in its own transaction, recorded in `<schema>.schema_migrations` with a checksum. An applied
 * migration whose file changed is refused (migrations are append-only; fix forward with a new file).
 */
export interface MigrationResult {
  schema: string
  applied: string[]
  alreadyApplied: string[]
}

export interface MigrationSource {
  /** Schema that owns the migrations table, e.g. 'requirements'. */
  schema: string
  /** Directory with NNNN_*.sql files. */
  directory: string
}

const FILE = /^(\d{4})_[\w-]+\.sql$/

export function listMigrations(directory: string): { version: string; name: string; sql: string; checksum: string }[] {
  return readdirSync(directory)
    .filter((f) => FILE.test(f))
    .sort()
    .map((name) => {
      // Line endings are normalised so a Windows checkout (CRLF) has the same checksum as LF.
      const sql = readFileSync(join(directory, name), 'utf8').replace(/\r\n/g, '\n')
      return { version: name.slice(0, 4), name, sql, checksum: createHash('sha256').update(sql).digest('hex') }
    })
}

export async function migrate(pool: Pool, source: MigrationSource): Promise<MigrationResult> {
  const { schema } = source
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`Invalid schema name ${schema}`)
  const client = await pool.connect()
  try {
    // Serialise concurrent migrators (e.g. two API processes starting together).
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [`migrate:${schema}`])
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${schema}.schema_migrations (version text PRIMARY KEY, name text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`,
    )
    const done = new Map(
      (await client.query<{ version: string; checksum: string; name: string }>(`SELECT version, checksum, name FROM ${schema}.schema_migrations`)).rows.map((r) => [r.version, r]),
    )
    const result: MigrationResult = { schema, applied: [], alreadyApplied: [] }
    for (const m of listMigrations(source.directory)) {
      const existing = done.get(m.version)
      if (existing) {
        if (existing.checksum !== m.checksum) {
          throw new Error(`Migration ${m.name} was changed after it was applied (checksum mismatch). Add a new migration instead.`)
        }
        result.alreadyApplied.push(m.name)
        continue
      }
      await client.query('BEGIN')
      try {
        await client.query(m.sql)
        await client.query(`INSERT INTO ${schema}.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)`, [m.version, m.name, m.checksum])
        await client.query('COMMIT')
        result.applied.push(m.name)
      } catch (error) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${m.name} failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return result
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`migrate:${schema}`]).catch(() => undefined)
    client.release()
  }
}

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Pool } from 'pg'

/**
 * Append-only SQL migrations for schema `cad` (`NNNN_name.sql`, applied in order, one transaction
 * each, recorded with a checksum). Same conventions as the other platform services; a shared runner
 * is change request CR-SYSML-06 (copied from services/sysml).
 */
export const CAD_MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

export interface MigrationResult {
  schema: string
  applied: string[]
  alreadyApplied: string[]
}

export async function migrateCad(pool: Pool, directory = CAD_MIGRATIONS): Promise<MigrationResult> {
  const schema = 'cad'
  const files = readdirSync(directory).filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f)).sort()
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [`migrate:${schema}`])
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
    await client.query(`CREATE TABLE IF NOT EXISTS ${schema}.schema_migrations (version text PRIMARY KEY, name text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`)
    const done = new Map((await client.query<{ version: string; checksum: string }>(`SELECT version, checksum FROM ${schema}.schema_migrations`)).rows.map((r) => [r.version, r.checksum]))
    const result: MigrationResult = { schema, applied: [], alreadyApplied: [] }
    for (const name of files) {
      const sql = readFileSync(join(directory, name), 'utf8').replace(/\r\n/g, '\n')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const version = name.slice(0, 4)
      const existing = done.get(version)
      if (existing) {
        if (existing !== checksum) throw new Error(`Migration ${name} was changed after it was applied (checksum mismatch). Add a new migration instead.`)
        result.alreadyApplied.push(name)
        continue
      }
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(`INSERT INTO ${schema}.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)`, [version, name, checksum])
        await client.query('COMMIT')
        result.applied.push(name)
      } catch (e) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${name} failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    return result
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`migrate:${schema}`]).catch(() => undefined)
    client.release()
  }
}

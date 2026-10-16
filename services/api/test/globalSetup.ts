import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestProject } from 'vitest/node'
import { startEmbedded } from '../src/database'

import './providedContext'

/** Starts a disposable real PostgreSQL server for the test run (or uses EWS_TEST_PG_ADMIN_URL). */
export default async function setup(project: TestProject) {
  const external = process.env.EWS_TEST_PG_ADMIN_URL
  if (external) {
    project.provide('pgAdminUrl', external)
    return
  }
  const dir = mkdtempSync(join(tmpdir(), 'ews-pg-test-'))
  const port = 55000 + Math.floor(Math.random() * 4000)
  // Every test file runs a full API host (a pool of 15 plus event-hub listeners) in parallel; the default 100
  // connections are not enough for the whole run under load.
  const handle = await startEmbedded({ port, dataDir: join(dir, 'data'), user: 'postgres', password: 'test-only', persistent: false, postgresFlags: ['-c', 'max_connections=400'] }, () => undefined)
  project.provide('pgAdminUrl', handle.adminUrl)
  return async () => {
    await handle.stop()
    rmSync(dir, { recursive: true, force: true })
  }
}

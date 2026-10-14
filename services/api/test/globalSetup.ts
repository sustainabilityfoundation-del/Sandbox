import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestProject } from 'vitest/node'
import { startEmbedded } from '../src/database'

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string
  }
}

/** Starts a disposable real PostgreSQL server for the test run (or uses EWS_TEST_PG_ADMIN_URL). */
export default async function setup(project: TestProject) {
  const external = process.env.EWS_TEST_PG_ADMIN_URL
  if (external) {
    project.provide('pgAdminUrl', external)
    return
  }
  const dir = mkdtempSync(join(tmpdir(), 'ews-pg-test-'))
  const port = 55000 + Math.floor(Math.random() * 4000)
  const handle = await startEmbedded({ port, dataDir: join(dir, 'data'), user: 'postgres', password: 'test-only', persistent: false }, () => undefined)
  project.provide('pgAdminUrl', handle.adminUrl)
  return async () => {
    await handle.stop()
    rmSync(dir, { recursive: true, force: true })
  }
}

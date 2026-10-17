import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestProject } from 'vitest/node'
import { startEmbedded } from '../src/database'

import './providedContext'

/** Starts a disposable real PostgreSQL server for the test run (or uses EWS_TEST_PG_ADMIN_URL). */
export default async function setup(project: TestProject) {
  // Automated runs never reach a real AI provider: a key or mode in the shell of whoever runs the tests is dropped (ADR-0080).
  for (const name of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_AI_API_KEY', 'XAI_API_KEY', 'EWS_AI_MODE', 'EWS_ASSISTANT_FAKE_PROVIDER']) delete process.env[name]
  const external = process.env.EWS_TEST_PG_ADMIN_URL
  if (external) {
    project.provide('pgAdminUrl', external)
    return
  }
  const dir = mkdtempSync(join(tmpdir(), 'ews-pg-test-'))
  const port = 55000 + Math.floor(Math.random() * 4000)
  // Every test file creates its own database and several pools (one per hosted module), and files run in
  // parallel: the default of 100 connections is not enough for the whole suite.
  const handle = await startEmbedded({ port, dataDir: join(dir, 'data'), user: 'postgres', password: 'test-only', persistent: false, postgresFlags: ['-c', 'max_connections=500'] }, () => undefined)
  project.provide('pgAdminUrl', handle.adminUrl)
  // embedded-postgres registers async-exit-hook, which calls process.exit(0) on beforeExit and so would turn a
  // failed run into exit code 0. Keep the code vitest set (1 when a test failed).
  process.on('beforeExit', () => {
    const code = process.exitCode
    if (code) process.once('exit', () => (process.exitCode = code))
  })
  return async () => {
    await handle.stop()
    rmSync(dir, { recursive: true, force: true })
  }
}

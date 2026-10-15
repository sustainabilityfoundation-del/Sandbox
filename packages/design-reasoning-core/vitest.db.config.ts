import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Design reasoning scenarios on the REAL Conceptualize and Requirements APIs with a disposable PostgreSQL
 * (npm run reasoning:test:db). Same global setup as npm run concept:test:db (services/api/test/globalSetup.ts).
 */
export default defineConfig({
  root: resolve(__dirname, '../..'),
  test: {
    environment: 'node',
    include: ['packages/design-reasoning-core/test/**/*.db.test.ts'],
    globalSetup: ['services/api/test/globalSetup.ts'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
})

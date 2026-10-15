import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Project Management tests on a real, disposable PostgreSQL (npm run projects:test:db once the root script is
 * approved; until then: npx vitest run --config services/projects/vitest.db.config.ts). Same global setup as the
 * Requirements run; npm run req:test:db also includes these files (services/*\/test).
 */
export default defineConfig({
  root: resolve(__dirname, '../..'),
  test: {
    environment: 'node',
    include: ['services/projects/test/**/*.test.ts'],
    globalSetup: ['services/api/test/globalSetup.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
})

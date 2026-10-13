import { defineConfig } from 'vitest/config'

// One test run for the whole monorepo. Tests live next to the code they cover.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'apps/*/src/**/*.test.{ts,tsx}'],
  },
})

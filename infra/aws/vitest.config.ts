import { defineConfig } from 'vitest/config'

// Stack tests synthesise whole stacks (a few seconds each); they run offline and never contact AWS.
export default defineConfig({ test: { include: ['test/**/*.test.ts'], testTimeout: 120_000, environment: 'node' } })

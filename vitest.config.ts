import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // API calls may be slow
    include: ['src/**/*.test.ts'],
  },
})

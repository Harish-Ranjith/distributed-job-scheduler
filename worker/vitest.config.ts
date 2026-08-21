import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'worker',
    environment: 'node',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 60_000, // concurrency tests need extra time
    hookTimeout: 30_000,
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Mongoose registers models on a module-level singleton, so importing the
    // models in a second test file within the same process throws
    // OverwriteModelError. Give every test file its own process.
    pool: 'forks',
    poolOptions: { forks: { isolate: true, singleFork: false } },
    fileParallelism: true,
  },
});

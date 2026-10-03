import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    setupFiles: process.env.TEST_DATABASE_ENGINE === 'embedded' ? ['./test/setup-embedded.ts'] : [],
  },
});

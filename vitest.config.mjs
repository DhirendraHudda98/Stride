import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    include: ['tests/**/*.test.js']
  }
});

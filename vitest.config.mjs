import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      'node_modules',
      'dist',
      '**/*.test.mjs', // Node-based tests (stats-api.test.mjs, etc.)
    ],
  },
});

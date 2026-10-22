import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/*.test.js', // Include only vitest .test.js files
    ],
    exclude: [
      'node_modules',
      'dist',
    ],
  },
});

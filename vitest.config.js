import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
    include: ['test/**/*.{test,spec}.{js,mjs}'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        'tests/',
        'netlify/functions/migrate*.mjs',
        'netlify/functions/dump-blobs.mjs'
      ]
    }
  }
});

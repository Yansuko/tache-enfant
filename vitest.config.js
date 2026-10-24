import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
    include: ['test/**/*.test.js'], // les tests d'interface sont dans e2e/ (Playwright: npm run test:e2e)
    exclude: ['node_modules', 'dist'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        'tests/',
        'src/migrate*.mjs',
        'src/dump-blobs.mjs'
      ]
    }
  }
});

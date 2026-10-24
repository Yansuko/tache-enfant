import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 60000,
  reporter: 'list',
  // CHROMIUM_PATH: chemin d'un Chromium déjà installé (sinon `npx playwright install chromium`)
  use: { baseURL: 'http://localhost:3100', headless: true, launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3100/health',
    reuseExistingServer: false,
    timeout: 30000,
    env: { PORT: '3100', DATABASE_URL: 'sqlite://:memory:', JWT_SECRET: 'e2e-secret', ADMIN_KEY: 'e2e-admin', NODE_ENV: 'test' },
  },
});

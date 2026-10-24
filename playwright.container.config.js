import { defineConfig } from '@playwright/test';
// Les scénarios d'interface contre un conteneur déjà lancé (pour valider l'image elle-même), sans serveur du dépôt:
//   podman run -d --name dailykids-e2e -p 3100:3000 -e DATABASE_URL=sqlite://:memory: -e JWT_SECRET=e2e -e ADMIN_KEY=e2e-admin -e NODE_ENV=test <image>
//   npm run test:e2e:image
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 60000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3100', headless: true, launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
});

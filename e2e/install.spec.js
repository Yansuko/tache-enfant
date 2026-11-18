import { test, expect, newFamily, parentLogin, tab } from './helpers.js';

const btn = (page) => page.locator('[data-action="install-app"]');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

test('Chrome: beforeinstallprompt affiche le bouton, un clic ouvre la fenêtre d\'installation, appinstalled le masque', async ({ page, request }) => {
  const f = await newFamily(request);
  await page.goto('/');
  await expect(btn(page)).toHaveCount(0);
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    window.__prompts = 0;
    e.prompt = async () => { window.__prompts++; };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await expect(btn(page)).toBeVisible();
  await btn(page).click();
  expect(await page.evaluate(() => window.__prompts)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(btn(page)).toHaveCount(0);

  // dans l'onglet Famille
  const g = await newFamily(request);
  await page.reload();
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = async () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(e);
  });
  await page.getByPlaceholder('parent@email.fr').fill(g.email);
  await page.getByPlaceholder('••••••').fill(g.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.locator('.topbar')).toContainText('Fam');
  await tab(page, 'Famille');
  await expect(btn(page)).toBeVisible();
});

test('iPhone Safari: bouton visible, le clic explique comment ajouter à l\'écran d\'accueil', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:3100', userAgent: IPHONE });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(btn(page)).toBeVisible();
  await btn(page).click();
  await expect(page.locator('#main')).toContainText('Partager');
  await expect(page.locator('#main')).toContainText("Sur l'écran d'accueil");
  await ctx.close();
});

test('application déjà installée (standalone): aucun bouton', async ({ browser }) => {
  for (const init of [
    () => { const m = window.matchMedia.bind(window); window.matchMedia = q => q.includes('display-mode: standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : m(q); },
    () => Object.defineProperty(navigator, 'standalone', { value: true }),
  ]) {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:3100', userAgent: IPHONE });
    await ctx.addInitScript(init);
    const page = await ctx.newPage();
    await page.goto('/');
    await page.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = async () => {}; window.dispatchEvent(e); });
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
    await expect(btn(page)).toHaveCount(0);
    await ctx.close();
  }
});

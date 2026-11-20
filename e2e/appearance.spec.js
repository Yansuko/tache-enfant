import { test, expect, settle, newFamily, api, parentLogin, childLogin, tab, syncCycle } from './helpers.js';

// Menu Apparence (tâche 3 V2): réglage par profil (compte parent, enfant), synchronisé par le serveur (setAppearance);
// la position reste sur l'appareil. Coucher du soleil à Paris le 21/06/2026 ≈ 19:57 UTC, à New York ≈ 00:31 UTC le 22.
const BASE = 'http://localhost:3100';
const NIGHT_PARIS = new Date('2026-06-21T20:30:00Z');
const mk = async (browser, opts = {}) => {
  const ctx = await browser.newContext({ baseURL: BASE, ...opts });
  const page = await ctx.newPage();
  return { ctx, page };
};
const theme = page => page.evaluate(() => document.documentElement.dataset.theme);
const accent = page => page.evaluate(() => document.documentElement.style.getPropertyValue('--color-accent'));
const device = page => page.evaluate(() => JSON.parse(localStorage.getItem('dk-appearance')));
const account = async (request, f) => (await api(request, 'me', {}, f.token)).body.me.appearance;
const kid = async (request, f, name) => (await api(request, 'me', {}, f.token)).body.families[0].children.find(c => c.name === name).appearance;
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const menu = page => page.locator('#ap-self');

test.beforeEach(async ({ page }) => { await page.clock.install(); });

test('parent: mode et accent appliqués tout de suite, conservés au rechargement et sur un autre appareil', async ({ page, browser, request }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const f = await newFamily(request);
  await parentLogin(page, f);
  const B = await mk(browser);
  await B.page.clock.install();
  await parentLogin(B.page, f);
  expect(await theme(B.page)).toBe('clair');

  await tab(page, 'Famille');
  await expect(menu(page).getByRole('button', { name: 'Auto' })).toBeVisible();
  await menu(page).getByRole('button', { name: 'Sombre' }).click();
  await settle(page);
  expect(await theme(page)).toBe('bleu-nuit');                     // aperçu immédiat
  await menu(page).getByRole('button', { name: 'Océan' }).click();
  await settle(page);
  expect(await accent(page)).toBe('#5599e2');
  await expect(menu(page).getByRole('button', { name: 'Océan' })).toHaveAttribute('aria-pressed', 'true');
  await expect(menu(page).getByRole('button', { name: 'Sombre' })).toHaveAttribute('aria-pressed', 'true');
  expect(await noOverflow(page)).toBe(true);
  expect(await account(request, f)).toMatchObject({ mode: 'dark', accent: 'ocean' });
  expect(await device(page)).toMatchObject({ mode: 'dark', accent: 'ocean' });

  // rechargement sans copie locale: le profil du serveur est relu
  await page.evaluate(() => localStorage.removeItem('dk-appearance'));
  await page.reload();
  await settle(page);
  await expect.poll(() => theme(page)).toBe('bleu-nuit');
  expect(await accent(page)).toBe('#5599e2');

  // autre appareil: pris en compte à la synchronisation
  await syncCycle(B.page);
  await expect.poll(() => theme(B.page)).toBe('bleu-nuit');
  expect(await device(B.page)).toMatchObject({ mode: 'dark', accent: 'ocean' });
  await B.ctx.close();
});

test('enfant: règle le sien sans toucher à celui du parent', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const f = await newFamily(request);
  await childLogin(page, f);
  await page.getByRole('button', { name: /Apparence/ }).click();
  await menu(page).getByRole('button', { name: 'Sombre' }).click();
  await menu(page).getByRole('button', { name: 'Rose' }).click();
  await settle(page);
  expect(await theme(page)).toBe('bleu-nuit');
  expect(await noOverflow(page)).toBe(true);
  expect(await kid(request, f, 'Emma')).toMatchObject({ mode: 'dark', accent: 'rose' });
  expect(await kid(request, f, 'Lucas')).toBeUndefined();
  expect(await account(request, f)).toBeUndefined();
  // une synchro de l'enfant (saveFamily) ne l'efface pas
  await syncCycle(page);
  expect(await kid(request, f, 'Emma')).toMatchObject({ mode: 'dark', accent: 'rose' });
  expect(await theme(page)).toBe('bleu-nuit');
});

test('parent: règle l\'apparence d\'un enfant sans changer la sienne; l\'enfant la retrouve à la connexion', async ({ page, browser, request }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Enfants');
  await page.getByRole('button', { name: 'Apparence de Lucas' }).click();
  const box = page.locator(`[data-ap="${f.family.children[1].id}"]`);
  await box.getByRole('button', { name: 'Sombre' }).click();
  await settle(page);
  await box.getByRole('button', { name: 'Forêt' }).click();
  await settle(page);
  await expect(box.getByRole('button', { name: 'Forêt' })).toHaveAttribute('aria-pressed', 'true');
  await expect(box).not.toContainText('Localisation précise');   // la position est celle de l'appareil, pas du profil
  expect(await noOverflow(page)).toBe(true);
  expect(await theme(page)).toBe('clair');                       // le parent garde la sienne
  expect(await kid(request, f, 'Lucas')).toMatchObject({ mode: 'dark', accent: 'foret' });
  expect(await account(request, f)).toBeUndefined();
  // un enregistrement de la famille par le parent ne l'efface pas
  await page.getByRole('button', { name: 'Enregistrer les enfants' }).click();
  await settle(page);
  expect(await kid(request, f, 'Lucas')).toMatchObject({ mode: 'dark', accent: 'foret' });

  const C = await mk(browser);
  await C.page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.setItem('dk-appearance', '{"mode":"light"}'); } });
  await childLogin(C.page, f, 'Lucas', '4321');
  await expect.poll(() => theme(C.page)).toBe('bleu-nuit');      // le profil l'emporte sur l'appareil
  expect(await device(C.page)).toMatchObject({ mode: 'dark', accent: 'foret' });
  await C.ctx.close();
});

test('thème avant connexion: celui de l\'appareil', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dk-appearance', '{"mode":"dark","accent":"violet"}'));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  expect(await theme(page)).toBe('bleu-nuit');
  expect(await accent(page)).toBe('#a27de6');
});

test('registre: un thème ajouté apparaît au menu; « Thème de jour/de nuit » seulement s\'il y a ≥ 2 thèmes', async ({ page, request }) => {
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Famille');
  await expect(menu(page).getByRole('button', { name: 'Auto' })).toBeVisible();
  await expect(menu(page).getByLabel('Thème de jour')).toHaveCount(0);
  await expect(menu(page).getByLabel('Thème de nuit')).toHaveCount(0);

  // fiche factice injectée dans le registre avant le chargement de themes.js
  await page.addInitScript(() => {
    let T;
    Object.defineProperty(window, 'Themes', { configurable: true, get: () => T, set: v => {
      const clair = v.THEMES.find(t => t.id === 'clair');
      v.THEMES.push({ ...clair, id: 'aube', names: { fr: 'Aube <i>', en: 'Dawn' }, themeColor: '#fbe9df' });
      T = v;
    } });
  });
  await page.reload();
  await page.getByPlaceholder('••••••').fill(f.password);
  await page.getByRole('button', { name: /Déverrouiller|Valider|Entrer/ }).first().click();
  await settle(page);
  await tab(page, 'Famille');
  const day = menu(page).getByLabel('Thème de jour');
  await expect(day).toBeVisible();
  await expect(menu(page).getByLabel('Thème de nuit')).toHaveCount(0);
  await expect(day.locator('option')).toHaveText(['Clair', 'Aube <i>']);   // nom échappé
  await menu(page).getByRole('button', { name: 'Clair' }).click();
  await settle(page);
  await day.selectOption('aube');
  await settle(page);
  await expect.poll(() => theme(page)).toBe('aube');
  expect(await account(request, f)).toMatchObject({ mode: 'light', lightTheme: 'aube' });
});

test('localisation précise accordée: coucher du soleil recalculé, position jamais envoyée au serveur', async ({ browser, request }) => {
  const f = await newFamily(request);
  const A = await mk(browser, { geolocation: { latitude: 40.71, longitude: -74.01 }, permissions: ['geolocation'] });
  await A.page.clock.install({ time: NIGHT_PARIS });
  const sent = [];
  A.page.on('request', r => { if (r.url().endsWith('/api')) sent.push(r.postData() || ''); });
  await parentLogin(A.page, f);
  await tab(A.page, 'Famille');
  await menu(A.page).getByRole('button', { name: 'Auto' }).click();
  await settle(A.page);
  expect(await theme(A.page)).toBe('bleu-nuit');                 // nuit à Paris
  await menu(A.page).getByRole('button', { name: /Localisation précise/ }).click();
  await settle(A.page);
  await expect.poll(() => theme(A.page)).toBe('clair');          // encore jour à New York
  await expect(menu(A.page)).toContainText('Position enregistrée sur cet appareil');
  const loc = (await device(A.page)).location;
  expect(loc.lat).toBeCloseTo(40.71, 1);
  expect(loc.lon).toBeCloseTo(-74.01, 1);
  // changer d'accent ensuite garde la position sur l'appareil et ne l'envoie pas
  await menu(A.page).getByRole('button', { name: 'Violet' }).click();
  await settle(A.page);
  expect((await device(A.page)).location).toEqual(loc);
  expect(sent.some(s => s.includes('"lat"') || s.includes('location'))).toBe(false);
  expect(await account(request, f)).toEqual({ mode: 'auto', lightTheme: 'clair', darkTheme: 'bleu-nuit', accent: 'violet' });
  // retour à Paris
  await menu(A.page).getByRole('button', { name: /Revenir à Paris/ }).click();
  await expect.poll(() => theme(A.page)).toBe('bleu-nuit');
  expect((await device(A.page)).location).toBeUndefined();
  await A.ctx.close();
});

test('localisation précise refusée: repli sur Paris avec un message clair', async ({ browser, request }) => {
  const f = await newFamily(request);
  const A = await mk(browser);
  await A.page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (ok, ko) => setTimeout(() => ko({ code: 1, message: 'User denied Geolocation' }), 0);
  });
  await A.page.clock.install({ time: NIGHT_PARIS });
  await parentLogin(A.page, f);
  await tab(A.page, 'Famille');
  await menu(A.page).getByRole('button', { name: 'Auto' }).click();
  await settle(A.page);
  await menu(A.page).getByRole('button', { name: /Localisation précise/ }).click();
  await settle(A.page);
  await expect(menu(A.page)).toContainText(/refusée.*Paris/);
  expect(await theme(A.page)).toBe('bleu-nuit');
  expect((await device(A.page)).location).toBeUndefined();
  await A.ctx.close();
});

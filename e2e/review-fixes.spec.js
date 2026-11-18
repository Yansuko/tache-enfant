import { test, expect, newFamily, me, parentLogin, childLogin, tab, settle } from './helpers.js';

const BASE = 'http://localhost:3100';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const XSS = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';

test('montants envoyés par un enfant (or, XP, prix) affichés échappés, jamais exécutés', async ({ browser, page, request }) => {
  const f = await newFamily(request, fam => {
    fam.children[0].tasks = [{ id: 't-lit', icon: '⭐', name: 'Faire son lit', xp: 10, gold: 5, frequency: 'daily', done: true, completedAt: null }];
    fam.proposals = [{ id: 'pp1', child: 'Emma', name: 'Idée', cost: XSS, type: 'reward', status: 'pending' }];
    fam.gradeRequests = [{ id: 'g1', child: 'Emma', subject: 'Maths', grade: '15/20', gold: XSS, status: 'pending' }];
    fam.taskRequests = [{ id: 'tr1', child: 'Emma', taskIndex: 0, taskName: 'Faire son lit', xp: XSS, gold: XSS, status: 'pending', submittedAt: Date.now() }];
  });
  await parentLogin(page, f);
  for (const t of ['Quêtes', 'Notes', 'Boutique']) await tab(page, t);
  await expect(page.locator('#main')).toContainText('onerror');                        // texte affiché tel quel
  const C = await browser.newContext({ baseURL: BASE }); const c = await C.newPage(); await c.clock.install();
  await childLogin(c, f);
  for (const t of ['Notes', 'Boutique']) await tab(c, t);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await c.evaluate(() => window.__xss)).toBeUndefined();
  await C.close();
});

test('événements: un 21e est refusé par l\'application avec un message (plafond 20)', async ({ page, request }) => {
  const f = await newFamily(request, fam => {
    fam.events = Array.from({ length: 20 }, (_, i) => ({ id: `ev${i}`, name: `É${i}`, start: '2030-01-01', end: '2030-01-02', xpMult: 2, goldMult: 1 }));
  });
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  const msgs = [];
  page.on('dialog', d => { msgs.push(d.message()); d.accept(); });
  await page.locator('#ev-name').fill('Encore');
  await page.locator('#ev-start').fill('2030-02-01');
  await page.locator('#ev-end').fill('2030-02-02');
  await page.getByRole('button', { name: 'Ajouter l\'événement' }).click();
  await settle(page);
  expect(msgs).toEqual([expect.stringContaining('20')]);
  expect((await me(request, f)).events).toHaveLength(20);
});

test('suppression d\'un enfant: le message annonce ses articles réservés, qui disparaissent', async ({ page, request }) => {
  const f = await newFamily(request, fam => {
    fam.rewards = [{ id: 'r-velo', icon: '🚲', name: 'Vélo', cost: 50, lvl: 1, childIds: [fam.children[1].id] }, { id: 'r-pizza', icon: '🍕', name: 'Pizza', cost: 60, lvl: 1 }];
  });
  await parentLogin(page, f);
  await tab(page, 'Enfants');
  const msgs = [];
  page.on('dialog', d => { msgs.push(d.message()); d.accept(); });
  await page.locator('[data-action="del-child"][data-i="1"]').click();
  await settle(page);
  expect(msgs).toEqual([expect.stringContaining('et les articles qui lui sont réservés')]);
  expect((await me(request, f)).rewards.map(r => r.name)).toEqual(['Pizza']);
  // sans article réservé: message habituel
  msgs.length = 0;
  await page.locator('[data-action="del-child"][data-i="0"]').click();
  await settle(page);
  expect(msgs[0]).not.toContain('articles');
});

test('bouton d\'installation sur l\'écran de connexion: l\'email saisi est conservé', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: BASE, userAgent: IPHONE });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByPlaceholder('parent@email.fr').fill('papa@test.fr');
  await page.locator('[data-action="install-app"]').click();
  await expect(page.locator('#main')).toContainText('Partager');
  await expect(page.getByPlaceholder('parent@email.fr')).toHaveValue('papa@test.fr');
  await ctx.close();
});

test('barre du bas à 375 px: pas de débordement, l\'onglet Famille entièrement visible et cliquable', async ({ browser, request }) => {
  const f = await newFamily(request);
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage(); await page.clock.install();
  await parentLogin(page, f);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const fam = page.locator('nav button', { hasText: 'Famille' });
  const box = await fam.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  await fam.click();
  await settle(page);
  await expect(fam).toHaveClass(/active/);
  await ctx.close();
});

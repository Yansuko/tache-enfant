import { test, expect, newFamily, me, emma, parentLogin, childLogin, tab, settle, task, taskCard } from './helpers.js';

const BASE = 'http://localhost:3100';
const mkPage = async (browser) => { const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); await page.clock.install(); return { ctx, page }; };

test('autorefresh: un changement du parent arrive chez l\'enfant en moins de 15 secondes', async ({ browser, request }) => {
  const f = await newFamily(request);
  const C = await mkPage(browser), P = await mkPage(browser);
  await childLogin(C.page, f);
  await parentLogin(P.page, f);
  await tab(P.page, 'Quêtes');
  await P.page.locator('#new-task-name').fill('Vider le lave-vaisselle');
  await P.page.locator('#new-task-xp').fill('15');
  await P.page.locator('#new-task-gold').fill('5');
  await P.page.getByRole('button', { name: 'Ajouter la quête' }).click();
  await settle(P.page);

  await C.page.clock.runFor(11000);                       // un seul intervalle de 10 s
  await settle(C.page);
  await expect(taskCard(C.page, 'Vider le lave-vaisselle')).toHaveCount(1);
  await C.ctx.close(); await P.ctx.close();
});

test('à la déconnexion, l\'appareil se désabonne des notifications', async ({ browser, request }) => {
  const f = await newFamily(request);
  const ctx = await browser.newContext({ baseURL: BASE });
  await ctx.addInitScript(() => {                          // un abonnement push factice pour cet appareil
    const fake = { endpoint: 'https://push.example/e2e-device' };
    if (window.PushManager) PushManager.prototype.getSubscription = async () => fake;
  });
  const page = await ctx.newPage();
  await page.clock.install();
  const calls = [];
  page.on('request', r => { const b = r.postData() || ''; if (b.includes('"action":"unsubscribePush"')) calls.push(JSON.parse(b)); });
  await parentLogin(page, f);
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  expect(calls.map(c => c.endpoint)).toEqual(['https://push.example/e2e-device']);
  expect(calls[0].familyId).toBe(f.family.id);
  await ctx.close();
});

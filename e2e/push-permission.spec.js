import { test, expect, newFamily, parentLogin, childLogin, tab, settle } from './helpers.js';

// Faux navigateur de notifications: on enregistre qui demande l'autorisation, avec ou sans geste de l'utilisateur.
const stubPush = ({ permission, supported }) => {
  window.__push = { permissionCalls: [], subscribeCalls: 0 };
  if (!supported) { delete window.Notification; if (window.PushManager) delete window.PushManager; return; }
  let perm = permission;
  const N = function () {};
  Object.defineProperty(N, 'permission', { get: () => perm });
  N.requestPermission = async () => { window.__push.permissionCalls.push({ gesture: navigator.userActivation.isActive }); perm = 'granted'; return perm; };
  window.Notification = N;
  const sub = { endpoint: 'https://push.example/dev-' + Math.random().toString(36).slice(2), getKey: () => new Uint8Array([1, 2, 3]).buffer };
  PushManager.prototype.subscribe = async () => { window.__push.subscribeCalls++; return sub; };
  PushManager.prototype.getSubscription = async () => (window.__push.subscribeCalls ? sub : null);
};

async function device(browser, opts = {}) {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:3100' });
  await ctx.addInitScript(stubPush, { permission: 'default', supported: true, ...opts });
  const page = await ctx.newPage();
  await page.clock.install();
  const subscribed = [];
  page.on('request', r => { const b = r.postData() || ''; if (b.includes('"action":"subscribePush"')) subscribed.push(JSON.parse(b)); });
  return { ctx, page, subscribed, push: () => page.evaluate(() => window.__push) };
}
const enableButton = (page) => page.getByRole('button', { name: /Activer les notifications/ });

test('parent: aucune demande automatique; un clic sur le bouton demande l\'autorisation puis abonne l\'appareil', async ({ browser, request }) => {
  const f = await newFamily(request);
  const d = await device(browser);
  await parentLogin(d.page, f);
  await settle(d.page);
  expect((await d.push()).permissionCalls).toEqual([]);                    // rien sans geste (sinon iPhone l'ignore)
  expect(d.subscribed).toEqual([]);

  await tab(d.page, 'Famille');
  await expect(enableButton(d.page)).toBeVisible();
  await enableButton(d.page).click();
  await settle(d.page);
  expect((await d.push()).permissionCalls).toEqual([{ gesture: true }]);   // appelée pendant le clic
  expect(d.subscribed.length).toBe(1);
  expect(d.subscribed[0].familyId).toBe(f.family.id);
  expect(d.subscribed[0].subscription.endpoint).toMatch(/^https:\/\/push\.example\/dev-/);
  await expect(d.page.locator('#main')).toContainText('Notifications activées');
  await expect(enableButton(d.page)).toHaveCount(0);
  await d.ctx.close();
});

test('enfant: le bouton est sur son accueil et abonne son appareil', async ({ browser, request }) => {
  const f = await newFamily(request);
  const d = await device(browser);
  await childLogin(d.page, f);
  await settle(d.page);
  expect((await d.push()).permissionCalls).toEqual([]);
  await expect(enableButton(d.page)).toBeVisible();
  await enableButton(d.page).click();
  await settle(d.page);
  expect((await d.push()).permissionCalls).toEqual([{ gesture: true }]);
  expect(d.subscribed.length).toBe(1);
  await expect(d.page.locator('#main')).toContainText('Notifications activées');
  await d.ctx.close();
});

test('autorisation déjà accordée: parent et enfant s\'abonnent sans rien demander', async ({ browser, request }) => {
  const f = await newFamily(request);
  const P = await device(browser, { permission: 'granted' }), C = await device(browser, { permission: 'granted' });
  await parentLogin(P.page, f);
  await childLogin(C.page, f);
  await settle(P.page); await settle(C.page);
  for (const d of [P, C]) {
    expect((await d.push()).permissionCalls).toEqual([]);
    expect(d.subscribed.length).toBe(1);
    await expect(enableButton(d.page)).toHaveCount(0);
  }
  await P.ctx.close(); await C.ctx.close();
});

test('notifications refusées dans les réglages: message clair, pas de bouton inutile', async ({ browser, request }) => {
  const f = await newFamily(request);
  const d = await device(browser, { permission: 'denied' });
  await childLogin(d.page, f);
  await expect(d.page.locator('#main')).toContainText('bloquées');
  await expect(enableButton(d.page)).toHaveCount(0);
  expect(d.subscribed).toEqual([]);
  await d.ctx.close();
});

test('iPhone hors écran d\'accueil (notifications indisponibles): explique comment installer l\'application', async ({ browser, request }) => {
  const f = await newFamily(request);
  const d = await device(browser, { supported: false });
  await childLogin(d.page, f);
  await expect(d.page.locator('#main')).toContainText('écran d\'accueil');
  await expect(enableButton(d.page)).toHaveCount(0);
  await d.ctx.close();
});

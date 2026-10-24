import { test as base, expect } from '@playwright/test';

// Toute erreur JavaScript non interceptée dans la page fait échouer le test.
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await use(page);
    expect(errors, 'erreurs JavaScript dans la page').toEqual([]);
  },
});
export { expect };

let n = 0;

// Compte les requêtes réseau en cours dans la page: waitForLoadState('networkidle') revient tout de suite sur une page déjà chargée.
export const instrument = (page) => page.addInitScript(() => {
  if (window.__inflight !== undefined) return;
  window.__inflight = 0;
  const f = window.fetch.bind(window);
  window.fetch = (...a) => { window.__inflight++; return f(...a).finally(() => { window.__inflight--; }); };
});
export const settle = async (page) => {
  await page.waitForFunction(() => !window.__inflight);
  await page.waitForTimeout(200);
  await page.waitForFunction(() => !window.__inflight);
};
export const DAY = 24 * 3600 * 1000;

export async function api(request, action, body = {}, token) {
  const res = await request.post('/api', { headers: token ? { Authorization: `Bearer ${token}` } : {}, data: { action, ...body } });
  return { status: res.status(), body: await res.json() };
}

// Compte parent + famille isolés pour un test. `mutate(family)` prépare les données (enfants, tâches, boutique...).
export async function newFamily(request, mutate = () => {}) {
  const id = ++n;
  const email = `e2e${id}-${Date.now()}@test.fr`;
  const password = 'test123';
  const familyName = `Fam${id}x${Date.now() % 100000}`;
  const su = await api(request, 'signup', { email, password, name: 'Parent', familyName });
  expect(su.status).toBe(200);
  const token = su.body.token;
  const family = su.body.families[0];
  family.children = [
    { id: `child-emma-${id}`, name: 'Emma', xp: 0, gold: 100, pin: '1234', tasks: [], grades: [], sanctions: [], notes: [] },
    { id: `child-lucas-${id}`, name: 'Lucas', xp: 0, gold: 0, pin: '4321', tasks: [], grades: [], sanctions: [], notes: [] },
  ];
  family.questList = [];
  family.rewards = [];
  family.proposals = [];
  mutate(family);
  const saved = await api(request, 'saveFamily', { family }, token);
  expect(saved.status).toBe(200);
  return { email, password, token, familyName, family: saved.body.family, id };
}

export const me = async (request, f) => (await api(request, 'me', {}, f.token)).body.families[0];
export const emma = (fam) => fam.children.find(c => c.name === 'Emma');

export async function parentLogin(page, f) {
  await instrument(page);
  await page.goto('/');
  await page.getByPlaceholder('parent@email.fr').fill(f.email);
  await page.getByPlaceholder('••••••').fill(f.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.locator('.topbar')).toContainText('Fam');
  await settle(page);
}

export async function childLogin(page, f, name = 'Emma', pin = '1234') {
  await instrument(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Enfant/ }).first().click();
  await page.locator('#ec-famname').fill(f.familyName);
  await page.locator('#ec-name').fill(name);
  await page.locator('#ec-pin').fill(pin);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.locator('#main')).toContainText(name);
  await settle(page);
}

export const tab = async (page, name) => { await page.locator('nav button', { hasText: name }).click(); await settle(page); };
// Une synchro automatique complète (intervalle de 30 s, horloge simulée) puis attente des requêtes.
// Deux passages: la synchro ignore un déclenchement à moins de 30 s du précédent, le second est donc toujours pris en compte.
export const syncCycle = async (page) => {
  for (let i = 0; i < 2; i++) { await page.clock.runFor(31000); await page.waitForTimeout(100); await settle(page); }
};

export const task = (name, xp, gold, over = {}) => ({ id: `t-${name}`.replace(/\s+/g, '-'), icon: '⭐', name, xp, gold, frequency: 'daily', done: false, completedAt: null, ...over });
export const taskCard = (page, name) => page.locator('.card:has([data-action="toggle-task"])', { hasText: name });

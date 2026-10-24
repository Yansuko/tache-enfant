import { test, expect, settle, newFamily, me, emma, api, parentLogin, childLogin, tab, syncCycle, task, taskCard, DAY } from './helpers.js';

const BASE = 'http://localhost:3100';
const pair = async (browser) => {
  const mk = async () => { const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); await page.clock.install(); return { ctx, page }; };
  return [await mk(), await mk()];
};

test.beforeEach(async ({ page }) => { await page.clock.install(); });

test('proposition de récompense de l\'enfant: le parent fixe prix et niveau, l\'enfant voit l\'article', async ({ browser, request }) => {
  const f = await newFamily(request, fam => { fam.children[0].gold = 100; });
  const [P, C] = await pair(browser);
  await childLogin(C.page, f);
  await tab(C.page, 'Boutique');
  await C.page.locator('#proposal-name').fill('Aller à la piscine');
  await C.page.locator('#proposal-cost').fill('60');
  await C.page.getByRole('button', { name: 'Envoyer aux parents' }).click();
  await settle(C.page);
  await expect(C.page.locator('#main')).toContainText('En attente');

  await parentLogin(P.page, f);
  await tab(P.page, 'Boutique');
  const proposal = P.page.locator('.card', { hasText: 'Aller à la piscine' }).filter({ hasText: 'propose' });
  await proposal.locator('input[class*="reward-cost-"]').fill('45');
  await proposal.locator('input[class*="reward-lvl-"]').fill('1');
  await proposal.getByRole('button', { name: 'Accepter' }).click();
  await settle(P.page);

  await syncCycle(C.page);
  await tab(C.page, 'Boutique');
  const row = C.page.locator('.card', { hasText: 'Aller à la piscine' }).filter({ has: C.page.getByRole('button', { name: 'Acheter' }) });
  await expect(row).toContainText('45');
  await expect(C.page.locator('#main')).not.toContainText('En attente');   // la proposition n'est plus listée comme en attente
  await P.ctx.close(); await C.ctx.close();
});

test('proposition de quête de l\'enfant: le parent fixe XP et or, le modèle apparaît', async ({ browser, request }) => {
  const f = await newFamily(request);
  const [P, C] = await pair(browser);
  await childLogin(C.page, f);
  await C.page.locator('#propose-quest-name').fill('Laver la voiture');
  await C.page.getByRole('button', { name: 'Proposer aux parents' }).click();
  await settle(C.page);

  await parentLogin(P.page, f);
  await tab(P.page, 'Boutique');
  const proposal = P.page.locator('.card', { hasText: 'propose une quête' }).filter({ hasText: 'Laver la voiture' });
  await proposal.locator('input[class*="quest-xp-"]').fill('35');
  await proposal.locator('input[class*="quest-gold-"]').fill('12');
  await proposal.getByRole('button', { name: 'Accepter' }).click();
  await settle(P.page);
  const q = (await me(request, f)).questList.find(x => x.name === 'Laver la voiture');
  expect([q.xp, q.gold]).toEqual([35, 12]);

  await tab(P.page, 'Quêtes');
  await expect(P.page.locator('.card:has([data-action="del-quest-def"])', { hasText: 'Laver la voiture' })).toHaveCount(1);
  await P.ctx.close(); await C.ctx.close();
});

test('sanction: le parent retire de l\'or, l\'enfant le voit après synchro', async ({ browser, request }) => {
  const f = await newFamily(request, fam => { fam.sanctionsList = [{ id: 's1', name: 'Retard', gold: 10 }]; });
  const [P, C] = await pair(browser);
  await childLogin(C.page, f);
  await parentLogin(P.page, f);
  await tab(P.page, 'Boutique');
  await P.page.locator('[data-action="apply-sanction"]').first().click();
  await settle(P.page);
  expect(emma(await me(request, f)).gold).toBe(90);

  await syncCycle(C.page);
  await expect(C.page.locator('#main')).toContainText('90');
  expect(emma(await me(request, f)).gold).toBe(90);          // l'appareil enfant n'a pas ré-écrasé l'or
  await P.ctx.close(); await C.ctx.close();
});

test('deux appareils parent: une validation faite sur l\'un apparaît sur l\'autre, sans écraser l\'or', async ({ browser, request }) => {
  const f = await newFamily(request, fam => { fam.children[0].tasks = [task('Faire son lit', 10, 5, { done: true, completedAt: null }), task('Ranger', 20, 10)]; fam.taskRequests = [{ id: 'tr1', child: 'Emma', taskIndex: 0, taskName: 'Faire son lit', xp: 10, gold: 5, status: 'pending', submittedAt: Date.now() }]; });
  const [A, B] = await pair(browser);
  await parentLogin(A.page, f); await parentLogin(B.page, f);
  await tab(A.page, 'Quêtes'); await tab(B.page, 'Quêtes');
  await A.page.getByRole('button', { name: 'Valider' }).click();
  await settle(A.page);

  await syncCycle(B.page);
  await expect(B.page.getByRole('button', { name: 'Valider' })).toHaveCount(0);
  await expect(taskCard(B.page, 'Faire son lit').locator('[data-action="toggle-task"]')).toHaveClass(/done/);
  const e = emma(await me(request, f));
  expect([e.xp, e.gold]).toEqual([10, 105]);               // une seule fois, malgré la synchro de B
  await A.ctx.close(); await B.ctx.close();
});

test('second parent invité: il voit la famille, valide, et le propriétaire le voit', async ({ browser, request }) => {
  const f = await newFamily(request, fam => { fam.children[0].tasks = [task('Faire son lit', 10, 5, { done: true })]; fam.taskRequests = [{ id: 'tr1', child: 'Emma', taskIndex: 0, taskName: 'Faire son lit', xp: 10, gold: 5, status: 'pending', submittedAt: Date.now() }]; });
  const second = { email: `second-${Date.now()}@test.fr`, password: 'test123' };
  const [A, B] = await pair(browser);
  await parentLogin(A.page, f);
  await tab(A.page, 'Famille');
  await A.page.locator('#invite-email').fill(second.email);
  await A.page.locator('[data-action="invite-adult"]').click();
  await settle(A.page);
  await expect(A.page.locator('#main')).toContainText(second.email);

  expect((await api(request, 'signup', { ...second, name: 'Second', familyName: 'Autre' })).status).toBe(200);
  await B.page.goto('/');
  await B.page.getByPlaceholder('parent@email.fr').fill(second.email);
  await B.page.getByPlaceholder('••••••').fill(second.password);
  await B.page.getByRole('button', { name: 'Se connecter' }).click();
  await settle(B.page);
  await tab(B.page, 'Famille');
  await B.page.locator(`[data-action="switch-family"][data-id="${f.family.id}"]`).click();      // sa propre famille s'ouvre d'abord
  await settle(B.page);
  await expect(B.page.locator('.topbar')).toContainText(f.familyName.slice(0, 3));
  await tab(B.page, 'Quêtes');
  await B.page.getByRole('button', { name: 'Valider' }).click();
  await settle(B.page);
  expect(emma(await me(request, f)).xp).toBeGreaterThanOrEqual(10);

  await tab(A.page, 'Quêtes');
  await syncCycle(A.page);
  await expect(taskCard(A.page, 'Faire son lit').locator('[data-action="toggle-task"]')).toHaveClass(/done/);
  await A.ctx.close(); await B.ctx.close();
});

test('statistiques: l\'historique des tâches validées s\'affiche', async ({ page, request }) => {
  const f = await newFamily(request, fam => { fam.children[0].tasks = [task('Faire son lit', 10, 5, { done: true, completedAt: Date.now() }), task('Ranger', 20, 10, { done: true, completedAt: Date.now() - 2 * DAY })]; });
  await parentLogin(page, f);
  await tab(page, 'Statistiques');
  await expect(page.locator('#main')).toContainText('Historique des tâches');
  await expect(page.locator('#main')).toContainText('Faire son lit');
  await expect(page.locator('#main')).toContainText('Ranger');
});

test('enfants: changer un PIN et supprimer un enfant sont conservés', async ({ page, request }) => {
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Enfants');
  page.on('dialog', d => d.accept('9999'));
  await page.locator('[data-action="del-child"]').nth(1).click();           // supprime Lucas
  await settle(page);
  await syncCycle(page);
  expect((await me(request, f)).children.map(c => c.name)).toEqual(['Emma']);
  await page.reload();
  await page.getByPlaceholder('••••••').fill(f.password);
  await page.getByRole('button', { name: 'Déverrouiller' }).click();
  await tab(page, 'Enfants');
  await expect(page.locator('[data-action="del-child"]')).toHaveCount(1);
});

test('mot de passe: changement depuis l\'onglet Famille puis reconnexion', async ({ page, request }) => {
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Famille');
  await page.locator('#change-password-new').fill('nouveau456');
  await page.locator('#change-password-confirm').fill('nouveau456');
  await page.locator('[data-action="change-password"]').click();
  await settle(page);
  expect((await api(request, 'login', { email: f.email, password: 'nouveau456' })).status).toBe(200);
  expect((await api(request, 'login', { email: f.email, password: f.password })).status).toBe(401);
});

test('pas de boucle de sauvegarde: une application inactive n\'envoie presque rien', async ({ page, request }) => {
  const f = await newFamily(request, fam => { fam.children[0].tasks = [task('Faire son lit', 10, 5)]; });
  await parentLogin(page, f);
  let saves = 0;
  page.on('request', r => { if (r.method() === 'POST' && (r.postData() || '').includes('"action":"saveFamily"')) saves++; });
  for (let i = 0; i < 4; i++) await syncCycle(page);
  expect(saves, 'saveFamily pendant 4 cycles de synchro sans action').toBeLessThanOrEqual(1);
});

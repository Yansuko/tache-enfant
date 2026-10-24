import { test, expect, newFamily, me, emma, api, parentLogin, childLogin, tab, syncCycle, settle, task, taskCard } from './helpers.js';

const BASE = 'http://localhost:3100';
const mkPage = async (browser) => { const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); await page.clock.install(); return { ctx, page }; };
const withTask = (...tasks) => fam => { fam.children[0].tasks = tasks; };
test.beforeEach(async ({ page }) => { await page.clock.install(); });

test('le parent refuse une quête cochée: elle redevient à faire, sans XP', async ({ page, request }) => {
  const f = await newFamily(request, fam => { withTask(task('Faire son lit', 10, 5, { done: true }))(fam); fam.taskRequests = [{ id: 'tr1', child: 'Emma', taskIndex: 0, taskName: 'Faire son lit', xp: 10, gold: 5, status: 'pending', submittedAt: Date.now() }]; });
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  await page.locator('[data-action="reject-task"]').click();
  await settle(page);
  await expect(taskCard(page, 'Faire son lit').locator('[data-action="toggle-task"]')).not.toHaveClass(/done/);
  const e = emma(await me(request, f));
  expect([e.xp, e.gold, e.tasks[0].done]).toEqual([0, 100, false]);
});

test('l\'enfant décoche sa quête avant validation: la demande disparaît chez le parent', async ({ browser, request }) => {
  const f = await newFamily(request, withTask(task('Faire son lit', 10, 5)));
  const C = await mkPage(browser), P = await mkPage(browser);
  await childLogin(C.page, f);
  const check = taskCard(C.page, 'Faire son lit').locator('[data-action="toggle-task"]');
  await check.click(); await settle(C.page);
  await check.click(); await settle(C.page);
  await parentLogin(P.page, f);
  await tab(P.page, 'Quêtes');
  await expect(P.page.getByRole('button', { name: 'Valider' })).toHaveCount(0);
  expect((await me(request, f)).taskRequests.filter(r => r.status === 'pending')).toEqual([]);
  await C.ctx.close(); await P.ctx.close();
});

test('le parent ajoute une quête à un enfant avec une fréquence, l\'enfant la voit', async ({ browser, request }) => {
  const f = await newFamily(request);
  const C = await mkPage(browser), P = await mkPage(browser);
  await childLogin(C.page, f);
  await parentLogin(P.page, f);
  await tab(P.page, 'Quêtes');
  await P.page.locator('#new-task-name').fill('Passer l\'aspirateur');
  await P.page.locator('#new-task-xp').fill('25');
  await P.page.locator('#new-task-gold').fill('7');
  await P.page.locator('#new-task-freq').selectOption('weekly');
  await P.page.getByRole('button', { name: 'Ajouter la quête' }).click();
  await settle(P.page);
  const t = emma(await me(request, f)).tasks.find(x => x.name === 'Passer l\'aspirateur');
  expect([t.xp, t.gold, t.frequency, t.done]).toEqual([25, 7, 'weekly', false]);

  await syncCycle(C.page);
  await expect(taskCard(C.page, 'Passer l\'aspirateur')).toHaveCount(1);
  await C.ctx.close(); await P.ctx.close();
});

test('« À tous »: le modèle est assigné à chaque enfant', async ({ page, request }) => {
  const f = await newFamily(request, fam => { fam.questList = [{ id: 'q1', icon: '🧹', name: 'Ranger le salon', xp: 15, gold: 5, frequency: 'daily' }]; });
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  await page.locator('.card:has([data-action="del-quest-def"])', { hasText: 'Ranger le salon' }).getByRole('button', { name: 'À tous' }).click();
  await settle(page);
  const fam = await me(request, f);
  expect(fam.children.map(c => c.tasks.map(t => t.name))).toEqual([['Ranger le salon'], ['Ranger le salon']]);
});

test('montée de niveau: la validation d\'une quête qui change de niveau ajoute le bonus d\'or', async ({ page, request }) => {
  const f = await newFamily(request, fam => {
    fam.children[0].xp = 95;
    fam.children[0].tasks = [task('Faire son lit', 10, 5, { done: true }), task('Autre quête', 5, 1)];     // 2e quête non faite: pas de bonus de mission
    fam.taskRequests = [{ id: 'tr1', child: 'Emma', taskIndex: 0, taskName: 'Faire son lit', xp: 10, gold: 5, status: 'pending', submittedAt: Date.now() }];
  });
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  await page.getByRole('button', { name: 'Valider' }).click();
  await settle(page);
  const e = emma(await me(request, f));
  expect([e.xp, e.gold]).toEqual([105, 155]);          // +10 xp (niveau 1 → 2), +5 or, +50 or de bonus de niveau
});

test('achat impossible: pas de bouton d\'achat quand l\'or manque, et aucune demande n\'existe', async ({ page, request }) => {
  const f = await newFamily(request, fam => { fam.children[0].gold = 10; fam.rewards = [{ id: 'r1', icon: '🎮', name: 'Console', cost: 500, lvl: 1 }]; });
  await childLogin(page, f);
  await tab(page, 'Boutique');
  const card = page.locator('.card', { hasText: 'Console' });
  await expect(card).toContainText('490');                                         // ce qu'il manque
  await expect(card.getByRole('button', { name: 'Acheter' })).toHaveCount(0);
  expect((await me(request, f)).requests ?? []).toEqual([]);
});

test('session mémorisée: parent et enfant sont restaurés après rechargement', async ({ browser, request }) => {
  const f = await newFamily(request, withTask(task('Faire son lit', 10, 5)));
  const C = await mkPage(browser), P = await mkPage(browser);
  // enfant avec « Se souvenir de moi »
  await C.page.goto('/');
  await C.page.getByRole('button', { name: /Enfant/ }).first().click();
  await C.page.locator('#ec-famname').fill(f.familyName);
  await C.page.locator('#ec-name').fill('Emma');
  await C.page.locator('#ec-pin').fill('1234');
  await C.page.locator('#ec-remember').check();
  await C.page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(C.page.locator('#main')).toContainText('Emma');
  await C.page.reload();
  await expect(C.page.locator('#main')).toContainText('Faire son lit');
  // parent
  await parentLogin(P.page, f);
  await P.page.reload();
  await expect(P.page.locator('#main')).toContainText('Espace parent');
  await C.ctx.close(); await P.ctx.close();
});

test('un ancien jeton enfant mémorisé (sans famille) renvoie à la connexion sans planter', async ({ page, request }) => {
  const f = await newFamily(request);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('te-token', 'ancien.jeton');
    localStorage.setItem('dailykids_session', JSON.stringify({ token: 'ancien.jeton', role: 'enfant', familyName: 'Fam', childName: 'Emma', expiresAt: Date.now() + 1e9 }));
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
});

test('session enfant non mémorisée: après rechargement, retour à la connexion par PIN', async ({ page, request }) => {
  const f = await newFamily(request, withTask(task('Faire son lit', 10, 5)));
  await childLogin(page, f);                       // « Se souvenir de moi » non coché
  await page.reload();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();     // écran de connexion
  await expect(page.getByRole('button', { name: 'Déverrouiller' })).toHaveCount(0);   // pas l'écran de verrouillage parent
  await expect(page.locator('#main')).not.toContainText('enfant.local');
  await page.getByRole('button', { name: /Enfant/ }).first().click();
  await expect(page.locator('#ec-pin')).toBeVisible();                                 // et l'espace enfant est accessible
});


test('ajout depuis un modèle déjà validé: l\'enfant, connecté avant, garde la nouvelle quête et rien d\'autre ne change', async ({ browser, request }) => {
  const validated = (name, xp, gold) => task(name, xp, gold, { done: true, completedAt: Date.now() - 3600000 });
  const f = await newFamily(request, fam => {
    fam.questList = [{ id: 'q1', icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, frequency: 'daily' }];
    fam.children[0].tasks = [validated('Ranger sa chambre', 20, 10), validated('Faire ses devoirs', 30, 15), validated('Mettre la table', 10, 5)];
  });
  const C = await mkPage(browser), P = await mkPage(browser);
  await childLogin(C.page, f);                                   // l'enfant charge ses quêtes avant l'ajout
  await parentLogin(P.page, f);
  await tab(P.page, 'Quêtes');
  await P.page.locator('.card:has([data-action="del-quest-def"])', { hasText: 'Ranger sa chambre' }).getByRole('button', { name: /Assigner à/ }).click();
  await settle(P.page);
  const names = async () => emma(await me(request, f)).tasks.map(t => `${t.name}${t.done ? '✓' : '·'}`);
  const expected = ['Ranger sa chambre✓', 'Faire ses devoirs✓', 'Mettre la table✓', 'Ranger sa chambre·'];
  expect(await names()).toEqual(expected);

  await syncCycle(C.page);                                       // la synchro de l'enfant ne doit pas supprimer la nouvelle quête
  expect(await names()).toEqual(expected);
  await expect(taskCard(C.page, 'Ranger sa chambre')).toHaveCount(2);
  await expect(taskCard(C.page, 'Ranger sa chambre').nth(1).locator('[data-action="toggle-task"]')).not.toHaveClass(/done/);

  await syncCycle(P.page);                                       // ni celle du parent
  expect(await names()).toEqual(expected);
  await P.page.reload();                                         // reconnexion du parent: l'état est conservé
  await P.page.getByPlaceholder('••••••').fill(f.password);
  await P.page.getByRole('button', { name: 'Déverrouiller' }).click();
  await tab(P.page, 'Quêtes');
  await expect(taskCard(P.page, 'Ranger sa chambre')).toHaveCount(2);
  await C.ctx.close(); await P.ctx.close();
});

import { test, expect, newFamily, me, emma, api, parentLogin, childLogin, tab, syncCycle, settle, task, taskCard, DAY } from './helpers.js';

const BASE = 'http://localhost:3100';
const mkPage = async (browser) => { const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); await page.clock.install(); return { ctx, page }; };
test.beforeEach(async ({ page }) => { await page.clock.install(); });

// ───────────── compte ─────────────
test('inscription depuis l\'application: le compte et la famille sont créés, l\'e-mail déjà pris est refusé', async ({ page, request }) => {
  const email = `inscrit-${Date.now()}@test.fr`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer un nouveau compte' }).click();
  await page.locator('#au-name').fill('Maman');
  await page.locator('#au-email').fill(email);
  await page.locator('#au-pass').fill('secret123');
  await page.locator('#au-fam').fill('Famille Neuve');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.locator('.topbar')).toContainText('Famille Neuve');
  const login = await api(request, 'login', { email, password: 'secret123' });
  expect(login.status).toBe(200);
  expect(login.body.families.map(f => f.name)).toEqual(['Famille Neuve']);

  await page.getByRole('button', { name: /Déconnexion/ }).click();
  await page.getByRole('button', { name: 'Créer un nouveau compte' }).click();
  await page.locator('#au-name').fill('Autre');
  await page.locator('#au-email').fill(email);
  await page.locator('#au-pass').fill('secret123');
  await page.locator('#au-fam').fill('Autre famille');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.locator('#main')).toContainText('Erreur');
});

test('mot de passe oublié: code, nouveau mot de passe, connexion; un mauvais code est refusé', async ({ page, request }) => {
  const f = await newFamily(request);
  await page.goto('/');
  await page.getByRole('button', { name: 'Mot de passe oublié?' }).click();
  await page.locator('#reset-email').fill(f.email);
  await page.locator('[data-action="reset-password-step1"]').click();
  await expect(page.locator('#reset-code')).toBeVisible();
  const code = (await page.locator('#main').innerText()).match(/Code = (\d{6})/)?.[1];   // hors production le code est affiché (jamais en production)
  expect(code).toMatch(/^\d{6}$/);

  await page.locator('#reset-code').fill('000000');
  await page.locator('#reset-password').fill('nouveau789');
  await page.locator('#reset-password-confirm').fill('nouveau789');
  await page.locator('[data-action="reset-password-step2"]').click();
  await expect(page.locator('#main')).toContainText('incorrect');

  await page.locator('#reset-code').fill(code);
  await page.locator('#reset-password').fill('nouveau789');
  await page.locator('#reset-password-confirm').fill('nouveau789');
  await page.locator('[data-action="reset-password-step2"]').click();
  await expect(page.locator('#main')).toContainText('Mot de passe changé');
  expect((await api(request, 'login', { email: f.email, password: 'nouveau789' })).status).toBe(200);
});

test('famille: option e-mail enregistrée, adulte invité puis retiré, seconde famille supprimée', async ({ page, request }) => {
  const f = await newFamily(request);
  page.on('dialog', d => d.accept());
  await parentLogin(page, f);
  await tab(page, 'Famille');

  await page.locator('#email-notif-enabled').check();
  await settle(page);
  expect((await me(request, f)).emailNotifications).toBe(true);

  const guest = `invite-${Date.now()}@test.fr`;
  await page.locator('#invite-email').fill(guest);
  await page.locator('[data-action="invite-adult"]').click();
  await settle(page);
  expect((await me(request, f)).members).toContain(guest);
  await page.locator(`[data-action="remove-adult"][data-email="${guest}"]`).click();
  await settle(page);
  expect((await me(request, f)).members).not.toContain(guest);

  await page.locator('#new-fam-name').fill('À supprimer');
  await page.locator('[data-action="add-family"]').click();
  await settle(page);
  expect((await api(request, 'me', {}, f.token)).body.families.length).toBe(2);
  await tab(page, 'Famille');
  await page.locator(`[data-action="delete-family"][data-id="${f.family.id}"]`).click();      // supprime la première (non active)
  await settle(page);
  expect((await api(request, 'me', {}, f.token)).body.families.map(x => x.name)).toEqual(['À supprimer']);
});

// ───────────── refus et retraits ─────────────
test('le parent refuse une note: aucun or, la note n\'est plus à valider', async ({ browser, request }) => {
  const f = await newFamily(request);
  const C = await mkPage(browser), P = await mkPage(browser);
  await childLogin(C.page, f);
  await api(request, 'submitGrade', { familyId: f.family.id, childName: 'Emma', subject: 'Histoire', grade: '4/20', gold: 30 });
  await parentLogin(P.page, f);
  await tab(P.page, 'Notes');
  await expect(P.page.locator('#main')).toContainText('Histoire');
  await P.page.locator('[data-action="refuse-grade"]').click();
  await settle(P.page);
  await expect(P.page.locator('[data-action="refuse-grade"]')).toHaveCount(0);
  const fam = await me(request, f);
  expect(fam.gradeRequests.map(g => g.status)).toEqual(['refused']);
  expect(emma(fam).gold).toBe(100);
  await C.ctx.close(); await P.ctx.close();
});

test('le parent refuse un achat: l\'or reste, l\'enfant voit « Refusée »', async ({ browser, request }) => {
  const f = await newFamily(request, fam => { fam.rewards = [{ id: 'r1', icon: '🎮', name: 'Jeu vidéo', cost: 40, lvl: 1 }]; });
  const C = await mkPage(browser), P = await mkPage(browser);
  await childLogin(C.page, f);
  await tab(C.page, 'Boutique');
  await C.page.locator('.card', { hasText: 'Jeu vidéo' }).getByRole('button', { name: 'Acheter' }).click();
  await settle(C.page);
  await parentLogin(P.page, f);
  await tab(P.page, 'Boutique');
  await P.page.locator('[data-action="refuse"]').click();
  await settle(P.page);
  await syncCycle(C.page);
  await tab(C.page, 'Boutique');
  await expect(C.page.locator('#main')).toContainText('Refusée');
  expect(emma(await me(request, f)).gold).toBe(100);
  await C.ctx.close(); await P.ctx.close();
});

test('proposition refusée par le parent, ou retirée par l\'enfant: elle disparaît de la liste du parent', async ({ browser, request }) => {
  const f = await newFamily(request);
  const C = await mkPage(browser), P = await mkPage(browser);
  await childLogin(C.page, f);
  await tab(C.page, 'Boutique');
  for (const [name, cost] of [['Piscine', '60'], ['Cinéma', '80']]) {
    await C.page.locator('#proposal-name').fill(name);
    await C.page.locator('#proposal-cost').fill(cost);
    await C.page.getByRole('button', { name: 'Envoyer aux parents' }).click();
    await settle(C.page);
  }
  await parentLogin(P.page, f);
  await tab(P.page, 'Boutique');
  const pending = (name) => P.page.locator('.card', { hasText: name }).filter({ hasText: 'propose' });
  await expect(pending('Piscine')).toHaveCount(1);
  await expect(pending('Cinéma')).toHaveCount(1);

  await pending('Piscine').getByRole('button', { name: 'Refuser' }).click();        // refusée par le parent
  await settle(P.page);
  await expect(pending('Piscine')).toHaveCount(0);

  await C.page.locator('div', { hasText: 'Cinéma' }).locator('[data-action="del-proposal"]').last().click();   // retirée par l'enfant
  await settle(C.page);
  await syncCycle(P.page);
  await expect(pending('Cinéma')).toHaveCount(0);
  const statuses = Object.fromEntries((await me(request, f)).proposals.map(p => [p.name, p.status]));
  expect(statuses).toEqual({ Piscine: 'refused', Cinéma: 'withdrawn' });
  await C.ctx.close(); await P.ctx.close();
});

test('le parent supprime une quête d\'un enfant: elle disparaît pour de bon, même après la synchro de l\'enfant', async ({ browser, request }) => {
  const f = await newFamily(request, fam => { fam.children[0].tasks = [task('Faire son lit', 10, 5), task('Ranger sa chambre', 20, 10)]; });
  const C = await mkPage(browser), P = await mkPage(browser);
  await childLogin(C.page, f);
  await parentLogin(P.page, f);
  await tab(P.page, 'Quêtes');
  await taskCard(P.page, 'Faire son lit').locator('[data-action="del-task"]').click();
  await settle(P.page);
  expect(emma(await me(request, f)).tasks.map(t => t.name)).toEqual(['Ranger sa chambre']);
  await syncCycle(C.page);
  await expect(taskCard(C.page, 'Faire son lit')).toHaveCount(0);
  await syncCycle(P.page);
  expect(emma(await me(request, f)).tasks.map(t => t.name)).toEqual(['Ranger sa chambre']);
  await C.ctx.close(); await P.ctx.close();
});

// ───────────── boutique et sanctions ─────────────
test('article avec niveau requis: verrouillé tant que l\'enfant n\'a pas le niveau, puis achetable', async ({ browser, request }) => {
  const f = await newFamily(request, fam => { fam.children[0].gold = 500; });
  const C = await mkPage(browser), P = await mkPage(browser);
  await parentLogin(P.page, f);
  await tab(P.page, 'Boutique');
  await P.page.locator('#new-reward-name').fill('Sortie vélo');
  await P.page.locator('#new-reward-cost').fill('60');
  await P.page.locator('#new-reward-lvl').fill('2');
  await P.page.locator('[data-action="add-reward"]').click();
  await settle(P.page);
  expect((await me(request, f)).rewards.map(r => [r.name, r.cost, r.lvl])).toEqual([['Sortie vélo', 60, 2]]);

  await childLogin(C.page, f);
  await tab(C.page, 'Boutique');
  const card = C.page.locator('.card', { hasText: 'Sortie vélo' });
  await expect(card).toContainText('Niv. 2');
  await expect(card.getByRole('button', { name: 'Acheter' })).toHaveCount(0);        // niveau 1: verrouillé

  const fam = await me(request, f); emma(fam).xp = 150;                                // niveau 2
  expect((await api(request, 'saveFamily', { family: fam }, f.token)).status).toBe(200);
  await syncCycle(C.page);
  await tab(C.page, 'Boutique');
  await expect(card.getByRole('button', { name: 'Acheter' })).toBeVisible();
  await C.ctx.close(); await P.ctx.close();
});

test('sanctions types: ajout, application à un enfant (or retiré), suppression du catalogue', async ({ page, request }) => {
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Boutique');
  await page.locator('#sanction-motif').fill('Mensonge');
  await page.locator('#sanction-pts').fill('8');
  await page.locator('[data-action="add-sanction-def"]').click();
  await settle(page);
  expect((await me(request, f)).sanctionsList.map(s => [s.name, s.gold])).toEqual([['Mensonge', 8]]);

  await page.locator('[data-action="apply-sanction"]').first().click();
  await settle(page);
  expect(emma(await me(request, f)).gold).toBe(92);

  await page.locator('[data-action="del-sanction-def"]').first().click();
  await settle(page);
  expect((await me(request, f)).sanctionsList).toEqual([]);
  expect(emma(await me(request, f)).sanctions.length).toBe(1);                        // l'historique de l'enfant reste
  await page.reload();
  await page.getByPlaceholder('••••••').fill(f.password);
  await page.getByRole('button', { name: 'Déverrouiller' }).click();
  await tab(page, 'Boutique');
  await expect(page.locator('[data-action="apply-sanction"]')).toHaveCount(0);
});

// ───────────── statistiques et écrans enfant ─────────────
test('statistiques: périodes et choix de l\'enfant mettent les chiffres à jour', async ({ page, request }) => {
  const f = await newFamily(request, fam => {
    fam.children[0].tasks = [task('Lit', 10, 5, { done: true, completedAt: Date.now() }), task('Vaisselle', 20, 10, { done: true, completedAt: Date.now() - 3 * DAY })];
    fam.children[1].tasks = [task('Chien', 16, 8, { done: true, completedAt: Date.now() })];
  });
  await parentLogin(page, f);
  await tab(page, 'Statistiques');
  const count = async () => Number(await page.locator('.kicker', { hasText: 'Tâches complétées' }).locator('xpath=following-sibling::div[1]').innerText());
  await page.locator('[data-action="set-stats-period"][data-period="day"]').click(); await settle(page);
  expect(await count()).toBe(1);
  await page.locator('[data-action="set-stats-period"][data-period="year"]').click(); await settle(page);
  expect(await count()).toBe(2);
  await page.locator('#stats-child-select').selectOption({ label: 'Lucas' }); await settle(page);
  expect(await count()).toBe(1);
  await page.locator('[data-action="set-stats-period"][data-period="day"]').click(); await settle(page);
  expect(await count()).toBe(1);
});

test('enfants: « 📊 » ouvre les statistiques de l\'enfant; « Enregistrer les enfants » enregistre sans erreur', async ({ page, request }) => {
  const f = await newFamily(request, fam => { fam.children[1].tasks = [task('Chien', 16, 8, { done: true, completedAt: Date.now() })]; });
  await parentLogin(page, f);
  await tab(page, 'Enfants');
  await page.locator('[data-action="view-stats"]').nth(1).click();
  await settle(page);
  await expect(page.locator('#main')).toContainText('Tâches complétées');
  await expect(page.locator('#stats-child-select')).toHaveValue(/.+/);
  await tab(page, 'Enfants');
  await page.getByRole('button', { name: 'Enregistrer les enfants' }).click();
  await settle(page);
  await expect(page.locator('#toast')).toBeHidden();
});

test('écran « Notes » de l\'enfant: la note soumise est « en attente », puis « approuvée »', async ({ browser, request }) => {
  const f = await newFamily(request);
  const C = await mkPage(browser), P = await mkPage(browser);
  await childLogin(C.page, f);
  await tab(C.page, 'Notes');
  await C.page.locator('#grade-subject').fill('Géographie');
  await C.page.locator('#grade-value').fill('16/20');
  await C.page.locator('#grade-gold').fill('15');
  await C.page.getByRole('button', { name: 'Soumettre' }).click();
  await settle(C.page);
  await expect(C.page.locator('#main')).toContainText('En attente d\'approbation');
  await expect(C.page.locator('#main')).toContainText('Géographie');

  await parentLogin(P.page, f);
  await tab(P.page, 'Notes');
  await P.page.getByRole('button', { name: 'Approuver' }).click();
  await settle(P.page);
  await syncCycle(C.page);
  await tab(C.page, 'Notes');
  await expect(C.page.locator('#main')).not.toContainText('En attente d\'approbation');
  await expect(C.page.locator('#main')).toContainText('Géographie');
  await C.ctx.close(); await P.ctx.close();
});

test('création de code PIN annulée: l\'appareil parent revient à l\'écran précédent', async ({ page, request }) => {
  const f = await newFamily(request, fam => { fam.children[0].pin = null; });
  await parentLogin(page, f);
  await page.locator('#role-seg label', { hasText: 'Enfant' }).click();
  await page.getByRole('button', { name: /Créer mon code/ }).click();
  await expect(page.locator('#pin-input-1')).toBeVisible();
  await page.locator('[data-action="cancel-pin"]').click();
  await expect(page.locator('#pin-input-1')).toHaveCount(0);
  expect((await me(request, f)).children[0].pin ?? null).toBeNull();
});

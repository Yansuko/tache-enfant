import { test, expect, settle, newFamily, me, emma, parentLogin, childLogin, tab, syncCycle, task, taskCard, DAY, api } from './helpers.js';

test.beforeEach(async ({ page }) => { await page.clock.install(); });

test('enfant coche une quête, le parent la valide, l\'enfant voit son XP et son or (2 appareils)', async ({ browser, request }) => {
  const f = await newFamily(request, fam => { fam.children[0].tasks = [task('Faire son lit', 10, 5)]; });
  const parentCtx = await browser.newContext({ baseURL: 'http://localhost:3100' });
  const childCtx = await browser.newContext({ baseURL: 'http://localhost:3100' });
  const parent = await parentCtx.newPage(); const child = await childCtx.newPage();
  await parent.clock.install(); await child.clock.install();
  const errors = []; for (const p of [parent, child]) p.on('pageerror', e => errors.push(e.message));

  await childLogin(child, f);
  await taskCard(child, 'Faire son lit').locator('[data-action="toggle-task"]').click();
  await settle(child);

  await parentLogin(parent, f);
  await tab(parent, 'Quêtes');
  await tab(parent, 'Notes'); await tab(parent, 'Quêtes');
  // tant que le parent n'a pas validé, rien n'est crédité (pas de bonus de mission pour une quête non validée)
  expect([emma(await me(request, f)).xp, emma(await me(request, f)).gold]).toEqual([0, 100]);

  const pending = parent.locator('.card', { hasText: 'Faire son lit' }).filter({ has: parent.getByRole('button', { name: 'Valider' }) });
  await expect(pending).toHaveCount(1);
  await pending.getByRole('button', { name: 'Valider' }).click();
  await settle(parent);

  await syncCycle(child);
  await expect(taskCard(child, 'Faire son lit').locator('[data-action="toggle-task"]')).toHaveClass(/done/);
  // quête (+10 XP, +5 or) puis bonus de mission du jour (+30 XP, +15 or), une seule fois
  await tab(parent, 'Notes'); await tab(parent, 'Quêtes'); await syncCycle(parent);
  const server = emma(await me(request, f));
  expect([server.xp, server.gold]).toEqual([40, 120]);
  await expect(child.locator('#main')).toContainText('120');
  expect(errors).toEqual([]);
  await parentCtx.close(); await childCtx.close();
});

test('l\'enfant ouvre l\'application un nouveau jour: ses quêtes de la veille sont à faire', async ({ page, request }) => {
  const yesterday = Date.now() - DAY;
  const f = await newFamily(request, fam => {
    const d = new Date(yesterday);
    fam.day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    fam.children[0].tasks = [task('Ranger sa chambre', 20, 10, { done: true, completedAt: yesterday })];
  });
  await childLogin(page, f);
  await expect(taskCard(page, 'Ranger sa chambre').locator('[data-action="toggle-task"]')).not.toHaveClass(/done/);
  await settle(page);
  expect(emma(await me(request, f)).tasks[0].done).toBe(false);
});

test('achat: l\'enfant demande un article, le parent approuve, l\'or est débité', async ({ browser, request }) => {
  const f = await newFamily(request, fam => { fam.rewards = [{ id: 'r-jeu', icon: '🎮', name: 'Jeu vidéo', cost: 40, lvl: 1 }]; });
  const parentCtx = await browser.newContext({ baseURL: 'http://localhost:3100' });
  const childCtx = await browser.newContext({ baseURL: 'http://localhost:3100' });
  const parent = await parentCtx.newPage(); const child = await childCtx.newPage();
  await parent.clock.install(); await child.clock.install();

  await childLogin(child, f);
  await tab(child, 'Boutique');
  await child.locator('.card', { hasText: 'Jeu vidéo' }).getByRole('button', { name: 'Acheter' }).click();
  await settle(child);

  await parentLogin(parent, f);
  await tab(parent, 'Boutique');
  await expect(parent.locator('#main')).toContainText('veut acheter : Jeu vidéo');
  await expect(parent.locator('[data-action="approve"]')).toHaveCount(1);
  await parent.locator('[data-action="approve"]').click();
  await settle(parent);

  await syncCycle(child);
  await tab(child, 'Boutique');
  await expect(child.locator('#main')).toContainText('Achetée');
  expect(emma(await me(request, f)).gold).toBe(60);
  await parentCtx.close(); await childCtx.close();
});

test('notes: l\'enfant soumet une note, le parent l\'approuve avec un autre montant d\'or', async ({ browser, request }) => {
  const f = await newFamily(request);
  const parentCtx = await browser.newContext({ baseURL: 'http://localhost:3100' });
  const childCtx = await browser.newContext({ baseURL: 'http://localhost:3100' });
  const parent = await parentCtx.newPage(); const child = await childCtx.newPage();
  await parent.clock.install(); await child.clock.install();

  await childLogin(child, f);
  await tab(child, 'Notes');
  await child.locator('#grade-subject').fill('Mathématiques');
  await child.locator('#grade-value').fill('18/20');
  await child.locator('#grade-gold').fill('20');
  await child.getByRole('button', { name: 'Soumettre' }).click();
  await settle(child);

  await parentLogin(parent, f);
  await tab(parent, 'Notes');
  await expect(parent.locator('#main')).toContainText('Mathématiques');
  await parent.locator('input[id^="grade-gold-"]').first().fill('12');
  await parent.getByRole('button', { name: 'Approuver' }).first().click();
  await settle(parent);

  expect(emma(await me(request, f)).gold).toBe(112);
  await syncCycle(child);
  await expect(child.locator('#main')).toContainText('Mathématiques');
  await parentCtx.close(); await childCtx.close();
});

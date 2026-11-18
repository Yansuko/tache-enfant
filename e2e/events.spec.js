import { test, expect, newFamily, me, emma, api, parentLogin, childLogin, tab, syncCycle, settle, task, taskCard } from './helpers.js';

const BASE = 'http://localhost:3100';
const mkPage = async (browser) => { const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); await page.clock.install(); return { ctx, page }; };
test.beforeEach(async ({ page }) => { await page.clock.install(); });

const DAY = 864e5;
const parisDay = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(ms));
const ev = (over = {}) => ({ id: 'ev1', name: 'Week-end', start: parisDay(Date.now() - DAY), end: parisDay(Date.now() + DAY), xpMult: 2, goldMult: 1, ...over });
const pending = (child, taskName, xp, gold, i = 0) => ({ id: `tr-${child}`, child, taskIndex: i, taskName, xp, gold, status: 'pending', submittedAt: Date.now() });
const lucas = fam => fam.children.find(c => c.name === 'Lucas');

test('le parent crée un événement XP ×2 pour Emma: bandeau chez Emma seulement, puis suppression', async ({ browser, page, request }) => {
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  await page.locator('#ev-name').fill('Week-end');
  await page.locator('#ev-start').fill(parisDay(Date.now() - DAY));
  await page.locator('#ev-end').fill(parisDay(Date.now() + DAY));
  await page.locator('#ev-xp').selectOption('2');
  await page.locator(`input[name="ev-child"][value="${emma(f.family).id}"]`).check();
  await page.getByRole('button', { name: 'Ajouter l\'événement' }).click();
  await settle(page);
  expect((await me(request, f)).events).toEqual([expect.objectContaining({ name: 'Week-end', xpMult: 2, goldMult: 1, childIds: [emma(f.family).id] })]);
  await expect(page.locator('.event-row')).toContainText('Week-end');

  const E = await mkPage(browser);
  await childLogin(E.page, f);
  await expect(E.page.locator('.event-banner')).toHaveText('🎉 Week-end: XP ×2');
  const L = await mkPage(browser);
  await childLogin(L.page, f, 'Lucas', '4321');
  await expect(L.page.locator('.event-banner')).toHaveCount(0);

  await page.locator('.event-row [data-action="del-event"]').click();
  await settle(page);
  expect((await me(request, f)).events).toEqual([]);
  await syncCycle(E.page);
  await E.page.reload(); await settle(E.page);
  await expect(E.page.locator('.event-banner')).toHaveCount(0);
  await E.ctx.close(); await L.ctx.close();
});

test('le parent modifie un événement', async ({ page, request }) => {
  const f = await newFamily(request, fam => { fam.events = [ev()]; });
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  await page.locator('.event-row [data-action="edit-event"]').click();
  await expect(page.locator('#ev-name')).toHaveValue('Week-end');
  await page.locator('#ev-name').fill('Vacances');
  await page.locator('#ev-gold').selectOption('1.5');
  await page.getByRole('button', { name: 'Enregistrer l\'événement' }).click();
  await settle(page);
  expect((await me(request, f)).events).toEqual([expect.objectContaining({ id: 'ev1', name: 'Vacances', xpMult: 2, goldMult: 1.5 })]);
  await expect(page.locator('.event-row')).toContainText('Or ×1,5');
});

test('Emma coche une quête de 10 XP, le parent approuve: +20 XP, stable après synchro; Lucas (non ciblé) gagne 10', async ({ browser, page, request }) => {
  const f = await newFamily(request, fam => {
    fam.events = [ev({ childIds: [fam.children[0].id] })];
    fam.children[0].tasks = [task('Faire son lit', 10, 5), task('Autre', 1, 1)];        // 2e quête: pas de bonus du jour
    lucas(fam).tasks = [task('Sortir le chien', 10, 5, { done: true }), task('Autre', 1, 1)];
    fam.taskRequests = [pending('Lucas', 'Sortir le chien', 10, 5)];
  });
  const C = await mkPage(browser);
  await childLogin(C.page, f);
  await taskCard(C.page, 'Faire son lit').locator('[data-action="toggle-task"]').click();
  await settle(C.page);

  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  await page.getByRole('button', { name: 'Valider' }).click(); await settle(page);
  await page.locator('.seg-opt', { hasText: 'Lucas' }).click(); await settle(page);
  await page.getByRole('button', { name: 'Valider' }).click(); await settle(page);
  let fam = await me(request, f);
  expect([emma(fam).xp, emma(fam).gold]).toEqual([20, 105]);
  expect(emma(fam).tasks[0]).toMatchObject({ done: true, xpEarned: 20, goldEarned: 5 });
  expect([lucas(fam).xp, lucas(fam).gold]).toEqual([10, 5]);

  // cycles push/pull des deux appareils: aucun re-multiplication ni perte
  await syncCycle(page); await syncCycle(C.page); await syncCycle(page);
  fam = await me(request, f);
  expect([emma(fam).xp, emma(fam).gold, lucas(fam).xp]).toEqual([20, 105, 10]);
  await expect(C.page.locator('#main')).toContainText('20/100 XP');

  const stats = (await api(request, 'getTaskStats', { childId: emma(fam).id, period: 'month' }, f.token)).body;
  expect([stats.tasksCount, stats.xpGained]).toEqual([1, 20]);
  await C.ctx.close();
});

test('événement terminé: gain normal, pas de bandeau', async ({ page, request }) => {
  const f = await newFamily(request, fam => {
    fam.events = [ev({ start: parisDay(Date.now() - 5 * DAY), end: parisDay(Date.now() - DAY) })];
    fam.children[0].tasks = [task('Faire son lit', 10, 5, { done: true }), task('Autre', 1, 1)];
    fam.taskRequests = [pending('Emma', 'Faire son lit', 10, 5)];
  });
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  await page.getByRole('button', { name: 'Valider' }).click();
  await settle(page);
  const e = emma(await me(request, f));
  expect([e.xp, e.gold]).toEqual([10, 105]);
});

test('bonus du jour multiplié (XP ×2, Or ×2)', async ({ browser, page, request }) => {
  const f = await newFamily(request, fam => {
    fam.events = [ev({ xpMult: 2, goldMult: 2 })];
    fam.dailyBonus = { xp: 30, gold: 15 };
    fam.children[0].tasks = [task('Faire son lit', 10, 5, { done: true })];
    fam.taskRequests = [pending('Emma', 'Faire son lit', 10, 5)];
  });
  const C = await mkPage(browser);
  await childLogin(C.page, f);
  await expect(C.page.locator('.event-banner')).toHaveText('🎉 Week-end: XP ×2 · Or ×2');
  await C.page.setViewportSize({ width: 375, height: 812 });
  await C.page.screenshot({ path: 'test-results/events-child-375.png' });
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  await page.getByRole('button', { name: 'Valider' }).click();
  await settle(page);
  const e = emma(await me(request, f));
  expect([e.xp, e.gold]).toEqual([20 + 60, 100 + 10 + 30]);
  await C.ctx.close();
});

test('écran parent Événements lisible à 375 px', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const f = await newFamily(request, fam => { fam.events = [ev({ name: 'Un très long nom d\'événement pour tester' })]; });
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  await page.locator('.event-row').scrollIntoViewIfNeeded();
  // le bloc Événements (lignes + formulaire) tient dans la largeur (la barre de navigation du bas déborde déjà, hors sujet)
  const right = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.event-row, .event-row *, #ev-name, #ev-start, #ev-end, #ev-xp, #ev-gold, [data-action="save-event"]')].map(e => e.getBoundingClientRect().right)));
  expect(right).toBeLessThanOrEqual(375);
  await page.locator('.event-row').screenshot({ path: 'test-results/events-375.png' });
  await page.locator('.card', { has: page.locator('#ev-name') }).screenshot({ path: 'test-results/events-form-375.png' });
});

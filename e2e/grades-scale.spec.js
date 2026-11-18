import { test, expect, newFamily, me, emma, parentLogin, childLogin, tab, settle } from './helpers.js';

const BASE = 'http://localhost:3100';
const mkPage = async (browser, viewport) => { const ctx = await browser.newContext({ baseURL: BASE, ...(viewport ? { viewport } : {}) }); const page = await ctx.newPage(); await page.clock.install(); return { ctx, page }; };
test.beforeEach(async ({ page }) => { await page.clock.install(); });

const submit = async (page, grade, subject = 'Maths', gold = '10') => {
  await page.locator('#grade-subject').fill(subject);
  await page.locator('#grade-value').fill(grade);
  await page.locator('#grade-gold').fill(gold);
  await page.getByRole('button', { name: 'Soumettre' }).click();
  await settle(page);
};
const pendingGrade = (grade, over = {}) => ({ id: 'g1', child: 'Emma', subject: 'Maths', grade, gold: 10, status: 'pending', submittedAt: Date.now(), ...over });
const avgOf = page => page.locator('.xs-card', { hasText: 'Moyennes par matière' }).locator('tbody tr', { hasText: 'Maths' }).locator('td').nth(2);
const scaleRow = (page, label) => page.locator('.scale-row').filter({ has: page.locator(`input.scale-labels[value*="${label}"]`) });

test('enfant: « abc » et « 15,5€ » refusés avant envoi; « 15,5 » et « TB » acceptés et à valider chez le parent', async ({ browser, page, request }) => {
  const f = await newFamily(request);
  await childLogin(page, f);
  await tab(page, 'Notes');
  await expect(page.locator('#grade-value')).toHaveAttribute('inputmode', 'decimal');
  await expect(page.locator('#main')).toContainText('15,5, 17/20 ou TB');

  for (const bad of ['abc', '15,5€']) {
    await submit(page, bad);
    await expect(page.locator('#grade-error')).toContainText('Note invalide');
    await expect(page.locator('#grade-value')).toHaveValue(bad);           // la saisie est conservée pour correction
  }
  expect((await me(request, f)).gradeRequests).toEqual([]);

  await submit(page, '15,5');
  await expect(page.locator('#grade-error')).toHaveCount(0);
  await submit(page, 'TB', 'Français');
  expect((await me(request, f)).gradeRequests.map(g => [g.grade, g.status])).toEqual([['15,5', 'pending'], ['TB', 'pending']]);
  await expect(page.locator('#main')).toContainText('En attente d\'approbation');

  const P = await mkPage(browser);
  await parentLogin(P.page, f);
  await tab(P.page, 'Notes');
  await expect(P.page.locator('#main')).toContainText('À valider (2)');
  await expect(P.page.locator('input[id^="grade-note-"]').nth(0)).toHaveValue('15,5');
  await expect(P.page.locator('input[id^="grade-note-"]').nth(1)).toHaveValue('TB');
  await P.ctx.close();
});

test('parent: correction invalide refusée, puis « 15,5 » corrigé en « 16 » et approuvé (soumise: 15,5), or crédité', async ({ page, request }) => {
  const f = await newFamily(request, fam => { fam.gradeRequests = [pendingGrade('15,5')]; });
  await parentLogin(page, f);
  await tab(page, 'Notes');
  await page.locator('#grade-note-g1').fill('xx');
  await page.getByRole('button', { name: 'Approuver' }).click();
  await settle(page);
  await expect(page.locator('.grade-error')).toContainText('Note invalide');
  await expect(page.locator('#grade-note-g1')).toHaveValue('xx');
  let fam = await me(request, f);
  expect(fam.gradeRequests[0]).toMatchObject({ grade: '15,5', status: 'pending' });
  expect(emma(fam).gold).toBe(100);

  await page.locator('#grade-note-g1').fill('16');
  await page.locator('#grade-gold-g1').fill('12');
  await page.getByRole('button', { name: 'Approuver' }).click();
  await settle(page);
  fam = await me(request, f);
  expect(fam.gradeRequests[0]).toMatchObject({ grade: '16', submittedGrade: '15,5', status: 'approved', gold: 12 });
  expect(emma(fam).gold).toBe(112);
  await expect(page.locator('#main')).toContainText('Note: 16');
  await expect(page.locator('#main')).toContainText('soumise: 15,5');
});

test('parent: « TB » passé de 18 à 10 dans l\'éditeur → la moyenne des statistiques change', async ({ page, request }) => {
  const f = await newFamily(request, fam => { fam.gradeRequests = [pendingGrade('TB', { status: 'approved', approvedAt: Date.now() })]; });
  await parentLogin(page, f);
  await tab(page, 'Statistiques');
  await expect(avgOf(page)).toHaveText('18');

  await tab(page, 'Famille');
  await expect(page.locator('.scale-row')).toHaveCount(3);                  // tableau par défaut
  await scaleRow(page, 'tb').locator('input.scale-value').fill('10');
  await page.getByRole('button', { name: 'Enregistrer les appréciations' }).click();
  await settle(page);
  expect((await me(request, f)).gradeScale.find(r => r.labels.includes('tb')).value).toBe(10);

  await tab(page, 'Statistiques');
  await expect(avgOf(page)).toHaveText('10');
});

test('parent: ajout de « insuffisant » = 6, valeur invalide refusée, rétablir les défauts; l\'enfant soumet « insuffisant »', async ({ browser, page, request }) => {
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Famille');
  await page.getByRole('button', { name: '+ Ajouter une appréciation' }).click();
  const last = page.locator('.scale-row').last();
  await last.locator('input.scale-labels').fill('insuffisant, insuf');
  await last.locator('input.scale-value').fill('25');
  await page.getByRole('button', { name: 'Enregistrer les appréciations' }).click();
  await settle(page);
  await expect(page.locator('#scale-error')).toContainText('entre 0 et 20');
  expect((await me(request, f)).gradeScale).toBeUndefined();

  await page.locator('.scale-row').last().locator('input.scale-value').fill('6');
  await page.getByRole('button', { name: 'Enregistrer les appréciations' }).click();
  await settle(page);
  await expect(page.locator('#scale-error')).toHaveCount(0);
  expect((await me(request, f)).gradeScale).toEqual([
    { labels: ['tb', 'tres bien'], value: 18 }, { labels: ['b', 'bien'], value: 15 }, { labels: ['ab', 'assez bien'], value: 12 },
    { labels: ['insuffisant', 'insuf'], value: 6 },
  ]);

  const C = await mkPage(browser);
  await childLogin(C.page, f);
  await tab(C.page, 'Notes');
  await submit(C.page, 'insuffisant');
  await expect(C.page.locator('#grade-error')).toHaveCount(0);
  expect((await me(request, f)).gradeRequests.map(g => g.grade)).toEqual(['insuffisant']);

  // suppression d'une ligne puis rétablissement des valeurs par défaut
  await page.locator('.scale-row').first().locator('[data-action="del-scale-row"]').click();
  await expect(page.locator('.scale-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Rétablir les valeurs par défaut' }).click();
  await settle(page);
  expect((await me(request, f)).gradeScale.map(r => r.value)).toEqual([18, 15, 12]);
  await expect(page.locator('.scale-row')).toHaveCount(3);
  await C.ctx.close();
});

test('375 px: notes (enfant, parent) et éditeur d\'appréciations sans débordement horizontal, champs ≥ 16 px', async ({ browser, request }) => {
  const long = 'Sciences de la vie et de la Terre et physique-chimie';
  const f = await newFamily(request, fam => {
    fam.gradeRequests = [pendingGrade('15,5', { subject: long }), pendingGrade('16', { id: 'g2', subject: long, status: 'approved', submittedGrade: '15,5', approvedAt: Date.now() })];
  });
  const vp = { width: 375, height: 812 };
  const check = async (page, what) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth), what).toBeLessThanOrEqual(375);
    const small = await page.evaluate(() => [...document.querySelectorAll('#main input:not([type=checkbox]), #main select')]
      .filter(el => el.getClientRects().length).map(el => [el.id || el.className, parseFloat(getComputedStyle(el).fontSize)]).filter(x => x[1] < 16));
    expect(small, what).toEqual([]);
  };
  const P = await mkPage(browser, vp);
  await parentLogin(P.page, f);
  await tab(P.page, 'Notes');
  await expect(P.page.locator('#grade-note-g1')).toBeVisible();
  await check(P.page, 'notes parent');
  await tab(P.page, 'Famille');
  await expect(P.page.locator('.scale-row').first()).toBeVisible();
  await check(P.page, 'famille');
  const C = await mkPage(browser, vp);
  await childLogin(C.page, f);
  await tab(C.page, 'Notes');
  await submit(C.page, 'abc');
  await expect(C.page.locator('#grade-error')).toBeVisible();
  await check(C.page, 'notes enfant');
  await P.ctx.close(); await C.ctx.close();
});

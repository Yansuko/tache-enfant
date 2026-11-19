import { test, expect, newFamily, me, parentLogin, tab, settle, syncCycle, DAY } from './helpers.js';

test.beforeEach(async ({ page }) => { await page.clock.install(); });

const T0 = Date.UTC(2026, 10, 10, 12);
const gr = (id, subject, grade, over = {}) => ({ id, child: 'Emma', subject, grade, gold: 10, status: 'approved', submittedAt: T0, approvedAt: T0 + DAY, ...over });
const grades = fam => {
  fam.gradeRequests = [gr('e1', 'Maths', '15,5'), gr('e2', 'Français', '17/20'), gr('old', 'Histoire', '15 sur 20'), gr('p1', 'Anglais', '12', { status: 'pending' })];
};
const card = (page, id) => page.locator('.grade-approved', { has: page.locator(`[data-id="${id}"]`) });

test('le parent corrige une note validée: erreur claire si invalide, puis « soumise: … » et moyenne recalculée', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const f = await newFamily(request, grades);
  await parentLogin(page, f);
  await tab(page, 'Notes');
  const head = page.locator('.grade-head', { hasText: 'Emma' });
  await expect(head).toContainText('16,3/20');                          // (15,5 + 17) / 2; « 15 sur 20 » illisible
  await expect(page.locator('#grade-note-p1')).toHaveValue('12');       // la note en attente garde son éditeur
  await expect(page.locator('[data-action="edit-grade"][data-id="p1"]')).toHaveCount(0);

  await card(page, 'e1').getByRole('button', { name: /Modifier/ }).click();
  await settle(page);
  const input = page.locator('#grade-edit-e1');
  await expect(input).toHaveValue('15,5');
  const right = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.grade-approved, .grade-approved *')].map(e => e.getBoundingClientRect().right)));
  expect(right).toBeLessThanOrEqual(375);
  expect(parseFloat(await input.evaluate(el => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);

  await input.fill('15 sur 20');
  await card(page, 'e1').getByRole('button', { name: 'Enregistrer' }).click();
  await settle(page);
  await expect(card(page, 'e1').getByRole('alert')).toContainText('Note invalide');
  await expect(page.locator('#grade-edit-e1')).toHaveValue('15 sur 20');
  expect((await me(request, f)).gradeRequests.find(g => g.id === 'e1').grade).toBe('15,5');

  await page.locator('#grade-edit-e1').fill('18');
  await card(page, 'e1').getByRole('button', { name: 'Enregistrer' }).click();
  await settle(page);
  await expect(page.locator('#grade-edit-e1')).toHaveCount(0);
  await expect(card(page, 'e1')).toContainText('Note: 18 (soumise: 15,5)');
  await expect(head).toContainText('17,5/20');                          // (18 + 17) / 2
  await card(page, 'e1').screenshot({ path: 'test-results/edit-grade-375.png' });
  const g = (await me(request, f)).gradeRequests.find(x => x.id === 'e1');
  expect(g).toMatchObject({ grade: '18', submittedGrade: '15,5', status: 'approved', gold: 10 });
  await syncCycle(page);
  await expect(card(page, 'e1')).toContainText('Note: 18 (soumise: 15,5)');
});

test('ancienne note au mauvais format: l\'éditeur s\'ouvre avec la valeur actuelle; Annuler; saisie préservée pendant la synchro', async ({ page, request }) => {
  const f = await newFamily(request, grades);
  await parentLogin(page, f);
  await tab(page, 'Notes');
  await card(page, 'old').getByRole('button', { name: /Modifier/ }).click();
  await settle(page);
  await expect(page.locator('#grade-edit-old')).toHaveValue('15 sur 20');
  await card(page, 'old').getByRole('button', { name: 'Annuler' }).click();
  await settle(page);
  await expect(page.locator('#grade-edit-old')).toHaveCount(0);
  await expect(card(page, 'old')).toContainText('Note: 15 sur 20');

  await card(page, 'old').getByRole('button', { name: /Modifier/ }).click();
  await settle(page);
  await page.locator('#grade-edit-old').fill('15/20');
  await page.locator('#grade-edit-old').blur();
  await syncCycle(page);
  await expect(page.locator('#grade-edit-old')).toHaveValue('15/20');
  await card(page, 'old').getByRole('button', { name: 'Enregistrer' }).click();
  await settle(page);
  await expect(card(page, 'old')).toContainText('Note: 15/20 (soumise: 15 sur 20)');
  await expect(page.locator('.grade-head', { hasText: 'Emma' })).toContainText('15,8/20');   // (15,5 + 17 + 15) / 3
});

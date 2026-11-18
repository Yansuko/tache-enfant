import { test, expect, newFamily, me, emma, parentLogin, tab, settle, syncCycle, DAY } from './helpers.js';

test.beforeEach(async ({ page }) => { await page.clock.install(); });

const T0 = Date.UTC(2026, 10, 10, 12);
const gr = (id, child, subject, grade, status, over = {}) => ({ id, child, subject, grade, gold: 10, status, submittedAt: T0, ...over });
const mixed = fam => {
  fam.gradeRequests = [
    gr('e1', 'Emma', 'Maths', '15,5', 'approved', { approvedAt: T0 + DAY }),
    gr('l1', 'Lucas', 'Maths', '12', 'approved', { approvedAt: T0 + 2 * DAY }),
    gr('e2', 'Emma', 'Français', '17/20', 'approved', { approvedAt: T0 + 3 * DAY }),
    gr('e3', 'Emma', 'Histoire', '14', 'pending'),
    gr('l2', 'Lucas', 'Français', 'TB', 'pending', { gold: 7 }),
    gr('l3', 'Lucas', 'Maths', '5', 'refused'),
  ];
};
const section = (page, name) => page.locator('.grade-section', { has: page.locator('.grade-head', { hasText: name }) });
const chip = (page, name) => page.locator('.grade-chips [data-action="grade-filter"]', { hasText: name });

test('sections par enfant dans l\'ordre de la famille, moyennes, approuvées récentes d\'abord', async ({ page, request }) => {
  const f = await newFamily(request, mixed);
  await parentLogin(page, f);
  await tab(page, 'Notes');
  await expect(page.locator('.grade-section .grade-head .grade-name')).toHaveText(['Emma', 'Lucas']);
  const E = section(page, 'Emma'), L = section(page, 'Lucas');
  await expect(E.locator('.grade-head')).toContainText('16,3/20');      // (15,5 + 17) / 2 = 16,25
  await expect(E.locator('.grade-head')).toContainText('2 notes');
  await expect(E.locator('.grade-head')).toContainText('1 à valider');
  await expect(E.locator('.grade-subjects')).toHaveText('Français 17 · Maths 15,5');
  await expect(E.locator('.grade-approved .card-title')).toHaveText(['Français', 'Maths']);
  await expect(E.locator('.grade-approved').first()).toContainText('13/11/2026');
  await expect(E.locator('#grade-note-e3')).toHaveValue('14');
  await expect(L.locator('.grade-head')).toContainText('12/20');
  await expect(L.locator('#grade-note-l2')).toHaveValue('TB');
  await expect(L.locator('details.grade-refused')).toContainText('Refusées (1)');
  await expect(L.locator('details.grade-refused')).not.toHaveAttribute('open', '');
  // pastilles: Tous · Emma · Lucas, avec le nombre de notes à valider
  await expect(page.locator('.grade-chips [data-action="grade-filter"]')).toHaveText(['Tous2', 'Emma1', 'Lucas1']);
});

test('filtres enfant et matière: état client conservé après une synchro, saisie en cours préservée', async ({ page, request }) => {
  const f = await newFamily(request, mixed);
  await parentLogin(page, f);
  await tab(page, 'Notes');
  await chip(page, 'Lucas').click();
  await settle(page);
  await expect(page.locator('.grade-section')).toHaveCount(1);
  await expect(page.locator('.grade-section .grade-name')).toHaveText('Lucas');
  await page.locator('#grade-subject-filter').selectOption('Maths');
  await settle(page);
  await expect(section(page, 'Lucas').locator('.grade-approved .card-title')).toHaveText(['Maths']);
  await expect(page.locator('#grade-note-l2')).toHaveCount(0);           // Français filtré
  await syncCycle(page);
  await expect(page.locator('.grade-section .grade-name')).toHaveText('Lucas');
  await expect(page.locator('#grade-subject-filter')).toHaveValue('Maths');

  await page.locator('#grade-subject-filter').selectOption('');
  await settle(page);
  await page.locator('#grade-note-l2').fill('B');
  await syncCycle(page);
  await expect(page.locator('#grade-note-l2')).toHaveValue('B');
  await chip(page, 'Tous').click();
  await settle(page);
  await expect(page.locator('.grade-section')).toHaveCount(2);
});

test('approuver depuis la section d\'un enfant (note corrigée, or crédité), refuser → « Refusées »', async ({ page, request }) => {
  const f = await newFamily(request, mixed);
  await parentLogin(page, f);
  await tab(page, 'Notes');
  const L = section(page, 'Lucas');
  await L.locator('#grade-note-l2').fill('16');
  await L.locator('#grade-gold-l2').fill('9');
  await L.getByRole('button', { name: 'Approuver' }).click();
  await settle(page);
  let fam = await me(request, f);
  expect(fam.gradeRequests.find(g => g.id === 'l2')).toMatchObject({ status: 'approved', grade: '16', submittedGrade: 'TB', gold: 9 });
  expect(fam.gradeRequests.find(g => g.id === 'e3').status).toBe('pending');
  expect(fam.children.find(c => c.name === 'Lucas').gold).toBe(9);
  expect(emma(fam).gold).toBe(100);
  await expect(L.locator('.grade-approved').first()).toContainText('Note: 16');
  await expect(L.locator('.grade-approved').first()).toContainText('soumise: TB');

  const E = section(page, 'Emma');
  await E.getByRole('button', { name: 'Refuser' }).click();
  await settle(page);
  fam = await me(request, f);
  expect(fam.gradeRequests.find(g => g.id === 'e3').status).toBe('refused');
  await expect(E.locator('[data-action="refuse-grade"]')).toHaveCount(0);
  await expect(E.locator('details.grade-refused')).toContainText('Refusées (1)');
  await E.locator('details.grade-refused summary').click();
  await expect(E.locator('details.grade-refused')).toContainText('Histoire');
});

test('un seul enfant: pas de pastilles', async ({ page, request }) => {
  const f = await newFamily(request, fam => { fam.children = fam.children.slice(0, 1); fam.gradeRequests = [gr('e1', 'Emma', 'Maths', '15', 'pending')]; });
  await parentLogin(page, f);
  await tab(page, 'Notes');
  await expect(page.locator('.grade-section')).toHaveCount(1);
  await expect(page.locator('.grade-chips')).toHaveCount(0);
  await expect(page.locator('#grade-subject-filter')).toBeVisible();
});

test('375 px: sections lisibles sans débordement horizontal, champs ≥ 16 px', async ({ browser, request }) => {
  const long = 'Sciences de la vie et de la Terre et physique-chimie';
  const f = await newFamily(request, fam => { mixed(fam); fam.gradeRequests.push(gr('e9', 'Emma', long, '15,5', 'pending'), gr('e8', 'Emma', long, '16', 'approved', { submittedGrade: '15,5' })); });
  const ctx = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.clock.install();
  await parentLogin(page, f);
  await tab(page, 'Notes');
  await expect(page.locator('#grade-note-e9')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const small = await page.evaluate(() => [...document.querySelectorAll('#main input, #main select')]
    .filter(el => el.getClientRects().length).map(el => [el.id, parseFloat(getComputedStyle(el).fontSize)]).filter(x => x[1] < 16));
  expect(small).toEqual([]);
  await page.screenshot({ path: 'test-results/grades-tab-375.png', fullPage: true });
  await ctx.close();
});

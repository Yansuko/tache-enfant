import { test, expect, settle, newFamily, me, emma, parentLogin, childLogin, tab, syncCycle, task, taskCard } from './helpers.js';

test.beforeEach(async ({ page }) => { await page.clock.install(); });

const remindBtn = (page, name) => page.locator('.card', { hasText: name }).locator('[data-action="remind-task"]');

test('bouton 🔔: rappelle une quête non validée, absent sur une quête validée, anti-spam', async ({ page, request }) => {
  const f = await newFamily(request, fam => {
    fam.children[0].tasks = [task('Ranger la chambre', 10, 5), task('Faire les devoirs', 10, 5, { done: true, completedAt: Date.now() })];
  });
  await parentLogin(page, f);
  await tab(page, 'Quêtes');

  await expect(remindBtn(page, 'Faire les devoirs')).toHaveCount(0);
  const btn = remindBtn(page, 'Ranger la chambre');
  await expect(btn).toBeVisible();

  const req = page.waitForRequest(r => (r.postData() || '').includes('"action":"remindQuest"'));
  await btn.click();
  const body = JSON.parse((await req).postData());
  expect(body).toMatchObject({ familyId: f.family.id, childId: emma(f.family).id, taskId: 't-Ranger-la-chambre' });
  await expect(page.locator('#flash')).toContainText('Rappel envoyé');

  await remindBtn(page, 'Ranger la chambre').click();
  await expect(page.locator('#flash')).toContainText('déjà envoyé');
});

test('bouton 🔔 absent côté enfant', async ({ page, request }) => {
  const f = await newFamily(request, fam => { fam.children[0].tasks = [task('Ranger la chambre', 10, 5)]; });
  await childLogin(page, f);
  await expect(taskCard(page, 'Ranger la chambre')).toHaveCount(1);
  await expect(page.locator('[data-action="remind-task"]')).toHaveCount(0);
});

test('rappels planifiés: ajout, synchro, rechargement, désactivation, suppression', async ({ page, request }) => {
  const f = await newFamily(request, fam => { fam.children[0].tasks = [task('Ranger la chambre', 10, 5)]; });
  await parentLogin(page, f);
  await tab(page, 'Quêtes');

  await expect(page.locator('#main')).toContainText('Rappels');
  await page.locator('#rem-child').selectOption({ label: 'Emma' });
  await page.locator('#rem-quest').selectOption({ label: 'Ranger la chambre' });
  await page.locator('input[name="rem-day"][value="0"]').check();
  await page.locator('#rem-time').fill('17:00');
  await page.getByRole('button', { name: 'Ajouter le rappel' }).click();
  await settle(page);
  await syncCycle(page);

  const row = page.locator('.reminder-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Emma');
  await expect(row).toContainText('Ranger la chambre');
  await expect(row).toContainText('Lun');
  await expect(row).toContainText('17:00');

  let saved = (await me(request, f)).reminders;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ childId: emma(f.family).id, questName: 'Ranger la chambre', days: [0], time: '17:00', enabled: true });
  expect(saved[0].id).toMatch(/^rem-\d+-/);

  await page.reload();                                           // reconnexion du parent: déverrouillage
  await page.getByPlaceholder('••••••').fill(f.password);
  await page.getByRole('button', { name: 'Déverrouiller' }).click();
  await settle(page);
  await tab(page, 'Quêtes');
  await expect(page.locator('.reminder-row')).toHaveCount(1);

  await page.locator('.reminder-row [data-action="toggle-reminder"]').click();
  await settle(page);
  saved = (await me(request, f)).reminders;
  expect(saved[0].enabled).toBe(false);
  await expect(page.locator('.reminder-row [data-action="toggle-reminder"]')).not.toBeChecked();

  await page.locator('.reminder-row [data-action="del-reminder"]').click();
  await settle(page);
  await expect(page.locator('.reminder-row')).toHaveCount(0);
  expect((await me(request, f)).reminders).toEqual([]);
});

test('rappel sans jour refusé; rappel « toutes les quêtes » sur plusieurs jours', async ({ page, request }) => {
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  page.once('dialog', d => d.accept());
  await page.locator('#rem-time').fill('17:00');
  await page.getByRole('button', { name: 'Ajouter le rappel' }).click();
  await settle(page);
  await expect(page.locator('.reminder-row')).toHaveCount(0);

  await page.locator('#rem-child').selectOption({ label: 'Lucas' });
  for (const d of ['0', '2', '4']) await page.locator(`input[name="rem-day"][value="${d}"]`).check();
  await page.locator('#rem-time').fill('18:30');
  await page.getByRole('button', { name: 'Ajouter le rappel' }).click();
  await settle(page);
  await expect(page.locator('.reminder-row')).toContainText('Toutes les quêtes');
  await expect(page.locator('.reminder-row')).toContainText('Lucas');
  const saved = (await me(request, f)).reminders;
  expect(saved[0]).toMatchObject({ days: [0, 2, 4], time: '18:30' });
  expect(saved[0].questName).toBeUndefined();
});

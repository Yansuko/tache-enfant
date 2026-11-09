import { test, expect, api, settle, newFamily, me, emma, parentLogin, childLogin, tab, syncCycle, task, taskCard } from './helpers.js';

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
  // aucun appareil d'Emma abonné: le serveur répond sent:0, pas de « Rappel envoyé » ni de blocage
  await expect(page.locator('#flash')).toContainText("Emma n'a pas activé les notifications");
  await expect(page.locator('#flash')).not.toContainText('Rappel envoyé');

  // appareil abonné (réponses simulées: le serveur de test ne peut pas joindre un vrai service push)
  const replies = [{ status: 200, body: { ok: true, sent: 1 } }, { status: 429, body: { error: 'Rappel déjà envoyé, patientez une minute.' } }];
  await page.route('**/api', route => (route.request().postData() || '').includes('"action":"remindQuest"')
    ? route.fulfill({ status: replies[0].status, contentType: 'application/json', body: JSON.stringify(replies.shift().body) })
    : route.continue());
  await remindBtn(page, 'Ranger la chambre').click();
  await expect(page.locator('#flash')).toContainText('Rappel envoyé à Emma');
  await remindBtn(page, 'Ranger la chambre').click();
  await expect(page.locator('#flash')).toContainText('déjà envoyé');
});

test('formulaire de rappel: la liste des quêtes suit l\'enfant choisi', async ({ page, request }) => {
  const f = await newFamily(request, fam => {
    fam.children.find(c => c.name === 'Emma').tasks = [task('Ranger la chambre', 10, 5)];
    fam.children.find(c => c.name === 'Lucas').tasks = [task('Nourrir le chat', 10, 5)];
  });
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  const opts = () => page.locator('#rem-quest option').allTextContents();
  await page.locator('#rem-child').selectOption({ label: 'Emma' });
  expect(await opts()).toEqual(['Toutes les quêtes', 'Ranger la chambre']);
  await page.locator('#rem-child').selectOption({ label: 'Lucas' });
  expect(await opts()).toEqual(['Toutes les quêtes', 'Nourrir le chat']);
  await page.locator('#rem-quest').selectOption({ label: 'Nourrir le chat' });
  await page.locator('input[name="rem-day"][value="1"]').check();
  await page.getByRole('button', { name: 'Ajouter le rappel' }).click();
  await settle(page);
  const saved = (await me(request, f)).reminders;
  expect(saved[0]).toMatchObject({ childId: f.family.children.find(c => c.name === 'Lucas').id, questName: 'Nourrir le chat' });
});

test('rappels: un appareil périmé ne fait pas disparaître le rappel ajouté par un autre parent', async ({ page, request }) => {
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  // un autre parent ajoute un rappel pendant que cette page est ouverte
  const fam = await me(request, f);
  await api(request, 'saveFamily', { family: { ...fam, reminders: [{ id: 'rem-other', childId: emma(f.family).id, days: [2], time: '08:00', enabled: true }] } }, f.token);
  await page.locator('input[name="rem-day"][value="0"]').check();
  await page.getByRole('button', { name: 'Ajouter le rappel' }).click();
  await settle(page);
  let saved = (await me(request, f)).reminders;
  expect(saved.map(r => r.id)).toContain('rem-other');
  expect(saved).toHaveLength(2);
  // la suppression explicite fonctionne toujours
  await syncCycle(page);
  await expect(page.locator('.reminder-row')).toHaveCount(2);
  await page.locator('.reminder-row', { hasText: '08:00' }).locator('[data-action="del-reminder"]').click();
  await settle(page);
  saved = (await me(request, f)).reminders;
  expect(saved.map(r => r.id)).not.toContain('rem-other');
  expect(saved).toHaveLength(1);
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

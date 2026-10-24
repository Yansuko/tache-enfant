import { test, expect, newFamily, me, api, parentLogin, childLogin, tab, settle } from './helpers.js';

test.beforeEach(async ({ page }) => { await page.clock.install(); });

test('page admin: mauvaise clé refusée, bonne clé accède au tableau de bord', async ({ page }) => {
  await page.goto('/admin.html');
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.locator('#admin-key').fill('demo-admin-key');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.locator('#login-section')).toBeVisible();
  await expect(page.locator('#dashboard-section')).toBeHidden();

  await page.locator('#admin-key').fill('e2e-admin');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.locator('#dashboard-section')).toBeVisible();
});

test('ajouter un enfant depuis l\'application: il est enregistré et visible après synchro', async ({ page, request }) => {
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Enfants');
  await page.locator('#new-child-name').fill('Zoé');
  await page.locator('[data-action="add-child"]').click();
  await settle(page);
  expect((await me(request, f)).children.map(c => c.name)).toEqual(['Emma', 'Lucas', 'Zoé']);
});

test('créer une seconde famille puis revenir à la première', async ({ page, request }) => {
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Famille');
  await page.locator('#new-fam-name').fill('Seconde maison');
  await page.locator('[data-action="add-family"]').click();
  await settle(page);
  await expect(page.locator('.topbar')).toContainText('Seconde maison');
  const fams = (await api(request, 'me', {}, f.token)).body.families;
  expect(fams.map(x => x.name)).toContain('Seconde maison');
  await tab(page, 'Famille');
  await page.locator(`[data-action="switch-family"][data-id="${f.family.id}"]`).click();
  await settle(page);
  await expect(page.locator('.topbar')).toContainText(f.familyName.slice(0, 3));
});

test('PIN: le parent le réinitialise, l\'enfant en crée un nouveau depuis l\'appareil du parent, puis se connecte', async ({ browser, request }) => {
  const f = await newFamily(request);
  const ctx = await browser.newContext({ baseURL: 'http://localhost:3100' });
  const P = await ctx.newPage(); const C = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await P.clock.install();
  P.on('dialog', d => d.accept());                                        // confirmation de la réinitialisation
  await parentLogin(P, f);
  await tab(P, 'Enfants');
  await P.locator('[data-action="reset-child-pin"]').first().click();
  await settle(P);
  expect((await me(request, f)).children[0].pin ?? null).toBeNull();

  await C.goto('/');                                                       // sans PIN, la connexion enfant est refusée
  await C.getByRole('button', { name: /Enfant/ }).first().click();
  await C.locator('#ec-famname').fill(f.familyName); await C.locator('#ec-name').fill('Emma'); await C.locator('#ec-pin').fill('1234');
  await C.getByRole('button', { name: 'Se connecter' }).click();
  await expect(C.locator('#main')).toContainText('incorrect');

  await P.locator('#role-seg label', { hasText: 'Enfant' }).click();      // l'enfant crée son code sur l'appareil du parent
  await P.getByRole('button', { name: /Créer mon code/ }).click();
  await P.locator('#pin-input-1').fill('5555');
  await P.locator('#pin-input-2').fill('5555');
  await P.locator('[data-action="submit-pin"]').click();
  await settle(P);
  expect((await me(request, f)).children[0].pin).toBe('5555');
  await C.locator('#ec-pin').fill('5555');
  await C.getByRole('button', { name: 'Se connecter' }).click();
  await expect(C.locator('#main')).toContainText('Emma');
  await ctx.close();
});

test('après une erreur de connexion, les champs saisis (hors mot de passe et PIN) sont conservés', async ({ page, request }) => {
  const f = await newFamily(request);
  await page.goto('/');
  await page.getByPlaceholder('parent@email.fr').fill(f.email);
  await page.getByPlaceholder('••••••').fill('mauvais');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Email ou mot de passe incorrect.')).toBeVisible();
  await expect(page.getByPlaceholder('parent@email.fr')).toHaveValue(f.email);
  await expect(page.getByPlaceholder('••••••')).toHaveValue('');

  await page.getByRole('button', { name: /Enfant/ }).first().click();
  await page.locator('#ec-famname').fill(f.familyName);
  await page.locator('#ec-name').fill('Emma');
  await page.locator('#ec-pin').fill('0000');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.locator('#main')).toContainText('incorrect');
  await expect(page.locator('#ec-famname')).toHaveValue(f.familyName);
  await expect(page.locator('#ec-name')).toHaveValue('Emma');
  await expect(page.locator('#ec-pin')).toHaveValue('');
});

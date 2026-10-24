import { test, expect } from '@playwright/test';

// Base vierge à chaque démarrage: le compte de démo (parent@demo.fr / demo) est semé au premier appel API.
const login = async (page, password = 'demo') => {
  await page.goto('/');
  await page.getByPlaceholder('parent@email.fr').fill('parent@demo.fr');
  await page.getByPlaceholder('••••••').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
};
const tab = async (page, name) => { await page.locator('nav button', { hasText: name }).click(); await page.waitForLoadState('networkidle'); };
const syncCycle = async (page) => { await page.clock.runFor(31000); await page.waitForLoadState('networkidle'); };
const templateCards = (page, name) => page.locator('.card:has([data-action="del-quest-def"])', { hasText: name });
const taskChecks = (page, name) => page.locator('.card:has([data-action="toggle-task"])', { hasText: name }).locator('[data-action="toggle-task"]');

test.beforeEach(async ({ page }) => { await page.clock.install(); });

test('connexion: erreur sur mauvais mot de passe, session restaurée au rechargement, déconnexion', async ({ page }) => {
  await login(page, 'mauvais');
  await expect(page.getByText('Email ou mot de passe incorrect.')).toBeVisible();

  await page.getByPlaceholder('parent@email.fr').fill('parent@demo.fr');   // le formulaire est réaffiché vide après l'erreur
  await page.getByPlaceholder('••••••').fill('demo');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Famille Démo')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Espace parent')).toBeVisible();          // session gardée, espace parent reverrouillé
  await page.getByPlaceholder('••••••').fill('demo');
  await page.getByRole('button', { name: 'Déverrouiller' }).click();
  await expect(page.getByText('Famille Démo')).toBeVisible();

  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
});

test('un modèle de quête supprimé ne revient ni au rechargement ni après une synchro', async ({ page }) => {
  await login(page);
  await expect(page.getByText('Famille Démo')).toBeVisible();
  await tab(page, 'Quêtes');

  await page.locator('#qd-name').fill('Modèle éphémère');
  await page.locator('#qd-xp').fill('12');
  await page.locator('#qd-gold').fill('3');
  await page.getByRole('button', { name: 'Enregistrer le modèle' }).click();
  await expect(templateCards(page, 'Modèle éphémère')).toHaveCount(1);

  await templateCards(page, 'Modèle éphémère').locator('[data-action="del-quest-def"]').click();
  await expect(templateCards(page, 'Modèle éphémère')).toHaveCount(0);

  await syncCycle(page);
  await expect(templateCards(page, 'Modèle éphémère')).toHaveCount(0);

  await page.reload();
  await page.getByPlaceholder('••••••').fill('demo');
  await page.getByRole('button', { name: 'Déverrouiller' }).click();
  await tab(page, 'Quêtes');
  await expect(templateCards(page, 'Modèle éphémère')).toHaveCount(0);
  await expect(templateCards(page, 'Ranger sa chambre')).toHaveCount(1);   // pas de doublons
});

test('une quête déjà validée puis réassignée arrive à faire, même après une synchro', async ({ page }) => {
  await login(page);
  await tab(page, 'Quêtes');
  const assign = () => templateCards(page, 'Faire son lit').getByRole('button', { name: /Assigner à/ }).click();

  await assign();
  await expect(taskChecks(page, 'Faire son lit')).toHaveCount(1);
  await taskChecks(page, 'Faire son lit').first().click();                 // l'enfant coche
  await page.locator('.card', { hasText: 'Faire son lit' }).getByRole('button', { name: 'Valider' }).click();   // le parent valide
  await expect(taskChecks(page, 'Faire son lit').first()).toHaveClass(/done/);

  await assign();                                                           // même modèle, de nouveau
  await expect(taskChecks(page, 'Faire son lit')).toHaveCount(2);
  await expect(taskChecks(page, 'Faire son lit').nth(1)).not.toHaveClass(/done/);

  await syncCycle(page);
  await expect(taskChecks(page, 'Faire son lit').first()).toHaveClass(/done/);
  await expect(taskChecks(page, 'Faire son lit').nth(1)).not.toHaveClass(/done/);
});

test('la synchro automatique n\'efface pas une saisie en cours', async ({ page }) => {
  await login(page);
  await tab(page, 'Quêtes');
  await page.locator('#new-task-name').fill('Passer l\'aspirateur');
  await page.locator('#new-task-xp').fill('25');
  await page.locator('#new-task-gold').fill('7');

  await syncCycle(page);

  await expect(page.locator('#new-task-name')).toHaveValue('Passer l\'aspirateur');
  await expect(page.locator('#new-task-xp')).toHaveValue('25');
  await expect(page.locator('#new-task-gold')).toHaveValue('7');
});

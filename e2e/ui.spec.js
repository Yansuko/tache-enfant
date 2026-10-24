import { test, expect, settle, instrument } from './helpers.js';

// Base vierge à chaque démarrage: le compte de démo (parent@demo.fr / demo) est semé au premier appel API.
const login = async (page, password = 'demo') => {
  await page.goto('/');
  await page.getByPlaceholder('parent@email.fr').fill('parent@demo.fr');
  await page.getByPlaceholder('••••••').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
};
const tab = async (page, name) => { await page.locator('nav button', { hasText: name }).click(); await settle(page); };
const syncCycle = async (page) => { for (let i = 0; i < 2; i++) { await page.clock.runFor(31000); await page.waitForTimeout(100); await settle(page); } };
const templateCards = (page, name) => page.locator('.card:has([data-action="del-quest-def"])', { hasText: name });
const taskChecks = (page, name) => page.locator('.card:has([data-action="toggle-task"])', { hasText: name }).locator('[data-action="toggle-task"]');

test.beforeEach(async ({ page }) => { await page.clock.install(); await instrument(page); });

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

test('proposition de récompense: le parent modifie prix et niveau avant de valider', async ({ page, request }) => {
  const lg = await (await request.post('/api', { data: { action: 'login', email: 'parent@demo.fr', password: 'demo' } })).json();
  const fam = lg.families[0];
  fam.proposals = [...(fam.proposals || []), { id: 'prop-e2e', child: 'Emma', name: 'Aller à la piscine', cost: 60, status: 'pending' }];
  const saved = await request.post('/api', { headers: { Authorization: `Bearer ${lg.token}` }, data: { action: 'saveFamily', family: fam } });
  expect(saved.ok()).toBeTruthy();

  await login(page);
  await tab(page, 'Boutique');
  const proposal = page.locator('.card', { hasText: 'propose' }).filter({ hasText: 'Aller à la piscine' });
  await expect(proposal).toContainText('proposé : 60');
  await expect(proposal.locator('input[class*="reward-cost-"]')).toHaveValue('60');
  await expect(proposal.locator('input[class*="reward-lvl-"]')).toHaveValue('1');

  await proposal.locator('input[class*="reward-cost-"]').fill('45');
  await proposal.locator('input[class*="reward-lvl-"]').fill('2');
  await proposal.getByRole('button', { name: 'Accepter' }).click();
  await expect(proposal).toHaveCount(0);

  const row = page.locator('div:has([data-action="del-reward"])', { hasText: 'Aller à la piscine' }).last();
  await expect(row).toContainText('45');
  await expect(row).toContainText('Niv. 2');

  // persisté côté serveur, avec le prix du parent (pas celui de l'enfant); et aucun faux modèle de quête
  await settle(page);
  const me = await (await request.post('/api', { headers: { Authorization: `Bearer ${lg.token}` }, data: { action: 'me' } })).json();
  const reward = me.families[0].rewards.find(r => r.name === 'Aller à la piscine');
  expect([reward.cost, reward.lvl]).toEqual([45, 2]);
  expect(me.families[0].questList.some(q => q.name === 'Aller à la piscine')).toBe(false);
  expect(me.families[0].proposals.some(p => p.name === 'Aller à la piscine' && p.status === 'pending')).toBe(false);
});

test('une proposition avec un prix ou un niveau invalide n\'est pas validée', async ({ page, request }) => {
  const lg = await (await request.post('/api', { data: { action: 'login', email: 'parent@demo.fr', password: 'demo' } })).json();
  const fam = lg.families[0];
  fam.proposals = [...(fam.proposals || []), { id: 'prop-e2e-2', child: 'Emma', name: 'Cinéma', cost: 30, status: 'pending' }];
  await request.post('/api', { headers: { Authorization: `Bearer ${lg.token}` }, data: { action: 'saveFamily', family: fam } });

  await login(page);
  await tab(page, 'Boutique');
  const proposal = page.locator('.card', { hasText: 'propose' }).filter({ hasText: 'Cinéma' });
  page.once('dialog', d => d.accept());
  await proposal.locator('input[class*="reward-cost-"]').fill('0');
  await proposal.getByRole('button', { name: 'Accepter' }).click();
  await expect(proposal).toHaveCount(1);       // toujours en attente
});

test('proposition de quête acceptée: XP et or du parent, et elle ne revient pas en attente', async ({ page, request }) => {
  const lg = await (await request.post('/api', { data: { action: 'login', email: 'parent@demo.fr', password: 'demo' } })).json();
  const fam = lg.families[0];
  fam.proposals = [...(fam.proposals || []), { id: 'prop-e2e-q', child: 'Emma', name: 'Apprendre le piano', type: 'quest', status: 'pending' }];
  await request.post('/api', { headers: { Authorization: `Bearer ${lg.token}` }, data: { action: 'saveFamily', family: fam } });

  await login(page);
  await tab(page, 'Boutique');
  const proposal = page.locator('.card', { hasText: 'propose une quête' }).filter({ hasText: 'Apprendre le piano' });
  await proposal.locator('input[class*="quest-xp-"]').fill('40');
  await proposal.locator('input[class*="quest-gold-"]').fill('9');
  await proposal.getByRole('button', { name: 'Accepter' }).click();
  await expect(proposal).toHaveCount(0);

  await settle(page);
  await syncCycle(page);
  await expect(proposal).toHaveCount(0);
  const me = await (await request.post('/api', { headers: { Authorization: `Bearer ${lg.token}` }, data: { action: 'me' } })).json();
  const quest = me.families[0].questList.find(q => q.name === 'Apprendre le piano');
  expect([quest.xp, quest.gold]).toEqual([40, 9]);
  expect(me.families[0].proposals.some(p => p.name === 'Apprendre le piano' && p.status === 'pending')).toBe(false);
});

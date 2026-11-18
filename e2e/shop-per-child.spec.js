import { test, expect, newFamily, me, emma, parentLogin, childLogin, tab, settle, syncCycle } from './helpers.js';

const BASE = 'http://localhost:3100';
const mkPage = async (browser, opts = {}) => { const ctx = await browser.newContext({ baseURL: BASE, ...opts }); const page = await ctx.newPage(); await page.clock.install(); return { ctx, page }; };
const lucas = fam => fam.children.find(c => c.name === 'Lucas');
const pizza = { id: 'r-pizza', icon: '🍕', name: 'Pizza', cost: 60, lvl: 1 };
const shopItem = (page, name) => page.locator('.shop-item', { hasText: name });

test('prix par enfant et article réservé: Emma paie 40, Lucas 60, la Glace n\'est que chez Emma', async ({ browser, request }) => {
  const f = await newFamily(request, fam => { fam.rewards = [pizza]; fam.children[1].gold = 100; });
  const P = await mkPage(browser, { viewport: { width: 375, height: 812 } });
  const page = P.page;
  await parentLogin(page, f);
  await tab(page, 'Boutique');

  // Prix propre à Emma
  const row = page.locator('.reward-row', { hasText: 'Pizza' });
  await row.locator('summary', { hasText: 'Par enfant' }).click();
  await row.locator(`input[data-price-child="${emma(f.family).id}"]`).fill('40');
  // l'éditeur tient dans 375 px (la page déborde déjà ailleurs: on mesure l'éditeur lui-même)
  expect(await row.locator('details').evaluate(d => Math.max(...[...d.querySelectorAll('*')].map(e => e.getBoundingClientRect().right)))).toBeLessThanOrEqual(375);
  await expect(row.locator(`input[data-price-child="${emma(f.family).id}"]`)).toBeInViewport();
  await row.getByRole('button', { name: 'Enregistrer' }).click();
  await settle(page);
  expect((await me(request, f)).rewards[0]).toEqual(expect.objectContaining({ prices: { [emma(f.family).id]: 40 } }));

  // Nouvel article réservé à Emma
  await page.locator('#new-reward-name').fill('Glace');
  await page.locator('#new-reward-cost').fill('10');
  await page.locator(`input[name="new-reward-child"][value="${emma(f.family).id}"]`).check();
  await page.getByRole('button', { name: '+ Ajouter un article' }).click();
  await settle(page);
  expect((await me(request, f)).rewards[1]).toEqual(expect.objectContaining({ name: 'Glace', cost: 10, childIds: [emma(f.family).id] }));

  const E = await mkPage(browser);
  await childLogin(E.page, f);
  await tab(E.page, 'Boutique');
  await expect(shopItem(E.page, 'Pizza')).toContainText('40 🪙');
  await expect(shopItem(E.page, 'Glace')).toHaveCount(1);
  const L = await mkPage(browser);
  await childLogin(L.page, f, 'Lucas', '4321');
  await tab(L.page, 'Boutique');
  await expect(shopItem(L.page, 'Pizza')).toContainText('60 🪙');
  await expect(shopItem(L.page, 'Glace')).toHaveCount(0);

  // Emma achète la Pizza: demande à 40, approuvée → 40 or débités
  await shopItem(E.page, 'Pizza').getByRole('button', { name: 'Acheter' }).click();
  await settle(E.page);
  expect((await me(request, f)).requests).toEqual([expect.objectContaining({ child: 'Emma', name: 'Pizza', cost: 40, rewardId: 'r-pizza', status: 'pending' })]);
  await syncCycle(page);
  await expect(page.locator('#main')).toContainText('veut acheter : Pizza (40 🪙)');
  await page.locator('[data-action="approve"]').click();
  await settle(page);
  const fam = await me(request, f);
  expect(emma(fam).gold).toBe(60);
  expect(lucas(fam).gold).toBe(100);

  // Suppression du prix spécifique → retour au prix commun
  const row2 = page.locator('.reward-row', { hasText: 'Pizza' });
  await row2.locator('summary', { hasText: 'Par enfant' }).click();
  await row2.locator(`input[data-price-child="${emma(f.family).id}"]`).fill('');
  await row2.getByRole('button', { name: 'Enregistrer' }).click();
  await settle(page);
  expect((await me(request, f)).rewards[0].prices).toBeUndefined();
  await syncCycle(E.page);
  await expect(shopItem(E.page, 'Pizza')).toContainText('60 🪙');
  await P.ctx.close(); await E.ctx.close(); await L.ctx.close();
});

test('le prochain objectif de l\'enfant suit son prix et ignore les articles réservés aux autres', async ({ page, request }) => {
  const f = await newFamily(request, fam => {
    fam.rewards = [
      { ...pizza, cost: 300, prices: { [fam.children[0].id]: 150 } },
      { id: 'r-velo', icon: '🚲', name: 'Vélo', cost: 120, lvl: 1, childIds: [fam.children[1].id] },
    ];
  });
  await childLogin(page, f);
  await tab(page, 'Boutique');
  await expect(page.locator('#main')).toContainText('prochain article à 150 🪙');
});

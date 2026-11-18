import { test, expect, newFamily, parentLogin, childLogin, tab, settle, instrument } from './helpers.js';

// Safari iOS zoome au focus d'un champ dont la police est < 16 px.
const small = (page) => page.evaluate(() => [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea')]
  .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
  .map(el => ({ id: el.id || el.name || el.tagName, px: parseFloat(getComputedStyle(el).fontSize) }))
  .filter(x => x.px < 16));

test.use({ viewport: { width: 375, height: 812 } });

test('mobile: tous les champs de saisie font au moins 16 px', async ({ page, browser, request }) => {
  const f = await newFamily(request, fam => {
    fam.questList = [{ id: 'q1', icon: '⭐', name: 'Quête', xp: 5, gold: 1, frequency: 'daily' }];
    fam.rewards = [{ id: 'r1', icon: '🍕', name: 'Pizza', cost: 10 }];
  });
  await instrument(page);
  await page.goto('/');
  expect(await page.locator('meta[name=viewport]').getAttribute('content')).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/);
  expect(await small(page), 'connexion').toEqual([]);
  await page.getByRole('button', { name: /Enfant/ }).first().click();
  expect(await small(page), 'connexion enfant').toEqual([]);

  await parentLogin(page, f);
  for (const t of ['Quêtes', 'Notes', 'Boutique', 'Statistiques', 'Enfants', 'Famille']) {
    await tab(page, t);
    expect(await small(page), t).toEqual([]);
  }
  await page.reload();
  await expect(page.locator('#pu-pass')).toBeVisible();
  expect(await small(page), 'déverrouillage').toEqual([]);

  const ctx = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 375, height: 812 } });
  const kid = await ctx.newPage();
  await childLogin(kid, f);
  expect(await small(kid), 'écran enfant').toEqual([]);
  await ctx.close();
});

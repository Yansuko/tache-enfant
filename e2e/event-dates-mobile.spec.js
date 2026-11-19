import { test, expect, newFamily, parentLogin, tab } from './helpers.js';

// Safari iOS impose une largeur intrinsèque aux input[type=date]: on la simule par une feuille injectée (Chromium ne le fait pas).
// 140 px: valeur typique; 360 px: largeur intrinsèque plus grande que l'écran (pire cas, rend le débordement mesurable).
const iosDate = (px) => `input[type=date]{min-width:${px}px}`;

// Chaque champ de date visible et son conteneur tiennent dans la fenêtre, police ≥ 16 px, pas de scroll horizontal.
const overflow = (page) => page.evaluate(() => {
  const W = window.innerWidth, bad = [];
  for (const el of document.querySelectorAll('input[type=date]')) {
    if (!el.getClientRects().length) continue;
    const box = el.parentElement, r = el.getBoundingClientRect(), p = box.getBoundingClientRect();
    if (r.right > W + 0.5) bad.push(`${el.id} dépasse la fenêtre (${r.right} > ${W})`);
    if (r.right > p.right + 0.5 || r.left < p.left - 0.5) bad.push(`${el.id} dépasse son conteneur (${r.left}-${r.right} / ${p.left}-${p.right})`);
    if (p.right > W + 0.5) bad.push(`conteneur de ${el.id} dépasse la fenêtre (${p.right})`);
    if (parseFloat(getComputedStyle(el).fontSize) < 16) bad.push(`${el.id} police < 16 px`);
  }
  if (document.querySelector('#main').scrollWidth > W) bad.push(`scroll horizontal #main (${document.querySelector('#main').scrollWidth})`);
  return bad;
});

for (const [width, height] of [[375, 812], [320, 568]]) for (const sim of [140, 360]) {
  test(`champs de date contenus à ${width} px, largeur native ${sim} px (formulaire d'événement et filtres des statistiques)`, async ({ page, request }) => {
    await page.setViewportSize({ width, height });
    const f = await newFamily(request);
    await parentLogin(page, f);
    await page.addStyleTag({ content: iosDate(sim) });
    await tab(page, 'Quêtes');
    await expect(page.locator('#ev-start')).toBeVisible();
    expect(await page.locator('#ev-start').evaluate(el => getComputedStyle(el).minWidth), 'le CSS de l\'app l\'emporte sur la largeur native').toBe('0px');
    expect(await overflow(page), 'événement').toEqual([]);
    await page.locator('.card', { has: page.locator('#ev-name') }).screenshot({ path: `test-results/event-dates-${width}-${sim}.png` });
    await tab(page, 'Statistiques');
    await expect(page.locator('#xs-start')).toBeVisible();
    expect(await overflow(page), 'statistiques').toEqual([]);
    await page.locator('.xs-filters').screenshot({ path: `test-results/stats-dates-${width}-${sim}.png` });
  });
}

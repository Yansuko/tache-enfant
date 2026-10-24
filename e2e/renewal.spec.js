import { test, expect, newFamily, me, emma, parentLogin, childLogin, tab, task, taskCard, settle, instrument } from './helpers.js';

// Date fixe pour que "même semaine / même mois" soit déterministe: mercredi 11 mars 2026, 10 h (heure locale du navigateur).
const NOW = new Date(2026, 2, 11, 10, 0, 0);
const at = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0).getTime();
const dayStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const seed = (fam) => {
  fam.day = dayStr(new Date(2026, 2, 10));                         // la veille: le changement de jour va se produire
  fam.children[0].tasks = [
    task('Quotidienne faite hier', 10, 1, { frequency: 'daily', done: true, completedAt: at(2026, 3, 10) }),
    task('Hebdo faite cette semaine', 10, 1, { frequency: 'weekly', done: true, completedAt: at(2026, 3, 9) }),     // lundi
    task('Hebdo faite semaine passée', 10, 1, { frequency: 'weekly', done: true, completedAt: at(2026, 3, 8) }),    // dimanche
    task('Mensuelle faite ce mois-ci', 10, 1, { frequency: 'monthly', done: true, completedAt: at(2026, 3, 1) }),
    task('Mensuelle faite le mois dernier', 10, 1, { frequency: 'monthly', done: true, completedAt: at(2026, 2, 28) }),
    task('Unique faite', 10, 1, { frequency: 'unique', done: true, completedAt: at(2026, 3, 10) }),
    task('Unique à faire', 10, 1, { frequency: 'unique', done: false }),
  ];
};
const state = async (page, name) => {
  const card = taskCard(page, name);
  if (!(await card.count())) return 'absente';
  return (await card.locator('[data-action="toggle-task"]').getAttribute('class')).includes('done') ? 'faite' : 'à faire';
};
const EXPECTED = {
  'Quotidienne faite hier': 'à faire',
  'Hebdo faite cette semaine': 'faite',
  'Hebdo faite semaine passée': 'à faire',
  'Mensuelle faite ce mois-ci': 'faite',
  'Mensuelle faite le mois dernier': 'à faire',
  'Unique faite': 'absente',
  'Unique à faire': 'à faire',
};

for (const role of ['parent', 'enfant']) {
  test(`renouvellement des quêtes au changement de jour, vu par ${role === 'parent' ? 'le parent' : "l'enfant"}`, async ({ page, request }) => {
    const f = await newFamily(request, seed);
    await page.clock.install({ time: NOW });
    if (role === 'parent') { await parentLogin(page, f); await tab(page, 'Quêtes'); } else await childLogin(page, f);

    const seen = {};
    for (const name of Object.keys(EXPECTED)) seen[name] = await state(page, name);
    expect(seen).toEqual(EXPECTED);

    await settle(page);                                              // le renouvellement est aussi enregistré côté serveur
    const server = Object.fromEntries(emma(await me(request, f)).tasks.map(t => [t.name, t.done ? 'faite' : 'à faire']));
    expect(server['Quotidienne faite hier']).toBe('à faire');
    expect(server['Hebdo faite semaine passée']).toBe('à faire');
    expect(server['Hebdo faite cette semaine']).toBe('faite');
    expect(server['Unique faite']).toBeUndefined();
  });
}

test('un appareil resté sur l\'ancien jour ne ressuscite pas les quêtes remises à faire', async ({ browser, request }) => {
  const f = await newFamily(request, seed);
  const mk = async (time) => { const ctx = await browser.newContext({ baseURL: 'http://localhost:3100' }); const p = await ctx.newPage(); await p.clock.install({ time }); await instrument(p); return { ctx, p }; };
  const today = await mk(NOW);
  const stale = await mk(new Date(2026, 2, 10, 20, 0, 0));          // autre appareil dont l'horloge est encore sur la veille
  await parentLogin(today.p, f);                                      // renouvelle et enregistre
  await parentLogin(stale.p, f);                                      // arrive ensuite, jour = hier d'après son horloge
  await tab(stale.p, 'Quêtes'); await settle(stale.p);
  const server = Object.fromEntries(emma(await me(request, f)).tasks.map(t => [t.name, t.done]));
  expect(server['Quotidienne faite hier']).toBe(false);
  await today.ctx.close(); await stale.ctx.close();
});

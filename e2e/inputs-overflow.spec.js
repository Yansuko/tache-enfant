import { test, expect, newFamily, parentLogin, childLogin, tab, settle, instrument, task } from './helpers.js';

// Safari iOS donne aux champs natifs (heure, date, nombre, liste…) une largeur intrinsèque qui ignore width:100%.
// Chromium ne le fait pas: on la simule par une feuille injectée avant chaque mesure.
// « typique »: largeurs natives courantes; « pire cas »: plus large que l'écran, rend tout débordement mesurable.
const PICKERS = 'input[type=time],input[type=date],input[type=datetime-local],input[type=month],input[type=week]';
const SIMS = {
  typique: `${PICKERS}{min-width:160px;-webkit-appearance:auto} input[type=number]{min-width:120px} select{min-width:140px}`,
  'pire cas': `${PICKERS},input[type=number],select{min-width:400px;-webkit-appearance:auto}`,
};

// Chaque champ visible (hors case/radio/caché) tient dans la fenêtre et dans sa carte (ou son conteneur), police ≥ 16 px, pas de scroll horizontal.
const audit = (page, screen, sim) => page.evaluate(([screen, css]) => {
  let st = document.getElementById('ios-sim');
  if (!st) { st = document.createElement('style'); st.id = 'ios-sim'; document.head.append(st); }
  st.textContent = css;
  document.querySelectorAll('details').forEach(d => { d.open = true; });
  const W = window.innerWidth, bad = [];
  const name = el => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.type && el.tagName === 'INPUT' ? `[type=${el.type}]` : '')
    + (el.className && !el.id ? `.${String(el.className).trim().split(/\s+/).join('.')}` : '') + (el.getAttribute('aria-label') ? `[aria-label="${el.getAttribute('aria-label')}"]` : '');
  for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea')) {
    if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(), n = `${screen}: ${name(el)}`;
    const box = el.closest('.card, .topbar, .xs-filters') || el.parentElement, p = box.getBoundingClientRect();
    if (r.left < -1 || r.right > W + 1) bad.push(`${n} dépasse la fenêtre (${Math.round(r.left)}→${Math.round(r.right)} / ${W})`);
    if (r.left < p.left - 1 || r.right > p.right + 1) bad.push(`${n} dépasse son cadre ${box.className || box.tagName} (${Math.round(r.left)}→${Math.round(r.right)} / ${Math.round(p.left)}→${Math.round(p.right)})`);
    if (parseFloat(getComputedStyle(el).fontSize) < 16) bad.push(`${n} police < 16 px`);
  }
  if (document.documentElement.scrollWidth > W) bad.push(`${screen}: scroll horizontal (${document.documentElement.scrollWidth} > ${W})`);
  return bad;
}, [screen, SIMS[sim]]);

const T0 = Date.now();
const fixture = fam => {
  fam.children[0].tasks = [task('Ranger sa chambre', 10, 5)];
  fam.questList = [{ id: 'q1', icon: '⭐', name: 'Sortir la poubelle', xp: 5, gold: 1, frequency: 'daily' }];
  fam.rewards = [{ id: 'r1', icon: '🍕', name: 'Pizza', cost: 10, lvl: 1 }];
  fam.proposals = [
    { id: 'pq', child: 'Emma', name: 'Laver la voiture', type: 'quest', status: 'pending' },
    { id: 'pr', child: 'Emma', name: 'Piscine', cost: 60, type: 'reward', status: 'pending' },
  ];
  fam.gradeRequests = [
    { id: 'e1', child: 'Emma', subject: 'Mathématiques', grade: '15,5', gold: 10, status: 'approved', submittedAt: T0, approvedAt: T0 },
    { id: 'p1', child: 'Emma', subject: 'Français', grade: '12', gold: 120, status: 'pending', submittedAt: T0 },
  ];
};

test.use({ hasTouch: true });

for (const [width, height] of [[375, 812], [320, 568]]) for (const sim of Object.keys(SIMS)) {
  test(`champs de saisie contenus à ${width} px (${sim}): parent, enfant, connexion`, async ({ page, browser, request }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height });
    const f = await newFamily(request, fixture);
    const bad = [];
    const check = async (p, screen) => { await settle(p); bad.push(...await audit(p, screen, sim)); };

    // connexion / inscription / réinitialisation / connexion enfant
    await instrument(page);
    await page.goto('/');
    await check(page, 'connexion parent');
    await page.locator('[data-action="auth-toggle"]').click();
    await check(page, 'inscription');
    await page.locator('[data-action="auth-toggle"]').click();
    await page.locator('[data-action="show-reset-password"]').click();
    await check(page, 'réinitialisation (email)');
    await page.locator('#reset-email').fill(f.email);
    await page.locator('[data-action="reset-password-step1"]').click();
    await expect(page.locator('#reset-code')).toBeVisible();
    await check(page, 'réinitialisation (code)');
    await page.goto('/');
    await page.getByRole('button', { name: /Enfant/ }).first().click();
    await check(page, 'connexion enfant');

    // parent: tous les onglets, formulaires ouverts
    await parentLogin(page, f);
    await tab(page, 'Quêtes');
    await expect(page.locator('#rem-time')).toBeVisible();
    await check(page, 'parent Quêtes');
    await tab(page, 'Notes');
    await page.locator('.grade-approved [data-action="edit-grade"]').click();
    await expect(page.locator('#grade-edit-e1')).toBeVisible();
    await check(page, 'parent Notes');
    await tab(page, 'Boutique');
    await check(page, 'parent Boutique');
    await tab(page, 'Statistiques');
    await check(page, 'parent Statistiques');
    await tab(page, 'Enfants');
    await check(page, 'parent Enfants');
    await tab(page, 'Famille');
    await check(page, 'parent Famille');
    await page.screenshot({ path: `test-results/inputs-famille-${width}-${sim.replace(' ', '-')}.png`, fullPage: true });
    await tab(page, 'Quêtes');
    await page.locator('.card', { has: page.locator('#rem-time') }).screenshot({ path: `test-results/inputs-rappel-${width}-${sim.replace(' ', '-')}.png` });

    // saisie du PIN (enfant sur l'appareil parent), puis déverrouillage parent
    await page.locator('#role-seg label', { hasText: 'Enfant' }).click();
    await page.getByRole('button', { name: /mon code/ }).click();
    await expect(page.locator('#pin-input-1')).toBeVisible();
    await check(page, 'saisie du PIN');
    await page.reload();
    await expect(page.locator('#pu-pass')).toBeVisible();
    await check(page, 'déverrouillage parent');

    // création du PIN (enfant sans code)
    const opts = { baseURL: 'http://localhost:3100', viewport: { width, height }, hasTouch: true };
    const g = await newFamily(request, fam => { fam.children[0].pin = null; });
    const pctx = await browser.newContext(opts);
    const p2 = await pctx.newPage();
    await parentLogin(p2, g);
    await p2.locator('#role-seg label', { hasText: 'Enfant' }).click();
    await p2.getByRole('button', { name: /Créer mon code/ }).click();
    await expect(p2.locator('#pin-input-2')).toBeVisible();
    await check(p2, 'création du PIN');
    await pctx.close();

    // enfant
    const ctx = await browser.newContext(opts);
    const kid = await ctx.newPage();
    await childLogin(kid, f);
    await check(kid, 'enfant Quêtes');
    await tab(kid, 'Notes');
    await check(kid, 'enfant Notes');
    await tab(kid, 'Boutique');
    await check(kid, 'enfant Boutique');
    await ctx.close();

    expect(bad, `champs qui débordent à ${width} px (${sim})`).toEqual([]);
  });
}

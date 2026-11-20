import fs from 'node:fs';
import { test, expect, newFamily, parentLogin, childLogin, tab, settle, instrument, task, api, DAY } from './helpers.js';

// Tâche 4 V2: tous les écrans, en clair et en sombre à 375 px. Pour chaque texte visible: contraste WCAG ≥ 4,5:1
// (3:1 si ≥ 24 px, ou ≥ 18,66 px en gras; 3:1 aussi pour un symbole sans lettre ni chiffre: ✕ ✎ ✓ ←)
// contre son fond effectif. Une capture par écran et thème dans docs/v2-screenshots/<ecran>-<clair|sombre>.png.
//
// Fond effectif (calcul prudent = pire cas):
// - fond de page: chaque arrêt opaque du dégradé de body::before, seul et sous chaque tache translucide;
// - puis, de la racine vers l'élément, chaque fond d'ancêtre (couleur de fond, et chaque couleur d'un dégradé
//   d'arrière-plan) composé par-dessus, alpha multiplié par l'opacité cumulée de l'ancêtre;
// - la couleur du texte (fill pour le SVG) est composée sur chaque fond candidat avec l'opacité cumulée de l'élément;
// - on garde le plus faible des contrastes.
// Approximations (documentées dans le rapport de la tâche 4): le flou/saturation du verre et un élément positionné
// au-dessus d'un contenu qui n'est pas son ancêtre (barre haute collante, bulle fixe) ne sont pas modélisés.
// Exclusions: emoji en couleur (leur `color` ne change rien au rendu), info-bulles SVG <title>, <option> d'une liste
// fermée (le texte affiché est celui de la <select>, vérifié comme champ), fenêtres natives confirm()/prompt() (non stylables).
const OUT = 'docs/v2-screenshots';
const MODES = { clair: 'light', sombre: 'dark' };

const audit = (page, screen, only) => page.evaluate(([screen, only]) => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  // toute couleur CSS calculée (rgb, color(srgb …), color-mix résolu…) → [r, g, b, a] via le canevas
  const rgba = s => {
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#010203'; cx.fillStyle = s;
    if (cx.fillStyle === '#010203' && !/^#010203$/i.test(s)) throw new Error(`couleur illisible: ${s}`);
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, bot) => [0, 1, 2].map(i => top[i] * top[3] + bot[i] * (1 - top[3]));
  const lum = c => { const [r, g, b] = c.map(v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const colorsIn = img => (img.match(/rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8}\b|\btransparent\b/gi) || []).map(rgba);
  const uniq = list => [...new Map(list.map(c => [c.map(Math.round).join(','), c])).values()];

  const pageCols = colorsIn(getComputedStyle(document.body, '::before').backgroundImage);
  const stops = pageCols.filter(c => c[3] === 1), blobs = pageCols.filter(c => c[3] > 0 && c[3] < 1);
  const pageBgs = stops.length ? uniq(stops.flatMap(s => [s.slice(0, 3), ...blobs.map(b => over(b, s))]))
    : [rgba(getComputedStyle(document.documentElement).backgroundColor).slice(0, 3)];
  const opacity = el => { let o = 1; for (let n = el; n; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; };
  const backgrounds = el => {
    const chain = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) chain.unshift(n);
    let bgs = pageBgs;
    for (const n of chain) {
      const cs = getComputedStyle(n), op = opacity(n);
      const img = cs.backgroundImage === 'none' ? [] : colorsIn(cs.backgroundImage);
      if (img.length) bgs = uniq(bgs.flatMap(b => img.map(c => over([c[0], c[1], c[2], c[3] * op], b))));
      const c = rgba(cs.backgroundColor);
      if (c[3]) bgs = bgs.map(b => over([c[0], c[1], c[2], c[3] * op], b));
    }
    return bgs;
  };
  const path = el => {
    const parts = [];
    for (let n = el; n && n !== document.body && parts.length < 3; n = n.parentElement) {
      const cls = typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).join('.') : '';
      const act = n.dataset?.action ? `[data-action=${n.dataset.action}]` : '';
      parts.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + cls + act);
      if (n.id) break;
    }
    return parts.join(' > ');
  };
  const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️|[️‍⃣]|\p{Emoji_Modifier}/gu;
  const bad = [];
  let checked = 0;
  const check = (el, text, color) => {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const rest = text.replace(EMOJI, '').replace(/[\s.,;:!?·()'"«»\-–—+/|]/g, '');
    if (!rest) return;                                   // emoji seul: rendu en couleur, `color` sans effet
    const cs = getComputedStyle(el), size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const min = large || !/[\p{L}\p{N}]/u.test(rest) ? 3 : 4.5;
    const fg = rgba(color), op = opacity(el);
    const worst = Math.min(...backgrounds(el).map(b => ratio(over([fg[0], fg[1], fg[2], fg[3] * op], b), b)));
    checked++;
    if (worst < min) bad.push(`${screen}: ${path(el)} « ${text.slice(0, 40)} » ${worst.toFixed(2)} < ${min}`);
  };

  const scope = only ? [...document.querySelectorAll(only)] : [document.body];
  const seen = new Set();
  for (const root of scope) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const el = t.parentElement;
      if (!t.data.trim() || seen.has(el) || el.closest('script, style, option, title, select, textarea')) continue;
      seen.add(el);
      const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.data).join(' ').trim();
      check(el, text, el instanceof SVGElement ? getComputedStyle(el).fill : getComputedStyle(el).color);
    }
    const fields = root.matches?.('input, select, textarea') ? [root] : root.querySelectorAll('input, select, textarea');
    for (const el of fields) {
      if (['checkbox', 'radio', 'hidden'].includes(el.type)) continue;
      if (el.value) check(el, el.tagName === 'SELECT' ? el.selectedOptions[0]?.text || '' : el.type === 'password' ? '•' : el.value, getComputedStyle(el).color);
      else if (el.placeholder) check(el, el.placeholder, getComputedStyle(el, '::placeholder').color);
    }
  }
  if (!only && checked < 5) bad.push(`${screen}: seulement ${checked} textes vérifiés (écran vide ?)`);
  return bad;
}, [screen, only || null]);

const T0 = Date.now();
const fixture = fam => {
  const [emma, lucas] = fam.children;
  emma.xp = 130; emma.gold = 100;
  emma.tasks = [
    task('Ranger sa chambre', 10, 5),
    task('Lire 20 minutes', 15, 5, { done: true }),
    task('Mettre la table', 5, 2, { done: true, completedAt: T0 - DAY }),
    task('Piscine', 20, 10, { frequency: 'weekly' }),
  ];
  emma.sanctions = [{ motif: 'Gros mot', gold: 5, date: T0 - DAY }];
  lucas.tasks = [task('Brosser les dents', 5, 1, { done: true, completedAt: T0 - 2 * DAY })];
  fam.taskRequests = [{ child: 'Emma', taskIndex: 1, taskName: 'Lire 20 minutes', xp: 15, gold: 5, status: 'pending', submittedAt: T0 }];
  fam.questList = [{ id: 'q1', icon: '⭐', name: 'Sortir la poubelle', xp: 5, gold: 1, frequency: 'daily' }];
  fam.reminders = [{ id: 'rem1', childId: emma.id, questName: 'Ranger sa chambre', days: [0, 2, 4], time: '17:30', enabled: true }];
  const day = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  fam.events = [{ id: 'ev1', name: 'Vacances', start: day, end: day, xpMult: 2, goldMult: 1.5, childIds: [] }];
  fam.rewards = [
    { id: 'r1', icon: '🍕', name: 'Pizza', cost: 10, lvl: 1 },
    { id: 'r2', icon: '🚲', name: 'Vélo', cost: 500, lvl: 1 },
    { id: 'r3', icon: '🎮', name: 'Console', cost: 50, lvl: 9 },
    { id: 'r4', icon: '🎬', name: 'Cinéma', cost: 30, lvl: 1, childIds: [emma.id], prices: { [emma.id]: 25 } },
  ];
  fam.requests = [
    { child: 'Emma', name: 'Cinéma', cost: 25, icon: '🎬', status: 'pending', submittedAt: T0 },
    { child: 'Emma', name: 'Pizza', cost: 10, icon: '🍕', status: 'approved', purchaseDate: T0 - DAY },
    { child: 'Emma', name: 'Vélo', cost: 500, icon: '🚲', status: 'refused', submittedAt: T0 - 2 * DAY },
  ];
  fam.sanctionsList = [{ name: 'Gros mot', gold: 5 }];
  fam.proposals = [
    { id: 'pq', child: 'Emma', name: 'Laver la voiture', type: 'quest', status: 'pending' },
    { id: 'pr', child: 'Emma', name: 'Piscine', cost: 60, type: 'reward', status: 'pending' },
    { id: 'px', child: 'Emma', name: 'Trampoline', cost: 900, type: 'reward', status: 'refused' },
  ];
  fam.gradeRequests = [
    { id: 'e1', child: 'Emma', subject: 'Mathématiques', grade: '15,5', gold: 10, status: 'approved', submittedAt: T0 - 3 * DAY, approvedAt: T0 - 3 * DAY },
    { id: 'e2', child: 'Emma', subject: 'Mathématiques', grade: '17', gold: 10, status: 'approved', submittedAt: T0 - DAY, approvedAt: T0 - DAY },
    { id: 'e3', child: 'Emma', subject: 'Français', grade: 'TB', gold: 5, status: 'approved', submittedAt: T0 - 2 * DAY, approvedAt: T0 - 2 * DAY },
    { id: 'p1', child: 'Emma', subject: 'Histoire', grade: '12', gold: 20, status: 'pending', submittedAt: T0 },
    { id: 'x1', child: 'Emma', subject: 'Anglais', grade: '8', gold: 50, status: 'refused', submittedAt: T0 - DAY },
  ];
};

for (const [label, scheme] of Object.entries(MODES)) {
  test(`tous les écrans lisibles en ${label} (375 px)`, async ({ page, browser, request }) => {
    test.setTimeout(240000);
    fs.mkdirSync(OUT, { recursive: true });
    const opts = { baseURL: 'http://localhost:3100', viewport: { width: 375, height: 812 }, colorScheme: scheme };
    await page.setViewportSize(opts.viewport);
    await page.emulateMedia({ colorScheme: scheme });
    // pas de transition ni d'animation: couleurs finales, captures stables
    const still = p => p.addInitScript(() => addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}';
      document.head.append(s);
    }));
    await still(page);
    const f = await newFamily(request, fixture);
    const bad = [];
    const check = async (p, screen, { at, only } = {}) => {
      await settle(p);
      expect(await p.evaluate(() => document.documentElement.dataset.mode)).toBe(scheme);
      bad.push(...await audit(p, screen, only));
      if (at) await p.locator(at).first().evaluate(el => { el.scrollIntoView({ block: 'start' }); scrollBy(0, -90); });
      else await p.evaluate(() => scrollTo(0, 0));
      await p.screenshot({ path: `${OUT}/${screen}-${label}.png` });
    };

    // connexion / inscription / mot de passe oublié / connexion enfant
    await instrument(page);
    await page.goto('/');
    await check(page, 'connexion');
    await page.locator('#au-email').fill(f.email);
    await page.locator('#au-pass').fill('mauvais');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await settle(page);
    await check(page, 'connexion-erreur');
    await page.locator('[data-action="auth-toggle"]').click();
    await check(page, 'inscription');
    await page.locator('[data-action="auth-toggle"]').click();
    await page.locator('[data-action="show-reset-password"]').click();
    await check(page, 'mot-de-passe-oublie');
    await page.goto('/');
    await page.getByRole('button', { name: /Enfant/ }).first().click();
    await check(page, 'connexion-enfant');

    // parent: tous les onglets, formulaires et éditeurs ouverts
    await parentLogin(page, f);
    await tab(page, 'Quêtes');
    await check(page, 'parent-quetes');
    await check(page, 'parent-quetes-rappel', { at: '#rem-time' });
    await page.locator('[data-action="edit-event"]').first().click();
    await check(page, 'parent-quetes-evenement', { at: '#ev-name' });
    await check(page, 'parent-quetes-modeles', { at: '#qd-name' });
    await tab(page, 'Notes');
    await page.locator('#grade-note-p1').fill('abc');
    await page.locator('[data-action="approve-grade"]').click();
    await settle(page);
    await page.locator('.grade-approved [data-action="edit-grade"]').first().click();
    await page.locator('details.grade-refused').evaluate(d => { d.open = true; });
    await check(page, 'parent-notes');
    await check(page, 'parent-notes-editeur', { at: '.grade-approved .input' });
    await tab(page, 'Boutique');
    await check(page, 'parent-boutique');
    await page.locator('.reward-row details').evaluateAll(ds => ds.forEach(d => { d.open = true; }));
    await check(page, 'parent-boutique-propositions', { at: '.quest-xp-0' });
    await check(page, 'parent-boutique-articles', { at: '#new-reward-name' });
    await tab(page, 'Statistiques');
    await expect(page.locator('#chart-tasks-per-day svg')).toBeVisible();
    await check(page, 'parent-statistiques');
    await check(page, 'parent-statistiques-graphiques', { at: '#chart-top-tasks' });
    for (const [id, name] of [['grades', 'notes'], ['rewards', 'recompenses'], ['sanctions', 'sanctions']]) {
      await page.locator(`[data-xs-tab="${id}"]`).click();
      await settle(page);
      await expect(page.locator('#xs-stats .xs-boxes')).toBeVisible();
      await check(page, `parent-statistiques-${name}`, { at: '#xs-stats' });
    }
    await tab(page, 'Enfants');
    await page.locator('[data-action="ap-child"]').first().click();
    await check(page, 'parent-enfants');
    await tab(page, 'Famille');
    await check(page, 'parent-famille');
    await check(page, 'parent-famille-apparence', { at: '#ap-self' });
    await check(page, 'parent-famille-securite', { at: '#change-password-new' });

    // états survolés (boutons, pastilles, onglets) et fenêtres (message bref, échec de synchro, montée de niveau)
    for (const sel of ['.btn-primary', '.btn-secondary', '.btn-ghost', '.ap-swatch', '.ap-seg .seg-opt', '#role-seg .seg-opt', 'nav button']) {
      await settle(page);
      await page.locator(`${sel}:visible`).first().hover();   // défile jusqu'à l'élément; relocalisé si un rendu le remplace
      bad.push(...(await audit(page, `survol ${sel}`, `${sel}:hover`)));
    }
    await page.mouse.move(0, 0);

    // vue enfant sur l'appareil du parent: verrou, saisie du PIN, puis déverrouillage parent
    await page.locator('#role-seg label', { hasText: 'Enfant' }).click();
    await check(page, 'verrou-enfant');
    await page.getByRole('button', { name: /mon code/ }).click();
    await expect(page.locator('#pin-input-1')).toBeVisible();
    await check(page, 'pin');
    await page.reload();
    await expect(page.locator('#pu-pass')).toBeVisible();
    await check(page, 'deverrouillage');

    // création du PIN (enfant sans code)
    const g = await newFamily(request, fam => { fam.children[0].pin = null; });
    const pctx = await browser.newContext(opts);
    const p2 = await pctx.newPage();
    await still(p2);
    await parentLogin(p2, g);
    await p2.locator('#role-seg label', { hasText: 'Enfant' }).click();
    await p2.getByRole('button', { name: /Créer mon code/ }).click();
    await expect(p2.locator('#pin-input-2')).toBeVisible();
    await check(p2, 'creation-pin');
    await pctx.close();

    // enfant
    const ctx = await browser.newContext(opts);
    const kid = await ctx.newPage();
    await still(kid);
    await childLogin(kid, f);
    await kid.locator('[data-action="ap-toggle"]').click();
    await check(kid, 'enfant-quetes');
    await check(kid, 'enfant-apparence', { at: '#ap-self' });
    await tab(kid, 'Notes');
    await kid.locator('#grade-subject').fill('Sciences');
    await kid.locator('#grade-value').fill('abc');
    await kid.locator('[data-action="submit-grade"]').click();
    await expect(kid.locator('#grade-error')).toBeVisible();
    await check(kid, 'enfant-notes');
    await check(kid, 'enfant-notes-formulaire', { at: '#grade-error' });
    await tab(kid, 'Boutique');
    await check(kid, 'enfant-boutique');
    await check(kid, 'enfant-boutique-achats', { at: '#proposal-name' });
    await tab(kid, 'Quêtes');
    await kid.evaluate(() => { flash('✅ Quête envoyée aux parents'); toast(true, 'réseau'); celebrate('⚔️ Niveau 3 !'); });
    await check(kid, 'fenetres', { only: '#flash, #toast, .lvlup-badge' });
    await ctx.close();

    expect(bad, `textes illisibles en ${label}`).toEqual([]);
    for (const file of fs.readdirSync(OUT).filter(n => n.endsWith(`-${label}.png`)))
      expect(fs.statSync(`${OUT}/${file}`).size, `${file} ≤ 200 Ko`).toBeLessThanOrEqual(200 * 1024);
  });
}

// Appareil partagé: l'apparence du profil ACTIF s'applique; un profil sans apparence reprend celle de l'appareil
// (dk-appearance d'avant la connexion), jamais celle du profil affiché juste avant.
test('appareil partagé: apparence du profil actif, sinon celle de l\'appareil', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'light' });
  const f = await newFamily(request);
  const [emma] = f.family.children;
  expect((await api(request, 'setAppearance', { appearance: { mode: 'dark', accent: 'rose' } }, f.token)).status).toBe(200);
  expect((await api(request, 'setAppearance', { appearance: { mode: 'light', accent: 'ocean' }, childId: emma.id }, f.token)).status).toBe(200);
  const g = await newFamily(request);
  expect((await api(request, 'setAppearance', { appearance: { mode: 'dark', accent: 'violet' }, childId: g.family.children[0].id }, g.token)).status).toBe(200);

  const look = () => page.evaluate(() => [document.documentElement.dataset.theme, document.documentElement.style.getPropertyValue('--color-accent')]);
  const DEVICE = ['clair', '#12844d'];         // Forêt, palier 600 en clair
  await instrument(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('dk-appearance', JSON.stringify({ mode: 'light', accent: 'foret' })));
  await page.reload();
  expect(await look()).toEqual(DEVICE);

  const toChild = async (i) => {
    await page.locator('#role-seg label', { hasText: 'Enfant' }).click();
    await page.locator('#child-select').selectOption(String(i));
    await settle(page);
  };
  const toParent = async (fam) => {
    await page.locator('#role-seg label', { hasText: 'Parent' }).click();
    await page.locator('#pu-pass').fill(fam.password);
    await page.getByRole('button', { name: 'Déverrouiller' }).click();
    await settle(page);
  };

  await parentLogin(page, f);
  expect(await look()).toEqual(['bleu-nuit', '#d07399']);   // compte: sombre, Rose (palier 500 en sombre)
  await toChild(0);
  expect(await look()).toEqual(['clair', '#236dca']);       // Emma: clair, Océan
  await toChild(1);
  expect(await look()).toEqual(DEVICE);                     // Lucas: rien → appareil, pas Emma
  await toParent(f);
  expect(await look()).toEqual(['bleu-nuit', '#d07399']);
  await toChild(1);
  expect(await look()).toEqual(DEVICE);                     // parent → Lucas: appareil, pas le parent

  // compte sans apparence: retour de l'enfant (sombre) au parent → appareil
  await page.locator('#role-seg label', { hasText: 'Parent' }).click();
  await page.locator('#pu-pass').fill(f.password);
  await page.getByRole('button', { name: 'Déverrouiller' }).click();
  await settle(page);
  await page.locator('[data-action="logout"]').first().click();
  await settle(page);
  await parentLogin(page, g);
  expect(await look()).toEqual(DEVICE);
  await toChild(0);
  expect(await look()).toEqual(['bleu-nuit', '#a27de6']);   // Emma de g: sombre, Violet
  await toParent(g);
  expect(await look()).toEqual(DEVICE);
});

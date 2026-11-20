import { test, expect, newFamily, childLogin, settle, task } from './helpers.js';

// Moteur d'apparence (tâche 2 V2): variables de thème sur :root, data-theme/data-mode sur <html>, theme-color,
// réévaluation (lancement, retour de visibilité, prefers-color-scheme, minuteur 60 s) sans toucher au DOM si rien ne change.
// Coucher du soleil à Paris le 21/06/2026 ≈ 19:57 UTC.
const BEFORE = new Date('2026-06-21T19:00:00Z');
const AFTER = new Date('2026-06-21T20:30:00Z');

const setAppearance = (page, a) => page.addInitScript(v => localStorage.setItem('dk-appearance', JSON.stringify(v)), a);
const state = page => page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  mode: document.documentElement.dataset.mode,
  bg: document.documentElement.style.getPropertyValue('--color-bg'),
  text: getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim(),
  meta: document.querySelector('meta[name="theme-color"]').content,
  body: getComputedStyle(document.body).color,
}));
// Opacité d'une couleur calculée: rgb()/rgba() ou color(srgb r g b / a) (issue de color-mix).
const ALPHA = `c => { const m = c.match(/rgba\\([^)]*,\\s*([\\d.]+)\\)/) || c.match(/\\/\\s*([\\d.]+)\\)$/); return m ? Number(m[1]) : 1; }`;
const expectTheme = async (page, theme) =>
  expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);

test('mode clair forcé: thème Clair, variables sur :root, theme-color', async ({ page }) => {
  await setAppearance(page, { mode: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });          // le choix de l'appareil l'emporte sur le système
  await page.goto('/');
  expect(await state(page)).toMatchObject({ theme: 'clair', mode: 'light', bg: '#f3d6c6', text: '#2b2320', meta: '#f3d6c6', body: 'rgb(43, 35, 32)' });
});

test('mode sombre forcé: thème Bleu nuit, accent choisi appliqué', async ({ page }) => {
  await setAppearance(page, { mode: 'dark', accent: 'ocean' });
  await page.goto('/');
  expect(await state(page)).toMatchObject({ theme: 'bleu-nuit', mode: 'dark', bg: '#1a1f45', text: '#eef1fb', meta: '#1a1f45', body: 'rgb(238, 241, 251)' });
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--color-accent'))).toBe('#5599e2');
});

test('sans choix enregistré: suit prefers-color-scheme, y compris en cours de session', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expectTheme(page, 'bleu-nuit');
  await page.emulateMedia({ colorScheme: 'light' });
  await expectTheme(page, 'clair');
  expect((await state(page)).meta).toBe('#f3d6c6');
});

test('Auto: clair avant le coucher, sombre après', async ({ page }) => {
  await setAppearance(page, { mode: 'auto' });
  await page.clock.install({ time: AFTER });
  await page.goto('/');
  expect(await state(page)).toMatchObject({ theme: 'bleu-nuit', mode: 'dark' });
});

test('Auto: passe au sombre au coucher du soleil sans rechargement (minuteur)', async ({ page }) => {
  await setAppearance(page, { mode: 'auto' });
  await page.clock.install({ time: BEFORE });
  await page.goto('/');
  expect(await state(page)).toMatchObject({ theme: 'clair', mode: 'light', meta: '#f3d6c6' });
  await page.clock.runFor('01:01:00');                      // 20:01 UTC
  await expectTheme(page, 'bleu-nuit');
  expect((await state(page)).meta).toBe('#1a1f45');
});

test('Auto: réévalué au retour de visibilité', async ({ page }) => {
  await setAppearance(page, { mode: 'auto' });
  await page.clock.install({ time: new Date('2026-06-21T19:56:30Z') });
  await page.goto('/');
  await expectTheme(page, 'clair');
  await page.clock.setSystemTime(new Date('2026-06-21T19:58:00Z')); // l'heure avance sans déclencher le minuteur
  expect((await state(page)).theme).toBe('clair');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expectTheme(page, 'bleu-nuit');
});

test('aucun clignotement: rien n\'est réécrit quand le résultat est identique', async ({ page }) => {
  await setAppearance(page, { mode: 'auto' });
  await page.clock.install({ time: BEFORE });
  await page.goto('/');
  await page.evaluate(() => {
    window.__mut = 0;
    const o = new MutationObserver(m => { window.__mut += m.length; });
    o.observe(document.documentElement, { attributes: true });
    o.observe(document.querySelector('meta[name="theme-color"]'), { attributes: true });
  });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.clock.runFor('02:00');                          // deux passages du minuteur
  await page.emulateMedia({ colorScheme: 'dark' });          // ignoré: le mode Auto est enregistré
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__mut)).toBe(0);
});

test('fond d\'écran: dégradé + taches, barres en verre flou ≤ 18 px', async ({ page }) => {
  await setAppearance(page, { mode: 'light' });
  await page.goto('/');
  const s = await page.evaluate(() => {
    const before = getComputedStyle(document.body, '::before');
    return { img: before.backgroundImage, pos: before.position, top: getComputedStyle(document.querySelector('.topbar')).backdropFilter };
  });
  expect(s.img).toContain('linear-gradient');
  expect(s.img).toContain('radial-gradient');
  expect(s.pos).toBe('fixed');
  expect(s.top).toMatch(/blur\((\d+)px\)/);
  expect(Number(s.top.match(/blur\((\d+)px\)/)[1])).toBeLessThanOrEqual(18);
});

for (const mode of ['light', 'dark']) test(`cartes et barres en verre translucide sur l'écran Quêtes (${mode})`, async ({ page, request }) => {
  const f = await newFamily(request, fam => { fam.children[0].tasks = [task('Ranger sa chambre', 20, 10)]; });
  await setAppearance(page, { mode });
  await childLogin(page, f);
  const g = await page.evaluate(src => ['#main .card', '.topbar', '.bottom-nav'].map(sel => {
    const cs = getComputedStyle(document.querySelector(sel));
    return { sel, blur: cs.backdropFilter, alpha: eval(src)(cs.backgroundColor) };
  }), ALPHA);
  for (const x of g) { expect(x.blur, x.sel).toContain('blur(18px)'); expect(x.alpha, x.sel).toBeLessThan(0.9); expect(x.alpha, x.sel).toBeGreaterThan(0); }
});

test('repli sans flou: prefers-reduced-transparency → surfaces quasi opaques', async ({ page, request }) => {
  const f = await newFamily(request);
  await setAppearance(page, { mode: 'dark' });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  await childLogin(page, f);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches)).toBe(true);
  const r = await page.evaluate(src => ['#main .card', '.topbar', '.bottom-nav'].map(sel => {
    const cs = getComputedStyle(document.querySelector(sel));
    return { sel, blur: cs.backdropFilter, alpha: eval(src)(cs.backgroundColor), bg: cs.backgroundColor };
  }), ALPHA);
  for (const x of r) { expect(x.blur, x.sel).toBe('none'); expect(x.alpha, x.sel).toBeGreaterThanOrEqual(0.92); }
});

test('repli sans flou: règle @supports not (backdrop-filter) présente pour les surfaces en verre', async ({ page }) => {
  await page.goto('/');
  const rules = await page.evaluate(() => {
    const out = [];
    for (const sh of document.styleSheets) {
      let list; try { list = sh.cssRules; } catch { continue; }
      for (const r of list) if (r instanceof CSSSupportsRule && /not/.test(r.conditionText) && /backdrop-filter/.test(r.conditionText))
        for (const x of r.cssRules) out.push(x.cssText);
    }
    return out.join('\n');
  });
  for (const sel of ['.glass', '.glass-bar', '.card', '.topbar', '.bottom-nav']) expect(rules).toContain(sel);
  expect(rules).toMatch(/background/);
});

test('prefers-reduced-motion: aucune transition de thème', async ({ page }) => {
  await page.goto('/');
  expect(parseFloat(await page.evaluate(() => getComputedStyle(document.body).transitionDuration))).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => getComputedStyle(document.body).transitionDuration)).toBe('0s');
});

test('bureau ≥ 1100 px: barre latérale conservée', async ({ page, request }) => {
  const f = await newFamily(request);
  await page.setViewportSize({ width: 1280, height: 800 });
  await childLogin(page, f);
  await settle(page);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.bottom-nav')).flexDirection)).toBe('column');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

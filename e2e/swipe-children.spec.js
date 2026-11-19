import { test, expect, newFamily, parentLogin, childLogin, tab, settle } from './helpers.js';

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

// Vrai geste tactile (CDP) partant du centre de `from`, déplacement (dx, dy) en ~100 ms.
async function swipe(page, from, dx, dy = 0) {
  const box = await page.locator(from).first().boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await touch('touchStart', [{ x, y }]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [{ x: x + dx * i / 5, y: y + dy * i / 5 }]);
  await touch('touchEnd', []);
  await cdp.detach();
  await page.waitForTimeout(250);
  await settle(page);
}
const LEFT = -150, RIGHT = 150;
const parentKid = (page) => page.locator('#main input[name=child]:checked');
const questsOf = (page, name) => expect(page.locator('#main')).toContainText(`Quêtes de ${name}`);

test('parent Quêtes: swipe gauche/droite change d\'enfant, rien aux extrémités', async ({ page, request }) => {
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  await expect(parentKid(page)).toHaveValue('0');
  await swipe(page, '#main h2', RIGHT);             // déjà au premier
  await expect(parentKid(page)).toHaveValue('0');
  await swipe(page, '#main h2', LEFT);
  await expect(parentKid(page)).toHaveValue('1');
  await questsOf(page, 'Lucas');
  await swipe(page, '#main h2', LEFT);              // déjà au dernier
  await expect(parentKid(page)).toHaveValue('1');
  await swipe(page, '#main h2', RIGHT);
  await expect(parentKid(page)).toHaveValue('0');
  await questsOf(page, 'Emma');
  await expect(page.locator('#main')).toHaveCSS('touch-action', 'pan-y');
});

test('parent: un geste vertical ou parti d\'un champ ne change pas d\'enfant', async ({ page, request }) => {
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  await swipe(page, '#main h2', -30, 250);          // défilement vertical
  await expect(parentKid(page)).toHaveValue('0');
  await swipe(page, '#new-task-name', LEFT);        // geste commencé dans un champ
  await expect(parentKid(page)).toHaveValue('0');
  await page.locator('#new-task-name').fill('Brouillon');  // champ focalisé: le brouillon n'est pas perdu
  await swipe(page, '#main h2', LEFT);
  await expect(parentKid(page)).toHaveValue('0');
  await expect(page.locator('#new-task-name')).toHaveValue('Brouillon');
});

test('parent: onglet sans sélecteur d\'enfant (Notes) ne réagit pas au swipe', async ({ page, request }) => {
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Notes');
  await swipe(page, '#main', LEFT);
  await tab(page, 'Quêtes');
  await expect(parentKid(page)).toHaveValue('0');
});

test('parent Boutique: le swipe change aussi d\'enfant', async ({ page, request }) => {
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Boutique');
  await swipe(page, '#main .kicker', LEFT);
  await expect(parentKid(page)).toHaveValue('1');
});

test('un seul enfant: le swipe ne fait rien', async ({ page, request }) => {
  const f = await newFamily(request, fam => { fam.children = fam.children.slice(0, 1); });
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  await swipe(page, '#main h2', LEFT);
  await swipe(page, '#main h2', RIGHT);
  await questsOf(page, 'Emma');
});

test('enfant: swipe vers un enfant verrouillé demande son PIN, puis vers un enfant débloqué l\'affiche', async ({ page, request }) => {
  const f = await newFamily(request);
  await childLogin(page, f);
  await expect(page.locator('#child-select')).toHaveValue('0');
  await swipe(page, '#main', LEFT);
  await expect(page.locator('#child-select')).toHaveValue('1');
  await expect(page.locator('#main')).toContainText('Salut Lucas');
  await page.locator('[data-action="unlock-child"]').click();
  await page.locator('#pin-input-1').fill('4321');
  await page.locator('[data-action="submit-pin"]').click();
  await settle(page);
  await expect(page.locator('#main')).not.toContainText('Salut Lucas');
  await swipe(page, '#main', RIGHT);
  await expect(page.locator('#child-select')).toHaveValue('0');
  await expect(page.locator('#main')).toContainText('Emma');
  await expect(page.locator('#main')).not.toContainText('Salut Emma');
  await swipe(page, '#main', LEFT);                 // Lucas déjà débloqué: pas de PIN
  await expect(page.locator('#child-select')).toHaveValue('1');
  await expect(page.locator('#main')).not.toContainText('Salut Lucas');
  await swipe(page, '#main', LEFT);                 // dernier: rien
  await expect(page.locator('#child-select')).toHaveValue('1');
});

// Espion sur Element.prototype.animate (enregistre durée et décalage de départ des animations de #main).
const spyAnimate = (page) => page.addInitScript(() => {
  window.__anims = [];
  const orig = Element.prototype.animate;
  Element.prototype.animate = function (frames, opts) {
    if (this.id === 'main') window.__anims.push({ duration: opts && opts.duration, from: frames[0].transform });
    return orig.call(this, frames, opts);
  };
});
const anims = (page) => page.evaluate(() => window.__anims);

test('swipe: animation de 150 ms décalée dans le sens du geste', async ({ page, request }) => {
  await spyAnimate(page);
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  await swipe(page, '#main h2', LEFT);              // suivant: entre par la droite
  await expect(parentKid(page)).toHaveValue('1');
  await swipe(page, '#main h2', LEFT);              // déjà au dernier: pas d'animation
  await swipe(page, '#main h2', RIGHT);             // précédent: entre par la gauche
  await expect(parentKid(page)).toHaveValue('0');
  expect(await anims(page)).toEqual([
    { duration: 150, from: 'translateX(40px)' },
    { duration: 150, from: 'translateX(-40px)' },
  ]);
});

test('swipe avec prefers-reduced-motion: l\'enfant change sans animation', async ({ page, request }) => {
  await spyAnimate(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const f = await newFamily(request);
  await parentLogin(page, f);
  await tab(page, 'Quêtes');
  await swipe(page, '#main h2', LEFT);
  await expect(parentKid(page)).toHaveValue('1');
  await questsOf(page, 'Lucas');
  await swipe(page, '#main h2', RIGHT);
  await expect(parentKid(page)).toHaveValue('0');
  expect(await anims(page)).toEqual([]);
});

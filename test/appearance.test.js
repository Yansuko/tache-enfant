import { describe, it, expect } from 'vitest';
import { api, newParent } from './helpers.js';

const look = (over = {}) => ({ mode: 'dark', lightTheme: 'clair', darkTheme: 'bleu-nuit', accent: 'ocean', ...over });

async function setup() {
  const p = await newParent('look');
  p.family.children = [
    { id: 'c-emma', name: 'Emma', xp: 0, gold: 0, pin: '1234', tasks: [], grades: [], sanctions: [] },
    { id: 'c-lucas', name: 'Lucas', xp: 0, gold: 0, pin: '4321', tasks: [], grades: [], sanctions: [] },
  ];
  const fam = await p.save(p.family);
  const unlock = await api('unlockChildDirect', { familyName: p.familyName, childName: 'Emma', pin: '1234' });
  return { p, fam, childToken: unlock.body.token };
}
const set = (body, token) => api('setAppearance', body, token);
const kid = (fams, id) => fams[0].children.find(c => c.id === id);

describe('setAppearance', () => {
  it('parent: son compte, renvoyé par me', async () => {
    const { p } = await setup();
    const r = await set({ appearance: look() }, p.token);
    expect(r.status).toBe(200);
    expect(r.body.appearance).toEqual(look());
    expect((await api('me', {}, p.token)).body.me.appearance).toEqual(look());
  });

  it('parent: un enfant de sa famille, renvoyé avec les enfants (parent et enfant)', async () => {
    const { p, childToken } = await setup();
    expect((await set({ appearance: look({ accent: 'rose' }), childId: 'c-lucas' }, p.token)).status).toBe(200);
    expect(kid(await p.me(), 'c-lucas').appearance).toEqual(look({ accent: 'rose' }));
    expect(kid((await api('me', {}, childToken)).body.families, 'c-lucas').appearance).toEqual(look({ accent: 'rose' }));
    expect((await api('me', {}, p.token)).body.me.appearance).toBeUndefined();   // pas le compte
  });

  it('enfant: uniquement le sien', async () => {
    const { p, childToken } = await setup();
    expect((await set({ appearance: look({ mode: 'light' }) }, childToken)).status).toBe(200);
    expect((await set({ appearance: look({ mode: 'auto' }), childId: 'c-emma' }, childToken)).status).toBe(200);
    expect(kid(await p.me(), 'c-emma').appearance).toEqual(look({ mode: 'auto' }));
    expect((await set({ appearance: look(), childId: 'c-lucas' }, childToken)).status).toBe(403);
    expect(kid(await p.me(), 'c-lucas').appearance).toBeUndefined();
    expect((await api('me', {}, p.token)).body.me.appearance).toBeUndefined();
  });

  it('autre famille refusée', async () => {
    const { childToken } = await setup();
    const other = await newParent('look-other');
    expect((await set({ appearance: look(), childId: 'c-emma' }, other.token)).status).toBe(403);
    const { fam } = await setup();
    expect((await set({ appearance: look(), childId: fam.children[1].id }, childToken)).status).toBe(403);
  });

  it('champs inconnus ou ids invalides: 400', async () => {
    const { p } = await setup();
    const bad = async a => (await set({ appearance: a }, p.token)).status;
    expect(await bad(look({ extra: 1 }))).toBe(400);
    expect(await bad(look({ location: { lat: 48, lon: 2 } }))).toBe(400);   // la position reste sur l'appareil
    expect(await bad(look({ mode: 'night' }))).toBe(400);
    expect(await bad(look({ accent: 'Ocean' }))).toBe(400);
    expect(await bad(look({ lightTheme: '<b>' }))).toBe(400);
    expect(await bad(look({ darkTheme: 'x'.repeat(33) }))).toBe(400);
    expect(await bad(look({ accent: 3 }))).toBe(400);
    expect(await bad('dark')).toBe(400);
    expect(await bad(null)).toBe(400);
    expect(await bad([])).toBe(400);
    // pas de vérification d'existence: un thème d'une version plus récente du client est accepté
    expect(await bad(look({ darkTheme: 'ocean-profond' }))).toBe(200);
    expect(await bad({ mode: 'light' })).toBe(200);   // champs partiels acceptés
    expect((await set({ appearance: look(), childId: 'c-inconnu' }, p.token)).status).toBe(403);
    expect((await set({ appearance: look() })).status).toBe(401);
  });

  it('non écrasée par saveFamily (appareil périmé, enfant, nouvelle valeur envoyée)', async () => {
    const { p, fam, childToken } = await setup();
    await set({ appearance: look({ accent: 'foret' }), childId: 'c-emma' }, p.token);
    // copie périmée sans appearance
    let f = await p.save(fam);
    expect(kid([f], 'c-emma').appearance).toEqual(look({ accent: 'foret' }));
    // tentative d'écriture via saveFamily: ignorée
    const forged = structuredClone(f);
    forged.children.find(c => c.id === 'c-emma').appearance = look({ accent: 'rose' });
    forged.children.find(c => c.id === 'c-lucas').appearance = look({ accent: 'rose' });
    f = await p.save(forged);
    expect(kid([f], 'c-emma').appearance).toEqual(look({ accent: 'foret' }));
    expect(kid([f], 'c-lucas').appearance).toBeUndefined();
    // appareil enfant
    const r = await api('saveFamily', { family: forged }, childToken);
    expect(r.status).toBe(200);
    expect(kid(await p.me(), 'c-emma').appearance).toEqual(look({ accent: 'foret' }));
    expect(kid(await p.me(), 'c-lucas').appearance).toBeUndefined();
  });
});

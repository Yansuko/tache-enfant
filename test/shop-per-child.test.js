import { describe, it, expect, beforeAll } from 'vitest';
import { api, newParent } from './helpers.js';

let S;
beforeAll(async () => {
  await import('../public/shop.js');
  S = globalThis.Shop;
});

const pizza = (over = {}) => ({ id: 'r-pizza', icon: '🍕', name: 'Pizza', cost: 60, lvl: 1, ...over });

describe('Shop.effectiveCost', () => {
  it('prix propre à l\'enfant, sinon prix commun', () => {
    const r = pizza({ prices: { 'c-emma': 40 } });
    expect(S.effectiveCost(r, 'c-emma')).toBe(40);
    expect(S.effectiveCost(r, 'c-lucas')).toBe(60);
    expect(S.effectiveCost(pizza(), 'c-emma')).toBe(60);       // ancien article sans `prices`
  });
});

describe('Shop.visibleRewards', () => {
  it('réservé / commun / liste vide', () => {
    const only = pizza({ id: 'r2', childIds: ['c-emma'] });
    const all = pizza({ childIds: [] });
    expect(S.visibleRewards([only, all, pizza({ id: 'r3' })], 'c-lucas').map(r => r.id)).toEqual(['r-pizza', 'r3']);
    expect(S.visibleRewards([only, all], 'c-emma').map(r => r.id)).toEqual(['r2', 'r-pizza']);
    expect(S.visibleRewards([], 'c-emma')).toEqual([]);
    expect(S.visibleRewards(undefined, 'c-emma')).toEqual([]);
  });
});

async function setup(rewards = [pizza({ prices: { 'c-emma': 40 } })]) {
  const p = await newParent('shop');
  p.family.children = [
    { id: 'c-emma', name: 'Emma', xp: 0, gold: 100, pin: '1234', tasks: [], grades: [], sanctions: [] },
    { id: 'c-lucas', name: 'Lucas', xp: 0, gold: 100, pin: '4321', tasks: [], grades: [], sanctions: [] },
  ];
  p.family.rewards = rewards;
  const fam = await p.save(p.family);
  const unlock = await api('unlockChildDirect', { familyName: p.familyName, childName: 'Emma', pin: '1234' });
  const childSave = async family => { const r = await api('saveFamily', { family }, unlock.body.token); expect(r.status).toBe(200); return r.body.family; };
  return { p, fam, childSave };
}

describe('saveFamily: prix par enfant', () => {
  it('une demande au prix falsifié est ramenée au prix effectif (rewardId ou nom)', async () => {
    const { fam, childSave } = await setup();
    const f = await childSave({ ...structuredClone(fam), requests: [
      { id: 'rq1', child: 'Emma', rewardId: 'r-pizza', name: 'Pizza', cost: 1, status: 'pending' },
    ] });
    expect(f.requests.find(r => r.id === 'rq1').cost).toBe(40);
    const f2 = await childSave({ ...structuredClone(f), requests: [...f.requests,
      { id: 'rq2', child: 'Emma', name: 'Pizza', cost: 5, status: 'pending' },          // ancien client: pas de rewardId
    ] });
    expect(f2.requests.find(r => r.id === 'rq2').cost).toBe(40);
  });

  it('un enfant ne peut pas modifier le prix d\'une demande déjà enregistrée', async () => {
    const { fam, childSave } = await setup();
    const f = await childSave({ ...structuredClone(fam), requests: [{ id: 'rq1', child: 'Emma', rewardId: 'r-pizza', name: 'Pizza', cost: 40, status: 'pending' }] });
    f.requests[0].cost = 2;
    expect((await childSave(f)).requests[0].cost).toBe(40);
  });

  it('demande d\'un enfant pour un article inconnu (nom inexact, supprimé): retirée', async () => {
    const { p, fam, childSave } = await setup();
    const f = await childSave({ ...structuredClone(fam), requests: [
      { id: 'rq1', child: 'Emma', name: 'Disparu', cost: 33, status: 'pending' },
      { id: 'rq2', child: 'Emma', name: 'Pizza ', cost: 40, status: 'pending' },                    // espace final
      { id: 'rq3', child: 'Emma', name: 'Inconnu', cost: '<img src=x onerror=alert(1)>', status: 'pending' },
    ] });
    expect(f.requests).toEqual([]);
    expect((await p.me())[0].requests).toEqual([]);
  });

  it('article réservé à Emma demandé par Lucas: retiré', async () => {
    const { p, fam } = await setup([pizza({ childIds: ['c-emma'] })]);
    const u = await api('unlockChildDirect', { familyName: p.familyName, childName: 'Lucas', pin: '4321' });
    const r = await api('saveFamily', { family: { ...structuredClone(fam), requests: [{ id: 'rq1', child: 'Lucas', rewardId: 'r-pizza', name: 'Pizza', cost: 60, status: 'pending' }] } }, u.body.token);
    expect(r.status).toBe(200);
    expect(r.body.family.requests).toEqual([]);
  });

  it('un enfant ne demande pas au nom d\'un autre enfant', async () => {
    const { fam, childSave } = await setup();
    const f = await childSave({ ...structuredClone(fam), requests: [{ id: 'rq1', child: 'Lucas', rewardId: 'r-pizza', name: 'Pizza', cost: 60, status: 'pending' }] });
    expect(f.requests).toEqual([]);
  });

  it('rewardId et nom différents: l\'article du rewardId fait foi (nom, icône, prix recopiés)', async () => {
    const { fam, childSave } = await setup([pizza({ prices: { 'c-emma': 40 } }), { id: 'r-glace', icon: '🍦', name: 'Glace', cost: 90, lvl: 1 }]);
    const f = await childSave({ ...structuredClone(fam), requests: [{ id: 'rq1', child: 'Emma', rewardId: 'r-glace', name: 'Pizza', icon: '🍕', cost: 40, status: 'pending' }] });
    expect(f.requests).toEqual([expect.objectContaining({ id: 'rq1', rewardId: 'r-glace', name: 'Glace', icon: '🍦', cost: 90 })]);
  });

  it('demande d\'un enfant sans rewardId: le rewardId de l\'article est ajouté, le prix chaîne remplacé', async () => {
    const { fam, childSave } = await setup();
    const f = await childSave({ ...structuredClone(fam), requests: [{ id: 'rq1', child: 'Emma', name: 'Pizza', cost: '<b>', status: 'pending' }] });
    expect(f.requests).toEqual([expect.objectContaining({ rewardId: 'r-pizza', name: 'Pizza', cost: 40 })]);
  });

  it('serveur: un prix non entier ≥ 1 n\'est jamais stocké (parent, article inconnu)', async () => {
    const { p, fam } = await setup();
    const f = await p.save({ ...fam, requests: [
      { id: 'rq1', child: 'Emma', name: 'Hors boutique', cost: '<img src=x onerror=alert(1)>', status: 'pending' },
      { id: 'rq2', child: 'Emma', name: 'Hors boutique', cost: 0, status: 'pending' },
      { id: 'rq3', child: 'Emma', name: 'Hors boutique', cost: 12, status: 'pending' },
    ] });
    expect(f.requests.map(r => r.id)).toEqual(['rq3']);
  });

  it('demandes déjà approuvées / refusées: jamais modifiées', async () => {
    const { p, fam, childSave } = await setup();
    const done = [
      { id: 'rq1', child: 'Emma', name: 'Disparu', cost: 33, status: 'approved' },
      { id: 'rq2', child: 'Emma', name: 'Pizza', cost: 60, status: 'refused' },
    ];
    await p.save({ ...fam, requests: done });
    const f = await childSave({ ...structuredClone(fam), requests: done });
    expect(f.requests).toEqual(done.map(d => expect.objectContaining(d)));
  });

  it('un enfant ne peut pas modifier les articles (prix, réservation)', async () => {
    const { p, fam, childSave } = await setup();
    const copy = structuredClone(fam);
    copy.rewards[0].prices = { 'c-emma': 1 };
    copy.rewards[0].cost = 1;
    copy.rewards.push(pizza({ id: 'r-x', childIds: ['c-emma'] }));
    await childSave(copy);
    expect((await p.me())[0].rewards).toEqual([expect.objectContaining({ id: 'r-pizza', cost: 60, prices: { 'c-emma': 40 } })]);
  });

  it('un parent enregistre prices / childIds', async () => {
    const { p, fam } = await setup();
    const f = await p.save({ ...fam, rewards: [pizza({ prices: { 'c-lucas': 70 }, childIds: ['c-emma'] })] });
    expect(f.rewards[0]).toEqual(expect.objectContaining({ prices: { 'c-lucas': 70 }, childIds: ['c-emma'] }));
  });

  it('prices / childIds invalides → 400', async () => {
    const { p, fam } = await setup();
    const bad = async r => (await api('saveFamily', { family: { ...fam, rewards: [pizza(r)] } }, p.token)).status;
    expect(await bad({ prices: { 'c-emma': 0 } })).toBe(400);
    expect(await bad({ prices: { 'c-emma': 2.5 } })).toBe(400);
    expect(await bad({ prices: { 'c-emma': '40' } })).toBe(400);
    expect(await bad({ prices: { 'c-inconnu': 40 } })).toBe(400);
    expect(await bad({ prices: [40] })).toBe(400);
    expect(await bad({ childIds: 'c-emma' })).toBe(400);
    expect(await bad({ childIds: ['c-inconnu'] })).toBe(400);
  });

  it('anciens articles sans ces champs: inchangés', async () => {
    const legacy = [{ icon: '📱', name: 'Écran', cost: 50, lvl: 1 }];
    const { p, fam, childSave } = await setup(legacy);
    expect(fam.rewards).toEqual([expect.objectContaining({ icon: '📱', name: 'Écran', cost: 50, lvl: 1 })]);
    expect(fam.rewards[0].prices).toBeUndefined();
    expect(fam.rewards[0].childIds).toBeUndefined();
    const f = await childSave({ ...structuredClone(fam), requests: [{ id: 'rq1', child: 'Emma', name: 'Écran', cost: 50, status: 'pending' }] });
    expect(f.requests[0].cost).toBe(50);
    expect((await p.me())[0].rewards[0].name).toBe('Écran');
  });
});

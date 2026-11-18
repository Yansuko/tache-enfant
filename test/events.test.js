import { describe, it, expect, beforeAll } from 'vitest';
import { api, newParent } from './helpers.js';
import { completionsOf } from '../src/core.mjs';

let E;
beforeAll(async () => {
  await import('../public/events.js');
  E = globalThis.Events;
});

const ev = (over = {}) => ({ id: 'ev1', name: 'Vacances', start: '2026-11-16', end: '2026-11-20', xpMult: 2, goldMult: 1, ...over });

describe('Events.activeMultipliers', () => {
  it('hors période: aucun bonus', () => {
    expect(E.activeMultipliers([ev()], 'c1', '2026-11-15')).toEqual({ xpMult: 1, goldMult: 1, names: [] });
    expect(E.activeMultipliers([ev()], 'c1', '2026-11-21')).toEqual({ xpMult: 1, goldMult: 1, names: [] });
  });
  it('premier et dernier jour inclus', () => {
    expect(E.activeMultipliers([ev()], 'c1', '2026-11-16').xpMult).toBe(2);
    expect(E.activeMultipliers([ev()], 'c1', '2026-11-20')).toEqual({ xpMult: 2, goldMult: 1, names: ['Vacances'] });
  });
  it('enfant ciblé vs tous', () => {
    const only = ev({ childIds: ['c1'] });
    expect(E.activeMultipliers([only], 'c1', '2026-11-18').xpMult).toBe(2);
    expect(E.activeMultipliers([only], 'c2', '2026-11-18').xpMult).toBe(1);
    expect(E.activeMultipliers([ev({ childIds: [] })], 'c2', '2026-11-18').xpMult).toBe(2);
  });
  it('deux événements: le plus élevé par ressource', () => {
    const r = E.activeMultipliers([ev({ xpMult: 2, goldMult: 1 }), ev({ id: 'ev2', name: 'Fête', xpMult: 1.5, goldMult: 3 })], 'c1', '2026-11-18');
    expect(r).toEqual({ xpMult: 2, goldMult: 3, names: ['Vacances', 'Fête'] });
  });
  it('jour de Paris, pas UTC: 23:30 UTC le 15 = 00:30 le 16 à Paris', () => {
    const ms = Date.UTC(2026, 10, 15, 23, 30);
    expect(E.parisDay(ms)).toBe('2026-11-16');
    expect(E.activeMultipliers([ev()], 'c1', E.parisDay(ms)).xpMult).toBe(2);
    expect(E.parisDay(Date.UTC(2026, 6, 15, 22, 30))).toBe('2026-07-16');   // heure d'été: UTC+2
  });
});

describe('Events.applyMult', () => {
  it('arrondit à l\'entier', () => {
    expect(E.applyMult(10, 2)).toBe(20);
    expect(E.applyMult(5, 1.5)).toBe(8);
    expect(E.applyMult(3, 1.5)).toBe(5);
    expect(E.applyMult(7, 1)).toBe(7);
    expect(E.applyMult(undefined, 2)).toBe(0);
  });
});

async function setup() {
  const p = await newParent('events');
  p.family.children = [
    { id: 'c-emma', name: 'Emma', xp: 0, gold: 0, pin: '1234', tasks: [], grades: [], sanctions: [] },
    { id: 'c-lucas', name: 'Lucas', xp: 0, gold: 0, pin: '4321', tasks: [], grades: [], sanctions: [] },
  ];
  const fam = await p.save(p.family);
  const unlock = await api('unlockChildDirect', { familyName: p.familyName, childName: 'Emma', pin: '1234' });
  return { p, fam, childToken: unlock.body.token };
}

describe('saveFamily: événements', () => {
  it('un parent enregistre des événements, ils sont conservés', async () => {
    const { p, fam } = await setup();
    const f = await p.save({ ...fam, events: [ev({ childIds: ['c-emma'] })] });
    expect(f.events).toEqual([ev({ childIds: ['c-emma'] })]);
    expect((await p.me())[0].events).toEqual([ev({ childIds: ['c-emma'] })]);
    // une sauvegarde sans le champ (ancien client) ne les efface pas
    const { events, ...rest } = f;
    expect((await p.save(rest)).events).toHaveLength(1);
  });

  it('validation: 400 si invalide', async () => {
    const { p, fam } = await setup();
    const bad = async e => (await api('saveFamily', { family: { ...fam, events: e } }, p.token)).status;
    expect(await bad([ev({ start: '2026-13-01' })])).toBe(400);
    expect(await bad([ev({ start: '2026-11-21' })])).toBe(400);           // start > end
    expect(await bad([ev({ xpMult: 6 })])).toBe(400);
    expect(await bad([ev({ goldMult: 0.5 })])).toBe(400);
    expect(await bad([ev({ xpMult: 1.25 })])).toBe(400);
    expect(await bad([ev({ name: '' })])).toBe(400);
    expect(await bad([ev({ name: 'x'.repeat(61) })])).toBe(400);
    expect(await bad([ev({ id: '' })])).toBe(400);
    expect(await bad([ev({ childIds: 'c-emma' })])).toBe(400);
    expect(await bad('nope')).toBe(400);
    expect(await bad(Array.from({ length: 21 }, (_, i) => ev({ id: 'e' + i })))).toBe(400);
    expect(await bad([ev({ xpMult: 4.5, goldMult: 5, name: 'x'.repeat(60) })])).toBe(200);
  });

  it('fusion par id: un appareil périmé ne supprime pas, eventsDeleted supprime', async () => {
    const { p, fam } = await setup();
    const f1 = await p.save({ ...fam, events: [ev()] });
    const f2 = await p.save({ ...f1, events: [ev({ id: 'ev2', name: 'Autre' })] });     // copie sans ev1
    expect(f2.events.map(e => e.id).sort()).toEqual(['ev1', 'ev2']);
    const f3 = await p.save({ ...f2, events: f2.events.filter(e => e.id !== 'ev1'), eventsDeleted: ['ev1'] });
    expect(f3.events.map(e => e.id)).toEqual(['ev2']);
    expect(f3.eventsDeleted).toBeUndefined();
  });

  it('un enfant ne peut pas modifier les événements', async () => {
    const { p, fam, childToken } = await setup();
    const f1 = await p.save({ ...fam, events: [ev()] });
    const r = await api('saveFamily', { family: { ...f1, events: [ev({ xpMult: 5 }), ev({ id: 'x', name: 'Triche' })], eventsDeleted: ['ev1'] } }, childToken);
    expect(r.status).toBe(200);
    expect(r.body.family.events).toEqual([ev()]);
  });
});

describe('statistiques: gain réel', () => {
  it('completionsOf utilise xpEarned/goldEarned, repli sur xp/gold', () => {
    const child = { name: 'Emma', tasks: [
      { name: 'A', xp: 10, gold: 5, xpEarned: 20, goldEarned: 10, completedAt: 1000000 },
      { name: 'B', xp: 10, gold: 5, completedAt: 2000000 },
    ] };
    expect(completionsOf(child).map(e => [e.name, e.xp, e.gold])).toEqual([['A', 20, 10], ['B', 10, 5]]);
  });

  it('getTaskStats compte le gain multiplié', async () => {
    const { p, fam } = await setup();
    fam.children[0].tasks = [{ id: 't1', name: 'Lit', xp: 10, gold: 5, frequency: 'daily', done: true, completedAt: Date.now() - 60000, xpEarned: 20, goldEarned: 5 }];
    await p.save(fam);
    const s = (await api('getTaskStats', { childId: 'c-emma', period: 'month' })).body;
    expect([s.tasksCount, s.xpGained, s.goldGained]).toEqual([1, 20, 5]);
    expect(s.history[0]).toMatchObject({ xp: 20, gold: 5 });
  });

  it('le serveur garde xpEarned d\'une validation face à une copie périmée', async () => {
    const { p, fam } = await setup();
    const stale = structuredClone({ ...fam, children: fam.children.map(c => ({ ...c, tasks: [{ id: 't1', name: 'Lit', xp: 10, gold: 5, frequency: 'daily', done: false, completedAt: null }] })) });
    const base = await p.save(stale);
    const v = structuredClone(base);
    Object.assign(v.children[0].tasks[0], { done: true, completedAt: Date.now(), xpEarned: 20, goldEarned: 5 });
    await p.save(v);
    stale.updatedAt = base.updatedAt;
    const f = await p.save(stale);
    expect(f.children[0].tasks[0]).toMatchObject({ done: true, xpEarned: 20, goldEarned: 5 });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const sent = [];
vi.mock('web-push', () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: 'pub', privateKey: 'priv' }),
    sendNotification: async (sub, payload) => { sent.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }); return {}; },
  },
}));

import Database from 'better-sqlite3';
import { createDatabaseAdapter } from '../database.js';
import { runReminders } from '../src/core.mjs';
import { dueReminders } from '../src/reminders.mjs';
import { api, newParent } from './helpers.js';

const MON_1730 = new Date('2026-11-09T16:30:00Z').getTime();   // lundi 17:30 Paris (hiver, UTC+1)
const MON_1630 = new Date('2026-11-09T15:30:00Z').getTime();   // lundi 16:30 Paris
const MON_2000 = new Date('2026-11-09T19:00:00Z').getTime();   // lundi 20:00 Paris
const TUE_1730 = new Date('2026-11-10T16:30:00Z').getTime();   // mardi 17:30 Paris
const SUMMER_MON_1730 = new Date('2026-07-06T15:30:00Z').getTime(); // lundi 17:30 Paris (été, UTC+2)
const SUMMER_MON_1630 = new Date('2026-07-06T14:30:00Z').getTime(); // lundi 16:30 Paris (= 17:30 si UTC+1)

const task = (id, name, over = {}) => ({ id, name, xp: 10, gold: 5, frequency: 'daily', done: false, completedAt: null, ...over });
const rem = (over = {}) => ({ id: 'r1', childId: 'c-emma', days: [0], time: '17:00', enabled: true, ...over });
const sub = (n) => ({ endpoint: `https://push.example/${n}-${Math.random().toString(36).slice(2)}`, keys: { p256dh: 'k', auth: 'a' } });

let n = 0;
async function setup({ reminders = [rem()], emmaTasks } = {}) {
  const store = createDatabaseAdapter(new Database(':memory:'), false);
  const id = 'fam-' + (++n);
  const fam = {
    id, name: 'F' + n, owner: 'p@x', members: ['p@x'],
    children: [
      { id: 'c-emma', name: 'Emma', tasks: emmaTasks || [task('t1', 'Faire son lit'), task('t2', 'Ranger'), task('t3', 'Lire', { done: true })] },
      { id: 'c-leo', name: 'Léo', tasks: [task('t4', 'Devoirs')] },
    ],
    reminders,
  };
  await store.set('family:' + id, fam);
  const subs = { emma: sub('emma'), leo: sub('leo'), parent: sub('parent') };
  await store.set('push:' + id, [
    { email: `Emma@${id}.enfant.local`, subscription: subs.emma },
    { email: `Léo@${id}.enfant.local`, subscription: subs.leo },
    { email: 'p@x', subscription: subs.parent },
  ]);
  return { store, id, subs, fam: () => store.get('family:' + id) };
}

beforeEach(() => { sent.length = 0; });

describe('dueReminders', () => {
  it('jour, heure, enabled et lastSent (heure de Paris)', () => {
    expect(dueReminders({ reminders: [rem()] }, MON_1730).map(r => r.id)).toEqual(['r1']);
    expect(dueReminders({ reminders: [rem()] }, MON_1630)).toEqual([]);
    expect(dueReminders({ reminders: [rem()] }, TUE_1730)).toEqual([]);
    expect(dueReminders({ reminders: [rem({ enabled: false })] }, MON_1730)).toEqual([]);
    expect(dueReminders({ reminders: [rem({ lastSent: '2026-11-09' })] }, MON_1730)).toEqual([]);
    expect(dueReminders({ reminders: [rem({ lastSent: '2026-11-02' })] }, MON_1730).length).toBe(1);
    expect(dueReminders({}, MON_1730)).toEqual([]);
  });
  it('heure d\'été: 15:30 UTC = 17:30 Paris, 14:30 UTC = 16:30 Paris', () => {
    expect(dueReminders({ reminders: [rem()] }, SUMMER_MON_1730).length).toBe(1);
    expect(dueReminders({ reminders: [rem()] }, SUMMER_MON_1630)).toEqual([]);
  });
});

describe('runReminders', () => {
  it('lundi 17:30 Paris: un push à Emma seulement, lastSent posé', async () => {
    const s = await setup();
    expect(await runReminders(s.store, MON_1730)).toEqual({ sent: 1 });
    expect(sent.map(x => x.endpoint)).toEqual([s.subs.emma.endpoint]);
    expect(sent[0]).toMatchObject({ title: 'Rappel de quête', body: '2 quêtes à faire : Faire son lit, Ranger', tag: 'reminder' });
    expect((await s.fam()).reminders[0].lastSent).toBe('2026-11-09');
  });

  it('2e tick le même jour -> 0', async () => {
    const s = await setup();
    await runReminders(s.store, MON_1730);
    sent.length = 0;
    expect(await runReminders(s.store, MON_2000)).toEqual({ sent: 0 });
    expect(sent).toEqual([]);
  });

  it('mardi -> 0; avant l\'heure -> 0; désactivé -> 0', async () => {
    expect(await runReminders((await setup()).store, TUE_1730)).toEqual({ sent: 0 });
    expect(await runReminders((await setup()).store, MON_1630)).toEqual({ sent: 0 });
    expect(await runReminders((await setup({ reminders: [rem({ enabled: false })] })).store, MON_1730)).toEqual({ sent: 0 });
    expect(sent).toEqual([]);
  });

  it('toutes les quêtes validées -> 0 push mais lastSent posé (pas de renvoi plus tard)', async () => {
    const s = await setup({ emmaTasks: [task('t1', 'Faire son lit', { done: true })] });
    expect(await runReminders(s.store, MON_1730)).toEqual({ sent: 0 });
    expect(sent).toEqual([]);
    expect((await s.fam()).reminders[0].lastSent).toBe('2026-11-09');
  });

  it('questName ne cible que cette quête', async () => {
    const s = await setup({ reminders: [rem({ questName: 'Ranger' })] });
    expect(await runReminders(s.store, MON_1730)).toEqual({ sent: 1 });
    expect(sent[0].body).toBe('Ranger');
    expect(sent[0].body).not.toContain('Faire son lit');
  });

  it('rappel pour Léo -> uniquement l\'appareil de Léo', async () => {
    const s = await setup({ reminders: [rem({ childId: 'c-leo' })] });
    await runReminders(s.store, MON_1730);
    expect(sent.map(x => x.endpoint)).toEqual([s.subs.leo.endpoint]);
    expect(sent[0].body).toBe('Devoirs');
  });

  it('heure d\'été: lundi 17:30 Paris (15:30 UTC) envoie, 16:30 Paris non', async () => {
    expect(await runReminders((await setup()).store, SUMMER_MON_1630)).toEqual({ sent: 0 });
    expect(await runReminders((await setup()).store, SUMMER_MON_1730)).toEqual({ sent: 1 });
  });

  it('redémarrage: un nouveau passage relu depuis le store ne renvoie pas', async () => {
    const s = await setup();
    await runReminders(s.store, MON_1730);
    sent.length = 0;
    const reopened = { get: s.store.get, set: s.store.set, list: s.store.list };   // aucune mémoire de processus
    expect(await runReminders(reopened, MON_1730 + 60000)).toEqual({ sent: 0 });
    expect(sent).toEqual([]);
  });
});

describe('saveFamily: reminders', () => {
  async function family() {
    const A = await newParent('remS');
    A.family.children = [{ id: 'c-emma', name: 'Emma', xp: 0, gold: 0, pin: '1234', tasks: [task('t1', 'Faire son lit')], grades: [], sanctions: [] }];
    const f = await A.save(A.family);
    const kid = (await api('unlockChildDirect', { familyName: A.familyName, childName: 'Emma', pin: '1234' })).body.token;
    return { A, f, kid };
  }

  it('conserve reminders, le parent peut modifier et supprimer', async () => {
    const { A, f } = await family();
    let saved = await A.save({ ...f, reminders: [rem(), rem({ id: 'r2', questName: 'Faire son lit', days: [1, 3], time: '08:15' })] });
    expect(saved.reminders.map(r => r.id)).toEqual(['r1', 'r2']);
    expect((await A.me())[0].reminders.length).toBe(2);
    saved = await A.save({ ...saved, reminders: [rem({ time: '18:30', enabled: false })] });
    expect(saved.reminders).toEqual([rem({ time: '18:30', enabled: false })]);
  });

  it('rejette days hors 0-6 et heure invalide', async () => {
    const { A, f } = await family();
    expect((await api('saveFamily', { family: { ...f, reminders: [rem({ days: [9] })] } }, A.token)).status).toBe(400);
    expect((await api('saveFamily', { family: { ...f, reminders: [rem({ time: '25:99' })] } }, A.token)).status).toBe(400);
    expect((await api('saveFamily', { family: { ...f, reminders: [rem({ id: '' })] } }, A.token)).status).toBe(400);
    expect((await A.me())[0].reminders || []).toEqual([]);
  });

  it('un jeton enfant ne peut pas modifier les rappels', async () => {
    const { A, f, kid } = await family();
    const saved = await A.save({ ...f, reminders: [rem()] });
    const r = await api('saveFamily', { family: { ...saved, reminders: [rem({ id: 'hack', time: '06:00' })] } }, kid);
    expect(r.status).toBe(200);
    expect((await A.me())[0].reminders).toEqual([rem()]);
    await api('saveFamily', { family: { ...saved, reminders: [] } }, kid);
    expect((await A.me())[0].reminders).toEqual([rem()]);
  });

  it('lastSent est géré par le serveur: un client ne peut ni l\'effacer ni le reculer', async () => {
    const { A, f } = await family();
    const saved = await A.save({ ...f, reminders: [rem({ lastSent: '2099-01-01' })] });
    expect(saved.reminders[0].lastSent).toBeUndefined();          // posé par le client: ignoré
  });

  it('un client qui renvoie un rappel sans lastSent ne le fait pas perdre', async () => {
    const { A, f } = await family();
    const saved = await A.save({ ...f, reminders: [rem()] });
    const { store } = await import('../server.js');                 // même store que l'API (déjà chargé par helpers)
    await runReminders(store, MON_1730);
    expect((await A.me())[0].reminders[0].lastSent).toBe('2026-11-09');
    let again = await A.save({ ...saved, reminders: [rem({ time: '17:05' })] });
    expect(again.reminders[0]).toMatchObject({ time: '17:05', lastSent: '2026-11-09' });
    again = await A.save({ ...again, reminders: [rem({ lastSent: '2026-01-01' })] });
    expect(again.reminders[0].lastSent).toBe('2026-11-09');
  });
});

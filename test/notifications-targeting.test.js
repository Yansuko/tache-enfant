import { describe, it, expect, vi, beforeEach } from 'vitest';

// Faux service d'envoi: on enregistre (endpoint, notification) au lieu de contacter un navigateur.
const sent = [];
vi.mock('web-push', () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: 'pub', privateKey: 'priv' }),
    sendNotification: async (sub, payload) => { sent.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }); return {}; },
  },
}));

import { api, newParent } from './helpers.js';
import { setEmailSender } from '../src/core.mjs';

const emails = [];
const task = (id, name, over = {}) => ({ id, name, xp: 10, gold: 5, frequency: 'daily', done: false, completedAt: null, ...over });
const sub = (name) => ({ endpoint: `https://push.example/${name}-${Math.random().toString(36).slice(2)}`, keys: { p256dh: 'k', auth: 'a' } });
const forDevice = (device) => sent.filter(n => n.endpoint === device.sub.endpoint);
const wait = (ms = 5) => new Promise(r => setTimeout(r, ms));

// Famille avec 2 parents (A propriétaire, B invité) et un enfant (Emma), chacun avec un appareil abonné aux notifications.
async function setup({ emailNotifications = false } = {}) {
  const A = await newParent('ntA');
  const B = await newParent('ntB');
  A.family.children = [{ id: 'c-emma', name: 'Emma', xp: 0, gold: 100, pin: '1234', tasks: [task('t1', 'Faire son lit')], grades: [], sanctions: [] }];
  A.family.rewards = [{ id: 'r1', name: 'Pizza', cost: 25, lvl: 1 }];
  A.family.sanctionsList = [{ id: 's1', name: 'Retard', gold: 5 }];
  A.family.emailNotifications = emailNotifications;
  const base = await A.save(A.family);
  expect((await api('invite', { familyId: A.family.id, email: B.email }, A.token)).status).toBe(200);
  const u = await api('unlockChildDirect', { familyName: A.familyName, childName: 'Emma', pin: '1234' });
  const child = { token: u.body.token };
  const devices = { A: { token: A.token, sub: sub('A') }, B: { token: B.token, sub: sub('B') }, C: { token: child.token, sub: sub('C') } };
  for (const d of Object.values(devices)) expect((await api('subscribePush', { familyId: A.family.id, subscription: d.sub }, d.token)).status).toBe(200);
  const save = async (who, family) => { const r = await api('saveFamily', { family }, devices[who].token); expect(r.status).toBe(200); return r.body.family; };
  await wait();
  sent.length = 0; emails.length = 0;
  return { A, B, base: structuredClone(base), devices, save, fam: A.family.id };
}

beforeEach(() => { sent.length = 0; emails.length = 0; setEmailSender(async (m) => { emails.push(m); }); });

describe('notifications ciblées, une seule fois', () => {
  it('l\'enfant coche une quête: chaque parent reçoit 1 notification, l\'enfant aucune', async () => {
    const { base, devices, save } = await setup();
    const f = structuredClone(base);
    f.children[0].tasks[0].done = true;
    f.taskRequests = [{ id: 'tr1', child: 'Emma', taskIndex: 0, taskName: 'Faire son lit', xp: 10, gold: 5, status: 'pending', submittedAt: Date.now() }];
    for (let i = 0; i < 4; i++) await save('C', f);                       // l'appareil enfant re-synchronise 4 fois
    expect([forDevice(devices.A).length, forDevice(devices.B).length, forDevice(devices.C).length]).toEqual([1, 1, 0]);
  });

  it('le parent valide: l\'enfant reçoit 1 notification, le parent qui valide aucune', async () => {
    const { base, devices, save } = await setup();
    const f = structuredClone(base);
    Object.assign(f.children[0].tasks[0], { done: true, completedAt: Date.now() });
    f.children[0].xp = 10; f.children[0].gold = 105;
    for (let i = 0; i < 3; i++) await save('A', f);
    expect([forDevice(devices.C).length, forDevice(devices.A).length, forDevice(devices.B).length]).toEqual([1, 0, 0]);
  });

  it('une validation périmée ré-envoyée par un appareil en retard ne notifie pas à nouveau', async () => {
    const { base, devices, save } = await setup();
    const validated = structuredClone(base);
    Object.assign(validated.children[0].tasks[0], { done: true, completedAt: 1000000 });
    await save('A', validated);
    await wait();
    const reset = structuredClone(validated);                              // le jour change: la quête est remise à faire
    Object.assign(reset.children[0].tasks[0], { done: false, resetAt: Date.now() });
    const synced = await save('A', reset);
    sent.length = 0;
    const stale = structuredClone(validated); stale.updatedAt = synced.updatedAt;   // appareil en retard: ré-affirme l'ancienne validation
    for (let i = 0; i < 3; i++) await save('B', stale);
    expect(sent.length).toBe(0);
  });

  it('demande d\'achat: les parents sont prévenus une fois; l\'approbation prévient l\'enfant seulement', async () => {
    const { base, devices, save } = await setup();
    const f = structuredClone(base);
    f.requests = [{ id: 'rq1', child: 'Emma', name: 'Pizza', cost: 25, status: 'pending' }];
    for (let i = 0; i < 3; i++) await save('C', f);
    expect([forDevice(devices.A).length, forDevice(devices.B).length, forDevice(devices.C).length]).toEqual([1, 1, 0]);
    expect(forDevice(devices.A)[0].title).not.toMatch(/a acheté/);
    sent.length = 0;
    const ok = structuredClone(f); ok.requests[0].status = 'approved'; ok.children[0].gold = 75;
    for (let i = 0; i < 3; i++) await save('A', ok);
    expect([forDevice(devices.C).length, forDevice(devices.A).length, forDevice(devices.B).length]).toEqual([1, 0, 0]);
  });

  it('le parent ajoute une quête (même nom et XP qu\'une existante): l\'enfant est prévenu une fois', async () => {
    const { base, devices, save } = await setup();
    const f = structuredClone(base);
    f.children[0].tasks.push(task('t2', 'Faire son lit'));
    for (let i = 0; i < 3; i++) await save('A', f);
    expect([forDevice(devices.C).length, forDevice(devices.A).length, forDevice(devices.B).length]).toEqual([1, 0, 0]);
  });

  it('sanction: l\'enfant est prévenu une fois, pas à chaque enregistrement', async () => {
    const { base, devices, save } = await setup();
    const f = structuredClone(base);
    f.children[0].sanctions = [{ motif: 'Retard', gold: 5, date: '2026-10-24T10:00:00.000Z' }]; f.children[0].gold = 95;
    for (let i = 0; i < 4; i++) await save('A', f);
    expect([forDevice(devices.C).length, forDevice(devices.A).length, forDevice(devices.B).length]).toEqual([1, 0, 0]);
  });

  it('proposition de l\'enfant: les parents seulement, une fois', async () => {
    const { base, devices, save } = await setup();
    const f = structuredClone(base);
    f.proposals = [{ id: 'pp1', child: 'Emma', name: 'Piscine', cost: 60, type: 'reward', status: 'pending' }];
    for (let i = 0; i < 3; i++) await save('C', f);
    expect([forDevice(devices.A).length, forDevice(devices.B).length, forDevice(devices.C).length]).toEqual([1, 1, 0]);
  });

  it('note: soumission = parents (une fois chacun), approbation = enfant seulement', async () => {
    const { devices, A, fam } = await setup();
    await api('submitGrade', { familyId: fam, childName: 'Emma', subject: 'Maths', grade: '18/20', gold: 10 });
    expect([forDevice(devices.A).length, forDevice(devices.B).length, forDevice(devices.C).length]).toEqual([1, 1, 0]);
    sent.length = 0;
    const g = (await api('me', {}, A.token)).body.families[0].gradeRequests[0];
    await api('approveGrade', { familyId: fam, gradeId: g.id }, A.token);
    expect([forDevice(devices.C).length, forDevice(devices.A).length, forDevice(devices.B).length]).toEqual([1, 0, 0]);
  });
});

describe('e-mails', () => {
  it('option désactivée: aucun e-mail, quel que soit l\'événement', async () => {
    const { base, save, fam } = await setup({ emailNotifications: false });
    const f = structuredClone(base);
    f.requests = [{ id: 'rq1', child: 'Emma', name: 'Pizza', cost: 25, status: 'pending' }];
    await save('C', f);
    await api('submitGrade', { familyId: fam, childName: 'Emma', subject: 'Maths', grade: '18/20', gold: 10 });
    expect(emails).toEqual([]);
  });

  it('option activée: un e-mail par parent pour un événement destiné aux parents, aucun pour un événement destiné à l\'enfant', async () => {
    const { A, B, base, save } = await setup({ emailNotifications: true });
    const f = structuredClone(base);
    f.children[0].tasks[0].done = true;
    f.taskRequests = [{ id: 'tr1', child: 'Emma', taskIndex: 0, taskName: 'Faire son lit', xp: 10, gold: 5, status: 'pending', submittedAt: Date.now() }];
    await save('C', f);
    expect(emails.map(m => m.to).sort()).toEqual([A.email, B.email].map(e => e.toLowerCase()).sort());
    emails.length = 0;
    const v = structuredClone(f);
    Object.assign(v.children[0].tasks[0], { done: true, completedAt: Date.now() });
    await save('A', v);
    expect(emails).toEqual([]);                                            // « tâche complétée » concerne l'enfant
  });
});

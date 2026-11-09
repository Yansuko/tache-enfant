import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sent = [];
vi.mock('web-push', () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: 'pub', privateKey: 'priv' }),
    sendNotification: async (sub, payload) => { sent.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }); return {}; },
  },
}));

import { api, newParent } from './helpers.js';
import { pendingTasks, reminderPayload } from '../src/reminders.mjs';

const task = (id, name, over = {}) => ({ id, name, xp: 10, gold: 5, frequency: 'daily', done: false, completedAt: null, ...over });
const sub = (n) => ({ endpoint: `https://push.example/${n}-${Math.random().toString(36).slice(2)}`, keys: { p256dh: 'k', auth: 'a' } });
const wait = (ms = 5) => new Promise(r => setTimeout(r, ms));

async function setup() {
  const A = await newParent('rqA');
  A.family.children = [
    { id: 'c-emma', name: 'Emma', xp: 0, gold: 0, pin: '1234', tasks: [task('t1', 'Faire son lit'), task('t2', 'Ranger', { done: true })], grades: [], sanctions: [] },
    { id: 'c-leo', name: 'Léo', xp: 0, gold: 0, pin: '5678', tasks: [task('t3', 'Devoirs')], grades: [], sanctions: [] },
  ];
  await A.save(A.family);
  const kid = async (name, pin) => (await api('unlockChildDirect', { familyName: A.familyName, childName: name, pin })).body.token;
  const emma = { token: await kid('Emma', '1234'), sub: sub('emma') };
  const leo = { token: await kid('Léo', '5678'), sub: sub('leo') };
  const parent = { sub: sub('parent') };
  for (const [d, t] of [[emma, emma.token], [leo, leo.token], [parent, A.token]]) {
    expect((await api('subscribePush', { familyId: A.family.id, subscription: d.sub }, t)).status).toBe(200);
  }
  await wait(); sent.length = 0;
  return { A, emma, leo, parent, fam: A.family.id };
}

describe('pendingTasks / reminderPayload', () => {
  it('pendingTasks garde les quêtes non faites', () => {
    expect(pendingTasks({ tasks: [task('a', 'A'), task('b', 'B', { done: true })] }).map(t => t.id)).toEqual(['a']);
  });
  it('une quête: corps = son nom', () => {
    expect(reminderPayload('Emma', [task('a', 'Faire son lit')])).toEqual({ title: 'Rappel de quête', body: 'Faire son lit', icon: '🔔', badge: '/icon-96.svg', tag: 'reminder', data: { url: '/' } });
  });
  it('plusieurs quêtes: compte et liste', () => {
    expect(reminderPayload('Emma', [task('a', 'A'), task('b', 'B'), task('c', 'C')]).body).toBe('3 quêtes à faire : A, B, C');
  });
});

describe('action remindQuest', () => {
  beforeEach(() => { sent.length = 0; });
  afterEach(() => { vi.useRealTimers(); });

  it('parent: notifie uniquement l\'appareil de cet enfant', async () => {
    const { A, emma, leo, parent, fam } = await setup();
    const r = await api('remindQuest', { familyId: fam, childId: 'c-emma', taskId: 't1' }, A.token);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, sent: 1 });
    await wait();
    expect(sent.map(n => n.endpoint)).toEqual([emma.sub.endpoint]);
    expect(sent[0].body).toContain('Faire son lit');
    expect(sent.some(n => n.endpoint === leo.sub.endpoint || n.endpoint === parent.sub.endpoint)).toBe(false);
  });

  it('jeton enfant -> 403', async () => {
    const { emma, fam } = await setup();
    expect((await api('remindQuest', { familyId: fam, childId: 'c-emma', taskId: 't1' }, emma.token)).status).toBe(403);
  });

  it('parent d\'une autre famille -> 403', async () => {
    const { fam } = await setup();
    const other = await newParent('rqO');
    expect((await api('remindQuest', { familyId: fam, childId: 'c-emma', taskId: 't1' }, other.token)).status).toBe(403);
  });

  it('quête validée -> 409', async () => {
    const { A, fam } = await setup();
    expect((await api('remindQuest', { familyId: fam, childId: 'c-emma', taskId: 't2' }, A.token)).status).toBe(409);
  });

  it('enfant ou quête inconnus -> 404', async () => {
    const { A, fam } = await setup();
    expect((await api('remindQuest', { familyId: fam, childId: 'nope', taskId: 't1' }, A.token)).status).toBe(404);
    expect((await api('remindQuest', { familyId: fam, childId: 'c-emma', taskId: 'nope' }, A.token)).status).toBe(404);
  });

  it('2e appel < 60 s -> 429, puis OK après 60 s', async () => {
    const { A, fam } = await setup();
    vi.useFakeTimers({ toFake: ['Date'] });
    const call = () => api('remindQuest', { familyId: fam, childId: 'c-emma', taskId: 't1' }, A.token);
    expect((await call()).status).toBe(200);
    vi.setSystemTime(Date.now() + 30_000);
    const r = await call();
    expect(r.status).toBe(429);
    expect(r.body.error).toMatch(/^Rappel déjà envoyé/);
    vi.setSystemTime(Date.now() + 31_000);
    expect((await call()).status).toBe(200);
  });

  it('aucun appareil de l\'enfant abonné -> 200 sent:0, sans bloquer un nouvel essai', async () => {
    const { A, fam } = await setup();
    const { store } = await import('../server.js');
    await store.set('push:' + fam, ((await store.get('push:' + fam)) || []).filter(s => !s.email.startsWith('Emma@')));
    const call = () => api('remindQuest', { familyId: fam, childId: 'c-emma', taskId: 't1' }, A.token);
    expect((await call()).body).toEqual({ ok: true, sent: 0 });
    expect((await call()).body).toEqual({ ok: true, sent: 0 });   // pas de 429: rien n'a été envoyé
  });

  it('quête quotidienne validée hier (rollover pas encore fait côté serveur) -> 200', async () => {
    const { A, fam } = await setup();
    const { store } = await import('../server.js');
    const f = await store.get('family:' + fam);
    Object.assign(f.children[0].tasks[1], { done: true, completedAt: Date.now() - 2 * 86400000 });
    await store.set('family:' + fam, f);
    const r = await api('remindQuest', { familyId: fam, childId: 'c-emma', taskId: 't2' }, A.token);
    expect(r.status).toBe(200);
    expect(r.body.sent).toBe(1);
  });
});

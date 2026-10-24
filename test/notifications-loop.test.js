import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, newParent } from './helpers.js';

// Une notification = un appel à sendPush (journal "[PUSH-SEND]"). On compte ce qui part quand les mêmes données sont ré-enregistrées.
const pushLogs = (spy) => spy.mock.calls.map(c => String(c[0])).filter(l => l.includes('[PUSH-SEND]'));

describe('pas de notifications en boucle', () => {
  afterEach(() => vi.restoreAllMocks());

  async function setup() {
    const p = await newParent('notif');
    p.family.children = [{ id: 'c-emma', name: 'Emma', xp: 0, gold: 100, pin: '1234', tasks: [{ id: 't1', name: 'Faire son lit', xp: 10, gold: 5, frequency: 'daily', done: false, completedAt: null }], grades: [], sanctions: [] }];
    const base = await p.save(p.family);
    const u = await api('unlockChildDirect', { familyName: p.familyName, childName: 'Emma', pin: '1234' });
    const childSave = async (f) => (await api('saveFamily', { family: f }, u.body.token)).body.family;
    return { p, base, childSave };
  }

  it('une proposition de récompense notifie une fois, même si elle est ré-enregistrée par l\'enfant et le parent', async () => {
    const { p, base, childSave } = await setup();
    const spy = vi.spyOn(console, 'log');
    const withProposal = structuredClone(base);
    withProposal.proposals = [{ id: 'pp1', child: 'Emma', name: 'Piscine', cost: 60, status: 'pending' }];
    for (let i = 0; i < 4; i++) await childSave(withProposal);
    let parentView = (await p.me())[0];
    for (let i = 0; i < 4; i++) parentView = await p.save(parentView);
    expect(pushLogs(spy).length).toBe(1);
  });

  it('une quête cochée notifie une fois, pas à chaque synchro', async () => {
    const { p, base, childSave } = await setup();
    const spy = vi.spyOn(console, 'log');
    const checked = structuredClone(base);
    checked.children[0].tasks[0].done = true;
    checked.taskRequests = [{ id: 'tr1', child: 'Emma', taskIndex: 0, taskName: 'Faire son lit', xp: 10, gold: 5, status: 'pending', submittedAt: Date.now() }];
    for (let i = 0; i < 4; i++) await childSave(checked);
    let parentView = (await p.me())[0];
    for (let i = 0; i < 4; i++) parentView = await p.save(parentView);
    expect(pushLogs(spy).length).toBeLessThanOrEqual(1);
  });

  it('une approbation notifie l\'enfant une fois', async () => {
    const { p, base } = await setup();
    const withReq = structuredClone(base);
    withReq.requests = [{ id: 'rq1', child: 'Emma', name: 'Pizza', cost: 25, status: 'pending' }];
    let f = await p.save(withReq);
    const spy = vi.spyOn(console, 'log');
    f.requests[0].status = 'approved';
    for (let i = 0; i < 4; i++) f = await p.save(f);
    expect(pushLogs(spy).length).toBeLessThanOrEqual(1);
  });
});

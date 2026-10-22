// node test/stats-api.test.mjs — getGradeStats / getRewardStats / getSanctionStats on an in-memory store
import assert from 'node:assert';
import { handleApi } from '../netlify/functions/_core.mjs';

const mem = new Map();
const store = {
  get: async k => (mem.has(k) ? structuredClone(mem.get(k)) : null),
  set: async (k, v) => { mem.set(k, structuredClone(v)); },
  del: async k => { mem.delete(k); },
  list: async () => [...mem.keys()],
};

const login = await handleApi({ action: 'login', body: { email: 'parent@demo.fr', password: 'demo' } }, store);
assert.strictEqual(login.status, 200, JSON.stringify(login.body));
const token = login.body.token;
const call = (action, body) => handleApi({ action, token, body }, store);

// Add dated records next to the undated seed data
const fam = await store.get('family:fam-demo');
const emma = fam.children.find(c => c.name === 'Emma');
emma.grades.push({ subject: 'Mathématiques', grade: '18/20', xp: 60, gold: 12, date: '2026-10-20T10:00:00Z' });
emma.sanctions.push({ motif: 'Devoirs non faits', date: '2026-10-19T10:00:00Z' }); // gold from sanctionsList
fam.requests.push({ child: 'Emma', name: '30 min de jeu vidéo', cost: 50, status: 'approved', approvedAt: Date.parse('2026-10-18T10:00:00Z') });
fam.gradeRequests.push({ id: 'g1', child: 'Lucas', subject: 'Français', grade: '8/20', gold: 2, status: 'approved', approvedAt: Date.parse('2026-10-15T10:00:00Z') });
fam.gradeRequests.push({ id: 'g2', child: 'Lucas', subject: 'Français', grade: '9/20', gold: 0, status: 'pending' });
await store.set('family:fam-demo', fam);

// No date filter: undated seed records included
let r = await call('getGradeStats', { familyId: 'fam-demo' });
assert.strictEqual(r.status, 200);
assert.strictEqual(r.body.grades.length, 4); // 16, 13 (undated), 18 (Emma), 8 (Lucas approved); empty + pending skipped
assert.strictEqual(r.body.bySubject['Mathématiques'].count, 2);
assert.strictEqual(r.body.bySubject['Mathématiques'].avg, '17');
assert.deepStrictEqual(r.body.byDay['2026-10-20'], { count: 1, subjects: ['Mathématiques'] });
assert.strictEqual(r.body.totalXP, 50 + 30 + 60);
assert.strictEqual(r.body.totalGold, 10 + 5 + 12 + 2);
assert.ok(['improving', 'stable', 'declining'].includes(r.body.trend));

// Explicit range + childId: only dated records in range for that child
r = await call('getGradeStats', { familyId: 'fam-demo', childId: 'child-emma-demo', startDate: '2026-10-01', endDate: '2026-10-21' });
assert.strictEqual(r.body.grades.length, 1);
assert.strictEqual(r.body.grades[0].date, '2026-10-20');
r = await call('getGradeStats', { familyId: 'fam-demo', startDate: '2026-10-16', endDate: '2026-10-21' });
assert.strictEqual(r.body.grades.length, 1); // Lucas's 2026-10-15 excluded

r = await call('getRewardStats', { familyId: 'fam-demo' });
assert.strictEqual(r.status, 200);
assert.strictEqual(r.body.purchases.length, 2); // seed "Sortie cinéma" (undated) + dated one; pending skipped
assert.strictEqual(r.body.totalSpent, 90);
assert.strictEqual(r.body.avgCost, 45);
assert.strictEqual(r.body.byReward['30 min de jeu vidéo'].lastPurchase, '2026-10-18');
assert.ok(r.body.frequency.perMonth >= 0 && r.body.frequency.perWeek >= 0);
r = await call('getRewardStats', { familyId: 'fam-demo', startDate: '2026-10-18', endDate: '2026-10-18' });
assert.strictEqual(r.body.purchases.length, 1);
assert.strictEqual(r.body.mostPopular, '30 min de jeu vidéo');
assert.strictEqual(r.body.frequency.perWeek, 7); // 1 purchase over 1 day

r = await call('getSanctionStats', { familyId: 'fam-demo' });
assert.strictEqual(r.status, 200);
assert.strictEqual(r.body.totalCount, 2);
assert.strictEqual(r.body.totalGoldLost, 15); // 10 + 5 looked up from sanctionsList
assert.strictEqual(r.body.avgGoldPerSanction, 7.5);
assert.deepStrictEqual(r.body.byMotif['Devoirs non faits'], { count: 1, totalGold: 5 });
r = await call('getSanctionStats', { familyId: 'fam-demo', childId: 'child-lucas-demo' });
assert.deepStrictEqual([r.body.totalCount, r.body.mostCommon, r.body.avgGoldPerSanction], [0, null, 0]);

// Edge cases
assert.strictEqual((await call('getGradeStats', {})).status, 400);
assert.strictEqual((await call('getGradeStats', { familyId: 'nope' })).status, 404);
assert.strictEqual((await call('getGradeStats', { familyId: 'fam-demo', childId: 'nope' })).status, 404);
assert.strictEqual((await call('getGradeStats', { familyId: 'fam-demo', startDate: '21/10/2026' })).status, 400);
assert.strictEqual((await call('getGradeStats', { familyId: 'fam-demo', startDate: '2026-10-21', endDate: '2026-10-01' })).status, 400);
await store.set('family:fam-other', { id: 'fam-other', members: ['someone@else.fr'], children: [] });
assert.strictEqual((await call('getSanctionStats', { familyId: 'fam-other' })).status, 403);
assert.strictEqual((await handleApi({ action: 'getRewardStats', token: 'bad', body: { familyId: 'fam-demo' } }, store)).status, 401);

// saveFamily dates newly approved reward requests (= purchases), keeps known dates, no duplicate records
const save = async f => (await call('saveFamily', { family: f })).body.family;
let f = await store.get('family:fam-demo');
const before = f.requests.length;
f.requests.push({ child: 'Lucas', name: 'Glace', cost: 7, status: 'pending' }); // no rewardId, not in catalog
f = await save(f);
assert.strictEqual(f.requests.at(-1).approvedAt, undefined); // pending: not a purchase
f.requests.at(-1).status = 'approved';
f.requests.push({ child: 'Lucas', name: 'Glace', status: 'approved' }); // same reward twice, no cost
f = await save(f);
const [p1, p2] = f.requests.slice(-2);
assert.ok(p1.approvedAt > 0 && p2.approvedAt > 0);
const datedEmma = f.requests.find(r => r.child === 'Emma' && r.approvedAt === Date.parse('2026-10-18T10:00:00Z'));
assert.ok(datedEmma); // existing date untouched
delete p1.approvedAt; // client lost the date: restored from store, not re-stamped
const t1 = (await store.get('family:fam-demo')).requests.at(-2).approvedAt;
f = await save(f);
assert.strictEqual(f.requests.at(-2).approvedAt, t1);
assert.strictEqual(f.requests.length, before + 2);
const today = new Date().toISOString().slice(0, 10);
r = await call('getRewardStats', { familyId: 'fam-demo', childId: 'child-lucas-demo', startDate: today, endDate: today });
assert.strictEqual(r.body.purchases.length, 2);
assert.strictEqual(r.body.totalSpent, 7); // missing cost counts as 0

// Stale parent page: saveFamily merges requests by id, doesn't erase the ones it never saw
const stale = await store.get('family:fam-demo');
f = await store.get('family:fam-demo');
f.gradeRequests.push({ id: 'g3', child: 'Emma', subject: 'Anglais', grade: '15/20', gold: 5, status: 'approved' });
f.taskRequests.push({ id: 't1', child: 'Emma', taskName: 'Ranger', status: 'pending' });
await save(f);
stale.gradeRequests.push({ id: 'g4', child: 'Lucas', subject: 'Histoire', grade: '12/20', gold: 0, status: 'pending' });
f = await save(stale);
assert.strictEqual(f.gradeRequests.find(g => g.id === 'g3')?.status, 'approved');
assert.strictEqual(f.gradeRequests.find(g => g.id === 'g4')?.status, 'pending');
assert.ok(f.taskRequests.some(t => t.id === 't1'));

// Firebase token: email resolved from uid, so the members check passes (was 403)
auth.verifyIdToken = async t => { if (t !== 'fb-token') throw new Error('bad'); return { uid: 'uid-parent-demo' }; };
auth.getUser = async uid => ({ uid, email: uid === 'uid-parent-demo' ? 'Parent@demo.fr' : null });
r = await handleApi({ action: 'getGradeStats', token: 'fb-token', body: { familyId: 'fam-demo' } }, store);
assert.strictEqual(r.status, 200, JSON.stringify(r.body));
assert.strictEqual((await handleApi({ action: 'getGradeStats', token: 'fb-token', body: { familyId: 'fam-other' } }, store)).status, 403);

console.log('stats-api: all assertions passed');
process.exit(0); // firebase-admin keeps handles open

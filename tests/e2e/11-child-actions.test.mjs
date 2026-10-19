// tests/e2e/11-child-actions.test.mjs
// Child-mode actions, mirroring tache-enfant/index.html handlers on the Firebase family document.
import assert from 'assert';
import { withFamily, mkChild, mkTask, uniq, childLogin, levelFor, runAll } from './framework.mjs';

const DAY = 86400000;
const GLACE = { icon: '🍦', name: 'Glace', cost: 50, lvl: 1 };
const CINE = { icon: '🎬', name: 'Cinéma', cost: 100, lvl: 1 };
const VELO = { icon: '🚴', name: 'Vélo', cost: 10, lvl: 3 };

const toggle = (c, i) => {
  const t = c.tasks[i], s = t.done ? -1 : 1;
  t.done = !t.done; t.completedAt = t.done ? Date.now() : null;
  c.xp += s * t.xp; c.gold += s * t.gold;
};
// Shop button logic of screenRecompenses
const shopButton = (c, r, requests) =>
  r.lvl > levelFor(c.xp) ? 'locked'
    : r.cost > c.gold ? 'insufficient'
      : requests.some(q => q.child === c.name && q.name === r.name && q.status === 'pending') ? 'pending'
        : 'buy';
const request = (f, c, r) => {
  if (shopButton(c, r, f.requests) !== 'buy') return false;
  f.requests.push({ child: c.name, icon: r.icon, name: r.name, cost: r.cost, status: 'pending' });
  return true;
};
const isPin = p => /^\d{4}$/.test(p);

const withAlice = (title, extra, fn, family = {}) =>
  withFamily(title, { children: [mkChild('Alice', extra), mkChild('Bob', { pin: '9999' })], rewards: [GLACE, CINE, VELO], ...family }, fn);

export const test111CreatePIN = () =>
  withAlice('11.1 Create child PIN', {}, async ({ get, update }) => {
    assert.strictEqual((await get()).children[0].pin, undefined, 'no PIN before first access');
    const [pin, confirm] = ['1234', '1234'];
    assert.ok(isPin(pin) && pin === confirm);
    await update(f => { f.children[0].pin = pin; });
    const f = await get();
    assert.strictEqual(f.children[0].pin, '1234');
    assert.strictEqual(childLogin(f, 'Alice', '1234')?.id, f.children[0].id);
  });

export const test112LoginWithPIN = () =>
  withAlice('11.2 Login with PIN', { pin: '1234' }, async ({ get }) => {
    const f = await get();
    assert.strictEqual(childLogin(f, 'Alice', '1234').name, 'Alice');
    assert.strictEqual(childLogin(f, 'Alice', '0000'), null);
    assert.strictEqual(childLogin(f, 'Alice', '9999'), null, "Bob's PIN doesn't open Alice");
  });

export const test113ValidateTask = () =>
  withAlice('11.3 Validate task (child view)', { xp: 80, tasks: [mkTask()] }, async ({ get, update }) => {
    await update(f => toggle(f.children[0], 0));
    const [a] = (await get()).children;
    assert.strictEqual(a.tasks[0].done, true);
    assert.ok(a.tasks[0].completedAt > 0);
    assert.deepStrictEqual([a.xp, a.gold], [130, 25]);
    assert.strictEqual(levelFor(a.xp), 2, 'level recalculated');
  });

export const test114CancelTask = () =>
  withAlice('11.4 Cancel task (child view)', { tasks: [mkTask()] }, async ({ get, update }) => {
    await update(f => toggle(f.children[0], 0));
    await update(f => toggle(f.children[0], 0));
    const [a] = (await get()).children;
    assert.strictEqual(a.tasks[0].done, false);
    assert.strictEqual(a.tasks[0].completedAt, undefined, 'completedAt cleared (null is not stored)');
    assert.deepStrictEqual([a.xp, a.gold], [0, 0]);
  });

export const test115ViewShop = () =>
  withAlice('11.5 View shop', { gold: 60 }, async ({ get }) => {
    const f = await get();
    assert.deepStrictEqual(f.rewards.map(r => [r.name, r.cost]), [['Glace', 50], ['Cinéma', 100], ['Vélo', 10]]);
    assert.deepStrictEqual(f.rewards.map(r => shopButton(f.children[0], r, f.requests)), ['buy', 'insufficient', 'locked']);
  });

export const test116RequestReward = () =>
  withAlice('11.6 Request reward (child view)', { gold: 50 }, async ({ get, update }) => {
    await update(f => assert.ok(request(f, f.children[0], f.rewards[0])));
    const f = await get();
    assert.deepStrictEqual(f.requests, [{ child: 'Alice', icon: '🍦', name: 'Glace', cost: 50, status: 'pending' }]);
    assert.strictEqual(shopButton(f.children[0], f.rewards[0], f.requests), 'pending', 'cannot order twice');
  });

export const test117InsufficientCoins = () =>
  withAlice('11.7 Request with insufficient coins', { gold: 50 }, async ({ get, update }) => {
    await update(f => assert.strictEqual(request(f, f.children[0], f.rewards[1]), false));
    const f = await get();
    assert.strictEqual(f.requests.length, 0, 'no request created');
    assert.strictEqual(f.children[0].gold, 50, 'no coins deducted');
  });

export const test118ViewProfile = () =>
  withAlice('11.8 View profile', { xp: 250, gold: 40, pin: '1234' }, async ({ get }) => {
    const me = childLogin(await get(), 'Alice', '1234');
    assert.deepStrictEqual([me.name, me.xp, me.gold, levelFor(me.xp), me.xp % 100], ['Alice', 250, 40, 3, 50]);
  });

export const test119ChangePIN = () =>
  withAlice('11.9 Change PIN', { pin: '1234' }, async ({ get, update }) => {
    assert.ok(childLogin(await get(), 'Alice', '1234'), 'old PIN checked first');
    await update(f => { f.children[0].pin = '5678'; });
    const f = await get();
    assert.strictEqual(childLogin(f, 'Alice', '1234'), null, 'old PIN no longer works');
    assert.ok(childLogin(f, 'Alice', '5678'), 'new PIN works');
  });

export const test1110Logout = () =>
  withAlice('11.10 Logout (child mode)', { pin: '1234' }, async ({ get }) => {
    // child session lives only in memory (`unlocked` Set): nothing session-like may be stored in Firebase
    const [a] = (await get()).children;
    for (const k of ['session', 'token', 'unlocked', 'loggedIn']) assert.ok(!(k in a), `child.${k} must not be persisted`);
  });

export const test1111ViewProgress = () =>
  withAlice('11.11 Progress to next level', { xp: 80, tasks: [mkTask()] }, async ({ get, update }) => {
    await update(f => toggle(f.children[0], 0));
    const [a] = (await get()).children;
    assert.deepStrictEqual([levelFor(80), levelFor(a.xp)], [1, 2], 'level up detected');
    assert.strictEqual(a.xp % 100, 30, 'progress bar = 30/100 toward level 3');
  });

export const test1112ViewTaskHistory = () => {
  const now = Date.now();
  const tasks = [
    mkTask('Lit', { done: true, daily: true, completedAt: now - 2 * DAY }),
    mkTask('Devoirs', { done: true, completedAt: now }),
    mkTask('Table', { done: true, completedAt: now - DAY }),
    mkTask('Chien')
  ];
  return withAlice('11.12 Task history', { tasks }, async ({ get }) => {
    const [a] = (await get()).children;
    const history = a.tasks.filter(t => t.done).sort((x, y) => y.completedAt - x.completedAt);
    assert.deepStrictEqual(history.map(t => t.name), ['Devoirs', 'Table', 'Lit'], 'sorted newest first');
    const days = new Set(history.map(t => new Date(t.completedAt).toDateString()));
    assert.strictEqual(days.size, 3, 'grouped by day');
    assert.strictEqual(history.find(t => t.name === 'Lit').daily, true, 'daily tasks flagged');
  });
};

export const test1113RewardNotification = () =>
  withAlice('11.13 Reward approved notification', { gold: 50 }, async ({ get, update }) => {
    await update(f => request(f, f.children[0], f.rewards[0]));
    await update(f => { const q = f.requests[0]; f.children[0].gold -= q.cost; q.status = 'approved'; }); // parent
    const f = await get();
    const mine = f.requests.filter(q => q.child === 'Alice');
    assert.deepStrictEqual(mine.map(q => [q.name, q.status]), [['Glace', 'approved']]);
    assert.strictEqual(f.children[0].gold, 0);
  });

export const test1114AddNote = () =>
  withAlice('11.14 Child adds personal note', {}, async ({ get, update }) => {
    await update(f => f.children[0].notes.push({ id: `note-${uniq()}`, text: "J'ai réussi mes devoirs de maths!", author: 'child', createdAt: Date.now() }));
    const [a, b] = (await get()).children; // re-read = "after reconnect"
    assert.strictEqual(a.notes[0].text, "J'ai réussi mes devoirs de maths!");
    assert.strictEqual(a.notes[0].author, 'child');
    assert.ok(a.notes[0].createdAt > 0);
    assert.strictEqual(b.notes.length, 0);
  });

export const test1115ViewStats = () =>
  withAlice('11.15 Child personal stats', {
    xp: 100, gold: 20, sanctions: [{ motif: 'Croix de conduite', gold: 10 }],
    tasks: [mkTask('A', { done: true, completedAt: Date.now() }), mkTask('B', { done: true, completedAt: Date.now() }), mkTask('C')]
  }, async ({ get }) => {
    const f = await get();
    const a = f.children[0];
    const done = a.tasks.filter(t => t.done);
    assert.strictEqual(done.length, 2);
    assert.strictEqual(done.reduce((s, t) => s + t.gold, 0), 50, 'coins earned from tasks');
    assert.strictEqual(a.sanctions.reduce((s, x) => s + x.gold, 0), 10, 'malus');
    assert.strictEqual(f.requests.filter(q => q.child === 'Alice' && q.status === 'approved').length, 1);
  }, { requests: [{ child: 'Alice', name: 'Glace', cost: 50, status: 'approved' }, { child: 'Bob', name: 'Glace', cost: 50, status: 'approved' }] });

export const runChildActionTests = () => runAll('🧒 CHILD ACTION TESTS', [
  test111CreatePIN, test112LoginWithPIN, test113ValidateTask, test114CancelTask, test115ViewShop,
  test116RequestReward, test117InsufficientCoins, test118ViewProfile, test119ChangePIN, test1110Logout,
  test1111ViewProgress, test1112ViewTaskHistory, test1113RewardNotification, test1114AddNote, test1115ViewStats
]);

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit((await runChildActionTests()) ? 0 : 1);
}

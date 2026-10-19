// tests/e2e/12-statistics.test.mjs
// Statistics are derived from the Firebase family document; each test seeds known data and checks the derivation.
import assert from 'assert';
import { db, withFamily, mkChild, mkTask, childLogin, levelFor, defaultLevelConfig, runAll } from './framework.mjs';

const DAY = 86400000, MIN = 60000;
const NOW = Date.now();
const doneTask = (name, ago, extra = {}) => mkTask(name, { done: true, completedAt: NOW - ago, ...extra });

function stats(child, requests, since = 0) {
  const done = child.tasks.filter(t => t.done && t.completedAt >= since).sort((a, b) => b.completedAt - a.completedAt);
  const rewards = requests.filter(q => q.child === child.name && q.status === 'approved');
  return {
    level: levelFor(child.xp), tasksDone: done.length, done, rewards,
    xpEarned: done.reduce((s, t) => s + t.xp, 0),
    goldEarned: done.reduce((s, t) => s + t.gold, 0),
    goldSpent: rewards.reduce((s, q) => s + q.cost, 0)
  };
}

// Emma: 5 done tasks (one undone) over the past week, 1 approved + 1 refused + 1 pending reward
const emmaTasks = () => [
  doneTask('Ranger', 0), doneTask('Devoirs', DAY), doneTask('Table', 2 * DAY),
  doneTask('Chien', 3 * DAY), doneTask('Lit', 6 * DAY, { daily: true }), mkTask('Vaisselle')
];
const emmaRequests = () => [
  { child: 'Emma', name: 'Glace', cost: 50, status: 'approved', approvedAt: NOW - DAY / 2 },
  { child: 'Emma', name: 'Cinéma', cost: 100, status: 'refused' },
  { child: 'Emma', name: 'Pizza', cost: 30, status: 'pending' },
  { child: 'Lucas', name: 'Glace', cost: 50, status: 'approved', approvedAt: NOW }
];
// xp/gold consistent with the data: 5 × 50 XP, 5 × 25 gold − 50 spent
const seed = () => ({
  children: [
    mkChild('Emma', { xp: 250, gold: 75, pin: '1111', tasks: emmaTasks() }),
    mkChild('Lucas', { xp: 50, gold: 0, tasks: [doneTask('Lit', DAY)] }),
    mkChild('Léa', { xp: 0, gold: 0 })
  ],
  requests: emmaRequests(),
  levelConfig: defaultLevelConfig()
});

export const test121ViewChildStats = () =>
  withFamily('12.1 Child stats (parent)', seed(), async ({ get }) => {
    const f = await get();
    const emma = f.children[0], s = stats(emma, f.requests);
    assert.strictEqual(s.tasksDone, 5);
    assert.strictEqual(s.xpEarned, emma.xp, 'XP = Σ done tasks XP');
    assert.strictEqual(s.goldEarned - s.goldSpent, emma.gold, 'gold = Σ done tasks gold − approved rewards');
    assert.strictEqual(s.rewards.length, 1);
    assert.strictEqual(s.level, 3);
  });

export const test122FilterByPeriod = () =>
  withFamily('12.2 Filter stats by period', {
    children: [mkChild('Emma', { tasks: [doneTask('a', 0), doneTask('b', 5 * DAY), doneTask('c', 20 * DAY), doneTask('d', 40 * DAY)] })]
  }, async ({ get }) => {
    const [emma] = (await get()).children;
    const count = days => stats(emma, [], days ? NOW - days * DAY : 0);
    assert.deepStrictEqual([count(7).tasksDone, count(30).tasksDone, count(0).tasksDone], [2, 3, 4]);
    assert.strictEqual(count(7).xpEarned, 100);
    assert.ok(count(7).done.every(t => t.completedAt >= NOW - 7 * DAY));
  });

export const test123ViewTasksList = () =>
  withFamily('12.3 Validated tasks list', seed(), async ({ get }) => {
    const { done, xpEarned, goldEarned } = stats((await get()).children[0], []);
    assert.deepStrictEqual(done.map(t => t.name), ['Ranger', 'Devoirs', 'Table', 'Chien', 'Lit'], 'newest first, done only');
    assert.ok(done.every(t => t.xp === 50 && t.gold === 25 && t.completedAt > 0));
    assert.deepStrictEqual([xpEarned, goldEarned], [250, 125], 'totals row');
  });

export const test124CompareChildren = () =>
  withFamily('12.4 Compare children', seed(), async ({ get }) => {
    const f = await get();
    const table = f.children.map(c => ({ name: c.name, ...stats(c, f.requests) })).sort((a, b) => b.level - a.level);
    assert.deepStrictEqual(table.map(r => [r.name, r.level, r.tasksDone]), [['Emma', 3, 5], ['Lucas', 1, 1], ['Léa', 1, 0]]);
  });

export const test125ViewRewardsObtained = () =>
  withFamily('12.5 Rewards obtained per child', seed(), async ({ get }) => {
    const f = await get();
    const { rewards, goldSpent } = stats(f.children[0], f.requests);
    assert.deepStrictEqual(rewards.map(q => [q.name, q.cost]), [['Glace', 50]], 'approved only, own only');
    assert.ok(rewards[0].approvedAt > 0);
    assert.strictEqual(goldSpent, 50);
  });

export const test126XPProgressionGraph = () =>
  withFamily('12.6 XP progression graph', seed(), async ({ get }) => {
    const emma = (await get()).children[0];
    const perDay = new Map();
    for (const t of stats(emma, []).done.reverse()) {
      const d = new Date(t.completedAt).toISOString().slice(0, 10);
      perDay.set(d, (perDay.get(d) || 0) + t.xp);
    }
    let total = 0;
    const curve = [...perDay].map(([day, xp]) => [day, (total += xp)]);
    assert.ok(curve.every(([d], i) => !i || d > curve[i - 1][0]), 'days in order');
    assert.ok(curve.every(([, xp], i) => !i || xp >= curve[i - 1][1]), 'cumulative curve never decreases');
    assert.strictEqual(curve.at(-1)[1], emma.xp);
  });

export const test127AverageTimePerTask = () =>
  withFamily('12.7 Average time per task', {
    children: [mkChild('Emma', { tasks: [doneTask('a', 0), doneTask('b', 45 * MIN), doneTask('c', 90 * MIN)] })]
  }, async ({ get }) => {
    const { done } = stats((await get()).children[0], []);
    const avgMin = (done[0].completedAt - done.at(-1).completedAt) / done.length / MIN;
    assert.strictEqual(avgMin, 30);
  });

export const test128ExportStats = () =>
  withFamily('12.8 Export stats (CSV)', seed(), async ({ get }) => {
    const f = await get();
    const emma = f.children[0], s = stats(emma, f.requests);
    const filename = `${emma.name.toLowerCase()}-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    const csv = [
      'type,name,date,xp,gold',
      `summary,level ${s.level},,${emma.xp},${emma.gold}`,
      ...s.done.map(t => `task,${t.name},${new Date(t.completedAt).toISOString()},${t.xp},${t.gold}`),
      ...s.rewards.map(q => `reward,${q.name},${new Date(q.approvedAt).toISOString()},0,-${q.cost}`)
    ].join('\n');
    assert.match(filename, /^emma-stats-\d{4}-\d{2}-\d{2}\.csv$/);
    const rows = csv.split('\n').slice(1).map(l => l.split(','));
    assert.strictEqual(rows.filter(r => r[0] === 'task').length, 5);
    assert.strictEqual(rows.filter(r => r[0] === 'reward').length, 1);
    assert.strictEqual(rows.slice(1).reduce((sum, r) => sum + Number(r[4]), 0), emma.gold, 'CSV rows add up to the balance');
  });

export const test129CoherenceXPParentChild = () =>
  withFamily('12.9 XP coherence parent/child', seed(), async ({ familyId, get }) => {
    const parent = (await get()).children[0];
    const child = childLogin(await get(), 'Emma', '1111');
    const raw = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
    for (const k of ['xp', 'gold']) assert.ok(parent[k] === child[k] && child[k] === raw[k], `${k} differs`);
    assert.strictEqual(levelFor(parent.xp), levelFor(child.xp));
  });

export const test1210FullHistory = () =>
  withFamily('12.10 Full transaction history', seed(), async ({ get }) => {
    const f = await get();
    const emma = f.children[0], s = stats(emma, f.requests);
    const events = [
      ...s.done.map(t => ({ at: t.completedAt, gold: t.gold, xp: t.xp })),
      ...s.rewards.map(q => ({ at: q.approvedAt, gold: -q.cost, xp: 0 }))
    ].sort((a, b) => b.at - a.at);
    assert.strictEqual(events.length, 6);
    assert.ok(events.every((e, i) => !i || e.at <= events[i - 1].at), 'newest first');
    // replay oldest→newest: running balance must land on the stored balance and never go negative
    let gold = 0;
    for (const e of [...events].reverse()) { gold += e.gold; assert.ok(gold >= 0, 'negative intermediate balance'); }
    assert.strictEqual(gold, emma.gold);
  });

export const test1211VerifyFirebaseData = () =>
  withFamily('12.11 Raw Firebase structure', {
    children: [mkChild('Emma', { xp: 50, gold: 25, tasks: [mkTask('a', { done: true }), mkTask('b')], notes: [{ text: 'n', createdAt: NOW }] })]
  }, async ({ familyId }) => {
    const c = (await db.ref(`families/${familyId}/children/0`).once('value')).val(); // un-normalized on purpose
    assert.strictEqual(typeof c.xp, 'number');
    assert.strictEqual(typeof c.gold, 'number');
    assert.ok(Array.isArray(c.tasks), 'tasks stored as array');
    assert.ok(Array.isArray(c.notes), 'notes stored as array');
    for (const t of c.tasks) for (const k of ['id', 'name', 'xp', 'gold', 'done', 'daily', 'createdAt']) assert.ok(k in t, `task missing ${k}`);
    assert.strictEqual(new Set(c.tasks.map(t => t.id)).size, c.tasks.length, 'no duplicate tasks');
  });

export const test1212LevelConsistency = () =>
  withFamily('12.12 Level consistency with config', seed(), async ({ familyId }) => {
    const { levels } = (await db.ref(`levelConfigs/${familyId}`).once('value')).val();
    // xpRequired = cumulative XP needed to leave that level
    const fromConfig = xp => 1 + levels.filter(l => xp >= l.xpRequired).length;
    for (const xp of [0, 99, 100, 250, 999, 4999]) assert.strictEqual(fromConfig(xp), levelFor(xp), `xp=${xp}`);
    assert.strictEqual(levelFor(250), 3);
  });

export const test1213RewardIntegrity = () =>
  withFamily('12.13 Reward integrity', { children: [mkChild('Emma', { xp: 150, gold: 75 })] }, async ({ get, update }) => {
    // parent approves 2 and refuses 1, exactly like the app's approve/refuse handlers
    await update(f => {
      f.requests = [['Glace', 20], ['Cinéma', 30], ['Vélo', 100]].map(([name, cost]) => ({ child: 'Emma', name, cost, status: 'pending' }));
    });
    await update(f => {
      for (const q of f.requests.slice(0, 2)) { f.children[0].gold = Math.max(0, f.children[0].gold - q.cost); q.status = 'approved'; }
      f.requests[2].status = 'refused';
    });
    const f = await get();
    const spent = f.requests.filter(q => q.status === 'approved').reduce((s, q) => s + q.cost, 0);
    assert.strictEqual(spent, 50);
    assert.strictEqual(f.children[0].gold, 75 - spent, 'remaining = gained − spent; refused costs nothing');
  });

export const test1214BenchmarkHeavyLoad = () =>
  withFamily('12.14 Benchmark: 100 validated tasks', {
    children: [mkChild('Emma', { tasks: Array.from({ length: 100 }, (_, i) => mkTask(`t${i}`, { xp: 10, gold: 5 })) })]
  }, async ({ get, update }) => {
    await update(f => {
      const c = f.children[0];
      c.tasks.forEach((t, i) => { t.done = true; t.completedAt = NOW - i * MIN; c.xp += t.xp; c.gold += t.gold; });
    });
    const start = performance.now();
    const emma = (await get()).children[0];
    const s = stats(emma, []);
    const ms = performance.now() - start;
    assert.deepStrictEqual([s.tasksDone, s.xpEarned, s.goldEarned, emma.xp, emma.gold, s.level], [100, 1000, 500, 1000, 500, 11]);
    assert.ok(ms < 1000, `stats load took ${ms.toFixed(0)}ms`);
    console.log(`   load+compute: ${ms.toFixed(0)}ms`);
  });

export const test1215OrphanedData = async () => {
  let ids;
  const ok = await withFamily('12.15 No orphaned data', seed(), async ({ uid, familyId, get, update }) => {
    ids = { uid, familyId };
    // delete Emma the way del-child does: splice child + drop her requests
    await update(f => {
      const i = f.children.findIndex(c => c.name === 'Emma');
      f.children.splice(i, 1);
      f.requests = f.requests.filter(r => r.child !== 'Emma');
    });
    const f = await get();
    const names = new Set(f.children.map(c => c.name));
    assert.ok(f.requests.every(r => names.has(r.child)), 'request pointing to a deleted child');
    assert.deepStrictEqual(f.requests.map(r => r.child), ['Lucas']);
  });
  if (!ok) return false;
  // and the fixture itself leaves nothing behind
  const leftovers = [];
  for (const p of [`families/${ids.familyId}`, `levelConfigs/${ids.familyId}`, `users/${ids.uid}`]) {
    if ((await db.ref(p).once('value')).exists()) leftovers.push(p);
  }
  if (leftovers.length) console.log(`❌ 12.15 cleanup left data: ${leftovers.join(', ')}`);
  return !leftovers.length;
};

export const runStatisticsTests = () => runAll('📊 STATISTICS TESTS', [
  test121ViewChildStats, test122FilterByPeriod, test123ViewTasksList, test124CompareChildren, test125ViewRewardsObtained,
  test126XPProgressionGraph, test127AverageTimePerTask, test128ExportStats, test129CoherenceXPParentChild, test1210FullHistory,
  test1211VerifyFirebaseData, test1212LevelConsistency, test1213RewardIntegrity, test1214BenchmarkHeavyLoad, test1215OrphanedData
]);

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit((await runStatisticsTests()) ? 0 : 1);
}

// tests/e2e/05-rewards.test.mjs
// Mirrors the app's handlers in tache-enfant/index.html: request-reward pushes a pending request,
// approve deducts gold (floored at 0) and marks 'approved', refuse marks 'refused' (no gold moved),
// del-reward splices families/{id}/rewards.
import assert from 'assert';
import { withFamily, mkChild, runAll } from './framework.mjs';

const GLACE = { icon: '🍦', name: 'Glace', cost: 50, lvl: 1 };
const CINE = { icon: '🎬', name: 'Cinéma', cost: 100, lvl: 2 };
const seed = () => ({ children: [mkChild('Alice', { gold: 80 })], rewards: [GLACE, CINE] });
const request = (f, child, r) => f.requests.push({ child, icon: r.icon, name: r.name, cost: r.cost, status: 'pending' });

export const test51AddReward = () =>
  withFamily('5.1 Add reward', { children: [mkChild('Alice')] }, async ({ get, update }) => {
    await update(f => f.rewards.push(GLACE));
    const { rewards } = await get();
    assert.strictEqual(rewards.length, 1);
    assert.deepStrictEqual(rewards[0], GLACE);
  });

export const test52RequestReward = () =>
  withFamily('5.2 Request reward (child)', seed(), async ({ get, update }) => {
    await update(f => request(f, 'Alice', f.rewards[0]));
    const f = await get();
    assert.strictEqual(f.requests.length, 1);
    assert.strictEqual(f.requests[0].status, 'pending');
    assert.strictEqual(f.requests[0].child, 'Alice');
    assert.strictEqual(f.requests[0].cost, 50);
    assert.strictEqual(f.children[0].gold, 80, 'gold only moves on approval');
  });

export const test53ApproveReward = () =>
  withFamily('5.3 Approve reward (parent)', seed(), async ({ get, update }) => {
    await update(f => request(f, 'Alice', f.rewards[0]));
    await update(f => {
      const q = f.requests[0];
      const c = f.children.find(c => c.name === q.child);
      c.gold = Math.max(0, c.gold - q.cost);
      q.status = 'approved';
    });
    const f = await get();
    assert.strictEqual(f.requests[0].status, 'approved');
    assert.strictEqual(f.children[0].gold, 30);
  });

export const test54RejectReward = () =>
  withFamily('5.4 Reject reward (child keeps coins)', seed(), async ({ get, update }) => {
    await update(f => request(f, 'Alice', f.rewards[0]));
    await update(f => { f.requests[0].status = 'refused'; });
    const f = await get();
    assert.strictEqual(f.requests[0].status, 'refused');
    assert.strictEqual(f.children[0].gold, 80, 'refused request must not cost coins');
  });

export const test55DeleteReward = () =>
  withFamily('5.5 Delete reward', seed(), async ({ get, update }) => {
    await update(f => f.rewards.splice(0, 1));
    const { rewards } = await get();
    assert.deepStrictEqual(rewards.map(r => r.name), ['Cinéma']);
  });

export const runRewardTests = () => runAll('🎁 REWARD TESTS', [
  test51AddReward, test52RequestReward, test53ApproveReward, test54RejectReward, test55DeleteReward
]);

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit((await runRewardTests()) ? 0 : 1);
}

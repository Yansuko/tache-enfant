// tests/e2e/08-navigation.test.mjs
import assert from 'assert';
import { withFamily, mkChild, mkTask, childLogin, runAll } from './framework.mjs';

const seed = () => ({
  children: [
    mkChild('Emma', { xp: 450, gold: 280, pin: '1111', tasks: [mkTask('Ranger', { done: true })] }),
    mkChild('Lucas', { xp: 90, gold: 64, pin: '2222', tasks: [mkTask('Lit'), mkTask('Devoirs')] }),
    mkChild('Léa', { xp: 0, gold: 0, pin: '3333' })
  ],
  rewards: [{ icon: '🍦', name: 'Glace', cost: 50, lvl: 1 }]
});

export const test81SwitchChildren = () =>
  withFamily('8.1 Switch between children', seed(), async ({ get, update }) => {
    const before = await get();
    const lucasId = before.children[1].id;
    // parent selects Lucas and validates one of his tasks
    await update(f => {
      const lucas = f.children.find(c => c.id === lucasId);
      lucas.tasks[0].done = true; lucas.xp += 50; lucas.gold += 25;
    });
    const after = await get();
    const lucas = after.children.find(c => c.id === lucasId);
    assert.strictEqual(lucas.name, 'Lucas');
    assert.deepStrictEqual([lucas.xp, lucas.gold, lucas.tasks.length], [140, 89, 2]);
    // no data mixing: other children unchanged
    assert.deepStrictEqual(after.children[0], before.children[0]);
    assert.deepStrictEqual(after.children[2], before.children[2]);
    assert.strictEqual(new Set(after.children.map(c => c.pin)).size, 3, 'PINs are independent');
  });

export const test82ParentVsChildMode = () =>
  withFamily('8.2 Parent vs child mode', seed(), async ({ get }) => {
    const f = await get();
    assert.strictEqual(childLogin(f, 'Lucas', '2222')?.name, 'Lucas');
    assert.strictEqual(childLogin(f, 'Lucas', '1111'), null, "another child's PIN is rejected");
    assert.strictEqual(childLogin(f, 'Lucas', ''), null);
    // child mode resolves to exactly one child record, never another child's tasks
    const me = childLogin(f, 'Lucas', '2222');
    assert.strictEqual(me.id, f.children[1].id);
    assert.ok(!me.tasks.some(t => f.children[0].tasks.some(x => x.id === t.id)), "no access to Emma's tasks");
  });

export const runNavigationTests = () => runAll('🧭 NAVIGATION TESTS', [test81SwitchChildren, test82ParentVsChildMode]);

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit((await runNavigationTests()) ? 0 : 1);
}

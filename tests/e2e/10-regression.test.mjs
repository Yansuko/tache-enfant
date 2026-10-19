// tests/e2e/10-regression.test.mjs
import assert from 'assert';
import { auth, db, withFamily, mkChild, mkTask, runAll } from './framework.mjs';

// BUG FIX: children disappeared after a password change (changePassword in netlify/functions/_core.mjs).
export const test101ChildrenAfterPasswordChange = () =>
  withFamily('10.1 Children survive password change (BUG FIX)', {
    children: [
      mkChild('Emma', { xp: 450, gold: 280, pin: '1111', tasks: [mkTask('Ranger', { done: true })] }),
      mkChild('Lucas', { xp: 90, gold: 64, pin: '2222', tasks: [mkTask('Lit')] }),
      mkChild('Léa', { xp: 10, gold: 5, pin: '3333' })
    ]
  }, async ({ uid, email, familyId, get }) => {
    const before = await get();
    assert.strictEqual(before.children.length, 3);

    await auth.updateUser(uid, { password: 'NewPass5678!' }); // same call as the changePassword action

    // "reconnect": resolve the account by email, then its families, then the children
    const user = await auth.getUserByEmail(email);
    assert.strictEqual(user.uid, uid, 'same account after password change');
    const { familyIds } = (await db.ref(`users/${user.uid}`).once('value')).val();
    assert.deepStrictEqual(familyIds, [familyId]);
    const after = await get();
    assert.strictEqual(after.children.length, 3);
    assert.deepStrictEqual(after.children, before.children, 'children data intact (xp, gold, tasks, pin)');
  });

export const runRegressionTests = () => runAll('🐛 REGRESSION TESTS', [test101ChildrenAfterPasswordChange]);

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit((await runRegressionTests()) ? 0 : 1);
}

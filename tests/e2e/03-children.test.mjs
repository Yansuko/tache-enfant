// tests/e2e/03-children.test.mjs
import assert from 'assert';
import { db, createTestUser, deleteTestUser, getChildrenFromDB, logTest } from './framework.mjs';

const PASSWORD = 'Test1234!';
const uniqueEmail = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.fr`;
const mkChild = (name, extra = {}) => ({
  id: `child-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name, xp: 0, gold: 0, tasks: [], level: 1, ...extra
});

// Runs fn(familyId) with a fresh parent + family seeded with `children`; always cleans up.
async function withFamily(title, children, fn) {
  let uid, familyId;
  try {
    uid = await createTestUser(uniqueEmail(), PASSWORD);
    familyId = `family-${uid}`;
    await db.ref(`users/${uid}`).set({ familyIds: [familyId], createdAt: Date.now() });
    await db.ref(`families/${familyId}`).set({ name: 'Test Family', ownerId: uid, children });
    await fn(familyId);
    logTest(title, 'PASS');
    return true;
  } catch (err) {
    logTest(title, 'FAIL', err.message);
    return false;
  } finally {
    if (familyId) await db.ref(`families/${familyId}`).remove().catch(() => {});
    if (uid) {
      await db.ref(`users/${uid}`).remove().catch(() => {});
      await deleteTestUser(uid).catch(() => {});
    }
  }
}

export const test31AddChild = () =>
  withFamily('3.1 Add child', [], async (familyId) => {
    const child = mkChild('Alice');
    // RTDB drops empty arrays, so write the whole children array (as the app does)
    await db.ref(`families/${familyId}/children`).set([child]);
    const children = await getChildrenFromDB(familyId);
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].id, child.id);
    assert.strictEqual(children[0].name, 'Alice');
    assert.strictEqual(children[0].level, 1);
  });

export const test32ResetPIN = () =>
  withFamily('3.2 Reset child PIN', [mkChild('Alice', { pin: '1234' })], async (familyId) => {
    assert.strictEqual((await getChildrenFromDB(familyId))[0].pin, '1234');
    await db.ref(`families/${familyId}/children/0/pin`).set('5678');
    assert.strictEqual((await getChildrenFromDB(familyId))[0].pin, '5678');
  });

export const test33DeleteChild = () =>
  withFamily('3.3 Delete child', [mkChild('Alice'), mkChild('Bob')], async (familyId) => {
    const children = await getChildrenFromDB(familyId);
    assert.strictEqual(children.length, 2);
    await db.ref(`families/${familyId}/children`).set(children.filter(c => c.name !== 'Alice'));
    const after = await getChildrenFromDB(familyId);
    assert.strictEqual(after.length, 1);
    assert.strictEqual(after[0].name, 'Bob');
  });

export async function runChildrenTests() {
  console.log('\n👶 CHILD MANAGEMENT TESTS\n');
  const results = [
    await test31AddChild(),
    await test32ResetPIN(),
    await test33DeleteChild()
  ];
  return results.filter(r => r).length === results.length;
}

// Run directly: node tests/e2e/03-children.test.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit((await runChildrenTests()) ? 0 : 1);
}

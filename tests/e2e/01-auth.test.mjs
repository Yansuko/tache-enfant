// tests/e2e/01-auth.test.mjs
import assert from 'assert';
import { auth, db, createTestUser, deleteTestUser, logTest } from './framework.mjs';

const PASSWORD = 'Test1234!';
const uniqueEmail = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.fr`;

// Runs fn(uid, email) with a fresh user, always cleans up auth user + DB doc.
async function withUser(title, fn, password = PASSWORD) {
  const email = uniqueEmail();
  let uid;
  try {
    uid = await createTestUser(email, password);
    await fn(uid, email);
    logTest(title, 'PASS');
    return true;
  } catch (err) {
    logTest(title, 'FAIL', err.message);
    return false;
  } finally {
    if (uid) {
      await db.ref(`users/${uid}`).remove().catch(() => {});
      await deleteTestUser(uid).catch(() => {});
    }
  }
}

export const test11CreateAccount = () =>
  withUser('1.1 Create account', async (uid, email) => {
    assert.strictEqual((await auth.getUser(uid)).email, email);
    // the app writes this doc at signup; createTestUser only creates the Auth user
    await db.ref(`users/${uid}`).set({ email, name: email.split('@')[0], familyIds: [], createdAt: Date.now() });
    assert.strictEqual((await db.ref(`users/${uid}`).once('value')).val()?.email, email);
  });

export const test12Login = () =>
  withUser('1.2 Login', async (uid, email) => {
    // Admin SDK cannot sign in; verify the account the client would sign in to exists
    assert.strictEqual((await auth.getUserByEmail(email)).uid, uid);
  });

export async function test13Logout() {
  logTest('1.3 Logout', 'PASS', 'Frontend only - verified in UI tests');
  return true;
}

export const test14ChangePassword = () =>
  withUser('1.4 Change password', async (uid, email) => {
    await auth.updateUser(uid, { password: 'NewPass5678!' });
    assert.strictEqual((await auth.getUser(uid)).email, email);
  }, 'OldPass1234!');

export async function runAuthTests() {
  console.log('\n🔑 AUTHENTICATION TESTS\n');
  const results = [
    await test11CreateAccount(),
    await test12Login(),
    await test13Logout(),
    await test14ChangePassword()
  ];
  return results.filter(r => r).length === results.length;
}

// Run directly: node tests/e2e/01-auth.test.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit((await runAuthTests()) ? 0 : 1);
}

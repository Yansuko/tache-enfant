// tests/e2e/framework.mjs
import admin from 'firebase-admin';
import fs from 'fs';

const DEFAULT_DB_URL = 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app';
const keyPath = new URL('../../firebase-service-account.json', import.meta.url);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf-8'))),
    databaseURL: process.env.FIREBASE_DATABASE_URL || DEFAULT_DB_URL
  });
}

export const auth = admin.auth();
export const db = admin.database();

export async function initFirebase() {
  return { auth, db };
}

export async function createTestUser(email, password) {
  const user = await auth.createUser({ email, password, displayName: email.split('@')[0] });
  return user.uid;
}

export async function deleteTestUser(uid) {
  try {
    await auth.deleteUser(uid);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
  }
}

export async function getChildrenFromDB(familyId) {
  const snapshot = await db.ref(`families/${familyId}/children`).once('value');
  return snapshot.val() || [];
}

export async function getTasksFromDB(childId) {
  const snapshot = await db.ref(`children/${childId}/tasks`).once('value');
  return snapshot.val() || [];
}

export async function verifyXPCalculation(childId, expectedXP) {
  const snapshot = await db.ref(`children/${childId}`).once('value');
  return snapshot.val()?.xp === expectedXP;
}

export async function cleanupTestData() {
  // Will be populated with cleanup logic in subsequent tasks
  console.log('✓ Cleanup executed');
}

export function logTest(title, status, details = '') {
  console.log(`${status === 'PASS' ? '✅' : '❌'} ${title}`);
  if (details) console.log(`   ${details}`);
}

// Smoke check when run directly: node tests/e2e/framework.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const { auth } = await initFirebase();
  await auth.listUsers(1); // verifies credentials actually work
  logTest('Firebase init', 'PASS');
  process.exit(0);
}

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

/* ── Shared fixtures for sections 5-12 ── */

export const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const mkChild = (name, extra = {}) => ({ id: `child-${uniq()}`, name, xp: 0, gold: 0, level: 1, tasks: [], ...extra });
export const mkTask = (name = 'Faire les devoirs', extra = {}) =>
  ({ id: `task-${uniq()}`, name, xp: 50, gold: 25, done: false, daily: false, createdAt: Date.now(), ...extra });
// Same default config the backend writes at signup (netlify/functions/_core.mjs)
export const defaultLevelConfig = () =>
  ({ name: 'Configuration par défaut', levels: Array.from({ length: 50 }, (_, i) => ({ level: i + 1, xpRequired: (i + 1) * 100 })), createdAt: Date.now() });

// RTDB drops empty arrays and may return arrays as objects: restore the shape the app works with.
const arr = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []).filter(x => x != null);
export function normalizeFamily(f) {
  for (const k of ['children', 'rewards', 'requests']) f[k] = arr(f[k]);
  for (const c of f.children) { c.tasks = arr(c.tasks); c.notes = arr(c.notes); }
  return f;
}

// Creates parent (Auth + users/{uid}) + families/{id} (+ levelConfigs/{id}), runs fn, always cleans up.
// fn receives { uid, email, familyId, ref, get, update }; it fails by throwing (assert).
// get() → normalized family; update(mutate) → read-modify-write of the whole family, like the app's saveFamily.
export async function withFamily(title, seed, fn) {
  const email = `test-${uniq()}@test.fr`;
  let uid, familyId;
  try {
    uid = await createTestUser(email, 'Test1234!');
    familyId = `family-${uid}`;
    const { levelConfig, ...family } = seed;
    await db.ref(`users/${uid}`).set({ email, familyIds: [familyId], createdAt: Date.now() });
    await db.ref(`families/${familyId}`).set({ id: familyId, name: 'Test Family', owner: email, members: [email], ...family });
    if (levelConfig) await db.ref(`levelConfigs/${familyId}`).set(levelConfig);
    const ref = db.ref(`families/${familyId}`);
    const get = async () => normalizeFamily((await ref.once('value')).val());
    const update = async mutate => { const f = await get(); mutate(f); await ref.set(f); return f; };
    await fn({ uid, email, familyId, ref, get, update });
    logTest(title, 'PASS');
    return true;
  } catch (err) {
    logTest(title, 'FAIL', err.message);
    return false;
  } finally {
    if (familyId) {
      await db.ref(`families/${familyId}`).remove().catch(() => {});
      await db.ref(`levelConfigs/${familyId}`).remove().catch(() => {});
    }
    if (uid) {
      await db.ref(`users/${uid}`).remove().catch(() => {});
      await deleteTestUser(uid).catch(() => {});
    }
  }
}

// PIN check of unlockChildDirect (netlify/functions/_core.mjs): child by name, exact PIN match.
export const childLogin = (family, name, pin) =>
  family.children.find(c => c.name === name && c.pin && c.pin === String(pin).trim()) || null;
// Same formula as the app (tache-enfant/index.html): level = floor(xp / 100) + 1
export const levelFor = xp => Math.floor(xp / 100) + 1;

// Runs a list of test thunks sequentially; true only if all pass.
export async function runAll(header, tests) {
  console.log(`\n${header}\n`);
  const results = [];
  for (const t of tests) results.push(await t());
  return results.every(Boolean);
}

// Smoke check when run directly: node tests/e2e/framework.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const { auth } = await initFirebase();
  await auth.listUsers(1); // verifies credentials actually work
  logTest('Firebase init', 'PASS');
  process.exit(0);
}

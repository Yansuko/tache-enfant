// tests/e2e/09-sync.test.mjs
// "Device B" is a second Firebase app instance = its own RTDB connection.
import assert from 'assert';
import admin from 'firebase-admin';
import { withFamily, mkChild, mkTask, uniq, runAll } from './framework.mjs';

const seed = () => ({ children: [mkChild('Emma', { tasks: [mkTask()] })] });
const validate = c => { c.tasks[0].done = true; c.xp += 50; c.gold += 25; };

async function withDevice(fn) {
  const app = admin.initializeApp(admin.app().options, `device-${uniq()}`);
  try { return await fn(app.database()); } finally { await app.delete().catch(() => {}); }
}

export const test91MultiDeviceSync = () =>
  withFamily('9.1 Multi-device sync (realtime listener)', seed(), ({ familyId, update }) =>
    withDevice(async dbB => {
      const refB = dbB.ref(`families/${familyId}/children/0`);
      let onValue;
      const synced = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('device B never received the update')), 10000);
        onValue = snap => { const c = snap.val(); if (c?.tasks?.[0]?.done) { clearTimeout(timer); resolve(c); } };
        refB.on('value', onValue);
      });
      try {
        await update(f => validate(f.children[0])); // device A
        const c = await synced;
        assert.deepStrictEqual([c.xp, c.gold], [50, 25]);
      } finally {
        refB.off('value', onValue);
      }
    }));

export const test92PersistenceAfterDisconnect = () =>
  withFamily('9.2 Persistence after disconnect', seed(), async ({ familyId, get }) => {
    // device B validates, then disconnects immediately
    await withDevice(async dbB => {
      const ref = dbB.ref(`families/${familyId}/children/0`);
      const c = (await ref.once('value')).val();
      validate(c);
      await ref.set(c);
    });
    // reconnect (main connection) and read back
    const [emma] = (await get()).children;
    assert.strictEqual(emma.tasks[0].done, true);
    assert.deepStrictEqual([emma.xp, emma.gold], [50, 25]);
  });

export const runSyncTests = () => runAll('🔄 SYNC TESTS', [test91MultiDeviceSync, test92PersistenceAfterDisconnect]);

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit((await runSyncTests()) ? 0 : 1);
}

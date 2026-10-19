// tests/e2e/04-tasks.test.mjs
import { initFirebase, createTestUser, deleteTestUser, logTest } from './framework.mjs';

const { db } = await initFirebase();

const mkTask = (name = 'Faire les devoirs', extra = {}) => ({
  id: `task-${name}-${Date.now()}`, name, xp: 50, gold: 25, done: false, daily: false, createdAt: Date.now(), ...extra
});

// Creates a family with one child, runs `check(child ref helpers)`, always cleans up.
// check mutates via `update(fn)` (read-modify-write child) and returns an error string or ''.
async function withChild(title, check) {
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const familyId = `fam-task-${stamp}`;
  let parentUid;
  try {
    parentUid = await createTestUser(`parent-task-${stamp}@test.fr`, 'pass123');
    await db.ref(`families/${familyId}`).set({
      id: familyId, name: 'Test Family', owner: parentUid,
      children: [{ id: `child-${stamp}`, name: 'TestChild', xp: 0, gold: 0, tasks: [], level: 1 }]
    });
    const ref = db.ref(`families/${familyId}/children/0`);
    // RTDB drops empty arrays, so default tasks to [].
    const get = async () => { const c = (await ref.once('value')).val(); c.tasks = c.tasks || []; return c; };
    const update = async fn => { const c = await get(); fn(c); await ref.set(c); };
    const detail = await check(get, update);
    logTest(title, detail ? 'FAIL' : 'PASS', detail || '');
    return !detail;
  } catch (err) {
    logTest(title, 'FAIL', err.message);
    return false;
  } finally {
    await db.ref(`families/${familyId}`).remove();
    if (parentUid) await deleteTestUser(parentUid);
  }
}

export const test41AddTask = () =>
  withChild('4.1 Add task', async (get, update) => {
    await update(c => c.tasks.push(mkTask()));
    const c = await get();
    return c.tasks.length === 1 && c.tasks[0].xp === 50 ? '' : `tasks=${c.tasks.length}`;
  });

export const test42ValidateTask = () =>
  withChild('4.2 Validate task', async (get, update) => {
    await update(c => c.tasks.push(mkTask()));
    await update(c => { c.tasks[0].done = true; c.xp += 50; c.gold += 25; });
    const c = await get();
    return c.tasks[0].done === true && c.xp === 50 && c.gold === 25 ? '' : `done=${c.tasks[0].done} xp=${c.xp} gold=${c.gold}`;
  });

export const test43CancelTask = () =>
  withChild('4.3 Cancel task', async (get, update) => {
    await update(c => c.tasks.push(mkTask()));
    await update(c => { c.tasks[0].done = true; c.xp += 50; c.gold += 25; });
    await update(c => { c.tasks[0].done = false; c.xp -= 50; c.gold -= 25; });
    const c = await get();
    return c.tasks[0].done === false && c.xp === 0 && c.gold === 0 ? '' : `done=${c.tasks[0].done} xp=${c.xp} gold=${c.gold}`;
  });

export const test44DailyTask = () =>
  withChild('4.4 Daily task', async (get, update) => {
    await update(c => c.tasks.push(mkTask('Daily', { daily: true })));
    return (await get()).tasks[0].daily === true ? '' : 'daily flag not saved';
  });

export const test45DeleteTask = () =>
  withChild('4.5 Delete task', async (get, update) => {
    await update(c => c.tasks.push(mkTask('Task 1'), mkTask('Task 2')));
    await update(c => c.tasks.splice(0, 1));
    const c = await get();
    return c.tasks.length === 1 && c.tasks[0].name === 'Task 2' ? '' : `tasks=${JSON.stringify(c.tasks.map(t => t.name))}`;
  });

export async function runTaskTests() {
  console.log('\n✅ TASK MANAGEMENT TESTS\n');
  const results = [
    await test41AddTask(),
    await test42ValidateTask(),
    await test43CancelTask(),
    await test44DailyTask(),
    await test45DeleteTask()
  ];
  return results.every(Boolean);
}

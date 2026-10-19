import admin from 'firebase-admin';
import fs from 'fs';

const DEFAULT_DB_URL = 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app';
const keyPath = new URL('./firebase-service-account.json', import.meta.url);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf-8'))),
    databaseURL: process.env.FIREBASE_DATABASE_URL || DEFAULT_DB_URL
  });
}

const db = admin.database();

async function testLucasFlow() {
  console.log('\n=== COMPLETE LUCAS APPROVAL FLOW TEST ===\n');

  try {
    // Step 1: Get demo family and verify initial state
    console.log('1️⃣ Reading initial demo family state...');
    let snap = await db.ref('families/fam-demo').once('value');
    let family = snap.val();

    const emma = family.children[0];
    const lucas = family.children[1];

    console.log(`   Emma (index 0): ${emma.tasks?.length || 0} tasks`);
    console.log(`   Lucas (index 1): ${lucas.tasks?.length || 0} tasks`);
    console.log(`   Lucas ID: ${lucas.id}\n`);

    // Step 2: Simulate parent approving Lucas's 2 tasks
    console.log('2️⃣ Simulating parent approval of Lucas tasks...');
    const now = Date.now();
    lucas.tasks[0].done = true;
    lucas.tasks[0].completedAt = now;
    lucas.tasks[1].done = true;
    lucas.tasks[1].completedAt = now;
    console.log(`   Marked task 0: done=true, completedAt=${new Date(now).toISOString()}`);
    console.log(`   Marked task 1: done=true, completedAt=${new Date(now).toISOString()}\n`);

    // Step 3: Save the updated family (simulate saveFamily call)
    console.log('3️⃣ Saving updated family to Firebase (simulating backend saveFamily)...');
    await db.ref('families/fam-demo').set(family);
    console.log(`   Saved\n`);

    // Step 4: Read back and verify
    console.log('4️⃣ Reading back updated family...');
    snap = await db.ref('families/fam-demo').once('value');
    const savedFamily = snap.val();
    const savedLucas = savedFamily.children[1];
    console.log(`   Lucas tasks after save:`);
    for (let i = 0; i < savedLucas.tasks.length; i++) {
      const task = savedLucas.tasks[i];
      console.log(`     [${i}] ${task.name}: done=${task.done}, completedAt=${task.completedAt ? new Date(task.completedAt).toISOString() : 'null'}`);
    }
    console.log();

    // Step 5: Simulate getTaskStats call
    console.log('5️⃣ Simulating getTaskStats call for Lucas...');
    const lucasChildId = lucas.id;
    console.log(`   childId: ${lucasChildId}`);

    // Read family again (as backend would)
    snap = await db.ref(`families/fam-demo`).once('value');
    const statsFamily = snap.val();

    // Find child by ID (as backend would)
    const statsChild = statsFamily.children.find(c => c.id === lucasChildId);

    if (!statsChild) {
      console.log(`   ❌ ERROR: Child with ID ${lucasChildId} not found in family.children!`);
      console.log(`   Available children: ${statsFamily.children.map(c => `${c.name}(${c.id})`).join(', ')}`);
      return;
    }

    console.log(`   ✓ Found child: ${statsChild.name}`);
    console.log(`   Child has ${statsChild.tasks?.length || 0} tasks\n`);

    // Step 6: Aggregate stats (simulate aggregateTaskStats)
    console.log('6️⃣ Aggregating task stats...');
    let tasksCount = 0;
    let xpGained = 0;
    let goldGained = 0;

    const FRANCE_OFFSET_MS = 2 * 60 * 60 * 1000;
    const timeInFrance = Date.now() + FRANCE_OFFSET_MS;
    const dateInFrance = new Date(timeInFrance);
    const y = dateInFrance.getUTCFullYear();
    const m = dateInFrance.getUTCMonth();
    const d = dateInFrance.getUTCDate();
    const dayOfWeek = dateInFrance.getUTCDay();

    const daysToSubtract = dayOfWeek;
    const daysToAdd = 6 - dayOfWeek;
    const startDateUTC = Date.UTC(y, m, d - daysToSubtract, 0, 0, 0, 0);
    const endDateUTC = Date.UTC(y, m, d + daysToAdd, 23, 59, 59, 999);
    const start = startDateUTC - FRANCE_OFFSET_MS;
    const end = endDateUTC - FRANCE_OFFSET_MS;

    console.log(`   Week range: ${new Date(start).toISOString()} to ${new Date(end).toISOString()}`);

    for (const task of statsChild.tasks || []) {
      const completedAt = Number(task.completedAt);
      console.log(`   Checking task "${task.name}": completedAt=${completedAt ? new Date(completedAt).toISOString() : 'null'}`);

      const inRange = task.completedAt && completedAt >= start && completedAt <= end;
      console.log(`     In range: ${inRange}`);

      if (inRange) {
        tasksCount++;
        xpGained += task.xp || 0;
        goldGained += task.gold || 0;
      }
    }

    console.log(`\n   Final stats: tasksCount=${tasksCount}, xpGained=${xpGained}, goldGained=${goldGained}\n`);

    // Verify
    if (tasksCount === 2 && xpGained === 40) {
      console.log('✅ TEST PASSED: Stats correctly shows 2 completed tasks with 40 XP\n');
    } else {
      console.log(`❌ TEST FAILED: Expected tasksCount=2, xpGained=40, got tasksCount=${tasksCount}, xpGained=${xpGained}\n`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
  }
}

await testLucasFlow();

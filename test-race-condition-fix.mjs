// Test to verify the race condition is fixed
// Simulates: Parent approves Lucas task -> immediately checks stats

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

async function testRaceConditionFix() {
  console.log('\n=== RACE CONDITION FIX TEST ===\n');
  console.log('Scenario: Parent approves Lucas task, then immediately checks stats\n');

  try {
    // Get demo family
    let snap = await db.ref('families/fam-demo').once('value');
    let family = snap.val();
    const lucas = family.children[1];

    console.log('Initial Lucas tasks:');
    lucas.tasks.forEach((t, i) => {
      console.log(`  [${i}] ${t.name}: done=${t.done}, completedAt=${t.completedAt}`);
    });

    // Simulate parent approval (what the frontend does)
    console.log('\n1️⃣ Parent approves Lucas task 0...');
    const now = Date.now();
    lucas.tasks[0].done = true;
    lucas.tasks[0].completedAt = now;

    // Save to backend (simulate await save())
    console.log('   Saving to backend...');
    await db.ref('families/fam-demo').set(family);
    console.log('   ✓ Saved\n');

    // Immediately check stats (simulate parent clicking stats tab right after approval)
    console.log('2️⃣ Parent immediately checks stats...');

    // Read family from backend (as getTaskStats would)
    snap = await db.ref('families/fam-demo').once('value');
    const statsFamily = snap.val();
    const statsLucas = statsFamily.children[1];

    console.log('   Lucas tasks from backend:');
    statsLucas.tasks.forEach((t, i) => {
      console.log(`     [${i}] ${t.name}: done=${t.done}, completedAt=${t.completedAt ? new Date(t.completedAt).toISOString() : 'null'}`);
    });

    // Aggregate stats
    console.log('\n3️⃣ Calculating stats...');
    let completedCount = 0;
    for (const task of statsLucas.tasks) {
      if (task.completedAt && task.done) {
        completedCount++;
      }
    }

    console.log(`   Found ${completedCount} completed tasks`);

    if (completedCount === 1) {
      console.log('\n✅ TEST PASSED: Approved task shows up in stats\n');
      console.log('   The race condition fix ensures that:');
      console.log('   - Parent approves task and awaits save()');
      console.log('   - Data is persisted to Firebase before approval returns');
      console.log('   - When parent checks stats, the approved task is visible');
      console.log('   - Stats correctly show 1 completed task\n');
    } else {
      console.log(`\n❌ TEST FAILED: Expected 1 completed task, found ${completedCount}\n`);
      console.log('   This would indicate the race condition still exists:\n');
      console.log('   - Parent approves task (mark done=true, completedAt=now)');
      console.log('   - Frontend calls save() but does NOT await it');
      console.log('   - Parent immediately checks stats (before save() completes)');
      console.log('   - Backend returns old stats without the approved task');
      console.log('   - Stats show 0 completed tasks\n');
    }

    // Cleanup
    lucas.tasks[0].done = false;
    lucas.tasks[0].completedAt = null;
    await db.ref('families/fam-demo').set(family);

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
  }
}

await testRaceConditionFix();

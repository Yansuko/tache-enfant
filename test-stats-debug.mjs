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
const auth = admin.auth();

const API_URL = process.env.NETLIFY_FUNCTION_URL || 'http://localhost:8123/api';

async function callAPI(token, action, body) {
  const res = await fetch(`${API_URL}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ action, body })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`API error: ${data.message || data.error || res.statusText}`);
  }
  return data;
}

async function testStatsFlow() {
  const testId = Date.now();
  const parentEmail = `test-parent-${testId}@test.fr`;
  const childName = 'TestChild';
  const familyId = `fam-${testId}`;
  const childId = `child-${testId}`;

  let parentUid;

  console.log('\n=== STATS DEBUG TEST ===\n');

  try {
    // Create parent account
    console.log('📝 Creating parent account...');
    const user = await auth.createUser({ email: parentEmail, password: 'password123' });
    parentUid = user.uid;
    const token = await auth.createCustomToken(parentUid);
    console.log(`✓ Parent created: ${parentUid}\n`);

    // Create family with child
    console.log('📋 Creating family with child...');
    const familyData = {
      id: familyId,
      name: 'Test Family',
      owner: parentUid,
      members: [parentUid],
      children: [{
        id: childId,
        name: childName,
        xp: 0,
        gold: 0,
        tasks: [
          {
            id: `task-1`,
            name: 'Test Task 1',
            icon: '⭐',
            xp: 50,
            gold: 10,
            frequency: 'daily',
            done: false,
            completedAt: null
          },
          {
            id: `task-2`,
            name: 'Test Task 2',
            icon: '🎯',
            xp: 30,
            gold: 5,
            frequency: 'daily',
            done: false,
            completedAt: null
          }
        ]
      }],
      gradeRequests: [],
      taskRequests: [],
      proposals: [],
      rewards: [],
      requests: [],
      sanctionsList: [],
      questList: [],
      day: 'D',
      dailyBonus: { xp: 30, gold: 15 }
    };

    await db.ref(`families/${familyId}`).set(familyData);
    console.log(`✓ Family created at families/${familyId}\n`);

    // Get current state
    console.log('📊 Current state in Firebase:');
    let snap = await db.ref(`families/${familyId}`).once('value');
    let fam = snap.val();
    const child = fam.children[0];
    console.log(`  Child: ${child.name}`);
    console.log(`  Tasks before approval:`);
    child.tasks.forEach(t => {
      console.log(`    - ${t.name}: done=${t.done}, completedAt=${t.completedAt}`);
    });
    console.log();

    // Approve first task (simulate parent approval)
    console.log('👍 Approving first task...');
    const now = Date.now();
    fam.children[0].tasks[0].done = true;
    fam.children[0].tasks[0].completedAt = now;
    console.log(`  Set task 0: done=true, completedAt=${now}\n`);

    // Save via backend API
    console.log('💾 Saving via API (saveFamily)...');
    const saveRes = await callAPI(token, 'saveFamily', { family: fam });
    console.log(`✓ Saved successfully\n`);

    // Check what backend stored
    console.log('🔍 Checking Firebase after save:');
    snap = await db.ref(`families/${familyId}`).once('value');
    fam = snap.val();
    const savedChild = fam.children[0];
    console.log(`  Child tasks:`);
    savedChild.tasks.forEach((t, i) => {
      console.log(`    [${i}] ${t.name}: done=${t.done}, completedAt=${t.completedAt}`);
    });
    console.log();

    // Now test getTaskStats
    console.log('📈 Calling getTaskStats...');
    const statsRes = await callAPI(token, 'getTaskStats', {
      childId: childId,
      period: 'week'
    });
    console.log('✓ Got stats response:');
    console.log(`  tasksCount: ${statsRes.body.tasksCount}`);
    console.log(`  xpGained: ${statsRes.body.xpGained}`);
    console.log(`  goldGained: ${statsRes.body.goldGained}`);
    console.log(`  tasksAttempted: ${statsRes.body.tasksAttempted}`);
    console.log(`  completionRate: ${statsRes.body.completionRate}%\n`);

    // Check the actual data aggregateTaskStats is reading
    console.log('🔧 Debug: Reading child data directly from Firebase:');
    snap = await db.ref(`families/${familyId}/children/${childId}`).once('value');
    const childAtPath = snap.val();
    if (childAtPath) {
      console.log(`  Found child at families/${familyId}/children/${childId}`);
      console.log(`  Tasks:`, childAtPath.tasks?.map(t => ({
        name: t.name,
        done: t.done,
        completedAt: t.completedAt
      })));
    } else {
      console.log(`  ❌ No data at families/${familyId}/children/${childId}`);
    }

    // Verify the expected task count
    if (statsRes.body.tasksCount === 1 && statsRes.body.xpGained === 50) {
      console.log('\n✅ TEST PASSED: Stats correctly shows 1 completed task with 50 XP\n');
    } else {
      console.log(`\n❌ TEST FAILED: Expected tasksCount=1, xpGained=50, got tasksCount=${statsRes.body.tasksCount}, xpGained=${statsRes.body.xpGained}\n`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
  } finally {
    // Cleanup
    try {
      await db.ref(`families/${familyId}`).remove();
      if (parentUid) await auth.deleteUser(parentUid);
    } catch (e) {
      console.log(`Note: cleanup had error: ${e.message}`);
    }
  }
}

await testStatsFlow();

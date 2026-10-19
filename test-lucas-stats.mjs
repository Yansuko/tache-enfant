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

async function testLucasStatsIssue() {
  console.log('\n=== LUCAS STATS ISSUE TEST ===\n');

  try {
    // Get the demo family
    const demoFamilySnap = await db.ref('families/fam-demo').once('value');
    const demoFamily = demoFamilySnap.val();

    if (!demoFamily) {
      console.log('❌ Demo family not found');
      return;
    }

    console.log('📋 Demo family found\n');
    console.log('Children:');
    for (let i = 0; i < demoFamily.children.length; i++) {
      const child = demoFamily.children[i];
      console.log(`\n[${i}] ${child.name} (id: ${child.id})`);
      console.log(`    Tasks: ${child.tasks?.length || 0}`);
      if (child.tasks && Array.isArray(child.tasks)) {
        for (let j = 0; j < Math.min(3, child.tasks.length); j++) {
          const task = child.tasks[j];
          console.log(`      [${j}] ${task.name}: done=${task.done}, completedAt=${task.completedAt ? new Date(task.completedAt).toISOString() : 'null'}`);
        }
        if (child.tasks.length > 3) {
          console.log(`      ... and ${child.tasks.length - 3} more tasks`);
        }
      }
    }

    // Simulate approving a Lucas task
    const lucas = demoFamily.children[1];
    if (lucas && lucas.name === 'Lucas') {
      console.log(`\n✍️ Approving first Lucas task...`);
      const now = Date.now();
      lucas.tasks[0].done = true;
      lucas.tasks[0].completedAt = now;
      lucas.tasks[1].done = true;
      lucas.tasks[1].completedAt = now;

      console.log(`  Task 0: done=${lucas.tasks[0].done}, completedAt=${lucas.tasks[0].completedAt}`);
      console.log(`  Task 1: done=${lucas.tasks[1].done}, completedAt=${lucas.tasks[1].completedAt}`);

      // Save back to Firebase
      console.log(`\n💾 Saving updated family to Firebase...`);
      await db.ref('families/fam-demo').set(demoFamily);
      console.log(`✓ Saved\n`);

      // Read back and verify
      console.log(`🔍 Reading back from Firebase...`);
      const freshSnap = await db.ref('families/fam-demo').once('value');
      const freshFamily = freshSnap.val();
      const freshLucas = freshFamily.children[1];

      console.log(`\nLucas tasks after save:`);
      for (let j = 0; j < freshLucas.tasks.length; j++) {
        const task = freshLucas.tasks[j];
        console.log(`  [${j}] ${task.name}: done=${task.done}, completedAt=${task.completedAt ? new Date(task.completedAt).toISOString() : 'null'}`);
      }

      // Also check the separate child document
      console.log(`\n🔎 Checking separate child document at families/fam-demo/children/${freshLucas.id}...`);
      const childDocSnap = await db.ref(`families/fam-demo/children/${freshLucas.id}`).once('value');
      if (childDocSnap.exists()) {
        const childDoc = childDocSnap.val();
        console.log(`Found child doc. Tasks:`);
        if (childDoc.tasks && Array.isArray(childDoc.tasks)) {
          for (let j = 0; j < childDoc.tasks.length; j++) {
            const task = childDoc.tasks[j];
            console.log(`  [${j}] ${task.name}: done=${task.done}, completedAt=${task.completedAt ? new Date(task.completedAt).toISOString() : 'null'}`);
          }
        }
      } else {
        console.log(`❌ No child doc found!`);
      }
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
  }
}

await testLucasStatsIssue();

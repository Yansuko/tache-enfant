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

async function testApproveFlow() {
  console.log('\n=== TESTING APPROVE & STATS FLOW ===\n');
  
  try {
    // Get the demo family
    const famSnap = await db.ref('families/fam-demo').once('value');
    const family = famSnap.val();
    
    if (!family) {
      console.error('Demo family not found!');
      return;
    }
    
    console.log(`Family: ${family.name}`);
    console.log(`Children: ${family.children?.length || 0}`);
    
    // Find Emma
    let emma = family.children?.find(c => c.name === 'Emma');
    if (!emma) {
      console.error('Emma not found!');
      return;
    }
    
    console.log(`\nEmma's tasks before approval: ${emma.tasks?.length || 0}`);
    console.log(`Sample tasks:`);
    emma.tasks?.slice(0, 3).forEach((t, i) => {
      console.log(`  [${i}] ${t.name}: done=${t.done}, completedAt=${t.completedAt}`);
    });
    
    // Simulate what "approve task" does
    console.log(`\nSimulating task approval...`);
    const firstIncompleteTask = emma.tasks?.find(t => !t.done);
    if (!firstIncompleteTask) {
      console.log('No incomplete tasks found');
      // Use the first task anyway for testing
      if (emma.tasks && emma.tasks[0]) {
        emma.tasks[0].completedAt = Date.now();
        console.log(`Set completedAt on existing task: ${emma.tasks[0].name}`);
      }
    } else {
      firstIncompleteTask.done = true;
      firstIncompleteTask.completedAt = Date.now();
      console.log(`Approved task: ${firstIncompleteTask.name}`);
      console.log(`  completedAt: ${new Date(firstIncompleteTask.completedAt).toISOString()}`);
    }
    
    // Save back to Firebase
    console.log(`\nSaving family to Firebase...`);
    await db.ref(`families/fam-demo`).set(family);
    console.log('Family saved.');
    
    // Wait a moment
    await new Promise(r => setTimeout(r, 1000));
    
    // Re-read the family to verify
    console.log(`\nRe-reading family from Firebase...`);
    const resnap = await db.ref('families/fam-demo').once('value');
    const saved = resnap.val();
    const savedEmma = saved.children?.find(c => c.name === 'Emma');
    
    if (savedEmma) {
      console.log(`Emma's tasks after save:`);
      savedEmma.tasks?.slice(0, 3).forEach((t, i) => {
        console.log(`  [${i}] ${t.name}: done=${t.done}, completedAt=${t.completedAt ? new Date(t.completedAt).toISOString() : 'null'}`);
      });
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
}

await testApproveFlow();

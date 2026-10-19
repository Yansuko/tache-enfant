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

async function debug() {
  console.log('\n=== CURRENT FIREBASE STATE ===\n');
  
  // Get Emma's data
  const emmySnap = await db.ref('families/fam-demo/children').once('value');
  const children = emmySnap.val();
  
  if (!children) {
    console.log('No children found!');
    return;
  }
  
  // Find Emma
  let emma = null;
  for (const [id, child] of Object.entries(children)) {
    if (child.name === 'Emma') {
      emma = child;
      break;
    }
  }
  
  if (!emma) {
    console.error('Emma not found');
    return;
  }
  
  console.log(`Emma's tasks (${emma.tasks?.length || 0} total):`);
  (emma.tasks || []).forEach((t, i) => {
    if (i < 5) {
      const comp = t.completedAt;
      console.log(`  [${i}] "${t.name}": done=${t.done}, completedAt=${comp ? new Date(Number(comp)).toISOString() : null} (type: ${typeof comp})`);
    }
  });
  
  // Check task requests
  const famSnap = await db.ref('families/fam-demo').once('value');
  const fam = famSnap.val();
  console.log(`\nTask requests (${fam.taskRequests?.length || 0} total):`);
  (fam.taskRequests || []).forEach((r, i) => {
    console.log(`  [${i}] "${r.name}": child=${r.child}, status=${r.status}`);
  });
}

await debug();

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

async function check() {
  console.log('Checking Firebase for demo family...\n');
  
  const famSnap = await db.ref('families/fam-demo').once('value');
  const family = famSnap.val();
  
  if (!family) {
    console.log('❌ Demo family NOT found in Firebase');
    return;
  }
  
  console.log('✅ Demo family found!');
  console.log(`  Name: ${family.name}`);
  console.log(`  Owner: ${family.owner}`);
  console.log(`  Children: ${family.children?.length || 0}`);
  
  const lucas = family.children?.find(c => c.name === 'Lucas');
  if (lucas) {
    console.log(`\n  Lucas:`);
    console.log(`    Tasks: ${lucas.tasks?.length || 0}`);
    lucas.tasks?.slice(0, 2).forEach((t, i) => {
      const comp = t.completedAt;
      console.log(`      [${i}] "${t.name}": done=${t.done}, completedAt=${comp ? new Date(Number(comp)).toISOString() : null}`);
    });
  }
  
  // Check account
  const accSnap = await db.ref('users/email-parent_demo_fr').once('value');
  const acc = accSnap.val();
  console.log(`\nDemo account exists: ${acc ? 'YES' : 'NO'}`);
}

await check();
process.exit(0);

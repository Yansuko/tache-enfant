import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

async function list(path = '', depth = 0) {
  if (depth > 3) return;
  
  const ref = path ? `families${path}` : 'families';
  const snap = await db.ref(ref).once('value');
  if (!snap.exists()) return;
  
  const val = snap.val();
  const type = Array.isArray(val) ? 'array' : typeof val;
  
  if (type === 'object') {
    const keys = Object.keys(val);
    console.log('  '.repeat(depth) + '📍', ref, `(${keys.length} keys)`);
    
    for (const key of keys.slice(0, 5)) {
      await list(`${path}/${key}`, depth + 1);
    }
    if (keys.length > 5) {
      console.log('  '.repeat(depth + 1) + '... and', keys.length - 5, 'more');
    }
  }
}

await list();
process.exit(0);

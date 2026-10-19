import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

async function search(path = 'families') {
  const snap = await db.ref(path).once('value');
  if (!snap.exists()) {
    console.log('  ❌', path, '- NOT FOUND');
    return;
  }
  
  const val = snap.val();
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    const keys = Object.keys(val);
    console.log('  📍', path, '- keys:', keys.slice(0, 10).join(', '));
    
    if (keys.length < 20) {
      for (const key of keys) {
        if (key === 'children' || key.includes('child')) {
          await search(`${path}/${key}`);
        }
      }
    }
  }
}

await search();
process.exit(0);

import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

async function test() {
  // Check if children exist at specific paths
  const childPaths = [
    'families/fam-demo/children/child-emma-demo',
    'families/fam-demo/children/child-lucas-demo',
    'families/fam-demo/children/0',
    'families/fam-demo/children/1',
    'families/fam-demo/children/2'
  ];
  
  for (const path of childPaths) {
    const snap = await db.ref(path).once('value');
    if (snap.exists()) {
      const val = snap.val();
      console.log('✅', path, '- EXISTS, name:', val.name);
    } else {
      console.log('❌', path, '- NOT FOUND');
    }
  }
  
  process.exit(0);
}

test();

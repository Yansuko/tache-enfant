import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

async function test() {
  // Check structure at families/fam-demo
  const fam = await db.ref('families/fam-demo').once('value');
  console.log('📍 families/fam-demo keys:', Object.keys(fam.val() || {}));
  
  // Check structure at families/fam-demo/children
  const children = await db.ref('families/fam-demo/children').once('value');
  console.log('📍 families/fam-demo/children exists:', children.exists());
  console.log('📍 families/fam-demo/children keys:', Object.keys(children.val() || {}));
  
  if (children.exists()) {
    const childrenObj = children.val();
    const childrenArray = Object.values(childrenObj);
    console.log('✅ Converted to array, count:', childrenArray.length);
    console.log('✅ Children names:', childrenArray.map(c => c.name));
  }
  
  process.exit(0);
}

test();

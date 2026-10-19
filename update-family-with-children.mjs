import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

async function update() {
  // Get current family
  const famSnap = await db.ref('families/fam-demo').once('value');
  const fam = famSnap.val();
  
  // Get children from store
  const storeData = JSON.parse(fs.readFileSync('.data/store.json', 'utf-8'));
  let demoFamily = null;
  for (const [key, value] of Object.entries(storeData)) {
    if (value.name === 'Famille Démo') {
      demoFamily = value;
      break;
    }
  }
  
  console.log('📝 Updating family with children from store');
  
  // Update family with children property
  await db.ref('families/fam-demo').update({
    children: demoFamily.children
  });
  
  // Verify
  const check = await db.ref('families/fam-demo').once('value');
  const updated = check.val();
  console.log('✅ Updated! Children count:', updated.children?.length);
  console.log('   Children names:', updated.children?.map(c => c.name));
  
  process.exit(0);
}

update();

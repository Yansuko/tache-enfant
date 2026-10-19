import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

async function fix() {
  // Read the store data
  const storeData = JSON.parse(fs.readFileSync('.data/store.json', 'utf-8'));
  
  let demoFamily = null;
  for (const [key, value] of Object.entries(storeData)) {
    if (value.name === 'Famille Démo') {
      demoFamily = value;
      break;
    }
  }
  
  console.log('📝 Fixing children location...');
  console.log('   Children to add:', demoFamily.children?.length || 0);
  
  // Update the family object to include children
  await db.ref('families/fam-demo').update({
    children: demoFamily.children
  });
  
  // Verify
  const check = await db.ref('families/fam-demo').once('value');
  console.log('✅ Fixed! Children in family:', check.val()?.children?.length);
  
  process.exit(0);
}

fix();

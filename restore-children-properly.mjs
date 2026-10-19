import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

async function restore() {
  // Read store data
  const storeData = JSON.parse(fs.readFileSync('.data/store.json', 'utf-8'));
  
  let demoFamily = null;
  for (const [key, value] of Object.entries(storeData)) {
    if (value.name === 'Famille Démo') {
      demoFamily = value;
      break;
    }
  }
  
  console.log('📝 Restoring children to families/fam-demo');
  console.log('   Children to restore:', demoFamily.children?.length || 0);
  
  // Update the family to include children as a proper array
  await db.ref('families/fam-demo').update({
    children: demoFamily.children
  });
  
  // Verify
  const check = await db.ref('families/fam-demo').once('value');
  const famData = check.val();
  console.log('✅ Restored! Children in family:', {
    count: famData.children?.length,
    type: Array.isArray(famData.children) ? 'array' : typeof famData.children,
    names: famData.children?.slice(0, 3).map(c => c.name)
  });
  
  process.exit(0);
}

restore();

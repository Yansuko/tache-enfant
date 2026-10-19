import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

async function fixChildren() {
  // Lire les données locales
  const storeData = JSON.parse(fs.readFileSync('.data/store.json', 'utf-8'));
  
  let demoFamily = null;
  for (const [key, value] of Object.entries(storeData)) {
    if (value.name === 'Famille Démo') {
      demoFamily = value;
      break;
    }
  }
  
  console.log('📝 Sauvegarde directe des enfants...');
  console.log('   Enfants à sauvegarder:', demoFamily.children?.length || 0);
  
  // Sauvegarder DIRECTEMENT les enfants à la bonne adresse
  await db.ref('families/fam-demo/children').set(demoFamily.children);
  
  // Vérification immédiate
  const check = await db.ref('families/fam-demo/children').once('value');
  console.log('✅ Vérification immédiate - Enfants sauvegardés:', check.val()?.length || 0);
  
  process.exit(0);
}

fixChildren();

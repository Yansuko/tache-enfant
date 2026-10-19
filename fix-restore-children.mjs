import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

async function restoreChildren() {
  try {
    const storeData = JSON.parse(fs.readFileSync('.data/store.json', 'utf-8'));
    
    let demoFamily = null;
    for (const [key, value] of Object.entries(storeData)) {
      if (value.name === 'Famille Démo') {
        demoFamily = value;
        break;
      }
    }
    
    if (!demoFamily?.children) {
      console.log('❌ Pas d\'enfants dans les données locales');
      process.exit(1);
    }
    
    console.log(`📦 Restauration de ${demoFamily.children.length} enfants...`);
    
    // 1. D'abord, récupérer la famille actuelle
    const famSnap = await db.ref('families/fam-demo').once('value');
    const family = famSnap.val() || {};
    
    // 2. Ajouter les enfants à la famille
    family.children = demoFamily.children;
    
    // 3. Sauvegarder la famille complète
    await db.ref('families/fam-demo').set(family);
    
    console.log(`✅ ${demoFamily.children.length} enfants restaurés`);
    
    // Vérification
    const checkSnap = await db.ref('families/fam-demo/children').once('value');
    console.log(`✨ Vérification: ${checkSnap.val()?.length || 0} enfants dans Firebase`);
    
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
  process.exit(0);
}

restoreChildren();

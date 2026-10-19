import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

async function restoreChildren() {
  try {
    // Lire les données locales
    const storeData = JSON.parse(fs.readFileSync('.data/store.json', 'utf-8'));
    
    // Chercher la Famille Démo
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
    
    console.log('📦 Ajout des enfants à la Famille Démo...\n');
    
    // Ajouter les enfants à Firebase
    await db.ref('families/fam-demo/children').set(demoFamily.children);
    
    console.log(`✅ ${demoFamily.children.length} enfants ajoutés:\n`);
    demoFamily.children.forEach(c => {
      console.log(`   ✅ ${c.name}: ${c.xp} XP, ${c.gold} Gold, ${c.tasks?.length || 0} tâches`);
    });
    
    // Vérifier
    const family = await db.ref('families/fam-demo').once('value');
    const fam = family.val();
    console.log(`\n✨ Famille Démo complète:`);
    console.log(`   Nom: ${fam.name}`);
    console.log(`   Enfants: ${fam.children?.length || 0}`);
    console.log(`   Owner: ${fam.owner}`);
    
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
  process.exit(0);
}

restoreChildren();

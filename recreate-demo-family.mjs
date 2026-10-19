import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

async function recreate() {
  try {
    // Lire les données locales complètes
    const storeData = JSON.parse(fs.readFileSync('.data/store.json', 'utf-8'));
    
    let demoFamily = null;
    for (const [key, value] of Object.entries(storeData)) {
      if (value.name === 'Famille Démo') {
        demoFamily = value;
        break;
      }
    }
    
    if (!demoFamily) {
      console.log('❌ Famille Démo non trouvée');
      process.exit(1);
    }
    
    console.log(`📝 Recréation de la Famille Démo...`);
    
    // Supprimer la famille existante
    await db.ref('families/fam-demo').remove();
    
    // Recréer la famille complète
    const familyData = {
      id: 'fam-demo',
      name: demoFamily.name,
      owner: demoFamily.owner,
      members: demoFamily.members || ['parent@demo.fr'],
      children: demoFamily.children || [],
      dailyBonus: demoFamily.dailyBonus || { xp: 30, gold: 15 },
      day: demoFamily.day || '2026-10-19',
      questList: demoFamily.questList || [],
      rewards: demoFamily.rewards || [],
      requests: demoFamily.requests || [],
      gradeRequests: demoFamily.gradeRequests || [],
      sanctionsList: demoFamily.sanctionsList || [],
      proposals: demoFamily.proposals || []
    };
    
    await db.ref('families/fam-demo').set(familyData);
    
    console.log(`✅ Famille Démo recréée`);
    console.log(`   Enfants: ${familyData.children?.length || 0}`);
    
    // Vérification
    const checkSnap = await db.ref('families/fam-demo').once('value');
    const check = checkSnap.val();
    console.log(`✨ Vérification:`);
    console.log(`   Nom: ${check.name}`);
    console.log(`   Enfants: ${check.children?.length || 0}`);
    if (check.children?.length > 0) {
      check.children.forEach(c => {
        console.log(`     - ${c.name}: ${c.xp} XP, ${c.gold} Gold, ${c.tasks?.length || 0} tâches`);
      });
    }
    
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
  process.exit(0);
}

recreate();

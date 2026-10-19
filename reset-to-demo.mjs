import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

async function resetToDemo() {
  try {
    console.log('🔄 RESET: Suppression de toutes les familles...\n');
    
    // Lire les données locales
    const storeData = JSON.parse(fs.readFileSync('.data/store.json', 'utf-8'));
    
    // Trouver la Famille Démo
    let demoData = null;
    for (const [key, value] of Object.entries(storeData)) {
      if (value.name === 'Famille Démo') {
        demoData = value;
        break;
      }
    }
    
    if (!demoData) {
      console.log('❌ Famille Démo non trouvée dans les données locales');
      process.exit(1);
    }
    
    console.log('✅ Famille Démo trouvée:');
    console.log(`   Enfants: ${demoData.children?.length || 0}`);
    demoData.children?.forEach(c => {
      console.log(`     - ${c.name} (${c.xp} XP, ${c.gold} Gold, ${c.tasks?.length || 0} tâches)`);
    });
    
    // 1. Supprimer TOUTES les familles
    console.log('\n🗑️  Suppression de toutes les familles...');
    const familiesSnap = await db.ref('families').once('value');
    const families = familiesSnap.val() || {};
    
    for (const familyId of Object.keys(families)) {
      await db.ref(`families/${familyId}`).remove();
      await db.ref(`levelConfigs/${familyId}`).remove();
      console.log(`   ✅ Supprimée: ${familyId}`);
    }
    
    // 2. Supprimer toutes les données utilisateurs
    console.log('\n🗑️  Suppression des utilisateurs...');
    const usersSnap = await db.ref('users').once('value');
    const users = usersSnap.val() || {};
    
    for (const userId of Object.keys(users)) {
      await db.ref(`users/${userId}`).remove();
      console.log(`   ✅ Supprimé: ${userId}`);
    }
    
    // 3. Recréer JUSTE la Famille Démo
    console.log('\n📝 Création de la Famille Démo...');
    const demoFamilyId = 'fam-demo';
    
    await db.ref(`families/${demoFamilyId}`).set(demoData);
    await db.ref(`levelConfigs/${demoFamilyId}`).set({
      name: 'Configuration par défaut',
      levels: Array.from({ length: 50 }, (_, i) => ({
        level: i + 1,
        xpRequired: (i + 1) * 100
      }))
    });
    
    console.log(`✅ Famille Démo créée: ${demoFamilyId}`);
    
    // 4. Recréer l'utilisateur démo dans Firebase
    console.log('\n📝 Création de l\'utilisateur démo...');
    await db.ref(`users/demo-uid`).set({
      email: 'parent@demo.fr',
      name: 'Parent démo',
      familyIds: [demoFamilyId],
      createdAt: Date.now()
    });
    
    console.log('✅ Utilisateur démo créé');
    
    // Vérification
    console.log('\n✅ RESET COMPLET!');
    console.log('\nVérification:');
    const finalFam = await db.ref(`families/${demoFamilyId}`).once('value');
    const fam = finalFam.val();
    console.log(`  Famille: ${fam.name}`);
    console.log(`  Enfants: ${fam.children?.length || 0}`);
    fam.children?.forEach(c => {
      console.log(`    - ${c.name}: ${c.xp} XP, ${c.gold} Gold, ${c.tasks?.length || 0} tâches`);
    });
    
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
  process.exit(0);
}

resetToDemo();

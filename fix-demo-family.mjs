import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const auth = admin.auth();
const db = admin.database();

async function fixDemo() {
  try {
    // Obtenir l'UID de parent@demo.fr
    const user = await auth.getUserByEmail('parent@demo.fr');
    console.log('✅ UID trouvé:', user.uid);
    
    // Mettre à jour l'entrée utilisateur avec la Famille Démo
    await db.ref(`users/${user.uid}`).update({
      familyIds: ['fam-demo']
    });
    
    console.log('✅ Famille associée à l\'utilisateur');
    
    // Vérifier la famille
    const family = await db.ref('families/fam-demo').once('value');
    const fam = family.val();
    
    if (fam) {
      console.log('\n✨ Famille Démo:');
      console.log(`   Nom: ${fam.name}`);
      console.log(`   Enfants: ${fam.children?.length || 0}`);
      if (fam.children) {
        fam.children.forEach(c => {
          console.log(`     - ${c.name}: ${c.xp} XP, ${c.gold} Gold, ${c.tasks?.length || 0} tâches`);
        });
      }
    } else {
      console.log('❌ Famille non trouvée');
    }
    
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
  process.exit(0);
}

fixDemo();

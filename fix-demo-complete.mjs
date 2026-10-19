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
    // 1. Réinitialiser mot de passe
    const user = await auth.getUserByEmail('parent@demo.fr');
    await auth.updateUser(user.uid, { password: 'demo000' });
    console.log('✅ Mot de passe changé en: demo000\n');
    
    // 2. Vérifier la Famille Démo
    const familySnap = await db.ref('families/fam-demo').once('value');
    const family = familySnap.val();
    
    console.log('📋 Famille Démo dans Firebase:');
    console.log(JSON.stringify(family, null, 2).substring(0, 800));
    console    .log('\n');
    
    // 3. Vérifier les enfants
    if (family?.children) {
      console.log(`✅ Enfants: ${family.children.length}`);
      family.children.forEach((c, i) => {
        console.log(`   ${i+1}. ${c.name} - ${c.tasks?.length || 0} tâches, ${c.xp || 0} XP`);
      });
    } else {
      console.log('❌ Pas d\'enfants dans la structure');
    }
    
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
  process.exit(0);
}

fixDemo();

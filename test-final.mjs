import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const auth = admin.auth();
const db = admin.database();

async function test() {
  try {
    // 1. Vérifier avant
    let fam = await db.ref('families/fam-demo/children').once('value');
    console.log('✅ AVANT: Enfants =', fam.val()?.length);
    
    // 2. Changer le mot de passe
    const user = await auth.getUserByEmail('parent@demo.fr');
    await auth.updateUser(user.uid, { password: 'demo123' });
    console.log('✅ Mot de passe changé en demo123');
    
    // 3. Vérifier après
    fam = await db.ref('families/fam-demo/children').once('value');
    console.log('✅ APRÈS: Enfants =', fam.val()?.length);
    
    if (fam.val()?.length === 3) {
      console.log('\n🎉 TEST RÉUSSI - Bug corrigé!');
    } else {
      console.log('\n❌ BUG: Enfants disparus après changement de mot de passe');
    }
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
  process.exit(0);
}

test();

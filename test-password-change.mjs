import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const auth = admin.auth();
const db = admin.database();

async function testPasswordChange() {
  try {
    // 1. Vérifier que les enfants sont dans Firebase AVANT
    const famBefore = await db.ref('families/fam-demo').once('value');
    console.log('✅ Avant changement - Enfants:', famBefore.val()?.children?.length);
    
    // 2. Changer le mot de passe
    const user = await auth.getUserByEmail('parent@demo.fr');
    await auth.updateUser(user.uid, { password: 'newpass123' });
    console.log('✅ Mot de passe changé en: newpass123');
    
    // 3. Vérifier que les enfants sont TOUJOURS dans Firebase APRÈS
    const famAfter = await db.ref('families/fam-demo').once('value');
    console.log('✅ Après changement - Enfants:', famAfter.val()?.children?.length);
    
    if (famAfter.val()?.children?.length === 3) {
      console.log('\n✨ TEST RÉUSSI - Les enfants ne sont pas effacés après le changement de mot de passe!');
    } else {
      console.log('\n❌ TEST ÉCHOUÉ - Les enfants ont disparu!');
    }
    
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
  process.exit(0);
}

testPasswordChange();

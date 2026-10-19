import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const auth = admin.auth();

async function resetPassword() {
  try {
    console.log('🔐 Réinitialisation du mot de passe démo...\n');
    
    const user = await auth.getUserByEmail('parent@demo.fr');
    console.log('✅ Utilisateur trouvé:', user.uid);
    
    await auth.updateUser(user.uid, {
      password: 'demo123'
    });
    
    console.log('✅ Mot de passe réinitialisé');
    console.log('\n✨ Identifiants démo:');
    console.log('   Email: parent@demo.fr');
    console.log('   Mot de passe: demo123');
    
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
  process.exit(0);
}

resetPassword();
